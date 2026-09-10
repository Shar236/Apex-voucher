export type Currency = 'INR' | 'USD';

/** Short-lived display-preference cookie (requirement 27: stable session currency). */
export const CURRENCY_COOKIE = 'apex.currency';

/**
 * The ONE centralized money formatter (pure, dependency-free — importable from
 * both server and client code). Amounts arrive ALREADY in the target currency;
 * conversion happens server-side only. The browser never converts currencies.
 *
 *   formatMoney(1000)            → "₹1,000"
 *   formatMoney(11.43, 'USD')    → "$11.43"
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: Currency = 'INR'
): string {
  if (amount == null || !Number.isFinite(Number(amount))) {
    return currency === 'USD' ? '$0.00' : '₹0';
  }
  return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'USD' ? 2 : 0,
    maximumFractionDigits: currency === 'USD' ? 2 : 0,
  }).format(Number(amount));
}
