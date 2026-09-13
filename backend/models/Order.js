import mongoose from 'mongoose';

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'];
export const ORDER_STATUSES = [
  'PENDING',
  'PAYMENT_PENDING',
  'PAID',
  'PROCESSING',
  'PAYMENT_RECEIVED_NEEDS_ALLOCATION',
  'FULFILLED',
  'CANCELLED',
  'REFUNDED',
  'FAILED',
];
export const FULFILLMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'FULFILLED',
  'FAILED',
  'MISMATCH_BLOCKED',
  'NEEDS_RESTOCK',
];

const orderSchema = new mongoose.Schema(
  {
    orderNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        productName: { type: String, required: true },
        slug: { type: String, trim: true, default: '' },
        voucherType: { type: String, uppercase: true, trim: true, default: 'EXAM', index: true },
        brand: { type: String, default: '' },
        unitPrice: { type: Number, required: true },
        originalPrice: { type: Number, required: true },
        quantity: { type: Number, min: 1, default: 1, required: true },
        durationKey: { type: String, default: null },
        durationLabel: { type: String, default: null },
        validityDays: { type: Number, default: 180 },
      },
    ],
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    // `total` is the amount actually CHARGED, in `currency` major units
    // (whole rupees for INR; 2dp dollars for USD orders).
    total: { type: Number, required: true, min: 0 },
    // Charge currency: 'INR' (India) or 'USD' (international). Existing orders
    // default to INR — historical orders are never recalculated.
    currency: { type: String, default: 'INR' },
    // ── Multi-currency audit trail (INR is the canonical base) ──────────────
    // For USD orders these preserve the INR base pricing and the exact FX rate
    // used at purchase time, so historical orders never change when the
    // exchange rate moves. Null for INR orders.
    baseSubtotalINR: { type: Number, default: null, min: 0 },
    baseDiscountINR: { type: Number, default: null, min: 0 },
    baseAmountINR: { type: Number, default: null, min: 0 },
    fxRateUsed: { type: Number, default: null }, // INR per USD, e.g. 87.42
    fxRateTimestamp: { type: Date, default: null }, // when that rate was fetched
    fxRateSource: { type: String, default: null }, // provider host (no secrets)
    countryCode: { type: String, default: null }, // server-detected ISO-2, e.g. 'US'
    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Promotion',
      default: null,
    },
    promoCode: { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'PENDING',
      index: true,
    },
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'PENDING',
      index: true,
    },
    fulfillmentStatus: {
      type: String,
      enum: FULFILLMENT_STATUSES,
      default: 'PENDING',
      index: true,
    },
    fulfillmentError: { type: String, default: null },
    allocatedVouchers: [
      {
        voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'VoucherCode' },
        code: { type: String, uppercase: true, trim: true },
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        voucherType: { type: String, uppercase: true, trim: true },
        allocatedAt: { type: Date, default: Date.now },
      },
    ],
    // Where this order originated. 'STOREFRONT' (default / normal checkout) or
    // 'VOUCHER_REQUEST' (payment for a previously out-of-stock voucher request).
    // Request-sourced orders are hidden from the customer "My Orders" list — the
    // VoucherRequest is the customer-facing record — but stay fully visible in
    // the admin console.
    source: { type: String, default: 'STOREFRONT', index: true },
    voucherRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VoucherRequest',
      default: null,
      index: true,
    },
    pteBookingRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PTEBookingRequest',
      default: null,
      index: true,
    },
    bookingPreferences: {
      preferredCity: { type: String, default: '' },
      preferredTestCentre: { type: String, default: '' },
      preferredDate: { type: Date, default: null },
      preferredTime: { type: String, default: 'Any Time' },
      message: { type: String, default: '' },
    },
    paymentProvider: { type: String, default: null },
    paymentReference: { type: String, default: null, index: true },
    // Razorpay binding — the gateway order id we created for this internal order.
    razorpayOrderId: { type: String, default: null, index: true },
    // The captured Razorpay payment id (set only after verified capture).
    razorpayPaymentId: { type: String, default: null, index: true },
    // Razorpay webhook event ids already applied to this order (idempotency).
    processedEventIds: { type: [String], default: [] },
    billingDetails: {
      name: String,
      email: String,
      phone: String,
      address: String,
      gstin: String,
    },
    customerSnapshot: {
      email: String,
      phone: String,
      name: String,
    },
    paymentNotes: { type: String, default: null },
    cashfreeOrderId: { type: String, default: null, index: true },
    paymentSessionId: { type: String, default: null },
    paymentMethod: { type: String, default: null },
    transactionId: { type: String, default: null },
    webhookStatus: { type: String, default: null },
    paidAt: { type: Date, default: null },
    emailStatus: {
      type: String,
      enum: ['PENDING', 'SENDING', 'SENT', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    emailSentAt: { type: Date, default: null },
    emailError: { type: String, default: null },
    // Set once, when the "voucher sold" admin notification has been dispatched.
    // Independent of customer email so email retries never re-notify the sale.
    adminNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ fulfillmentStatus: 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
