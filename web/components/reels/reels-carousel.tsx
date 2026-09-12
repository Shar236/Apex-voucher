'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, X, Maximize2, ExternalLink, Film, VideoOff } from 'lucide-react';
import { videoApi } from '@/lib/api';
import { resolveReelMedia, reelPoster, formatViews, type ReelInput } from '@/lib/reel-media';

const ADVANCE_MS = 420;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ modal --- */

function ReelModal({ reel, onClose }: { reel: ReelInput; onClose: () => void }) {
  const media = useMemo(() => resolveReelMedia(reel), [reel]);
  const poster = reelPoster(reel);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`Video: ${reel.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm sm:max-w-md rounded-3xl overflow-hidden bg-[#0B0D12] border border-white/10 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close video"
          className="absolute top-3 right-3 z-20 p-2.5 rounded-full bg-black/60 text-white hover:bg-accent transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-full aspect-[9/16] bg-black">
          {media.kind === 'cloudinary' || media.kind === 'file' ? (
            <video
              key={media.src}
              src={media.src}
              poster={poster || undefined}
              controls
              autoPlay
              playsInline
              controlsList="nodownload"
              onError={(e) => {
                const el = e.currentTarget;
                if (media.kind === 'cloudinary' && media.fallbackSrc && el.src !== media.fallbackSrc) {
                  el.src = media.fallbackSrc;
                  el.play().catch(() => {});
                }
              }}
              className="w-full h-full object-contain bg-black"
            >
              Your browser does not support embedded video.
            </video>
          ) : media.kind === 'youtube' ? (
            <iframe
              key={media.embedSrc}
              src={media.embedSrc}
              title={reel.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : media.kind === 'instagram' ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center px-6">
              <p className="text-sm text-white font-medium">This reel is hosted on Instagram.</p>
              <a
                href={media.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent text-white text-xs font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open on Instagram
              </a>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-6 text-neutral-400">
              <VideoOff className="w-8 h-8" />
              <p className="text-sm">This video is currently unavailable.</p>
            </div>
          )}
        </div>

        <div className="p-4 bg-[#12151B] text-white">
          <p className="font-heading font-medium text-sm line-clamp-2">{reel.title}</p>
          {reel.description ? <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">{reel.description}</p> : null}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- carousel --- */

export function ReelsCarousel({ reels }: { reels: ReelInput[] }) {
  const n = reels.length;
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [engaged, setEngaged] = useState(false); // hover / focus-within → keyboard nav enabled
  const reduced = useReducedMotion();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wantPlayRef = useRef(false); // should the video for the *current* active index auto-start
  const lockRef = useRef(false);
  const viewedRef = useRef<Set<string>>(new Set());
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);

  const activeReel = reels[active];
  const activeMedia = useMemo(() => (activeReel ? resolveReelMedia(activeReel) : { kind: 'none' as const }), [activeReel]);
  const isInlineKind = activeMedia.kind === 'cloudinary' || activeMedia.kind === 'file';

  const recordView = useCallback((reel: ReelInput) => {
    if (!reel?._id || viewedRef.current.has(reel._id)) return;
    viewedRef.current.add(reel._id);
    videoApi.incrementView(reel._id).catch(() => {});
  }, []);

  const goTo = useCallback(
    (index: number, opts: { autoplay?: boolean } = {}) => {
      if (n === 0 || lockRef.current) return;
      const next = ((index % n) + n) % n;
      lockRef.current = true;
      const el = videoRef.current;
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
      wantPlayRef.current = !!opts.autoplay;
      setPlaying(false);
      setActive(next);
      window.setTimeout(() => {
        lockRef.current = false;
      }, ADVANCE_MS);
    },
    [n]
  );

  const next = useCallback(() => goTo(active + 1, { autoplay: playing }), [active, goTo, playing]);
  const prev = useCallback(() => goTo(active - 1, { autoplay: playing }), [active, goTo, playing]);

  // Start / stop the center <video> in response to `playing`.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isInlineKind) return;
    if (playing) {
      if (el.paused) {
        el.muted = muted;
        const p = el.play();
        if (p && typeof p.then === 'function') {
          p.then(() => activeReel && recordView(activeReel)).catch(() => setPlaying(false));
        }
      }
    } else {
      if (!el.paused) {
        el.pause();
      }
    }
  }, [playing, muted, isInlineKind, activeReel, recordView]);

  // Keep muted attribute strictly synchronized with state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  // After a programmatic index change that requested autoplay, resume playback.
  useEffect(() => {
    if (wantPlayRef.current && isInlineKind) {
      wantPlayRef.current = false;
      setPlaying(true);
    } else {
      wantPlayRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Keyboard navigation — only while the section is hovered/focused, or a modal is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen) {
        if (e.key === 'Escape') setModalOpen(false);
        return;
      }
      if (!engaged) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engaged, modalOpen, next, prev]);

  // Pause when the section scrolls out of view.
  const sectionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          videoRef.current?.pause();
          setPlaying(false);
        }
      },
      { threshold: 0.35 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  if (n === 0) return null;

  const handleEnded = () => {
    if (n > 1) goTo(active + 1, { autoplay: true });
    else {
      setPlaying(false);
      const el = videoRef.current;
      if (el) el.currentTime = 0;
    }
  };

  const activatePrimary = () => {
    if (!activeReel) return;
    if (isInlineKind) {
      const el = videoRef.current;
      if (el) {
        if (playing) {
          el.pause();
          setPlaying(false);
        } else {
          el.muted = muted;
          const p = el.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              setPlaying(true);
              recordView(activeReel);
            }).catch((err) => {
              console.warn('[Reels] Direct playback failed, retrying muted:', err);
              el.muted = true;
              setMuted(true);
              el.play()
                .then(() => {
                  setPlaying(true);
                  recordView(activeReel);
                })
                .catch((e) => {
                  console.error('[Reels] Play error:', e);
                  setPlaying(false);
                });
            });
          } else {
            setPlaying(true);
          }
        }
      } else {
        setPlaying((p) => !p);
      }
    } else if (activeMedia.kind === 'youtube') {
      recordView(activeReel);
      setModalOpen(true);
    } else if (activeMedia.kind === 'instagram') {
      window.open(activeMedia.url, '_blank', 'noopener,noreferrer');
    }
  };

  // Distinct side offsets given how many reels we actually have.
  const desktopOffsets = n >= 5 ? [-2, -1, 1, 2] : n >= 3 ? [-1, 1] : n === 2 ? [1] : [];
  const tabletOffsets = n >= 3 ? [-1, 1] : n === 2 ? [1] : [];

  const reelAt = (offset: number) => {
    const idx = ((active + offset) % n + n) % n;
    return { reel: reels[idx], idx };
  };

  const motion = reduced ? '' : 'transition-all duration-500 ease-out';

  const SideCard = ({ offset, size }: { offset: number; size: 'sm' | 'md' }) => {
    const { reel, idx } = reelAt(offset);
    if (!reel) return null;
    const poster = reelPoster(reel);
    const dims =
      size === 'sm'
        ? 'w-[8.5rem] lg:w-40 opacity-45 scale-[0.82]'
        : 'w-40 lg:w-52 opacity-75 scale-95';
    return (
      <button
        type="button"
        onClick={() => goTo(idx, { autoplay: false })}
        aria-label={`Show reel: ${reel.title}`}
        className={`group relative shrink-0 aspect-[9/16] rounded-[1.4rem] overflow-hidden bg-[#12151B] border border-white/10 shadow-xl cursor-pointer hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent ${dims} ${motion}`}
      >
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={reel.title} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-2xl">{reel.icon || '🎬'}</span>
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" aria-hidden="true" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className={`rounded-full bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center ${size === 'sm' ? 'w-9 h-9' : 'w-11 h-11'} ${reduced ? '' : 'group-hover:scale-110 transition-transform'}`}>
            <Play className={`text-white fill-white ml-0.5 ${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
          </span>
        </span>
        <span className="absolute bottom-0 inset-x-0 p-2.5 text-left">
          <span className="block font-heading font-medium text-[11px] text-white leading-snug line-clamp-2">{reel.title}</span>
        </span>
      </button>
    );
  };

  const views = activeReel ? formatViews(activeReel) : null;

  return (
    <div
      ref={sectionRef}
      className="relative"
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocus={() => setEngaged(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setEngaged(false);
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
        touchY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (touchX.current == null || touchY.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        const dy = e.changedTouches[0].clientY - touchY.current;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next : prev)();
        touchX.current = touchY.current = null;
      }}
    >
      <div className="flex items-center justify-center gap-3 sm:gap-4 lg:gap-6">
        {/* prev arrow */}
        <button
          type="button"
          onClick={prev}
          aria-label="Previous reel"
          disabled={n < 2}
          className="shrink-0 w-11 h-11 rounded-full bg-white/95 text-[#0B0D12] hover:bg-accent hover:text-white flex items-center justify-center shadow-lg transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* left side reels */}
        {desktopOffsets.filter((o) => o < 0).map((o) => (
          <span key={`d${o}`} className="hidden lg:block">
            <SideCard offset={o} size={o <= -2 ? 'sm' : 'md'} />
          </span>
        ))}
        {tabletOffsets.filter((o) => o < 0).map((o) => (
          <span key={`t${o}`} className="hidden sm:block lg:hidden">
            <SideCard offset={o} size="md" />
          </span>
        ))}

        {/* CENTER active reel */}
        <div className={`group relative shrink-0 w-[17rem] sm:w-[19rem] lg:w-[21rem] aspect-[9/16] rounded-[1.75rem] overflow-hidden bg-[#12151B] border-2 border-accent shadow-[0_0_45px_-8px_rgba(255,0,92,0.5)] ${motion}`}>
          {isInlineKind ? (
            <video
              ref={videoRef}
              key={activeMedia.src}
              src={activeMedia.src}
              poster={reelPoster(activeReel) || undefined}
              muted={muted}
              playsInline
              preload={playing ? 'auto' : 'metadata'}
              onEnded={handleEnded}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={(e) => {
                const el = e.currentTarget;
                if (activeMedia.kind === 'cloudinary' && activeMedia.fallbackSrc && el.src !== activeMedia.fallbackSrc) {
                  console.warn('[Reels] Primary src failed, falling back to direct MP4:', activeMedia.fallbackSrc);
                  el.src = activeMedia.fallbackSrc;
                  el.play().catch(() => setPlaying(false));
                  return;
                }
                console.error('[Reels] Video playback error:', e);
                setPlaying(false);
              }}
              onClick={activatePrimary}
              className="absolute inset-0 w-full h-full object-cover bg-black cursor-pointer"
            />
          ) : reelPoster(activeReel) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={reelPoster(activeReel)} alt={activeReel.title} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-5xl">{activeReel.icon || '🎬'}</span>
          )}

          {/* dark gradient — hidden while playing, visible on hover */}
          <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/50 pointer-events-none ${motion} ${playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`} aria-hidden="true" />

          {/* category + mute (accessible on hover even while playing) */}
          <div className={`absolute top-0 inset-x-0 p-3 z-30 flex items-start justify-between ${motion} ${playing ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-100'}`}>
            <span className="px-2 py-0.5 rounded bg-black/70 text-[9px] font-medium text-accent border border-accent/30 uppercase tracking-wider">
              {activeReel.category || 'Guide'}
            </span>
            {isInlineKind ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted((m) => {
                    const nv = !m;
                    if (videoRef.current) videoRef.current.muted = nv;
                    return nv;
                  });
                }}
                aria-label={muted ? 'Unmute' : 'Mute'}
                className="p-1.5 rounded-full bg-black/60 text-white border border-white/20 hover:text-accent transition-colors cursor-pointer"
              >
                {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-accent" />}
              </button>
            ) : null}
          </div>

          {/* center play / pause */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              activatePrimary();
            }}
            aria-label={playing ? `Pause ${activeReel.title}` : `Play ${activeReel.title}`}
            className={`absolute inset-0 z-20 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-accent ${activeMedia.kind === 'none' ? 'cursor-default' : 'cursor-pointer'}`}
          >
            {activeMedia.kind === 'none' ? (
              <span className="flex flex-col items-center gap-2 text-neutral-300">
                <VideoOff className="w-8 h-8" />
                <span className="text-[11px] font-medium">Video unavailable</span>
              </span>
            ) : (
              <span
                className={`rounded-full bg-accent shadow-[0_0_30px_-4px_rgba(255,0,92,0.7)] border-2 border-white flex items-center justify-center w-16 h-16 ${motion} ${playing ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100 scale-100'} ${reduced ? '' : 'hover:scale-110'}`}
              >
                {playing ? <Pause className="w-6 h-6 text-white fill-white" /> : <Play className="w-7 h-7 text-white fill-white ml-1" />}
              </span>
            )}
          </button>

          {/* bottom info — hidden while playing, visible on hover */}
          <div className={`absolute bottom-0 inset-x-0 p-4 text-left z-30 ${motion} ${playing ? 'opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0' : 'opacity-100 translate-y-0'}`}>
            <div className="flex items-end justify-between gap-2">
              <h3 className="font-heading font-medium text-sm text-white leading-snug line-clamp-2">{activeReel.title}</h3>
              {activeMedia.kind !== 'none' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModalOpen(true);
                  }}
                  aria-label="Expand video"
                  className="shrink-0 p-1.5 rounded-lg bg-white/10 text-white border border-white/15 hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {views ? <span className="mt-1 block text-[10px] text-neutral-300 font-medium">{views}</span> : null}
          </div>
        </div>

        {/* right side reels */}
        {tabletOffsets.filter((o) => o > 0).map((o) => (
          <span key={`t${o}`} className="hidden sm:block lg:hidden">
            <SideCard offset={o} size="md" />
          </span>
        ))}
        {desktopOffsets.filter((o) => o > 0).map((o) => (
          <span key={`d${o}`} className="hidden lg:block">
            <SideCard offset={o} size={o >= 2 ? 'sm' : 'md'} />
          </span>
        ))}

        {/* next arrow */}
        <button
          type="button"
          onClick={next}
          aria-label="Next reel"
          disabled={n < 2}
          className="shrink-0 w-11 h-11 rounded-full bg-white/95 text-[#0B0D12] hover:bg-accent hover:text-white flex items-center justify-center shadow-lg transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* dots */}
      <div className="flex items-center justify-center gap-2 pt-7">
        {reels.map((r, i) => (
          <button
            key={r._id}
            type="button"
            onClick={() => goTo(i, { autoplay: false })}
            aria-label={`Go to reel ${i + 1}: ${r.title}`}
            aria-current={i === active}
            className={`h-2 rounded-full transition-all cursor-pointer ${i === active ? 'w-6 bg-accent' : 'w-2 bg-white/25 hover:bg-white/50'}`}
          />
        ))}
      </div>
      <p className="pt-3 text-center text-[11px] text-neutral-500 font-medium">
        <Film className="inline w-3 h-3 mr-1 -mt-0.5" />
        Reel {active + 1} of {n}
      </p>

      {modalOpen && activeReel ? <ReelModal reel={activeReel} onClose={() => setModalOpen(false)} /> : null}
    </div>
  );
}
