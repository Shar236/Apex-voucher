import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

let transporter = null;

/**
 * Clean HTML entity escaper to prevent HTML injection in emails.
 */
export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Mask an email address for logging or display.
 */
export const maskEmail = (email) => {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at <= 1) return value ? '[redacted]' : '[missing]';
  return `${value[0]}***${value.slice(at - 1)}`;
};

/**
 * Mask a voucher code for logs / admin notifications: keep first 4 + last 4.
 * The FULL code only ever goes to the customer who owns it.
 */
export const maskVoucherCode = (code) => {
  const c = String(code || '').trim();
  if (!c) return '••••';
  if (c.length <= 8) return `${c[0]}••••`;
  return `${c.slice(0, 4)}••••${c.slice(-4)}`;
};

/**
 * Format currency in Indian Rupees (₹) safely.
 */
export const formatINR = (amount) => {
  const num = Number(amount || 0);
  if (Number.isNaN(num)) return '₹0';
  return `₹${num.toLocaleString('en-IN')}`;
};

/**
 * Currency-aware money formatter for transaction emails. Always renders the
 * ACTUAL charged amount stored on the order — historical orders are never
 * recalculated with a current FX rate.
 *   formatMoney(1000, 'INR') → "₹1,000 INR"
 *   formatMoney(11.43, 'USD') → "$11.43 USD"
 */
export const formatMoney = (amount, currency = 'INR') => {
  const cur = String(currency || 'INR').toUpperCase();
  const num = Number(amount || 0);
  if (Number.isNaN(num)) return cur === 'USD' ? '$0.00 USD' : '₹0 INR';
  return cur === 'USD'
    ? `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
    : `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })} INR`;
};

/**
 * Format a date string or timestamp in a clean, human-readable format.
 */
export const formatDate = (dateInput) => {
  if (!dateInput) return 'N/A';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Format date with time for order records and admin notifications.
 */
export const formatDateTime = (dateInput) => {
  if (!dateInput) return 'N/A';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Resolves the client application URL safely without trailing slash.
 */
export const getClientUrl = () => {
  const envUrl = process.env.CLIENT_URL || process.env.PUBLIC_SITE_URL;
  if (envUrl && !/localhost|127\.0\.0\.1/i.test(envUrl)) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  const raw = config.clientUrl;
  if (raw && !/localhost|127\.0\.0\.1/i.test(raw)) {
    return String(raw).trim().replace(/\/+$/, '');
  }
  return (config.business.website || 'https://apexvouchers.com').trim().replace(/\/+$/, '');
};

/**
 * Resolves the official hosted logo URL.
 */
export const getLogoUrl = () => {
  if (config.business.logoUrl) return config.business.logoUrl;
  return 'https://res.cloudinary.com/nbcbpuql/image/upload/apex_branding/apex_vouchers_logo.png';
};

const getTransport = () => {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.user || !config.smtp.password || !config.smtp.from) {
    console.error('[email:config] SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM are required');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: +config.smtp.port,
    secure: config.smtp.secure || +config.smtp.port === 465,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.password }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
};

/** Plain-text fallback from HTML — improves spam scoring + accessibility. */
const htmlToText = (html) =>
  String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Send one email. NEVER throws — returns { sent:boolean, error?, info?, tag? }
 * so callers can decide what to tell the user.
 */
export const sendEmail = async ({ to, subject, html, text = '', from = config.smtp.from, replyTo, tag = 'generic' }) => {
  if (!to) {
    console.error(`[email:failed] tag=${tag} reason=recipient-missing`);
    return { sent: false, error: 'Email recipient is missing' };
  }

  const transport = getTransport();
  const mail = {
    from: from || `"${config.business.name}" <${config.business.email}>`,
    to,
    subject,
    html,
    text: text || htmlToText(html),
    ...(replyTo ? { replyTo } : {}),
  };

  if (!transport) {
    const error = 'SMTP configuration is incomplete';
    console.error(`[email:failed] tag=${tag} recipient=${maskEmail(to)} reason=${error}`);
    return { sent: false, error };
  }

  try {
    const info = await transport.sendMail(mail);
    const rejected = (info.rejected || []).length > 0;
    if (rejected) {
      console.error(`[email:rejected] tag=${tag} recipient=${maskEmail(to)} response=${info.response || 'rejected'}`);
      return { sent: false, error: `Recipient rejected by mail server: ${info.response || 'rejected'}`, info };
    }
    console.log(
      `[email:sent] tag=${tag} recipient=${maskEmail(to)} messageId=${info.messageId || 'unknown'} response=${info.response || 'accepted'}`
    );
    return { sent: true, info, messageId: info.messageId };
  } catch (err) {
    console.error(`[email:failed] tag=${tag} recipient=${maskEmail(to)} code=${err.code || err.responseCode || 'ERR'} reason=${err.message}`);
    return { sent: false, error: err.message, code: err.code || err.responseCode };
  }
};

/** Safe startup diagnostic — printed by the server on boot. Never logs secrets. */
export const emailConfigStatus = () => {
  const providerReady = Boolean(config.smtp.host && config.smtp.user && config.smtp.password);
  const senderReady = Boolean(config.smtp.from);
  const fromAddr = (config.smtp.from || '').match(/<([^>]+)>/)?.[1] || config.smtp.from || '';
  const gmailMismatch =
    /gmail/i.test(config.smtp.host || '') && fromAddr && config.smtp.user &&
    fromAddr.toLowerCase() !== config.smtp.user.toLowerCase();
  console.log(`[email] provider configured: ${providerReady ? 'yes' : 'NO'}  (${config.smtp.host || 'no host'})`);
  console.log(`[email] sender configured:   ${senderReady ? 'yes' : 'NO'}  (${maskEmail(fromAddr) || 'no from'})`);
  if (gmailMismatch) {
    console.warn('[email] ⚠ SMTP_FROM address does not match SMTP_USER — Gmail will rewrite/reject. Use the same address or a verified "Send mail as" alias.');
  }
  if (!providerReady) {
    console.warn('[email] ⚠ transactional email is DISABLED — OTP + voucher emails will not send. Set SMTP_HOST / SMTP_USER / SMTP_PASSWORD / SMTP_FROM.');
  }
  return { providerReady, senderReady, gmailMismatch };
};

/* ══════════════════════════════════════════════════════════════════════════
 * APEX VOUCHERS — REUSABLE EMAIL DESIGN SYSTEM
 * Light, modern commercial design with official brand assets, high contrast,
 * and bulletproof email client compatibility.
 * ══════════════════════════════════════════════════════════════════════════ */

const BRAND_COLORS = {
  pink: '#FF005C',
  pinkHover: '#E00052',
  pinkLight: '#FFF1F5',
  pinkBorder: '#FECDD3',
  dark: '#0F172A',
  bodyText: '#334155',
  mutedText: '#64748B',
  lightMuted: '#94A3B8',
  pageBg: '#F8FAFC',
  cardBg: '#FFFFFF',
  cardBorder: '#E2E8F0',
  subtleBg: '#F1F5F9',
  successText: '#047857',
  successBg: '#ECFDF5',
  successBorder: '#A7F3D0',
  warningText: '#B45309',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',
  alertText: '#B91C1C',
  alertBg: '#FEF2F2',
  alertBorder: '#FECACA',
  infoText: '#0369A1',
  infoBg: '#F0F9FF',
  infoBorder: '#BAE6FD',
};

/**
 * Bulletproof CTA Button compatible with Gmail, Apple Mail, Outlook, etc.
 */
export const renderCtaButton = ({ label, url, secondary = false }) => {
  const bg = secondary ? BRAND_COLORS.dark : BRAND_COLORS.pink;
  const shadow = secondary
    ? '0 2px 6px rgba(15, 23, 42, 0.15)'
    : '0 4px 14px rgba(255, 0, 92, 0.25)';

  return `
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 26px auto 10px auto;">
      <tr>
        <td align="center" style="border-radius: 10px; background-color: ${bg}; box-shadow: ${shadow};">
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; border: 1px solid ${bg}; text-align: center; letter-spacing: 0.2px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
};

/**
 * Visual Status Card / Pill.
 */
export const renderStatusCard = ({
  status = 'SUCCESS',
  title = '',
  description = '',
  variant = 'success', // 'success' | 'warning' | 'alert' | 'info' | 'brand'
}) => {
  let text = BRAND_COLORS.successText;
  let bg = BRAND_COLORS.successBg;
  let border = BRAND_COLORS.successBorder;

  if (variant === 'warning') {
    text = BRAND_COLORS.warningText;
    bg = BRAND_COLORS.warningBg;
    border = BRAND_COLORS.warningBorder;
  } else if (variant === 'alert') {
    text = BRAND_COLORS.alertText;
    bg = BRAND_COLORS.alertBg;
    border = BRAND_COLORS.alertBorder;
  } else if (variant === 'info') {
    text = BRAND_COLORS.infoText;
    bg = BRAND_COLORS.infoBg;
    border = BRAND_COLORS.infoBorder;
  } else if (variant === 'brand') {
    text = BRAND_COLORS.pink;
    bg = BRAND_COLORS.pinkLight;
    border = BRAND_COLORS.pinkBorder;
  }

  return `
    <div style="background-color: ${bg}; border: 1px solid ${border}; border-radius: 12px; padding: 16px 20px; margin: 18px 0 24px 0;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td valign="middle">
            <span style="display: inline-block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: ${text}; background-color: #ffffff; border: 1px solid ${border}; padding: 3px 8px; border-radius: 6px;">
              ${escapeHtml(status)}
            </span>
            ${title ? `<div style="font-size: 15px; font-weight: 700; color: ${BRAND_COLORS.dark}; margin-top: 8px;">${escapeHtml(title)}</div>` : ''}
            ${description ? `<div style="font-size: 13px; line-height: 1.55; color: ${text}; margin-top: 4px;">${escapeHtml(description)}</div>` : ''}
          </td>
        </tr>
      </table>
    </div>
  `;
};

/**
 * Order Summary Card.
 */
export const renderOrderSummary = ({
  orderNo,
  date,
  totalQty = 1,
  totalAmount,
  paymentStatus = 'PAID',
  paymentRef,
  items = [],
  currency = 'INR',
  fxRate = null,
}) => {
  const formattedDate = date ? formatDate(date) : formatDate(Date.now());
  const cur = String(currency || 'INR').toUpperCase();
  // Item rows: convert INR line prices to the charged currency when needed so
  // the whole summary stays in ONE currency (the one actually charged).
  const toDisplay = (inrAmount) => {
    if (cur !== 'USD' || !fxRate) return Number(inrAmount || 0);
    return Math.round((Number(inrAmount || 0) * 100) / fxRate) / 100; // half-up in minor units
  };
  const formattedTotal = formatMoney(toDisplay(totalAmount), cur);

  const itemRowsHtml = (items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding: 10px 0; border-top: 1px solid ${BRAND_COLORS.cardBorder}; font-size: 13px; color: ${BRAND_COLORS.dark}; font-weight: 600;">
          ${escapeHtml(item.productName || 'Exam Voucher')}
        </td>
        <td align="center" style="padding: 10px 8px; border-top: 1px solid ${BRAND_COLORS.cardBorder}; font-size: 13px; color: ${BRAND_COLORS.mutedText};">
          ${Number(item.quantity || 1)}
        </td>
        <td align="right" style="padding: 10px 0; border-top: 1px solid ${BRAND_COLORS.cardBorder}; font-size: 13px; color: ${BRAND_COLORS.dark}; font-weight: 700;">
          ${formatMoney(toDisplay(Number(item.unitPrice || 0) * Number(item.quantity || 1)), cur)}
        </td>
      </tr>
    `
    )
    .join('');

  return `
    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 14px;">
        <tr>
          <td valign="middle">
            <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: ${BRAND_COLORS.mutedText};">
              ORDER SUMMARY
            </span>
          </td>
          <td align="right" valign="middle">
            <span style="font-size: 11px; font-weight: 800; background-color: ${BRAND_COLORS.successBg}; color: ${BRAND_COLORS.successText}; border: 1px solid ${BRAND_COLORS.successBorder}; padding: 3px 8px; border-radius: 6px; text-transform: uppercase;">
              ${escapeHtml(paymentStatus)}
            </span>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Order ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(orderNo)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Payment Date:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(formattedDate)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Quantity:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${Number(totalQty)} voucher${Number(totalQty) > 1 ? 's' : ''}</td>
        </tr>
        ${paymentRef ? `
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Payment Reference:</td>
          <td align="right" style="font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(paymentRef)}</td>
        </tr>` : ''}
        <tr>
          <td style="font-size: 14px; font-weight: 600; color: ${BRAND_COLORS.dark}; padding-top: 6px; border-top: 1px dashed ${BRAND_COLORS.cardBorder};">Amount Paid:</td>
          <td align="right" style="font-size: 17px; font-weight: 900; color: ${BRAND_COLORS.pink}; padding-top: 6px; border-top: 1px dashed ${BRAND_COLORS.cardBorder};">${escapeHtml(formattedTotal)}</td>
        </tr>
      </table>

      ${items && items.length > 0 ? `
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 14px;">
        <thead>
          <tr>
            <th align="left" style="padding-bottom: 6px; font-size: 11px; font-weight: 700; color: ${BRAND_COLORS.lightMuted}; text-transform: uppercase;">Product</th>
            <th align="center" style="padding-bottom: 6px; font-size: 11px; font-weight: 700; color: ${BRAND_COLORS.lightMuted}; text-transform: uppercase;">Qty</th>
            <th align="right" style="padding-bottom: 6px; font-size: 11px; font-weight: 700; color: ${BRAND_COLORS.lightMuted}; text-transform: uppercase;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml}
        </tbody>
      </table>` : ''}
    </div>
  `;
};

/**
 * High-Security Voucher Cards Section.
 * Renders ONLY when actual voucher codes are delivered.
 */
export const renderVoucherCards = (vouchers = [], fallbackProductName = 'Exam Voucher') => {
  if (!vouchers || vouchers.length === 0) return '';

  return vouchers
    .map((voucher, idx) => {
      const productName = voucher.productName || fallbackProductName;
      const voucherType = voucher.voucherType || 'EXAM';
      const code = String(voucher.code || '').trim();
      const expiry = formatDate(voucher.expiryDate);
      const steps = Array.isArray(voucher.redemptionSteps) ? voucher.redemptionSteps.filter(Boolean) : [];
      const redeemUrl = voucher.officialWebsiteUrl ? String(voucher.officialWebsiteUrl).trim() : '';

      return `
        <div style="background-color: ${BRAND_COLORS.pinkLight}; border: 2px dashed ${BRAND_COLORS.pink}; border-radius: 14px; padding: 22px; margin: 18px 0 22px 0;">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td>
                <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${BRAND_COLORS.pink};">
                  ${escapeHtml(productName)}${vouchers.length > 1 ? ` — VOUCHER ${idx + 1} OF ${vouchers.length}` : ''}
                </span>
                <div style="font-size: 11px; color: ${BRAND_COLORS.mutedText}; margin-top: 2px; text-transform: uppercase;">
                  Category: ${escapeHtml(voucherType)}
                </div>
              </td>
              <td align="right" valign="top">
                <span style="font-size: 10px; font-weight: 800; background-color: #ffffff; color: ${BRAND_COLORS.successText}; border: 1px solid ${BRAND_COLORS.successBorder}; padding: 3px 8px; border-radius: 6px; text-transform: uppercase;">
                  Active &amp; Ready
                </span>
              </td>
            </tr>
          </table>

          <div style="background-color: #ffffff; border: 1px solid ${BRAND_COLORS.pinkBorder}; border-radius: 10px; padding: 14px 16px; margin: 14px 0 12px 0; text-align: center;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.mutedText}; margin-bottom: 4px;">
              OFFICIAL VOUCHER CODE
            </div>
            <div style="font-family: 'Courier New', Courier, monospace; font-size: 24px; font-weight: 900; letter-spacing: 3px; color: ${BRAND_COLORS.dark}; word-break: break-all;">
              ${escapeHtml(code)}
            </div>
          </div>

          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td style="font-size: 12px; color: ${BRAND_COLORS.mutedText};">
                Valid Until: <strong style="color: ${BRAND_COLORS.dark};">${escapeHtml(expiry)}</strong>
              </td>
              ${redeemUrl ? `
              <td align="right" style="font-size: 12px;">
                <a href="${escapeHtml(redeemUrl)}" target="_blank" rel="noopener noreferrer" style="color: ${BRAND_COLORS.pink}; text-decoration: none; font-weight: 700;">
                  Official Test Portal →
                </a>
              </td>` : ''}
            </tr>
          </table>

          ${steps.length > 0 ? `
          <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed ${BRAND_COLORS.pinkBorder}; font-size: 12px; line-height: 1.6; color: ${BRAND_COLORS.bodyText};">
            <strong style="color: ${BRAND_COLORS.dark};">How to redeem:</strong>
            <ol style="margin: 6px 0 0 0; padding-left: 18px;">
              ${steps.map((step) => `<li style="margin-bottom: 4px;">${escapeHtml(step)}</li>`).join('')}
            </ol>
          </div>` : ''}
        </div>
      `;
    })
    .join('');
};

/**
 * "What Happens Next?" Roadmap component.
 */
export const renderWhatHappensNext = ({ isManualFulfillment = false } = {}) => {
  const steps = isManualFulfillment
    ? [
        { num: '1', title: 'Payment Confirmed', desc: 'Your transaction was verified and recorded.' },
        { num: '2', title: 'Fulfillment Queued', desc: 'Our dedicated fulfillment team received your order.' },
        { num: '3', title: 'Voucher Prepared', desc: 'A verified voucher code is allocated and tested.' },
        { num: '4', title: 'Email & Account Delivery', desc: 'You receive your voucher via email and dashboard.' },
      ]
    : [
        { num: '1', title: 'Payment Confirmed', desc: 'Your order was successfully paid.' },
        { num: '2', title: 'Voucher Allocated', desc: 'Your authentic voucher was selected from stock.' },
        { num: '3', title: 'Instant Delivery', desc: 'Your code is ready for booking immediately.' },
        { num: '4', title: 'Available in Dashboard', desc: 'View, copy, or print anytime in your account.' },
      ];

  const stepsHtml = steps
    .map(
      (s) => `
      <tr>
        <td width="28" valign="top" style="padding-bottom: 12px;">
          <div style="width: 22px; height: 22px; line-height: 22px; border-radius: 50%; background-color: ${BRAND_COLORS.pinkLight}; color: ${BRAND_COLORS.pink}; font-size: 11px; font-weight: 800; text-align: center; border: 1px solid ${BRAND_COLORS.pinkBorder};">
            ${s.num}
          </div>
        </td>
        <td valign="top" style="padding-bottom: 12px; padding-left: 10px;">
          <div style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark};">${escapeHtml(s.title)}</div>
          <div style="font-size: 12px; color: ${BRAND_COLORS.mutedText}; line-height: 1.4; margin-top: 1px;">${escapeHtml(s.desc)}</div>
        </td>
      </tr>
    `
    )
    .join('');

  return `
    <div style="background-color: #ffffff; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 20px; margin: 22px 0;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: ${BRAND_COLORS.mutedText}; margin-bottom: 14px;">
        WHAT HAPPENS NEXT?
      </div>
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        ${stepsHtml}
      </table>
    </div>
  `;
};

/**
 * Known product slugs mapping (normalised product name/brand -> slug).
 * Provides instantaneous, zero-DB-overhead resolution for all official vouchers.
 */
export const KNOWN_PRODUCT_SLUGS = {
  'ielts coupon code': 'ielts-exam-voucher',
  'ielts exam voucher': 'ielts-exam-voucher',
  'ielts': 'ielts-exam-voucher',
  'pearson pte academic': 'pearson-pte-academic-voucher',
  'pearson pte academic voucher': 'pearson-pte-academic-voucher',
  'pte academic': 'pearson-pte-academic-voucher',
  'pte': 'pearson-pte-academic-voucher',
  'pearson pte core': 'pearson-pte-core-voucher',
  'pearson pte core voucher': 'pearson-pte-core-voucher',
  'pte core': 'pearson-pte-core-voucher',
  'pearson pte canada': 'pearson-pte-canada-voucher',
  'pearson pte canada voucher': 'pearson-pte-canada-voucher',
  'pte canada': 'pearson-pte-canada-voucher',
  'pearson pte practice test': 'pearson-pte-practice-test',
  'pte practice test': 'pearson-pte-practice-test',
  'ets gre exam voucher': 'ets-gre-voucher',
  'ets gre voucher': 'ets-gre-voucher',
  'gre': 'ets-gre-voucher',
  'ets toefl ibt exam voucher': 'ets-toefl-voucher',
  'ets toefl voucher': 'ets-toefl-voucher',
  'toefl': 'ets-toefl-voucher',
  'duolingo english test voucher': 'duolingo-english-test-voucher',
  'duolingo': 'duolingo-english-test-voucher',
  'act exam voucher': 'act-exam-voucher',
  'act': 'act-exam-voucher',
  'oet exam voucher': 'oet-exam-voucher',
  'oet': 'oet-exam-voucher',
  'languagecert exam voucher': 'languagecert-exam-voucher',
  'languagecert': 'languagecert-exam-voucher',
  'celpip exam voucher': 'celpip-exam-voucher',
  'celpip': 'celpip-exam-voucher',
  'pte ai test': 'pteai-test',
};

/**
 * Resolves the canonical public product detail & redemption URL.
 * Automatically derives dynamic URLs from product slug, with fallback to catalog.
 */
export const resolveProductRedemptionUrl = ({ slug, productName } = {}) => {
  const clientUrl = getClientUrl();

  // 1. Explicit slug provided
  const cleanSlug = String(slug || '').trim().toLowerCase().replace(/^\/+/, '');
  if (cleanSlug) {
    return `${clientUrl}/exam-vouchers/${cleanSlug}`;
  }

  // 2. Exact match in known slugs map
  const normName = String(productName || '').trim().toLowerCase();
  if (normName && KNOWN_PRODUCT_SLUGS[normName]) {
    return `${clientUrl}/exam-vouchers/${KNOWN_PRODUCT_SLUGS[normName]}`;
  }

  // 3. Substring/partial match in known slugs map
  if (normName) {
    for (const [key, val] of Object.entries(KNOWN_PRODUCT_SLUGS)) {
      if (normName.includes(key) || key.includes(normName)) {
        return `${clientUrl}/exam-vouchers/${val}`;
      }
    }
  }

  // 4. Safe catalog fallback
  return `${clientUrl}/exam-vouchers`;
};

/**
 * Professional "HOW TO REDEEM YOUR VOUCHER" Informational Card.
 * Directs the customer to the exact purchased product page on Apex Vouchers
 * where comprehensive step-by-step redemption instructions already live.
 */
export const renderRedemptionGuideCard = ({
  productName = 'your exam voucher',
  productUrl,
  isDelivered = false,
} = {}) => {
  const destinationUrl = productUrl || resolveProductRedemptionUrl({ productName });

  const introText = isDelivered
    ? 'Follow our official step-by-step redemption guide before booking your exam slot on the test administrator portal.'
    : 'Your voucher is currently being prepared. Once delivered, follow our step-by-step redemption guide on the official website to apply your code correctly.';

  const supportingText = isDelivered
    ? 'Open the guide to view verified step-by-step screenshots and booking instructions.'
    : 'Already received your voucher? Open the guide to see the complete redemption steps.';

  return `
    <div style="background-color: #ffffff; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 22px 24px; margin: 24px 0;">
      <!-- Eyebrow -->
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: ${BRAND_COLORS.pink}; margin-bottom: 8px;">
        HOW TO REDEEM YOUR VOUCHER
      </div>

      <!-- Heading -->
      <div style="font-size: 16px; font-weight: 800; color: ${BRAND_COLORS.dark}; margin-bottom: 8px; line-height: 1.3;">
        Step-by-Step Official Redemption Guide
      </div>

      <!-- Description -->
      <p style="font-size: 13px; line-height: 1.55; color: ${BRAND_COLORS.bodyText}; margin: 0 0 16px 0;">
        ${introText}
      </p>

      <!-- Purchased Product Callout -->
      <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 10px; padding: 12px 16px; margin-bottom: 18px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td valign="middle" style="font-size: 12px; color: ${BRAND_COLORS.mutedText};">
              Your Purchased Product:
            </td>
            <td align="right" valign="middle" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark};">
              ${escapeHtml(productName)}
            </td>
          </tr>
        </table>
      </div>

      <!-- CTA Button -->
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto 10px auto;">
        <tr>
          <td align="center" style="border-radius: 10px; background-color: ${BRAND_COLORS.pink}; box-shadow: 0 4px 14px rgba(255, 0, 92, 0.25);">
            <a href="${escapeHtml(destinationUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #ffffff; text-decoration: none; padding: 13px 30px; border-radius: 10px; border: 1px solid ${BRAND_COLORS.pink}; text-align: center; letter-spacing: 0.2px;">
              View Redemption Guide →
            </a>
          </td>
        </tr>
      </table>

      <!-- Supporting Note -->
      <p style="font-size: 11px; color: ${BRAND_COLORS.mutedText}; text-align: center; margin: 10px 0 0 0; line-height: 1.4;">
        ${supportingText}
      </p>
    </div>
  `;
};

/**
 * Help & Support Block.
 */
export const renderSupportSection = () => {
  const phone = config.business.supportPhone || '+91 9855926113';
  const cleanPhone = phone.replace(/\s+/g, '');
  const rawWhatsApp = config.business.whatsappPhone || phone;
  const whatsappDigits = rawWhatsApp.replace(/\D/g, '');
  const email = config.business.supportEmail || 'info@apexvouchers.com';
  const whatsappUrl = `https://wa.me/${whatsappDigits}?text=${encodeURIComponent('Hello Apex Vouchers support team, I need assistance.')}`;

  return `
    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 12px; padding: 18px 20px; margin-top: 26px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td>
            <div style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; margin-bottom: 4px;">
              Need help with your voucher or exam booking?
            </div>
            <div style="font-size: 12px; color: ${BRAND_COLORS.mutedText}; line-height: 1.5;">
              Our dedicated support team is available to assist you.
            </div>
            <div style="margin-top: 10px; font-size: 12px; line-height: 1.8; color: ${BRAND_COLORS.bodyText};">
              <strong>Email:</strong> <a href="mailto:${escapeHtml(email)}" style="color: ${BRAND_COLORS.pink}; text-decoration: none; font-weight: 600;">${escapeHtml(email)}</a>
              &nbsp;•&nbsp;
              <strong>Phone:</strong> <a href="tel:${escapeHtml(cleanPhone)}" style="color: ${BRAND_COLORS.bodyText}; text-decoration: none; font-weight: 600;">${escapeHtml(phone)}</a>
              &nbsp;•&nbsp;
              <strong>WhatsApp:</strong> <a href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer" style="color: ${BRAND_COLORS.successText}; text-decoration: none; font-weight: 700;">Live WhatsApp Support →</a>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
};

/**
 * Professional Security Notice.
 */
export const renderSecurityNotice = () => `
  <div style="background-color: #fafafa; border-left: 3px solid ${BRAND_COLORS.pink}; border-radius: 6px; padding: 12px 16px; margin-top: 22px; font-size: 12px; line-height: 1.5; color: ${BRAND_COLORS.mutedText};">
    <strong style="color: ${BRAND_COLORS.dark};">🔒 Security Notice:</strong> Apex Vouchers will never ask you to share your account password, OTP, or full voucher code in an unsolicited message or phone call.
  </div>
`;

/**
 * Footer with Navigation & Legal details.
 */
export const renderFooter = ({ isAdmin = false } = {}) => {
  const clientUrl = getClientUrl();
  const currentYear = new Date().getFullYear();

  if (isAdmin) {
    return `
      <tr>
        <td style="background-color: ${BRAND_COLORS.pageBg}; padding: 22px 32px; border-top: 1px solid ${BRAND_COLORS.cardBorder}; text-align: center; font-size: 12px; color: ${BRAND_COLORS.mutedText}; line-height: 1.6;">
          <p style="margin: 0 0 6px 0; font-weight: 700; color: ${BRAND_COLORS.dark};">
            Apex Vouchers Administration System
          </p>
          <p style="margin: 0 0 8px 0; color: ${BRAND_COLORS.mutedText}; font-size: 11px;">
            This is an automated internal operational alert dispatched to authorized administrators.
          </p>
          <p style="margin: 0; color: ${BRAND_COLORS.lightMuted}; font-size: 11px;">
            © ${currentYear} ${escapeHtml(config.business.name)}. Confidential &amp; Proprietary.
          </p>
        </td>
      </tr>
    `;
  }

  return `
    <tr>
      <td style="background-color: ${BRAND_COLORS.pageBg}; padding: 26px 32px; border-top: 1px solid ${BRAND_COLORS.cardBorder}; text-align: center; font-size: 12px; color: ${BRAND_COLORS.mutedText}; line-height: 1.6;">
        <!-- Navigation Links -->
        <p style="margin: 0 0 14px 0; font-size: 11px; color: ${BRAND_COLORS.mutedText};">
          <a href="${clientUrl}" style="color: ${BRAND_COLORS.mutedText}; text-decoration: none; font-weight: 600;">Home</a>
          &nbsp;&nbsp;•&nbsp;&nbsp;
          <a href="${clientUrl}/account" style="color: ${BRAND_COLORS.mutedText}; text-decoration: none; font-weight: 600;">My Account</a>
          &nbsp;&nbsp;•&nbsp;&nbsp;
          <a href="${clientUrl}/account?tab=vouchers" style="color: ${BRAND_COLORS.mutedText}; text-decoration: none; font-weight: 600;">My Vouchers</a>
          &nbsp;&nbsp;•&nbsp;&nbsp;
          <a href="${clientUrl}/exam-vouchers" style="color: ${BRAND_COLORS.mutedText}; text-decoration: none; font-weight: 600;">Exam Vouchers</a>
          &nbsp;&nbsp;•&nbsp;&nbsp;
          <a href="${clientUrl}/contact" style="color: ${BRAND_COLORS.mutedText}; text-decoration: none; font-weight: 600;">Contact Support</a>
          &nbsp;&nbsp;•&nbsp;&nbsp;
          <a href="${clientUrl}/terms" style="color: ${BRAND_COLORS.mutedText}; text-decoration: none; font-weight: 600;">Terms</a>
          &nbsp;&nbsp;•&nbsp;&nbsp;
          <a href="${clientUrl}/privacy-policy" style="color: ${BRAND_COLORS.mutedText}; text-decoration: none; font-weight: 600;">Privacy</a>
        </p>

        <!-- Brand Name -->
        <p style="margin: 0 0 6px 0; font-weight: 700; color: ${BRAND_COLORS.dark}; font-size: 12px;">
          ${escapeHtml(config.business.name)} — Official Exam Voucher Platform
        </p>

        <!-- Copyright -->
        <p style="margin: 0; color: ${BRAND_COLORS.lightMuted}; font-size: 11px;">
          © ${currentYear} ${escapeHtml(config.business.name)}. All rights reserved.
        </p>
      </td>
    </tr>
  `;
};

/**
 * Universal Apex Vouchers Email Layout Wrapper.
 */
export const renderEmailLayout = ({
  title,
  preheader = '',
  body,
  brandBadge = 'Official Delivery',
  badgeVariant = 'brand', // 'brand' | 'admin' | 'security' | 'success'
  isAdmin = false,
}) => {
  const clientUrl = getClientUrl();
  const logoUrl = getLogoUrl();

  let badgeColor = BRAND_COLORS.pink;
  let badgeBg = BRAND_COLORS.pinkLight;
  let badgeBorder = BRAND_COLORS.pinkBorder;

  if (badgeVariant === 'admin') {
    badgeColor = BRAND_COLORS.warningText;
    badgeBg = BRAND_COLORS.warningBg;
    badgeBorder = BRAND_COLORS.warningBorder;
  } else if (badgeVariant === 'security') {
    badgeColor = BRAND_COLORS.alertText;
    badgeBg = BRAND_COLORS.alertBg;
    badgeBorder = BRAND_COLORS.alertBorder;
  } else if (badgeVariant === 'success') {
    badgeColor = BRAND_COLORS.successText;
    badgeBg = BRAND_COLORS.successBg;
    badgeBorder = BRAND_COLORS.successBorder;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND_COLORS.pageBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${BRAND_COLORS.dark}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  
  <!-- Preheader preview text (hidden in body, visible in inbox list) -->
  ${preheader ? `
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #ffffff; opacity: 0; mso-hide: all;">
    ${escapeHtml(preheader)}
  </div>` : ''}

  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${BRAND_COLORS.pageBg}; padding: 32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: ${BRAND_COLORS.cardBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);">
          
          <!-- Header Branding with Official Logo -->
          <tr>
            <td style="background-color: #ffffff; padding: 24px 32px 18px 32px; border-bottom: 1px solid ${BRAND_COLORS.cardBorder};">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td valign="middle">
                    <a href="${escapeHtml(clientUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
                      <img src="${escapeHtml(logoUrl)}" alt="Apex Vouchers" width="170" height="67" style="display: block; width: 170px; max-width: 100%; height: auto; border: 0; outline: none; text-decoration: none;" />
                    </a>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display: inline-block; font-size: 10px; font-weight: 800; color: ${badgeColor}; background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; padding: 4px 10px; border-radius: 16px; text-transform: uppercase; letter-spacing: 0.6px;">
                      ${escapeHtml(brandBadge)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Email Body -->
          <tr>
            <td style="padding: 32px 32px 28px 32px;">
              ${body}
            </td>
          </tr>

          <!-- Universal Footer -->
          ${renderFooter({ isAdmin })}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// Backwards-compatible alias so existing internal callers stay supported
const htmlWrap = (title, body) => renderEmailLayout({ title, body });

/* ══════════════════════════════════════════════════════════════════════════
 * CUSTOMER ONBOARDING & WELCOME
 * ══════════════════════════════════════════════════════════════════════════ */

export const sendRegistrationWelcome = (user) => {
  const clientUrl = getClientUrl();
  const userName = user?.name ? String(user.name).trim() : 'Candidate';
  const subject = `Welcome to ${config.business.name} — Your Account Is Ready`;
  const preheader = 'Your Apex Vouchers account is active. Access official exam vouchers with instant delivery.';

  const bodyHtml = `
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 12px 0; color: ${BRAND_COLORS.dark};">
      Hi ${escapeHtml(userName)}, welcome aboard!
    </h1>
    <p style="font-size: 14px; line-height: 1.65; color: ${BRAND_COLORS.bodyText}; margin: 0 0 20px 0;">
      Thank you for creating your account on <strong>${escapeHtml(config.business.name)}</strong>. You can now purchase official exam vouchers (PTE, IELTS, TOEFL, Duolingo) at the lowest guaranteed rates, with automated delivery straight to your account.
    </p>

    ${renderStatusCard({
      status: 'ACCOUNT ACTIVE',
      title: 'Ready for Exam Booking',
      description: 'Log in anytime to explore verified vouchers, calculate your exam scores, and manage your purchased vouchers.',
      variant: 'brand',
    })}

    ${renderCtaButton({
      label: 'Go to My Dashboard →',
      url: `${clientUrl}/account`,
    })}

    ${renderSupportSection()}
  `;

  return sendEmail({
    to: user.email,
    tag: 'welcome',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Welcome',
    }),
  });
};

/* ══════════════════════════════════════════════════════════════════════════
 * PAYMENT CONFIRMATION & VOUCHER DELIVERY (Instant vs Manual Fulfillment)
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Customer Purchase Confirmation Email (Sent ONLY AFTER confirmed payment).
 * When vouchers exist, displays the actual voucher codes with full redemption steps.
 */
export const sendOrderConfirmation = (user, order, vouchers = []) => {
  const clientUrl = getClientUrl();
  const customerName = user?.name || order.customerSnapshot?.name || order.billingDetails?.name || 'Valued Customer';
  const targetEmail = user?.email || order.customerSnapshot?.email || order.billingDetails?.email;
  const firstItem = order.items?.[0] || {};
  const firstProductName = firstItem.productName || vouchers[0]?.productName || 'Exam Voucher';
  const paymentRef = order.razorpayPaymentId || order.paymentReference || null;
  const totalQty = (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0) || vouchers.length || 1;

  const hasVouchers = vouchers && vouchers.length > 0;
  const subject = hasVouchers
    ? `Your Voucher Is Ready 🎉 (#${order.orderNo})`
    : `Payment Confirmed — Order #${order.orderNo}`;

  const preheader = hasVouchers
    ? `Your ${firstProductName} voucher is ready with redemption instructions.`
    : `Your payment was confirmed. Your voucher is available in your account.`;

  const voucherCardsHtml = renderVoucherCards(vouchers, firstProductName);

  const productSlug = firstItem.slug || vouchers[0]?.slug || '';
  const redemptionUrl = resolveProductRedemptionUrl({
    slug: productSlug,
    productName: firstProductName,
  });

  const bodyHtml = `
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      Hi ${escapeHtml(customerName)},
    </h1>

    <p style="font-size: 15px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; margin: 0 0 20px 0;">
      🎉 <strong>Congratulations!</strong> Thank you for your purchase from <strong>Apex Vouchers</strong>. Your payment for <strong>${escapeHtml(firstProductName)}</strong> has been successfully confirmed.
    </p>

    ${renderOrderSummary({
      orderNo: order.orderNo,
      date: order.paidAt || order.createdAt,
      totalQty,
      totalAmount: order.total,
      paymentStatus: 'PAID',
      paymentRef,
      items: order.items || [],
      currency: order.currency || 'INR',
      fxRate: order.fxRateUsed || null,
    })}

    ${hasVouchers ? `
      <div style="font-size: 15px; font-weight: 800; color: ${BRAND_COLORS.dark}; margin: 24px 0 6px 0;">
        YOUR OFFICIAL VOUCHER DETAILS
      </div>
      <p style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; margin: 0 0 14px 0;">
        Use the voucher code below on the test administrator's official website when scheduling your exam slot.
      </p>
      ${voucherCardsHtml}
    ` : ''}

    ${renderRedemptionGuideCard({
      productName: firstProductName,
      productUrl: redemptionUrl,
      isDelivered: true,
    })}

    ${renderCtaButton({
      label: 'View My Vouchers →',
      url: `${clientUrl}/account?tab=vouchers`,
    })}

    ${renderSecurityNotice()}
    ${renderSupportSection()}
  `;

  return sendEmail({
    to: targetEmail,
    tag: 'order-confirmed',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Payment Confirmed',
      badgeVariant: 'success',
    }),
  });
};

/**
 * Customer confirmation for a paid order being prepared by the fulfillment team.
 * Truthful messaging without artificial false guarantees.
 */
export const sendFulfillmentPendingConfirmation = (request, order) => {
  const clientUrl = getClientUrl();
  const customerName = request.customerName || order?.customerSnapshot?.name || 'Valued Customer';
  const productName = request.productName || order?.items?.[0]?.productName || 'your exam voucher';
  const amount = Number(request.amountPaid || order?.total || 0);
  const orderNo = request.orderNo || order?.orderNo || '';
  const productSlug = request.productSlug || order?.items?.[0]?.slug || '';
  const redemptionUrl = resolveProductRedemptionUrl({
    slug: productSlug,
    productName,
  });

  const subject = `Payment Confirmed — Voucher Preparing (#${orderNo})`;
  const preheader = `Your payment for ${productName} was confirmed. Your voucher is being prepared.`;

  const bodyHtml = `
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      Hi ${escapeHtml(customerName)},
    </h1>

    <p style="font-size: 15px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; margin: 0 0 20px 0;">
      Your payment for <strong>${escapeHtml(productName)}</strong> was successful. Your voucher is delivered to your email within 1–2 minutes. Once delivered, you can use our step-by-step redemption guide below.
    </p>

    ${renderOrderSummary({
      orderNo,
      date: order?.paidAt || Date.now(),
      totalQty: request.quantity || 1,
      totalAmount: amount,
      paymentStatus: 'PAID',
      paymentRef: request.razorpayPaymentId || order?.razorpayPaymentId || null,
      items: order?.items || [{ productName, quantity: request.quantity || 1, unitPrice: amount }],
      currency: request.currency || order?.currency || 'INR',
      fxRate: order?.fxRateUsed || null,
    })}

    ${renderRedemptionGuideCard({
      productName,
      productUrl: redemptionUrl,
      isDelivered: false,
    })}

    ${renderCtaButton({
      label: 'View Order Status →',
      url: `${clientUrl}/account?tab=vouchers`,
      secondary: true,
    })}

    ${renderSecurityNotice()}
    ${renderSupportSection()}
  `;

  return sendEmail({
    to: request.customerEmail || order?.customerSnapshot?.email,
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Order Processing',
      badgeVariant: 'warning',
    }),
    tag: 'fulfillment-pending',
  });
};

/* ══════════════════════════════════════════════════════════════════════════
 * INTERNAL ADMIN NOTIFICATIONS & OPERATIONAL ALERTS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Internal Admin Alert: a PAID order needs manual voucher fulfillment.
 */
export const sendAdminFulfillmentRequestNotification = (request, order) => {
  const clientUrl = getClientUrl();
  const amount = Number(request.amountPaid || order?.total || 0);
  const maskedPayment = request.razorpayPaymentId
    ? `${String(request.razorpayPaymentId).slice(0, 8)}…`
    : '—';

  const subject = `Voucher Fulfillment Required — ${request.requestId} (${request.productName})`;
  const preheader = `Action Required: Paid customer order ${request.orderNo} requires manual voucher fulfillment.`;

  const bodyHtml = `
    <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      Voucher Fulfillment Required
    </h1>

    <p style="font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      A customer has paid in full, but no voucher code was available in inventory at the time of allocation. Deliver a verified code from the admin dashboard to complete the customer order.
    </p>

    ${renderStatusCard({
      status: 'ACTION REQUIRED',
      title: 'Manual Fulfillment Needed',
      description: 'Payment is captured and confirmed. Assign a voucher code from the admin console to dispatch to the customer.',
      variant: 'warning',
    })}

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 20px; margin-bottom: 22px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Request ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(request.requestId)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Customer:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(request.customerName)} (${escapeHtml(request.customerEmail)})</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Product:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(request.productName)} (${escapeHtml(request.voucherType || 'EXAM')}) × ${request.quantity || 1}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Order ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(request.orderNo)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Amount Paid:</td>
          <td align="right" style="font-size: 15px; font-weight: 900; color: ${BRAND_COLORS.pink}; padding-bottom: 7px;">${formatINR(amount)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Payment Reference:</td>
          <td align="right" style="font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(maskedPayment)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText};">Requested Date:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText};">${formatDateTime(request.createdAt || Date.now())}</td>
        </tr>
      </table>
    </div>

    ${renderCtaButton({
      label: 'Open Fulfillment Request →',
      url: `${clientUrl}/admin`,
    })}
  `;

  return sendEmail({
    to: config.business.adminNotificationEmail,
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Admin Action',
      badgeVariant: 'admin',
      isAdmin: true,
    }),
    tag: 'fulfillment-request',
  });
};

/**
 * Internal Admin Notification: a voucher has been SOLD & FULFILLED.
 */
export const sendAdminVoucherSaleNotification = (user, order, vouchers = []) => {
  const clientUrl = getClientUrl();
  const customerName = user?.name || order.customerSnapshot?.name || order.billingDetails?.name || 'Customer';
  const customerEmail = user?.email || order.customerSnapshot?.email || order.billingDetails?.email || 'N/A';
  const customerPhone = user?.phone || order.customerSnapshot?.phone || order.billingDetails?.phone || 'N/A';

  const firstProductName = order.items?.[0]?.productName || 'Exam Voucher';
  const voucherType = vouchers?.[0]?.voucherType || order.items?.[0]?.voucherType || 'EXAM';
  const quantity = order.items?.reduce((s, i) => s + (i.quantity || 1), 0) || vouchers.length || 1;
  const paymentRef = order.razorpayPaymentId || order.paymentReference || 'N/A';
  const ts = formatDateTime(order.paidAt || Date.now());
  const maskedCodes = (vouchers || []).map((v) => maskVoucherCode(v.code)).join(', ') || '—';

  const subject = `New Voucher Sale — Order #${order.orderNo}`;
  const preheader = `Voucher sold to ${customerName}: ${firstProductName} (₹${order.total?.toLocaleString('en-IN')}).`;

  const row = (label, value, isPink = false) => `
    <tr>
      <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">${escapeHtml(label)}:</td>
      <td align="right" style="font-size: 13px; font-weight: 700; color: ${isPink ? BRAND_COLORS.pink : BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(value)}</td>
    </tr>`;

  const bodyHtml = `
    <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      New Voucher Sale Confirmed
    </h1>

    <p style="font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      A customer order has been verified, paid, and successfully fulfilled.
    </p>

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 20px; margin-bottom: 22px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        ${row('Customer', customerName)}
        ${row('Email', customerEmail, true)}
        ${row('Phone', customerPhone)}
        ${row('Order ID', order.orderNo)}
        ${row('Product', firstProductName)}
        ${row('Voucher Type', voucherType)}
        ${row('Quantity', String(quantity))}
        ${row('Amount Paid', formatMoney(order.total, order.currency || 'INR'), true)}
        ${row('Payment ID', paymentRef)}
        ${row('Vouchers (Masked)', maskedCodes)}
        ${row('Payment Status', order.paymentStatus || 'PAID')}
        ${row('Fulfillment', order.fulfillmentStatus || 'FULFILLED')}
        ${row('Time', ts)}
      </table>
    </div>

    ${renderCtaButton({
      label: 'Open Order in Admin Dashboard →',
      url: `${clientUrl}/admin`,
    })}
  `;

  return sendEmail({
    to: config.business.adminNotificationEmail,
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'New Sale',
      badgeVariant: 'success',
      isAdmin: true,
    }),
  });
};

export const sendAdminNewOrderNotification = sendAdminVoucherSaleNotification;

/**
 * Internal Admin Alert: Voucher Assignment Failure on a Paid Order.
 */
export const sendAdminVoucherAssignmentFailureAlert = (order, errorMsg) => {
  const clientUrl = getClientUrl();
  const customerEmail = order.customerSnapshot?.email || order.billingDetails?.email || 'N/A';
  const customerName = order.customerSnapshot?.name || order.billingDetails?.name || 'Customer';
  const firstProductName = order.items?.[0]?.productName || 'Exam Voucher';

  const subject = `Action Required — Paid Order Without Voucher Assignment (#${order.orderNo})`;
  const preheader = `Urgent: Paid order ${order.orderNo} failed inventory assignment. Manual action needed.`;

  const bodyHtml = `
    <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.alertText};">
      Action Required: Voucher Unassigned
    </h1>

    <p style="font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      An order was successfully paid, but voucher inventory assignment failed. Please assign a voucher manually from the admin console.
    </p>

    ${renderStatusCard({
      status: 'ASSIGNMENT FAILED',
      title: 'Manual Voucher Allocation Needed',
      description: errorMsg || 'Inventory empty or allocation interrupted.',
      variant: 'alert',
    })}

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.alertBorder}; border-radius: 14px; padding: 20px; margin-bottom: 22px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Order ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(order.orderNo)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Customer Name:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(customerName)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Customer Email:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.pink}; padding-bottom: 7px;">${escapeHtml(customerEmail)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Product Requested:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(firstProductName)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Amount Paid:</td>
          <td align="right" style="font-size: 14px; font-weight: 900; color: ${BRAND_COLORS.pink}; padding-bottom: 7px;">${formatMoney(order.total, order.currency || 'INR')}</td>
        </tr>
      </table>
    </div>

    ${renderCtaButton({
      label: 'Assign Voucher in Admin →',
      url: `${clientUrl}/admin`,
    })}
  `;

  return sendEmail({
    to: config.business.adminNotificationEmail,
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Critical Alert',
      badgeVariant: 'security',
      isAdmin: true,
    }),
  });
};

/**
 * Internal Admin Alert: Customer Email Delivery Failure.
 */
export const sendAdminEmailDeliveryFailureAlert = (order, errorMsg) => {
  const clientUrl = getClientUrl();
  const customerEmail = order.customerSnapshot?.email || order.billingDetails?.email || 'N/A';

  const subject = `Voucher Email Delivery Failed — Order #${order.orderNo}`;
  const preheader = `Customer email delivery failed for order ${order.orderNo}. Resend available in admin console.`;

  const bodyHtml = `
    <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.warningText};">
      Voucher Email Delivery Failed
    </h1>

    <p style="font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      The customer's voucher is active in their account, but automated email dispatch failed. You can click <strong>"Resend Voucher Email"</strong> in the admin console.
    </p>

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.warningBorder}; border-radius: 14px; padding: 20px; margin-bottom: 22px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Order ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(order.orderNo)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Customer Email:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.pink}; padding-bottom: 7px;">${escapeHtml(customerEmail)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText};">Error Reason:</td>
          <td align="right" style="font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.warningText};">${escapeHtml(errorMsg || 'SMTP dispatch error')}</td>
        </tr>
      </table>
    </div>

    ${renderCtaButton({
      label: 'Open Admin Console to Resend →',
      url: `${clientUrl}/admin`,
    })}
  `;

  return sendEmail({
    to: config.business.adminNotificationEmail,
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Delivery Warning',
      badgeVariant: 'admin',
      isAdmin: true,
    }),
  });
};

/**
 * Internal Admin Security Alert: Voucher Product Mismatch Blocked.
 */
export const sendAdminVoucherMismatchAlert = (order, expectedItem, attemptedVoucher) => {
  const clientUrl = getClientUrl();
  const customerEmail = order.customerSnapshot?.email || order.billingDetails?.email || 'N/A';
  const expectedType = expectedItem?.voucherType || 'Unknown';
  const attemptedType = attemptedVoucher?.voucherType || 'Unknown';

  const subject = `Security Alert: Voucher Product Mismatch Blocked — Order #${order.orderNo}`;
  const preheader = `Security Guard: Blocked mismatched voucher assignment on order ${order.orderNo}.`;

  const bodyHtml = `
    <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.alertText};">
      Critical Security: Voucher Mismatch Blocked
    </h1>

    <p style="font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      An attempted voucher delivery was <strong>AUTOMATICALLY BLOCKED</strong> because the voucher type did not match the purchased product. The incorrect code was NOT delivered to the customer.
    </p>

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.alertBorder}; border-radius: 14px; padding: 20px; margin-bottom: 22px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Order ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(order.orderNo)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Customer:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.pink}; padding-bottom: 7px;">${escapeHtml(customerEmail)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Expected Product:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.successText}; padding-bottom: 7px;">${escapeHtml(expectedItem?.productName || '')} (${escapeHtml(expectedType)})</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Attempted Voucher:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.alertText}; padding-bottom: 7px;">${escapeHtml(attemptedType)} (${escapeHtml(attemptedVoucher?.code || '—')})</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText};">Action Taken:</td>
          <td align="right" style="font-size: 12px; font-weight: 800; color: ${BRAND_COLORS.alertText};">DELIVERY BLOCKED</td>
        </tr>
      </table>
    </div>

    ${renderCtaButton({
      label: 'Review Inventory in Admin →',
      url: `${clientUrl}/admin`,
    })}
  `;

  return sendEmail({
    to: config.business.adminNotificationEmail,
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Security Alert',
      badgeVariant: 'security',
      isAdmin: true,
    }),
  });
};

/* ══════════════════════════════════════════════════════════════════════════
 * USER AUTHENTICATION & VERIFICATION (OTP + PASSWORD RESET)
 * ══════════════════════════════════════════════════════════════════════════ */

const OTP_EXPIRY_MINUTES = 10;

/**
 * Universal High-Deliverability Light OTP Email Layout.
 */
const renderOtpTemplate = ({ heading, intro, otp, closing, preheader = '' }) => {
  const logoUrl = getLogoUrl();
  const clientUrl = getClientUrl();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND_COLORS.pageBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${BRAND_COLORS.dark};">
  
  ${preheader ? `
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #ffffff; opacity: 0; mso-hide: all;">
    ${escapeHtml(preheader)}
  </div>` : ''}

  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${BRAND_COLORS.pageBg}; padding: 36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);">
          
          <!-- Header Logo -->
          <tr>
            <td style="padding: 28px 32px 18px 32px; border-bottom: 1px solid ${BRAND_COLORS.cardBorder}; text-align: center;">
              <a href="${escapeHtml(clientUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
                <img src="${escapeHtml(logoUrl)}" alt="Apex Vouchers" width="150" height="59" style="display: block; margin: 0 auto; width: 150px; max-width: 100%; height: auto; border: 0;" />
              </a>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 28px 32px 24px 32px;">
              <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark}; text-align: center;">
                ${escapeHtml(heading)}
              </h1>
              <p style="font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; margin: 0 0 20px 0; text-align: center;">
                ${intro}
              </p>

              <!-- OTP Box -->
              <div style="background-color: ${BRAND_COLORS.pinkLight}; border: 1.5px dashed ${BRAND_COLORS.pink}; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0 16px 0;">
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${BRAND_COLORS.pink}; margin-bottom: 6px;">
                  VERIFICATION CODE
                </div>
                <div style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: ${BRAND_COLORS.dark}; font-family: 'Courier New', monospace;">
                  ${escapeHtml(otp)}
                </div>
              </div>

              <p style="font-size: 12px; color: ${BRAND_COLORS.mutedText}; text-align: center; margin: 0 0 16px 0;">
                ⏱ This verification code will expire in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.
              </p>

              ${closing ? `<p style="font-size: 12px; color: ${BRAND_COLORS.lightMuted}; text-align: center; margin: 0;">${escapeHtml(closing)}</p>` : ''}
            </td>
          </tr>

          <!-- Simple Safe Footer -->
          <tr>
            <td style="padding: 18px 32px; border-top: 1px solid ${BRAND_COLORS.cardBorder}; font-size: 11px; color: ${BRAND_COLORS.lightMuted}; text-align: center; background-color: ${BRAND_COLORS.pageBg};">
              Need help? Contact <a href="mailto:${escapeHtml(config.business.supportEmail)}" style="color: ${BRAND_COLORS.pink}; text-decoration: none;">${escapeHtml(config.business.supportEmail)}</a><br/>
              © ${new Date().getFullYear()} ${escapeHtml(config.business.name)}. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Registration email verification — 6-digit OTP sent to new user.
 */
export const sendRegistrationOtp = (user, otp) => {
  const name = user?.name ? String(user.name).trim().split(' ')[0] : '';
  const greeting = name ? `Hello ${escapeHtml(name)},` : 'Hello,';
  const text =
    `Hello,\n\nYour ${config.business.name} verification code is:\n\n${otp}\n\n` +
    `This code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\n` +
    `If you did not request an ${config.business.name} account, you can safely ignore this email.\n\nThanks,\n${config.business.name}`;

  return sendEmail({
    to: user.email,
    tag: 'otp-register',
    subject: `Your ${config.business.name} Verification Code`,
    text,
    html: renderOtpTemplate({
      heading: 'Verify Your Email Address',
      intro: `${greeting} enter this verification code to finish creating your <strong>${escapeHtml(config.business.name)}</strong> account.`,
      otp,
      closing: `If you did not create an account on ${config.business.name}, you can safely ignore this message.`,
      preheader: `Your verification code is ${otp}. Valid for 10 minutes.`,
    }),
  });
};

/**
 * Change-email OTP — 6-digit code sent to the NEW address.
 */
export const sendEmailOtpCode = (user, newEmail, otp) => {
  const text =
    `Hello,\n\nYou requested to change your ${config.business.name} account email to ${newEmail}.\n\n` +
    `Your verification code is:\n\n${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\n` +
    `If you did not request this change, ignore this email — your current email stays unchanged.`;

  return sendEmail({
    to: newEmail,
    tag: 'otp-change-email',
    subject: `Verify Your New Email — ${config.business.name}`,
    text,
    html: renderOtpTemplate({
      heading: 'Verify Your New Email',
      intro: `You requested to update your ${escapeHtml(config.business.name)} account email to <strong>${escapeHtml(newEmail)}</strong>. Enter this code to confirm.`,
      otp,
      closing: 'If you did not request this change, please ignore this email. Your current account email will remain unchanged.',
      preheader: `Your email change code is ${otp}. Valid for 10 minutes.`,
    }),
  });
};

/**
 * Security notice sent to the OLD email address after an email change.
 */
export const sendEmailChangedSecurityNotice = (user, oldEmail, newEmail) => {
  const clientUrl = getClientUrl();
  const userName = user?.name || 'there';
  const subject = `Your ${config.business.name} Account Email Was Changed`;
  const preheader = `Security Notice: The login email for your ${config.business.name} account was updated.`;

  const bodyHtml = `
    <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      Account Email Changed
    </h1>
    <p style="font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      Hi ${escapeHtml(userName)}, this is a confirmation that your <strong>${escapeHtml(config.business.name)}</strong> account email was updated to:
    </p>

    <div style="background-color: ${BRAND_COLORS.subtleBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; color: ${BRAND_COLORS.dark};">
      ${escapeHtml(newEmail)}
    </div>

    ${renderSecurityNotice()}

    <p style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; margin-top: 18px; line-height: 1.5;">
      If you did not make this change, please contact our support team immediately so we can lock your account.
    </p>

    ${renderCtaButton({
      label: 'Contact Support Immediately →',
      url: `${clientUrl}/contact`,
    })}
  `;

  return sendEmail({
    to: oldEmail,
    tag: 'email-changed-notice',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Security Notice',
      badgeVariant: 'security',
    }),
  });
};

/**
 * Password Reset Link Email.
 */
export const sendPasswordReset = (user, token) => {
  const clientUrl = getClientUrl();
  const url = `${clientUrl}/reset-password?token=${token}`;
  const userName = user?.name || 'there';
  const subject = `Reset Your ${config.business.name} Password`;
  const preheader = 'Follow the link inside to choose a new password. Valid for 60 minutes.';

  const bodyHtml = `
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      Reset Your Password
    </h1>

    <p style="font-size: 14px; line-height: 1.65; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      Hi ${escapeHtml(userName)}, we received a request to reset your password. Click the button below to set a new password. This link is secure and valid for <strong>60 minutes</strong>.
    </p>

    ${renderCtaButton({
      label: 'Reset Password Now →',
      url,
    })}

    <p style="font-size: 12px; color: ${BRAND_COLORS.mutedText}; line-height: 1.5; margin-top: 20px; text-align: center;">
      If the button above does not work, copy and paste this link into your browser:<br/>
      <a href="${escapeHtml(url)}" style="color: ${BRAND_COLORS.pink}; word-break: break-all;">${escapeHtml(url)}</a>
    </p>

    ${renderSecurityNotice()}
  `;

  return sendEmail({
    to: user.email,
    tag: 'password-reset',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Password Reset',
    }),
  });
};

/* ══════════════════════════════════════════════════════════════════════════
 * PTE BOOKING ASSISTANCE REQUEST FLOW
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Customer Confirmation: Payment Received for PTE Booking Request.
 */
export const sendPTEBookingConfirmationToCustomer = (booking) => {
  const clientUrl = getClientUrl();
  const subject = `Payment Received — PTE Booking Request ${booking.requestId}`;
  const preheader = `Your payment has been received successfully. Your PTE booking request has been submitted to our team for processing.`;
  const dateStr = booking.preferredDate ? formatDate(booking.preferredDate) : 'Flexible';

  const bodyHtml = `
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      Hi ${escapeHtml(booking.fullName)},
    </h1>

    <p style="font-size: 14px; line-height: 1.65; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      Your payment has been received successfully. Your PTE booking request has been submitted to our team for processing.
    </p>

    <div style="background-color: ${BRAND_COLORS.warningBg}; border: 1px solid ${BRAND_COLORS.warningBorder}; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; font-size: 13px; color: ${BRAND_COLORS.warningText}; line-height: 1.55;">
      <strong>⚠️ Important Notice:</strong><br />
      Your exam is <strong>NOT</strong> considered booked until our team processes and confirms the booking with official Pearson appointment details.<br />
      <em>This payment is for PTE exam booking assistance only. No voucher, voucher code, or voucher credit is included.</em>
    </div>

    ${renderStatusCard({
      status: booking.status || 'Payment Received',
      title: 'Booking Request Under Team Review',
      description: 'Our booking specialists are reviewing live Pearson test centre slots according to your preferences.',
      variant: 'info',
    })}

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 20px; margin-bottom: 20px;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${BRAND_COLORS.mutedText}; letter-spacing: 0.8px; margin-bottom: 12px;">
        PAYMENT & REQUEST DETAILS
      </div>
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Request ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(booking.requestId)}</td>
        </tr>
        ${booking.orderNo ? `
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Order Number:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">#${escapeHtml(booking.orderNo)}</td>
        </tr>` : ''}
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">PTE Service:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.pink}; padding-bottom: 7px;">${escapeHtml(booking.examType)}</td>
        </tr>
        ${booking.amountPaid ? `
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Amount Paid:</td>
          <td align="right" style="font-size: 13px; font-weight: 800; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(booking.currency || 'INR')} ${escapeHtml(String(booking.amountPaid))}</td>
        </tr>` : ''}
        ${booking.paymentId ? `
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Payment ID:</td>
          <td align="right" style="font-size: 12px; font-family: monospace; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">${escapeHtml(booking.paymentId)}</td>
        </tr>` : ''}
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Preferred City:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(booking.preferredCity || 'Flexible')}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Preferred Date:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(dateStr)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Preferred Time Slot:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(booking.preferredTime || 'Any Time')}</td>
        </tr>
        ${booking.preferredTestCentre ? `
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Preferred Test Centre:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(booking.preferredTestCentre)}</td>
        </tr>` : ''}
        ${booking.message ? `
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-top: 6px; border-top: 1px solid ${BRAND_COLORS.cardBorder};">Notes:</td>
          <td align="right" style="font-size: 13px; font-weight: 500; color: ${BRAND_COLORS.bodyText}; padding-top: 6px; border-top: 1px solid ${BRAND_COLORS.cardBorder};">${escapeHtml(booking.message)}</td>
        </tr>` : ''}
      </table>
    </div>

    ${renderCtaButton({
      label: 'View Booking Request in Account →',
      url: `${clientUrl}/account?tab=pte-bookings`,
    })}

    ${renderSupportSection()}
  `;

  return sendEmail({
    to: booking.email,
    tag: 'pte-booking-confirmation',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'PTE Booking Request',
    }),
  });
};

/**
 * Customer Notification: Status Changed for PTE Booking Request.
 */
export const sendPTEBookingStatusUpdateToCustomer = (booking, newStatus, note = '', confirmationDetails = null) => {
  const clientUrl = getClientUrl();
  const isConfirmed = newStatus === 'Booking Confirmed' || newStatus === 'Completed';
  const isFailed = newStatus === 'Booking Failed / Unable to Book';
  const isCancelled = newStatus === 'Cancelled / Refund Required' || newStatus === 'Cancelled' || newStatus === 'Rejected';
  const variant = isConfirmed ? 'success' : isFailed || isCancelled ? 'alert' : 'info';

  const subject = isConfirmed
    ? `🎉 Official Booking Confirmation — ${booking.examType} (${booking.requestId})`
    : `PTE Booking Status Update: ${newStatus} — ${booking.requestId}`;

  const preheader = isConfirmed
    ? `Your PTE exam has been officially booked and confirmed! Review your appointment details.`
    : `Your PTE booking request ${booking.requestId} status has been updated to: ${newStatus}.`;

  let confirmationBlock = '';
  if (isConfirmed && confirmationDetails && (confirmationDetails.bookingReference || confirmationDetails.confirmedCentre)) {
    confirmationBlock = `
      <div style="background-color: ${BRAND_COLORS.successBg}; border: 1px solid ${BRAND_COLORS.successBorder}; border-radius: 14px; padding: 20px; margin-bottom: 20px;">
        <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: ${BRAND_COLORS.successText}; letter-spacing: 0.8px; margin-bottom: 12px;">
          OFFICIAL PEARSON APPOINTMENT CONFIRMATION
        </div>
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
          ${confirmationDetails.bookingReference ? `<tr><td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 6px;">Booking Reference:</td><td align="right" style="font-size: 14px; font-weight: 800; color: ${BRAND_COLORS.dark}; padding-bottom: 6px; font-family: monospace;">${escapeHtml(confirmationDetails.bookingReference)}</td></tr>` : ''}
          ${confirmationDetails.confirmedCentre ? `<tr><td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 6px;">Test Centre:</td><td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 6px;">${escapeHtml(confirmationDetails.confirmedCentre)}</td></tr>` : ''}
          ${confirmationDetails.confirmedCity ? `<tr><td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 6px;">City:</td><td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 6px;">${escapeHtml(confirmationDetails.confirmedCity)}</td></tr>` : ''}
          ${confirmationDetails.confirmedDate ? `<tr><td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 6px;">Confirmed Date:</td><td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.successText}; padding-bottom: 6px;">${formatDate(confirmationDetails.confirmedDate)}</td></tr>` : ''}
          ${confirmationDetails.confirmedTime ? `<tr><td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 6px;">Confirmed Time:</td><td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.successText}; padding-bottom: 6px;">${escapeHtml(confirmationDetails.confirmedTime)}</td></tr>` : ''}
          ${confirmationDetails.importantInstructions ? `<tr><td colspan="2" style="font-size: 12px; color: ${BRAND_COLORS.bodyText}; padding-top: 10px; border-top: 1px solid ${BRAND_COLORS.successBorder};"><strong>Exam Day Instructions:</strong><br />${escapeHtml(confirmationDetails.importantInstructions)}</td></tr>` : ''}
        </table>
      </div>

      <div style="background-color: ${BRAND_COLORS.subtleBg}; border-left: 3px solid ${BRAND_COLORS.pink}; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: ${BRAND_COLORS.bodyText}; line-height: 1.5;">
        <strong>Important:</strong> Please bring your original valid passport (or accepted government ID exactly matching your booking details) to the test centre. Arrive at least 30 minutes before your scheduled appointment time.
      </div>
    `;
  }

  let edgeCaseBlock = '';
  if (isFailed) {
    edgeCaseBlock = `
      <div style="background-color: ${BRAND_COLORS.warningBg}; border: 1px solid ${BRAND_COLORS.warningBorder}; border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 13px; color: ${BRAND_COLORS.warningText}; line-height: 1.55;">
        <strong>Booking Update:</strong> We were unable to secure your requested appointment with the test centre at this time. Our support team is actively reviewing alternate date and centre options with you or processing a full refund if preferred.
      </div>
    `;
  } else if (isCancelled) {
    edgeCaseBlock = `
      <div style="background-color: ${BRAND_COLORS.subtleBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 13px; color: ${BRAND_COLORS.bodyText}; line-height: 1.55;">
        <strong>Request Cancelled:</strong> This PTE booking assistance request has been cancelled. If a refund is due, it will be credited back to your original payment method. Contact our support team if you have any questions.
      </div>
    `;
  }

  const bodyHtml = `
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      Hi ${escapeHtml(booking.fullName)},
    </h1>

    <p style="font-size: 14px; line-height: 1.65; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      ${isConfirmed
        ? 'Great news! Your PTE exam appointment has been officially confirmed by our team.'
        : `Your PTE exam booking assistance request ${escapeHtml(booking.requestId)} has been updated.`}
    </p>

    ${renderStatusCard({
      status: newStatus,
      title: isConfirmed ? 'Booking Confirmed' : `Status: ${newStatus}`,
      description: isConfirmed
        ? 'Your Pearson appointment is locked in. Review your appointment details below.'
        : `Your booking request status is now: ${newStatus}.`,
      variant,
    })}

    ${confirmationBlock}
    ${edgeCaseBlock}

    ${note ? `
    <div style="background-color: ${BRAND_COLORS.subtleBg}; border-left: 3px solid ${BRAND_COLORS.pink}; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: ${BRAND_COLORS.bodyText};">
      <strong>Special Note from Team:</strong> ${escapeHtml(note)}
    </div>` : ''}

    ${renderCtaButton({
      label: 'View Booking in Account →',
      url: `${clientUrl}/account?tab=pte-bookings`,
    })}

    ${renderSupportSection()}
  `;

  return sendEmail({
    to: booking.email,
    tag: 'pte-booking-update',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Status Update',
      badgeVariant: variant,
    }),
  });
};

/**
 * Internal Admin Notification: New Paid PTE Booking Assistance Request.
 */
export const sendPTEBookingAdminNotification = (booking) => {
  const clientUrl = getClientUrl();
  const subject = `New Paid PTE Booking Request — ${booking.requestId} (${booking.fullName})`;
  const preheader = `New booking request: ${booking.fullName} paid ${booking.currency || 'INR'} ${booking.amountPaid || '—'} for ${booking.examType}.`;
  const dateStr = booking.preferredDate ? formatDate(booking.preferredDate) : 'Flexible';

  const bodyHtml = `
    <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      New PTE Booking Assistance Request
    </h1>

    <p style="font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      A customer has completed payment for PTE examination booking assistance. Please review and arrange the official Pearson slot.
    </p>

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 20px; margin-bottom: 22px;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${BRAND_COLORS.mutedText}; letter-spacing: 0.8px; margin-bottom: 12px;">
        CANDIDATE & BOOKING SUMMARY
      </div>
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Customer Name:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(booking.fullName)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Email:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.pink}; padding-bottom: 7px;">${escapeHtml(booking.email)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Phone:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(booking.phone)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">PTE Service:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(booking.examType)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Amount Paid:</td>
          <td align="right" style="font-size: 13px; font-weight: 800; color: ${BRAND_COLORS.successText}; padding-bottom: 7px;">${escapeHtml(booking.currency || 'INR')} ${escapeHtml(String(booking.amountPaid || '—'))}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Payment Status:</td>
          <td align="right" style="font-size: 12px; font-weight: 800; color: ${BRAND_COLORS.successText}; padding-bottom: 7px;">${escapeHtml(booking.paymentStatus || 'PAID')}</td>
        </tr>
        ${booking.paymentId ? `
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Razorpay Payment ID:</td>
          <td align="right" style="font-size: 12px; font-family: monospace; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(booking.paymentId)}</td>
        </tr>` : ''}
        ${booking.orderNo ? `
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Order Number:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">#${escapeHtml(booking.orderNo)}</td>
        </tr>` : ''}
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Preferred City:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(booking.preferredCity)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Preferred Test Centre:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(booking.preferredTestCentre || 'Any Available Centre')}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Preferred Date:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(dateStr)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Preferred Time:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(booking.preferredTime || 'Any Time')}</td>
        </tr>
        ${booking.message ? `
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Customer Notes:</td>
          <td align="right" style="font-size: 13px; font-weight: 500; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(booking.message)}</td>
        </tr>` : ''}
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText};">Request ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; font-family: 'Courier New', monospace;">${escapeHtml(booking.requestId)}</td>
        </tr>
      </table>
    </div>

    ${renderCtaButton({
      label: 'Open Request in Admin Panel →',
      url: `${clientUrl}/admin`,
    })}
  `;

  return sendEmail({
    to: config.business.adminNotificationEmail,
    tag: 'pte-booking-admin',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'PTE Booking Request',
      badgeVariant: 'admin',
      isAdmin: true,
    }),
  });
};

/* ══════════════════════════════════════════════════════════════════════════
 * VOUCHER REQUEST FLOW (When inventory is sourced on-demand)
 * ══════════════════════════════════════════════════════════════════════════ */

/** Customer confirmation — "we received your voucher request". */
export const sendVoucherRequestConfirmationToCustomer = (request) => {
  const subject = `Voucher Request Received — ${request.requestId}`;
  const preheader = `We received your request for ${request.productName}. Our team is sourcing inventory.`;

  const bodyHtml = `
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      Hi ${escapeHtml(request.customerName)},
    </h1>
    <p style="font-size: 14px; line-height: 1.65; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      Thank you for your request. Our team has received your inquiry for the <strong>${escapeHtml(request.productName)}</strong> voucher and is currently sourcing verified codes.
    </p>

    ${renderStatusCard({
      status: 'SOURCING INVENTORY',
      title: 'Voucher Request in Progress',
      description: 'We will notify you by email as soon as this voucher is available for checkout.',
      variant: 'info',
    })}

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 20px; margin-bottom: 20px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Request ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(request.requestId)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Voucher:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(request.productName)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Voucher Type:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(request.voucherType || 'EXAM')}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText};">Requested On:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText};">${formatDateTime(request.createdAt || Date.now())}</td>
        </tr>
      </table>
    </div>

    ${renderSupportSection()}
  `;

  return sendEmail({
    to: request.customerEmail,
    tag: 'voucher-request-received',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Request Received',
      badgeVariant: 'info',
    }),
  });
};

/** Internal admin notification — a customer requested an out-of-stock voucher. */
export const sendVoucherRequestAdminNotification = (request) => {
  const clientUrl = getClientUrl();
  const subject = `New Voucher Request — ${request.productName} (${request.requestId})`;
  const preheader = `Customer ${request.customerName} requested out-of-stock voucher ${request.productName}.`;

  const bodyHtml = `
    <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      New Voucher Sourcing Request
    </h1>

    <p style="font-size: 14px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      A customer requested a voucher that currently has no available stock in inventory.
    </p>

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 20px; margin-bottom: 22px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Customer:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(request.customerName)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Email:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.pink}; padding-bottom: 7px;">${escapeHtml(request.customerEmail)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Voucher:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(request.productName)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Voucher Type:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(request.voucherType || 'EXAM')}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Request ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(request.requestId)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText};">Requested On:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText};">${formatDateTime(request.createdAt || Date.now())}</td>
        </tr>
      </table>
    </div>

    ${renderCtaButton({
      label: 'Open Voucher Requests in Admin →',
      url: `${clientUrl}/admin`,
    })}
  `;

  return sendEmail({
    to: config.business.adminNotificationEmail,
    tag: 'voucher-request-admin',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Voucher Request',
      badgeVariant: 'admin',
      isAdmin: true,
    }),
  });
};

/** Customer — the voucher has been sourced and is ready to buy. */
export const sendVoucherRequestReadyForPaymentToCustomer = (request) => {
  const clientUrl = getClientUrl();
  const subject = `Your Requested Voucher Is Ready to Purchase — ${request.productName}`;
  const preheader = `Good news! Your requested voucher ${request.productName} has been sourced. Complete purchase now.`;
  const priceLine = request.priceSnapshot
    ? formatINR(request.priceSnapshot)
    : 'shown at checkout';

  const bodyHtml = `
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      Hi ${escapeHtml(request.customerName)},
    </h1>

    <p style="font-size: 14px; line-height: 1.65; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      Good news — we have sourced the <strong>${escapeHtml(request.productName)}</strong> voucher you requested. You can now complete your checkout and it will be delivered immediately upon payment.
    </p>

    ${renderStatusCard({
      status: 'READY FOR PAYMENT',
      title: 'Voucher Sourced Successfully',
      description: 'Your voucher is reserved. Click below to complete your checkout and receive your code.',
      variant: 'success',
    })}

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 20px; margin-bottom: 22px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Request ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(request.requestId)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Voucher:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(request.productName)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Price:</td>
          <td align="right" style="font-size: 16px; font-weight: 900; color: ${BRAND_COLORS.pink}; padding-bottom: 7px;">${escapeHtml(priceLine)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText};">Status:</td>
          <td align="right" style="font-size: 12px; font-weight: 800; color: ${BRAND_COLORS.successText};">Ready for Payment</td>
        </tr>
      </table>
    </div>

    ${renderCtaButton({
      label: 'Complete Your Purchase →',
      url: `${clientUrl}/account?tab=voucher-requests`,
    })}

    ${renderSupportSection()}
  `;

  return sendEmail({
    to: request.customerEmail,
    tag: 'voucher-request-ready',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Ready to Buy',
      badgeVariant: 'success',
    }),
  });
};

/** Customer — payment captured, requested voucher delivered. */
export const sendVoucherRequestFulfilledToCustomer = (request, voucher = null) => {
  const clientUrl = getClientUrl();
  const subject = `Your Requested ${request.productName} Voucher Is Ready`;
  const preheader = `Your requested voucher ${request.productName} is ready and delivered to your account.`;

  const voucherCardsHtml = voucher?.code
    ? renderVoucherCards([voucher], request.productName)
    : '';

  const bodyHtml = `
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      Hi ${escapeHtml(request.customerName)},
    </h1>

    <p style="font-size: 14px; line-height: 1.65; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      Your payment is confirmed and the voucher you requested has been successfully delivered to your account.
    </p>

    ${renderStatusCard({
      status: 'FULFILLED & READY',
      title: 'Your Voucher is Ready',
      description: 'You can now use your code to register for your exam.',
      variant: 'success',
    })}

    ${voucherCardsHtml}

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 20px; margin-bottom: 20px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 6px;">Request ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 6px; font-family: 'Courier New', monospace;">${escapeHtml(request.requestId)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 6px;">Status:</td>
          <td align="right" style="font-size: 12px; font-weight: 800; color: ${BRAND_COLORS.successText}; padding-bottom: 6px;">FULFILLED</td>
        </tr>
        ${request.paymentReference ? `
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText};">Payment Reference:</td>
          <td align="right" style="font-size: 12px; font-weight: 600; color: ${BRAND_COLORS.mutedText}; font-family: 'Courier New', monospace;">${escapeHtml(request.paymentReference)}</td>
        </tr>` : ''}
      </table>
    </div>

    ${renderCtaButton({
      label: 'View My Vouchers →',
      url: `${clientUrl}/account?tab=vouchers`,
    })}

    ${renderSecurityNotice()}
    ${renderSupportSection()}
  `;

  return sendEmail({
    to: request.customerEmail,
    tag: 'voucher-request-fulfilled',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Delivered',
      badgeVariant: 'success',
    }),
  });
};

/** Customer — request was closed without fulfillment. */
export const sendVoucherRequestCancelledToCustomer = (request, reason = '') => {
  const subject = `Update on Your Voucher Request — ${request.requestId}`;
  const preheader = `Your request for ${request.productName} has been cancelled.`;

  const bodyHtml = `
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      Hi ${escapeHtml(request.customerName)},
    </h1>

    <p style="font-size: 14px; line-height: 1.65; color: ${BRAND_COLORS.bodyText}; margin: 0 0 18px 0;">
      Your request for the <strong>${escapeHtml(request.productName)}</strong> voucher (${escapeHtml(request.requestId)}) could not be fulfilled and has been closed${reason ? `: <em>${escapeHtml(reason)}</em>` : '.'}
    </p>

    <p style="font-size: 13px; line-height: 1.6; color: ${BRAND_COLORS.mutedText};">
      If you have questions or would like to explore alternative examination dates or products, reply directly to this email or reach out to our team.
    </p>

    ${renderSupportSection()}
  `;

  return sendEmail({
    to: request.customerEmail,
    tag: 'voucher-request-cancelled',
    subject,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Request Update',
      badgeVariant: 'warning',
    }),
  });
};

/* ══════════════════════════════════════════════════════════════════════════
 * CONTACT INQUIRY NOTIFICATION
 * ══════════════════════════════════════════════════════════════════════════ */

export const sendContactFormNotification = (contact) => {
  const subject = `[Contact] ${contact.subject}`;
  const preheader = `New website contact inquiry from ${contact.name}: "${contact.subject}"`;

  const bodyHtml = `
    <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: ${BRAND_COLORS.dark};">
      New Website Contact Inquiry
    </h1>

    <div style="background-color: ${BRAND_COLORS.pageBg}; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 14px; padding: 20px; margin-bottom: 20px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Name:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(contact.name)}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Email:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.pink}; padding-bottom: 7px;"><a href="mailto:${escapeHtml(contact.email)}" style="color: ${BRAND_COLORS.pink};">${escapeHtml(contact.email)}</a></td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Phone:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px;">${escapeHtml(contact.phone || 'Not provided')}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Order ID:</td>
          <td align="right" style="font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.bodyText}; padding-bottom: 7px; font-family: 'Courier New', monospace;">${escapeHtml(contact.orderId || 'Not provided')}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText}; padding-bottom: 7px;">Category:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark}; padding-bottom: 7px;">${escapeHtml(contact.category || 'General Question')}</td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: ${BRAND_COLORS.mutedText};">Subject:</td>
          <td align="right" style="font-size: 13px; font-weight: 700; color: ${BRAND_COLORS.dark};">${escapeHtml(contact.subject)}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #ffffff; border: 1px solid ${BRAND_COLORS.cardBorder}; border-radius: 10px; padding: 18px; margin-bottom: 20px;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${BRAND_COLORS.mutedText}; margin-bottom: 8px;">
        MESSAGE CONTENT:
      </div>
      <div style="font-size: 13px; line-height: 1.6; color: ${BRAND_COLORS.bodyText}; white-space: pre-wrap;">
        ${escapeHtml(contact.message)}
      </div>
    </div>
  `;

  return sendEmail({
    to: config.business.adminNotificationEmail || config.business.supportEmail,
    tag: 'contact-inquiry',
    subject,
    replyTo: contact.email,
    html: renderEmailLayout({
      title: subject,
      preheader,
      body: bodyHtml,
      brandBadge: 'Contact Form',
      badgeVariant: 'info',
      isAdmin: true,
    }),
  });
};
