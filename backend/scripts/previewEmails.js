import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  renderEmailLayout,
  renderOrderSummary,
  renderVoucherCards,
  renderRedemptionGuideCard,
  resolveProductRedemptionUrl,
  renderStatusCard,
  renderCtaButton,
  renderSecurityNotice,
  renderSupportSection,
  getLogoUrl,
  getClientUrl,
} from '../services/email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PREVIEW_DIR = path.resolve(__dirname, '../email-previews');

if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

// Ensure previews use production URL instead of localhost
process.env.CLIENT_URL = 'https://apexvouchers.com';

const mockUser = {
  name: 'Kirmada Sharma',
  email: 'kirmada@example.com',
  phone: '+91 9876543210',
};

// Helper to render customer preparing email
function renderPreparingEmail({ productName, slug, amount, orderNo, paymentRef }) {
  const destinationUrl = resolveProductRedemptionUrl({ slug, productName });
  return renderEmailLayout({
    title: `Payment Confirmed — Voucher Preparing (#${orderNo})`,
    preheader: `Your payment for ${productName} was confirmed. Your voucher is being prepared.`,
    body: `
      <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 10px 0; color: #0f172a;">
        Hi ${mockUser.name},
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
        Your payment for <strong>${productName}</strong> was successful. Your voucher is delivered to your email within 1–2 minutes. Once delivered, you can use our step-by-step redemption guide below.
      </p>
      ${renderOrderSummary({
        orderNo,
        date: new Date(),
        totalQty: 1,
        totalAmount: amount,
        paymentStatus: 'PAID',
        paymentRef,
        items: [{ productName, quantity: 1, unitPrice: amount }],
      })}
      ${renderRedemptionGuideCard({
        productName,
        productUrl: destinationUrl,
        isDelivered: false,
      })}
      ${renderCtaButton({
        label: 'View Order Status →',
        url: 'https://apexvouchers.com/account?tab=vouchers',
        secondary: true,
      })}
      ${renderSecurityNotice()}
      ${renderSupportSection()}
    `,
    brandBadge: 'Order Processing',
    badgeVariant: 'warning',
  });
}

// Helper to render customer delivered email
function renderDeliveredEmail({ productName, slug, amount, orderNo, paymentRef, vouchers }) {
  const destinationUrl = resolveProductRedemptionUrl({ slug, productName });
  return renderEmailLayout({
    title: `Your Voucher Is Ready 🎉 (#${orderNo})`,
    preheader: `Your ${productName} voucher is ready with redemption instructions.`,
    body: `
      <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 10px 0; color: #0f172a;">
        Hi ${mockUser.name},
      </h1>
      <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
        🎉 <strong>Congratulations!</strong> Thank you for your purchase from <strong>Apex Vouchers</strong>. Your payment for <strong>${productName}</strong> has been successfully confirmed.
      </p>
      ${renderOrderSummary({
        orderNo,
        date: new Date(),
        totalQty: 1,
        totalAmount: amount,
        paymentStatus: 'PAID',
        paymentRef,
        items: [{ productName, quantity: 1, unitPrice: amount }],
      })}
      <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin: 24px 0 6px 0;">
        YOUR OFFICIAL VOUCHER DETAILS
      </div>
      <p style="font-size: 13px; color: #64748b; margin: 0 0 14px 0;">
        Use the voucher code below on the test administrator's official website when scheduling your exam slot.
      </p>
      ${renderVoucherCards(vouchers)}
      ${renderRedemptionGuideCard({
        productName,
        productUrl: destinationUrl,
        isDelivered: true,
      })}
      ${renderCtaButton({
        label: 'View My Vouchers →',
        url: 'https://apexvouchers.com/account?tab=vouchers',
      })}
      ${renderSecurityNotice()}
      ${renderSupportSection()}
    `,
    brandBadge: 'Payment Confirmed',
    badgeVariant: 'success',
  });
}

async function generatePreviews() {
  console.log('Generating comprehensive email preview HTML files into:', PREVIEW_DIR);

  // 1. IELTS - Preparing & Delivered
  const ieltsPreparing = renderPreparingEmail({
    productName: 'IELTS Coupon Code',
    slug: 'ielts-exam-voucher',
    amount: 14200,
    orderNo: 'APX-2026-IELTS-01',
    paymentRef: 'pay_Ielts8274aBc90',
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '01-ielts-payment-preparing.html'), ieltsPreparing, 'utf8');
  fs.writeFileSync(path.join(PREVIEW_DIR, '02-payment-voucher-preparing.html'), ieltsPreparing, 'utf8');

  const ieltsDelivered = renderDeliveredEmail({
    productName: 'IELTS Coupon Code',
    slug: 'ielts-exam-voucher',
    amount: 14200,
    orderNo: 'APX-2026-IELTS-01',
    paymentRef: 'pay_Ielts8274aBc90',
    vouchers: [
      {
        code: 'IELTS-2026-APX-77491',
        voucherType: 'IELTS',
        productName: 'IELTS Coupon Code',
        expiryDate: new Date('2026-12-31'),
        officialWebsiteUrl: 'https://ielts.idp.com',
      },
    ],
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '02-ielts-voucher-delivered.html'), ieltsDelivered, 'utf8');
  fs.writeFileSync(path.join(PREVIEW_DIR, '01-payment-voucher-delivered.html'), ieltsDelivered, 'utf8');

  // 2. PTE - Preparing & Delivered
  const ptePreparing = renderPreparingEmail({
    productName: 'Pearson PTE Academic',
    slug: 'pearson-pte-academic-voucher',
    amount: 15300,
    orderNo: 'APX-2026-PTE-02',
    paymentRef: 'pay_Pte73kd092Z99',
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '03-pte-payment-preparing.html'), ptePreparing, 'utf8');

  const pteDelivered = renderDeliveredEmail({
    productName: 'Pearson PTE Academic',
    slug: 'pearson-pte-academic-voucher',
    amount: 15300,
    orderNo: 'APX-2026-PTE-02',
    paymentRef: 'pay_Pte73kd092Z99',
    vouchers: [
      {
        code: 'PTE-ACAD-2026-APX-99120',
        voucherType: 'PTE',
        productName: 'Pearson PTE Academic',
        expiryDate: new Date('2026-11-30'),
        officialWebsiteUrl: 'https://mypte.pearsonpte.com',
      },
    ],
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '04-pte-voucher-delivered.html'), pteDelivered, 'utf8');

  // 3. TOEFL - Preparing & Delivered
  const toeflPreparing = renderPreparingEmail({
    productName: 'ETS TOEFL iBT Exam Voucher',
    slug: 'ets-toefl-voucher',
    amount: 16500,
    orderNo: 'APX-2026-TOEFL-03',
    paymentRef: 'pay_Toefl9281aZ01',
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '05-toefl-payment-preparing.html'), toeflPreparing, 'utf8');

  const toeflDelivered = renderDeliveredEmail({
    productName: 'ETS TOEFL iBT Exam Voucher',
    slug: 'ets-toefl-voucher',
    amount: 16500,
    orderNo: 'APX-2026-TOEFL-03',
    paymentRef: 'pay_Toefl9281aZ01',
    vouchers: [
      {
        code: 'TOEFL-IBT-APX-44810',
        voucherType: 'TOEFL',
        productName: 'ETS TOEFL iBT Exam Voucher',
        expiryDate: new Date('2026-10-31'),
        officialWebsiteUrl: 'https://www.ets.org/toefl',
      },
    ],
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '06-toefl-voucher-delivered.html'), toeflDelivered, 'utf8');

  // 4. GRE - Delivered
  const greDelivered = renderDeliveredEmail({
    productName: 'ETS GRE Exam Voucher',
    slug: 'ets-gre-voucher',
    amount: 19800,
    orderNo: 'APX-2026-GRE-04',
    paymentRef: 'pay_Gre447190bA',
    vouchers: [
      {
        code: 'GRE-GEN-2026-APX-10924',
        voucherType: 'GRE',
        productName: 'ETS GRE Exam Voucher',
        expiryDate: new Date('2026-12-15'),
        officialWebsiteUrl: 'https://www.ets.org/gre',
      },
    ],
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '07-gre-voucher-delivered.html'), greDelivered, 'utf8');

  // 5. Duolingo - Delivered
  const duolingoDelivered = renderDeliveredEmail({
    productName: 'Duolingo English Test Voucher',
    slug: 'duolingo-english-test-voucher',
    amount: 5200,
    orderNo: 'APX-2026-DET-05',
    paymentRef: 'pay_Det002931bcD',
    vouchers: [
      {
        code: 'DET-2026-APX-88219',
        voucherType: 'DUOLINGO',
        productName: 'Duolingo English Test Voucher',
        expiryDate: new Date('2026-09-30'),
        officialWebsiteUrl: 'https://englishtest.duolingo.com',
      },
    ],
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '08-duolingo-voucher-delivered.html'), duolingoDelivered, 'utf8');

  // 6. Manual Fulfillment / Out of Stock
  const manualFulfillmentPreparing = renderPreparingEmail({
    productName: 'Pearson PTE Core',
    slug: 'pearson-pte-core-voucher',
    amount: 14800,
    orderNo: 'APX-2026-CORE-06',
    paymentRef: 'pay_Core99281aZ',
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '09-manual-fulfillment-preparing.html'), manualFulfillmentPreparing, 'utf8');

  // 7. Admin Fulfillment Notification
  const adminFulfillmentHtml = renderEmailLayout({
    title: 'Voucher Fulfillment Required — FUL-2026-00412',
    preheader: 'Action Required: Paid customer order APX-2026-884130 requires manual voucher fulfillment.',
    body: `
      <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: #0f172a;">
        Voucher Fulfillment Required
      </h1>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 18px 0;">
        A customer has paid in full, but no voucher code was available in inventory at the time of allocation. Deliver a verified code from the admin dashboard to complete the customer order.
      </p>
      ${renderStatusCard({
        status: 'ACTION REQUIRED',
        title: 'Manual Fulfillment Needed',
        description: 'Payment is captured and confirmed. Assign a voucher code from the admin console to dispatch to the customer.',
        variant: 'warning',
      })}
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin-bottom: 22px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr><td style="font-size: 13px; color: #64748b; padding-bottom: 7px;">Request ID:</td><td align="right" style="font-size: 13px; font-weight: 700; color: #0f172a; padding-bottom: 7px;">FUL-2026-00412</td></tr>
          <tr><td style="font-size: 13px; color: #64748b; padding-bottom: 7px;">Customer:</td><td align="right" style="font-size: 13px; font-weight: 700; color: #0f172a; padding-bottom: 7px;">Kirmada Sharma (kirmada@example.com)</td></tr>
          <tr><td style="font-size: 13px; color: #64748b; padding-bottom: 7px;">Product:</td><td align="right" style="font-size: 13px; font-weight: 700; color: #0f172a; padding-bottom: 7px;">Pearson PTE Academic</td></tr>
          <tr><td style="font-size: 13px; color: #64748b; padding-bottom: 7px;">Order ID:</td><td align="right" style="font-size: 13px; font-weight: 700; color: #0f172a; padding-bottom: 7px;">APX-2026-PTE-02</td></tr>
          <tr><td style="font-size: 13px; color: #64748b; padding-bottom: 7px;">Amount Paid:</td><td align="right" style="font-size: 15px; font-weight: 900; color: #FF005C; padding-bottom: 7px;">₹15,300</td></tr>
          <tr><td style="font-size: 13px; color: #64748b; padding-bottom: 7px;">Payment ID:</td><td align="right" style="font-size: 12px; font-weight: 600; color: #64748b; padding-bottom: 7px;">pay_Pte73kd092Z99</td></tr>
        </table>
      </div>
      ${renderCtaButton({ label: 'Open Fulfillment Request →', url: 'https://apexvouchers.com/admin' })}
    `,
    brandBadge: 'Admin Action',
    badgeVariant: 'admin',
    isAdmin: true,
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '10-admin-fulfillment-required.html'), adminFulfillmentHtml, 'utf8');

  // 8. Registration OTP
  const otpHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Your Apex Vouchers Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a;">
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; color: #fff; opacity: 0;">
    Your verification code is 849201. Valid for 10 minutes.
  </div>
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);">
          <tr>
            <td style="padding: 28px 32px 18px 32px; border-bottom: 1px solid #e2e8f0; text-align: center;">
              <img src="${getLogoUrl()}" alt="Apex Vouchers" width="150" height="59" style="display: block; margin: 0 auto; width: 150px; max-width: 100%; height: auto; border: 0;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px 24px 32px;">
              <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: #0f172a; text-align: center;">
                Verify Your Email Address
              </h1>
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0; text-align: center;">
                Hello Kirmada, enter this verification code to finish creating your <strong>Apex Vouchers</strong> account.
              </p>
              <div style="background-color: #fff1f5; border: 1.5px dashed #FF005C; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0 16px 0;">
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #FF005C; margin-bottom: 6px;">
                  VERIFICATION CODE
                </div>
                <div style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #0f172a; font-family: 'Courier New', monospace;">
                  849201
                </div>
              </div>
              <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0 0 16px 0;">
                ⏱ This verification code will expire in <strong>10 minutes</strong>.
              </p>
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
                If you did not create an account on Apex Vouchers, you can safely ignore this message.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 18px 32px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; background-color: #f8fafc;">
              Need help? Contact support at info@apexvouchers.com<br/>
              © ${new Date().getFullYear()} Apex Vouchers. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  fs.writeFileSync(path.join(PREVIEW_DIR, '11-registration-otp.html'), otpHtml, 'utf8');

  // 9. Password Reset
  const passwordResetHtml = renderEmailLayout({
    title: 'Reset Your Password — Apex Vouchers',
    preheader: 'Use this secure link to set a new password for your account.',
    body: `
      <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: #0f172a; text-align: center;">
        Reset Your Password
      </h1>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0; text-align: center;">
        We received a request to reset the password for your Apex Vouchers account. Click the button below to choose a new password.
      </p>
      ${renderCtaButton({
        label: 'Reset Password →',
        url: 'https://apexvouchers.com/reset-password?token=sample_secure_token_99182',
      })}
      <p style="font-size: 12px; color: #64748b; text-align: center; margin: 18px 0 0 0;">
        ⏱ This link is single-use and will expire in <strong>60 minutes</strong>.
      </p>
      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 8px 0 0 0;">
        If you did not request a password reset, you can safely ignore this email — your account remains secure.
      </p>
    `,
    brandBadge: 'Security',
    badgeVariant: 'brand',
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '12-password-reset.html'), passwordResetHtml, 'utf8');

  // 10. Admin Voucher Sale
  const adminSaleHtml = renderEmailLayout({
    title: 'New Voucher Sale: IELTS Coupon Code',
    preheader: 'Order APX-2026-IELTS-01 paid (₹14,200) via UPI.',
    body: `
      <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 10px 0; color: #0f172a;">
        Voucher Order Placed &amp; Paid
      </h1>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 18px 0;">
        A customer has completed payment for an authentic voucher. The voucher code was automatically allocated and dispatched.
      </p>
      ${renderOrderSummary({
        orderNo: 'APX-2026-IELTS-01',
        date: new Date(),
        totalQty: 1,
        totalAmount: 14200,
        paymentStatus: 'PAID',
        paymentRef: 'pay_Ielts8274aBc90',
        items: [{ productName: 'IELTS Coupon Code', quantity: 1, unitPrice: 14200 }],
      })}
      ${renderCtaButton({ label: 'Open Admin Console →', url: 'https://apexvouchers.com/admin' })}
    `,
    brandBadge: 'Sale Notice',
    badgeVariant: 'admin',
    isAdmin: true,
  });
  fs.writeFileSync(path.join(PREVIEW_DIR, '13-admin-voucher-sale.html'), adminSaleHtml, 'utf8');

  // Interactive HTML Index
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Apex Vouchers — Transactional Email Design Gallery</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; margin: 0; }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; color: #fff; }
    .pill { display: inline-block; padding: 4px 10px; background: rgba(255, 0, 92, 0.15); border: 1px solid rgba(255, 0, 92, 0.4); border-radius: 999px; color: #ff005c; font-size: 12px; font-weight: 700; margin-left: 10px; }
    .section-title { font-size: 16px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin: 32px 0 16px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; text-decoration: none; color: inherit; transition: all 0.2s; display: block; }
    .card:hover { border-color: #ff005c; transform: translateY(-2px); box-shadow: 0 10px 25px rgba(255, 0, 92, 0.15); }
    .tag { display: inline-block; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; margin-bottom: 10px; }
    .tag-customer { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .tag-prep { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .tag-admin { background: rgba(139, 92, 246, 0.15); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.3); }
    .tag-auth { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
    .title { font-size: 16px; font-weight: 700; margin-bottom: 6px; color: #fff; }
    .desc { font-size: 13px; color: #94a3b8; line-height: 1.5; }
    .target-url { font-size: 11px; font-family: monospace; color: #ff005c; margin-top: 8px; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Apex Vouchers <span class="pill">Transaction Email Redesign with Redemption Guide</span></h1>
    <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
      Features light commercial design, official hosted logo, brand pink (#FF005C) accents, dynamic product redemption guides with exact product explore URLs, and complete removal of the old Roadmap/Voucher Preparing cards.
    </p>

    <div class="section-title">Customer Receipts &amp; Vouchers (Delivered &amp; Preparing)</div>
    <div class="grid">
      <a class="card" href="./01-ielts-payment-preparing.html" target="_blank">
        <span class="tag tag-prep">Preparing / Payment Confirmed</span>
        <div class="title">1. IELTS Payment Preparing</div>
        <div class="desc">Payment successful. Shows "HOW TO REDEEM YOUR VOUCHER" card pointing to the IELTS explore page while voucher is preparing.</div>
        <div class="target-url">→ /exam-vouchers/ielts-exam-voucher</div>
      </a>

      <a class="card" href="./02-ielts-voucher-delivered.html" target="_blank">
        <span class="tag tag-customer">Instant Delivery</span>
        <div class="title">2. IELTS Voucher Delivered</div>
        <div class="desc">Official voucher code allocated. Shows "HOW TO REDEEM YOUR VOUCHER" card and direct "View Redemption Guide →" CTA.</div>
        <div class="target-url">→ /exam-vouchers/ielts-exam-voucher</div>
      </a>

      <a class="card" href="./03-pte-payment-preparing.html" target="_blank">
        <span class="tag tag-prep">Preparing / Payment Confirmed</span>
        <div class="title">3. PTE Academic Preparing</div>
        <div class="desc">Payment successful. Redemption guide card links directly to the Pearson PTE Academic explore page.</div>
        <div class="target-url">→ /exam-vouchers/pearson-pte-academic-voucher</div>
      </a>

      <a class="card" href="./04-pte-voucher-delivered.html" target="_blank">
        <span class="tag tag-customer">Instant Delivery</span>
        <div class="title">4. PTE Academic Delivered</div>
        <div class="desc">Live voucher code delivered with verified PTE Academic redemption steps and official portal redirect.</div>
        <div class="target-url">→ /exam-vouchers/pearson-pte-academic-voucher</div>
      </a>

      <a class="card" href="./05-toefl-payment-preparing.html" target="_blank">
        <span class="tag tag-prep">Preparing / Payment Confirmed</span>
        <div class="title">5. TOEFL iBT Preparing</div>
        <div class="desc">Payment confirmed. Dynamic redemption guide points to ETS TOEFL iBT official page.</div>
        <div class="target-url">→ /exam-vouchers/ets-toefl-voucher</div>
      </a>

      <a class="card" href="./06-toefl-voucher-delivered.html" target="_blank">
        <span class="tag tag-customer">Instant Delivery</span>
        <div class="title">6. TOEFL iBT Delivered</div>
        <div class="desc">Delivered code with ETS TOEFL redemption guide and step-by-step instructions.</div>
        <div class="target-url">→ /exam-vouchers/ets-toefl-voucher</div>
      </a>

      <a class="card" href="./07-gre-voucher-delivered.html" target="_blank">
        <span class="tag tag-customer">Instant Delivery</span>
        <div class="title">7. GRE Voucher Delivered</div>
        <div class="desc">Delivered GRE voucher code with dynamic link to ETS GRE redemption instructions.</div>
        <div class="target-url">→ /exam-vouchers/ets-gre-voucher</div>
      </a>

      <a class="card" href="./08-duolingo-voucher-delivered.html" target="_blank">
        <span class="tag tag-customer">Instant Delivery</span>
        <div class="title">8. Duolingo English Test Delivered</div>
        <div class="desc">Delivered DET voucher code with dynamic link to Duolingo English Test redemption guide.</div>
        <div class="target-url">→ /exam-vouchers/duolingo-english-test-voucher</div>
      </a>

      <a class="card" href="./09-manual-fulfillment-preparing.html" target="_blank">
        <span class="tag tag-prep">Out of Stock / Manual</span>
        <div class="title">9. PTE Core Manual Fulfillment</div>
        <div class="desc">Paid order placed when stock was empty. Shows redemption guide for Pearson PTE Core.</div>
        <div class="target-url">→ /exam-vouchers/pearson-pte-core-voucher</div>
      </a>
    </div>

    <div class="section-title">Admin &amp; Operational Emails</div>
    <div class="grid">
      <a class="card" href="./10-admin-fulfillment-required.html" target="_blank">
        <span class="tag tag-admin">Admin Alert</span>
        <div class="title">10. Admin Fulfillment Required</div>
        <div class="desc">Internal alert when a paid order requires manual code sourcing.</div>
      </a>

      <a class="card" href="./11-registration-otp.html" target="_blank">
        <span class="tag tag-auth">Authentication</span>
        <div class="title">11. Registration OTP</div>
        <div class="desc">Lightweight verification code email with large 6-digit pin.</div>
      </a>

      <a class="card" href="./12-password-reset.html" target="_blank">
        <span class="tag tag-auth">Security</span>
        <div class="title">12. Password Reset</div>
        <div class="desc">Secure password recovery email with 60-minute token expiration.</div>
      </a>

      <a class="card" href="./13-admin-voucher-sale.html" target="_blank">
        <span class="tag tag-admin">Operational</span>
        <div class="title">13. Admin Voucher Sale</div>
        <div class="desc">Real-time sale notification with payment reference and details.</div>
      </a>
    </div>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(PREVIEW_DIR, 'index.html'), indexHtml, 'utf8');

  console.log('Successfully generated email preview gallery in', PREVIEW_DIR);
}

generatePreviews().catch(console.error);
