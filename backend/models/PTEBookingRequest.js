import mongoose from 'mongoose';

export const PTE_EXAM_TYPES = ['PTE Academic', 'PTE Core', 'PTE Academic UKVI'];

export const PTE_BOOKING_STATUSES = [
  'Payment Received',
  'Booking Request Pending',
  'Processing Booking',
  'Booking Confirmed',
  'Booking Failed / Unable to Book',
  'Cancelled / Refund Required',
  // Legacy / existing compatibility
  'New',
  'Contacted',
  'Processing',
  'Booking In Progress',
  'Waiting for Customer',
  'Completed',
  'Cancelled',
  'Rejected',
];

const activitySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    adminEmail: { type: String, default: '', trim: true },
    confirmationDetails: { type: Object, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const confirmationDetailsSchema = new mongoose.Schema(
  {
    bookingReference: { type: String, default: '', trim: true, maxlength: 100 },
    confirmedDate: { type: Date, default: null },
    confirmedTime: { type: String, default: '', trim: true, maxlength: 50 },
    confirmedCentre: { type: String, default: '', trim: true, maxlength: 200 },
    confirmedCity: { type: String, default: '', trim: true, maxlength: 100 },
    importantInstructions: { type: String, default: '', trim: true, maxlength: 2000 },
  },
  { _id: false }
);

const pteBookingRequestSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },
    orderNo: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    paymentId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    paymentStatus: {
      type: String,
      default: 'PAID',
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },

    examType: { type: String, required: true, enum: PTE_EXAM_TYPES },

    preferredCity: { type: String, required: true, trim: true, maxlength: 80 },
    preferredTestCentre: { type: String, default: '', trim: true, maxlength: 120 },
    preferredDate: { type: Date, default: null },
    preferredTime: {
      type: String,
      enum: ['Morning', 'Afternoon', 'Evening', 'Any Time', ''],
      default: 'Any Time',
    },
    alternativeDate: { type: Date, default: null },

    message: { type: String, default: '', trim: true, maxlength: 1000 },

    status: { type: String, enum: PTE_BOOKING_STATUSES, default: 'Booking Request Pending', index: true },
    adminNotes: { type: String, default: '', trim: true, maxlength: 2000 },

    confirmationDetails: { type: confirmationDetailsSchema, default: () => ({}) },
    activityHistory: [activitySchema],

    termsAccepted: { type: Boolean, required: true, default: false },

    // Future-ready hook: which booking provider handled/will handle this request.
    bookingProvider: { type: String, default: 'MANUAL' },
  },
  { timestamps: true }
);

pteBookingRequestSchema.index({ createdAt: -1 });
pteBookingRequestSchema.index({ status: 1, createdAt: -1 });
pteBookingRequestSchema.index({ examType: 1, createdAt: -1 });
pteBookingRequestSchema.index({ email: 1, phone: 1, examType: 1, createdAt: -1 });

export const PTEBookingRequest = mongoose.model('PTEBookingRequest', pteBookingRequestSchema);
