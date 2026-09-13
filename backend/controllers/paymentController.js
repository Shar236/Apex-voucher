import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { VoucherCode } from '../models/VoucherCode.js';
import { VoucherRequest } from '../models/VoucherRequest.js';
import { Promotion } from '../models/Promotion.js';
import { Campaign } from '../models/Campaign.js';
import { AuditLog } from '../models/AuditLog.js';
import { PTEBookingProduct } from '../models/PTEBookingProduct.js';
import { PTEBookingRequest } from '../models/PTEBookingRequest.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateOrderNo, generatePTEBookingRequestId } from '../utils/index.js';
import { runInTransaction } from '../utils/transaction.js';
import { applyPromotion } from '../services/promotions.js';
import {
  sendOrderConfirmation,
  sendAdminVoucherSaleNotification,
  sendAdminVoucherAssignmentFailureAlert,
  sendAdminEmailDeliveryFailureAlert,
  sendPTEBookingConfirmationToCustomer,
  sendPTEBookingAdminNotification,
} from '../services/email.js';
import { allocateVouchersForOrder, normalizeVoucherType } from '../services/voucherAllocation.js';
import { markVoucherRequestFulfilled } from '../services/voucherRequestService.js';
import { createFulfillmentRequestForOrder } from '../services/fulfillmentService.js';
import { emitPurchaseProof } from '../services/purchaseProof.js';
import { config } from '../config/index.js';
import { isValidObjectId } from '../config/db.js';
import { getCustomerCountry, getDisplayCurrency, isIndia } from '../services/geo.js';
import { getFxRate, convertInrToUsd } from '../services/fx.js';
import { convertOrderTotals, calculateRazorpayAmount, moneyLabel } from '../services/pricing.js';
import {
  isRazorpayConfigured,
  createRazorpayOrder,
  fetchRazorpayPayment,
  fetchRazorpayOrderPayments,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../services/razorpay.js';
import { assertPaymentOrderAllowed } from '../config/validateConfig.js';

/**
 * Structured, secret-safe fulfilment trace. Logs only identifiers + statuses —
 * never a full voucher code, key secret, webhook secret or customer PII.
 */
const fx = (stage, order, extra = {}) => {
  const safe = { ...extra };
  if (safe.code) safe.code = String(safe.code).replace(/.(?=.{4})/g, '•'); // just in case
  console.log(
    `[fulfillment] ${stage}` +
      ` order=${order?.orderNo || order?._id || '?'}` +
      ` rzpOrder=${order?.razorpayOrderId || '-'}` +
      ` rzpPayment=${order?.razorpayPaymentId || safe.razorpayPaymentId || '-'}` +
      ` pay=${order?.paymentStatus || '-'}/${order?.orderStatus || '-'}/${order?.fulfillmentStatus || '-'}` +
      (Object.keys(safe).length ? ` ${JSON.stringify(safe)}` : ''),
  );
};

const MAX_LINE_ITEMS = 20;
const MAX_LINE_ITEM_QUANTITY = 50;

/* ────────────────────────────────────────────────────────────────────────────
 * Trusted, server-side pricing. The frontend sends only { productId, quantity }.
 * Every price, discount and total is (re)computed here from the database.
 * ──────────────────────────────────────────────────────────────────────────── */
const getProductsWithPrices = async (lineItems) => resolveOrderLineItems(lineItems);

/**
 * Trusted, server-side pricing for cart items — exported for regression tests.
 *
 * Resolves each { productId, quantity } (optional durationKey) against the
 * database: voucher products from `Product`, PTE Exam Booking services from
 * `PTEBookingProduct`. The client NEVER sends a price — the unit price is
 * always re-read from the DB at order creation, so an admin price change is
 * reflected in the very next cart addition / checkout, and a tampered payload
 * cannot influence the charged amount.
 */
export const resolveOrderLineItems = async (lineItems) => {
  const ids = lineItems.map((it) => it.productId);
  if (ids.some((id) => !isValidObjectId(id))) {
    throw new AppError('Invalid product id in order items', 400, 'INVALID_PRODUCT_ID');
  }
  const found = await Product.find({ _id: { $in: ids }, active: true, archived: { $ne: true } });
  const map = Object.fromEntries(found.map((p) => [p._id.toString(), p]));
  const missingIds = ids.filter((id) => !map[String(id)]);
  let pteMap = {};
  if (missingIds.length > 0) {
    const pteFound = await PTEBookingProduct.find({
      _id: { $in: missingIds },
      status: 'published',
      active: true,
    });
    pteMap = Object.fromEntries(pteFound.map((p) => [p._id.toString(), p]));
  }
  const items = [];
  for (const it of lineItems) {
    const idStr = String(it.productId);
    const product = map[idStr];
    const pteProduct = pteMap[idStr];
    if (!product && !pteProduct) throw new AppError('Product not found or inactive', 400, 'PRODUCT_MISSING');
    if (product && product.comingSoon) throw new AppError(`${product.name} is not available for purchase yet`, 400, 'PRODUCT_COMING_SOON');

    const qtyRaw = Number(it.quantity);
    if (!Number.isFinite(qtyRaw) || !Number.isInteger(qtyRaw) || qtyRaw < 1) {
      throw new AppError('Quantity must be a whole number of at least 1', 400, 'INVALID_QUANTITY');
    }
    if (qtyRaw > MAX_LINE_ITEM_QUANTITY) {
      throw new AppError(`Maximum quantity per item is ${MAX_LINE_ITEM_QUANTITY}`, 400, 'QUANTITY_TOO_HIGH');
    }

    // ── PTE Exam Booking service: no voucher codes, price straight from the
    //    booking product's `pricing.bookingPrice`. Marked with a dedicated
    //    voucherType so voucher allocation skips it at fulfilment.
    if (pteProduct) {
      const bookingPrice = Number(pteProduct.pricing?.bookingPrice);
      const standardPrice = Number(pteProduct.pricing?.standardPrice) || 0;
      if (!Number.isFinite(bookingPrice) || bookingPrice <= 0) {
        throw new AppError(`${pteProduct.name} is not priced correctly. Please contact support.`, 400, 'PRODUCT_PRICE_INVALID');
      }
      items.push({
        productId: pteProduct._id,
        productName: pteProduct.name,
        slug: pteProduct.key || '',
        voucherType: 'PTE-BOOKING',
        brand: 'Pearson PTE',
        unitPrice: bookingPrice,
        originalPrice: standardPrice > 0 ? standardPrice : bookingPrice,
        quantity: qtyRaw,
        durationKey: null,
        durationLabel: null,
        validityDays: null,
      });
      continue;
    }

    // Duration variant pricing: when the buyer selected a duration (e.g. APS 1 Week),
    // price from that enabled option; otherwise fall back to the product's base price.
    const enabledDurations = Array.isArray(product.durationOptions)
      ? product.durationOptions.filter((o) => o?.enabled !== false)
      : [];
    let unitPrice = Number(product.sellingPrice);
    let originalPrice = Number(product.originalPrice);
    let validityDays = Number(product.validityDays);
    let durationKey = null;
    let durationLabel = null;

    const selectedKey = String(it.durationKey || '').toLowerCase();
    if (selectedKey && enabledDurations.length > 0) {
      const opt = enabledDurations.find((o) => String(o.key).toLowerCase() === selectedKey);
      if (!opt) {
        throw new AppError('The selected duration is not available for this product', 400, 'DURATION_UNAVAILABLE');
      }
      unitPrice = Number(opt.sellingPrice);
      originalPrice = Number(opt.originalPrice) || Number(product.originalPrice) || unitPrice;
      validityDays = Number(opt.validityDays) || Number(product.validityDays) || 7;
      durationKey = String(opt.key).toLowerCase();
      durationLabel = opt.label || '';
    } else if (enabledDurations.length > 0 && (!Number.isFinite(unitPrice) || unitPrice <= 0)) {
      const opt = enabledDurations[0];
      unitPrice = Number(opt.sellingPrice);
      originalPrice = Number(opt.originalPrice) || Number(product.originalPrice) || unitPrice;
      validityDays = Number(opt.validityDays) || Number(product.validityDays) || 7;
      durationKey = String(opt.key).toLowerCase();
      durationLabel = opt.label || '';
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new AppError(`${product.name} is not priced correctly. Please contact support.`, 400, 'PRODUCT_PRICE_INVALID');
    }
    const voucherType = normalizeVoucherType(product.voucherType, product);
    items.push({
      productId: product._id,
      productName: product.name,
      slug: product.slug || '',
      voucherType,
      brand: product.brand || '',
      unitPrice,
      originalPrice: Number.isFinite(originalPrice) && originalPrice > 0 ? originalPrice : unitPrice,
      quantity: qtyRaw,
      durationKey,
      durationLabel,
      validityDays,
    });
  }
  return items;
};

/**
 * Recompute discounts (promo + active campaign) from trusted data.
 * Returns { subtotal, promoDiscount, campaignDiscount, discountAmount, total, promoResult }.
 */
const computeOrderTotals = async ({ lineItems, promoCode, userId }) => {
  const subtotal = lineItems.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
  const productIds = lineItems.map((it) => it.productId);

  const promoResult = await applyPromotion(promoCode, subtotal, userId, productIds);
  const promoDiscount = Math.max(0, promoResult.discount || 0);

  const now = new Date();
  const activeCampaigns = await Campaign.find({
    status: { $in: ['ACTIVE', 'SCHEDULED'] },
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .sort({ priority: -1, createdAt: -1 })
    .lean();

  let campaignDiscount = 0;
  if (activeCampaigns.length > 0) {
    const camp = activeCampaigns[0];
    const applicableIds = (camp.applicableProducts || []).map((id) => id.toString());
    const isApplicable =
      applicableIds.length === 0 || lineItems.some((it) => applicableIds.includes(it.productId.toString()));
    if (isApplicable && (camp.minOrderAmount || 0) <= subtotal) {
      if (camp.discountType === 'PERCENTAGE') {
        campaignDiscount = Math.round((subtotal * camp.discountValue) / 100);
      } else {
        campaignDiscount = camp.discountValue;
      }
      if (camp.maxDiscount > 0) campaignDiscount = Math.min(campaignDiscount, camp.maxDiscount);
    }
  }
  campaignDiscount = Math.max(0, campaignDiscount);

  const discountAmount = Math.min(subtotal, promoDiscount + campaignDiscount);
  const total = Math.max(0, subtotal - discountAmount);
  return { subtotal, promoDiscount, campaignDiscount, discountAmount, total, promoResult };
};

/* ────────────────────────────────────────────────────────────────────────────
 * Email delivery — safe & idempotent. Never throws, never flips PAID state.
 * ──────────────────────────────────────────────────────────────────────────── */
const deliverOrderEmailSafe = async (user, order, vouchers) => {
  if (order.emailStatus === 'SENT') return;

  const claimedOrder = await Order.findOneAndUpdate(
    { _id: order._id, emailStatus: { $in: ['PENDING', 'FAILED'] } },
    { $set: { emailStatus: 'SENDING', emailError: null } },
    { new: true }
  );
  if (!claimedOrder) return;
  order.emailStatus = 'SENDING';

  try {
    const recipient = user?.email || order.customerSnapshot?.email || order.billingDetails?.email;
    console.log(`[email:attempt] orderNo=${order.orderNo} paymentStatus=${order.paymentStatus}`);
    const mailRes = await sendOrderConfirmation(user, order, vouchers);
    if (mailRes && mailRes.sent !== false) {
      order.emailStatus = 'SENT';
      order.emailSentAt = new Date();
      order.emailError = null;
    } else {
      order.emailStatus = 'FAILED';
      order.emailError = mailRes?.error || 'Email delivery stubbed or failed';
      console.error(`[email:failure] orderNo=${order.orderNo}`);
    }
  } catch (err) {
    order.emailStatus = 'FAILED';
    order.emailError = err.message;
    console.error(`[email:error] orderNo=${order.orderNo}: ${err.message}`);
  }

  await Order.updateOne(
    { _id: order._id },
    { $set: { emailStatus: order.emailStatus, emailSentAt: order.emailSentAt || null, emailError: order.emailError || null } }
  ).catch(() => {});

  if (order.emailStatus === 'FAILED') {
    try {
      await sendAdminEmailDeliveryFailureAlert(order, order.emailError);
    } catch {}
  }
};

/**
 * Admin "voucher sold" notification — dispatched EXACTLY ONCE per order,
 * gated by an atomic claim on `adminNotifiedAt`. Independent of the customer
 * email so email retries / webhook replays never re-notify the sale.
 */
const notifyAdminSaleOnce = async (user, order, vouchers) => {
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, adminNotifiedAt: null },
    { $set: { adminNotifiedAt: new Date() } },
    { new: true }
  );
  if (!claimed) return;
  try {
    await sendAdminVoucherSaleNotification(user, claimed, vouchers);
  } catch (err) {
    // Never affects the customer's PAID / FULFILLED state.
    console.error(`[admin:sale_notification_error] orderNo=${order.orderNo}: ${err.message}`);
  }
};

const enrichVouchers = (order, vouchers) =>
  vouchers.map((v) => {
    const match = (order.items || []).find(
      (it) => it.productId.toString() === (v.productId?._id || v.productId).toString()
    );
    return {
      code: v.code,
      expiryDate: v.expiryDate,
      productName: match?.productName || v.productId?.name || '',
      voucherType: v.voucherType || match?.voucherType || '',
      slug: v.productId?.slug || match?.slug || '',
      redemptionSteps: Array.isArray(v.productId?.redemptionSteps) ? v.productId.redemptionSteps : [],
      officialWebsiteUrl: v.productId?.officialWebsiteUrl || '',
    };
  });

const publicVoucherList = async (order) => {
  const vouchers = await VoucherCode.find({ orderId: order._id, userId: order.userId })
    .populate('productId', 'name brand provider slug redemptionSteps officialWebsiteUrl validityMonths')
    .lean();
  return enrichVouchers(order, vouchers);
};

/* ────────────────────────────────────────────────────────────────────────────
 * THE fulfillment gate. Only ever called from a code path that has already
 * cryptographically verified a captured Razorpay payment for THIS order.
 *
 * - Atomically claims the PENDING order (guards against verify/webhook races
 *   and double clicks — exactly one caller wins the transition to PAID).
 * - Allocates vouchers via the existing atomic, idempotent allocation service.
 * - Sends the confirmation email safely (failure never un-pays the order).
 * ──────────────────────────────────────────────────────────────────────────── */
const fulfillVerifiedOrder = async ({ order, user, razorpayPaymentId, source, eventId }) => {
  fx('fulfill:enter', order, { source, razorpayPaymentId: razorpayPaymentId || null });

  // Idempotency: already fully done.
  if (order.paymentStatus === 'PAID' && (order.orderStatus === 'FULFILLED' || order.fulfillmentStatus === 'FULFILLED')) {
    fx('fulfill:already-fulfilled', order, { source });
    return { alreadyFulfilled: true, vouchers: await publicVoucherList(order), order };
  }

  // Idempotency: already claimed for manual fulfillment.
  if (order.paymentStatus === 'PAID' && order.fulfillmentStatus === 'PROCESSING') {
    fx('fulfill:already-processing', order, { source });
    return { alreadyFulfilled: true, pendingFulfillment: true, needsAllocation: true, vouchers: [], order };
  }

  // Atomic claim: PENDING -> PAID. Only the first caller proceeds to allocate.
  const claimUpdate = {
    $set: {
      paymentStatus: 'PAID',
      orderStatus: 'PROCESSING',
      paymentProvider: 'razorpay',
      paidAt: order.paidAt || new Date(),
    },
  };
  if (razorpayPaymentId) {
    claimUpdate.$set.razorpayPaymentId = razorpayPaymentId;
    claimUpdate.$set.paymentReference = razorpayPaymentId;
  }
  if (eventId) claimUpdate.$addToSet = { processedEventIds: eventId };

  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $in: ['PENDING'] } },
    claimUpdate,
    { new: true }
  );

  const working = claimed || (await Order.findById(order._id));
  if (!working) throw new AppError('Order not found during fulfillment', 404, 'ORDER_MISSING');

  // If we didn't win the claim, another path is (or already finished) fulfilling.
  // Report the winner's ACTUAL state — the loser must not claim FULFILLED while
  // the winner is still mid-allocation or headed into manual fulfillment.
  if (!claimed) {
    fx('fulfill:claim-lost', working, { source });
    const winnerDone = working.orderStatus === 'FULFILLED' || working.fulfillmentStatus === 'FULFILLED';
    if (!winnerDone) {
      return { alreadyFulfilled: true, pendingFulfillment: true, needsAllocation: true, vouchers: [], order: working };
    }
    return { alreadyFulfilled: true, vouchers: await publicVoucherList(working), order: working };
  }
  fx('fulfill:claimed PENDING->PAID', working, { source });

  // Consume the coupon exactly once, at the PAID transition — only the claim
  // winner reaches this line, so verify/webhook replays can never double-count.
  // An abandoned (never-paid) checkout therefore never burns usage. The $inc is
  // guarded by the coupon's remaining usageLimit in the filter, so concurrent
  // paid orders cannot overshoot the cap; if the very last use was consumed
  // milliseconds earlier, this order still keeps its discount — honouring a
  // captured payment outranks the boundary.
  if (working.promotionId) {
    const promoDoc = await Promotion.findById(working.promotionId).select('usageLimit').lean();
    const consumeGuard = { _id: working.promotionId };
    if (promoDoc?.usageLimit != null) consumeGuard.usageCount = { $lt: promoDoc.usageLimit };
    const consumed = await Promotion.updateOne(consumeGuard, {
      $inc: { usageCount: 1 },
      $push: { usedBy: working.userId },
    });
    if (consumed.modifiedCount === 0) {
      await AuditLog.create({
        adminEmail: `${source}@apexvouchers.in`,
        action: 'PROMOTION_LIMIT_REACHED_AT_PAYMENT',
        resourceType: 'Promotion',
        resourceId: String(working.promotionId),
        details: { orderNo: working.orderNo, promoCode: working.promoCode },
      }).catch(() => {});
    }
  }

  await AuditLog.create({
    adminEmail: user?.email || working.customerSnapshot?.email || 'system@apexvouchers.in',
    action: 'PAYMENT_VERIFIED',
    resourceType: 'Order',
    resourceId: working._id.toString(),
    details: {
      orderNo: working.orderNo,
      source,
      razorpayOrderId: working.razorpayOrderId,
      razorpayPaymentId: razorpayPaymentId || working.razorpayPaymentId || null,
      total: working.total,
      currency: working.currency,
    },
  }).catch(() => {});

  // Allocate vouchers atomically. Uses a transaction where the deployment
  // supports one and falls back to the (already atomic) session-less path on a
  // standalone mongod — otherwise every paid order would be pushed into manual
  // fulfillment even with inventory on hand.
  let vouchers = [];
  try {
    vouchers = await runInTransaction(async (session) => {
      const allocRes = await allocateVouchersForOrder({ order: working, user, session });
      return allocRes.vouchers;
    });
  } catch (allocErr) {
    fx('fulfill:allocation-FAILED', working, { source, error: allocErr.message, code: allocErr.code });

    // MISMATCH_BLOCKED is a security event — keep the strict, human-review state.
    if (allocErr.code === 'VOUCHER_MISMATCH_BLOCKED') {
      working.orderStatus = 'PAYMENT_RECEIVED_NEEDS_ALLOCATION';
      working.fulfillmentStatus = 'MISMATCH_BLOCKED';
      working.fulfillmentError = allocErr.message;
      await working.save().catch(() => {});
      await AuditLog.create({
        adminEmail: `${source}@apexvouchers.in`,
        action: 'VOUCHER_MISMATCH_BLOCKED',
        resourceType: 'Order',
        resourceId: working._id.toString(),
        details: { orderNo: working.orderNo, error: allocErr.message, code: allocErr.code },
      }).catch(() => {});
      try {
        await sendAdminVoucherAssignmentFailureAlert(working, allocErr.message);
      } catch {}
      return { alreadyFulfilled: false, needsAllocation: true, vouchers: [], order: working, error: allocErr.message };
    }

    // OUT_OF_STOCK / other allocation failures → the customer PAID and keeps
    // their order; the voucher now moves to manual fulfillment. The order is
    // left PAID + PROCESSING and a FulfillmentRequest is created so the admin
    // can source a code and deliver it. No "out of stock" wording reaches the
    // customer — they are told their voucher is being processed.
    working.orderStatus = 'PROCESSING';
    working.fulfillmentStatus = 'PROCESSING';
    working.fulfillmentError = null;
    await working.save().catch(() => {});

    let fulfillmentRequest = null;
    try {
      fulfillmentRequest = await createFulfillmentRequestForOrder({
        order: working,
        user,
        paymentId: razorpayPaymentId || null,
      });
    } catch (frErr) {
      console.error(`[fulfillment:create-failed] order=${working.orderNo}: ${frErr.message}`);
      // The request row is how this paid order becomes visible in the admin
      // Fulfillments queue (and the notification badge) — a silent failure here
      // makes the order invisible. Retry once without any special context; only
      // then accept the failure (the audit log below still records it).
      try {
        fulfillmentRequest = await createFulfillmentRequestForOrder({
          order: working,
          user,
          paymentId: razorpayPaymentId || null,
        });
        console.warn(`[fulfillment:create-retry-ok] order=${working.orderNo}`);
      } catch (retryErr) {
        console.error(`[fulfillment:create-retry-failed] order=${working.orderNo}: ${retryErr.message}`);
      }
    }

    await AuditLog.create({
      adminEmail: `${source}@apexvouchers.in`,
      action: 'ORDER_AWAITING_FULFILLMENT',
      resourceType: 'Order',
      resourceId: working._id.toString(),
      details: {
        orderNo: working.orderNo,
        error: allocErr.message,
        code: allocErr.code,
        fulfillmentRequestId: fulfillmentRequest?._id?.toString() || null,
        // False means the queue row could not be created — the order is paid but
        // NOT visible in the Fulfillments tab. Requires the reconcile script.
        fulfillmentRequestCreated: !!fulfillmentRequest,
      },
    }).catch(() => {});

    // The payment IS captured and the order IS legitimately paid — the voucher
    // is simply being sourced manually. Visitors still see a genuine purchase;
    // the admin card shows "Voucher: Processing" until delivery.
    await emitPurchaseProof({ order: working, user, voucherIssued: false });

    return {
      alreadyFulfilled: false,
      pendingFulfillment: true,
      needsAllocation: true,
      fulfillmentRequestId: fulfillmentRequest?._id || null,
      vouchers: [],
      order: working,
      error: allocErr.message,
    };
  }

  const pteBookingItems = (working.items || []).filter(
    (it) => normalizeVoucherType(it.voucherType) === 'PTEBOOKING'
  );
  const hasPteBookingItems = pteBookingItems.length > 0;
  const hasVoucherItems = (working.items || []).some(
    (it) => normalizeVoucherType(it.voucherType) !== 'PTEBOOKING'
  );

  let bookingRequest = null;
  if (hasPteBookingItems) {
    bookingRequest = await PTEBookingRequest.findOne({ orderId: working._id });
    if (!bookingRequest) {
      let matchedExamType = 'PTE Academic';
      const pName = (pteBookingItems[0]?.productName || '').toLowerCase();
      if (pName.includes('ukvi')) matchedExamType = 'PTE Academic UKVI';
      else if (pName.includes('core')) matchedExamType = 'PTE Core';

      bookingRequest = await PTEBookingRequest.create({
        requestId: generatePTEBookingRequestId(),
        userId: working.userId || user?._id || user?.id || null,
        orderId: working._id,
        orderNo: working.orderNo,
        amountPaid: working.total,
        currency: working.currency || 'INR',
        paymentId: razorpayPaymentId || working.razorpayPaymentId || '',
        paymentStatus: 'PAID',
        paidAt: working.paidAt || new Date(),
        fullName: user?.name || working.customerSnapshot?.name || working.billingDetails?.name || 'Customer',
        email: user?.email || working.customerSnapshot?.email || working.billingDetails?.email || '',
        phone: user?.phone || working.customerSnapshot?.phone || working.billingDetails?.phone || '',
        examType: matchedExamType,
        preferredCity: working.bookingPreferences?.preferredCity || 'Not Specified',
        preferredTestCentre: working.bookingPreferences?.preferredTestCentre || '',
        preferredDate: working.bookingPreferences?.preferredDate || null,
        preferredTime: working.bookingPreferences?.preferredTime || 'Any Time',
        message: working.bookingPreferences?.message || '',
        status: 'Booking Request Pending',
        termsAccepted: true,
        activityHistory: [
          {
            status: 'Booking Request Pending',
            note: `Payment verified (${working.currency || 'INR'} ${working.total}). Booking request submitted to processing queue.`,
            adminEmail: 'system@apexvouchers.in',
            timestamp: new Date(),
          },
        ],
      });
    }

    if (!working.pteBookingRequestId || String(working.pteBookingRequestId) !== String(bookingRequest._id)) {
      working.pteBookingRequestId = bookingRequest._id;
      await working.save().catch(() => {});
    }

    // Customer email confirming payment received (NOT exam confirmed)
    await sendPTEBookingConfirmationToCustomer(bookingRequest).catch((err) =>
      console.error(`[email:pte-booking-ack-failed] order=${working.orderNo}: ${err.message}`)
    );

    // Admin notification of new paid booking request
    await sendPTEBookingAdminNotification(bookingRequest).catch((err) =>
      console.error(`[admin:pte-booking-alert-failed] order=${working.orderNo}: ${err.message}`)
    );
  }

  // Pure PTE Booking order: NEVER allocate vouchers, NEVER send voucher emails.
  // Order remains in PROCESSING until admin confirms the appointment.
  if (hasPteBookingItems && !hasVoucherItems) {
    working.orderStatus = 'PROCESSING';
    working.fulfillmentStatus = 'PROCESSING';
    working.emailStatus = 'SENT';
    working.adminNotifiedAt = new Date();
    await working.save().catch(() => {});
    fx('fulfill:pte-booking-done', working, { source, bookingRequestId: bookingRequest?.requestId });

    return {
      alreadyFulfilled: false,
      isPteBooking: true,
      bookingRequest,
      vouchers: [],
      order: working,
    };
  }

  const enriched = enrichVouchers(working, vouchers);
  fx('fulfill:allocated', working, { source, voucherCount: enriched.length });

  // One fulfillment event → customer email + admin sale notification.
  // Both are best-effort and CANNOT change the PAID / FULFILLED state.
  await notifyAdminSaleOnce(user, working, enriched);
  await deliverOrderEmailSafe(user, working, enriched);

  // Public "recent purchase" social-proof event — genuine, verified sale only.
  // Best-effort, idempotent, and carries NO voucher code / PII to visitors.
  await emitPurchaseProof({ order: working, user, voucherIssued: true });

  // Close out a "Request Voucher" request if this order was raised to fulfil one.
  // Best-effort — never affects the PAID / FULFILLED state.
  if (working.voucherRequestId) {
    await markVoucherRequestFulfilled({ order: working, voucher: vouchers[0], user }).catch((err) =>
      console.error(`[voucher-request:fulfill-hook] order=${working.orderNo}: ${err.message}`),
    );
  }

  fx('fulfill:done', working, { source, emailStatus: working.emailStatus, adminNotified: !!working.adminNotifiedAt });

  return { alreadyFulfilled: false, vouchers: enriched, order: working };
};

/* ────────────────────────────────────────────────────────────────────────────
 * RECONCILIATION — the safety net when neither the browser callback nor a
 * webhook delivered the result (UPI redirect, tab closed mid-payment, webhook
 * not yet configured, webhook delayed).
 *
 * Given an internal order that is still unpaid but has a Razorpay order id, ask
 * Razorpay directly which payments exist for it, and — if a genuine captured
 * payment for the exact amount/currency is found — run the SAME single
 * fulfilment gate. Read-only against our DB until a real captured payment is
 * confirmed. Never fulfils a CANCELLED / REFUNDED order (that was a deliberate
 * state change) — instead it raises a loud admin alert so the money can be
 * refunded or the order re-opened.
 * ──────────────────────────────────────────────────────────────────────────── */
export const reconcileOrderPayment = async ({ order, user, source = 'reconcile', dryRun = false }) => {
  const isPteBookingOnly =
    (order.items || []).some((it) => normalizeVoucherType(it.voucherType) === 'PTEBOOKING') &&
    !(order.items || []).some((it) => normalizeVoucherType(it.voucherType) !== 'PTEBOOKING');

  // Already done.
  if (order.paymentStatus === 'PAID') {
    if (isPteBookingOnly) {
      const bookingRequest = await PTEBookingRequest.findOne({ orderId: order._id }).lean();
      return { reconciled: true, alreadyFulfilled: true, isPteBooking: true, bookingRequest, order, vouchers: [] };
    }
    if (order.orderStatus === 'FULFILLED' || order.fulfillmentStatus === 'FULFILLED') {
      return { reconciled: true, alreadyFulfilled: true, order, vouchers: dryRun ? [] : await publicVoucherList(order) };
    }
  }
  if (!order.razorpayOrderId) {
    return { reconciled: false, reason: 'NO_GATEWAY_ORDER', order };
  }
  if (!isRazorpayConfigured()) {
    return { reconciled: false, reason: 'GATEWAY_UNCONFIGURED', order };
  }

  fx('reconcile:enter', order, { source });

  let payments = [];
  try {
    payments = await fetchRazorpayOrderPayments(order.razorpayOrderId);
  } catch (err) {
    fx('reconcile:gateway-error', order, { source, error: err.message });
    return { reconciled: false, reason: 'GATEWAY_ERROR', order };
  }

  const expectedPaise = Math.round(order.total * 100);
  const expectedCurrency = String(order.currency || 'INR').toUpperCase();
  const captured = payments.find(
    (p) =>
      p.status === 'captured' &&
      p.order_id === order.razorpayOrderId &&
      Number(p.amount) === expectedPaise &&
      String(p.currency || 'INR').toUpperCase() === expectedCurrency,
  );
  const amountMismatchCapture = payments.find(
    (p) => p.status === 'captured' && p.order_id === order.razorpayOrderId && Number(p.amount) !== expectedPaise,
  );

  fx('reconcile:gateway-result', order, {
    source,
    attempts: payments.length,
    statuses: payments.map((p) => p.status).join(',') || 'none',
    captured: !!captured,
  });

  // A captured payment exists but the order is no longer collectable → do NOT
  // silently fulfil; a human must refund or re-open it.
  if ((captured || amountMismatchCapture) && !['PENDING'].includes(order.paymentStatus)) {
    if (dryRun) {
      return { reconciled: false, reason: 'ORDER_NOT_COLLECTABLE', capturedPaymentId: (captured || amountMismatchCapture).id, order };
    }
    await AuditLog.create({
      adminEmail: 'reconcile@apexvouchers.in',
      action: 'PAID_ORDER_NOT_COLLECTABLE',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      details: {
        orderNo: order.orderNo,
        orderPaymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        razorpayOrderId: order.razorpayOrderId,
        capturedPaymentId: (captured || amountMismatchCapture).id,
        amountMismatch: !captured,
      },
    }).catch(() => {});
    try {
      await sendAdminVoucherAssignmentFailureAlert(
        order,
        `A captured Razorpay payment (${(captured || amountMismatchCapture).id}) exists for order ${order.orderNo}, but the order is ${order.paymentStatus}/${order.orderStatus}. Refund the customer or re-open and fulfil the order.`,
      );
    } catch {}
    fx('reconcile:paid-order-not-collectable', order, { source, capturedPaymentId: (captured || amountMismatchCapture).id });
    return { reconciled: false, reason: 'ORDER_NOT_COLLECTABLE', capturedPaymentId: (captured || amountMismatchCapture).id, order };
  }

  if (captured) {
    if (dryRun) return { reconciled: true, wouldFulfil: true, razorpayPaymentId: captured.id, order };
    fx('reconcile:captured-found → fulfilling', order, { source, razorpayPaymentId: captured.id });
    const result = await fulfillVerifiedOrder({ order, user, razorpayPaymentId: captured.id, source });
    return { reconciled: true, ...result };
  }

  // No captured payment. If every attempt failed and the order is still PENDING,
  // record the failure (atomic, only from PENDING) so the UI stops "processing".
  const hasOnlyFailures = payments.length > 0 && payments.every((p) => ['failed'].includes(p.status));
  if (hasOnlyFailures && order.paymentStatus === 'PENDING') {
    if (dryRun) return { reconciled: true, wouldFail: true, order };
    await Order.updateOne(
      { _id: order._id, paymentStatus: 'PENDING' },
      { $set: { paymentStatus: 'FAILED', orderStatus: 'FAILED', fulfillmentStatus: 'FAILED' } },
    );
    fx('reconcile:marked-failed', order, { source });
    const fresh = await Order.findById(order._id);
    return { reconciled: true, failed: true, order: fresh, vouchers: [] };
  }

  return { reconciled: false, reason: payments.length ? 'NO_CAPTURED_PAYMENT' : 'NO_PAYMENT_YET', order };
};

/* ══════════════════════════════════════════════════════════════════════════
 * PUBLIC — checkout key id only. The secret is never exposed.
 * GET /api/payments/config
 * ══════════════════════════════════════════════════════════════════════════ */
export const getPublicPaymentConfig = async (req, res) => {
  // Server-side country detection drives the display/billing currency. The
  // browser cannot choose it — this endpoint is the frontend's only source.
  let currency = 'INR';
  let country = config.geo.fallbackCountry;
  try {
    country = await getCustomerCountry(req);
    currency = getDisplayCurrency(country);
  } catch {}
  res.json({
    success: true,
    provider: 'razorpay',
    configured: isRazorpayConfigured(),
    keyId: config.razorpay.keyId || null, // publishable key — safe for the browser
    country, // server-detected ISO-2 (authoritative detection)
    currency, // display/billing currency for this visitor
    internationalPaymentsEnabled: isRazorpayConfigured(), // USD orders also require Razorpay Dashboard → International enabled
    env: config.razorpay.env, // 'live' | 'test' | 'unknown' — derived from the key id
    live: config.razorpay.isLive,
  });
};

/* ══════════════════════════════════════════════════════════════════════════
 * POST /api/payments/order   (auth required)
 * Creates the internal order (PENDING) + a Razorpay order for the exact,
 * server-calculated amount. Nothing is fulfilled here.
 * ══════════════════════════════════════════════════════════════════════════ */
export const createPaymentOrder = async (req, res, next) => {
  try {
    const gate = assertPaymentOrderAllowed();
    if (!gate.ok) {
      console.error(`[payment:order:blocked] ${gate.code}`);
      return next(new AppError('Online payment is temporarily unavailable. Please try again later.', 503, gate.code));
    }

    let { items, promoCode, billing, paymentMethod, bookingPreferences } = req.body || {};
    const { voucherRequestId } = req.body || {};

    // Payment for a previously out-of-stock voucher request: trust the request,
    // not the client. The customer pays the current price for exactly one code
    // of the requested product.
    let voucherRequest = null;
    if (voucherRequestId) {
      if (!isValidObjectId(voucherRequestId)) {
        return next(new AppError('Invalid voucher request id', 400, 'INVALID_REQUEST_ID'));
      }
      voucherRequest = await VoucherRequest.findById(voucherRequestId);
      if (!voucherRequest || String(voucherRequest.userId) !== String(req.user.id)) {
        return next(new AppError('Voucher request not found', 404, 'VOUCHER_REQUEST_NOT_FOUND'));
      }
      if (voucherRequest.status === 'FULFILLED') {
        return next(new AppError('This voucher request has already been fulfilled', 409, 'REQUEST_ALREADY_FULFILLED'));
      }
      if (voucherRequest.status !== 'AWAITING_PAYMENT') {
        return next(new AppError('This voucher request is not ready for payment yet', 409, 'REQUEST_NOT_PAYABLE'));
      }
      // Ignore any client-supplied items — the request defines the purchase.
      items = [{ productId: String(voucherRequest.productId), quantity: 1 }];
      promoCode = null;
    }

    if (!Array.isArray(items) || items.length === 0) {
      return next(new AppError('Items required', 400, 'ITEMS_REQUIRED'));
    }
    if (items.length > MAX_LINE_ITEMS) {
      return next(new AppError(`Maximum ${MAX_LINE_ITEMS} line items per order`, 400, 'TOO_MANY_ITEMS'));
    }

    // 1. Trusted server-side pricing. NOTE: checkout is intentionally NOT
    // blocked when inventory is empty — a paid order without available stock
    // becomes a manual-fulfillment request (see fulfillVerifiedOrder) instead
    // of turning the customer away.
    const lineItems = await getProductsWithPrices(items);

    const { subtotal, discountAmount, total, promoResult } = await computeOrderTotals({
      lineItems,
      promoCode,
      userId: req.user.id,
    });

    if (!(total > 0)) {
      // A ₹0 order can't be paid via Razorpay and must not silently fulfil.
      return next(new AppError('Order total must be greater than zero', 400, 'ZERO_TOTAL_ORDER'));
    }

    /* ── Multi-currency pricing (SERVER-AUTHORITATIVE) ──────────────────────
     * The customer's country is re-detected here from their IP / platform geo
     * headers — NEVER from the request body. India → charge INR (unchanged
     * behaviour, UPI intact). Outside India → convert the canonical INR total
     * to USD using the live, cached FX rate. Any amount/currency/country the
     * browser sent is ignored for pricing. If no trustworthy FX rate is
     * available, international checkout is refused (INR checkout unaffected).
     * ──────────────────────────────────────────────────────────────────────── */
    let country = config.geo.fallbackCountry;
    try {
      country = await getCustomerCountry(req);
    } catch {}
    const currency = getDisplayCurrency(country);

    const baseTotalsInr = { subtotal, discountAmount, total };
    const chargeTotals = await convertOrderTotals(baseTotalsInr, currency);

    // UPI is India-only on Razorpay — international customers pay by card.
    const effectivePaymentMethod = currency === 'USD' ? 'card' : (paymentMethod || 'upi');

    // 2. Persist the internal order in PENDING state.
    // `subtotal` / `discountAmount` / `total` are stored in the CHARGE
    // currency; the canonical INR base amounts are preserved alongside for
    // audit (baseAmountINR etc.) and never recalculated after creation.
    const order = new Order({
      orderNo: generateOrderNo(),
      userId: req.user.id,
      items: lineItems,
      subtotal: chargeTotals.subtotal,
      discountAmount: chargeTotals.discountAmount,
      tax: 0,
      total: chargeTotals.total,
      currency: chargeTotals.currency,
      baseSubtotalINR: chargeTotals.currency === 'USD' ? subtotal : null,
      baseDiscountINR: chargeTotals.currency === 'USD' ? discountAmount : null,
      baseAmountINR: chargeTotals.currency === 'USD' ? total : null,
      fxRateUsed: chargeTotals.fxRateUsed,
      fxRateTimestamp: chargeTotals.fxRateTimestamp,
      fxRateSource: chargeTotals.fxRateSource,
      countryCode: country,
      promotionId: promoResult.promotion?._id || null,
      promoCode: promoResult.promotion?.code || null,
      paymentStatus: 'PENDING',
      orderStatus: 'PAYMENT_PENDING',
      fulfillmentStatus: 'PENDING',
      source: voucherRequest ? 'VOUCHER_REQUEST' : 'STOREFRONT',
      voucherRequestId: voucherRequest?._id || null,
      pteBookingRequestId: null,
      bookingPreferences: {
        preferredCity: bookingPreferences?.preferredCity || '',
        preferredTestCentre: bookingPreferences?.preferredTestCentre || '',
        preferredDate: bookingPreferences?.preferredDate ? new Date(bookingPreferences.preferredDate) : null,
        preferredTime: bookingPreferences?.preferredTime || 'Any Time',
        message: bookingPreferences?.message || '',
      },
      paymentProvider: 'razorpay',
      paymentMethod: effectivePaymentMethod,
      billingDetails: {
        name: billing?.name || req.user.name || '',
        email: billing?.email || req.user.email || '',
        phone: billing?.phone || req.user.phone || '',
        address: billing?.address || '',
        gstin: billing?.gstin || '',
      },
      customerSnapshot: {
        email: billing?.email || req.user.email,
        name: billing?.name || req.user.name,
        phone: billing?.phone || req.user.phone || null,
      },
    });

    // Order is persisted with the discount priced in, but coupon usage is NOT
    // consumed yet — an abandoned checkout must not burn the customer's or the
    // campaign's one-time usage. Consumption happens once, atomically, at the
    // PAID transition inside fulfillVerifiedOrder (consumPromotionForOrder).
    await order.save();

    // 3. Create the Razorpay order for the EXACT server total in the charge
    // currency's smallest subunit (paise for INR, cents for USD). The amount
    // is recalculated here from the order — never taken from the browser.
    let rzpOrder;
    try {
      rzpOrder = await createRazorpayOrder({
        amountPaise: calculateRazorpayAmount(order.total, order.currency),
        currency: order.currency,
        receipt: order.orderNo,
        notes: { internalOrderId: order._id.toString(), userId: req.user.id.toString() },
      });
    } catch (gwErr) {
      // Roll the internal order into a clean failed state — it can never be paid.
      order.paymentStatus = 'FAILED';
      order.orderStatus = 'FAILED';
      order.fulfillmentStatus = 'FAILED';
      order.fulfillmentError = gwErr.message;
      await order.save().catch(() => {});
      return next(gwErr);
    }

    order.razorpayOrderId = rzpOrder.id;
    await order.save();

    if (voucherRequest) {
      await VoucherRequest.updateOne(
        { _id: voucherRequest._id },
        { $set: { orderId: order._id } }
      ).catch(() => {});
    }

    res.status(201).json({
      success: true,
      orderId: order._id,
      orderNo: order.orderNo,
      amount: rzpOrder.amount, // smallest subunit: paise (INR) / cents (USD)
      currency: rzpOrder.currency, // the currency the customer WILL be charged
      total: order.total, // charged amount in major units (display truth)
      baseAmountINR: order.baseAmountINR ?? order.total,
      priceCurrencyLabel: moneyLabel(order.total, order.currency),
      razorpayOrderId: rzpOrder.id,
      keyId: config.razorpay.keyId, // publishable
      prefill: {
        name: order.customerSnapshot?.name || '',
        email: order.customerSnapshot?.email || '',
        contact: order.customerSnapshot?.phone || '',
      },
    });
  } catch (err) {
    next(err);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
 * POST /api/payments/verify   (auth required)
 * Called by the browser after Razorpay Checkout succeeds. The browser CANNOT
 * be trusted, so every claim is re-verified:
 *   - order ownership + razorpay_order_id binding
 *   - checkout HMAC signature (key secret)
 *   - independent payment fetch from Razorpay: captured, correct order,
 *     correct amount, correct currency
 * Only then are vouchers allocated.
 * ══════════════════════════════════════════════════════════════════════════ */
export const verifyPayment = async (req, res, next) => {
  try {
    const {
      orderId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body || {};

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return next(new AppError('Missing payment verification fields', 400, 'VERIFY_FIELDS_MISSING'));
    }

    const q = isValidObjectId(orderId) ? { _id: orderId } : { orderNo: orderId };
    const order = await Order.findOne(q);
    if (!order) return next(new AppError('Order not found', 404, 'ORDER_NOT_FOUND'));

    // Ownership.
    if (String(order.userId) !== String(req.user.id)) {
      return next(new AppError('Not authorized to access this order', 403, 'ORDER_FORBIDDEN'));
    }
    fx('verify:enter', order, { hasSig: !!razorpaySignature });

    // Idempotent short-circuit.
    const isPteBookingOnly =
      (order.items || []).some((it) => normalizeVoucherType(it.voucherType) === 'PTEBOOKING') &&
      !(order.items || []).some((it) => normalizeVoucherType(it.voucherType) !== 'PTEBOOKING');

    if (order.paymentStatus === 'PAID') {
      if (isPteBookingOnly) {
        const bookingReq = await PTEBookingRequest.findOne({ orderId: order._id });
        return res.json({
          success: true,
          paymentStatus: 'PAID',
          orderStatus: order.orderStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          isPteBooking: true,
          bookingRequest: bookingReq,
          message: 'Your PTE booking request has been received.',
          data: order.toObject(),
          vouchers: [],
        });
      }
      if (order.orderStatus === 'FULFILLED' || order.fulfillmentStatus === 'FULFILLED') {
        return res.json({
          success: true,
          paymentStatus: 'PAID',
          orderStatus: 'FULFILLED',
          data: order.toObject(),
          vouchers: await publicVoucherList(order),
        });
      }
    }

    // Order-binding: the gateway order id must be the one we created for THIS order.
    if (!order.razorpayOrderId || order.razorpayOrderId !== razorpayOrderId) {
      await AuditLog.create({
        adminEmail: req.user.email || 'system@apexvouchers.in',
        action: 'PAYMENT_VERIFY_REJECTED',
        resourceType: 'Order',
        resourceId: order._id.toString(),
        details: { orderNo: order.orderNo, reason: 'ORDER_ID_MISMATCH' },
      }).catch(() => {});
      return next(new AppError('Payment does not belong to this order', 400, 'ORDER_ID_MISMATCH'));
    }

    // Signature (key secret).
    if (!verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature: razorpaySignature })) {
      await AuditLog.create({
        adminEmail: req.user.email || 'system@apexvouchers.in',
        action: 'PAYMENT_VERIFY_REJECTED',
        resourceType: 'Order',
        resourceId: order._id.toString(),
        details: { orderNo: order.orderNo, reason: 'SIGNATURE_INVALID' },
      }).catch(() => {});
      return next(new AppError('Payment signature verification failed', 400, 'SIGNATURE_INVALID'));
    }

    // Independent re-verification against Razorpay.
    const payment = await fetchRazorpayPayment(razorpayPaymentId);
    const okStatus = ['captured', 'authorized'].includes(payment.status);
    const okOrder = payment.order_id === razorpayOrderId;
    const okAmount = Number(payment.amount) === Math.round(order.total * 100);
    const okCurrency = String(payment.currency).toUpperCase() === String(order.currency || 'INR').toUpperCase();

    if (!okStatus || !okOrder || !okAmount || !okCurrency) {
      fx('verify:REJECTED gateway-mismatch', order, { paymentStatus: payment.status, okStatus, okOrder, okAmount, okCurrency });
      await AuditLog.create({
        adminEmail: req.user.email || 'system@apexvouchers.in',
        action: 'PAYMENT_VERIFY_REJECTED',
        resourceType: 'Order',
        resourceId: order._id.toString(),
        details: {
          orderNo: order.orderNo,
          reason: 'GATEWAY_MISMATCH',
          paymentStatus: payment.status,
          okStatus, okOrder, okAmount, okCurrency,
        },
      }).catch(() => {});
      return next(new AppError('Payment could not be verified with the gateway', 400, 'PAYMENT_NOT_VERIFIED'));
    }
    if (payment.status === 'authorized') {
      // Auto-capture is on, but if we ever see "authorized" just wait for the
      // webhook / capture rather than fulfilling on an uncaptured payment.
      return res.json({
        success: true,
        paymentStatus: 'PENDING',
        orderStatus: order.orderStatus,
        message: 'Payment authorized — finalizing. Your voucher will appear shortly.',
        data: order.toObject(),
        vouchers: [],
      });
    }

    const result = await fulfillVerifiedOrder({
      order,
      user: req.user,
      razorpayPaymentId,
      source: 'verify',
    });
    fx('verify:done', result.order, { needsAllocation: !!result.needsAllocation, vouchers: (result.vouchers || []).length });

    if (result.isPteBooking) {
      return res.json({
        success: true,
        paymentStatus: 'PAID',
        orderStatus: result.order.orderStatus,
        fulfillmentStatus: result.order.fulfillmentStatus,
        isPteBooking: true,
        bookingRequest: result.bookingRequest,
        message: 'Payment received. Your PTE booking request has been submitted for processing.',
        data: {
          orderNo: result.order.orderNo,
          total: result.order.total,
          currency: result.order.currency,
          paymentStatus: 'PAID',
          orderStatus: result.order.orderStatus,
          fulfillmentStatus: result.order.fulfillmentStatus,
          emailStatus: result.order.emailStatus,
          paymentReference: result.order.razorpayPaymentId || result.order.paymentReference || null,
          paidAt: result.order.paidAt,
          bookingRequest: result.bookingRequest,
        },
        vouchers: [],
      });
    }

    if (result.needsAllocation) {
      const isMismatch = result.order.fulfillmentStatus === 'MISMATCH_BLOCKED';
      return res.json({
        success: true,
        paymentStatus: 'PAID',
        orderStatus: result.order.orderStatus,
        needsAllocation: true,
        pendingFulfillment: !!result.pendingFulfillment,
        fulfillmentStatus: result.order.fulfillmentStatus,
        message: isMismatch
          ? 'Payment received. Voucher allocation is under review — support has been notified.'
          : 'Payment received. Your voucher is being processed and will be delivered within 1–2 minutes.',
        data: result.order.toObject(),
        vouchers: [],
      });
    }

    return res.json({
      success: true,
      paymentStatus: 'PAID',
      // Mirror the order's ACTUAL persisted status. The only caller reaching
      // this block without needsAllocation has allocated vouchers; but never
      // hardcode FULFILLED over what the DB says (e.g. a claim-lost race that
      // resolved to PROCESSING).
      orderStatus: result.order.orderStatus === 'PROCESSING' ? 'PAID' : result.order.orderStatus,
      fulfillmentStatus: result.order.fulfillmentStatus,
      emailStatus: result.order.emailStatus, // 'SENT' | 'FAILED' | 'SENDING'
      data: {
        orderNo: result.order.orderNo,
        total: result.order.total,
        currency: result.order.currency,
        paymentStatus: 'PAID',
        orderStatus: result.order.orderStatus === 'PROCESSING' ? 'PAID' : result.order.orderStatus,
        fulfillmentStatus: result.order.fulfillmentStatus,
        emailStatus: result.order.emailStatus,
        paymentReference: result.order.razorpayPaymentId || result.order.paymentReference || null,
        paidAt: result.order.paidAt,
      },
      vouchers: result.vouchers,
    });
  } catch (err) {
    next(err);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
 * POST /api/payments/reconcile/:orderId   (auth required)
 * The self-heal path. Called by the success / return page when it sees an
 * unpaid order — asks Razorpay directly whether a captured payment exists and,
 * if so, runs the SAME fulfilment gate. Safe to call repeatedly (idempotent).
 * Requires nothing from the browser except the order id.
 * ══════════════════════════════════════════════════════════════════════════ */
const reconcileLocks = new Set(); // in-process guard against 2s-poll stampede

export const reconcilePayment = async (req, res, next) => {
  const { orderId } = req.params;
  try {
    const q = isValidObjectId(orderId) ? { _id: orderId } : { orderNo: orderId };
    const order = await Order.findOne(q);
    if (!order) return next(new AppError('Order not found', 404, 'ORDER_NOT_FOUND'));
    if (String(order.userId) !== String(req.user.id) && req.user.role !== 'admin') {
      return next(new AppError('Not authorized to access this order', 403, 'ORDER_FORBIDDEN'));
    }

    const key = order._id.toString();
    if (reconcileLocks.has(key)) {
      return res.json({ success: true, pending: true, message: 'Still confirming your payment…', ...statusPayload(order, []) });
    }
    reconcileLocks.add(key);
    let result;
    try {
      result = await reconcileOrderPayment({ order, user: req.user, source: 'reconcile' });
    } finally {
      reconcileLocks.delete(key);
    }

    const fresh = result.order || (await Order.findById(order._id));
    const isPteBooking = (fresh.items || []).some((it) => normalizeVoucherType(it.voucherType) === 'PTEBOOKING');
    let bookingRequest = null;
    if (isPteBooking) {
      bookingRequest = await PTEBookingRequest.findOne({ orderId: fresh._id }).lean();
    }
    const fulfilled =
      fresh.paymentStatus === 'PAID' &&
      (fresh.orderStatus === 'FULFILLED' || fresh.fulfillmentStatus === 'FULFILLED');
    const vouchers = fulfilled && !isPteBooking ? await publicVoucherList(fresh) : [];

    return res.json({
      success: true,
      reconciled: !!result.reconciled,
      pending: !fulfilled && !result.failed && fresh.paymentStatus === 'PENDING',
      needsAllocation: fresh.orderStatus === 'PAYMENT_RECEIVED_NEEDS_ALLOCATION',
      notCollectable: result.reason === 'ORDER_NOT_COLLECTABLE',
      isPteBooking,
      bookingRequest,
      message: isPteBooking
        ? (fresh.paymentStatus === 'PAID'
            ? 'Payment confirmed — your PTE booking request has been received and is being processed.'
            : 'Payment not confirmed yet.')
        : fulfilled
          ? 'Payment confirmed — your voucher is ready.'
          : result.failed
            ? 'This payment did not complete. No voucher was issued.'
            : result.reason === 'ORDER_NOT_COLLECTABLE'
              ? 'We received a payment but this order is closed — our team has been alerted.'
              : 'Payment not confirmed yet. If money was deducted your voucher will appear here shortly.',
      ...statusPayload(fresh, vouchers, bookingRequest),
      vouchers,
    });
  } catch (err) {
    reconcileLocks.delete(String(orderId));
    next(err);
  }
};

// Shared status projection so /status, /verify and /reconcile agree.
const statusPayload = (order, vouchers = [], bookingRequest = null) => {
  const isPteBooking = (order.items || []).some((it) => normalizeVoucherType(it.voucherType) === 'PTEBOOKING');
  return {
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    emailStatus: order.emailStatus,
    isPteBooking,
    bookingRequest: bookingRequest || null,
    data: {
      orderNo: order.orderNo,
      total: order.total,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      emailStatus: order.emailStatus,
      paymentReference: order.razorpayPaymentId || order.paymentReference || null,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      isPteBooking,
      bookingRequest: bookingRequest || null,
    },
    vouchers,
  };
};

/* ══════════════════════════════════════════════════════════════════════════
 * GET /api/payments/order/:orderId   (auth required)
 * Returns the server's truth about an order. If the order is still PENDING but
 * has a Razorpay order id, it opportunistically reconciles first (so a polling
 * success page self-heals even with no webhook). It never trusts the browser
 * and never fulfils on anything but a gateway-confirmed captured payment.
 * ══════════════════════════════════════════════════════════════════════════ */
export const getPaymentStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const q = isValidObjectId(orderId) ? { _id: orderId } : { orderNo: orderId };
    let order = await Order.findOne(q);
    if (!order) return next(new AppError('Order not found', 404, 'ORDER_NOT_FOUND'));
    if (String(order.userId) !== String(req.user.id) && req.user.role !== 'admin') {
      return next(new AppError('Not authorized to access this order', 403, 'ORDER_FORBIDDEN'));
    }

    // Opportunistic self-heal — bounded by an in-process lock so 2–3s polling
    // doesn't hammer the gateway.
    if (order.paymentStatus === 'PENDING' && order.razorpayOrderId && String(order.userId) === String(req.user.id)) {
      const key = order._id.toString();
      if (!reconcileLocks.has(key)) {
        reconcileLocks.add(key);
        try {
          await reconcileOrderPayment({ order, user: req.user, source: 'status-poll' });
          order = await Order.findOne(q);
        } catch (e) {
          fx('status:reconcile-error', order, { error: e.message });
        } finally {
          reconcileLocks.delete(key);
        }
      }
    }
    order = order.toObject ? order.toObject() : order;

    const isPteBooking = (order.items || []).some((it) => normalizeVoucherType(it.voucherType) === 'PTEBOOKING');
    let bookingRequest = null;
    if (isPteBooking) {
      bookingRequest = await PTEBookingRequest.findOne({ orderId: order._id }).lean();
    }

    const isFulfilled =
      order.paymentStatus === 'PAID' &&
      (order.orderStatus === 'FULFILLED' || order.fulfillmentStatus === 'FULFILLED');

    const vouchers = isFulfilled && !isPteBooking ? await publicVoucherList(order) : [];

    res.json({
      success: true,
      pending: order.paymentStatus === 'PENDING',
      needsAllocation: order.orderStatus === 'PAYMENT_RECEIVED_NEEDS_ALLOCATION',
      isPteBooking,
      bookingRequest,
      ...statusPayload(order, vouchers, bookingRequest),
    });
  } catch (err) {
    next(err);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
 * POST /api/payments/webhook   (NO auth — verified by HMAC signature)
 * The authoritative, out-of-band confirmation. Also the safety net if the
 * browser closes before /verify runs.
 * ══════════════════════════════════════════════════════════════════════════ */
export const handleRazorpayWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody;

  if (!signature || !rawBody || !config.razorpay.webhookSecret) {
    console.error('[razorpay:webhook] rejected — missing signature / secret / body');
    return res.status(400).json({ success: false, message: 'Invalid webhook' });
  }
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error('[razorpay:webhook] rejected — signature verification failed');
    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
  }

  // From here the payload is authentic (signed with our webhook secret).
  const payload = req.body || {};
  const event = payload.event || '';
  const eventId = req.headers['x-razorpay-event-id'] || `${event}:${payload?.payload?.payment?.entity?.id || ''}`;
  const paymentEntity = payload?.payload?.payment?.entity || null;
  const orderEntity = payload?.payload?.order?.entity || null;
  const rzpOrderId = paymentEntity?.order_id || orderEntity?.id || null;

  console.log(`[razorpay:webhook] event=${event} rzpOrderId=${rzpOrderId || 'n/a'}`);

  // We only fulfil on capture / order.paid. Everything else is acknowledged.
  const isPaidEvent = event === 'payment.captured' || event === 'order.paid';
  const isFailEvent = event === 'payment.failed';

  if (!rzpOrderId || (!isPaidEvent && !isFailEvent)) {
    return res.status(200).json({ success: true, message: 'Acknowledged' });
  }

  try {
    const order = await Order.findOne({ razorpayOrderId: rzpOrderId }).populate('userId');
    if (!order) {
      console.warn(`[razorpay:webhook] no internal order for rzpOrderId=${rzpOrderId}`);
      return res.status(200).json({ success: true, message: 'No matching order' });
    }

    if (order.processedEventIds?.includes(eventId)) {
      return res.status(200).json({ success: true, message: 'Duplicate event ignored' });
    }

    if (isFailEvent) {
      await Order.updateOne(
        { _id: order._id, paymentStatus: 'PENDING' },
        {
          $set: { paymentStatus: 'FAILED', orderStatus: 'FAILED', fulfillmentStatus: 'FAILED' },
          $addToSet: { processedEventIds: eventId },
        }
      );
      return res.status(200).json({ success: true, message: 'Failure recorded' });
    }

    // Paid event — re-verify amount/currency from the SIGNED payload.
    if (paymentEntity) {
      const okOrder = paymentEntity.order_id === rzpOrderId;
      const okAmount = Number(paymentEntity.amount) === Math.round(order.total * 100);
      const okCurrency = String(paymentEntity.currency || 'INR').toUpperCase() === String(order.currency || 'INR').toUpperCase();
      const okStatus = paymentEntity.status === 'captured';
      if (!okOrder || !okAmount || !okCurrency || !okStatus) {
        console.error(`[razorpay:webhook] payload mismatch for order ${order.orderNo}`);
        await AuditLog.create({
          adminEmail: 'webhook@apexvouchers.in',
          action: 'PAYMENT_VERIFY_REJECTED',
          resourceType: 'Order',
          resourceId: order._id.toString(),
          details: { orderNo: order.orderNo, reason: 'WEBHOOK_PAYLOAD_MISMATCH', okOrder, okAmount, okCurrency, okStatus },
        }).catch(() => {});
        return res.status(200).json({ success: true, message: 'Payload mismatch ignored' });
      }
    }

    await fulfillVerifiedOrder({
      order,
      user: order.userId,
      razorpayPaymentId: paymentEntity?.id || null,
      source: 'webhook',
      eventId,
    });

    return res.status(200).json({ success: true, message: 'Processed' });
  } catch (err) {
    // Signature already passed — log and 200 so Razorpay doesn't hammer retries,
    // the order simply stays PENDING and recoverable / the next event re-tries.
    console.error(`[razorpay:webhook] processing error: ${err.message}`);
    return res.status(200).json({ success: true, message: 'Acknowledged (deferred)' });
  }
};
