import mongoose from 'mongoose';

/**
 * Post-payment manual fulfillment request.
 *
 * Created AFTER a verified, captured payment when no voucher code is available
 * in inventory for the purchased product. Unlike the pre-payment VoucherRequest
 * flow, the customer has ALREADY PAID, so this record represents a paid order
 * that awaits a voucher code from the admin/client.
 *
 * Lifecycle:
 *   PROCESSING  — payment captured, waiting for the admin/client to supply a code
 *   DELIVERED   — voucher assigned to the order + sent to the customer
 *   CANCELLED   — closed by the admin (e.g. refund issued) without delivery
 *   FAILED      — delivery attempted but permanently failed
 */
export const FULFILLMENT_REQUEST_STATUSES = [
  'PROCESSING',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
];

const activitySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    adminEmail: { type: String, default: '', trim: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const fulfillmentRequestSchema = new mongoose.Schema(
  {
    requestId: {
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
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    customerEmail: { type: String, required: true, trim: true, lowercase: true },

    // Payment + order linkage.
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
      index: true,
    },
    orderNo: { type: String, required: true, index: true },
    razorpayPaymentId: { type: String, default: null },
    razorpayOrderId: { type: String, default: null },

    // Exact product/purchase snapshot.
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    productName: { type: String, required: true, trim: true },
    productSlug: { type: String, trim: true, default: '' },
    voucherType: { type: String, required: true, uppercase: true, trim: true },
    quantity: { type: Number, default: 1, min: 1 },
    amountPaid: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: FULFILLMENT_REQUEST_STATUSES,
      default: 'PROCESSING',
      index: true,
    },

    // Assigned voucher (populated on delivery).
    voucherCode: { type: String, default: null, uppercase: true, trim: true },
    voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'VoucherCode', default: null },
    deliveredAt: { type: Date, default: null },

    emailStatus: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    emailError: { type: String, default: null },

    adminNotes: { type: String, default: '', trim: true, maxlength: 2000 },
    activityHistory: [activitySchema],

    cancelledAt: { type: Date, default: null },
    cancelledReason: { type: String, default: '' },
  },
  { timestamps: true }
);

fulfillmentRequestSchema.index({ status: 1, createdAt: -1 });
fulfillmentRequestSchema.index({ userId: 1, status: 1 });

export const FulfillmentRequest = mongoose.model(
  'FulfillmentRequest',
  fulfillmentRequestSchema
);
