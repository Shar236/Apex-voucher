import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    adminEmail: {
      type: String,
      default: 'system@apexvouchers.in',
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      required: true,
      enum: ['Product', 'VoucherCode', 'Order', 'Promotion', 'User', 'System', 'Video', 'Setting', 'PTEBookingRequest', 'PTEBookingProduct', 'VoucherRequest', 'FulfillmentRequest', 'Award', 'PageSEO', 'BlogPost', 'Redirect', 'Campaign'],
      index: true,
    },
    resourceId: {
      type: String,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
