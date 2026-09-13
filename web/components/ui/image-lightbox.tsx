'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface LightboxImage {
  url: string;
  alt?: string;
  caption?: string;
  title?: string;
  stepNumber?: number;
  width?: number;
  height?: number;
}

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  images: LightboxImage[];
  currentIndex: number;
  onNavigate: (newIndex: number) => void;
  previewMode?: boolean;
}

export function ImageLightbox({
  isOpen,
  onClose,
  images,
  currentIndex,
  onNavigate,
  previewMode = false,
}: ImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasMultiple = images.length > 1;
  const currentImage = images[currentIndex] || images[0];

  const handlePrev = useCallback(() => {
    if (!hasMultiple) return;
    const newIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
    onNavigate(newIndex);
  }, [hasMultiple, currentIndex, images.length, onNavigate]);

  const handleNext = useCallback(() => {
    if (!hasMultiple) return;
    const newIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
    onNavigate(newIndex);
  }, [hasMultiple, currentIndex, images.length, onNavigate]);

  // Lock body scroll & handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus close button on open
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
        return;
      }

      // Focus trap within dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, handlePrev, handleNext]);

  // Touch swipe support for mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartXRef.current - touchEndX;

    if (Math.abs(diffX) > 45) {
      if (diffX > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    touchStartXRef.current = null;
  };

  if (!mounted || !isOpen || !currentImage) return null;

  const content = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={currentImage.title ? `Screenshot: ${currentImage.title}` : 'Step Screenshot Lightbox'}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between p-3 sm:p-5 md:p-6 select-none animate-in fade-in duration-200"
    >
      {/* Dark backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-md cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Top bar header */}
      <div className="relative z-10 w-full max-w-6xl flex items-center justify-between gap-3 text-white pb-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {typeof currentImage.stepNumber === 'number' && (
            <span className="px-3 py-1 rounded-full bg-accent text-white text-xs font-heading font-black tracking-wide shrink-0 shadow-md">
              Step {currentImage.stepNumber}
            </span>
          )}
          {currentImage.title && (
            <h2 className="text-sm sm:text-base font-heading font-medium text-white/95 truncate">
              {currentImage.title}
            </h2>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {hasMultiple && (
            <span className="text-xs text-white/70 font-mono tracking-wider bg-white/10 px-2.5 py-1 rounded-full border border-white/10">
              {currentIndex + 1} / {images.length}
            </span>
          )}

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close zoomed view (Esc)"
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-accent text-white/90 hover:text-white border border-white/15 transition-all shadow-lg hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Container */}
      <div
        className="relative z-10 flex-1 w-full max-w-6xl flex items-center justify-center min-h-0 py-2"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Previous button */}
        {hasMultiple && (
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous step image (Left Arrow)"
            className="absolute left-1 sm:left-2 md:left-4 z-20 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-accent text-white/90 hover:text-white border border-white/20 transition-all shadow-2xl backdrop-blur-md hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* The enlarged screenshot image */}
        <div
          className="relative max-h-full max-w-full flex items-center justify-center px-10 sm:px-14 md:px-16"
          onClick={(e) => e.stopPropagation()}
        >
          <Image
            src={currentImage.url}
            alt={currentImage.alt || currentImage.title || 'Step screenshot'}
            width={currentImage.width && currentImage.width > 0 ? currentImage.width : 1600}
            height={currentImage.height && currentImage.height > 0 ? currentImage.height : 900}
            sizes="(max-width: 768px) 95vw, (max-width: 1280px) 92vw, 1300px"
            className="w-full max-w-5xl xl:max-w-6xl h-auto max-h-[76vh] sm:max-h-[80vh] md:max-h-[83vh] object-contain rounded-xl sm:rounded-2xl border border-white/15 shadow-2xl transition-all duration-200"
            unoptimized={previewMode}
            priority
          />
        </div>

        {/* Next button */}
        {hasMultiple && (
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next step image (Right Arrow)"
            className="absolute right-1 sm:right-2 md:right-4 z-20 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-accent text-white/90 hover:text-white border border-white/20 transition-all shadow-2xl backdrop-blur-md hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom bar with caption & keyboard helper */}
      <div className="relative z-10 w-full max-w-6xl flex flex-col items-center justify-center gap-1.5 pt-2 shrink-0">
        {currentImage.caption && (
          <div className="text-xs sm:text-sm text-white/90 font-normal text-center px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 max-w-xl truncate">
            {currentImage.caption}
          </div>
        )}

        <div className="hidden sm:flex items-center gap-2 text-[11px] text-white/50 font-normal">
          <span>Use</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80 font-mono text-[10px] border border-white/15">←</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80 font-mono text-[10px] border border-white/15">→</kbd>
          <span>to navigate</span>
          <span>•</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80 font-mono text-[10px] border border-white/15">Esc</kbd>
          <span>to close</span>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
