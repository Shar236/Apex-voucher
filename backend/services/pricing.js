import { getFxRate, convertInrToUsd } from './fx.js';
import { getCustomerCountry, getDisplayCurrency, getDisplayCurrencyForRequest } from './geo.js';
import { AppError } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';

/**
 * Authoritative, server-side multi-currency pricing.
 *
 * INR is the SOURCE OF TRUTH. Product.sellingPrice / duration options stay in
 * INR; USD prices are always derived from the live USD/INR rate at the moment
 * of calculation. The frontend is never asked for — and never trusted with —
 * an amount, currency, country or exchange rate.
 *
 * Rounding: conversions round ONCE, half-up, in integer minor units
 * (paise → cents), so no floating-point drift can reach a payable amount.
 */

export const MINOR_UNIT_FACTOR = 100;

/** Major units → integer minor units (paise for INR, cents for USD). */
export const toMinorUnits = (amountMajor, _currency = 'INR') =>
  Math.round(Number(amountMajor) * MINOR_UNIT_FACTOR);

/**
 * The final Razorpay amount for a charge — integer minor units.
 *   ₹1,000.00 INR → 100000   |   $11.43 USD → 1143
 */
export const calculateRazorpayAmount = (amountMajor, currency) => {
  const minor = toMinorUnits(amountMajor, currency);
  if (!Number.isInteger(minor) || minor <= 0) {
    throw new AppError('Invalid payment amount', 400, 'INVALID_AMOUNT');
  }
  return minor;
};

/**
 * Convert the canonical INR order totals into the charge currency.
 *
 * @param {{ subtotal:number, discountAmount:number, total:number }} baseTotalsInr
 * @param {string} currency  'INR' | 'USD'
 * @returns {Promise<{ currency:string, subtotal:number, discountAmount:number, total:number,
 *   fxRateUsed:number|null, fxRateTimestamp:Date|null, fxRateSource:string|null }>}
 * @throws AppError 503 FX_UNAVAILABLE when a USD total is needed but no
 *   trustworthy rate exists (INR orders are never blocked by FX).
 */
export const convertOrderTotals = async (baseTotalsInr, currency) => {
  if (currency !== 'USD') {
    return {
      currency: 'INR',
      subtotal: baseTotalsInr.subtotal,
      discountAmount: baseTotalsInr.discountAmount,
      total: baseTotalsInr.total,
      fxRateUsed: null,
      fxRateTimestamp: null,
      fxRateSource: null,
    };
  }

  const fx = await getFxRate();
  if (!fx.ok) {
    throw new AppError(
      'International pricing is temporarily unavailable. Please try again shortly.',
      503,
      'FX_UNAVAILABLE',
    );
  }

  const markup = config.fx.internationalMarkupPercent;
  const subtotal = convertInrToUsd(baseTotalsInr.subtotal, fx.rate, markup);
  const discount = convertInrToUsd(baseTotalsInr.discountAmount, fx.rate, markup);
  // Convert the FINAL payable total once — never the sum of rounded parts —
  // so the charged amount is exactly the conversion of the INR base price.
  const total = convertInrToUsd(baseTotalsInr.total, fx.rate, markup);

  return {
    currency: 'USD',
    subtotal: subtotal.amount,
    discountAmount: discount.amount,
    total: total.amount,
    fxRateUsed: fx.rate,
    fxRateTimestamp: fx.fetchedAt,
    fxRateSource: fx.source,
  };
};

/**
 * Per-request display-pricing resolver — resolves geo + FX ONCE, then answers
 * many per-product conversions from the cached rate (no extra provider calls).
 * Returns: async (inrPrice, inrOriginalPrice?) => pricing object
 */
export const createDisplayPricingResolver = async (req) => {
  let currency = 'INR';
  let country = null;
  try {
    currency = await getDisplayCurrencyForRequest(req);
    country = await getCustomerCountry(req);
  } catch {}

  const fx = await getFxRate();
  const markup = config.fx.internationalMarkupPercent;

  return (inrPrice, inrOriginalPrice = 0) => {
    const paise = Math.round(Number(inrPrice) || 0);
    const inrOriginal = Math.round(Number(inrOriginalPrice) || 0);
    const usd = fx.ok ? convertInrToUsd(paise, fx.rate, markup) : null;
    const usdOriginal = fx.ok && inrOriginal ? convertInrToUsd(inrOriginal, fx.rate, markup) : null;

    const isUsd = currency === 'USD' && fx.ok;
    return {
      countryCode: country,
      currency: isUsd ? 'USD' : 'INR',
      displayPrice: isUsd ? usd.amount : paise,
      displayOriginalPrice: isUsd ? (usdOriginal ? usdOriginal.amount : 0) : inrOriginal,
      basePriceINR: paise,
      inr: {
        displayPrice: paise,
        displaySellingPrice: paise,
        displayOriginalPrice: inrOriginal,
      },
      usd: usd ? {
        displayPrice: usd.amount,
        displaySellingPrice: usd.amount,
        displayOriginalPrice: usdOriginal ? usdOriginal.amount : 0,
      } : null,
    };
  };
};

/**
 * Display pricing for a single INR base price — used by public product APIs so
 * every customer-facing surface (cards, detail pages, cart) shows one currency
 * per visitor. Returns the base INR price alongside the display currency and
 * the display amount. The FX rate itself is intentionally NOT exposed.
 *
 * Falls back to INR display when the FX rate is unavailable (international
 * checkout will refuse to start — the display never invents a price).
 */
export const buildDisplayPricing = async (basePriceInr, baseOriginalPriceInr, req) => {
  // Display-only currency: geo detection, optionally overridden by the
  // frontend's short-lived display-preference header (never a payment input).
  const currency = await getDisplayCurrencyForRequest(req);
  let country = null;
  try {
    country = await getCustomerCountry(req);
  } catch {}

  const basePrice = Math.round(Number(basePriceInr) || 0);
  const baseOriginal = Math.round(Number(baseOriginalPriceInr) || 0);

  const fx = await getFxRate();
  const markup = config.fx.internationalMarkupPercent;
  const usd = fx.ok ? convertInrToUsd(basePrice, fx.rate, markup) : null;
  const usdOriginal = fx.ok && baseOriginal ? convertInrToUsd(baseOriginal, fx.rate, markup) : null;

  const isUsd = currency === 'USD' && fx.ok;

  return {
    countryCode: country,
    currency: isUsd ? 'USD' : 'INR',
    displayPrice: isUsd ? usd.amount : basePrice,
    displayOriginalPrice: isUsd ? (usdOriginal ? usdOriginal.amount : 0) : baseOriginal,
    basePriceINR: basePrice,
    inr: {
      displayPrice: basePrice,
      displaySellingPrice: basePrice,
      displayOriginalPrice: baseOriginal,
    },
    usd: usd ? {
      displayPrice: usd.amount,
      displaySellingPrice: usd.amount,
      displayOriginalPrice: usdOriginal ? usdOriginal.amount : 0,
    } : null,
  };
};

/** One-line summary used in order payloads/emails: "$11.43 USD" / "₹1,000 INR". */
export const moneyLabel = (amountMajor, currency) =>
  currency === 'USD'
    ? `$${Number(amountMajor || 0).toFixed(2)} USD`
    : `₹${Math.round(Number(amountMajor) || 0).toLocaleString('en-IN')} INR`;

export { getDisplayCurrency, getCustomerCountry, getDisplayCurrencyForRequest };
