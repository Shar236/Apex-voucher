/**
 * Multi-currency (geo + live FX + Razorpay USD) regression suite.
 *
 * Covers:
 *   - INR base price is the source of truth; USD is derived via live FX rate.
 *   - Correct financial rounding in minor units (₹1,000 @ 80 → $12.50,
 *     @ 100 → $10.00, @ 90.25 → $11.08).
 *   - FX caching (TTL), stale-rate fallback, and safe failure.
 *   - Server-side country detection (IN → INR; US/GB/etc → USD; body-supplied
 *     country/currency/amount are IGNORED).
 *   - Razorpay order amounts in minor units (paise / cents).
 *   - Payment verification + webhook validation for USD orders.
 *   - Currency-aware admin revenue reporting.
 *
 *   node backend/tests/multiCurrency.test.js
 */
import dotenv from 'dotenv';
dotenv.config();

// Deterministic tests: disable outbound IP-geo lookups (headers + fallback
// only) and transactional email BEFORE config modules are imported.
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
const { generateOrderNo } = await import('../utils/index.js');
const { convertInrToUsd, getFxRate, _resetFxCache, _seedFxCache } = await import('../services/fx.js');
const { getCustomerCountry, getDisplayCurrency } = await import('../services/geo.js');
const { calculateRazorpayAmount, convertOrderTotals } = await import('../services/pricing.js');
const { formatMoney } = await import('../services/email.js');
const {
  createPaymentOrder,
  verifyPayment,
  handleRazorpayWebhook,
} = await import('../controllers/paymentController.js');
const { dashboardOverview } = await import('../controllers/adminController.js');

const SECRET = config.razorpay.keySecret || 'test_secret_fallback';
const WEBHOOK_SECRET = config.razorpay.webhookSecret || SECRET;
const TAG = 'TEST-FX';

let pass = 0;
let fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
};

// ── mock Express req/res ─────────────────────────────────────────────────────
const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const run = async (handler, { user, body = {}, params = {}, headers = {}, query = {}, rawBody } = {}) => {
  const res = mockRes();
  let nextErr = null;
  const req = { user, body, params, headers, query, rawBody };
  await handler(req, res, (err) => { nextErr = err || new Error('next() with no error'); });
  return { res, err: nextErr, status: nextErr?.statusCode || res.statusCode, code: nextErr?.code || res.body?.code, message: nextErr?.message || res.body?.message };
};

// ── HTTP stub: FX provider + Razorpay gateway ────────────────────────────────
const realFetch = global.fetch;
let fxProviderResponse = () => ({ ok: true, body: { result: 'success', rates: { INR: 87.5 } } });
let fxProviderCalls = 0;
let gatewayPaymentOverride = null;
let gatewayOrderPaymentsOverride = null;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('er-api.com') || u.includes('exchangerate') || u.includes('fx-provider.test')) {
    fxProviderCalls++;
    const r = fxProviderResponse();
    return { ok: r.ok, status: r.ok ? 200 : 500, json: async () => r.body };
  }
  if (/api\.razorpay\.com\/v1\/orders\/[^/]+\/payments/.test(u)) {
    const items = gatewayOrderPaymentsOverride || [];
    return { ok: true, status: 200, json: async () => ({ entity: 'collection', count: items.length, items }) };
  }
  if (u.includes('api.razorpay.com/v1/payments/')) {
    const paymentId = u.split('/payments/')[1];
    const payload = { id: paymentId, entity: 'payment', status: 'captured', order_id: 'order_STUB', amount: 100, currency: 'INR', method: 'card', ...(gatewayPaymentOverride || {}) };
    return { ok: true, status: 200, json: async () => payload };
  }
  if (u.includes('api.razorpay.com/v1/orders')) {
    let reqBody = {};
    try { reqBody = JSON.parse(opts?.body || '{}'); } catch {}
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: `order_STUB_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        amount: reqBody.amount ?? 0,
        currency: reqBody.currency || 'INR',
        receipt: reqBody.receipt || 'x',
      }),
    };
  }
  return realFetch ? realFetch(url, opts) : Promise.reject(new Error(`unexpected fetch: ${u}`));
};

const checkoutSig = (rzpOrderId, paymentId) =>
  crypto.createHmac('sha256', SECRET).update(`${rzpOrderId}|${paymentId}`).digest('hex');
const webhookSig = (rawBody) =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

// ── fixtures ─────────────────────────────────────────────────────────────────
const cleanup = async () => {
  const rx = new RegExp(`^${TAG}`, 'i');
  const prods = await Product.find({ name: new RegExp(`^${TAG}`, 'i') }).select('_id');
  const ids = prods.map((p) => p._id);
  await VoucherCode.deleteMany({ productId: { $in: ids } });
  await Order.deleteMany({ 'customerSnapshot.email': rx });
  await Product.deleteMany({ _id: { $in: ids } });
  await User.deleteMany({ email: rx });
};

let _n = 0;
const uniqRzpOrderId = () => `order_TESTFX_${Date.now()}_${++_n}`;

const makeFixtures = async () => {
  const user = await User.create({
    name: 'Fx Test', email: `${TAG}@apexvouchers.in`, passwordHash: 'x', role: 'user', status: 'active',
  });
  const admin = await User.create({
    name: 'Fx Admin', email: `${TAG}-ADMIN@apexvouchers.in`, passwordHash: 'x', role: 'admin', status: 'active',
  });
  const product = await Product.create({
    name: `${TAG} IELTS Voucher`, slug: `${TAG.toLowerCase()}-ielts-${Date.now()}`,
    brand: 'IELTS', provider: 'IDP', voucherType: 'IELTS', category: 'Exam Voucher',
    originalPrice: 15000, sellingPrice: 1000, active: true,
  });
  const expiry = new Date(Date.now() + 365 * 864e5);
  await VoucherCode.insertMany(
    Array.from({ length: 6 }).map((_, i) => ({
      code: `${TAG}-IELTS-${Date.now()}-${i}`, productId: product._id, voucherType: 'IELTS',
      status: 'AVAILABLE', expiryDate: expiry,
    }))
  );
  return { user, admin, product };
};

const makeUsdPendingOrder = async (user, product, rzpOrderId = uniqRzpOrderId()) => {
  // A USD order exactly as createPaymentOrder would persist it:
  // ₹1,000 base @ 87.42 → $11.43 charged (1143 cents).
  return Order.create({
    orderNo: generateOrderNo(), userId: user._id,
    items: [{
      productId: product._id, productName: product.name, voucherType: 'IELTS', brand: 'IELTS',
      unitPrice: product.sellingPrice, originalPrice: product.originalPrice, quantity: 1,
    }],
    subtotal: 11.43, discountAmount: 0, tax: 0, total: 11.43,
    currency: 'USD',
    baseSubtotalINR: 1000, baseDiscountINR: 0, baseAmountINR: 1000,
    fxRateUsed: 87.42, fxRateTimestamp: new Date(), fxRateSource: 'fx-provider.test',
    countryCode: 'US',
    paymentStatus: 'PENDING', orderStatus: 'PAYMENT_PENDING', fulfillmentStatus: 'PENDING',
    paymentProvider: 'razorpay', razorpayOrderId: rzpOrderId, paymentMethod: 'card',
    customerSnapshot: { email: `${TAG}@apexvouchers.in`, name: 'Fx Test' },
  });
};

const vouchersFor = (orderId) => VoucherCode.countDocuments({ orderId, status: { $in: ['SOLD', 'ASSIGNED', 'USED'] } });

// ── tests ────────────────────────────────────────────────────────────────────
const main = async () => {
  await connectDB();
  await cleanup();
  const { user, admin, product } = await makeFixtures();
  const productId = product._id.toString();

  console.log('\n=== MULTI-CURRENCY (GEO + FX + RAZORPAY USD) SUITE ===\n');

  // ── 1. FX conversion math (requirement #8, #35) ───────────────────────────
  console.log('— FX conversion & rounding —');
  {
    const r = convertInrToUsd(1000, 80);
    ok(r.minor === 1250 && r.amount === 12.5, '₹1,000 @ 80 → $12.50 (1250 cents)', JSON.stringify(r));

    const r2 = convertInrToUsd(1000, 100);
    ok(r2.minor === 1000 && r2.amount === 10, '₹1,000 @ 100 → $10.00 (1000 cents)', JSON.stringify(r2));

    const r3 = convertInrToUsd(1000, 90.25);
    ok(r3.minor === 1108 && r3.amount === 11.08, '₹1,000 @ 90.25 → $11.08 (1108 cents, half-up)', JSON.stringify(r3));

    const r4 = convertInrToUsd(1000, 87.5);
    ok(r4.minor === 1143 && r4.amount === 11.43, '₹1,000 @ 87.50 → $11.43 (1143 cents)', JSON.stringify(r4));

    // Rounding is done ONCE in minor units, never via float display math.
    const r5 = convertInrToUsd(0.1 + 0.2, 1); // float-dust input
    ok(Number.isInteger(r5.minor), 'conversion always yields integer minor units', JSON.stringify(r5));

    // Explicit (non-hidden) markup policy: 2% buffer on ₹1,000 @ 87.5 → $11.66
    const r6 = convertInrToUsd(1000, 87.5, 2);
    ok(r6.minor === 1166, '2% explicit markup: ₹1,000 @ 87.5 → $11.66', JSON.stringify(r6));

    ok(calculateRazorpayAmount(1000, 'INR') === 100000, 'Razorpay INR amount: ₹1,000 → 100000 paise');
    ok(calculateRazorpayAmount(11.43, 'USD') === 1143, 'Razorpay USD amount: $11.43 → 1143 cents');
  }

  // ── 2. Country detection (requirement #2, #34) ────────────────────────────
  console.log('— Country / currency detection —');
  {
    ok((await getCustomerCountry({ headers: { 'cf-ipcountry': 'IN' } })) === 'IN', 'Cloudflare header IN → IN');
    ok((await getCustomerCountry({ headers: { 'x-vercel-ip-country': 'US' } })) === 'US', 'Vercel header US → US');
    ok((await getCustomerCountry({ headers: { 'cf-ipcountry': 'GB' } })) === 'GB', 'Cloudflare header GB → GB');
    ok((await getCustomerCountry({ headers: {} })) === config.geo.fallbackCountry, 'no headers → safe fallback country');
    ok(getDisplayCurrency('IN') === 'INR', 'IN → INR');
    for (const c of ['US', 'GB', 'CA', 'AU', 'AE']) {
      ok(getDisplayCurrency(c) === 'USD', `${c} → USD (no local currency introduced)`);
    }
  }

  // ── 3. FX cache, stale fallback, failure (requirement #5, #6, #7, #32) ────
  console.log('— FX cache & failure handling —');
  {
    _resetFxCache();
    fxProviderCalls = 0;
    fxProviderResponse = () => ({ ok: true, body: { rates: { INR: 87.42 } } });

    _seedFxCache(80);
    const fresh = await getFxRate();
    ok(fresh.ok && fresh.rate === 80 && fxProviderCalls === 0, 'fresh cached rate served with zero provider calls');

    _seedFxCache(80, new Date(Date.now() - 2 * 3600 * 1000)); // 2h old > 15min TTL
    const refreshed = await getFxRate();
    ok(refreshed.ok && refreshed.rate === 87.42 && fxProviderCalls === 1, 'expired cache refreshed from provider', JSON.stringify({ rate: refreshed.rate, calls: fxProviderCalls }));

    fxProviderResponse = () => ({ ok: false, body: {} });
    _seedFxCache(87.42, new Date(Date.now() - 3600 * 1000)); // 1h old < 6h max age
    const stale = await getFxRate();
    ok(stale.ok && stale.stale === true && stale.rate === 87.42, 'provider down → last valid cached rate used (stale, within max age)', JSON.stringify(stale));

    _seedFxCache(87.42, new Date(Date.now() - 7 * 3600 * 1000)); // 7h > 6h max age
    const dead = await getFxRate();
    ok(!dead.ok, 'provider down + cache beyond max age → refuse (no fake rate)');

    fxProviderResponse = () => ({ ok: true, body: { rates: { INR: 5 } } });
    _resetFxCache();
    const invalid = await getFxRate();
    ok(!invalid.ok, 'implausible rate (5) rejected — never cached/shown');
  }

  // ── 4. createPaymentOrder currency decisions (requirement #3, #4, #15) ────
  console.log('— Order creation: currency & amount (server-authoritative) —');
  {
    fxProviderResponse = () => ({ ok: true, body: { rates: { INR: 87.5 } } });
    _resetFxCache();
    const { res, err } = await run(createPaymentOrder, {
      user,
      headers: { 'cf-ipcountry': 'US' },
      body: {
        items: [{ productId, quantity: 1 }],
        // attacker-supplied pricing/currency fields MUST be ignored:
        currency: 'INR', amount: 1, country: 'IN', total: 1, price: 1, exchangeRate: 1,
      },
    });
    const usdOrder = res.body?.orderId ? await Order.findById(res.body.orderId) : null;
    ok(!err && res.body?.success, 'US customer → order created');
    ok(res.body?.currency === 'USD', 'US customer → Razorpay currency USD (body "currency: INR" ignored)');
    ok(res.body?.amount === 1143, 'US customer → Razorpay amount 1143 cents (body "amount: 1" ignored)', `got ${res.body?.amount}`);
    ok(usdOrder?.total === 11.43 && usdOrder?.currency === 'USD', 'order stores $11.43 USD total');
    ok(usdOrder?.baseAmountINR === 1000 && usdOrder?.baseSubtotalINR === 1000, 'order preserves canonical ₹1,000 base amounts');
    ok(usdOrder?.fxRateUsed === 87.5 && !!usdOrder?.fxRateTimestamp, 'order records fxRateUsed + timestamp');
    ok(usdOrder?.countryCode === 'US', 'order records server-detected country US (body "country: IN" ignored)');
    ok(usdOrder?.paymentMethod === 'card', 'international order → card payment method (UPI is India-only)');

    fxProviderCalls = 0;
    const inRes = await run(createPaymentOrder, {
      user,
      headers: { 'cf-ipcountry': 'IN' },
      body: { items: [{ productId, quantity: 1 }] },
    });
    const inOrder = inRes.res.body?.orderId ? await Order.findById(inRes.res.body.orderId) : null;
    ok(!inRes.err && inRes.res.body?.currency === 'INR' && inRes.res.body?.amount === 100000, 'IN customer → ₹1,000 → 100000 paise INR (unchanged)');
    ok(fxProviderCalls === 0, 'IN customer → zero FX provider calls');
    ok(inOrder?.currency === 'INR' && inOrder?.fxRateUsed == null && inOrder?.baseAmountINR == null, 'INR order has no FX metadata');
    ok(inOrder?.paymentMethod === 'upi', 'INR order keeps UPI payment method');

    _resetFxCache();
    const gbRes = await run(createPaymentOrder, {
      user,
      headers: { 'x-vercel-ip-country': 'GB' },
      body: { items: [{ productId, quantity: 1 }] },
    });
    ok(!gbRes.err && gbRes.res.body?.currency === 'USD' && gbRes.res.body?.amount === 1143, 'GB customer → USD 1143 cents');

    _resetFxCache();
    fxProviderResponse = () => ({ ok: false, body: {} });
    const failRes = await run(createPaymentOrder, {
      user,
      headers: { 'cf-ipcountry': 'US' },
      body: { items: [{ productId, quantity: 1 }] },
    });
    ok(!!failRes.err && failRes.code === 'FX_UNAVAILABLE' && /temporarily unavailable/i.test(failRes.message || ''), 'FX unavailable → USD order refused with controlled error');
    const inRes2 = await run(createPaymentOrder, {
      user,
      headers: { 'cf-ipcountry': 'IN' },
      body: { items: [{ productId, quantity: 1 }] },
    });
    ok(!inRes2.err && inRes2.res.body?.currency === 'INR', 'FX unavailable → India INR purchases still work');

    _resetFxCache();
    fxProviderResponse = () => ({ ok: true, body: { rates: { INR: 87.5 } } });
    const inTotals = await convertOrderTotals({ subtotal: 1000, discountAmount: 100, total: 900 }, 'INR');
    ok(inTotals.currency === 'INR' && inTotals.total === 900 && inTotals.fxRateUsed == null, 'INR totals pass through untouched');
    const usdTotals = await convertOrderTotals({ subtotal: 1000, discountAmount: 100, total: 900 }, 'USD');
    ok(usdTotals.currency === 'USD' && calculateRazorpayAmount(usdTotals.total, 'USD') === 1029, 'USD totals: ₹900 @ 87.5 → $10.29 (1029 cents)', JSON.stringify(usdTotals));
  }

  // ── 5. USD payment verification (requirement #16) ─────────────────────────
  console.log('— USD payment verification —');
  {
    // Correct USD capture → verified + voucher allocated.
    const order1 = await makeUsdPendingOrder(user, product);
    gatewayPaymentOverride = { id: 'pay_USDOK1', status: 'captured', order_id: order1.razorpayOrderId, amount: 1143, currency: 'USD', method: 'card' };
    const okVerify = await run(verifyPayment, {
      user,
      body: {
        orderId: order1._id.toString(),
        razorpay_order_id: order1.razorpayOrderId,
        razorpay_payment_id: 'pay_USDOK1',
        razorpay_signature: checkoutSig(order1.razorpayOrderId, 'pay_USDOK1'),
      },
    });
    const fresh1 = await Order.findById(order1._id);
    ok(!okVerify.err && fresh1.paymentStatus === 'PAID', 'USD 1143c captured → verified PAID', okVerify.err?.message || okVerify.err || `status=${fresh1.paymentStatus}/${fresh1.orderStatus}`);
    ok((await vouchersFor(order1._id)) === 1, 'USD verified payment → voucher allocated (same fulfillment path as INR)');

    // Wrong amount ($1.00 = 100 cents instead of 1143) → rejected.
    const order2 = await makeUsdPendingOrder(user, product);
    gatewayPaymentOverride = { id: 'pay_USDSMALL', status: 'captured', order_id: order2.razorpayOrderId, amount: 100, currency: 'USD' };
    const small = await run(verifyPayment, {
      user,
      body: {
        orderId: order2._id.toString(),
        razorpay_order_id: order2.razorpayOrderId,
        razorpay_payment_id: 'pay_USDSMALL',
        razorpay_signature: checkoutSig(order2.razorpayOrderId, 'pay_USDSMALL'),
      },
    });
    ok(!!small.err && small.code === 'PAYMENT_NOT_VERIFIED', 'USD 100c captured vs 1143c expected → rejected (PAYMENT_NOT_VERIFIED)', small.err?.message || `code=${small.code}`);
    ok((await Order.findById(order2._id)).paymentStatus === 'PENDING', 'amount-mismatch order stays PENDING');

    // Wrong currency (INR payment against USD order) → rejected.
    const order3 = await makeUsdPendingOrder(user, product);
    gatewayPaymentOverride = { id: 'pay_CURMIX', status: 'captured', order_id: order3.razorpayOrderId, amount: 1143, currency: 'INR' };
    const curMix = await run(verifyPayment, {
      user,
      body: {
        orderId: order3._id.toString(),
        razorpay_order_id: order3.razorpayOrderId,
        razorpay_payment_id: 'pay_CURMIX',
        razorpay_signature: checkoutSig(order3.razorpayOrderId, 'pay_CURMIX'),
      },
    });
    ok(!!curMix.err && curMix.code === 'PAYMENT_NOT_VERIFIED', 'INR payment vs USD order → rejected (currency mismatch)', curMix.err?.message || `code=${curMix.code}`);
    ok((await Order.findById(order3._id)).paymentStatus === 'PENDING', 'currency-mismatch order stays PENDING');
  }

  // ── 6. USD webhook (requirement #18) ──────────────────────────────────────
  console.log('— USD webhook handling —');
  {
    const order = await makeUsdPendingOrder(user, product);
    const bodyObj = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_WH_USD', order_id: order.razorpayOrderId, amount: 1143, currency: 'USD', status: 'captured' } } },
    };
    const raw = JSON.stringify(bodyObj);
    const wh = await run(handleRazorpayWebhook, {
      body: bodyObj,
      headers: { 'x-razorpay-signature': webhookSig(raw), 'x-razorpay-event-id': 'evt_USD_1' },
      rawBody: raw,
    });
    const fresh = await Order.findById(order._id);
    ok(!wh.err && fresh.paymentStatus === 'PAID', 'USD captured webhook → fulfilled');
    ok((await vouchersFor(order._id)) === 1, 'USD webhook → exactly one voucher allocated');

    const dup = await run(handleRazorpayWebhook, {
      body: bodyObj,
      headers: { 'x-razorpay-signature': webhookSig(raw), 'x-razorpay-event-id': 'evt_USD_1' },
      rawBody: raw,
    });
    ok(!dup.err && dup.res.body?.message === 'Duplicate event ignored', 'duplicate webhook event ignored (processedEventIds intact)');
    ok((await vouchersFor(order._id)) === 1, 'duplicate webhook → still exactly one voucher');

    const order2 = await makeUsdPendingOrder(user, product);
    const badBody = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_WH_BAD', order_id: order2.razorpayOrderId, amount: 100, currency: 'USD', status: 'captured' } } },
    };
    const badRaw = JSON.stringify(badBody);
    await run(handleRazorpayWebhook, {
      body: badBody,
      headers: { 'x-razorpay-signature': webhookSig(badRaw), 'x-razorpay-event-id': 'evt_USD_2' },
      rawBody: badRaw,
    });
    ok((await Order.findById(order2._id)).paymentStatus === 'PENDING', 'webhook amount mismatch (100c vs 1143c) → not fulfilled');
  }

  // ── 7. Currency-aware admin reporting (requirement #31) ───────────────────
  console.log('— Admin revenue reporting (per-currency) —');
  {
    await Order.create({
      orderNo: generateOrderNo(), userId: user._id,
      items: [{ productId: product._id, productName: product.name, voucherType: 'IELTS', brand: 'IELTS', unitPrice: 1000, originalPrice: 1500, quantity: 1 }],
      subtotal: 1000, discountAmount: 0, tax: 0, total: 1000, currency: 'INR',
      paymentStatus: 'PAID', orderStatus: 'FULFILLED', fulfillmentStatus: 'FULFILLED',
      customerSnapshot: { email: `${TAG}@apexvouchers.in`, name: 'Fx Test' },
    });
    await Order.create({
      orderNo: generateOrderNo(), userId: user._id,
      items: [{ productId: product._id, productName: product.name, voucherType: 'IELTS', brand: 'IELTS', unitPrice: 1000, originalPrice: 1500, quantity: 1 }],
      subtotal: 11.43, discountAmount: 0, tax: 0, total: 11.43, currency: 'USD',
      baseAmountINR: 1000, fxRateUsed: 87.42, countryCode: 'US',
      paymentStatus: 'PAID', orderStatus: 'FULFILLED', fulfillmentStatus: 'FULFILLED',
      customerSnapshot: { email: `${TAG}@apexvouchers.in`, name: 'Fx Test' },
    });

    const dash = await run(dashboardOverview, { user: admin, query: { period: '30d' } });
    const kpi = dash.res.body?.data?.kpi || {};
    const byCur = kpi.revenueByCurrency || {};
    ok(byCur.INR >= 1000, `revenueByCurrency.INR ≥ ₹1,000 (got ${byCur.INR})`);
    ok(byCur.USD >= 11.43, `revenueByCurrency.USD ≥ $11.43 (got ${byCur.USD})`);
    ok(kpi.todayRevenue >= 1000, 'headline revenue is INR-based (not mixed with USD)');
  }

  // ── 8. Email money formatting (requirement #29) ───────────────────────────
  console.log('— Email money formatting —');
  {
    ok(formatMoney(1000, 'INR') === '₹1,000 INR', 'formatMoney INR → "₹1,000 INR"', formatMoney(1000, 'INR'));
    ok(formatMoney(11.43, 'USD') === '$11.43 USD', 'formatMoney USD → "$11.43 USD"', formatMoney(11.43, 'USD'));
    ok(formatMoney(11.43, 'USD').includes('USD'), 'USD emails state the charged currency explicitly');
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  await cleanup();
  await mongoose.connection.close();
  process.exit(fail ? 1 : 0);
};

main().catch(async (err) => {
  console.error('SUITE ERROR:', err);
  await cleanup().catch(() => {});
  process.exit(1);
});

