import mongoose from 'mongoose';

/**
 * PTE Exam Booking — data-driven booking service products.
 *
 * Every field shown on the storefront's "PTE Exam Booking" cards (name,
 * description, badge, image, pricing, feature bullets, CTA) lives HERE, not in
 * frontend code. The public catalog API only serves `status: 'published'` and
 * `active: true` records; the admin edits drafts and publishes when ready.
 *
 * Pricing is the SINGLE source of truth for the cart: when a buyer clicks
 * "Book Now", the frontend only sends the product _id, and the backend
 * re-prices the line from `pricing.bookingPrice` at order creation
 * (see paymentController.resolveOrderLineItems).
 */

export const PTE_BOOKING_PRODUCT_STATUSES = ['draft', 'published'];

export const PTE_BOOKING_CURRENCIES = ['INR', 'USD'];

const pteBookingFeatureSchema = new mongoose.Schema(
  {
    text: { type: String, trim: true, default: '', maxlength: 200 },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const pteBookingButtonSchema = new mongoose.Schema(
  {
    text: { type: String, trim: true, default: '' },
    href: { type: String, trim: true, default: '' },
    visible: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const pteBookingPricingSchema = new mongoose.Schema(
  {
    bookingPrice: { type: Number, required: true, min: 0 },
    standardPrice: { type: Number, default: 0, min: 0 },
    currency: { type: String, enum: PTE_BOOKING_CURRENCIES, default: 'INR' },
    showStandardPrice: { type: Boolean, default: true },
    showSavingsBadge: { type: Boolean, default: true },
  },
  { _id: false }
);

const pteBookingAuditSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    adminEmail: { type: String, default: '', trim: true },
    changes: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const pteBookingProductSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    name: { type: String, required: true, trim: true },
    shortDescription: { type: String, trim: true, default: '' },
    serviceLabel: { type: String, trim: true, default: 'EXAM BOOKING SERVICE' },
    badgeText: { type: String, trim: true, default: '' },
    badgeTint: { type: String, trim: true, default: '#FF005C' },
    image: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    imageAlt: { type: String, default: '' },
    pricing: { type: pteBookingPricingSchema, default: () => ({ bookingPrice: 0 }) },
    features: { type: [pteBookingFeatureSchema], default: [] },
    button: { type: pteBookingButtonSchema, default: () => ({}) },
    active: { type: Boolean, default: true, index: true },
    displayOrder: { type: Number, default: 0 },
    status: { type: String, enum: PTE_BOOKING_PRODUCT_STATUSES, default: 'draft', index: true },
    auditHistory: { type: [pteBookingAuditSchema], default: [] },
  },
  { timestamps: true }
);

pteBookingProductSchema.index({ status: 1, active: 1, displayOrder: 1 });
pteBookingProductSchema.index({ displayOrder: 1, createdAt: 1 });

export const PTEBookingProduct = mongoose.model('PTEBookingProduct', pteBookingProductSchema);