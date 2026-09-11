import { sseHandler, realtimeStats } from '../services/realtimeHub.js';
import { PurchaseEvent } from '../models/PurchaseEvent.js';
import { toPublicPayload } from '../services/purchaseProof.js';
import { config } from '../config/index.js';

/**
 * GET /api/social-proof/stream   (public — no auth)
 *
 * Server-Sent Events. Pushes only LIVE `purchase` events to already-connected
 * visitors. A brand-new connection receives no backlog; a reconnecting client
 * (Last-Event-ID) is handed only the events it missed during the gap.
 */
export const streamPurchaseEvents = sseHandler('social-proof');

/**
 * GET /api/social-proof/health   (public)
 * Connection stats for uptime monitoring — no purchase data.
 */
export const socialProofHealth = (_req, res) => {
  res.json({ success: true, enabled: config.socialProof.enabled, ...realtimeStats() });
};

/**
 * GET /api/social-proof/recent?limit=5   (public)
 *
 * A tiny, privacy-safe snapshot of the most recent genuine purchases, using the
 * exact same sanitised payload as the live stream. Intended for diagnostics /
 * server-rendered fallbacks — the storefront toast relies on the live stream,
 * not this endpoint, so late visitors still don't get a replayed "backlog".
 */
export const getRecentPurchaseEvents = async (req, res, next) => {
  try {
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit, 10) || 5));
    const rows = await PurchaseEvent.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, data: rows.map(toPublicPayload) });
  } catch (err) {
    next(err);
  }
};
