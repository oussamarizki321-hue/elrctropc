// ElectroPC API regression suite. Runs against a real server process with a
// temporary data directory, so order/stock/admin behaviour is exercised end to end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 3199 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_PASSWORD = 'test-admin-secret';
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'electropc-test-'));

let child;
let adminToken = '';
let createdProductId = '';

const api = async (pathname, options = {}) => {
  const res = await fetch(BASE + pathname, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
};

const json = (payload, extra = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(extra.headers || {}) },
  body: JSON.stringify(payload),
  ...extra,
});

const admin = (options = {}) => ({
  ...options,
  headers: { Authorization: `Bearer ${adminToken}`, ...(options.headers || {}) },
});

before(async () => {
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR, ADMIN_PASSWORD },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  const deadline = Date.now() + 20000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('server did not start in time');
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  const login = await api('/api/admin/login', json({ password: ADMIN_PASSWORD }));
  assert.equal(login.status, 200, 'admin login during setup');
  adminToken = login.body.token;
});

after(() => {
  if (child) child.kill('SIGTERM');
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

// ---- health / config -------------------------------------------------------

test('health endpoint responds', async () => {
  const { status, body } = await api('/api/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test('config exposes shipping rules and categories', async () => {
  const { status, body } = await api('/api/config');
  assert.equal(status, 200);
  assert.equal(typeof body.shippingFee, 'number');
  assert.equal(typeof body.freeShippingFrom, 'number');
  assert.ok(Array.isArray(body.categories) && body.categories.length >= 10);
  assert.equal(body.currency, 'MAD');
});

test('security headers are set', async () => {
  const { headers } = await api('/api/health');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.ok(headers.get('content-security-policy')?.includes("default-src 'self'"));
});

// ---- catalog ---------------------------------------------------------------

test('product list returns a page of products with counts', async () => {
  const { status, body } = await api('/api/products');
  assert.equal(status, 200);
  assert.ok(body.total >= 20, `expected a seeded catalog, got ${body.total}`);
  assert.ok(Array.isArray(body.items));
  assert.ok(body.items.length <= body.pageSize);
  assert.ok(Array.isArray(body.categoryCounts) && body.categoryCounts.length >= 10);
  const first = body.items[0];
  assert.ok(first.name.ar && first.name.fr, 'product names are bilingual');
  assert.ok(first.price > 0);
});

test('search matches both Arabic and French names', async () => {
  const fr = await api('/api/products?q=clavier');
  assert.equal(fr.status, 200);
  assert.ok(fr.body.total >= 1, 'french search should match');
  assert.ok(
    fr.body.items.every((p) => `${p.name.fr} ${p.name.ar} ${p.brand} ${p.sku}`.toLowerCase().includes('clavier'))
  );

  const ar = await api(`/api/products?q=${encodeURIComponent('لوحة')}`);
  assert.equal(ar.status, 200);
  assert.ok(ar.body.total >= 1, 'arabic search should match');

  const none = await api('/api/products?q=zzzznotarealproduct');
  assert.equal(none.body.total, 0);
  assert.deepEqual(none.body.items, []);
});

test('category filter narrows results', async () => {
  const { status, body } = await api('/api/products?category=gpu');
  assert.equal(status, 200);
  assert.ok(body.total >= 1);
  assert.ok(body.items.every((p) => p.category === 'gpu'));
});

test('price range filter respects bounds', async () => {
  const { body } = await api('/api/products?min=20000&max=60000&pageSize=100');
  assert.ok(body.items.every((p) => p.price >= 20000 && p.price <= 60000));
});

test('sorting by price ascending is ordered', async () => {
  const { body } = await api('/api/products?sort=price-asc&pageSize=100');
  const prices = body.items.map((p) => p.price);
  const sorted = [...prices].sort((a, b) => a - b);
  assert.deepEqual(prices, sorted);
});

test('inStock filter excludes sold out products', async () => {
  const { body } = await api('/api/products?inStock=true&pageSize=100');
  assert.ok(body.items.every((p) => p.stock > 0));
});

test('pagination is consistent', async () => {
  const first = await api('/api/products?pageSize=4&page=1');
  const second = await api('/api/products?pageSize=4&page=2');
  assert.equal(first.body.items.length, 4);
  assert.equal(first.body.page, 1);
  assert.notEqual(first.body.items[0].id, second.body.items[0].id);
});

test('product detail returns related products, unknown id gives 404', async () => {
  const list = await api('/api/products?category=gpu');
  const id = list.body.items[0].id;
  const { status, body } = await api(`/api/products/${id}`);
  assert.equal(status, 200);
  assert.equal(body.product.id, id);
  assert.ok(Array.isArray(body.related));

  const missing = await api('/api/products/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'not_found');
});

test('unknown API route returns JSON 404', async () => {
  const { status, body } = await api('/api/nope');
  assert.equal(status, 404);
  assert.equal(body.error, 'not_found');
});

// ---- orders ----------------------------------------------------------------

test('order validation rejects an empty payload', async () => {
  const { status, body } = await api('/api/orders', json({}));
  assert.equal(status, 400);
  assert.equal(body.error, 'validation_failed');
  assert.equal(body.fields.name, 'invalid');
  assert.equal(body.fields.phone, 'invalid');
  assert.equal(body.fields.items, 'empty');
});

test('order validation rejects a malformed phone and email', async () => {
  const { status, body } = await api(
    '/api/orders',
    json({
      customer: { name: 'Ali', phone: 'abc', wilaya: 'Alger', address: 'Rue 1', email: 'bad@' },
      items: [{ id: 'p1', qty: 1 }],
      payment: 'cod',
    })
  );
  assert.equal(status, 400);
  assert.equal(body.fields.phone, 'invalid');
  assert.equal(body.fields.email, 'invalid');
});

test('order is priced from the server catalog, ignoring client prices', async () => {
  const list = await api('/api/products?pageSize=100');
  const product = list.body.items.find((p) => p.stock >= 3);
  assert.ok(product, 'need a product with stock');

  const { status, body } = await api(
    '/api/orders',
    json({
      customer: {
        name: 'Samir QA',
        phone: '0555 12 34 56',
        wilaya: 'Alger',
        address: '12 Rue Didouche Mourad',
        email: 'samir@example.com',
      },
      items: [{ id: product.id, qty: 2, price: 1 }],
      payment: 'cod',
    })
  );
  assert.equal(status, 201);
  const order = body.order;
  assert.equal(order.items[0].price, product.price, 'server price must win over client price');
  const subtotal = product.price * 2;
  assert.equal(order.subtotal, subtotal);
  const expectedShipping = subtotal >= 50000 ? 0 : 800;
  assert.equal(order.shipping, expectedShipping);
  assert.equal(order.total, subtotal + expectedShipping);
  assert.equal(order.status, 'new');
  assert.match(order.number, /^EP-\d+$/);

  // Stock was decremented.
  const after = await api(`/api/products/${product.id}`);
  assert.equal(after.body.product.stock, product.stock - 2);

  // Public lookup needs the matching phone.
  const forbidden = await api(`/api/orders/${order.number}`);
  assert.equal(forbidden.status, 403);
  const allowed = await api(`/api/orders/${order.number}?phone=0555123456`);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.order.number, order.number);
});

test('order is rejected when quantity exceeds stock', async () => {
  const list = await api('/api/products?pageSize=100');
  const product = list.body.items[0];
  const { status, body } = await api(
    '/api/orders',
    json({
      customer: { name: 'QA', phone: '0555000000', wilaya: 'Oran', address: 'Rue de test 5' },
      items: [{ id: product.id, qty: 9999 }],
      payment: 'cod',
    })
  );
  assert.equal(status, 400);
  assert.ok(Array.isArray(body.fields.items));
});

test('order is rejected for an unknown product', async () => {
  const { status } = await api(
    '/api/orders',
    json({
      customer: { name: 'QA', phone: '0555000000', wilaya: 'Oran', address: 'Rue de test 5' },
      items: [{ id: 'ghost-product', qty: 1 }],
      payment: 'cod',
    })
  );
  assert.equal(status, 400);
});

// ---- admin auth ------------------------------------------------------------

test('admin login rejects a wrong password', async () => {
  const { status, body } = await api('/api/admin/login', json({ password: 'wrong-password' }));
  assert.equal(status, 401);
  assert.equal(body.error, 'invalid_credentials');
});

test('admin routes require authentication', async () => {
  for (const [method, pathname] of [
    ['GET', '/api/admin/stats'],
    ['GET', '/api/admin/products'],
    ['GET', '/api/admin/orders'],
    ['POST', '/api/admin/products'],
    ['DELETE', '/api/admin/products/p1'],
    ['PATCH', '/api/admin/orders/EP-1'],
  ]) {
    const res = await api(pathname, { method });
    assert.equal(res.status, 401, `${method} ${pathname} must be protected`);
  }
});

test('a forged token is rejected', async () => {
  const forged = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 1e9 })).toString('base64url');
  const res = await api('/api/admin/stats', {
    headers: { Authorization: `Bearer ${forged}.notavalidsignature` },
  });
  assert.equal(res.status, 401);
});

test('admin session reports authentication state', async () => {
  const anon = await api('/api/admin/session');
  assert.equal(anon.body.authenticated, false);
  const authed = await api('/api/admin/session', admin());
  assert.equal(authed.body.authenticated, true);
});

// ---- admin products CRUD ---------------------------------------------------

test('admin stats summarise the store', async () => {
  const { status, body } = await api('/api/admin/stats', admin());
  assert.equal(status, 200);
  assert.ok(body.products > 0);
  assert.ok(body.orders >= 1);
  assert.ok(body.revenue >= 0);
  assert.ok(Array.isArray(body.recentOrders));
});

test('admin can create a product', async () => {
  const payload = {
    name: { ar: 'منتج اختبار', fr: 'Produit de test' },
    desc: { ar: 'وصف', fr: 'Description' },
    specs: { ar: ['8 جيجابايت'], fr: ['8 Go'] },
    category: 'ram',
    brand: 'QATest',
    price: 12345,
    stock: 7,
    image: '/img/products/cat-ram.webp',
    sku: 'QA-TEST-1',
    featured: false,
  };
  const { status, body } = await api('/api/admin/products', admin(json(payload)));
  assert.equal(status, 201);
  assert.ok(body.product.id);
  assert.equal(body.product.price, 12345);
  assert.equal(body.product.name.fr, 'Produit de test');
  createdProductId = body.product.id;

  const list = await api('/api/products?q=QATest');
  assert.ok(list.body.items.some((p) => p.id === createdProductId), 'new product appears in public catalog');
});

test('admin product creation validates required fields', async () => {
  const { status, body } = await api('/api/admin/products', admin(json({ brand: 'X' })));
  assert.equal(status, 400);
  assert.equal(body.error, 'validation_failed');
  assert.ok(body.fields['name.ar']);
  assert.ok(body.fields.price);
  assert.ok(body.fields.category);
});

test('admin product creation rejects a bad category and negative price', async () => {
  const { status, body } = await api(
    '/api/admin/products',
    admin(json({ name: { ar: 'ا', fr: 'A' }, category: 'not-real', brand: 'X', price: -5, stock: 1, image: '/img/products/cat-cpu.webp' }))
  );
  assert.equal(status, 400);
  assert.equal(body.fields.category, 'invalid');
  assert.equal(body.fields.price, 'invalid');
});

test('admin can edit a product', async () => {
  const { status, body } = await api(
    `/api/admin/products/${createdProductId}`,
    admin({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 9999, stock: 2 }),
    })
  );
  assert.equal(status, 200);
  assert.equal(body.product.price, 9999);
  assert.equal(body.product.stock, 2);
  assert.equal(body.product.name.fr, 'Produit de test', 'other fields are preserved on partial update');
});

test('admin can delete a product', async () => {
  const del = await api(`/api/admin/products/${createdProductId}`, admin({ method: 'DELETE' }));
  assert.equal(del.status, 200);
  assert.equal(del.body.ok, true);
  const detail = await api(`/api/products/${createdProductId}`);
  assert.equal(detail.status, 404);
  const again = await api(`/api/admin/products/${createdProductId}`, admin({ method: 'DELETE' }));
  assert.equal(again.status, 404);
});

// ---- admin orders ----------------------------------------------------------

test('admin can list and filter orders', async () => {
  const all = await api('/api/admin/orders', admin());
  assert.equal(all.status, 200);
  assert.ok(all.body.items.length >= 1);
  assert.ok(all.body.statuses.includes('delivered'));

  const filtered = await api('/api/admin/orders?status=new', admin());
  assert.ok(filtered.body.items.every((o) => o.status === 'new'));
});

test('admin can change order status, and cancelling restores stock', async () => {
  const orders = await api('/api/admin/orders', admin());
  const order = orders.body.items.find((o) => o.status === 'new');
  assert.ok(order, 'need a new order');

  const shipped = await api(`/api/admin/orders/${order.id}`, admin({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'shipped' }),
  }));
  assert.equal(shipped.status, 200);
  assert.equal(shipped.body.order.status, 'shipped');

  const invalid = await api(`/api/admin/orders/${order.id}`, admin({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'teleported' }),
  }));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.fields.status, 'invalid');

  const item = order.items[0];
  const beforeCancel = await api(`/api/products/${item.id}`);
  const cancelled = await api(`/api/admin/orders/${order.id}`, admin({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  }));
  assert.equal(cancelled.status, 200);
  const afterCancel = await api(`/api/products/${item.id}`);
  assert.equal(afterCancel.body.product.stock, beforeCancel.body.product.stock + item.qty);
});

test('admin logout clears the cookie', async () => {
  const res = await api('/api/admin/logout', { method: 'POST' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie') || '', /electropc_admin=;/);
});

// ---- SPA -------------------------------------------------------------------

test('SPA fallback serves index.html for client routes', async () => {
  const res = await fetch(`${BASE}/catalog`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /<div id="root">/);
});

test('static assets are served', async () => {
  const res = await fetch(`${BASE}/img/cpu.svg`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /svg/);
});
