'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Trophy, Play, X, ExternalLink, Calendar, Building2, ChevronRight, Star, Sparkles, Loader2, TriangleAlert,
  Image as ImageIcon,
} from 'lucide-react';
import { resolveImageSrc } from '@/lib/cloudinary';
import { awardApi } from '@/lib/api';
import type { Award } from '@/lib/award-api';

const PAGE_SIZE = 9;

const FALLBACK_IMG =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1a1a1a"/><stop offset="1" stop-color="#2d0a19"/>
      </linearGradient></defs>
      <rect width="800" height="600" fill="url(#g)"/>
      <circle cx="400" cy="250" r="120" fill="#FF005C" opacity="0.18"/>
      <text x="400" y="440" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#FF005C" font-weight="bold">APEX VOUCHERS</text>
      <text x="400" y="480" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#94a3b8">Awards &amp; Achievements</text>
    </svg>`
  );

function AwardImage({ award, width = 800, className = '', eager = false }: { award: Award; width?: number; className?: string; eager?: boolean }) {
  const [src, setSrc] = useState(award.imageUrl ? resolveImageSrc(award.imageUrl) : FALLBACK_IMG);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(award.imageUrl ? resolveImageSrc(award.imageUrl) : FALLBACK_IMG);
    setFailed(false);
  }, [award.imageUrl]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed ? FALLBACK_IMG : src}
      alt={award.imageAlt || `Award: ${award.title}`}
      width={width}
      height={Math.round((width * 3) / 4)}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={`${className} object-cover`}
    />
  );
}

function StatusPill({ award }: { award: Award }) {
  return award.featured ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent text-white text-[10px] font-medium uppercase tracking-wider shadow-md">
      <Star className="w-3 h-3 fill-current" /> Featured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface/95 text-ink border border-line text-[10px] font-medium uppercase tracking-wider shadow-md">
      <Trophy className="w-3 h-3" /> {award.category || 'Recognition'}
    </span>
  );
}

function AwardCard({ award, onView }: { award: Award; onView: (a: Award) => void }) {
  return (
    <article className="group relative flex flex-col rounded-3xl bg-surface border border-line card-shadow overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:border-accent/40">
      <button type="button" onClick={() => onView(award)} className="relative block w-full aspect-4/3 overflow-hidden bg-surface-sunken text-left cursor-pointer" aria-label={`View details of ${award.title}`}>
        <AwardImage award={award} width={800} className="w-full h-full transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10 opacity-70" aria-hidden="true" />
        {award.videoUrl && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-14 h-14 rounded-full bg-accent shadow-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            </span>
          </span>
        )}
        <div className="absolute top-3 left-3"><StatusPill award={award} /></div>
      </button>
      <div className="flex flex-col flex-1 p-5 space-y-3">
        <div className="flex items-start gap-2">
          <span className="w-8 h-8 rounded-xl bg-accent/8 border border-accent/20 flex items-center justify-center shrink-0 mt-0.5">
            <Trophy className="w-4 h-4 text-accent" />
          </span>
          <div className="min-w-0">
            <h3 className="font-heading font-medium text-base text-ink leading-tight line-clamp-2">{award.title}</h3>
            {award.organization && (
              <p className="text-[11px] font-normal text-ink-muted mt-0.5 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-accent" />
                <span className="line-clamp-1">{award.organization}</span>
              </p>
            )}
          </div>
        </div>
        <p className="text-xs font-medium text-ink-muted leading-relaxed line-clamp-2 flex-1">
          {award.description || 'A recognised achievement from the Apex Vouchers journey.'}
        </p>
        <div className="pt-2">
          <button type="button" onClick={() => onView(award)} className="inline-flex items-center gap-1 px-4 h-9 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-xs transition-colors cursor-pointer">
            View Details <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </article>
  );
}

function AwardDetailModal({ award, onClose }: { award: Award; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [fullImage, setFullImage] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoKey, setVideoKey] = useState(0);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => closeRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [onClose]);

  const startVideo = () => {
    setVideoError(false);
    setVideoLoading(true);
    setPlaying(true);
  };

  const retryVideo = () => {
    setVideoError(false);
    setVideoLoading(true);
    setVideoKey((k) => k + 1);
  };

  const showVideo = playing && !!award.videoUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="award-modal-title" className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl bg-surface border border-line shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close award details" className="absolute top-4 right-4 z-20 p-2.5 rounded-full bg-surface text-ink shadow-lg hover:bg-accent hover:text-white transition-colors cursor-pointer">
          <X className="w-5 h-5" />
        </button>
        <div className="relative aspect-video overflow-hidden bg-surface-sunken">
          {showVideo && !videoError ? (
            <>
              <video
                key={videoKey}
                src={award.videoUrl}
                poster={award.videoThumbnail || (award.imageUrl ? resolveImageSrc(award.imageUrl) : undefined)}
                controls
                autoPlay
                playsInline
                controlsList="nodownload"
                preload="metadata"
                onCanPlay={() => setVideoLoading(false)}
                onPlaying={() => setVideoLoading(false)}
                onError={() => { setVideoLoading(false); setVideoError(true); }}
                className="w-full h-full object-contain bg-black"
              >
                Your browser does not support embedded videos.
              </video>
              {videoLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/45 pointer-events-none" aria-live="polite">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                  <p className="text-[11px] font-medium text-white/85">Loading video…</p>
                </div>
              )}
            </>
          ) : showVideo && videoError ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-4 sm:px-6 gap-3 bg-[#0B0D12]" role="alert">
              <TriangleAlert className="w-8 h-8 text-amber-400" />
              <div>
                <p className="text-sm font-medium text-white">This video could not be loaded.</p>
                <p className="text-xs text-neutral-400 mt-1">Please try again or check back soon.</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={retryVideo} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-white text-[11px] font-medium hover:bg-accent-hover transition-colors cursor-pointer">
                  Retry
                </button>
                <button type="button" onClick={() => { setPlaying(false); setVideoError(false); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] font-medium hover:bg-white/20 transition-colors cursor-pointer">
                  <ImageIcon className="w-3.5 h-3.5" /> Show Image
                </button>
              </div>
            </div>
          ) : (
            <>
              <AwardImage award={award} width={1600} eager className="w-full h-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden="true" />
            </>
          )}
          <div className="absolute bottom-4 left-4 sm:bottom-5 sm:left-6 flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full bg-accent text-white text-[10px] font-medium uppercase tracking-wider">{award.featured ? '★ Featured' : award.category || 'Recognition'}</span>
            {award.year && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] font-medium">
                <Calendar className="w-3 h-3 text-accent" /> {award.year}
              </span>
            )}
          </div>
          {!showVideo && (award.videoUrl || award.imageUrl) && (
            <div className="absolute bottom-3 right-3 sm:bottom-5 sm:right-6 flex items-center justify-end flex-wrap gap-2 max-w-[calc(100%-1.5rem)]">
              {award.videoUrl && (
                <button type="button" onClick={startVideo} aria-label="Play award video" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] font-medium hover:bg-accent transition-colors cursor-pointer">
                  <Play className="w-3.5 h-3.5 fill-current" /> Play Video
                </button>
              )}
              {award.imageUrl && (
                <button type="button" onClick={() => setFullImage(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] font-medium hover:bg-accent transition-colors cursor-pointer">
                  <ExternalLink className="w-3.5 h-3.5" /> Full Size
                </button>
              )}
            </div>
          )}
        </div>
        <div className="p-5 sm:p-8 pt-6">
          <h3 id="award-modal-title" className="font-heading font-medium text-2xl sm:text-3xl leading-tight mb-3">{award.title}</h3>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            {award.organization && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-sunken text-xs font-normal text-ink-muted">
                <Building2 className="w-3.5 h-3.5 text-accent" /> {award.organization}
              </span>
            )}
            {award.year && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/8 text-xs font-medium text-accent border border-accent/20">
                <Calendar className="w-3.5 h-3.5" /> Awarded {award.year}
              </span>
            )}
            {award.externalLink && (
              <a href={award.externalLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-sunken text-ink-muted text-xs font-medium border border-line hover:text-ink transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Learn More
              </a>
            )}
          </div>
          <p className="text-sm sm:text-[15px] font-medium text-ink-muted leading-relaxed whitespace-pre-wrap">
            {award.description || 'No additional details available for this achievement yet.'}
          </p>
        </div>
      </div>

      {fullImage && (
        <div className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200" onClick={() => setFullImage(false)} role="dialog" aria-modal="true" aria-label="Full size award image">
          <button type="button" onClick={() => setFullImage(false)} aria-label="Close full size image" className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white hover:bg-accent transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolveImageSrc(award.imageUrl || '')} alt={award.imageAlt || award.title} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

export function AwardsSection({ initialAwards, total, featuredCount }: { initialAwards: Award[]; total: number; featuredCount: number }) {
  const [awards, setAwards] = useState<Award[]>(initialAwards);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialAwards.length < total);
  const [selectedAward, setSelectedAward] = useState<Award | null>(null);

  const loadMore = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await awardApi.list({ page: String(page + 1), limit: '9' });
      if (res.success) {
        setAwards((prev) => [...prev, ...(res.data as Award[])]);
        setPage((res.page as number) || page + 1);
        setHasMore(!!res.hasMore);
      } else {
        setError((res.message as string) || 'Failed to load more awards');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load awards');
    } finally {
      setLoading(false);
    }
  };

  const featured = awards.find((a) => a.featured) || null;

  return (
    <section className="relative bg-surface text-ink transition-colors duration-300 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-accent/8 blur-3xl" />
        <div className="absolute top-1/2 -left-32 w-80 h-80 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/8 text-accent text-[11px] font-medium uppercase tracking-widest border border-accent/25 mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Our Milestones
          </span>
          <h1 className="font-heading font-medium text-3xl sm:text-4xl lg:text-5xl tracking-tight mb-4">
            Awards &amp; <span className="text-gradient-pink">Achievements</span>
          </h1>
          <p className="text-sm sm:text-base font-medium text-ink-muted leading-relaxed">
            Recognitions, honours and milestones earned along the way — proof of our commitment to genuine exam vouchers, fast delivery and trusted customer support.
          </p>
        </div>

        {featured && awards.length > 1 && (
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-4 h-4 text-accent fill-accent" />
              <h2 className="font-heading font-medium text-lg sm:text-xl">Featured Achievement</h2>
            </div>
            <div
              className="group relative grid md:grid-cols-2 rounded-3xl overflow-hidden border border-accent/25 bg-surface card-shadow hover:shadow-2xl transition-all duration-300 cursor-pointer"
              onClick={() => setSelectedAward(featured)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedAward(featured); } }}
            >
              <div className="relative aspect-video md:aspect-auto md:min-h-72 overflow-hidden bg-surface-sunken">
                <AwardImage award={featured} width={1200} eager className="w-full h-full transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/60 via-black/10 to-transparent" aria-hidden="true" />
                {featured.videoUrl && (
                  <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent text-white text-[11px] font-medium shadow-lg">
                    <Play className="w-3.5 h-3.5 fill-current" /> Watch Video
                  </span>
                )}
                <span className="absolute top-4 left-4"><StatusPill award={featured} /></span>
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-10 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {featured.year && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/8 text-accent text-xs font-medium border border-accent/20">
                      <Calendar className="w-3 h-3" /> {featured.year}
                    </span>
                  )}
                  {featured.organization && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-sunken text-ink-muted text-xs font-normal">
                      <Building2 className="w-3 h-3" /> {featured.organization}
                    </span>
                  )}
                </div>
                <h3 className="font-heading font-medium text-2xl sm:text-3xl leading-tight">{featured.title}</h3>
                <p className="text-sm font-medium text-ink-muted leading-relaxed line-clamp-3">{featured.description}</p>
                <div className="pt-1 inline-flex items-center gap-2 text-accent text-sm font-medium">
                  View Full Details <ChevronRight className="w-4 h-4" strokeWidth={3} />
                </div>
              </div>
            </div>
          </div>
        )}

        {awards.length === 0 && !error && (
          <div className="py-20 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-surface-sunken border border-line flex items-center justify-center mx-auto">
              <Trophy className="w-7 h-7 text-neutral-400" />
            </div>
            <p className="font-heading font-medium text-lg">New achievements coming soon!</p>
            <p className="text-sm font-medium text-ink-muted">We&apos;re adding our latest awards and recognitions here.</p>
          </div>
        )}

        {error && (
          <div className="max-w-md mx-auto py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 mx-auto flex items-center justify-center mb-4">
              <TriangleAlert className="w-7 h-7 text-amber-500" />
            </div>
            <h2 className="font-heading font-medium text-lg mb-1.5">Couldn&apos;t load achievements</h2>
            <p className="text-sm font-medium text-ink-muted mb-5">{error}</p>
          </div>
        )}

        {awards.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-7">
              {awards.map((award, idx) => (
                <AwardCard key={award.id} award={award} onView={(a) => setSelectedAward(a)} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-10">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 h-11 rounded-xl bg-surface text-ink border border-line font-medium text-xs hover:border-accent/40 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? 'Loading…' : <>Load More Achievements <ChevronRight className="w-4 h-4" /></>}
                </button>
              </div>
            )}

            <p className="text-center text-[11px] font-normal text-ink-muted mt-6" aria-live="polite">
              Showing {awards.length} of {total} achievements{featuredCount ? ` • ${featuredCount} featured` : ''}
            </p>
          </>
        )}

        {selectedAward && (
          <AwardDetailModal award={selectedAward} onClose={() => setSelectedAward(null)} />
        )}
      </div>
    </section>
  );
}
