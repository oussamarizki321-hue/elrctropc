import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const CartContext = createContext(null);
const STORAGE_KEY = 'electropc_cart_v1';

function readStoredItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((it) => it && typeof it.id === 'string' && Number.isInteger(it.qty) && it.qty > 0)
      .map((it) => ({
        id: it.id,
        qty: Math.min(99, it.qty),
        name: it.name || { ar: it.id, fr: it.id },
        price: Number(it.price) || 0,
        image: it.image || '',
        stock: Number(it.stock) || 0,
        sku: it.sku || '',
      }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readStoredItems);
  const [config, setConfig] = useState({
    shippingFee: 800,
    freeShippingFrom: 50000,
    currency: 'DZD',
    categories: [],
  });

  useEffect(() => {
    let alive = true;
    api('/api/config')
      .then((data) => {
        if (alive) setConfig((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {
        /* keep defaults, the store still works */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable */
    }
  }, [items]);

  const add = useCallback((product, qty = 1) => {
    const amount = Math.max(1, Math.floor(Number(qty) || 1));
    const stock = Math.max(0, Number(product.stock) || 0);
    if (stock === 0) return false;
    setItems((prev) => {
      const existing = prev.find((it) => it.id === product.id);
      if (existing) {
        return prev.map((it) =>
          it.id === product.id
            ? {
                ...it,
                qty: Math.min(stock, 99, it.qty + amount),
                price: Number(product.price) || it.price,
                stock,
              }
            : it
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          qty: Math.min(stock, 99, amount),
          name: product.name,
          price: Number(product.price) || 0,
          image: product.image || '',
          stock,
          sku: product.sku || '',
        },
      ];
    });
    return true;
  }, []);

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const setQty = useCallback((id, qty) => {
    const next = Math.floor(Number(qty) || 0);
    setItems((prev) =>
      prev
        .map((it) => {
          if (it.id !== id) return it;
          const max = it.stock > 0 ? Math.min(it.stock, 99) : 99;
          return { ...it, qty: Math.min(max, Math.max(0, next)) };
        })
        .filter((it) => it.qty > 0)
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => {
    const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
    const shipping =
      items.length === 0 || subtotal >= config.freeShippingFrom ? 0 : config.shippingFee;
    const count = items.reduce((sum, it) => sum + it.qty, 0);
    return {
      items,
      add,
      remove,
      setQty,
      clear,
      count,
      subtotal,
      shipping,
      total: subtotal + shipping,
      config,
      freeShippingFrom: config.freeShippingFrom,
      remainingForFreeShipping: Math.max(0, config.freeShippingFrom - subtotal),
    };
  }, [items, add, remove, setQty, clear, config]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
