'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiBase } from './api';
import { formatMoney, CURRENCY_COOKIE, type Currency } from './money';

export { formatMoney };
export type { Currency };

const COOKIE_TTL_SECONDS = 60 * 30; // 30 minutes — refreshed on every page load

const setCurrencyCookie = (currency: Currency) => {
  try {
    document.cookie = `${CURRENCY_COOKIE}=${currency}; path=/; max-age=${COOKIE_TTL_SECONDS}; samesite=lax`;
  } catch {
    // cookie blocked — session still works with in-memory state
  }
};

interface CurrencyContextValue {
  /** Session display currency (server-detected; short-lived cookie). */
  currency: Currency;
  country: string | null;
  /** True until the session currency has been established (first visit only). */
  loading: boolean;
  /** Pure formatter bound to the session currency. */
  formatMoney: (amount: number | null | undefined, currency?: Currency) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({
  children,
  initialCurrency,
  initialCountry = null,
}: {
  children: ReactNode;
  initialCurrency?: Currency | null;
  initialCountry?: string | null;
}) {
  const [currency, setCurrency] = useState<Currency | null>(initialCurrency ?? null);
  const [country, setCountry] = useState<string | null>(initialCountry);

  useEffect(() => {
    if (initialCurrency) {
      // Server already resolved the session currency (cookie was present).
      // Refresh the TTL so an unchanged location keeps the same currency.
      setCurrencyCookie(initialCurrency);
      return;
    }
    // First visit (no cookie): ask the backend — the browser's real IP hits the
    // API directly, so the server can geo-detect. This is the ONLY client
    // currency call, once per session. It is a DISPLAY concern only.
    let cancelled = false;
    const detect = async () => {
      try {
        const res = await fetch(`${apiBase()}/api/payments/config`, { credentials: 'include' });
        const data = await res.json();
        const c: Currency = data?.currency === 'USD' ? 'USD' : 'INR';
        if (!cancelled) {
          setCurrency(c);
          setCountry(data?.country || null);
          setCurrencyCookie(c);
        }
      } catch {
        if (!cancelled) setCurrency('INR'); // safe fallback
      }
    };
    detect();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatMoneyBound = useCallback(
    (amount: number | null | undefined, c?: Currency) => formatMoney(amount, c ?? currency ?? 'INR'),
    [currency]
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency: currency ?? 'INR',
      country,
      loading: currency == null,
      formatMoney: formatMoneyBound,
    }),
    [currency, country, formatMoneyBound]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Non-fatal fallback so components render even without the provider.
    return { currency: 'INR', country: null, loading: false, formatMoney: (a) => formatMoney(a, 'INR') };
  }
  return ctx;
}
