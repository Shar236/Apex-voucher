/**
 * Dedicated Currency Detection & Pricing End-to-End Test Suite
 *
 * Scenarios covered:
 * 1. India -> INR -> ₹ -> correct INR price -> paise -> INR payment
 * 2. USA -> USD -> $ -> correct USD price -> cents -> USD payment
 * 3. International: UK/CA/AU/DE -> USD -> $ -> correct USD price -> cents
 * 4. Client tampering: US client sending body with { currency: 'INR', amount: 10, country: 'IN' }
 *    -> backend ignores client fields and enforces authoritative USD pricing
 * 5. IP detection failure: missing/invalid IP/country headers -> default fallback to INR
 * 6. FX provider failure: live API returns 500 -> gracefully falls back to fallback/cached rate
 * 7. Stale FX cache recovery: expired cache refreshes when provider available, or falls back to stale
 */
import dotenv from 'dotenv';
dotenv.config();

process.env.GEO_IP_API_URL = '';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.SMTP_FROM = '';

const crypto = (await import('crypto')).default;
const mongoose = (await import('mongoose')).default;
const { connectDB } = await import('../config/db.js');
const { config } = await import('../config/index.js');
const { Product } = await import('../models/Product.js');
const { VoucherCode } = await import('../models/VoucherCode.js');
const { Order } = await import('../models/Order.js');
const { User } = await import('../models/User.js');
const {
  convertInrToUsd,
  getFxRate,
  _resetFxCache,
  _seedFxCache,
} = await import('../services/fx.js');
const {
  getCustomerCountry,
  getDisplayCurrency,
} = await import('../services/geo.js');
const {
  createDisplayPricingResolver,
  calculateRazorpayAmount,
} = await import('../services/pricing.js');
const { formatMoney } = await import('../services/email.js');
const {
  createPaymentOrder,
  verifyPayment,
} = await import('../controllers/paymentController.js');

const SECRET = config.razorpay.keySecret || 'test_secret_fallback';
const TAG = 'TEST-CURR-E2E';

let pass = 0;
let fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
};

const run = async (handler, { user, body = {}, params = {}, headers = {}, query = {} } = {}) => {
  const res = mockRes();
  let nextErr = null;
  const req = { user, body, params, headers, query };
  await handler(req, res, (err) => {
    nextErr = err || new Error('next() called without error');
  });
  return {
    res,
    err: nextErr,
    status: nextErr?.statusCode || res.statusCode,
    body: res.body,
    message: nextErr?.message || res.body?.message,
  };
};

// ── HTTP Stub: FX + Razorpay ──────────────────────────────────────────────────
const realFetch = global.fetch;
let fxBehavior = 'success'; // 'success' | 'fail'
let lastRazorpayOrder = null;
let capturedPaymentOverride = null;

global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('er-api.com') || u.includes('exchangerate')) {
    if (fxBehavior === 'fail') {
      return { ok: false, status: 500, json: async () => ({ error: 'Provider outage' }) };
    }
    return { ok: true, status: 200, json: async () => ({ result: 'success', rates: { INR: 87.5 } }) };
  }
  if (u.includes('api.razorpay.com/v1/payments/')) {
    const paymentId = u.split('/payments/')[1];
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: paymentId,
        entity: 'payment',
        status: 'captured',
        order_id: lastRazorpayOrder?.id || 'order_STUB',
        amount: capturedPaymentOverride?.amount ?? lastRazorpayOrder?.amount ?? 1549900,
        currency: capturedPaymentOverride?.currency ?? lastRazorpayOrder?.currency ?? 'INR',
        method: capturedPaymentOverride?.method ?? 'card',
      }),
    };
  }
  if (u.includes('api.razorpay.com/v1/orders')) {
    const reqBody = JSON.parse(opts?.body || '{}');
    const orderObj = {
      id: `order_E2E_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount: reqBody.amount,
      currency: reqBody.currency,
      receipt: reqBody.receipt,
    };
    lastRazorpayOrder = orderObj;
    return {
      ok: true,
      status: 200,
      json: async () => orderObj,
    };
  }
  return realFetch ? realFetch(url, opts) : Promise.reject(new Error(`unexpected fetch: ${u}`));
};

const checkoutSig = (rzpOrderId, paymentId) =>
  crypto.createHmac('sha256', SECRET).update(`${rzpOrderId}|${paymentId}`).digest('hex');

// ── Database Fixtures ────────────────────────────────────────────────────────
const cleanup = async () => {
  const rx = new RegExp(`^${TAG}`, 'i');
  const prods = await Product.find({ name: rx }).select('_id');
  const ids = prods.map((p) => p._id);
  await VoucherCode.deleteMany({ productId: { $in: ids } });
  await Order.deleteMany({ 'customerSnapshot.email': rx });
  await Product.deleteMany({ _id: { $in: ids } });
  await User.deleteMany({ email: rx });
};

const main = async () => {
  console.log('\n======================================================');
  console.log('  CURRENCY DETECTION & PRICING E2E TEST SUITE');
  console.log('======================================================\n');

  await connectDB();
  await cleanup();

  _seedFxCache(87.5);

  const testUser = await User.create({
    name: 'Currency Tester',
    email: `${TAG}-user@apexvouchers.in`,
    passwordHash: 'hashed',
    role: 'user',
    status: 'active',
  });

  const product = await Product.create({
    name: `${TAG} PTE Voucher`,
    slug: `${TAG.toLowerCase()}-pte-${Date.now()}`,
    brand: 'Pearson',
    sellingPrice: 15499,
    originalPrice: 17000,
    validityMonths: 6,
    stockQuantity: 10,
    isActive: true,
  });

  await VoucherCode.create({
    productId: product._id,
    voucherType: 'PTE',
    code: `${TAG}-VOUCHER-1`,
    expiryDate: new Date(Date.now() + 60 * 86400000),
    status: 'AVAILABLE',
  });
  await VoucherCode.create({
    productId: product._id,
    voucherType: 'PTE',
    code: `${TAG}-VOUCHER-2`,
    expiryDate: new Date(Date.now() + 60 * 86400000),
    status: 'AVAILABLE',
  });

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('1. India -> INR -> ₹ -> correct INR price -> paise -> INR payment');
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const reqIndia = { headers: { 'cf-ipcountry': 'IN' } };
    const country = await getCustomerCountry(reqIndia);
    const currency = getDisplayCurrency(country);
    ok(country === 'IN', 'India header detected as country IN');
    ok(currency === 'INR', 'India country maps to INR');

    const formatted = formatMoney(15499, 'INR');
    ok(formatted.includes('₹') && formatted.includes('15,499'), 'INR format displays ₹ symbol and Indian thousands separator');

    // Display pricing dual hydration
    const resolver = await createDisplayPricingResolver({ displayCurrency: 'INR' });
    const pricing = resolver(product.sellingPrice, product.originalPrice);
    ok(pricing.currency === 'INR', 'Dual pricing active currency is INR');
    ok(pricing.displayPrice === 15499, 'INR display price is exact 15,499');
    ok(pricing.inr.displayPrice === 15499, 'Dual pricing inr object has 15,499');
    ok(pricing.usd.displayPrice === 177.13, 'Dual pricing usd object precomputed 177.13');

    // Create payment order from Indian IP
    const createRes = await run(createPaymentOrder, {
      user: testUser,
      headers: { 'cf-ipcountry': 'IN' },
      body: {
        items: [{ productId: String(product._id), quantity: 1 }],
        paymentMethod: 'upi',
        billing: { name: 'Indian User', email: `${TAG}-in@apexvouchers.in` },
      },
    });

    ok(!createRes.err && createRes.body?.success, 'Payment order created successfully for Indian customer');
    ok(createRes.body.currency === 'INR', 'Razorpay currency is INR');
    ok(createRes.body.amount === 1549900, 'Razorpay amount is in paise (1549900 paise = ₹15,499.00)');
    ok(lastRazorpayOrder?.amount === 1549900, 'Authoritative order submitted to Razorpay with paise');

    // Verify payment and check order saved currency
    capturedPaymentOverride = { order_id: createRes.body.razorpayOrderId, amount: 1549900, currency: 'INR', method: 'upi' };
    const paymentId = `pay_in${Date.now()}`;
    const sig = checkoutSig(createRes.body.razorpayOrderId, paymentId);
    const verifyRes = await run(verifyPayment, {
      user: testUser,
      headers: { 'cf-ipcountry': 'IN' },
      body: {
        orderId: createRes.body.orderId,
        razorpay_order_id: createRes.body.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: sig,
      },
    });

    ok(!verifyRes.err && verifyRes.body?.success, 'Payment verified successfully for Indian customer', verifyRes.err?.message || verifyRes.message || JSON.stringify(verifyRes));
    const dbOrder = await Order.findById(createRes.body.orderId);
    ok(dbOrder.currency === 'INR', 'Saved Order has currency INR');
    ok(dbOrder.total === 15499, 'Saved Order total is 15499 INR');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n2. USA -> USD -> $ -> correct USD price -> cents -> USD payment');
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const reqUS = { headers: { 'cf-ipcountry': 'US' } };
    const country = await getCustomerCountry(reqUS);
    const currency = getDisplayCurrency(country);
    ok(country === 'US', 'US header detected as country US');
    ok(currency === 'USD', 'US country maps to USD');

    // Converted price at rate 87.5: 15499 / 87.5 = 177.1314 -> $177.13
    const conv = convertInrToUsd(15499, 87.5);
    ok(conv.amount === 177.13, '₹15,499 converted at 87.5 gives exactly $177.13');
    ok(conv.minor === 17713, 'Cents correctly calculated as 17713 cents');

    const formatted = formatMoney(177.13, 'USD');
    ok(formatted.includes('$') && formatted.includes('177.13'), 'USD format displays $ symbol and cents ($177.13)');
    ok(!formatted.includes('15,499'), 'USD format NEVER includes raw INR 15,499 with $');

    // Create payment order from US IP
    const createRes = await run(createPaymentOrder, {
      user: testUser,
      headers: { 'cf-ipcountry': 'US' },
      body: {
        items: [{ productId: String(product._id), quantity: 1 }],
        paymentMethod: 'card',
        billing: { name: 'US User', email: `${TAG}-us@apexvouchers.in` },
      },
    });

    ok(!createRes.err && createRes.body?.success, 'Payment order created successfully for US customer');
    ok(createRes.body.currency === 'USD', 'Razorpay currency is USD');
    ok(createRes.body.amount === 17713, 'Razorpay amount is in cents (17713 cents = $177.13)');
    ok(createRes.body.total === 177.13, 'Returned order total is 177.13');
    ok(lastRazorpayOrder?.amount === 17713, 'Authoritative order submitted to Razorpay with 17713 cents');

    // Verify payment and check order saved currency
    capturedPaymentOverride = { order_id: createRes.body.razorpayOrderId, amount: 17713, currency: 'USD', method: 'card' };
    const paymentId = `pay_us${Date.now()}`;
    const sig = checkoutSig(createRes.body.razorpayOrderId, paymentId);
    const verifyRes = await run(verifyPayment, {
      user: testUser,
      headers: { 'cf-ipcountry': 'US' },
      body: {
        orderId: createRes.body.orderId,
        razorpay_order_id: createRes.body.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: sig,
      },
    });

    ok(!verifyRes.err && verifyRes.body?.success, 'Payment verified successfully for US customer', verifyRes.err?.message || verifyRes.message || JSON.stringify(verifyRes));
    const dbOrder = await Order.findById(createRes.body.orderId);
    ok(dbOrder.currency === 'USD', 'Saved Order has currency USD');
    ok(dbOrder.total === 177.13, 'Saved Order total is 177.13 USD');
    ok(dbOrder.baseAmountINR === 15499, 'Saved Order preserves baseAmountINR = 15499');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n3. International: UK / CA / AU / DE -> USD');
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const testCountries = [
      { code: 'GB', name: 'UK' },
      { code: 'CA', name: 'Canada' },
      { code: 'AU', name: 'Australia' },
      { code: 'DE', name: 'Germany' },
    ];

    for (const { code, name } of testCountries) {
      const country = await getCustomerCountry({ headers: { 'x-vercel-ip-country': code } });
      const currency = getDisplayCurrency(country);
      ok(country === code && currency === 'USD', `${name} (${code}) detected and mapped to USD`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n4. Client tampering attempt from US customer');
  // ─────────────────────────────────────────────────────────────────────────────
  {
    // US client attempts to pass { currency: 'INR', amount: 10, country: 'IN', price: 10 }
    const createTampered = await run(createPaymentOrder, {
      user: testUser,
      headers: { 'cf-ipcountry': 'US' },
      body: {
        items: [{ productId: String(product._id), quantity: 1 }],
        paymentMethod: 'card',
        billing: { name: 'Attacker', email: `${TAG}-hack@apexvouchers.in` },
        // Malicious injected parameters:
        currency: 'INR',
        amount: 10,
        price: 10,
        country: 'IN',
      },
    });

    ok(!createTampered.err && createTampered.body?.success, 'Order created despite tampered body params');
    ok(createTampered.body.currency === 'USD', 'Backend completely ignored body currency="INR" -> enforced USD');
    ok(createTampered.body.amount === 17713, 'Backend completely ignored body amount=10 -> enforced 17713 cents ($177.13)');
    ok(lastRazorpayOrder?.currency === 'USD' && lastRazorpayOrder?.amount === 17713, 'Gateway received USD with authoritative amount');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n5. IP detection failure (empty / unknown headers) -> safe fallback to INR');
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const reqEmpty = { headers: {} };
    const country = await getCustomerCountry(reqEmpty);
    const currency = getDisplayCurrency(country);
    ok(country === 'IN', 'Missing IP headers default to country IN');
    ok(currency === 'INR', 'Fallback country defaults to currency INR');

    const reqUnknown = { headers: { 'cf-ipcountry': 'XX' } };
    const countryUnknown = await getCustomerCountry(reqUnknown);
    const currencyUnknown = getDisplayCurrency(countryUnknown);
    ok(currencyUnknown === 'USD', 'Unknown non-IN country code defaults to international USD');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n6. FX provider failure -> fallback to fallback exchange rate');
  // ─────────────────────────────────────────────────────────────────────────────
  {
    _resetFxCache();
    fxBehavior = 'fail';

    const fx = await getFxRate();
    ok(!fx.ok && fx.reason === 'FX_PROVIDER_ERROR', `Provider failure gracefully returns error reason (${fx.reason})`);

    // With cache seeded, provider failure returns stale/fallback rate
    _seedFxCache(87.5);
    const fxFallback = await getFxRate();
    ok(fxFallback.ok && fxFallback.rate === 87.5, `With cache seeded, provider failure preserves fallback rate (${fxFallback.rate})`);

    fxBehavior = 'success';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n7. Stale FX cache recovery');
  // ─────────────────────────────────────────────────────────────────────────────
  {
    // Seed with an old rate (2 hours old > 15m TTL), and test provider refresh vs failure
    _seedFxCache(86.0, new Date(Date.now() - 2 * 3600 * 1000));
    fxBehavior = 'fail';
    const staleRate = await getFxRate();
    ok(staleRate.ok && staleRate.stale && staleRate.rate === 86.0, `Stale rate (86.0) preserved when live fetch fails`);

    fxBehavior = 'success';
    _resetFxCache();
    const fresh = await getFxRate();
    ok(fresh.ok && !fresh.stale && fresh.rate === 87.5, `Cache successfully refreshed when provider healthy: ${fresh.rate}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Clean up
  await cleanup();
  await mongoose.disconnect();

  console.log('\n======================================================');
  console.log(`  E2E TEST SUMMARY: ${pass} PASSED, ${fail} FAILED`);
  console.log('======================================================\n');

  if (fail > 0) {
    process.exit(1);
  }
};

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
