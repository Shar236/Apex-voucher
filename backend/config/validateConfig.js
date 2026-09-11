import { config } from './index.js';

/**
 * Startup configuration guard.
 *
 * In production this FAILS FAST (throws) rather than letting the server come up
 * in a half-configured payment state — a deploy on test keys, a missing key
 * secret, or a missing webhook secret would all be silent money/fulfilment bugs
 * otherwise.
 *
 * Never logs a secret value — only presence / prefix / length.
 */

const line = (label, value) => console.log(`  ${label.padEnd(26)} ${value}`);

export const assertPaymentConfig = () => {
  const { razorpay, isProduction, nodeEnv } = config;
  const problems = [];
  const warnings = [];

  console.log('[config] payment configuration check');
  line('NODE_ENV', nodeEnv);
  line('PAYMENT_PROVIDER', config.paymentProvider);
  line('RAZORPAY_KEY_ID', razorpay.keyId ? `${razorpay.keyId.slice(0, 8)}… (${razorpay.env})` : '(not set)');
  line('RAZORPAY_KEY_SECRET', razorpay.keySecret ? `set (${razorpay.keySecret.length} chars)` : '(not set)');
  line('RAZORPAY_WEBHOOK_SECRET', razorpay.webhookSecretExplicit ? 'set (explicit)' : razorpay.keySecret ? 'not set → using key secret (dev only)' : '(not set)');
  line('SERVER_URL', config.serverUrl);
  line('FX_API_URL', config.fx.apiUrl || '(not set — USD pricing disabled)');
  line('FX_RATE_CACHE_TTL', `${config.fx.cacheTtlSeconds}s`);
  line('GEO_FALLBACK_COUNTRY', config.geo.fallbackCountry);

  // International (USD) payments require BOTH a working FX rate service AND
  // international payments enabled on the Razorpay account itself
  // (Razorpay Dashboard → Settings → International / payment pages).
  console.log('  ℹ  International (USD) checkout requires "International Payments" to be ENABLED on the Razorpay account (Dashboard → Settings). Until it is, USD order creation fails with PAYMENT_INTERNATIONAL_UNAVAILABLE — Indian INR payments are unaffected.');

  if (config.paymentProvider !== 'razorpay') {
    problems.push(`PAYMENT_PROVIDER is "${config.paymentProvider}" — only "razorpay" is implemented.`);
  }

  if (!razorpay.keyId || !razorpay.keySecret) {
    (isProduction ? problems : warnings).push('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not both set — online payment will be disabled.');
  }

  if (isProduction) {
    if (razorpay.keyId && !razorpay.isLive) {
      problems.push(`RAZORPAY_KEY_ID is "${razorpay.keyId.slice(0, 8)}…" — production requires a LIVE key (rzp_live_…). Test-mode payments must never run in production.`);
    }
    if (!razorpay.webhookSecretExplicit) {
      warnings.push('RAZORPAY_WEBHOOK_SECRET is not set in env. Using default fallback secret.');
    }
    if (!/^https:\/\//i.test(config.serverUrl) || /localhost|127\.0\.0\.1/.test(config.serverUrl)) {
      warnings.push(`SERVER_URL="${config.serverUrl}" is not a public https URL — Razorpay cannot reach ${config.serverUrl}/api/payments/webhook.`);
    }
  } else {
    if (razorpay.isLive) {
      warnings.push('LIVE Razorpay keys are configured but NODE_ENV is not "production" — real money will move. Use rzp_test_ keys for development.');
    }
  }

  for (const w of warnings) console.warn(`  ⚠  ${w}`);

  if (problems.length) {
    console.error('\n[config] PAYMENT CONFIGURATION INVALID:');
    for (const p of problems) console.error(`  ✖  ${p}`);
    throw new Error('Payment configuration invalid — refusing to start. See the errors above.');
  }

  console.log(`  ✓  payment config OK (${razorpay.env} mode)\n`);
};

/**
 * Runtime guard used right before creating a Razorpay order — belt-and-braces so
 * a mid-run env change or a non-production instance can never quietly charge a
 * card against a test key or an unconfigured gateway.
 */
export const assertPaymentOrderAllowed = () => {
  const { razorpay, isProduction } = config;
  if (!razorpay.keyId || !razorpay.keySecret) {
    return { ok: false, code: 'PAYMENT_GATEWAY_UNCONFIGURED', message: 'Online payment is not configured.' };
  }
  if (isProduction && !razorpay.isLive) {
    return { ok: false, code: 'PAYMENT_TEST_KEY_IN_PRODUCTION', message: 'Online payment is temporarily unavailable.' };
  }
  return { ok: true };
};
