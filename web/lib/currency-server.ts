import { cookies } from 'next/headers';
import { CURRENCY_COOKIE, type Currency } from './money';

/**
 * Server-side session display currency (from the short-lived cookie the client
 * CurrencyProvider maintains). Used ONLY to pass an `x-apex-currency` display
 * hint to product READ APIs so SSR and client renders agree — never for
 * payments. Absent cookie → null (backend geo-detects, default INR).
 */
export async function getSessionCurrency(): Promise<Currency | null> {
  try {
    const store = await cookies();
    const v = store.get(CURRENCY_COOKIE)?.value?.toUpperCase();
    return v === 'USD' || v === 'INR' ? (v as Currency) : null;
  } catch {
    return null;
  }
}

/** Request headers carrying the display preference to backend READ APIs. */
export function currencyDisplayHeaders(currency: Currency | null): HeadersInit | undefined {
  return currency ? { 'x-apex-currency': currency } : undefined;
}
