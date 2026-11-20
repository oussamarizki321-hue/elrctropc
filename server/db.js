// Tiny JSON-file store. No native dependencies, works on any Node LTS image.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedProducts } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const db = { products: [], orders: [], orderSeq: 1000 };

export function initDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (Array.isArray(raw.products) && Array.isArray(raw.orders)) {
        db.products = raw.products;
        db.orders = raw.orders;
        db.orderSeq = Number.isFinite(raw.orderSeq) ? raw.orderSeq : 1000 + raw.orders.length;
        return db;
      }
    }
  } catch (err) {
    console.warn('[db] could not read store, reseeding:', err.message);
  }
  db.products = structuredClone(seedProducts);
  db.orders = [];
  db.orderSeq = 1000;
  saveDb();
  return db;
}

export function saveDb() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('[db] save failed:', err.message);
  }
}

export function nextOrderNumber() {
  db.orderSeq += 1;
  return `EP-${db.orderSeq}`;
}

export function newProductId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
