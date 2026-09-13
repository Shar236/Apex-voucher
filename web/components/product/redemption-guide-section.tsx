'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { ExternalLink, Info, PlayCircle, ZoomIn } from 'lucide-react';
import SectionHeading from '@/components/ui/section-heading';
import { ImageLightbox, type LightboxImage } from '@/components/ui/image-lightbox';
import { getRedemptionGuide } from '@/lib/redemption-guides';
import type { Product } from '@/lib/types';

function OfficialWebsiteButton({ url, label, buttonText }: { url?: string; label: string; buttonText?: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-ink text-surface font-medium text-sm shadow-lg hover:scale-[1.02] transition-all cursor-pointer"
    >
      <span>{buttonText?.trim() || `Visit Official ${label} Website`}</span>
      <ExternalLink className="w-4 h-4" />
    </a>
  );
}

/**
 * Product-specific "How to Redeem" section. Fully data-driven — the steps,
 * screenshots, notes, official link and intro all come from the product
 * (see lib/redemption-guides.ts for the resolution order). A step with no
 * screenshot renders as clean text: no placeholder, no broken image.
 *
 * Reused by the public product page and the admin editor's live preview.
 */
export function RedemptionGuideSection({
  product,
  headingAlign = 'center',
  previewMode = false,
}: {
  product: Product;
  headingAlign?: 'center' | 'left';
  previewMode?: boolean;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const guide = getRedemptionGuide(product);

  const screenshotSteps = useMemo(() => {
    return guide.steps
      .map((step, originalIndex) => ({
        step,
        originalIndex,
      }))
      .filter((item) => !!item.step.screenshot?.url);
  }, [guide.steps]);

  const lightboxImages: LightboxImage[] = useMemo(() => {
    return screenshotSteps.map(({ step, originalIndex }) => ({
      url: step.screenshot!.url as string,
      alt: step.screenshot?.alt?.trim() || `${step.title} — ${product.name} redemption screenshot`,
      caption: step.screenshot?.caption,
      title: step.title,
      stepNumber: originalIndex + 1,
      width: step.screenshot?.width,
      height: step.screenshot?.height,
    }));
  }, [screenshotSteps, product.name]);

  const openLightbox = (shotIndex: number) => {
    if (shotIndex >= 0 && shotIndex < lightboxImages.length) {
      setLightboxIndex(shotIndex);
      setLightboxOpen(true);
    }
  };

  if (guide.steps.length === 0) return null;

  const productLabel = /\bvoucher\b/i.test(product.name) ? product.name : `${product.name} Voucher`;

  return (
    <div className="space-y-10">
      <SectionHeading
        eyebrow="Redemption Guide"
        title={`How to Redeem Your ${productLabel}`}
        subtitle={guide.introduction || undefined}
        align={headingAlign}
      />

      <div className="space-y-10">
        {guide.steps.map((step, i) => {
          const shot = step.screenshot;
          const hasShot = !!shot?.url;
          const alt = shot?.alt?.trim() || `${step.title} — ${product.name} redemption screenshot`;
          const shotIndex = screenshotSteps.findIndex((item) => item.originalIndex === i);

          const textCol = (
            <div className={`space-y-2.5 ${hasShot && i % 2 === 1 ? 'md:order-2' : ''}`}>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent/8 text-accent font-medium text-xs border border-accent/20">
                {i + 1}
              </span>
              <h3 className="font-heading font-medium text-lg text-ink">
                Step {i + 1} — {step.title}
              </h3>
              {step.description && (
                <p className="text-sm text-ink-muted font-normal leading-relaxed">{step.description}</p>
              )}
              {step.importantNote && (
                <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 px-4 py-3 text-xs font-normal text-amber-800 dark:text-amber-300 leading-relaxed">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{step.importantNote}</span>
                </div>
              )}
              {step.videoUrl && (
                <a
                  href={step.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
                >
                  <PlayCircle className="w-4 h-4" /> Watch a short walkthrough
                </a>
              )}
              {i === 0 && (
                <div className="pt-1">
                  <OfficialWebsiteButton url={guide.officialUrl} label={guide.providerLabel} buttonText={guide.buttonText} />
                </div>
              )}
            </div>
          );

          if (!hasShot) {
            // No screenshot — a clean, full-width text step. No placeholder, no broken image.
            return <div key={i} className="max-w-3xl">{textCol}</div>;
          }

          return (
            <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-6 md:items-center">
              {textCol}
              <figure className={`m-0 ${i % 2 === 1 ? 'md:order-1' : ''}`}>
                <button
                  type="button"
                  onClick={() => openLightbox(shotIndex)}
                  aria-label={`Enlarge Step ${i + 1} screenshot: ${step.title}`}
                  className="group/img relative block w-full overflow-hidden rounded-2xl border border-line bg-surface-raised cursor-zoom-in transition-all duration-300 hover:border-accent/40 hover:shadow-xl hover:shadow-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent text-left"
                >
                  <div className="overflow-hidden">
                    <Image
                      src={shot!.url as string}
                      alt={alt}
                      width={shot?.width && shot.width > 0 ? shot.width : 1600}
                      height={shot?.height && shot.height > 0 ? shot.height : 900}
                      sizes="(max-width: 768px) 100vw, 640px"
                      className="w-full h-auto transition-transform duration-300 group-hover/img:scale-[1.02]"
                      unoptimized={previewMode}
                    />
                  </div>

                  {/* Hover overlay hint */}
                  <div className="absolute inset-0 bg-ink/10 opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 pointer-events-none flex items-center justify-center">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-ink/85 text-white text-xs font-medium backdrop-blur-md border border-white/20 shadow-lg transform translate-y-1 group-hover/img:translate-y-0 transition-transform duration-200">
                      <ZoomIn className="w-3.5 h-3.5 text-accent" />
                      <span>Click to enlarge</span>
                    </span>
                  </div>

                  {/* Corner zoom badge */}
                  <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-black/55 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-md opacity-70 group-hover/img:opacity-100 transition-opacity pointer-events-none">
                    <ZoomIn className="w-3.5 h-3.5 text-accent" />
                  </div>
                </button>

                {shot?.caption && (
                  <figcaption className="mt-2 text-[11px] font-normal text-ink-muted text-center">{shot.caption}</figcaption>
                )}
              </figure>
            </div>
          );
        })}
      </div>

      {guide.warnings.length > 0 && (
        <div className="max-w-3xl mx-auto space-y-2">
          {guide.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-2xl bg-surface border border-line px-4 py-3 text-xs font-normal text-ink-muted leading-relaxed"
            >
              <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Enlarged Step Screenshot Modal Lightbox */}
      <ImageLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        images={lightboxImages}
        currentIndex={lightboxIndex}
        onNavigate={setLightboxIndex}
        previewMode={previewMode}
      />
    </div>
  );
}

