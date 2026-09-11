import type { Product, DurationOption } from './types';
import type { Currency } from './money';

/**
 * Authoritative discount percentage calculation:
 * ((originalPrice - sellingPrice) / originalPrice) * 100
 *
 * Returns whole number if integer (e.g. 20), otherwise rounded to 2 decimal places (e.g. 10.46, 2.55).
 */
export const calculateDiscountPercent = (original: number, current: number): number => {
  if (!original || original <= current) return 0;
  const raw = ((original - current) / original) * 100;
  return Number.isInteger(raw) ? raw : Number(raw.toFixed(2));
};

/**
 * Centralized display-price derivation (frontend presentation).
 *
 * The backend hydrates every product with `pricing` = { currency, displayPrice,
 * displayOriginalPrice, basePriceINR, inr, usd } and every duration option with
 * server-converted displaySellingPrice/displayOriginalPrice/displayCurrency/inr/usd —
 * already in the visitor's display currency (INR in India, USD abroad) computed from
 * the live, cached USD/INR rate on the backend.
 *
 * When an active currency is provided (e.g. from the client's CurrencyContext on first visit),
 * this function resolves the appropriate currency matching that session currency:
 * - If USD: prefers the precomputed `usd` price from backend hydration.
 * - If INR: prefers the precomputed `inr` price or canonical base INR fields.
 *
 * The browser NEVER converts currencies itself — it picks between server-computed values.
 */
export const unitDisplayPrice = (
  product: Product,
  duration?: DurationOption | null,
  activeCurrency?: Currency | null
): { current: number; original: number; currency: Currency } => {
  const targetCurrency: Currency = activeCurrency || (product.pricing?.currency ?? 'INR');

  // If duration variant was not explicitly supplied, but the product has active durationOptions,
  // resolve from the first active duration variant. This prevents customer-facing surfaces from
  // falling back to ₹0 when a duration-based product has valid variant prices.
  const activeDuration =
    duration ??
    (Array.isArray(product.durationOptions)
      ? product.durationOptions.find((o) => o && o.enabled !== false && Number(o.sellingPrice ?? o.displaySellingPrice) > 0) ?? null
      : null);

  if (activeDuration) {
    if (targetCurrency === 'USD') {
      if (activeDuration.usd) {
        const current = Number(
          activeDuration.usd.displaySellingPrice ??
          activeDuration.usd.displayPrice ??
          activeDuration.displaySellingPrice ??
          0
        );
        const original = Number(
          activeDuration.usd.displayOriginalPrice ??
          activeDuration.usd.displayPrice ??
          activeDuration.displayOriginalPrice ??
          current
        );
        if (current > 0) {
          return {
            current,
            original: original > 0 ? original : current,
            currency: 'USD',
          };
        }
      }
      if (activeDuration.displayCurrency === 'USD') {
        const current = Number(activeDuration.displaySellingPrice ?? activeDuration.sellingPrice ?? 0);
        const original = Number(activeDuration.displayOriginalPrice ?? activeDuration.originalPrice ?? current);
        if (current > 0) {
          return {
            current,
            original: original > 0 ? original : current,
            currency: 'USD',
          };
        }
      }
    }

    if (targetCurrency === 'INR') {
      if (activeDuration.inr) {
        const current = Number(
          activeDuration.inr.displaySellingPrice ??
          activeDuration.inr.displayPrice ??
          activeDuration.displaySellingPrice ??
          activeDuration.sellingPrice ??
          0
        );
        const original = Number(
          activeDuration.inr.displayOriginalPrice ??
          activeDuration.displayOriginalPrice ??
          activeDuration.originalPrice ??
          current
        );
        if (current > 0) {
          return {
            current,
            original: original > 0 ? original : current,
            currency: 'INR',
          };
        }
      }
      if (activeDuration.displayCurrency === 'INR') {
        const current = Number(activeDuration.displaySellingPrice ?? activeDuration.sellingPrice ?? 0);
        const original = Number(activeDuration.displayOriginalPrice ?? activeDuration.originalPrice ?? current);
        if (current > 0) {
          return {
            current,
            original: original > 0 ? original : current,
            currency: 'INR',
          };
        }
      }
      const rawCurrent = Number(activeDuration.sellingPrice || 0);
      const rawOriginal = Number(activeDuration.originalPrice || rawCurrent);
      if (rawCurrent > 0) {
        return {
          current: rawCurrent,
          original: rawOriginal > 0 ? rawOriginal : rawCurrent,
          currency: 'INR',
        };
      }
    }

    const current = Number(activeDuration.displaySellingPrice ?? activeDuration.sellingPrice ?? 0);
    const original = Number(activeDuration.displayOriginalPrice ?? activeDuration.originalPrice ?? current);
    const currency = (activeDuration.displayCurrency ?? product.pricing?.currency ?? 'INR') as Currency;
    if (current > 0) {
      return {
        current,
        original: original > 0 ? original : current,
        currency,
      };
    }
  }

  // Fallback: If product base price is 0/empty, check if any duration option exists
  const firstAvailableDuration = Array.isArray(product.durationOptions)
    ? product.durationOptions.find((o) => o && o.enabled !== false && Number(o.sellingPrice ?? o.displaySellingPrice) > 0)
    : null;

  if (targetCurrency === 'USD') {
    if (product.pricing?.usd && Number(product.pricing.usd.displayPrice) > 0) {
      return {
        current: product.pricing.usd.displayPrice,
        original: product.pricing.usd.displayOriginalPrice ?? product.pricing.usd.displayPrice,
        currency: 'USD',
      };
    }
    if (product.pricing?.currency === 'USD') {
      const current = Number(product.pricing.displayPrice ?? product.discountedPrice ?? product.sellingPrice ?? 0);
      if (current > 0) {
        return {
          current,
          original: Number(product.pricing.displayOriginalPrice ?? product.originalPrice ?? current),
          currency: 'USD',
        };
      }
    }
    if (firstAvailableDuration) {
      return unitDisplayPrice(product, firstAvailableDuration, 'USD');
    }
  }

  if (targetCurrency === 'INR') {
    if (product.pricing?.inr && Number(product.pricing.inr.displayPrice) > 0) {
      return {
        current: product.pricing.inr.displayPrice,
        original: product.pricing.inr.displayOriginalPrice ?? product.pricing.inr.displayPrice,
        currency: 'INR',
      };
    }
    if (product.pricing?.currency === 'INR') {
      const current = Number(product.pricing.displayPrice ?? product.discountedPrice ?? product.sellingPrice ?? 0);
      if (current > 0) {
        return {
          current,
          original: Number(product.pricing.displayOriginalPrice ?? product.originalPrice ?? current),
          currency: 'INR',
        };
      }
    }
    const baseCurrent = Number(product.discountedPrice ?? product.sellingPrice ?? 0);
    if (baseCurrent > 0) {
      const baseOriginal = Number(product.originalPrice ?? baseCurrent);
      return {
        current: baseCurrent,
        original: baseOriginal > 0 ? baseOriginal : baseCurrent,
        currency: 'INR',
      };
    }
    if (firstAvailableDuration) {
      return unitDisplayPrice(product, firstAvailableDuration, 'INR');
    }
  }

  const current = Number(product.pricing?.displayPrice ?? product.discountedPrice ?? product.sellingPrice ?? 0);
  if (current <= 0 && firstAvailableDuration) {
    return unitDisplayPrice(product, firstAvailableDuration, targetCurrency);
  }

  return {
    current,
    original: Number(product.pricing?.displayOriginalPrice ?? product.originalPrice ?? current),
    currency: (product.pricing?.currency ?? 'INR') as Currency,
  };
};