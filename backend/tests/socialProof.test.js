/**
 * Social-proof "recent purchase" notification suite.
 *
 * Covers:
 *   1.  A genuinely PAID + allocated order records a PurchaseEvent (voucherIssued: true).
 *   2.  Non-PAID orders (PENDING / FAILED / CANCELLED / REFUNDED) record NOTHING.
 *   3.  An out-of-stock paid order records voucherIssued: false; a later manual
 *       delivery flips it to true WITHOUT a second broadcast.
 *   4.  Recording is idempotent — one row, one broadcast, per order.
 *   5.  SSE hub: a connected client receives a live event; a client that
 *       connects AFTER the event (no Last-Event-ID) receives nothing; a
 *       reconnecting client (Last-Event-ID) is replayed only the gap.
 *   6.  The public broadcast payload contains NO voucher code, email, phone,
 *       order number or amount.
 *   7.  safeFirstName() only ever yields a clean first name (or null).
 *
 * Runs against the configured MongoDB. Only creates "TEST-SP" data and cleans
 * up afterwards. SMTP is force-disabled before any app module loads.
 *
 *   node backend/tests/socialProof.test.js
 */
import dotenv from 'dotenv';
dotenv.config();

process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.SMTP_FROM = '';

const { EventEmitter } = await import('node:events');
const mongoose = (await import('mongoose')).default;
const { connectDB } = await import('../config/db.js');
const { config } = await import('../config/index.js');
const { Product } = await import('../models/Product.js');
const { VoucherCode } = await import('../models/VoucherCode.js');
const { Order } = await import('../models/Order.js');
const { User } = await import('../models/User.js');
const { PurchaseEvent } = await import('../models/PurchaseEvent.js');
const {
  recordPurchaseEvent,
  markPurchaseEventIssued,
  safeFirstName,
  buildPurchaseMessage,
} = await import('../services/purchaseProof.js');
const { sseHandler, publish, realtimeStats, __resetRealtimeHub } = await import('../services/realtimeHub.js');

let pass = 0;
let fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { console.log(`  ✅ ${name}`); pass += 1; }
  else { console.error(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); fail += 1; }
};

const TAG = 'TEST-SP';

// ── Mock SSE client ─────────────────────────────────────────────────────────
let ipCounter = 0;
const makeClient = (headers = {}) => {
  const req = new EventEmitter();
  req.ip = `10.9.9.${++ipCounter}`;
  req.socket = { remoteAddress: req.ip, setKeepAlive() {} };
  req.headers = headers;
  req.query = {};
  const writes = [];
  const res = {
    statusCode: 200,
    setHeader() {},
    flushHeaders() {},
    setTimeout() {},
    write(s) { writes.push(String(s)); return true; },
    end() {},
    on() {},
    status(c) { this.statusCode = c; return this; },
  };
  const purchases = () => {
    const out = [];
    for (const chunk of writes.join('').split('\n\n')) {
      if (!chunk.includes('event: purchase')) continue;
      const i = chunk.indexOf('data: ');
      if (i === -1) continue;
      try { out.push(JSON.parse(chunk.slice(i + 6))); } catch { /* ignore */ }
    }
    return out;
  };
  return { req, res, writes, purchases };
};
const connect = (headers) => {
  const c = makeClient(headers);
  sseHandler('social-proof')(c.req, c.res);
  return c;
};

const makeProduct = (n) => Product.create({
  name: `${TAG} ${n}`,
  slug: `${TAG.toLowerCase()}-${n}-${Date.now()}`,
  brand: 'PTE', provider: 'Pearson PTE', voucherType: 'PTE', category: 'Exam Voucher',
  originalPrice: 15000, sellingPrice: 12000, active: true, stockType: 'LIMITED',
});
const makeOrder = (user, product, over = {}) => Order.create({
  orderNo: `${TAG}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
  userId: user._id,
  items: [{
    productId: product._id, productName: product.name, voucherType: 'PTE', brand: 'PTE',
    unitPrice: product.sellingPrice, originalPrice: product.originalPrice, quantity: 1,
  }],
  subtotal: product.sellingPrice, discountAmount: 0, tax: 0, total: product.sellingPrice,
  currency: 'INR',
  paymentStatus: 'PAID', orderStatus: 'FULFILLED', fulfillmentStatus: 'FULFILLED',
  customerSnapshot: { email: user.email, name: user.name },
  ...over,
});

const cleanup = async () => {
  const rx = new RegExp(`^${TAG}`, 'i');
  const prods = await Product.find({ name: rx }).select('_id');
  const ids = prods.map((p) => p._id);
  const orders = await Order.find({ orderNo: rx }).select('_id');
  await PurchaseEvent.deleteMany({ orderId: { $in: orders.map((o) => o._id) } });
  await VoucherCode.deleteMany({ productId: { $in: ids } });
  await Order.deleteMany({ orderNo: rx });
  await Product.deleteMany({ _id: { $in: ids } });
  await User.deleteMany({ email: rx });
};

const run = async () => {
  console.log('\n=== SOCIAL-PROOF PURCHASE NOTIFICATION SUITE ===\n');
  await connectDB();
  __resetRealtimeHub();
  await cleanup();

  const user = await User.create({
    name: 'Rahul Kumar', email: `${TAG}-rahul@apexvouchers.in`,
    passwordHash: 'x', role: 'user', status: 'active',
  });
  const product = await makeProduct('PTE Academic Voucher');
  const expectWho = config.socialProof.showFirstName ? 'Rahul' : 'A customer';

  // ── 1. PAID + allocated → event created, voucherIssued: true ───────────────
  console.log('── 1. Genuine paid + allocated purchase ──');
  {
    const order = await makeOrder(user, product);
    const client = connect(); // connected BEFORE the event
    const res = await recordPurchaseEvent({ order, user, voucherIssued: true });
    ok(res.created === true, 'event recorded');
    ok(res.event?.voucherIssued === true, 'voucherIssued = true');
    ok(
      res.event?.message === `${expectWho} has successfully purchased a ${TAG} PTE Academic voucher.`,
      'public message text is correct',
      res.event?.message
    );
    const row = await PurchaseEvent.findOne({ orderId: order._id }).lean();
    ok(!!row, 'PurchaseEvent persisted');
    const got = client.purchases();
    ok(got.length === 1, 'connected visitor received exactly one live toast', `got ${got.length}`);
    ok(got[0]?.message === res.event.message, 'broadcast message matches');

    // ── 6. payload safety ──
    const raw = JSON.stringify(got[0] || {});
    ok(!/code/i.test(JSON.stringify(Object.keys(got[0] || {}))), 'payload has no "code" key');
    ok(!raw.includes(order.orderNo), 'payload has no order number');
    ok(!raw.includes(user.email), 'payload has no email');
    ok(!raw.toLowerCase().includes('12000'), 'payload has no amount');
    ok(got[0].displayName === (config.socialProof.showFirstName ? 'Rahul' : null), 'only a safe first name (or null)');
  }

  // ── 2. Non-PAID orders record nothing ─────────────────────────────────────
  console.log('\n── 2. Non-paid orders never notify ──');
  for (const status of ['PENDING', 'FAILED', 'CANCELLED', 'REFUNDED']) {
    const order = await makeOrder(user, product, {
      paymentStatus: status, orderStatus: status === 'PENDING' ? 'PAYMENT_PENDING' : status, fulfillmentStatus: 'PENDING',
    });
    const client = connect();
    const res = await recordPurchaseEvent({ order, user, voucherIssued: false });
    const row = await PurchaseEvent.findOne({ orderId: order._id });
    ok(res.created === false && !row, `${status} order → no PurchaseEvent`);
    ok(client.purchases().length === 0, `${status} order → no broadcast`);
  }

  // ── 3. Out-of-stock paid order → issued:false, then manual delivery flip ───
  console.log('\n── 3. Out-of-stock paid purchase + manual delivery ──');
  {
    const order = await makeOrder(user, product, {
      orderStatus: 'PROCESSING', fulfillmentStatus: 'PROCESSING',
    });
    const client = connect();
    const first = await recordPurchaseEvent({ order, user, voucherIssued: false });
    ok(first.created === true && first.event.voucherIssued === false, 'recorded with voucherIssued: false');
    ok(client.purchases().length === 1, 'one toast broadcast at payment time');

    const flip = await markPurchaseEventIssued({ order, user });
    ok(flip.created === false, 'manual delivery did NOT create a second event');
    const row = await PurchaseEvent.findOne({ orderId: order._id }).lean();
    ok(row.voucherIssued === true, 'voucherIssued flipped to true');
    ok(client.purchases().length === 1, 'manual delivery did NOT re-broadcast');
  }

  // ── 4. Idempotency ───────────────────────────────────────────────────────
  console.log('\n── 4. Idempotent recording ──');
  {
    const order = await makeOrder(user, product);
    const client = connect();
    await recordPurchaseEvent({ order, user, voucherIssued: true });
    await recordPurchaseEvent({ order, user, voucherIssued: true });
    await recordPurchaseEvent({ order, user, voucherIssued: true });
    const count = await PurchaseEvent.countDocuments({ orderId: order._id });
    ok(count === 1, 'exactly one PurchaseEvent for the order', `got ${count}`);
    ok(client.purchases().length === 1, 'exactly one broadcast', `got ${client.purchases().length}`);
  }

  // ── 5. SSE hub semantics ─────────────────────────────────────────────────
  console.log('\n── 5. SSE hub: live-only + reconnect gap-fill ──');
  {
    __resetRealtimeHub();
    const early = connect(); // connected first
    const id1 = publish('social-proof', 'purchase', { id: 'a', message: 'A', at: new Date().toISOString() });
    const id2 = publish('social-proof', 'purchase', { id: 'b', message: 'B', at: new Date().toISOString() });
    ok(early.purchases().length === 2, 'early client received both live events');

    const late = connect(); // connects AFTER both events, no Last-Event-ID
    ok(late.purchases().length === 0, 'late visitor gets NO backlog');

    const reconnect = connect({ 'last-event-id': String(id1) });
    const replayed = reconnect.purchases();
    ok(replayed.length === 1 && replayed[0].id === 'b', 'reconnecting client replays only the missed event', JSON.stringify(replayed));
    ok(id2 === id1 + 1, 'event ids are monotonic');
    ok(realtimeStats().clients >= 3, 'hub tracks connected clients');
  }

  // ── 7. safeFirstName ─────────────────────────────────────────────────────
  console.log('\n── 7. safeFirstName sanitisation ──');
  if (config.socialProof.showFirstName) {
    ok(safeFirstName('Rahul Kumar') === 'Rahul', '"Rahul Kumar" → "Rahul"');
    ok(safeFirstName('  aisha  ') === 'Aisha', 'trims + title-cases');
    ok(safeFirstName('rahul@example.com') === null, 'email → null');
    ok(safeFirstName('R2D2') === null, 'digits → null');
    ok(safeFirstName('A') === null, 'single char → null');
    ok(safeFirstName('') === null, 'empty → null');
    ok(safeFirstName(null) === null, 'null → null');
    ok(
      buildPurchaseMessage({ productLabel: '', displayName: null }) === 'A customer has successfully purchased their voucher.',
      'no product label → "their voucher" fallback'
    );
  } else {
    ok(safeFirstName('Rahul Kumar') === null, 'first-name display disabled → always null');
  }

  await cleanup();
  __resetRealtimeHub();
  await mongoose.disconnect();

  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ FAILURES'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
