import crypto from 'crypto';
import { config } from '../config/index.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Razorpay integration — SERVER SIDE ONLY.
 *
 * The key secret and webhook secret live here and NEVER leave the server:
 *  - not returned in any API response
 *  - not logged
 *  - only used to talk to api.razorpay.com and to verify HMAC signatures
 *
 * All amounts to/from Razorpay are in the smallest currency unit (paise for INR).
 * Our internal Order.total is stored in whole rupees, so paise = rupees * 100.
 */

export const isRazorpayConfigured = () =>
  Boolean(config.razorpay.keyId && config.razorpay.keySecret);

const authHeader = () =>
  'Basic ' +
  Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');

/**
 * Constant-time string comparison that never throws on length mismatch.
 */
const safeEqualHex = (a, b) => {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Create a Razorpay order. Returns the raw Razorpay order object.
 * @param {{ amountPaise:number, currency:string, receipt:string, notes?:object }} args
 */
export const createRazorpayOrder = async ({ amountPaise, currency = 'INR', receipt, notes = {} }) => {
  if (!isRazorpayConfigured()) {
    throw new AppError('Payment gateway is not configured', 503, 'PAYMENT_GATEWAY_UNCONFIGURED');
  }
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new AppError('Invalid payment amount', 400, 'INVALID_AMOUNT');
  }

  let resp;
  try {
    resp = await fetch(`${config.razorpay.apiBase}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({
        amount: amountPaise,
        currency,
        receipt: String(receipt).slice(0, 40),
        payment_capture: 1, // auto-capture on success
        notes,
      }),
    });
  } catch (err) {
    throw new AppError('Could not reach the payment gateway. Please try again.', 502, 'PAYMENT_GATEWAY_UNREACHABLE');
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.id) {
    // Log a redacted diagnostic — never the request auth header or secret.
    console.error(`[razorpay:create-order:failed] status=${resp.status} error=${data?.error?.description || 'unknown'}`);
    if (currency && String(currency).toUpperCase() !== 'INR') {
      // Most common cause: the Razorpay account is not enabled for
      // international payments (Dashboard → Settings → International).
      throw new AppError(
        'International payments are temporarily unavailable. Please try again shortly or contact support.',
        502,
        'PAYMENT_INTERNATIONAL_UNAVAILABLE',
      );
    }
    throw new AppError('Failed to create payment order', 502, 'PAYMENT_ORDER_CREATE_FAILED');
  }
  return data;
};

/**
 * Fetch a payment object from Razorpay (used to independently re-verify
 * status / amount / currency / order binding after the browser callback).
 */
export const fetchRazorpayPayment = async (paymentId) => {
  if (!isRazorpayConfigured()) {
    throw new AppError('Payment gateway is not configured', 503, 'PAYMENT_GATEWAY_UNCONFIGURED');
  }
  if (!/^pay_[A-Za-z0-9]+$/.test(String(paymentId || ''))) {
    throw new AppError('Invalid payment id', 400, 'INVALID_PAYMENT_ID');
  }
  let resp;
  try {
    resp = await fetch(`${config.razorpay.apiBase}/payments/${paymentId}`, {
      headers: { Authorization: authHeader() },
    });
  } catch (err) {
    throw new AppError('Could not reach the payment gateway. Please try again.', 502, 'PAYMENT_GATEWAY_UNREACHABLE');
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.id) {
    console.error(`[razorpay:fetch-payment:failed] status=${resp.status} error=${data?.error?.description || 'unknown'}`);
    throw new AppError('Could not verify the payment with the gateway', 502, 'PAYMENT_FETCH_FAILED');
  }
  return data;
};

/**
 * List every payment attempt made against a Razorpay order. Used by the
 * reconciliation path: when the browser callback never ran (UPI redirect, tab
 * closed) and no webhook is configured, we can still find the captured payment
 * for an order and fulfil it. Returns [] on any gateway error (caller decides).
 */
export const fetchRazorpayOrderPayments = async (razorpayOrderId) => {
  if (!isRazorpayConfigured()) {
    throw new AppError('Payment gateway is not configured', 503, 'PAYMENT_GATEWAY_UNCONFIGURED');
  }
  // The id comes from our own DB (set from Razorpay's create-order response),
  // not from user input — this is a sanity guard, not a security boundary.
  if (!/^order_[A-Za-z0-9_]{6,}$/.test(String(razorpayOrderId || ''))) {
    throw new AppError('Invalid razorpay order id', 400, 'INVALID_ORDER_ID');
  }
  let resp;
  try {
    resp = await fetch(`${config.razorpay.apiBase}/orders/${razorpayOrderId}/payments`, {
      headers: { Authorization: authHeader() },
    });
  } catch (err) {
    throw new AppError('Could not reach the payment gateway. Please try again.', 502, 'PAYMENT_GATEWAY_UNREACHABLE');
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`[razorpay:fetch-order-payments:failed] status=${resp.status} error=${data?.error?.description || 'unknown'}`);
    throw new AppError('Could not check the payment with the gateway', 502, 'PAYMENT_FETCH_FAILED');
  }
  return Array.isArray(data.items) ? data.items : [];
};

/**
 * Verify the signature returned to the browser by Razorpay Checkout.
 * signature = HMAC_SHA256( razorpay_order_id + "|" + razorpay_payment_id, key_secret )
 */
export const verifyCheckoutSignature = ({ razorpayOrderId, razorpayPaymentId, signature }) => {
  if (!razorpayOrderId || !razorpayPaymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  return safeEqualHex(signature, expected);
};

/**
 * Verify a Razorpay webhook. signature = HMAC_SHA256( rawBody, webhook_secret )
 * `rawBody` MUST be the exact bytes received (see express.json verify hook).
 */
export const verifyWebhookSignature = (rawBody, signature) => {
  if (!config.razorpay.webhookSecret || !rawBody || !signature) return false;
  const expected = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  return safeEqualHex(signature, expected);
};
