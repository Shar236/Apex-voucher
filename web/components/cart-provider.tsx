'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCurrency } from '@/lib/currency';
import type { Product } from '@/lib/types';

export interface CartItem extends Product {
  quantity: number;
}

interface CartContextValue {
  cart: CartItem[];
  cartCount: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  addToCart: (product: Product) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  clearCart: () => void;
  /** Session display currency (server-detected; INR in India, USD abroad). */
  currency: 'INR' | 'USD';
  /** Formats an amount ALREADY in the target currency (no client-side FX). */
  formatPrice: (amount: number | null | undefined, currency?: 'INR' | 'USD') => string;
  toastMessage: string | null;
  showToast: (message: string) => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const CART_KEY = 'apex.cart';

const loadCart = (): CartItem[] => {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveCart = (cart: CartItem[]) => {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // storage unavailable — cart still works for this page load
  }
};

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { currency, formatMoney: fmt } = useCurrency();

  useEffect(() => {
    setCart(loadCart());
  }, []);

  useEffect(() => {
    saveCart(cart);
  }, [cart]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    const t = setTimeout(() => setToastMessage(null), 2600);
    return () => clearTimeout(t);
  }, []);

  const getCartItemKey = useCallback((item: { _id?: string; id?: string; selectedDuration?: { key?: string } | null }) => {
    const id = (item._id || item.id) as string;
    return item.selectedDuration?.key ? `${id}::${item.selectedDuration.key}` : id;
  }, []);

  const addToCart = useCallback(
    (product: Product) => {
      const itemKey = getCartItemKey(product);
      setCart((prev) => {
        const existing = prev.find((i) => getCartItemKey(i) === itemKey);
        if (existing) {
          return prev.map((i) => (getCartItemKey(i) === itemKey ? { ...i, quantity: i.quantity + 1 } : i));
        }
        return [...prev, { ...product, quantity: 1 }];
      });
      const suffix = product.selectedDuration?.label ? ` (${product.selectedDuration.label})` : '';
      showToast(`Added ${product.name}${suffix} to cart!`);
    },
    [getCartItemKey, showToast]
  );

  const removeFromCart = useCallback((keyOrId: string) => {
    setCart((c) =>
      c.filter((i) => {
        const itemKey = getCartItemKey(i);
        if (itemKey === keyOrId) return false;
        if (!keyOrId.includes('::') && (i._id || i.id) === keyOrId && !i.selectedDuration?.key) return false;
        return true;
      })
    );
  }, [getCartItemKey]);

  const updateQuantity = useCallback((keyOrId: string, delta: number) => {
    setCart((c) =>
      c.map((i) => {
        const itemKey = getCartItemKey(i);
        const match = itemKey === keyOrId || (!keyOrId.includes('::') && (i._id || i.id) === keyOrId && !i.selectedDuration?.key);
        if (!match) return i;
        const q = i.quantity + delta;
        return q > 0 ? { ...i, quantity: q } : i;
      })
    );
  }, [getCartItemKey]);

  const clearCart = useCallback(() => {
    setCart([]);
    saveCart([]);
  }, []);

  const cartCount = useMemo(() => cart.reduce((s, i) => s + (i.quantity || 1), 0), [cart]);

  const formatPrice = useCallback(
    (amount: number | null | undefined, c?: 'INR' | 'USD') => fmt(amount, c ?? currency),
    [fmt, currency]
  );

  return (
    <CartContext.Provider
      value={{
        cart,
        cartCount,
        isCartOpen,
        setIsCartOpen,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        currency,
        formatPrice,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
};
