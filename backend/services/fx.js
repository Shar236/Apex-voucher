import { config } from '../config/index.js';

/**
 * LIVE USD/INR exchange-rate service — SERVER SIDE ONLY.
 *
 *  - The browser NEVER talks to the FX provider (no credentials in the client,
 *    no per-render API calls). The backend fetches, validates and caches.
 *  - The rate is cached for config.fx.cacheTtlSeconds (default 900s = 15 min)
 *    and one cached value serves unlimited requests/products/pages.
 *  - If the provider is temporarily down, the last known valid rate is used
 *    while it is within config.fx.maxAgeSeconds (default 6h). Beyond that the
 *    service reports "unavailable" and international (USD) checkout is refused
 *    with a controlled error — Indian INR purchases are unaffected.
 *  - A never-show-a-fake guarantee: rates outside the sanity window are
 *    rejected and never cached.
 *
 * Provider configuration (backend .env):
 *   FX_API_URL  — endpoint returning a JSON body with a USD→INR rate.
 *                 Default: https://open.er-api.com/v6/latest/USD (free, no key).
 *   FX_API_KEY  — optional; sent as "Authorization: Bearer <key>" when set.
 *                 Do not set this if the provider needs no key.
 *   FX_RATE_CACHE_TTL       — cache lifetime seconds (default 900).
 *   FX_RATE_MAX_AGE_SECONDS — max age of a stale rate we may still use
 *                             (default 21600 = 6h).
 */

const SANITY_MIN = 30; // USD/INR has traded ~83–90 in 2024–2026; hard floor.
const SANITY_MAX = 300; // absurd-rate guard (bad provider payloads).

let cache = {
  rate: null, // number, e.g. 87.42
  fetchedAt: null, // Date
  source: null, // provider URL host
};

let inflight = null; // dedup concurrent refreshes

const extractRate = (body) => {
  // Tolerant parsing across common provider shapes:
  //   open.er-api.com   → { result: "success", rates: { INR: 87.42 } }
  //   exchangerate-api  → { conversion_rates: { INR: 87.42 } }
  //   generic           → { rates: { INR } } / { INR: 87.42 } / { rate: 87.42 }
  const candidates = [
    body?.rates?.INR,
    body?.conversion_rates?.INR,
    body?.INR,
    body?.rate,
    body?.usdInr,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

const fetchFreshRate = async () => {
  const url = config.fx.apiUrl;
  if (!url) return { ok: false, reason: 'FX_NOT_CONFIGURED' };

  const headers = { Accept: 'application/json' };
  if (config.fx.apiKey) headers.Authorization = `Bearer ${config.fx.apiKey}`;

  let body;
  try {
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    body = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error(`[fx] provider responded status=${resp.status}`);
      return { ok: false, reason: 'FX_PROVIDER_ERROR' };
    }
  } catch (err) {
    console.error(`[fx] provider unreachable: ${err?.message || err}`);
    return { ok: false, reason: 'FX_PROVIDER_UNREACHABLE' };
  }

  const rate = extractRate(body);
  if (!Number.isFinite(rate) || rate < SANITY_MIN || rate > SANITY_MAX) {
    // Never accept — and never cache — a nonsense rate.
    console.error(`[fx] provider returned implausible USD/INR rate: ${rate}`);
    return { ok: false, reason: 'FX_INVALID_RATE' };
  }

  cache = {
    rate,
    fetchedAt: new Date(),
    source: (() => {
      try { return new URL(url).host; } catch { return 'fx-provider'; }
    })(),
  };
  return { ok: true, rate, fetchedAt: cache.fetchedAt, source: cache.source };
};

/**
 * Current USD→INR rate (INR per 1 USD), from cache with refresh semantics.
 * Never throws. Returns:
 *   { ok:true,  rate, fetchedAt, age, source, stale }
 *   { ok:false, reason }
 * `stale:true` means the rate served is within the safe max age but the
 * provider is currently unreachable (fresh-cache fallback path).
 */
export const getFxRate = async () => {
  const now = Date.now();
  const ttlMs = config.fx.cacheTtlSeconds * 1000;
  const maxAgeMs = config.fx.maxAgeSeconds * 1000;

  const age = cache.fetchedAt ? now - new Date(cache.fetchedAt).getTime() : Infinity;

  if (cache.rate != null && age < ttlMs) {
    return { ok: true, rate: cache.rate, fetchedAt: cache.fetchedAt, age, source: cache.source, stale: false };
  }

  // Cache expired (or empty) → refresh. Concurrent callers share one refresh.
  if (!inflight) {
    inflight = fetchFreshRate().finally(() => { inflight = null; });
  }
  const fresh = await inflight;

  if (fresh.ok) {
    return { ok: true, rate: fresh.rate, fetchedAt: fresh.fetchedAt, age: 0, source: fresh.source, stale: false };
  }

  // Provider failed — fall back to the last known valid rate if within max age.
  if (cache.rate != null && age < maxAgeMs) {
    return { ok: true, rate: cache.rate, fetchedAt: cache.fetchedAt, age, source: cache.source, stale: true };
  }

  return { ok: false, reason: fresh.reason || 'FX_UNAVAILABLE', staleAtAge: Number.isFinite(age) ? age : null };
};

/**
 * INR → USD conversion with financial (half-up) rounding done ONCE, in minor
 * units, so floating-point drift can never touch the payable amount.
 *
 *   usdCents = round( (inrPaise / rate) * markupFactor )
 *
 * @param {number} inrAmount  INR major units (e.g. 1000)
 * @param {number} rate       INR per USD (e.g. 87.5)
 * @param {number} markupPercent  explicit pricing-policy buffer 0–X (default 0)
 * @returns {{ amount:number, minor:number }} USD major (2dp) + minor units
 */
export const convertInrToUsd = (inrAmount, rate, markupPercent = 0) => {
  const inrPaise = Math.round(Number(inrAmount) * 100);
  const markupFactor = 1 + Number(markupPercent || 0) / 100;
  const usdCents = Math.round((inrPaise / Number(rate)) * markupFactor);
  return { amount: usdCents / 100, minor: usdCents };
};

/** Test helper — reset the in-memory cache (server-only module, never bundled for the client). */
export const _resetFxCache = () => {
  cache = { rate: null, fetchedAt: null, source: null };
  inflight = null;
};

/** Test helper — seed the cache without hitting a provider. */
export const _seedFxCache = (rate, fetchedAt = new Date()) => {
  cache = { rate, fetchedAt, source: 'test-seed' };
};

