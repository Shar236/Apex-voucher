import dotenv from 'dotenv';
dotenv.config();

// Force transactional email OFF for this suite — sendEmail() then no-ops.
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';

import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Product } from '../models/Product.js';
import { VoucherCode } from '../models/VoucherCode.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { VoucherRequest } from '../models/VoucherRequest.js';
import {
  createVoucherRequest,
  updateVoucherRequest,
  markVoucherRequestFulfilled,
  listMyVoucherRequests,
} from '../services/voucherRequestService.js';

let passed = 0;
let failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { console.log(`  ✅ ${name}`); passed += 1; }
  else { console.error(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); failed += 1; }
};
const expectThrow = async (fn, code, name) => {
  try { await fn(); ok(false, name, 'no error thrown'); }
  catch (err) { ok(err?.code === code, name, `got ${err?.code}: ${err?.message}`); }
};

const cleanup = async (productId, userId, dropProduct = false) => {
  if (productId) {
    await VoucherRequest.deleteMany({ productId });
    await VoucherCode.deleteMany({ productId });
  }
  await Order.deleteMany({ voucherRequestId: { $ne: null }, userId });
  if (dropProduct) await Product.deleteMany({ name: /^TEST VR / });
};

const run = async () => {
  console.log('\n=== VOUCHER REQUEST FLOW SUITE ===\n');
  await connectDB();

  const user = await User.findOneAndUpdate(
    { email: 'test-vr-runner@apexvouchers.in' },
    { name: 'VR Test Runner', email: 'test-vr-runner@apexvouchers.in', passwordHash: 'x', role: 'user' },
    { upsert: true, new: true }
  );

  const product = await Product.findOneAndUpdate(
    { name: 'TEST VR PTE Voucher' },
    {
      name: 'TEST VR PTE Voucher', slug: 'test-vr-pte-' + Date.now(),
      brand: 'PTE', provider: 'Pearson PTE', voucherType: 'PTE', category: 'Exam Voucher',
      originalPrice: 18900, sellingPrice: 15499, active: true, stockType: 'LIMITED',
    },
    { upsert: true, new: true }
  );

  // Reset any leftover request/voucher rows for this product (keep the product).
  await cleanup(product._id, user._id, false);
  const futureExpiry = new Date(Date.now() + 180 * 864e5);

  try {
    // T1 — zero inventory → request is created, status PENDING
    const { request: r1, duplicate: d1 } = await createVoucherRequest({ productId: String(product._id) }, user);
    ok(!d1 && r1.status === 'PENDING' && r1.voucherType === 'PTE' && r1.requestId?.startsWith('VR-'),
      'T1  out-of-stock product → PENDING request created');

    // T2 — a second request for the same product+user is a duplicate, not a new row
    const { request: r2, duplicate: d2 } = await createVoucherRequest({ productId: String(product._id) }, user);
    ok(d2 && String(r2._id) === String(r1._id), 'T2  duplicate open request is collapsed');
    ok(await VoucherRequest.countDocuments({ productId: product._id }) === 1, 'T2b still exactly 1 request row');

    // T3 — cannot mark AWAITING_PAYMENT with no inventory
    await expectThrow(
      () => updateVoucherRequest(r1._id, { status: 'AWAITING_PAYMENT', adminUser: { email: 'a@x.com' } }),
      'NO_INVENTORY',
      'T3  AWAITING_PAYMENT blocked while inventory is empty'
    );

    // T4 — admin cannot set FULFILLED manually
    await expectThrow(
      () => updateVoucherRequest(r1._id, { status: 'FULFILLED', adminUser: { email: 'a@x.com' } }),
      'INVALID_TRANSITION',
      'T4  FULFILLED cannot be set manually'
    );

    // T5 — add a code, then AWAITING_PAYMENT succeeds
    const code = `TEST-VR-${Date.now()}`;
    await VoucherCode.create({ code, productId: product._id, voucherType: 'PTE', status: 'AVAILABLE', expiryDate: futureExpiry });
    const { request: r5 } = await updateVoucherRequest(r1._id, { status: 'AWAITING_PAYMENT', adminUser: { email: 'a@x.com' } });
    ok(r5.status === 'AWAITING_PAYMENT' && r5.readyForPaymentAt instanceof Date, 'T5  AWAITING_PAYMENT set once inventory exists');

    // T6 — a NEW request is now refused because stock exists (race guard)
    await expectThrow(
      () => createVoucherRequest({ productId: String(product._id) }, { ...user.toObject(), _id: new mongoose.Types.ObjectId() }),
      'STOCK_AVAILABLE',
      'T6  new request refused while inventory is available'
    );

    // T7 — simulate the payment fulfilment hook
    const voucher = await VoucherCode.findOneAndUpdate(
      { code }, { $set: { status: 'SOLD', userId: user._id } }, { new: true }
    );
    const order = await Order.create({
      orderNo: `ORD-VR-${Date.now()}`, userId: user._id,
      items: [{ productId: product._id, productName: product.name, voucherType: 'PTE', unitPrice: product.sellingPrice, originalPrice: product.originalPrice, quantity: 1 }],
      subtotal: product.sellingPrice, total: product.sellingPrice,
      paymentStatus: 'PAID', orderStatus: 'FULFILLED', fulfillmentStatus: 'FULFILLED',
      source: 'VOUCHER_REQUEST', voucherRequestId: r1._id, razorpayPaymentId: 'pay_VRTEST',
    });
    const fr = await markVoucherRequestFulfilled({ order, voucher, user });
    ok(fr && fr.status === 'FULFILLED' && String(fr.orderId) === String(order._id) &&
       String(fr.assignedVoucherId) === String(voucher._id) && fr.fulfilledAt instanceof Date &&
       fr.paymentReference === 'pay_VRTEST',
      'T7  fulfilment hook marks request FULFILLED + links order/voucher');

    // T8 — hook is idempotent
    const fr2 = await markVoucherRequestFulfilled({ order, voucher, user });
    ok(fr2 === null, 'T8  fulfilment hook is idempotent (second call is a no-op)');
    ok(await VoucherRequest.countDocuments({ _id: r1._id, status: 'FULFILLED' }) === 1, 'T8b request stays FULFILLED exactly once');

    // T9 — customer view exposes the code for a fulfilled request
    const mine = await listMyVoucherRequests(user._id);
    const row = mine.find((m) => String(m.id) === String(r1._id));
    ok(row && row.status === 'FULFILLED' && row.voucher?.code === code, 'T9  listMyVoucherRequests returns the fulfilled voucher code');

    // T10 — after fulfilment, admin update is refused
    await expectThrow(
      () => updateVoucherRequest(r1._id, { status: 'CANCELLED', adminUser: { email: 'a@x.com' } }),
      'ALREADY_FULFILLED',
      'T10 fulfilled request rejects further admin status changes'
    );

    // T11 — open request can be CANCELLED by admin
    const { request: rCancel } = await createVoucherRequest({ productId: String(product._id) }, { ...user.toObject(), _id: new mongoose.Types.ObjectId() });
    const { request: cancelled } = await updateVoucherRequest(rCancel._id, { status: 'CANCELLED', adminNotes: 'Test cancellation', adminUser: { email: 'admin@test.com' } });
    ok(cancelled.status === 'CANCELLED' && cancelled.cancelledAt instanceof Date && cancelled.adminNotes === 'Test cancellation', 'T11 open request can be cancelled by admin');
  } catch (err) {
    console.error('Fatal:', err);
    failed += 1;
  }

  await cleanup(product._id, user._id, true);
  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
  await mongoose.connection.close();
  process.exit(failed > 0 ? 1 : 0);
};

run();
