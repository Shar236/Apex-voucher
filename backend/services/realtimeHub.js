/**
 * Minimal in-process Server-Sent Events (SSE) hub.
 *
 * One-way, server → browser broadcast over plain HTTP — the right tool for
 * "push a small notification to every connected visitor". No extra dependency,
 * rides the existing Express server + CORS, and the browser's native
 * `EventSource` reconnects on its own.
 *
 * Deliberately NOT Socket.IO: the project has no WebSocket layer and this
 * feature never needs client → server messages.
 *
 * Scope: a single Node process. If this API is ever run multi-instance, a
 * cross-process fan-out (Redis pub/sub, Postgres LISTEN/NOTIFY, …) would sit
 * behind `publish()` — every instance would still own its own socket set.
 */

// Connected clients: { id, res, ip, channel }
const clients = new Set();

// Small rolling history so a RECONNECTING client (one that sends Last-Event-ID)
// can be handed only the events it missed during the gap. A brand-new client
// (no Last-Event-ID) is intentionally given nothing — visitors must not see a
// backlog of "old" purchases replayed as if they just happened.
const ring = []; // { id, channel, type, payload, ts }
const RING_MAX = Number(process.env.SSE_RING_MAX || 40);
const RING_TTL_MS = Number(process.env.SSE_RING_TTL_MS || 10 * 60 * 1000);

const MAX_CLIENTS = Number(process.env.SSE_MAX_CLIENTS || 5000);
const MAX_CLIENTS_PER_IP = Number(process.env.SSE_MAX_PER_IP || 12);
const HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS || 25000);

let clientSeq = 0;
let eventSeq = 0;
let heartbeat = null;

const startHeartbeat = () => {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    const now = Date.now();
    for (const c of clients) {
      try {
        c.res.write(`: ping ${now}\n\n`);
      } catch {
        // write failure → the 'close' handler will clean it up
      }
    }
  }, HEARTBEAT_MS);
  // Never keep the process alive just for the heartbeat (matters for tests).
  if (typeof heartbeat.unref === 'function') heartbeat.unref();
};

const stopHeartbeatIfIdle = () => {
  if (heartbeat && clients.size === 0) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
};

const writeFrame = (res, { id, type, payload }) => {
  try {
    res.write(`id: ${id}\n`);
    if (type) res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    return false;
  }
};

const parseLastEventId = (req) => {
  const raw =
    req.headers['last-event-id'] ||
    req.headers['Last-Event-ID'] ||
    (req.query && (req.query.lastEventId || req.query.last_event_id)) ||
    '';
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Express handler factory for an SSE endpoint.
 *
 *   router.get('/stream', sseHandler('social-proof'));
 *
 * `channel` scopes which `publish()` events this endpoint forwards.
 */
export const sseHandler = (channel = 'default') => (req, res) => {
  // Back-pressure guards — a public, unauthenticated endpoint.
  if (clients.size >= MAX_CLIENTS) {
    res.status(503).end();
    return;
  }
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  let perIp = 0;
  for (const c of clients) if (c.ip === ip) perIp += 1;
  if (perIp >= MAX_CLIENTS_PER_IP) {
    res.status(429).end();
    return;
  }

  // SSE response headers. Use setHeader (not writeHead) so the CORS headers the
  // cors() middleware already set on this response survive.
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx proxy buffering
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  // Long-lived stream: drop the per-response inactivity timeout.
  if (typeof res.setTimeout === 'function') res.setTimeout(0);
  if (req.socket && typeof req.socket.setKeepAlive === 'function') req.socket.setKeepAlive(true);

  // Tell the browser how long to wait before reconnecting.
  res.write('retry: 5000\n\n');

  const client = { id: ++clientSeq, res, ip, channel };
  clients.add(client);
  startHeartbeat();

  // Reconnect gap-fill only — never a full history replay for new visitors.
  const lastId = parseLastEventId(req);
  if (lastId > 0) {
    const now = Date.now();
    for (const ev of ring) {
      if (ev.id > lastId && ev.channel === channel && now - ev.ts <= RING_TTL_MS) {
        writeFrame(res, ev);
      }
    }
  }

  const cleanup = () => {
    clients.delete(client);
    stopHeartbeatIfIdle();
    try {
      res.end();
    } catch {
      /* already closed */
    }
  };
  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
};

/**
 * Broadcast an event to every client subscribed to `channel`.
 * Returns the assigned monotonic event id.
 */
export const publish = (channel, type, payload) => {
  const ev = { id: ++eventSeq, channel, type, payload, ts: Date.now() };

  ring.push(ev);
  const cutoff = Date.now() - RING_TTL_MS;
  while (ring.length > RING_MAX || (ring.length && ring[0].ts < cutoff)) {
    ring.shift();
  }

  for (const c of clients) {
    if (c.channel !== channel) continue;
    if (!writeFrame(c.res, ev)) {
      clients.delete(c);
    }
  }
  stopHeartbeatIfIdle();
  return ev.id;
};

/** Diagnostics for a health endpoint / tests. */
export const realtimeStats = () => {
  const byChannel = {};
  for (const c of clients) byChannel[c.channel] = (byChannel[c.channel] || 0) + 1;
  return {
    clients: clients.size,
    byChannel,
    buffered: ring.length,
    lastEventId: eventSeq,
  };
};

/** Test-only: drop every connection and clear the ring. */
export const __resetRealtimeHub = () => {
  for (const c of clients) {
    try {
      c.res.end();
    } catch {
      /* noop */
    }
  }
  clients.clear();
  ring.length = 0;
  eventSeq = 0;
  clientSeq = 0;
  stopHeartbeatIfIdle();
};
