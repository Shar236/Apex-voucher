import mongoose from 'mongoose';

/**
 * A privacy-safe, durable record of a GENUINE, payment-verified purchase.
 *
 * Single source of truth for:
 *   - the public "recent purchase" social-proof toast (via SSE), and
 *   - the admin "🎉 New Purchase" notification card.
 *
 * Created ONLY from the fulfilment gate (paymentController.fulfillVerifiedOrder)
 * AFTER a Razorpay payment is cryptographically verified and the order is
 * legitimately PAID. Never created for a pending / failed / cancelled / refunded
 * order, and never from a frontend action.
 *
 * SECURITY: this document deliberately holds NO voucher code, email, phone,
 * full name, payment id or amount. The only field here that is not safe to
 * broadcast publicly is `orderNo` — it is used for the ADMIN card only and is
 * never included in the public SSE payload (see services/purchaseProof.js).
 */
const purchaseEventSchema = new mongoose.Schema(
  {
    // One event per order — the unique index makes recording idempotent across
    // verify / webhook / reconcile races and replays.
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
      index: true,
    },
    orderNo: { type: String, required: true },
    // Product name as it appeared on the order line, e.g. "PTE Academic Voucher".
    productName: { type: String, required: true, trim: true },
    // Same, with a trailing "Voucher/Code" stripped, e.g. "PTE Academic".
    productLabel: { type: String, default: '', trim: true },
    voucherType: { type: String, default: 'EXAM', trim: true },
    quantity: { type: Number, default: 1, min: 1 },
    // Privacy-safe FIRST name only (validated), or null → "A customer".
    displayName: { type: String, default: null, trim: true },
    // true  → a code was allocated instantly (order FULFILLED)
    // false → payment captured, voucher in manual fulfilment (order PROCESSING)
    voucherIssued: { type: Boolean, default: false },
    // Pre-rendered public sentence, e.g.
    // "Rahul has successfully purchased a PTE Academic voucher."
    message: { type: String, required: true },
    source: { type: String, default: 'STOREFRONT' },
  },
  { timestamps: true }
);

purchaseEventSchema.index({ createdAt: -1 });

export const PurchaseEvent = mongoose.model('PurchaseEvent', purchaseEventSchema);
