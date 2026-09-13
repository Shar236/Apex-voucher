/**
 * PTE Exam Booking — product catalog, admin, draft/publish & cart-price sync.
 *
 * Covers the data-driven booking product contract:
 *   - public catalog only exposes `published` + `active` products,
 *   - admin CRUD + draft/publish controls,
 *   - price edits are reflected immediately in the public catalog (#9),
 *   - reorder is preserved,
 *   - every mutation leaves an audit trail (doc auditHistory + AuditLog),
 *   - server-side pricing: `resolveOrderLineItems` re-reads the bookingPrice
 *     from the DB — the client can never dictate the charged amount (#11),
 *   - voucher allocation skips PTE-BOOKING service line items (paid service
 *     orders fulfil without a voucher code).
 *
 * Creates only "TEST-PTEBK" prefixed data and cleans up afterwards.
 *   node backend/tests/pteBookingProducts.test.js
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { PTEBookingProduct } from '../models/PTEBookingProduct.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import {
  createPTEBookingProductAdmin,
  updatePTEBookingProductAdmin,
  deletePTEBookingProductAdmin,
  reorderPTEBookingProductsAdmin,
  publishPTEBookingProductAdmin,
  unpublishPTEBookingProductAdmin,
  getPublicPTEBookingCatalog,
  getPTEBookingConfigAdmin,
} from '../controllers/pteBookingProductController.js';
import { resolveOrderLineItems } from '../controllers/paymentController.js';
import { allocateVouchersForOrder } from '../services/voucherAllocation.js';

const TAG = 'TEST-PTEBK';
let pass = 0;
let fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
};

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const ADMIN = { _id: new mongoose.Types.ObjectId(), email: `${TAG}@apex.test`, role: 'admin' };

const run = async (handler, { body = {}, params = {}, query = {}, user = ADMIN } = {}) => {
  const res = mockRes();
  let nextErr = null;
  const req = { user, body, params, query, ip: '127.0.0.1', headers: {} };
  await handler(req, res, (err) => { nextErr = err || new Error('next() with no error'); });
  return { res, body: res.body, status: nextErr?.statusCode || res.statusCode, err: nextErr };
};

const cleanup = async () => {
  await PTEBookingProduct.deleteMany({ key: new RegExp('^test-pte') });
  await Order.deleteMany({ orderNo: new RegExp(`^${TAG}`) });
  await AuditLog.deleteMany({ resourceType: 'PTEBookingProduct' });
};

const baseBody = (key, extra = {}) => ({
  key,
  name: key.replace(/-/g, ' '),
  shortDescription: 'Test booking service description.',
  serviceLabel: 'EXAM BOOKING SERVICE',
  badgeText: 'TEST BADGE',
  badgeTint: '#123456',
  pricing: { bookingPrice: 14999, standardPrice: 18900, currency: 'INR', showStandardPrice: true, showSavingsBadge: true },
  features: [
    { text: 'Exam booking arranged for you', enabled: true },
    { text: 'Choose preferred test centre', enabled: false },
  ],
  button: { text: 'Book Now', href: '', visible: true, enabled: true },
  ...extra,
});

const catalogProducts = (body) => body?.products || [];

const runTests = async () => {
  console.log('================================================================');
  console.log('🧪 PTE EXAM BOOKING PRODUCTS / ADMIN / CART PRICE SYNC');
  console.log('================================================================\n');
  await connectDB();
  await cleanup();
// ── 1. public catalog starts empty ────────────────────────────────────────
  console.log('— public catalog (draft isolation) —');
  const emptyPub = await run(getPublicPTEBookingCatalog);
  ok(emptyPub.status === 200 && Array.isArray(catalogProducts(emptyPub.body)), 'public catalog → 200 with products array');
  ok(!catalogProducts(emptyPub.body).some((p) => String(p.key).startsWith(TAG.toLowerCase())), 'no TEST products public before publishing');

  // ── 2. admin create → draft is never public ──────────────────────────────
  console.log('\n— create (draft) —');
  const created = await run(createPTEBookingProductAdmin, {
    body: baseBody('test-pte-academic'),
  });
  ok(created.status === 201 && created.body?.data?._id, 'createProduct → 201', JSON.stringify(created.body || created.err?.message).slice(0, 160));
  const id = String(created.body.data._id);
  ok(created.body.data.status === 'draft' && created.body.data.active === true, 'new product defaults to draft + active');

  const pubAfterDraft = await run(getPublicPTEBookingCatalog);
  ok(!catalogProducts(pubAfterDraft.body).some((p) => p._id === id), 'draft product is NOT in the public catalog');

  // ── 3. publish → public + pricing/savings computed server-side ──────────
  console.log('\n— publish → public —');
  const pub = await run(publishPTEBookingProductAdmin, { params: { id } });
  ok(pub.status === 200 && pub.body?.data?.status === 'published', 'publish → status published');
  const pubLive = await run(getPublicPTEBookingCatalog);
  const card = catalogProducts(pubLive.body).find((p) => p._id === id);
  ok(!!card, 'published product appears in public catalog');
  ok(card && card.pricing.bookingPrice === 14999 && card.pricing.standardPrice === 18900, 'pricing carried through');
  ok(card && card.features.length === 2 && card.features[1].enabled === false, 'features round-trip incl. disabled flag');
  ok(card && card.button.text === 'Book Now', 'button round-trip');
  ok(card && card.image === '', 'empty image allowed (frontend keeps existing illustration)');

  // ── 4. price edit reflects immediately (#9) ─────────────────────────────
  console.log('\n— price sync (admin → public) —');
  const upd = await run(updatePTEBookingProductAdmin, {
    params: { id },
    body: { pricing: { bookingPrice: 15599, standardPrice: 19400, showStandardPrice: true, showSavingsBadge: true } },
  });
  ok(upd.status === 200 && upd.body?.data?.pricing?.bookingPrice === 15599, 'admin updates booking price');
  const pubAfterEdit = await run(getPublicPTEBookingCatalog);
  const card2 = catalogProducts(pubAfterEdit.body).find((p) => p._id === id);
  ok(card2?.pricing?.bookingPrice === 15599 && card2?.pricing?.standardPrice === 19400, 'public catalog shows the NEW price immediately');

  // ── 5. draft/publish controls ────────────────────────────────────────────
  console.log('\n— draft / publish controls —');
  const unpub = await run(unpublishPTEBookingProductAdmin, { params: { id } });
  ok(unpub.status === 200 && unpub.body?.data?.status === 'draft', 'unpublish → draft');
  const pubHidden = await run(getPublicPTEBookingCatalog);
  ok(!catalogProducts(pubHidden.body).some((p) => p._id === id), 'unpublished product hidden from public');
  ok(catalogProducts(pubHidden.body).every((p) => p.status === undefined), 'public payload does not leak status flags');

  // ── 6. reorder (all three products live again) ───────────────────────────
  console.log('\n— reorder —');
  const repub = await run(publishPTEBookingProductAdmin, { params: { id } });
  ok(repub.status === 200, 're-publish product 1');
  const c2 = await run(createPTEBookingProductAdmin, { body: baseBody('test-pte-core') });
  const c3 = await run(createPTEBookingProductAdmin, { body: baseBody('test-pte-ukvi') });
  const id2 = String(c2.body?.data?._id);
  const id3 = String(c3.body?.data?._id);
  await run(publishPTEBookingProductAdmin, { params: { id: id2 } });
  const publishedId3 = await run(publishPTEBookingProductAdmin, { params: { id: id3 } });
  ok(publishedId3.status === 200, 'publish third product → 200');

  const reorder = await run(reorderPTEBookingProductsAdmin, {
    body: { items: [{ _id: id3, displayOrder: 1 }, { _id: id2, displayOrder: 2 }, { _id: id, displayOrder: 3 }] },
  });
  ok(reorder.status === 200 && reorder.body?.updated === 3, 'reorder updates displayOrder');

  const pubOrdered = await run(getPublicPTEBookingCatalog);
  const ordered = catalogProducts(pubOrdered.body).filter((p) => [id, id2, id3].includes(p._id)).map((p) => p._id);
  ok(ordered[0] === id3 && ordered[1] === id2 && ordered[2] === id, 'public catalog respects displayOrder');

  // ── 7. audit trail ───────────────────────────────────────────────────────
  console.log('\n— audit history —');
  const fresh = await PTEBookingProduct.findById(id).lean();
  ok(Array.isArray(fresh.auditHistory) && fresh.auditHistory.length >= 4, 'document auditHistory records events', `count=${fresh.auditHistory.length}`);
  const auditRows = await AuditLog.find({ resourceType: 'PTEBookingProduct', resourceId: id }).lean();
  ok(auditRows.length >= 3, 'central AuditLog rows written', `count=${auditRows.length}`);
  const actions = auditRows.map((a) => a.action);
  ok(actions.includes('PTE_BOOKING_PRODUCT_PUBLISHED') && actions.includes('PTE_BOOKING_PRODUCT_UPDATED'), 'audit log has publish + update actions', actions.join(','));

  // ── 8. delete rules ──────────────────────────────────────────────────────
  console.log('\n— delete / deactivate —');
  const delLive = await run(deletePTEBookingProductAdmin, { params: { id: id2 } });
  ok(delLive.status === 200 && delLive.body?.deactivated === true, 'published product delete → deactivated (not dropped)');
  ok(!!(await PTEBookingProduct.exists({ _id: id2 })), 'deactivated product record retained');
  const draftProd = await run(createPTEBookingProductAdmin, { body: baseBody('test-pte-draft-del') });
  const draftId = String(draftProd.body?.data?._id);
  const delDraft = await run(deletePTEBookingProductAdmin, { params: { id: draftId } });
  ok(delDraft.status === 200 && delDraft.body?.deleted === true, 'draft product delete → hard deleted');
  ok(!(await PTEBookingProduct.exists({ _id: draftId })), 'draft product gone from DB');

// ── 9. server-side price resolution (#10/#11) ─────────────────────────────
  console.log('\n— cart/checkout server-side price sync —');
  const resolved = await resolveOrderLineItems([{ productId: id, quantity: 2 }]);
  ok(resolved.length === 1, 'PTE booking item resolves', JSON.stringify(resolved).slice(0, 200));
  ok(resolved[0].unitPrice === 15599 && resolved[0].originalPrice === 19400, 'server price = current DB bookingPrice (client price ignored)');
  ok(resolved[0].voucherType === 'PTE-BOOKING' && resolved[0].productName === created.body.data.name, 'voucherType marker + name from DB');

  // Draft / hidden products cannot be purchased (price can't be faked).
  const draftRes = await run(unpublishPTEBookingProductAdmin, { params: { id } });
  ok(draftRes.status === 200 && draftRes.body?.data?.status === 'draft', 'unpublish for purchase-block test');
  let blocked = false;
  try {
    await resolveOrderLineItems([{ productId: id, quantity: 1 }]);
  } catch (e) {
    blocked = e.code === 'PRODUCT_MISSING';
  }
  ok(blocked, 'draft PTE booking product is NOT purchasable (PRODUCT_MISSING)');

  const missing = new mongoose.Types.ObjectId().toString();
  let missingBlocked = false;
  try {
    await resolveOrderLineItems([{ productId: missing, quantity: 1 }]);
  } catch (e) {
    missingBlocked = e.code === 'PRODUCT_MISSING';
  }
  ok(missingBlocked, 'unknown id → PRODUCT_MISSING');

  // ── 10. voucher allocation skips service line items ─────────────────────
  console.log('\n— fulfilment: service items need no voucher code —');
  const customer = await User.create({ name: 'PTE Test Customer', email: `${TAG}@cust.test`, phone: '9999999999', passwordHash: 'test-hash-not-a-real-password' });
  const order = new Order({
    orderNo: `${TAG}-ORDER-1`,
    userId: customer._id,
    items: [{
      productId: new mongoose.Types.ObjectId(id),
      productName: 'Test PTE Academic',
      slug: 'test-pte-academic',
      voucherType: 'PTE-BOOKING',
      brand: 'Pearson PTE',
      unitPrice: 15599,
      originalPrice: 19400,
      quantity: 1,
    }],
    subtotal: 15599,
    discountAmount: 0,
    total: 15599,
    paymentStatus: 'PAID',
    orderStatus: 'PROCESSING',
    fulfillmentStatus: 'PROCESSING',
  });
  await order.save();
  const alloc = await allocateVouchersForOrder({ order, user: customer });
  ok(alloc.vouchers.length === 0, 'service order allocates ZERO voucher codes');
  ok(order.fulfillmentStatus === 'PROCESSING' && order.orderStatus === 'PROCESSING', 'pure-booking order remains PROCESSING until confirmed by admin');

  // ── 11. page config endpoint (read-only in tests) ────────────────────────
  console.log('\n— page config —');
  const cfg = await run(getPTEBookingConfigAdmin);
  ok(cfg.status === 200 && cfg.body?.data && typeof cfg.body.data.content === 'object', 'get config returns content object');
  ok(cfg.body?.data?.content?.hero?.heading, 'config hero heading present');

  await cleanup();
  await User.deleteOne({ _id: customer._id });
  await mongoose.disconnect();
  console.log(`\n================================================================`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(`================================================================`);
  process.exit(fail ? 1 : 0);
};

runTests().catch(async (e) => {
  console.error(e);
  try { await cleanup(); await mongoose.disconnect(); } catch {}
  process.exit(1);
});