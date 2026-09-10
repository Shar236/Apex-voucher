import type { Product, DurationOption } from './types';
import type { Currency } from './money';

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

  if (duration) {
    if (targetCurrency === 'USD') {
      if (duration.usd) {
        return {
          current: duration.usd.displaySellingPrice ?? 0,
          original: duration.usd.displayOriginalPrice ?? duration.usd.displaySellingPrice ?? 0,
          currency: 'USD',
        };
      }
      if (duration.displayCurrency === 'USD') {
        return {
          current: Number(duration.displaySellingPrice ?? duration.sellingPrice ?? 0),
          original: Number(duration.displayOriginalPrice ?? duration.originalPrice ?? 0),
          currency: 'USD',
        };
      }
    }
    if (targetCurrency === 'INR') {
      if (duration.inr) {
        return {
          current: duration.inr.displaySellingPrice ?? 0,
          original: duration.inr.displayOriginalPrice ?? duration.inr.displaySellingPrice ?? 0,
          currency: 'INR',
        };
      }
      if (duration.displayCurrency === 'INR') {
        return {
          current: Number(duration.displaySellingPrice ?? duration.sellingPrice ?? 0),
          original: Number(duration.displayOriginalPrice ?? duration.originalPrice ?? 0),
          currency: 'INR',
        };
      }
      return {
        current: Number(duration.sellingPrice || 0),
        original: Number(duration.originalPrice || duration.sellingPrice || 0),
        currency: 'INR',
      };
    }
    return {
      current: Number(duration.displaySellingPrice ?? duration.sellingPrice ?? 0),
      original: Number(duration.displayOriginalPrice ?? duration.originalPrice ?? 0),
      currency: (duration.displayCurrency ?? product.pricing?.currency ?? 'INR') as Currency,
    };
  }

  if (targetCurrency === 'USD') {
    if (product.pricing?.usd) {
      return {
        current: product.pricing.usd.displayPrice ?? 0,
        original: product.pricing.usd.displayOriginalPrice ?? product.pricing.usd.displayPrice ?? 0,
        currency: 'USD',
      };
    }
    if (product.pricing?.currency === 'USD') {
      return {
        current: Number(product.pricing.displayPrice ?? product.discountedPrice ?? product.sellingPrice ?? 0),
        original: Number(product.pricing.displayOriginalPrice ?? product.originalPrice ?? 0),
        currency: 'USD',
      };
    }
  }

  if (targetCurrency === 'INR') {
    if (product.pricing?.inr) {
      return {
        current: product.pricing.inr.displayPrice ?? 0,
        original: product.pricing.inr.displayOriginalPrice ?? product.pricing.inr.displayPrice ?? 0,
        currency: 'INR',
      };
    }
    if (product.pricing?.currency === 'INR') {
      return {
        current: Number(product.pricing.displayPrice ?? product.discountedPrice ?? product.sellingPrice ?? 0),
        original: Number(product.pricing.displayOriginalPrice ?? product.originalPrice ?? 0),
        currency: 'INR',
      };
    }
    const baseCurrent = Number(product.discountedPrice ?? product.sellingPrice ?? 0);
    const baseOriginal = Number(product.originalPrice ?? baseCurrent);
    return {
      current: baseCurrent,
      original: baseOriginal > 0 ? baseOriginal : baseCurrent,
      currency: 'INR',
    };
  }

  return {
    current: Number(product.pricing?.displayPrice ?? product.discountedPrice ?? product.sellingPrice ?? 0),
    original: Number(product.pricing?.displayOriginalPrice ?? product.originalPrice ?? 0),
    currency: (product.pricing?.currency ?? 'INR') as Currency,
  };
};