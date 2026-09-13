'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { VoucherCard } from '@/components/voucher-card';
import type { Product } from '@/lib/types';

const TRANSITION_MS = 350;
const SWIPE_THRESHOLD_PX = 40;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Cards visible at once: 1 on mobile, 2 on tablet (sm), 4 on desktop (lg) — matches Tailwind's sm/lg breakpoints. */
function useVisibleCount() {
  const [count, setCount] = useState(4);
  useEffect(() => {
    const mqDesktop = window.matchMedia('(min-width: 1024px)');
    const mqTablet = window.matchMedia('(min-width: 640px)');
    const compute = () => setCount(mqDesktop.matches ? 4 : mqTablet.matches ? 2 : 1);
    compute();
    mqDesktop.addEventListener('change', compute);
    mqTablet.addEventListener('change', compute);
    return () => {
      mqDesktop.removeEventListener('change', compute);
      mqTablet.removeEventListener('change', compute);
    };
  }, []);
  return count;
}

/** Sliding carousel showing N cards at a time over the full, dynamic product list — no hardcoded subset, no page reload. */
export function ProductCarousel({ products }: { products: Product[] }) {
  const total = products.length;
  const visibleCount = useVisibleCount();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);

  // Derived (not synced via effect) so a breakpoint or product-count change never leaves a stale index committed to state.
  const maxIndex = Math.max(0, total - visibleCount);
  const clampedIndex = Math.min(index, maxIndex);

  const next = useCallback(() => setIndex(Math.min(maxIndex, clampedIndex + 1)), [maxIndex, clampedIndex]);
  const prev = useCallback(() => setIndex(Math.max(0, clampedIndex - 1)), [clampedIndex]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setIndex(maxIndex);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
    touchY.current = e.touches[0].clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null || touchY.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    const dy = e.changedTouches[0].clientY - touchY.current;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next();
      else prev();
    }
    touchX.current = null;
    touchY.current = null;
  };

  if (total === 0) return null;

  const canNavigate = total > visibleCount;
  const atStart = clampedIndex <= 0;
  const atEnd = clampedIndex >= maxIndex;
  const firstVisible = Math.min(clampedIndex + 1, total);
  const lastVisible = Math.min(clampedIndex + visibleCount, total);

  const arrowClass =
    'shrink-0 flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-full ' +
    'bg-surface border border-line text-ink shadow-sm transition-all duration-200 cursor-pointer ' +
    'hover:bg-accent hover:border-accent hover:text-white hover:scale-105 disabled:opacity-30 disabled:pointer-events-none disabled:hover:scale-100 ' +
    'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2';

  return (
    <div
      className="flex items-center gap-2 sm:gap-4"
      role="region"
      aria-roledescription="carousel"
      aria-label="Product carousel"
      onKeyDown={onKeyDown}
    >
      <button type="button" onClick={prev} disabled={!canNavigate || atStart} aria-label="Previous products" className={arrowClass}>
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* No padding on this box: overflow-hidden clips at its own border edge, so a hidden card can never peek through. */}
      <div className="overflow-hidden min-w-0 flex-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          className="flex"
          style={{
            transform: `translateX(-${clampedIndex * (100 / visibleCount)}%)`,
            transition: reduced ? 'none' : `transform ${TRANSITION_MS}ms ease`,
          }}
        >
          {products.map((product, i) => {
            const hidden = i < clampedIndex || i >= clampedIndex + visibleCount;
            return (
              <div
                key={product._id || product.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${total}`}
                inert={hidden}
                className="shrink-0 px-2.5"
                style={{ flexBasis: `${100 / visibleCount}%`, maxWidth: `${100 / visibleCount}%` }}
              >
                <VoucherCard product={product} />
              </div>
            );
          })}
        </div>
      </div>

      <button type="button" onClick={next} disabled={!canNavigate || atEnd} aria-label="Next products" className={arrowClass}>
        <ChevronRight className="w-5 h-5" />
      </button>

      <p className="sr-only" aria-live="polite">
        Showing products {firstVisible} to {lastVisible} of {total}
      </p>
    </div>
  );
}
