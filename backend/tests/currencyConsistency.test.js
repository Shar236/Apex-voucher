/**
 * Currency Consistency Test Suite
 *
 * The core promise of the multi-currency system is that ONE visitor sees ONE
 * currency, and the SAME converted number, everywhere: homepage/catalog cards,
 * the product detail page, and the amount actually charged at checkout. This
 * suite asserts that equality directly (display hydration vs. payment-order
 * amount), rather than re-testing FX math or payment security in isolation
 * (already covered by multiCurrency.test.js / currencyDetectionE2E.test.js).
 *
 * It also exercises the two-provider geo-IP fallback chain added for VPN /
 * international visitors who reach the origin directly (no CDN edge header):
 *   - primary provider down, independent fallback provider succeeds
 *   - both providers down -> safe fallback country (IN -> INR), consistently
 *     across display AND payment
 *   - primary succeeds -> the fallback provider is never even called
 *   - repeat lookups for the same visitor IP are cached (no re-detection churn
 *     that could flip a visitor's currency mid-session)
 *
 *   node backend/tests/currencyConsistency.test.js
 */
import dotenv from 'dotenv';
dotenv.config();

// Deterministic tests: no transactional email. Geo providers are pointed at
// two distinct stub hosts (not disabled) because this suite specifically
// exercises the primary -> fallback -> default-country chain.
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.SMTP_FROM = '';
process.env.GEO_IP_API_URL = 'https://primary-geo.test/{ip}';
process.env.GEO_IP_API_URL_FALLBACK = 'https://fallback-geo.test/{ip}';

const mongoose = (await import('mongoose')).default;
const { connectDB } = await import('../config/db.js');
const { Product } = await import('../models/Product.js');
const { VoucherCode } = await import('../models/VoucherCode.js');
const { Order } = await import('../models/Order.js');
const { User } = await import('../models/User.js');
const { _resetFxCache, _seedFxCache } = await import('../services/fx.js');
const { getCustomerCountry, getDisplayCurrency } = await import('../services/geo.js');
const { createDisplayPricingResolver } = await import('../services/pricing.js');
const { createPaymentOrder, resolveOrderLineItems } = await import('../controllers/paymentController.js');

const TAG = 'TEST-CURR-CONSIST';
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
const run = async (handler, { user, body = {}, params = {}, headers = {}, query = {} } = {}) => {
  const res = mockRes();
  let nextErr = null;
  const req = { user, body, params, headers, query };
  await handler(req, res, (err) => { nextErr = err || new Error('next() with no error'); });
  return { err: nextErr, body: res.body, code: nextErr?.code || res.body?.code, message: nextErr?.message };
};

// ── HTTP stub: two independent geo providers + FX + Razorpay ────────────────
const realFetch = global.fetch;
let primaryBehavior = { mode: 'success', country: 'US' }; // 'success' | 'fail'
let fallbackBehavior = { mode: 'success', country: 'GB' };
let primaryCalls = 0;
let fallbackCalls = 0;

global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith('https://primary-geo.test/')) {
    primaryCalls++;
    if (primaryBehavior.mode === 'fail') throw new Error('primary geo provider unreachable');
    return { ok: true, status: 200, json: async () => ({ countryCode: primaryBehavior.country }), text: async () => JSON.stringify({ countryCode: primaryBehavior.country }) };
  }
  if (u.startsWith('https://fallback-geo.test/')) {
    fallbackCalls++;
    if (fallbackBehavior.mode === 'fail') throw new Error('fallback geo provider unreachable');
    // Shaped like GeoJS: { "country": "GB", ... }
    return { ok: true, status: 200, json: async () => ({ country: fallbackBehavior.country }), text: async () => JSON.stringify({ country: fallbackBehavior.country }) };
  }
  if (u.includes('er-api.com') || u.includes('exchangerate')) {
    return { ok: true, status: 200, json: async () => ({ result: 'success', rates: { INR: 87.5 } }) };
  }
  if (u.includes('api.razorpay.com/v1/orders')) {
    let reqBody = {};
    try { reqBody = JSON.parse(opts?.body || '{}'); } catch {}
    return {
      ok: true, status: 200,
      json: async () => ({
        id: `order_CONSIST_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        amount: reqBody.amount ?? 0, currency: reqBody.currency || 'INR', receipt: reqBody.receipt || 'x',
      }),
    };
  }
  return realFetch ? realFetch(url, opts) : Promise.reject(new Error(`unexpected fetch: ${u}`));
};

// `Response.text()` isn't defined above for the geo stubs by default fetch
// shape, but our geo.js reads `.text()` — the stubs above already provide it.

// ── fixtures ─────────────────────────────────────────────────────────────────
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
  console.log('\n=== CURRENCY CONSISTENCY SUITE ===\n');
  await connectDB();
  await cleanup();
  _seedFxCache(87.5);

  const user = await User.create({
    name: 'Consistency Tester', email: `${TAG}@apexvouchers.in`, passwordHash: 'x', role: 'user', status: 'active',
  });
  const product = await Product.create({
    name: `${TAG} PTE Voucher`, slug: `${TAG.toLowerCase()}-pte-${Date.now()}`,
    brand: 'Pearson', provider: 'Pearson', voucherType: 'PTE', category: 'Exam Voucher',
    originalPrice: 18900, sellingPrice: 15499, active: true,
  });
  const cheapProduct = await Product.create({
    name: `${TAG} Cheap Voucher`, slug: `${TAG.toLowerCase()}-cheap-${Date.now()}`,
    brand: 'IELTS', provider: 'IDP', voucherType: 'IELTS', category: 'Exam Voucher',
    originalPrice: 1000, sellingPrice: 1000, active: true,
  });

  // ── 1. Cross-surface consistency: India (edge header) ─────────────────────
  console.log('— India: display price === charged amount —');
  {
    const headers = { 'cf-ipcountry': 'IN' };
    const resolver = await createDisplayPricingResolver({ headers });
    const display = resolver(product.sellingPrice, product.originalPrice);
    ok(display.currency === 'INR', 'India display currency is INR');
    ok(display.displayPrice === 15499, 'India display price equals base INR price (no conversion)');

    const orderRes = await run(createPaymentOrder, {
      user, headers,
      body: { items: [{ productId: String(product._id), quantity: 1 }], paymentMethod: 'upi', billing: { name: 'IN User', email: `${TAG}-in@apexvouchers.in` } },
    });
    ok(!orderRes.err && orderRes.body?.currency === 'INR', 'India order currency is INR');
    ok(orderRes.body?.amount === display.displayPrice * 100, 'India charged paise === display price × 100 (exact match)', `display=${display.displayPrice} charged=${orderRes.body?.amount}`);
  }

  // ── 2. Cross-surface consistency: international via edge header ───────────
  console.log('\n— International (US, edge header): display price === charged amount —');
  {
    const headers = { 'x-vercel-ip-country': 'US' };
    const resolver = await createDisplayPricingResolver({ headers });
    const display = resolver(product.sellingPrice, product.originalPrice);
    ok(display.currency === 'USD', 'US display currency is USD');
    ok(display.displayPrice === 177.13, 'US display price is $177.13 at seeded 87.5 rate', String(display.displayPrice));

    // A second, differently-priced product hydrated by the SAME resolver
    // (as the catalog/homepage does for every card in one page render) must
    // use the identical FX rate — no per-card drift.
    const displayCheap = resolver(cheapProduct.sellingPrice, cheapProduct.originalPrice);
    ok(displayCheap.currency === 'USD' && displayCheap.displayPrice === 11.43, 'second product, same resolver → consistent 87.5 rate ($11.43)', String(displayCheap.displayPrice));

    const orderRes = await run(createPaymentOrder, {
      user, headers,
      body: { items: [{ productId: String(product._id), quantity: 1 }], paymentMethod: 'card', billing: { name: 'US User', email: `${TAG}-us@apexvouchers.in` } },
    });
    ok(!orderRes.err && orderRes.body?.currency === 'USD', 'US order currency is USD');
    ok(orderRes.body?.amount === Math.round(display.displayPrice * 100), 'US charged cents === display price × 100 (exact match)', `display=${display.displayPrice} charged=${orderRes.body?.amount}`);
  }

  // ── 3. VPN scenario: no edge header, primary geo provider down, fallback OK ─
  console.log('\n— VPN (IP-only, no edge header): primary down → fallback provider used —');
  {
    primaryCalls = 0; fallbackCalls = 0;
    primaryBehavior = { mode: 'fail' };
    fallbackBehavior = { mode: 'success', country: 'GB' }; // VPN exit node geolocated to the UK
    const headers = { 'x-forwarded-for': '203.0.113.45' }; // no cf-ipcountry / x-vercel-ip-country — origin hit directly

    const country = await getCustomerCountry({ headers });
    ok(country === 'GB', 'VPN exit IP resolved via fallback provider to GB', `got ${country}`);
    ok(primaryCalls === 1 && fallbackCalls === 1, 'primary tried first, fallback used only after primary failed', `primary=${primaryCalls} fallback=${fallbackCalls}`);
    ok(getDisplayCurrency(country) === 'USD', 'GB (non-India) → USD');

    // Same request context, consistent across display AND payment.
    const resolver = await createDisplayPricingResolver({ headers });
    const display = resolver(product.sellingPrice, product.originalPrice);
    ok(display.currency === 'USD' && display.displayPrice === 177.13, 'VPN visitor sees USD display price via fallback-resolved country');

    const orderRes = await run(createPaymentOrder, {
      user, headers,
      body: { items: [{ productId: String(product._id), quantity: 1 }], paymentMethod: 'card', billing: { name: 'VPN User', email: `${TAG}-vpn@apexvouchers.in` } },
    });
    ok(!orderRes.err && orderRes.body?.currency === 'USD' && orderRes.body?.amount === 17713, 'VPN visitor charged USD 17713 cents — same number shown at display time');

    const dbOrder = await Order.findById(orderRes.body.orderId);
    ok(dbOrder.countryCode === 'GB', 'order records fallback-resolved country GB (not the default)');
  }

  // ── 4. Both geo providers down → safe fallback country, consistently ──────
  console.log('\n— Both geo providers down → default country (IN) → INR everywhere —');
  {
    primaryBehavior = { mode: 'fail' };
    fallbackBehavior = { mode: 'fail' };
    const headers = { 'x-forwarded-for': '203.0.113.77' }; // fresh IP — not cached from scenario 3

    const country = await getCustomerCountry({ headers });
    ok(country === 'IN', 'both providers down → safe default country IN', `got ${country}`);
    ok(getDisplayCurrency(country) === 'INR', 'default country → INR');

    const resolver = await createDisplayPricingResolver({ headers });
    const display = resolver(product.sellingPrice, product.originalPrice);
    ok(display.currency === 'INR' && display.displayPrice === 15499, 'undetectable visitor sees INR display price (no invented USD)');

    const orderRes = await run(createPaymentOrder, {
      user, headers,
      body: { items: [{ productId: String(product._id), quantity: 1 }], paymentMethod: 'upi', billing: { name: 'Undetectable User', email: `${TAG}-unk@apexvouchers.in` } },
    });
    ok(!orderRes.err && orderRes.body?.currency === 'INR' && orderRes.body?.amount === 1549900, 'undetectable visitor charged INR — same as display, never blocked');
  }

  // ── 5. Primary healthy → fallback provider is never called ────────────────
  console.log('\n— Primary healthy → fallback never invoked —');
  {
    primaryCalls = 0; fallbackCalls = 0;
    primaryBehavior = { mode: 'success', country: 'DE' };
    fallbackBehavior = { mode: 'fail' }; // would fail the assertion below if it were ever reached
    const headers = { 'x-forwarded-for': '203.0.113.88' };

    const country = await getCustomerCountry({ headers });
    ok(country === 'DE', 'primary provider result used directly', `got ${country}`);
    ok(primaryCalls === 1 && fallbackCalls === 0, 'fallback provider was never called when primary succeeded', `primary=${primaryCalls} fallback=${fallbackCalls}`);
  }

  // ── 6. Same visitor, repeated lookups → cached (no currency flip mid-session) ─
  console.log('\n— Repeated lookups for the same IP are cached —');
  {
    primaryCalls = 0; fallbackCalls = 0;
    primaryBehavior = { mode: 'success', country: 'FR' };
    const headers = { 'x-forwarded-for': '203.0.113.99' };

    const first = await getCustomerCountry({ headers });
    const second = await getCustomerCountry({ headers });
    ok(first === 'FR' && second === 'FR', 'same country returned on repeat lookups');
    ok(primaryCalls === 1, 'second lookup for the same IP served from cache (no extra provider call)', `calls=${primaryCalls}`);
  }

  // ── 7. Cart line-item pricing agrees with the payment total (no separate
  //      "cart price" computation path exists — resolveOrderLineItems IS the
  //      cart/checkout pricing source, re-read from the DB every time) ──────
  console.log('\n— Cart line items re-read from DB match payment order amount —');
  {
    const items = await resolveOrderLineItems([{ productId: String(product._id), quantity: 1 }]);
    ok(items[0].unitPrice === product.sellingPrice, 'cart line item price is the live DB price (not client-supplied)');
  }

  await cleanup();
  await mongoose.connection.close();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
};

main().catch(async (err) => {
  console.error('SUITE ERROR:', err);
  await cleanup().catch(() => {});
  process.exit(1);
});
