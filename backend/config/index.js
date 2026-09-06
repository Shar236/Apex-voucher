import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Always load THIS package's .env (backend/.env), regardless of the process cwd,
// so `node server.js`, `npm --prefix backend run dev` and a container entrypoint
// all read the same file. A hosting platform's real environment variables still
// take precedence — dotenv never overrides an already-set var.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Razorpay test vs live is decided ENTIRELY by the key id prefix — Razorpay
// serves the same API/checkout for both. This is the single source of truth;
// a stale RAZORPAY_ENV can never disagree with the actual key in use.
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayIsLive = /^rzp_live_/.test(razorpayKeyId);
const razorpayIsTest = /^rzp_test_/.test(razorpayKeyId);

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: (process.env.NODE_ENV || 'development').toLowerCase(),
  isProduction: (process.env.NODE_ENV || '').toLowerCase() === 'production',
  mongodbUri: (process.env.MONGODB_URI || '')
    .trim()
    .replace(/^mongodb(\+srv)?:\/\/\s+/, 'mongodb$1://'),
  jwtSecret:
    process.env.JWT_SECRET ||
    ((process.env.NODE_ENV || '').toLowerCase() === 'production'
      ? ''
      : 'dev-only-change-me-in-production-super-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  otpSecret: process.env.OTP_SECRET || `otp:${process.env.JWT_SECRET || 'dev-only-change-me-in-production-super-secret'}`,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  serverUrl: process.env.SERVER_URL || process.env.API_URL || 'http://localhost:5000',

  business: {
    name: process.env.BUSINESS_NAME || 'Apex Vouchers',
    email: process.env.BUSINESS_EMAIL || 'apexvouchers@gmail.com',
    supportEmail: process.env.SUPPORT_EMAIL || 'apexvouchers@gmail.com',
    supportPhone: process.env.SUPPORT_PHONE || '+91 9855926113',
    adminNotificationEmail: process.env.ADMIN_NOTIFICATION_EMAIL || 'apexvouchers@gmail.com',
    website: process.env.BUSINESS_WEBSITE || 'https://apexvouchers.com',
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'apexvouchers@gmail.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123',
    name: process.env.ADMIN_NAME || 'System Admin',
  },

  // Which provider the checkout flow uses. Only "razorpay" is implemented.
  paymentProvider: (process.env.PAYMENT_PROVIDER || 'razorpay').toLowerCase(),

  razorpay: {
    // Publishable — safe to send to the browser.
    keyId: razorpayKeyId,
    // SECRET — server only. Never sent to the client, never logged.
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    // Separate secret configured in the Razorpay dashboard for webhook signing.
    // In development it falls back to keySecret; production REQUIRES an explicit
    // value (enforced by assertPaymentConfig) so webhook verification is real.
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecretExplicit: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    // 'live' | 'test' | 'unknown' — derived from the key id, never trusted from env.
    env: razorpayIsLive ? 'live' : razorpayIsTest ? 'test' : 'unknown',
    isLive: razorpayIsLive,
    isTest: razorpayIsTest,
    apiBase: 'https://api.razorpay.com/v1',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT || 587,
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || '',
    secure: process.env.SMTP_SECURE === 'true',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'nbcbpuql',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
  },

  // Canonical/absolute base URL for SEO (sitemap, canonical tags, structured data).
  siteUrl: process.env.SEO_SITE_URL || '',
};

