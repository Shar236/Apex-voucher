/**
 * End-to-end integration test suite for the Pearson PTE Exam Booking flow.
 *
 * Validates:
 *  1. Customer selects PTE Academic and enters booking preferences.
 *  2. Customer pays through Razorpay.
 *  3. Payment succeeds -> PTEBookingRequest is created with payment details & preferences.
 *  4. Linked Order remains orderStatus: 'PROCESSING', fulfillmentStatus: 'PROCESSING'.
 *  5. Zero voucher codes are allocated or returned.
 *  6. Admin sees the new PTE booking request.
 *  7. Admin updates status to 'Processing Booking'.
 *  8. Admin CANNOT select 'Booking Confirmed' without Pearson appointment details.
 *  9. Admin enters official Pearson details (ref, centre, city, date, time, instructions) and selects 'Booking Confirmed'.
 * 10. Only now does the linked order become 'FULFILLED'.
 * 11. Customer can view the confirmed appointment in account bookings.
 * 12. Normal voucher purchases continue to allocate vouchers and fulfill immediately.
 *
 * Run:
 *   node backend/tests/pteBookingServiceFlow.test.js
 */
import dotenv from 'dotenv';
dotenv.config();

process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.SMTP_FROM = '';

const crypto = (await import('crypto')).default;
const mongoose = (await import('mongoose')).default;
const { connectDB } = await import('../config/db.js');
const { config } = await import('../config/index.js');
const { PTEBookingProduct } = await import('../models/PTEBookingProduct.js');
const { PTEBookingRequest } = await import('../models/PTEBookingRequest.js');
const { Product } = await import('../models/Product.js');
const { VoucherCode } = await import('../models/VoucherCode.js');
const { Order } = await import('../models/Order.js');
const { User } = await import('../models/User.js');
const { generateOrderNo } = await import('../utils/index.js');
const {
  createPaymentOrder,
  verifyPayment,
  getPaymentStatus,
} = await import('../controllers/paymentController.js');
const {
  updateBookingRequestStatus,
  listMyBookingRequests,
  listBookingRequests,
  getPTEBookingStats,
} = await import('../services/pteBookingService.js');
const { myVouchers } = await import('../controllers/accountController.js');

const SECRET = config.razorpay.keySecret || 'test_secret_fallback';
const TAG = 'TEST-PTE-FLOW';

const realFetch = global.fetch;
const gatewayPayments = new Map();
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('api.razorpay.com/v1/payments/')) {
    const id = u.split('/payments/')[1];
    const o = gatewayPayments.get(id) || {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id,
        entity: 'payment',
        status: 'captured',
        order_id: 'order_STUB',
        amount: 100,
        currency: 'INR',
        method: 'upi',
        ...o,
      }),
    };
  }
  if (/api\.razorpay\.com\/v1\/orders\/[^/]+\/payments/.test(u)) {
    return { ok: true, status: 200, json: async () => ({ entity: 'collection', count: 0, items: [] }) };
  }
  return realFetch ? realFetch(url, opts) : Promise.reject(new Error('no fetch'));
};

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
};

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const sign = (orderId, paymentId) =>
  crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const cleanup = async () => {
  await PTEBookingProduct.deleteMany({ key: new RegExp(`^${TAG.toLowerCase()}`) });
  await PTEBookingRequest.deleteMany({ email: new RegExp(`${TAG.toLowerCase()}`) });
  await Product.deleteMany({ slug: new RegExp(`^${TAG.toLowerCase()}`) });
  await VoucherCode.deleteMany({ code: new RegExp(`^${TAG}`) });
  await Order.deleteMany({ orderNo: new RegExp(`^${TAG}`) });
  await User.deleteMany({ email: new RegExp(`${TAG.toLowerCase()}`) });
};

const runSuite = async () => {
  console.log('================================================================');
  console.log('🧪 PTE EXAM BOOKING SERVICE END-TO-END FLOW');
  console.log('================================================================\n');

  await connectDB();
  await cleanup();

  // ── Setup Users ──
  const customer = await User.create({
    name: 'PTE Student',
    email: `${TAG.toLowerCase()}-student@example.com`,
    phone: '+919876543210',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
    role: 'user',
  });

  const admin = await User.create({
    name: 'PTE Admin',
    email: `${TAG.toLowerCase()}-admin@example.com`,
    phone: '+919999999999',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuu',
    role: 'admin',
  });

  // ── Setup Products ──
  // 1. PTE Booking Product (Assistance Service)
  const pteProduct = await PTEBookingProduct.create({
    key: `${TAG.toLowerCase()}-pte-academic`,
    name: 'PTE Academic Booking Assistance',
    serviceLabel: 'EXAM BOOKING SERVICE',
    status: 'published',
    active: true,
    pricing: {
      bookingPrice: 15500,
      standardPrice: 19000,
      currency: 'INR',
    },
  });

  // 2. Regular Voucher Product (Voucher Selling)
  const regularProduct = await Product.create({
    name: 'GRE General Exam Voucher',
    slug: `${TAG.toLowerCase()}-gre-voucher`,
    voucherType: 'GRE',
    category: 'GRE',
    brand: 'ETS GRE',
    sellingPrice: 18000,
    originalPrice: 22000,
    active: true,
    published: true,
  });

  await VoucherCode.create({
    code: `${TAG}-GRE-CODE-001`,
    voucherType: 'GRE',
    productId: regularProduct._id,
    batch: `${TAG}-BATCH-1`,
    expiryDate: new Date(Date.now() + 90 * 86400000),
    status: 'AVAILABLE',
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PART 1: PTE EXAM BOOKING SERVICE FLOW
  // ──────────────────────────────────────────────────────────────────────────
  console.log('— Part 1: PTE Booking Assistance Request & Payment —');

  const rzpOrderId = `order_PTEFLOW_${Date.now()}`;
  const rzpPaymentId = `pay_PTEFLOW${Date.now()}`;

  // Step 1: Customer creates order with booking preferences
  const bookingPrefs = {
    preferredCity: 'Mumbai',
    preferredTestCentre: 'Pearson Professional Centre - Andheri East',
    preferredDate: new Date(Date.now() + 14 * 86400000),
    preferredTime: 'Morning',
    message: 'Urgent exam slot required for university deadline.',
  };

  const pteOrder = await Order.create({
    orderNo: `${TAG}-PTE-ORDER-1`,
    userId: customer._id,
    razorpayOrderId: rzpOrderId,
    items: [
      {
        productId: pteProduct._id,
        productName: pteProduct.name,
        slug: pteProduct.key,
        voucherType: 'PTE-BOOKING',
        brand: 'Pearson PTE',
        unitPrice: 15500,
        originalPrice: 19000,
        quantity: 1,
      },
    ],
    bookingPreferences: bookingPrefs,
    subtotal: 15500,
    discountAmount: 0,
    total: 15500,
    currency: 'INR',
    paymentStatus: 'PENDING',
    orderStatus: 'PENDING',
    fulfillmentStatus: 'PENDING',
  });

  ok(pteOrder.bookingPreferences?.preferredCity === 'Mumbai', 'order captures customer booking preferences');

  // Step 2: Payment verification callback
  gatewayPayments.set(rzpPaymentId, {
    order_id: rzpOrderId,
    amount: 15500 * 100,
    currency: 'INR',
    status: 'captured',
  });

  const pteVerifyReq = {
    user: customer,
    body: {
      orderId: String(pteOrder._id),
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: sign(rzpOrderId, rzpPaymentId),
    },
  };
  const pteVerifyRes = mockRes();
  await verifyPayment(pteVerifyReq, pteVerifyRes, (err) => { throw err; });

  ok(pteVerifyRes.statusCode === 200, 'payment verification succeeds');
  ok(pteVerifyRes.body?.isPteBooking === true, 'response identifies isPteBooking: true');
  ok(Array.isArray(pteVerifyRes.body?.vouchers) && pteVerifyRes.body.vouchers.length === 0, 'ZERO voucher codes returned to customer');

  // Step 3: Verify created PTEBookingRequest
  const bookingRequest = await PTEBookingRequest.findOne({ orderId: pteOrder._id });
  ok(!!bookingRequest, 'PTEBookingRequest document automatically created');
  ok(bookingRequest.amountPaid === 15500, 'PTEBookingRequest records amountPaid = 15500');
  ok(bookingRequest.paymentStatus === 'PAID', 'PTEBookingRequest records paymentStatus = PAID');
  ok(bookingRequest.status === 'Booking Request Pending' || bookingRequest.status === 'Payment Received', 'PTEBookingRequest initial status is pending/payment received');
  ok(bookingRequest.preferredCity === 'Mumbai', 'PTEBookingRequest records preferred city');
  ok(bookingRequest.preferredTestCentre.includes('Andheri'), 'PTEBookingRequest records preferred test centre');
  ok(bookingRequest.message.includes('Urgent'), 'PTEBookingRequest records customer notes');

  // Step 4: Verify linked Order state (NEVER fulfilled at payment)
  const freshPteOrder = await Order.findById(pteOrder._id);
  ok(freshPteOrder.paymentStatus === 'PAID', 'order paymentStatus is PAID');
  ok(freshPteOrder.orderStatus === 'PROCESSING', 'orderStatus remains PROCESSING (NOT fulfilled)');
  ok(freshPteOrder.fulfillmentStatus === 'PROCESSING', 'fulfillmentStatus remains PROCESSING');
  ok(freshPteOrder.allocatedVouchers.length === 0, 'order allocatedVouchers is strictly empty');

  // Step 5: Check payment status endpoint (/api/payments/order/:orderId)
  const statusReq = { params: { orderId: String(freshPteOrder._id) }, user: customer };
  const statusRes = mockRes();
  await getPaymentStatus(statusReq, statusRes, (err) => { throw err; });
  ok(statusRes.body?.isPteBooking === true, 'getPaymentStatus returns isPteBooking: true');
  ok(statusRes.body?.vouchers.length === 0, 'getPaymentStatus returns zero vouchers');
  ok(statusRes.body?.orderStatus === 'PROCESSING', 'getPaymentStatus reflects PROCESSING order status');

  // Step 6: Customer account bookings view (/api/pte-bookings/mine)
  const myBookings = await listMyBookingRequests(customer._id);
  ok(myBookings.length >= 1, 'customer can retrieve their PTE booking request');
  ok(myBookings[0].preferredCity === 'Mumbai', 'customer sees requested city in account');
  ok(!myBookings[0].confirmationDetails?.bookingReference, 'no confirmation reference visible yet');

  // ──────────────────────────────────────────────────────────────────────────
  // PART 2: ADMIN PROCESSING & ENFORCED PEARSON CONFIRMATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n— Part 2: Admin Workflow & Pearson Appointment Confirmation —');

  // Admin checks stats and list
  const pteStats = await getPTEBookingStats();
  ok(pteStats.total >= 1, 'admin stats show active booking requests');

  const adminList = await listBookingRequests({ search: TAG });
  ok(adminList.rows.length >= 1, 'admin can list the booking request');

  // Step 7: Admin updates status to "Processing Booking"
  const step1 = await updateBookingRequestStatus(bookingRequest._id, {
    status: 'Processing Booking',
    adminNotes: 'Contacting Pearson support for slot availability.',
    adminUser: admin,
  });
  ok(step1.booking.status === 'Processing Booking', 'admin updates status to Processing Booking');

  const orderDuringProcessing = await Order.findById(pteOrder._id);
  ok(orderDuringProcessing.orderStatus === 'PROCESSING', 'order still PROCESSING during processing state');

  // Step 8: Admin attempts to select "Booking Confirmed" WITHOUT required Pearson details
  let blocked = false;
  try {
    await updateBookingRequestStatus(bookingRequest._id, {
      status: 'Booking Confirmed',
      adminUser: admin,
      confirmationDetails: {
        bookingReference: '', // Missing
        confirmedCentre: '',
      },
    });
  } catch (err) {
    blocked = true;
  }
  ok(blocked, 'system STRICTLY PREVENTS confirmation without official Pearson details');

  // Step 9: Admin enters official Pearson details and confirms
  const confirmedDetails = {
    bookingReference: 'PEARSON-PTE-884920',
    confirmedCentre: 'Pearson Professional Centres - Mumbai (Andheri)',
    confirmedCity: 'Mumbai',
    confirmedDate: new Date(Date.now() + 14 * 86400000),
    confirmedTime: '09:30 AM IST',
    importantInstructions: 'Please carry valid passport and arrive 30 minutes early.',
  };

  const step2 = await updateBookingRequestStatus(bookingRequest._id, {
    status: 'Booking Confirmed',
    adminNotes: 'Booking confirmed via official Pearson portal.',
    adminUser: admin,
    confirmationDetails: confirmedDetails,
  });

  ok(step2.booking.status === 'Booking Confirmed', 'booking successfully marked Booking Confirmed');
  ok(step2.booking.confirmationDetails?.bookingReference === 'PEARSON-PTE-884920', 'official booking reference saved');

  // Step 10: Linked Order is now marked FULFILLED
  const finalizedOrder = await Order.findById(pteOrder._id);
  ok(finalizedOrder.orderStatus === 'FULFILLED', 'linked order is FULFILLED only AFTER admin confirmation');
  ok(finalizedOrder.fulfillmentStatus === 'FULFILLED', 'fulfillmentStatus is FULFILLED only AFTER admin confirmation');

  // Step 11: Customer account displays the confirmed Pearson appointment
  const confirmedMyBookings = await listMyBookingRequests(customer._id);
  const userConfirmed = confirmedMyBookings.find((b) => String(b._id) === String(bookingRequest._id));
  ok(userConfirmed?.status === 'Booking Confirmed', 'customer sees Confirmed status in account');
  ok(userConfirmed?.confirmationDetails?.bookingReference === 'PEARSON-PTE-884920', 'customer sees official Pearson booking reference');
  ok(userConfirmed?.confirmationDetails?.confirmedCentre.includes('Mumbai'), 'customer sees confirmed test centre');

  // ──────────────────────────────────────────────────────────────────────────
  // PART 3: REGULAR VOUCHER PRODUCT FLOW (ZERO REGRESSION TEST)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n— Part 3: Regular Voucher Flow Isolation (Zero Regression) —');

  const rzpVoucherOrderId = `order_VCHFLOW_${Date.now()}`;
  const rzpVoucherPaymentId = `pay_VCHFLOW${Date.now()}`;

  const voucherOrder = await Order.create({
    orderNo: `${TAG}-VCH-ORDER-1`,
    userId: customer._id,
    razorpayOrderId: rzpVoucherOrderId,
    items: [
      {
        productId: regularProduct._id,
        productName: regularProduct.name,
        slug: regularProduct.slug,
        voucherType: 'GRE',
        brand: 'ETS GRE',
        unitPrice: 18000,
        originalPrice: 22000,
        quantity: 1,
      },
    ],
    subtotal: 18000,
    discountAmount: 0,
    total: 18000,
    currency: 'INR',
    paymentStatus: 'PENDING',
    orderStatus: 'PENDING',
    fulfillmentStatus: 'PENDING',
  });

  gatewayPayments.set(rzpVoucherPaymentId, {
    order_id: rzpVoucherOrderId,
    amount: 18000 * 100,
    currency: 'INR',
    status: 'captured',
  });

  const vchVerifyReq = {
    user: customer,
    body: {
      orderId: String(voucherOrder._id),
      razorpay_order_id: rzpVoucherOrderId,
      razorpay_payment_id: rzpVoucherPaymentId,
      razorpay_signature: sign(rzpVoucherOrderId, rzpVoucherPaymentId),
    },
  };
  const vchVerifyRes = mockRes();
  await verifyPayment(vchVerifyReq, vchVerifyRes, (err) => { throw err; });

  ok(vchVerifyRes.statusCode === 200, 'regular voucher payment verification succeeds');
  ok(!vchVerifyRes.body?.isPteBooking, 'regular voucher is NOT flagged as PTE booking');
  ok(vchVerifyRes.body?.vouchers?.length === 1, 'regular voucher purchase IMMEDIATELY delivers voucher code');
  ok(vchVerifyRes.body?.vouchers[0].code === `${TAG}-GRE-CODE-001`, 'delivered code matches assigned stock code');

  const fulfilledVchOrder = await Order.findById(voucherOrder._id);
  ok(fulfilledVchOrder.orderStatus === 'FULFILLED', 'regular voucher order is FULFILLED immediately upon payment');
  ok(fulfilledVchOrder.allocatedVouchers.length === 1, 'regular voucher order has allocatedVouchers populated');

  // Customer account vouchers
  const vchReq = { user: customer, query: {} };
  const vchRes = mockRes();
  await myVouchers(vchReq, vchRes, (err) => { throw err; });
  const userVouchers = vchRes.body?.data || [];
  ok(userVouchers.some((v) => v.code === `${TAG}-GRE-CODE-001`), 'regular voucher appears in customer My Vouchers vault');

  // ──────────────────────────────────────────────────────────────────────────
  // CLEANUP & SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  await cleanup();
  await mongoose.disconnect();

  console.log(`\n================================================================`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log(`================================================================`);
  process.exit(fail ? 1 : 0);
};

runSuite().catch(async (err) => {
  console.error('Fatal test error:', err);
  try { await cleanup(); await mongoose.disconnect(); } catch {}
  process.exit(1);
});
