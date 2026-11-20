import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initDb, db, saveDb, nextOrderNumber, newProductId } from './db.js';
import { categories, seedProducts } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'client', 'dist');

initDb();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ---- config ---------------------------------------------------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'electropc-admin';
const DEFAULT_PASSWORD_IN_USE = !process.env.ADMIN_PASSWORD;
const SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`electropc-token:${ADMIN_PASSWORD}`).digest('hex');
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const SHIPPING_FEE = 800;
const FREE_SHIPPING_FROM = 50000;
const CATEGORY_IDS = new Set(categories.map((c) => c.id));
const ORDER_STATUSES = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'];

app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'self'; form-action 'self'"
  );
  next();
});

// ---- helpers --------------------------------------------------------------
const tokenSecret = Buffer.from(SECRET);

function signToken(exp) {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return readCookie(req, 'electropc_admin');
}

function requireAdmin(req, res, next) {
  if (!verifyToken(getToken(req))) {
    return res.status(401).json({ error: 'unauthorized', message: 'Admin authentication required' });
  }
  return next();
}

const isText = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const toNumber = (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : Number(v));

// Simple in-memory brute-force guard for the admin login.
const loginAttempts = new Map();
function loginRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 8;
}

function publicProduct(p) {
  return {
    id: p.id,
    sku: p.sku,
    category: p.category,
    brand: p.brand,
    price: p.price,
    oldPrice: p.oldPrice ?? null,
    stock: p.stock,
    rating: p.rating,
    reviews: p.reviews,
    featured: Boolean(p.featured),
    image: p.image,
    name: p.name,
    desc: p.desc,
    specs: p.specs,
  };
}

function computeTotals(items) {
  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const shipping = subtotal >= FREE_SHIPPING_FROM || subtotal === 0 ? 0 : SHIPPING_FEE;
  return { subtotal, shipping, total: subtotal + shipping };
}

// ---- public API -----------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', products: db.products.length, orders: db.orders.length, uptime: Math.round(process.uptime()) });
});

app.get('/api/config', (req, res) => {
  res.json({
    currency: 'DZD',
    shippingFee: SHIPPING_FEE,
    freeShippingFrom: FREE_SHIPPING_FROM,
    categories: categories.map(({ id, ar, fr, image }) => ({ id, ar, fr, image })),
    paymentMethods: ['cod'],
  });
});

app.get('/api/products', (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const category = String(req.query.category ?? '').trim();
  const sort = String(req.query.sort ?? 'featured');
  const min = req.query.min === undefined || req.query.min === '' ? null : Number(req.query.min);
  const max = req.query.max === undefined || req.query.max === '' ? null : Number(req.query.max);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(48, Math.max(1, Number(req.query.pageSize) || 12));

  let items = db.products.slice();

  if (q) {
    items = items.filter((p) =>
      `${p.name.ar} ${p.name.fr} ${p.brand} ${p.sku} ${p.category}`.toLowerCase().includes(q)
    );
  }
  if (category && category !== 'all') items = items.filter((p) => p.category === category);
  if (Number.isFinite(min)) items = items.filter((p) => p.price >= min);
  if (Number.isFinite(max)) items = items.filter((p) => p.price <= max);
  if (req.query.featured === 'true') items = items.filter((p) => p.featured);
  if (req.query.inStock === 'true') items = items.filter((p) => p.stock > 0);

  switch (sort) {
    case 'price-asc':
      items.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      items.sort((a, b) => b.price - a.price);
      break;
    case 'rating':
      items.sort((a, b) => b.rating - a.rating);
      break;
    case 'name':
      items.sort((a, b) => a.name.fr.localeCompare(b.name.fr));
      break;
    default:
      items.sort((a, b) => Number(b.featured) - Number(a.featured) || b.rating - a.rating);
  }

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const paged = items.slice((safePage - 1) * pageSize, safePage * pageSize).map(publicProduct);

  res.json({
    items: paged,
    total,
    page: safePage,
    pageSize,
    pages,
    categoryCounts: categories.map((c) => ({
      id: c.id,
      count: db.products.filter((p) => p.category === c.id).length,
    })),
  });
});

app.get('/api/products/:id', (req, res) => {
  const product = db.products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'not_found', message: 'Product not found' });
  const related = db.products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4)
    .map(publicProduct);
  return res.json({ product: publicProduct(product), related });
});

// ---- orders ---------------------------------------------------------------
app.post('/api/orders', (req, res) => {
  const body = req.body ?? {};
  const errors = {};
  const customer = body.customer ?? {};

  if (!isText(customer.name, 2, 80)) errors.name = 'invalid';
  if (!isText(customer.phone, 8, 20) || !/^[+0-9][0-9\s-]{6,19}$/.test(String(customer.phone).trim())) errors.phone = 'invalid';
  if (!isText(customer.wilaya, 2, 60)) errors.wilaya = 'invalid';
  if (!isText(customer.address, 5, 200)) errors.address = 'invalid';
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(customer.email).trim())) errors.email = 'invalid';
  if (customer.notes && String(customer.notes).length > 500) errors.notes = 'invalid';
  if (body.payment !== 'cod') errors.payment = 'invalid';

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) errors.items = 'empty';
  if (rawItems.length > 50) errors.items = 'too_many';

  const lineItems = [];
  const stockErrors = [];
  for (const raw of rawItems) {
    const product = db.products.find((p) => p.id === raw?.id);
    const qty = Number(raw?.qty);
    if (!product) {
      stockErrors.push({ id: raw?.id, reason: 'missing' });
      continue;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      stockErrors.push({ id: product.id, reason: 'qty' });
      continue;
    }
    if (qty > product.stock) {
      stockErrors.push({ id: product.id, reason: 'stock', available: product.stock });
      continue;
    }
    lineItems.push({ product, qty });
  }
  if (stockErrors.length) errors.items = stockErrors;

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'validation_failed', fields: errors });
  }

  // Prices are always taken from the server catalog, never from the client.
  const items = lineItems.map(({ product, qty }) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    price: product.price,
    qty,
    image: product.image,
  }));
  const totals = computeTotals(items);
  const order = {
    id: crypto.randomUUID(),
    number: nextOrderNumber(),
    items,
    customer: {
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      email: (customer.email || '').trim(),
      wilaya: customer.wilaya.trim(),
      address: customer.address.trim(),
      notes: (customer.notes || '').trim(),
    },
    payment: 'cod',
    status: 'new',
    ...totals,
    createdAt: new Date().toISOString(),
  };

  for (const { product, qty } of lineItems) {
    const stored = db.products.find((p) => p.id === product.id);
    stored.stock = Math.max(0, stored.stock - qty);
  }
  db.orders.unshift(order);
  saveDb();
  return res.status(201).json({ order });
});

app.get('/api/orders/:number', (req, res) => {
  const order = db.orders.find((o) => o.number === String(req.params.number).toUpperCase());
  if (!order) return res.status(404).json({ error: 'not_found' });
  // Public lookup requires the phone number used for the order.
  const phone = String(req.query.phone ?? '').replace(/\s/g, '');
  if (!phone || phone !== order.customer.phone.replace(/\s/g, '')) {
    return res.status(403).json({ error: 'forbidden', message: 'Phone number required' });
  }
  return res.json({ order });
});

// ---- admin auth -----------------------------------------------------------
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (loginRateLimited(ip)) {
    return res.status(429).json({ error: 'too_many_attempts', message: 'Too many attempts, try again later' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const given = crypto.createHash('sha256').update(password).digest();
  const expected = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(given, expected)) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid password' });
  }
  loginAttempts.delete(ip);
  const exp = Date.now() + TOKEN_TTL_MS;
  const token = signToken(exp);
  res.setHeader(
    'Set-Cookie',
    `electropc_admin=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}${req.secure ? '; Secure' : ''}`
  );
  return res.json({ token, expiresAt: exp, defaultPasswordInUse: DEFAULT_PASSWORD_IN_USE });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'electropc_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  res.json({
    authenticated: Boolean(verifyToken(getToken(req))),
    defaultPasswordInUse: DEFAULT_PASSWORD_IN_USE,
  });
});

// ---- admin: stats ---------------------------------------------------------
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const revenue = db.orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);
  res.json({
    products: db.products.length,
    lowStock: db.products.filter((p) => p.stock <= 3).length,
    orders: db.orders.length,
    newOrders: db.orders.filter((o) => o.status === 'new').length,
    revenue,
    recentOrders: db.orders.slice(0, 5),
  });
});

// ---- admin: products ------------------------------------------------------
app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json({ items: db.products.map(publicProduct) });
});

function validateProduct(body, { partial = false } = {}) {
  const errors = {};
  const name = body?.name ?? {};
  const desc = body?.desc ?? {};
  const specs = body?.specs ?? {};
  const out = {};

  if (!partial || name.ar !== undefined) {
    if (!isText(name.ar, 2, 120)) errors['name.ar'] = 'invalid';
    else out.name = { ...(out.name || {}), ar: name.ar.trim() };
  }
  if (!partial || name.fr !== undefined) {
    if (!isText(name.fr, 2, 120)) errors['name.fr'] = 'invalid';
    else out.name = { ...(out.name || {}), fr: name.fr.trim() };
  }
  if (!partial || desc.ar !== undefined) out.desc = { ...(out.desc || {}), ar: isText(desc.ar, 0, 2000) ? desc.ar.trim() : '' };
  if (!partial || desc.fr !== undefined) out.desc = { ...(out.desc || {}), fr: isText(desc.fr, 0, 2000) ? desc.fr.trim() : '' };
  if (!partial || specs.ar !== undefined) {
    out.specs = { ...(out.specs || {}), ar: Array.isArray(specs.ar) ? specs.ar.filter((s) => isText(s, 1, 160)).slice(0, 12) : [] };
  }
  if (!partial || specs.fr !== undefined) {
    out.specs = { ...(out.specs || {}), fr: Array.isArray(specs.fr) ? specs.fr.filter((s) => isText(s, 1, 160)).slice(0, 12) : [] };
  }
  if (!partial || body.category !== undefined) {
    if (!CATEGORY_IDS.has(String(body.category))) errors.category = 'invalid';
    else out.category = String(body.category);
  }
  if (!partial || body.brand !== undefined) {
    if (!isText(body.brand, 1, 60)) errors.brand = 'invalid';
    else out.brand = body.brand.trim();
  }
  if (!partial || body.price !== undefined) {
    const price = toNumber(body.price);
    if (!Number.isFinite(price) || price <= 0 || price > 100000000) errors.price = 'invalid';
    else out.price = Math.round(price);
  }
  if (body.oldPrice !== undefined && body.oldPrice !== null && body.oldPrice !== '') {
    const oldPrice = toNumber(body.oldPrice);
    if (!Number.isFinite(oldPrice) || oldPrice <= 0) errors.oldPrice = 'invalid';
    else out.oldPrice = Math.round(oldPrice);
  } else if (!partial) {
    out.oldPrice = null;
  }
  if (!partial || body.stock !== undefined) {
    const stock = toNumber(body.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) errors.stock = 'invalid';
    else out.stock = stock;
  }
  if (!partial || body.image !== undefined) {
    if (!isText(body.image, 1, 300)) errors.image = 'invalid';
    else out.image = body.image.trim();
  }
  if (body.featured !== undefined) out.featured = Boolean(body.featured);
  else if (!partial) out.featured = false;
  if (body.rating !== undefined) {
    const rating = toNumber(body.rating);
    out.rating = Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : 4.5;
  } else if (!partial) out.rating = 4.5;
  if (body.reviews !== undefined) {
    const reviews = toNumber(body.reviews);
    out.reviews = Number.isInteger(reviews) && reviews >= 0 ? reviews : 0;
  } else if (!partial) out.reviews = 0;

  return { errors, value: out };
}

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const { errors, value } = validateProduct(req.body ?? {});
  if (Object.keys(errors).length) return res.status(400).json({ error: 'validation_failed', fields: errors });
  const product = {
    id: newProductId(),
    sku: isText(req.body?.sku, 2, 40) ? req.body.sku.trim() : `EP-${Date.now().toString(36).toUpperCase()}`,
    ...value,
  };
  db.products.unshift(product);
  saveDb();
  return res.status(201).json({ product: publicProduct(product) });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const index = db.products.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'not_found' });
  const { errors, value } = validateProduct(req.body ?? {}, { partial: true });
  if (Object.keys(errors).length) return res.status(400).json({ error: 'validation_failed', fields: errors });
  const current = db.products[index];
  const updated = {
    ...current,
    ...value,
    name: { ...current.name, ...(value.name || {}) },
    desc: { ...current.desc, ...(value.desc || {}) },
    specs: { ...current.specs, ...(value.specs || {}) },
  };
  if (isText(req.body?.sku, 2, 40)) updated.sku = req.body.sku.trim();
  db.products[index] = updated;
  saveDb();
  return res.json({ product: publicProduct(updated) });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const index = db.products.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'not_found' });
  const [removed] = db.products.splice(index, 1);
  saveDb();
  return res.json({ ok: true, removedId: removed.id });
});

// ---- admin: orders --------------------------------------------------------
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const status = String(req.query.status ?? '').trim();
  let items = db.orders.slice();
  if (status && status !== 'all') items = items.filter((o) => o.status === status);
  res.json({ items, total: items.length, statuses: ORDER_STATUSES });
});

app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const order = db.orders.find((o) => o.id === req.params.id || o.number === req.params.id);
  if (!order) return res.status(404).json({ error: 'not_found' });
  const status = String(req.body?.status ?? '');
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'validation_failed', fields: { status: 'invalid' } });
  }
  const previous = order.status;
  order.status = status;
  // Cancelling an order returns its items to stock.
  if (status === 'cancelled' && previous !== 'cancelled') {
    for (const item of order.items) {
      const product = db.products.find((p) => p.id === item.id);
      if (product) product.stock += item.qty;
    }
  }
  order.updatedAt = new Date().toISOString();
  saveDb();
  return res.json({ order });
});

// ---- API 404 + errors -----------------------------------------------------
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', path: req.originalUrl }));

app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json' });
  }
  console.error('[server] unhandled error:', err?.message);
  return res.status(500).json({ error: 'internal_error' });
});

// ---- static SPA -----------------------------------------------------------
const indexFile = path.join(DIST_DIR, 'index.html');
app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!fs.existsSync(indexFile)) {
    return res.status(503).send('Client build missing. Run: npm run build');
  }
  return res.sendFile(indexFile);
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[electropc] listening on http://${HOST}:${PORT} (products: ${db.products.length})`);
  if (DEFAULT_PASSWORD_IN_USE) {
    console.log('[electropc] ADMIN_PASSWORD is not set — using the default development admin password.');
  }
});

export { app, server };
