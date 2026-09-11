import { PurchaseEvent } from '../models/PurchaseEvent.js';
import { normalizeVoucherType } from './voucherAllocation.js';
import { publish } from './realtimeHub.js';
import { config } from '../config/index.js';

/**
 * Public "recent purchase" social-proof events.
 *
 * The ONLY producer is paymentController.fulfillVerifiedOrder — i.e. a Razorpay
 * payment that has already been cryptographically verified and an order that is
 * legitimately PAID. Nothing here is ever driven by a frontend action, a pending
 * order, or a failed / cancelled / refunded payment.
 *
 * What reaches connected visitors (channel "social-proof"): product name, a
 * generic purchase sentence, a timestamp, and — only when a safe one exists —
 * a first name. Never a voucher code, email, phone, full name, order number,
 * payment id or amount.
 */

const CHANNEL = 'social-proof';

/**
 * Extract a display-safe FIRST name, or null.
 * Accepts a single token of letters (incl. common accents), hyphen or
 * apostrophe, 2–20 chars. Rejects anything with a digit, "@", multiple words,
 * or that looks like an email local-part / initials.
 */
export const safeFirstName = (raw) => {
  if (!config.socialProof.showFirstName) return null;
  const token = String(raw || '').trim().split(/\s+/)[0] || '';
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,19}$/.test(token)) return null;
  // Title-case: "rahul" → "Rahul", "MCDONALD" → "Mcdonald".
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
};

/** "PTE Academic Voucher" → "PTE Academic". */
const productLabelFrom = (productName) =>
  String(productName || '')
    .replace(/\s*(e-?)?(voucher|vouchers|code|codes)\s*$/i, '')
    .trim();

/**
 * Build the public sentence. Examples:
 *   "Rahul has successfully purchased a PTE Academic voucher."
 *   "A customer has successfully purchased a PTE Core voucher."
 *   "A customer has successfully purchased their voucher."
 */
export const buildPurchaseMessage = ({ productLabel, displayName }) => {
  const who = displayName || 'A customer';
  const label = String(productLabel || '').trim();
  if (label) return `${who} has successfully purchased a ${label} voucher.`;
  return `${who} has successfully purchased their voucher.`;
};

/** The exact object broadcast to visitors — audited to be free of PII / codes. */
export const toPublicPayload = (event) => ({
  id: String(event._id || event.id),
  message: event.message,
  productLabel: event.productLabel || null,
  voucherType: event.voucherType || null,
  displayName: event.displayName || null,
  quantity: event.quantity || 1,
  at: (event.createdAt || new Date()).toISOString(),
});

/** Push an existing PurchaseEvent to every connected visitor. */
export const broadcastPurchaseEvent = (event) => {
  if (!event || !config.socialProof.enabled) return null;
  return publish(CHANNEL, 'purchase', toPublicPayload(event));
};

/**
 * Idempotently record a PurchaseEvent for a paid order and (on first creation)
 * broadcast it. Safe to call from concurrent verify / webhook / reconcile paths.
 *
 * @param {boolean} voucherIssued - true when a code was allocated instantly.
 * @param {boolean} broadcast     - false to record only (manual-delivery flip).
 * @returns {{ event?: object, created: boolean, skipped?: string }}
 */
export const recordPurchaseEvent = async ({ order, user, voucherIssued = false, broadcast = true }) => {
  if (!config.socialProof.enabled) return { created: false, skipped: 'disabled' };
  if (!order?._id) return { created: false, skipped: 'no-order' };
  // Authoritative gate: only a genuinely PAID order ever produces an event.
  if (order.paymentStatus !== 'PAID') return { created: false, skipped: `not-paid:${order.paymentStatus}` };

  const existing = await PurchaseEvent.findOne({ orderId: order._id });
  if (existing) {
    if (voucherIssued && !existing.voucherIssued) {
      existing.voucherIssued = true;
      await existing.save().catch(() => {});
    }
    return { event: existing, created: false };
  }

  const item = (order.items || [])[0] || {};
  const productName = (item.productName || 'Exam Voucher').trim();
  const productLabel = productLabelFrom(productName);
  const voucherType = normalizeVoucherType(item.voucherType) || 'EXAM';
  const quantity = Math.max(
    1,
    (order.items || []).reduce((n, it) => n + (parseInt(it.quantity, 10) || 1), 0)
  );
  const displayName = safeFirstName(
    user?.name || order.customerSnapshot?.name || order.billingDetails?.name
  );
  const message = buildPurchaseMessage({ productLabel, displayName });

  let event;
  try {
    event = await PurchaseEvent.create({
      orderId: order._id,
      orderNo: order.orderNo,
      productName,
      productLabel,
      voucherType,
      quantity,
      displayName,
      voucherIssued: !!voucherIssued,
      message,
      source: order.source || 'STOREFRONT',
    });
  } catch (err) {
    if (err?.code === 11000) {
      // Lost the race — another path just created it. Not a new event → no broadcast.
      const raced = await PurchaseEvent.findOne({ orderId: order._id });
      return { event: raced, created: false };
    }
    throw err;
  }

  if (broadcast) broadcastPurchaseEvent(event);
  return { event, created: true };
};

/**
 * Fully best-effort wrapper for the payment fulfilment gate. A failure here
 * must NEVER affect the order's PAID / FULFILLED state.
 */
export const emitPurchaseProof = async ({ order, user, voucherIssued }) => {
  try {
    return await recordPurchaseEvent({ order, user, voucherIssued, broadcast: true });
  } catch (err) {
    console.error(`[social-proof] emit failed for order ${order?.orderNo || order?._id}: ${err.message}`);
    return { created: false, error: err.message };
  }
};

/**
 * Flip an existing event to "voucher issued" after a manual fulfilment delivery.
 * Never re-broadcasts — the public notification already went out when the
 * payment was captured; showing it again would be a duplicate.
 */
export const markPurchaseEventIssued = async ({ order, user }) => {
  try {
    return await recordPurchaseEvent({ order, user, voucherIssued: true, broadcast: false });
  } catch (err) {
    console.error(`[social-proof] mark-issued failed for order ${order?.orderNo || order?._id}: ${err.message}`);
    return { created: false, error: err.message };
  }
};
