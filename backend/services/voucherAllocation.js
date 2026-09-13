import { VoucherCode } from '../models/VoucherCode.js';
import { Product } from '../models/Product.js';
import { AuditLog } from '../models/AuditLog.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendAdminVoucherMismatchAlert } from './email.js';

/**
 * Normalizes a voucher type string into standard uppercase identifier (e.g. DUOLINGO, PTE, TOEFL, GRE)
 */
export const normalizeVoucherType = (type, product) => {
  if (type && typeof type === 'string' && type.trim()) {
    return type.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }
  if (product) {
    const raw = product.voucherType || product.brand || product.provider || 'EXAM';
    return String(raw).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }
  return 'EXAM';
};

/**
 * Return codes claimed earlier in a failed allocation run to inventory.
 *
 * With a transaction the abort handles this. On a standalone mongod (no
 * transaction available) a multi-item / multi-quantity order that runs out of
 * stock part way through would otherwise strand the codes it already claimed —
 * marked SOLD against an order that has since moved to manual fulfillment, so
 * invisible to both that customer and the next buyer.
 */
const releaseClaimedVouchers = async (vouchers) => {
  const ids = vouchers.map((v) => v?._id).filter(Boolean);
  if (!ids.length) return;
  await VoucherCode.updateMany(
    { _id: { $in: ids }, status: 'SOLD' },
    {
      $set: {
        status: 'AVAILABLE',
        userId: null,
        orderId: null,
        soldAt: null,
        soldTo: null,
        assignedAt: null,
      },
    }
  ).catch((err) => console.error(`[allocation:release-failed] ${err.message}`));
  console.warn(`[allocation:released] returned ${ids.length} partially-claimed voucher(s) to inventory`);
};

/**
 * Allocates vouchers for an order atomically with strict product-to-voucher matching.
 * Guarantees zero cross-product allocation, prevents race conditions, and provides idempotent retry safety.
 */
export const allocateVouchersForOrder = async ({ order, user, session = null }) => {
  if (!order) {
    throw new AppError('Order is required for voucher allocation', 400, 'ORDER_REQUIRED');
  }

  // 1. Idempotency Guard: check if order is already fulfilled or already processed
  const hasVoucherItems = (order.items || []).some((it) => normalizeVoucherType(it.voucherType) !== 'PTEBOOKING');
  const hasPteBookingItems = (order.items || []).some((it) => normalizeVoucherType(it.voucherType) === 'PTEBOOKING');

  if (hasPteBookingItems && !hasVoucherItems && order.paymentStatus === 'PAID') {
    return { vouchers: [], alreadyFulfilled: true, isPteBookingOnly: true };
  }

  if (order.fulfillmentStatus === 'FULFILLED' || (order.allocatedVouchers && order.allocatedVouchers.length > 0)) {
    const existingVouchers = await VoucherCode.find({
      orderId: order._id,
      status: { $in: ['SOLD', 'ASSIGNED', 'USED'] },
    })
      .populate('productId', 'name brand provider')
      .lean();

    if (existingVouchers.length > 0) {
      console.log(`[allocation:idempotent] Order #${order.orderNo} is already fulfilled with ${existingVouchers.length} voucher(s).`);
      return { vouchers: existingVouchers, alreadyFulfilled: true };
    }
  }

  const assignedVouchers = [];
  const auditEntries = [];
  const customerEmail =
    user?.email || order.customerSnapshot?.email || order.billingDetails?.email || '';

  try {
    // 2. Process each line item with strict product ID & voucherType enforcement
    for (const item of order.items || []) {
      // PTE Exam Booking service line items are paid services that never ship a
      // voucher code — skip voucher allocation entirely for them.
      if (normalizeVoucherType(item.voucherType) === 'PTEBOOKING') continue;

      const expectedProductId = item.productId?.toString ? item.productId.toString() : String(item.productId);
      let expectedVoucherType = normalizeVoucherType(item.voucherType);

      // If voucherType was not recorded on item, fetch authoritative product definition
      if (!expectedVoucherType || expectedVoucherType === 'EXAM') {
        const dbProduct = await Product.findById(item.productId).lean();
        if (dbProduct) {
          expectedVoucherType = normalizeVoucherType(dbProduct.voucherType, dbProduct);
          item.voucherType = expectedVoucherType;
        }
      }

      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);

      for (let i = 0; i < qty; i++) {
        // Atomic query strictly filtering by EXACT productId AND EXACT voucherType
        const query = {
          productId: item.productId,
          voucherType: expectedVoucherType,
          status: 'AVAILABLE',
          expiryDate: { $gt: new Date() },
        };

        const update = {
          $set: {
            status: 'SOLD',
            userId: order.userId,
            orderId: order._id,
            soldAt: new Date(),
            soldTo: customerEmail,
            assignedAt: new Date(),
          },
        };

        const voucher = await VoucherCode.findOneAndUpdate(query, update, {
          new: true,
          session: session || undefined,
        });

        if (!voucher) {
          throw new AppError(
            `Insufficient voucher inventory for ${item.productName} (${expectedVoucherType}).`,
            400,
            'OUT_OF_STOCK'
          );
        }
        // Tracked before validation so a mismatch releases this code too.
        assignedVouchers.push(voucher);

        // 3. Strict Post-Allocation Sanity Validation
        const actualProductId = voucher.productId?.toString ? voucher.productId.toString() : String(voucher.productId);
        const actualVoucherType = normalizeVoucherType(voucher.voucherType);

        if (actualProductId !== expectedProductId || actualVoucherType !== expectedVoucherType) {
          console.error(
            `[CRITICAL MISMATCH BLOCKED] Order #${order.orderNo}: Expected Product ${expectedProductId} (${expectedVoucherType}), but allocated Voucher ${voucher._id} has Product ${actualProductId} (${actualVoucherType})`
          );

          // Record security audit log
          await AuditLog.create({
            adminEmail: 'security@apexvouchers.in',
            action: 'VOUCHER_MISMATCH_BLOCKED',
            resourceType: 'Order',
            resourceId: order._id.toString(),
            details: {
              orderNo: order.orderNo,
              expectedProductId,
              expectedVoucherType,
              actualProductId,
              actualVoucherType,
              voucherCode: voucher.code,
            },
          }).catch(() => {});

          // Send administrator alert email
          try {
            await sendAdminVoucherMismatchAlert(order, item, voucher);
          } catch {}

          throw new AppError(
            `Voucher product mismatch detected. Expected: ${expectedVoucherType}, Received: ${actualVoucherType}. Voucher delivery cancelled.`,
            500,
            'VOUCHER_MISMATCH_BLOCKED'
          );
        }

        auditEntries.push({
          adminEmail: user?.email || customerEmail || 'automated-fulfillment@apexvouchers.in',
          action: 'VOUCHER_SOLD',
          resourceType: 'VoucherCode',
          resourceId: voucher._id.toString(),
          details: {
            code: voucher.code,
            voucherType: actualVoucherType,
            productId: actualProductId,
            productName: item.productName,
            orderNo: order.orderNo,
            orderId: order._id.toString(),
            soldTo: customerEmail,
          },
        });
      }
    }
  } catch (err) {
    // Nothing rolls back for us without a transaction — hand every code claimed
    // so far back to inventory before the caller falls through to the manual
    // fulfillment path.
    if (!session) await releaseClaimedVouchers(assignedVouchers);
    throw err;
  }

  // One write for the whole order instead of an awaited insert per code.
  if (auditEntries.length) {
    await AuditLog.insertMany(auditEntries, { ordered: false }).catch(() => {});
  }

  // 4. Update order fulfillment snapshot
  if (hasPteBookingItems && !hasVoucherItems) {
    // Pure PTE Booking order — NEVER fulfilled at payment time!
    // Creates a booking request; order stays in PROCESSING until admin explicitly confirms booking.
    order.fulfillmentStatus = 'PROCESSING';
    order.fulfillmentError = null;
    order.orderStatus = 'PROCESSING';
    order.paymentStatus = 'PAID';
    order.allocatedVouchers = [];
  } else if (hasPteBookingItems && hasVoucherItems) {
    // Mixed order (vouchers + booking service) — vouchers allocated, but overall order is still PROCESSING for the service
    order.fulfillmentStatus = 'PROCESSING';
    order.fulfillmentError = null;
    order.orderStatus = 'PROCESSING';
    order.paymentStatus = 'PAID';
    order.allocatedVouchers = assignedVouchers.map((v) => ({
      voucherId: v._id,
      code: v.code,
      productId: v.productId,
      voucherType: v.voucherType,
      allocatedAt: new Date(),
    }));
  } else {
    // Pure voucher order — fulfills immediately
    order.fulfillmentStatus = 'FULFILLED';
    order.fulfillmentError = null;
    order.orderStatus = 'FULFILLED';
    order.paymentStatus = 'PAID';
    order.allocatedVouchers = assignedVouchers.map((v) => ({
      voucherId: v._id,
      code: v.code,
      productId: v.productId,
      voucherType: v.voucherType,
      allocatedAt: new Date(),
    }));
  }

  if (session) {
    await order.save({ session });
  } else {
    await order.save();
  }

  return { vouchers: assignedVouchers, alreadyFulfilled: false };
};

/**
 * Validates vouchers before customer delivery or email dispatch.
 */
export const validateVouchersBeforeDelivery = (order, vouchers = []) => {
  if (!order || !Array.isArray(vouchers) || vouchers.length === 0) {
    return false;
  }

  for (const v of vouchers) {
    const vProdId = (v.productId?._id || v.productId || '').toString();
    const vType = normalizeVoucherType(v.voucherType);

    const matchingItem = (order.items || []).find((it) => {
      const itProdId = (it.productId?._id || it.productId || '').toString();
      const itType = normalizeVoucherType(it.voucherType);
      return itProdId === vProdId && itType === vType;
    });

    if (!matchingItem) {
      console.error(
        `[delivery:validation_failed] Voucher ${v.code} (${vType}, prod=${vProdId}) does not match any item in order #${order.orderNo}`
      );
      return false;
    }
  }

  return true;
};
