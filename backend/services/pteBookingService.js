import { PTEBookingRequest, PTE_EXAM_TYPES, PTE_BOOKING_STATUSES, Order } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { generatePTEBookingRequestId, escapeRegex } from '../utils/index.js';
import {
  sendPTEBookingConfirmationToCustomer,
  sendPTEBookingAdminNotification,
  sendPTEBookingStatusUpdateToCustomer,
} from './email.js';

const NAME_MAX = 80;
const MESSAGE_MAX = 1000;
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

const VALID_TIMES = ['Morning', 'Afternoon', 'Evening', 'Any Time'];

const isValidEmail = (email) => /^\S+@\S+\.\S+$/.test(String(email || ''));

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const parseDateField = (value, label, errors) => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${label} is not a valid date`);
    return null;
  }
  if (date < startOfToday()) {
    errors.push(`${label} cannot be in the past`);
    return null;
  }
  return date;
};

export const validateBookingRequestPayload = (payload = {}) => {
  const errors = [];
  const fullName = String(payload.fullName || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const phone = String(payload.phone || '').trim();
  const examType = String(payload.examType || '').trim();
  const preferredCity = String(payload.preferredCity || '').trim();
  const preferredTestCentre = String(payload.preferredTestCentre || '').trim();
  const preferredTime = String(payload.preferredTime || 'Any Time').trim();
  const message = String(payload.additionalRequirements || payload.message || '').trim();

  if (!fullName || fullName.length < 2) errors.push('Full name is required');
  if (fullName.length > NAME_MAX) errors.push('Full name is too long');
  if (!isValidEmail(email)) errors.push('A valid email address is required');
  if (!phone || phone.replace(/\D/g, '').length < 6) errors.push('A valid phone number is required');
  if (!PTE_EXAM_TYPES.includes(examType)) errors.push('A valid PTE exam type is required');
  if (!preferredCity) errors.push('Preferred city is required');
  if (message.length > MESSAGE_MAX) errors.push('Requirements text is too long');
  if (payload.termsAccepted !== true) errors.push('You must confirm the booking assistance terms');

  const preferredDate = parseDateField(payload.preferredDate, 'Preferred date', errors);
  const alternativeDate = parseDateField(payload.alternativeDate, 'Alternative date', errors);

  if (errors.length) {
    return { errors };
  }

  return {
    errors: null,
    data: {
      fullName,
      email,
      phone,
      examType,
      preferredCity,
      preferredTestCentre,
      preferredDate,
      preferredTime: VALID_TIMES.includes(preferredTime) ? preferredTime : 'Any Time',
      alternativeDate,
      message,
      termsAccepted: true,
    },
  };
};

const findRecentDuplicate = async (data) => {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  return PTEBookingRequest.findOne({
    email: data.email,
    phone: data.phone,
    examType: data.examType,
    createdAt: { $gte: since },
  }).lean();
};

/**
 * Request Service — single entry point for PTE booking assistance requests.
 */
export const createBookingRequest = async (rawPayload, userId = null) => {
  const { errors, data } = validateBookingRequestPayload(rawPayload);
  if (errors) {
    throw new AppError(errors.join('; '), 400, 'VALIDATION_ERROR');
  }

  const duplicate = await findRecentDuplicate(data);
  if (duplicate) {
    return { booking: duplicate, duplicate: true };
  }

  const initialActivity = {
    status: 'New',
    note: 'Booking assistance request submitted by customer',
    timestamp: new Date(),
  };

  const booking = await PTEBookingRequest.create({
    ...data,
    userId: userId || null,
    requestId: generatePTEBookingRequestId(),
    status: 'New',
    bookingProvider: 'MANUAL',
    activityHistory: [initialActivity],
  });

  sendPTEBookingConfirmationToCustomer(booking).catch((err) =>
    console.error('[pte-booking:email] customer confirmation failed:', err.message)
  );
  sendPTEBookingAdminNotification(booking).catch((err) =>
    console.error('[pte-booking:email] admin notification failed:', err.message)
  );

  return { booking, duplicate: false };
};

export const listBookingRequests = async (query = {}) => {
  const { status, examType, search, dateRange, dateFrom, dateTo, page = 1, limit = 50 } = query;
  const filter = {};
  if (status && status !== 'All') filter.status = status;
  if (examType && examType !== 'All') filter.examType = examType;
  if (search) {
    const s = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ fullName: s }, { email: s }, { phone: s }, { requestId: s }, { preferredCity: s }];
  }

  if (dateRange) {
    const now = new Date();
    if (dateRange === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filter.createdAt = { $gte: todayStart };
    } else if (dateRange === '7d') {
      const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filter.createdAt = { $gte: d7 };
    } else if (dateRange === '30d') {
      const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filter.createdAt = { $gte: d30 };
    }
  } else if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (p - 1) * l;

  const [rows, total] = await Promise.all([
    PTEBookingRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l).lean(),
    PTEBookingRequest.countDocuments(filter),
  ]);

  return { rows, total, page: p, pages: Math.ceil(total / l) };
};

export const getBookingRequestById = (id) => PTEBookingRequest.findById(id);

export const updateBookingRequestStatus = async (id, { status, adminNotes, confirmationDetails, adminUser }) => {
  const booking = await PTEBookingRequest.findById(id);
  if (!booking) {
    throw new AppError('PTE booking request not found', 404, 'NOT_FOUND');
  }
  const oldStatus = booking.status;
  const isStatusChanged = status && status !== oldStatus;

  if (status) {
    if (!PTE_BOOKING_STATUSES.includes(status)) {
      throw new AppError('Invalid status value', 400, 'VALIDATION_ERROR');
    }

    if (status === 'Booking Confirmed') {
      const mergedConfirmation = {
        ...(booking.confirmationDetails || {}),
        ...(confirmationDetails || {}),
      };

      const ref = String(mergedConfirmation.bookingReference || '').trim();
      const centre = String(mergedConfirmation.confirmedCentre || '').trim();
      const city = String(mergedConfirmation.confirmedCity || '').trim();
      const time = String(mergedConfirmation.confirmedTime || '').trim();
      const instructions = String(mergedConfirmation.importantInstructions || '').trim();
      const dateVal = mergedConfirmation.confirmedDate;

      if (!ref || !centre || !city || !time || !instructions || !dateVal) {
        throw new AppError(
          'Official Pearson booking details (Official Pearson Booking Reference, Confirmed Test Centre, Confirmed City, Confirmed Date, Confirmed Time, and Important Instructions) are required before confirming the booking.',
          400,
          'BOOKING_CONFIRMATION_DETAILS_REQUIRED'
        );
      }
    }

    booking.status = status;
  }

  if (adminNotes !== undefined) {
    booking.adminNotes = adminNotes;
  }

  if (confirmationDetails) {
    booking.confirmationDetails = {
      ...(booking.confirmationDetails || {}),
      ...confirmationDetails,
    };
  }

  if (isStatusChanged || adminNotes || confirmationDetails) {
    const activityEntry = {
      status: status || oldStatus,
      note: adminNotes || (isStatusChanged ? `Status updated from ${oldStatus} to ${status}` : ''),
      adminId: adminUser?._id || null,
      adminEmail: adminUser?.email || '',
      confirmationDetails: confirmationDetails || null,
      timestamp: new Date(),
    };
    booking.activityHistory = booking.activityHistory || [];
    booking.activityHistory.push(activityEntry);
  }

  await booking.save();

  // Keep linked order synchronized with PTE booking progression
  if (booking.orderId) {
    if (status === 'Booking Confirmed') {
      await Order.findByIdAndUpdate(booking.orderId, {
        $set: {
          orderStatus: 'FULFILLED',
          fulfillmentStatus: 'FULFILLED',
        },
      }).catch((err) => console.error('[pte-booking:order-update-failed]', err.message));
    } else if (status === 'Cancelled / Refund Required') {
      await Order.findByIdAndUpdate(booking.orderId, {
        $set: {
          orderStatus: 'CANCELLED',
        },
      }).catch((err) => console.error('[pte-booking:order-update-failed]', err.message));
    }
  }

  if (isStatusChanged) {
    sendPTEBookingStatusUpdateToCustomer(
      booking,
      status,
      adminNotes,
      booking.confirmationDetails
    ).catch((err) => console.error('[pte-booking:email] status update failed:', err.message));
  }

  return { booking, oldStatus };
};

export const listMyBookingRequests = (userId) =>
  PTEBookingRequest.find({ userId }).sort({ createdAt: -1 }).lean();

export const getPTEBookingStats = async () => {
  const [total, byStatus] = await Promise.all([
    PTEBookingRequest.countDocuments(),
    PTEBookingRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const stats = {
    total,
    new: 0,
    paymentReceived: 0,
    pending: 0,
    processing: 0,
    confirmed: 0,
    failed: 0,
    cancelled: 0,
    contacted: 0,
    inProgress: 0,
    waitingForCustomer: 0,
    completed: 0,
    rejected: 0,
  };

  for (const item of byStatus) {
    const s = String(item._id || '').toLowerCase();
    if (s === 'payment received') {
      stats.paymentReceived = item.count;
      stats.new += item.count;
    } else if (s.includes('pending') || s === 'new') {
      stats.pending += item.count;
      stats.new += item.count;
    } else if (s.includes('processing') || s.includes('progress')) {
      stats.processing += item.count;
      stats.inProgress += item.count;
    } else if (s.includes('confirmed') || s === 'completed') {
      stats.confirmed += item.count;
      stats.completed += item.count;
    } else if (s.includes('failed') || s.includes('unable')) {
      stats.failed = item.count;
    } else if (s.includes('cancel') || s.includes('refund')) {
      stats.cancelled += item.count;
    } else if (s === 'contacted') {
      stats.contacted = item.count;
    } else if (s.includes('waiting')) {
      stats.waitingForCustomer = item.count;
    } else if (s === 'rejected') {
      stats.rejected = item.count;
    }
  }

  return stats;
};
