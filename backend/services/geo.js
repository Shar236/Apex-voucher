import { config } from '../config/index.js';

/**
 * Server-side customer geolocation.
 *
 * PRIORITY ORDER (highest first):
 *   1. Deployment-platform geo headers injected at the edge (Cloudflare,
 *      Vercel, Fastly, nginx geo module) — the most reliable signal.
 *   2. A trusted IP-geolocation HTTP service (optional, cached per IP,
 *      configurable + disableable via GEO_IP_API_URL).
 *   3. A safe, configurable fallback country (GEO_FALLBACK_COUNTRY, default
 *      "IN" — the home market; an undetectable visitor is treated as India).
 *
 * NEVER TRUSTED FROM THE CLIENT: a `country` value in a request body is
 * ignored everywhere. Payment endpoints call getCustomerCountry(req) again on
 * the server so the customer cannot choose their own currency for payment.
 *
 * Locale / timezone / browser language are deliberately NOT consulted — an
 * Indian customer travelling abroad must still be classified by network
 * location, not by their device settings.
 */

const ISO2 = /^[A-Z]{2}$/;

// Edge/CDN headers that carry the visitor's ISO-3166 alpha-2 country code.
const GEO_HEADER_CANDIDATES = [
  'cf-ipcountry', // Cloudflare
  'x-vercel-ip-country', // Vercel
  'fastly-client-country', // Fastly
  'x-geo-country', // generic proxy convention (incl. nginx geo)
  'x-country-code', // generic / AWS CloudFront managed policy
  'x-azure-country', // Azure Front Door (custom header convention)
  'cloudfront-viewer-country', // CloudFront managed policy
];

// In-memory per-IP lookup cache. Small LRU-ish cap — enough for a storefront.
const lookupCache = new Map(); // ip -> { country, at }
const LOOKUP_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const LOOKUP_CACHE_MAX = 5000;
const LOOKUP_TIMEOUT_MS = 3000;

const isPublicIp = (ip) => {
  if (!ip) return false;
  if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.')) return false;
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return false;
  if (/^(fe80:|fc00:|fd[0-9a-f]{2}:)/i.test(ip)) return false;
  return Boolean(/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.includes(':'));
};

const firstForwardedIp = (value) => {
  if (!value) return null;
  // x-forwarded-for can be "client, proxy1, proxy2" — the client is first.
  const first = String(value).split(',')[0].trim();
  return first.replace(/^::ffff:/, '') || null;
};

const clientIpFromReq = (req) => {
  const xff = req.headers?.['x-forwarded-for'];
  const ip = firstForwardedIp(xff) || firstForwardedIp(req.headers?.['x-real-ip']) || req.ip || req.socket?.remoteAddress || '';
  return String(ip || '').replace(/^::ffff:/, '');
};

/**
 * Look up the country for a single IP via the configured geolocation service.
 * Returns an ISO-2 code or null on any failure. Failures are cached briefly
 * (as null) so a flaky provider can't turn into a per-request stampede.
 */
const lookupCountryForIp = async (ip) => {
  const providerTemplate = config.geo.ipApiUrl;
  if (!providerTemplate || !isPublicIp(ip)) return null;

  const cached = lookupCache.get(ip);
  if (cached && Date.now() - cached.at < LOOKUP_TTL_MS) return cached.country;

  const url = providerTemplate.includes('{ip}')
    ? providerTemplate.replace('{ip}', encodeURIComponent(ip))
    : `${providerTemplate}${providerTemplate.endsWith('/') ? '' : '/'}${ip}`;

  let country = null;
  try {
    const resp = await fetch(url, {
      headers: { Accept: 'text/plain, application/json' },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (resp.ok) {
      const text = (await resp.text()).trim();
      if (ISO2.test(text.toUpperCase())) {
        country = text.toUpperCase();
      } else if (text.startsWith('{')) {
        // Tolerate JSON providers: { country: "US" } / { country_code: "US" }
        try {
          const body = JSON.parse(text);
          const v = String(body.country || body.country_code || body.countryCode || '').toUpperCase();
          if (ISO2.test(v)) country = v;
        } catch {}
      }
    }
  } catch {
    // provider unreachable / timeout — treated as "unknown"
  }

  if (lookupCache.size >= LOOKUP_CACHE_MAX) {
    const oldest = lookupCache.keys().next().value;
    if (oldest !== undefined) lookupCache.delete(oldest);
  }
  lookupCache.set(ip, { country, at: Date.now() });
  return country;
};

/**
 * The authoritative server-side country determination for a request.
 * Returns an ISO-3166 alpha-2 code (upper case), e.g. "IN", "US", "GB".
 */
export const getCustomerCountry = async (req) => {
  const headers = req?.headers || {};

  // 1 — platform / edge geo headers (trusted: injected by our own infra).
  for (const h of GEO_HEADER_CANDIDATES) {
    const v = String(headers[h] || '').trim().toUpperCase();
    if (ISO2.test(v)) return v;
  }

  // 2 — trusted IP geolocation service (optional, cached).
  const ip = clientIpFromReq(req);
  const viaService = await lookupCountryForIp(ip);
  if (viaService) return viaService;

  // 3 — safe fallback.
  return config.geo.fallbackCountry;
};

/** ISO-2 code of the home market — the only country billed in INR. */
export const isIndia = (countryCode) =>
  String(countryCode || '').toUpperCase() === 'IN';

/**
 * Display/billing currency rule: India → INR, everything else → USD.
 * The only two currencies in the system (no GBP/EUR unless explicitly added).
 */
export const getDisplayCurrency = (countryCode) =>
  isIndia(countryCode) ? 'INR' : 'USD';

/**
 * Display currency for a request — PUBLIC READ endpoints only.
 *
 * Honours an optional `x-apex-currency: INR|USD` display-preference header
 * (set by the frontend from its short-lived session cookie so SSR and client
 * renders agree — requirement: don't flip the customer's currency mid-session).
 *
 * SECURITY: this is a PRESENTATION concern only. Payment/order endpoints must
 * use getCustomerCountry() + getDisplayCurrency() and re-detect the country —
 * they must never read this header.
 */
export const getDisplayCurrencyForRequest = async (req) => {
  const pref = String(req?.headers?.['x-apex-currency'] || req?.query?.currency || '').trim().toUpperCase();
  if (pref === 'INR' || pref === 'USD') return pref;
  const country = await getCustomerCountry(req);
  return getDisplayCurrency(country);
};
