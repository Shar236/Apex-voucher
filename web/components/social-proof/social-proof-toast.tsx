'use client';

/**
 * Real-time "recent purchase" social-proof toast.
 *
 * Subscribes (Server-Sent Events) to the backend `/api/social-proof/stream` and
 * shows a small, non-blocking notification to EVERY connected visitor whenever
 * the backend confirms a genuine, payment-verified purchase.
 *
 * Guarantees:
 *  - Only renders events the backend pushed (no fabricated activity).
 *  - One toast at a time; extra events queue and play in order.
 *  - Never shows the same purchase twice to this visitor (localStorage dedupe).
 *  - Auto-dismisses; has a close button; Esc to dismiss; pauses on hover.
 *  - Respects `prefers-reduced-motion`; responsive down to ~360px.
 *  - A brand-new visitor gets no backlog — the stream only carries live events.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { apiBase } from '@/lib/api';

interface PurchaseProof {
  id: string;
  message: string;
  productLabel?: string | null;
  voucherType?: string | null;
  displayName?: string | null;
  quantity?: number;
  at: string;
}

const DISPLAY_MS = 6000; // how long each toast stays on screen
const GAP_MS = 2500; // quiet gap between consecutive toasts
const QUEUE_CAP = 4; // drop the oldest beyond this (keep the freshest)
const FRESH_MS = 5 * 60 * 1000; // ignore anything older than this ("Just now" must be true)
const SEEN_KEY = 'apex.socialProof.seen';
const SEEN_TTL_MS = 24 * 60 * 60 * 1000;
const SEEN_CAP = 300;

type SeenMap = Record<string, number>;

const loadSeen = (): SeenMap => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as SeenMap;
  } catch {
    return {};
  }
};

const saveSeen = (map: SeenMap) => {
  try {
    const now = Date.now();
    const fresh = Object.entries(map)
      .filter(([, t]) => now - t < SEEN_TTL_MS)
      .sort((a, b) => a[1] - b[1])
      .slice(-SEEN_CAP);
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(fresh)));
  } catch {
    /* storage unavailable — dedupe just won't persist across reloads */
  }
};

export function SocialProofToaster() {
  const [current, setCurrent] = useState<PurchaseProof | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [reducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  );

  const queueRef = useRef<PurchaseProof[]>([]);
  const seenRef = useRef<SeenMap>({});
  const busyRef = useRef(false);
  const pausedRef = useRef(false);
  const dismissTimerRef = useRef<number | null>(null);

  const clearDismissTimer = () => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  const showNext = useCallback(() => {
    if (busyRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    busyRef.current = true;
    setLeaving(false);
    setCurrent(next);
  }, []);

  const dismiss = useCallback(() => {
    clearDismissTimer();
    setLeaving(true);
    window.setTimeout(() => {
      setCurrent(null);
      busyRef.current = false;
      window.setTimeout(showNext, GAP_MS);
    }, reducedMotion ? 0 : 240);
  }, [showNext, reducedMotion]);

  const startDismissTimer = useCallback(() => {
    clearDismissTimer();
    dismissTimerRef.current = window.setTimeout(dismiss, DISPLAY_MS);
  }, [dismiss]);

  // Auto-dismiss lifecycle for the visible toast.
  useEffect(() => {
    if (!current) return;
    if (!pausedRef.current) startDismissTimer();
    return clearDismissTimer;
  }, [current, startDismissTimer]);

  // Esc closes the visible toast.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, dismiss]);

  // SSE subscription.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    seenRef.current = loadSeen();

    let es: EventSource | null = null;
    let closed = false;

    const enqueue = (raw: string) => {
      let ev: PurchaseProof;
      try {
        ev = JSON.parse(raw) as PurchaseProof;
      } catch {
        return;
      }
      if (!ev?.id || !ev.message) return;
      if (seenRef.current[ev.id]) return;

      const ts = Date.parse(ev.at);
      const stale = Number.isFinite(ts) && Date.now() - ts > FRESH_MS;

      seenRef.current[ev.id] = Date.now();
      saveSeen(seenRef.current);
      if (stale) return;

      queueRef.current.push(ev);
      if (queueRef.current.length > QUEUE_CAP) {
        queueRef.current = queueRef.current.slice(-QUEUE_CAP);
      }
      showNext();
    };

    const connect = (url: string, canFallback: boolean) => {
      try {
        es = new EventSource(url);
      } catch {
        return;
      }
      es.addEventListener('purchase', (e) => enqueue((e as MessageEvent).data));
      es.onerror = () => {
        // EventSource retries on its own. Only intervene if it hard-closed and a
        // same-origin fallback (Next.js rewrite) is still worth trying.
        if (canFallback && es && es.readyState === EventSource.CLOSED && !closed) {
          es.close();
          connect('/api/social-proof/stream', false);
        }
      };
    };

    const base = apiBase();
    connect(`${base}/api/social-proof/stream`, base.startsWith('http'));

    return () => {
      closed = true;
      es?.close();
    };
  }, [showNext]);

  if (!current) return null;

  const animClass = reducedMotion ? '' : leaving ? 'apex-proof-out' : 'apex-proof-in';

  return (
    <div
      className="fixed bottom-3 left-3 right-3 z-40 sm:bottom-5 sm:left-5 sm:right-auto sm:max-w-sm"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={`${animClass} relative flex items-start gap-3 rounded-2xl border border-line bg-surface/95 p-4 pr-10 shadow-xl backdrop-blur-md`}
        onMouseEnter={() => {
          pausedRef.current = true;
          clearDismissTimer();
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
          startDismissTimer();
        }}
      >
        <span aria-hidden="true" className="text-xl leading-none">
          🎉
        </span>
        <div className="min-w-0">
          <p className="font-heading text-[13px] font-semibold text-ink">Congratulations!</p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{current.message}</p>
          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted/70">
            Just now · Verified purchase
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss notification"
          className="absolute right-2 top-2 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
