import { Order } from '../models/Order.js';
import { VoucherCode } from '../models/VoucherCode.js';
import { FulfillmentRequest } from '../models/FulfillmentRequest.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { AppError } from '../middleware/errorHandler.js';
import { safeUser } from '../utils/index.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { sendEmailOtpCode, sendEmailChangedSecurityNotice } from '../services/email.js';
import {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  checkOtpSendWindow,
  maskEmail,
  maskPhone,
  OTP_EXPIRY_MS,
  OTP_MAX_VERIFY_ATTEMPTS,
} from '../utils/otp.js';
import { comparePassword, hashPassword } from '../middleware/auth.js';
import { validatePasswordStrength } from '../utils/password.js';
import { config } from '../config/index.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const avatarsDir = path.join(__dirname, '../public/uploads/avatars');

// ── Helpers ───────────────────────────────────────────────────────────────────

const NAME_REGEX = /^[\p{L}\p{M}' \-\.]+$/u;
const MAX_NAME_LENGTH = 80;
const MIN_NAME_LENGTH = 2;

const validateName = (name) => {
  if (typeof name !== 'string') return 'Name is required';
  const trimmed = name.trim();
  if (trimmed.length < MIN_NAME_LENGTH) return `Name must be at least ${MIN_NAME_LENGTH} characters`;
  if (trimmed.length > MAX_NAME_LENGTH) return `Name must be at most ${MAX_NAME_LENGTH} characters`;
  if (!NAME_REGEX.test(trimmed)) return 'Name contains invalid characters';
  return null;
};

const validatePhone = (phone, country) => {
  if (!phone || phone.trim() === '') return { error: null, formatted: null, countryCode: null };
  try {
    const parsed = parsePhoneNumberFromString(phone, country || undefined);
    if (!parsed || !parsed.isValid()) {
      return { error: 'Invalid phone number for the selected country' };
    }
    return {
      error: null,
      formatted: parsed.format('E.164'),
      countryCode: parsed.country || country || null,
    };
  } catch {
    return { error: 'Could not parse phone number' };
  }
};

// ── Get Account ───────────────────────────────────────────────────────────────

export const getAccount = async (req, res, next) => {
  try {
    res.json({ success: true, user: safeUser(req.user) });
  } catch (err) {
    next(err);
  }
};

// ── Update Profile ────────────────────────────────────────────────────────────

export const updateProfile = async (req, res, next) => {
  try {
    // Name only — email changes go through the OTP-verified flow below (sendEmailOtp/
    // verifyEmailOtp), phone changes go through the password-confirmed updatePhone below.
    const { name } = req.body;
    const user = req.user;

    if (name === undefined) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const nameError = validateName(name);
    if (nameError) {
      return res.status(400).json({ success: false, message: nameError, errors: { name: nameError } });
    }

    user.name = name.trim();
    await user.save();
    res.json({ success: true, user: safeUser(user), message: 'Profile updated successfully' });
  } catch (err) {
    next(err);
  }
};

// ── Upload Profile Image ──────────────────────────────────────────────────────

export const uploadProfileImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('No image file provided', 400, 'NO_FILE'));
    }

    const user = req.user;
    const uploadedPath = req.file.path;
    const ext = path.extname(req.file.filename).toLowerCase();

    // Compress/resize with sharp (max 512x512, quality 80)
    const optimizedFilename = `avatar_${user._id}_${Date.now()}.webp`;
    const optimizedPath = path.join(avatarsDir, optimizedFilename);

    try {
      await sharp(uploadedPath)
        .resize(512, 512, { fit: 'cover', position: 'centre' })
        .webp({ quality: 80 })
        .toFile(optimizedPath);

      // Remove the original unoptimized upload
      fs.unlink(uploadedPath, () => {});
    } catch (sharpErr) {
      // If sharp fails, fall back to using the original file
      console.error('[avatar] Sharp processing failed, using original:', sharpErr.message);
      // Keep original file as-is
      const fallbackUrl = `/uploads/avatars/${req.file.filename}`;
      // Delete old avatar if exists
      if (user.profileImageUrl) {
        const oldPath = path.join(__dirname, '../public', user.profileImageUrl);
        fs.unlink(oldPath, () => {});
      }
      user.profileImageUrl = fallbackUrl;
      await user.save();
      return res.json({ success: true, user: safeUser(user), message: 'Profile picture updated' });
    }

    // Delete old avatar if exists
    if (user.profileImageUrl) {
      const oldPath = path.join(__dirname, '../public', user.profileImageUrl);
      fs.unlink(oldPath, () => {});
    }

    user.profileImageUrl = `/uploads/avatars/${optimizedFilename}`;
    await user.save();

    res.json({ success: true, user: safeUser(user), message: 'Profile picture updated' });
  } catch (err) {
    // Clean up uploaded file on error
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    next(err);
  }
};

// ── Remove Profile Image ─────────────────────────────────────────────────────

export const removeProfileImage = async (req, res, next) => {
  try {
    const user = req.user;
    if (user.profileImageUrl) {
      const oldPath = path.join(__dirname, '../public', user.profileImageUrl);
      fs.unlink(oldPath, () => {});
    }
    user.profileImageUrl = null;
    await user.save();
    res.json({ success: true, user: safeUser(user), message: 'Profile picture removed' });
  } catch (err) {
    next(err);
  }
};

// ── Change Email: Send OTP ──────────────────────────────────────────────────────

export const sendEmailOtp = async (req, res, next) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail || !/^\S+@\S+\.\S+$/.test(newEmail)) {
      return next(new AppError('Valid email address required', 400, 'INVALID_EMAIL'));
    }

    const normalizedEmail = newEmail.trim().toLowerCase();
    if (normalizedEmail === req.user.email) {
      return next(new AppError('New email is the same as current email', 400, 'SAME_EMAIL'));
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return next(new AppError('This email address is already associated with another account.', 409, 'EMAIL_IN_USE'));
    }

    const user = await User.findById(req.user._id).select(
      '+pendingEmailRequestedAt +pendingEmailSendCount +pendingEmailWindowStart'
    );
    const window = checkOtpSendWindow(user.pendingEmailRequestedAt, user.pendingEmailSendCount, user.pendingEmailWindowStart);
    if (!window.allowed) {
      const message =
        window.reason === 'COOLDOWN'
          ? `Please wait ${Math.ceil(window.retryAfterMs / 1000)} seconds before requesting another code.`
          : 'Too many verification codes requested. Please try again later.';
      return next(new AppError(message, 429, window.reason));
    }

    const prevWindowState = {
      pendingEmailRequestedAt: user.pendingEmailRequestedAt,
      pendingEmailSendCount: user.pendingEmailSendCount,
      pendingEmailWindowStart: user.pendingEmailWindowStart,
    };
    const otp = generateOtp();
    user.pendingEmail = normalizedEmail;
    user.pendingEmailOtpHash = hashOtp(otp);
    user.pendingEmailOtpExpires = new Date(Date.now() + OTP_EXPIRY_MS);
    user.pendingEmailOtpAttempts = 0;
    user.pendingEmailRequestedAt = window.nextRequestedAt;
    user.pendingEmailSendCount = window.nextSendCount;
    user.pendingEmailWindowStart = window.nextWindowStart;
    await user.save();

    // sendEmail() returns { sent:false } instead of throwing — must check it.
    const mail = await sendEmailOtpCode(req.user, normalizedEmail, otp);
    if (!mail.sent) {
      console.error(`[email:otp] flow=change-email userId=${user._id} recipient=${maskEmail(normalizedEmail)} status=failed providerError=${mail.error || 'unknown'}`);
      // roll back the send window so the failed attempt doesn't burn the quota
      user.pendingEmailRequestedAt = prevWindowState.pendingEmailRequestedAt;
      user.pendingEmailSendCount = prevWindowState.pendingEmailSendCount;
      user.pendingEmailWindowStart = prevWindowState.pendingEmailWindowStart;
      await user.save().catch(() => {});
      return next(new AppError('Unable to send verification email. Please try again.', 502, 'EMAIL_SEND_FAILED'));
    }
    console.log(`[email:otp] flow=change-email userId=${user._id} recipient=${maskEmail(normalizedEmail)} status=accepted messageId=${mail.messageId || 'n/a'}`);

    res.json({
      success: true,
      message: `Verification code sent to ${maskEmail(normalizedEmail)}.`,
      maskedDestination: maskEmail(normalizedEmail),
    });
  } catch (err) {
    next(err);
  }
};

// ── Change Email: Verify OTP ────────────────────────────────────────────────────

export const verifyEmailOtp = async (req, res, next) => {
  try {
    const { otp } = req.body || {};
    if (!otp) {
      return next(new AppError('Verification code required', 400, 'NO_OTP'));
    }

    const user = await User.findById(req.user._id).select(
      '+pendingEmail +pendingEmailOtpHash +pendingEmailOtpExpires +pendingEmailOtpAttempts'
    );

    if (!user.pendingEmail || !user.pendingEmailOtpHash) {
      return next(new AppError('No pending email change found. Please start again.', 400, 'NO_PENDING_CHANGE'));
    }

    if (!user.pendingEmailOtpExpires || user.pendingEmailOtpExpires < new Date()) {
      return next(new AppError('The verification code has expired. Please request a new code.', 400, 'OTP_EXPIRED'));
    }

    if (user.pendingEmailOtpAttempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      return next(new AppError('Too many verification attempts. Please request a new code.', 429, 'OTP_MAX_ATTEMPTS'));
    }

    if (!verifyOtpHash(otp, user.pendingEmailOtpHash)) {
      user.pendingEmailOtpAttempts += 1;
      await user.save();
      return next(new AppError('Incorrect verification code. Please try again.', 400, 'OTP_INVALID'));
    }

    // Re-check the pending email isn't taken in the meantime (race condition guard)
    const existing = await User.findOne({ email: user.pendingEmail, _id: { $ne: user._id } });
    if (existing) {
      user.pendingEmail = undefined;
      user.pendingEmailOtpHash = undefined;
      user.pendingEmailOtpExpires = undefined;
      user.pendingEmailOtpAttempts = 0;
      await user.save();
      return next(new AppError('This email address is already associated with another account.', 409, 'EMAIL_IN_USE'));
    }

    const oldEmail = user.email;
    const newEmail = user.pendingEmail;
    user.email = newEmail;
    user.emailVerified = true;
    user.pendingEmail = undefined;
    user.pendingEmailOtpHash = undefined;
    user.pendingEmailOtpExpires = undefined;
    user.pendingEmailOtpAttempts = 0;
    user.pendingEmailRequestedAt = undefined;
    user.pendingEmailSendCount = 0;
    await user.save();

    sendEmailChangedSecurityNotice(user, oldEmail, newEmail).catch((err) =>
      console.error('[email-otp] Failed to send security notice:', err.message)
    );
    AuditLog.create({
      adminId: user._id,
      adminEmail: newEmail,
      action: 'user.email_changed',
      resourceType: 'User',
      resourceId: String(user._id),
      details: { from: maskEmail(oldEmail), to: maskEmail(newEmail) },
      ipAddress: req.ip,
    }).catch(() => {});

    res.json({ success: true, user: safeUser(user), message: 'Email updated successfully' });
  } catch (err) {
    next(err);
  }
};

// ── Change Phone (no SMS verification available yet — direct, password-confirmed update) ──
//
// SMS delivery is not wired up (no paid SMS provider). Phone numbers are still validated,
// normalized, and kept unique, but changing one does not go through an OTP gate. Current
// password is required as a lightweight security check in place of the OTP that would
// normally confirm this sensitive change. phoneVerified is always reset to false — a
// number is only ever marked verified once SMS verification is enabled in the future.

export const updatePhone = async (req, res, next) => {
  try {
    const { phone, phoneCountry, currentPassword } = req.body;

    if (!currentPassword) {
      return next(new AppError('Please confirm your current password to change your phone number.', 400, 'PASSWORD_REQUIRED'));
    }

    const { error, formatted, countryCode } = validatePhone(phone, phoneCountry);
    if (error || !formatted) {
      return next(new AppError(error || 'Valid phone number required', 400, 'INVALID_PHONE'));
    }

    if (formatted === req.user.phone) {
      return next(new AppError('New phone number is the same as current phone number', 400, 'SAME_PHONE'));
    }

    const existing = await User.findOne({ phone: formatted, _id: { $ne: req.user._id } });
    if (existing) {
      return next(new AppError('This phone number is already associated with another account.', 409, 'PHONE_IN_USE'));
    }

    const user = await User.findById(req.user._id).select('+passwordHash');
    const passwordOk = await comparePassword(currentPassword, user.passwordHash);
    if (!passwordOk) {
      return next(new AppError('Current password is incorrect', 401, 'WRONG_PASSWORD'));
    }

    user.phone = formatted;
    user.phoneCountry = countryCode || phoneCountry || null;
    user.phoneVerified = false;
    await user.save();

    AuditLog.create({
      adminId: user._id,
      adminEmail: user.email,
      action: 'user.phone_changed',
      resourceType: 'User',
      resourceId: String(user._id),
      details: { to: maskPhone(user.phone) },
      ipAddress: req.ip,
    }).catch(() => {});

    res.json({ success: true, user: safeUser(user), message: 'Phone number updated successfully' });
  } catch (err) {
    next(err);
  }
};

// ── Change Password ───────────────────────────────────────────────────────────

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return next(new AppError('Current and new password required', 400, 'MISSING_FIELDS'));
    }
    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      return next(new AppError(strengthError, 400, 'WEAK_PASSWORD'));
    }

    // Fetch user with password hash
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) {
      return next(new AppError('User not found', 404, 'USER_NOT_FOUND'));
    }

    const isMatch = await comparePassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      return next(new AppError('Current password is incorrect', 401, 'WRONG_PASSWORD'));
    }

    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    AuditLog.create({
      adminId: user._id,
      adminEmail: user.email,
      action: 'user.password_changed',
      resourceType: 'User',
      resourceId: String(user._id),
      ipAddress: req.ip,
    }).catch(() => {});

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};

// ── Logout ───────────────────────────────────────────────────────────────────
// JWT auth is stateless — there is no server-side session to revoke. This endpoint
// exists for API symmetry and audit logging; the client is responsible for
// discarding its stored token.

export const logout = async (req, res, next) => {
  try {
    AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'user.logout',
      resourceType: 'User',
      resourceId: String(req.user._id),
      ipAddress: req.ip,
    }).catch(() => {});
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// ── Dashboard Stats ───────────────────────────────────────────────────────────

export const dashboardStats = async (req, res, next) => {
  try {
    const uid = req.user._id;
    // Matches the visible "My Orders" list — request-sourced orders are excluded.
    const totalOrders = await Order.countDocuments({
      userId: uid,
      orderStatus: { $nin: ['CANCELLED', 'FAILED'] },
      source: { $ne: 'VOUCHER_REQUEST' },
    });
    const myVouchersAgg = await VoucherCode.aggregate([
      { $match: { userId: uid } },
      {
        $group: {
          _id: null,
          active: { $sum: { $cond: [{ $in: ['$status', ['ASSIGNED', 'SOLD']] }, 1, 0] } },
          used: { $sum: { $cond: [{ $eq: ['$status', 'USED'] }, 1, 0] } },
          expiring: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', ['ASSIGNED', 'SOLD']] },
                    { $lte: ['$expiryDate', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const savingsArr = await Order.aggregate([
      { $match: { userId: uid, orderStatus: { $in: ['PAID', 'FULFILLED'] } } },
      {
        $group: {
          _id: null,
          // Savings compare INR base price vs INR amount paid. USD orders
          // charge `total` in dollars — use their canonical baseAmountINR so
          // currencies are never mixed.
          totalPaid: { $sum: { $ifNull: ['$baseAmountINR', '$total'] } },
          totalOriginal: {
            $sum: { $sum: { $map: { input: '$items', in: { $multiply: ['$$this.originalPrice', '$$this.quantity'] } } } },
          },
        },
      },
    ]);
    const v = myVouchersAgg[0] || { active: 0, used: 0, expiring: 0 };
    const s = savingsArr[0] || { totalPaid: 0, totalOriginal: 0 };
    res.json({
      success: true,
      data: {
        totalOrders,
        activeVouchers: v.active,
        usedVouchers: v.used,
        expiringSoon: v.expiring,
        totalSaved: Math.max(0, Math.round((s.totalOriginal || 0) - (s.totalPaid || 0))),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── My Orders ─────────────────────────────────────────────────────────────────

export const myOrders = async (req, res, next) => {
  try {
    // Scoped to the authenticated user. Internal gateway plumbing
    // (processedEventIds, webhookStatus, paymentSessionId) is projected out.
    // Orders raised to fulfil a "Request Voucher" request are hidden here — the
    // VoucherRequest is that purchase's customer-facing record (see
    // "My Voucher Requests"). The voucher itself still appears in "My Vouchers".
    const orders = await Order.find({ userId: req.user.id, source: { $ne: 'VOUCHER_REQUEST' } })
      .select('-processedEventIds -webhookStatus -paymentSessionId -cashfreeOrderId -__v')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
};

// ── My Vouchers ───────────────────────────────────────────────────────────────

export const myVouchers = async (req, res, next) => {
  try {
    // Ownership is enforced here — a customer only ever sees vouchers whose
    // userId is their own authenticated id. Order/product ids in the request
    // are irrelevant; this query is not parameterised by anything the client sends.
    const vouchers = await VoucherCode.find({ userId: req.user.id })
      .populate('productId', 'name brand category validityMonths voucherType officialWebsiteUrl redemptionSteps')
      .populate(
        'orderId',
        'orderNo total paymentStatus orderStatus fulfillmentStatus emailStatus paidAt createdAt razorpayPaymentId paymentReference items'
      )
      .sort({ assignedAt: -1, createdAt: -1 })
      .lean();

    const sanitized = vouchers.map((v) => {
      const o = v.orderId || {};
      const productName = v.productId?.name || '';
      const brand = v.productId?.brand || '';
      const validity = v.productId?.validityMonths || 6;
      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(v.expiryDate) - Date.now()) / (1000 * 60 * 60 * 24))
      );
      let status = v.status;
      if ((status === 'ASSIGNED' || status === 'SOLD') && daysLeft <= 0) status = 'EXPIRED';

      // Per-voucher share of the order total (for display).
      const orderQty = (o.items || []).reduce((s, it) => s + (it.quantity || 1), 0) || 1;
      const amountPaid = o.total != null ? Math.round(o.total / orderQty) : null;

      return {
        id: v._id,
        code: v.code,
        status,
        voucherType: v.voucherType || v.productId?.voucherType || '',
        expiryDate: v.expiryDate,
        assignedAt: v.assignedAt || v.soldAt || null,
        purchaseDate: o.paidAt || v.soldAt || v.assignedAt || o.createdAt || null,
        usedAt: v.usedAt || null,
        transferredTo: v.transferredTo || null,
        productName,
        brand,
        validity,
        daysRemaining: daysLeft,
        officialWebsiteUrl: v.productId?.officialWebsiteUrl || '',
        // Order context — so the account can render "Paid • Delivered" etc.
        orderId: o._id || null,
        orderNo: o.orderNo || null,
        orderStatus: o.orderStatus || null,
        paymentStatus: o.paymentStatus || null,
        fulfillmentStatus: o.fulfillmentStatus || null,
        emailStatus: o.emailStatus || null,
        amountPaid,
        orderTotal: o.total ?? null,
        paymentReference: o.razorpayPaymentId || o.paymentReference || null,
      };
    });
    res.json({ success: true, data: sanitized });
  } catch (err) {
    next(err);
  }
};

// ── My Fulfillment Requests (paid orders awaiting manual voucher delivery) ────

export const myFulfillments = async (req, res, next) => {
  try {
    const requests = await FulfillmentRequest.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    const sanitized = requests.map((r) => ({
      id: r._id,
      requestId: r.requestId,
      productName: r.productName,
      voucherType: r.voucherType,
      quantity: r.quantity,
      amountPaid: r.amountPaid,
      currency: r.currency,
      status: r.status,
      orderNo: r.orderNo,
      orderId: r.orderId,
      voucherCode: r.voucherCode || null,
      voucherId: r.voucherId || null,
      deliveredAt: r.deliveredAt || null,
      emailStatus: r.emailStatus || null,
      createdAt: r.createdAt,
    }));
    res.json({ success: true, data: sanitized });
  } catch (err) {
    next(err);
  }
};

export const transferVoucher = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetEmail } = req.body;
    if (!targetEmail || !/^\S+@\S+\.\S+$/.test(targetEmail)) {
      return next(new AppError('Valid target email required', 400));
    }
    const voucher = await VoucherCode.findOne({ _id: id, userId: req.user.id });
    if (!voucher) return next(new AppError('Voucher not found', 404));
    if (!['ASSIGNED', 'SOLD'].includes(voucher.status)) {
      return next(new AppError('Voucher not transferable', 400, 'NOT_TRANSFERABLE'));
    }
    voucher.transferredTo = targetEmail.trim();
    voucher.transferredAt = new Date();
    await voucher.save();
    res.json({ success: true, data: voucher });
  } catch (err) {
    next(err);
  }
};

// ── Mark Voucher Used ─────────────────────────────────────────────────────────

export const markVoucherUsed = async (req, res, next) => {
  try {
    const { id } = req.params;
    const voucher = await VoucherCode.findOne({ _id: id, userId: req.user.id });
    if (!voucher) return next(new AppError('Voucher not found', 404));
    if (!['ASSIGNED', 'SOLD'].includes(voucher.status)) {
      return next(new AppError('Voucher not markable as used', 400));
    }
    voucher.status = 'USED';
    voucher.usedAt = new Date();
    await voucher.save();
    res.json({ success: true, data: voucher });
  } catch (err) {
    next(err);
  }
};
