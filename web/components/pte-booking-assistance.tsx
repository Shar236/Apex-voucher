'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { ArrowRight, ShieldCheck, Calendar, Headphones, Check, Info } from 'lucide-react';
import { PearsonOfficialLogo } from '@/components/official-brand-logos';
import { formatPrice } from '@/lib/api';
import { useCart } from '@/components/cart-provider';
import type { Product, PTEBookingCatalog, PTEBookingProduct, PTEBookingPageContent } from '@/lib/types';

interface PTEBookingAssistanceProps {
  products?: Product[];
  catalog?: PTEBookingCatalog | null;
}

// Canonical fallback seed matching requirements in case network request is pending
const INITIAL_FALLBACK_PRODUCTS: PTEBookingProduct[] = [
  {
    _id: 'pte-academic-default',
    key: 'pte-academic',
    name: 'PTE Academic',
    shortDescription: 'For university study admissions, student visas & professional registrations worldwide.',
    serviceLabel: 'EXAM BOOKING SERVICE',
    badgeText: 'MOST POPULAR',
    badgeTint: '#005A9C',
    image: '',
    imageAlt: 'PTE Academic exam booking illustration with graduation cap, passport and study materials',
    pricing: {
      bookingPrice: 14999,
      standardPrice: 18900,
      currency: 'INR',
      showStandardPrice: true,
      showSavingsBadge: true,
    },
    features: [
      { text: 'Exam booking arranged for you', enabled: true },
      { text: 'Choose preferred test centre', enabled: true },
      { text: 'Choose preferred available date', enabled: true },
      { text: 'Booking confirmation provided', enabled: true },
      { text: 'Human support throughout the process', enabled: true },
    ],
    button: { text: 'Request Booking →', href: '', visible: true, enabled: true },
    displayOrder: 1,
  },
  {
    _id: 'pte-core-default',
    key: 'pte-core',
    name: 'PTE Core',
    shortDescription: 'Approved by IRCC for Canadian Permanent Residency (PR), Express Entry, and Citizenship.',
    serviceLabel: 'EXAM BOOKING SERVICE',
    badgeText: 'CANADA PR',
    badgeTint: '#FF005C',
    image: '',
    imageAlt: 'PTE Core exam booking illustration for Canada PR with maple leaf and passport',
    pricing: {
      bookingPrice: 14999,
      standardPrice: 18900,
      currency: 'INR',
      showStandardPrice: true,
      showSavingsBadge: true,
    },
    features: [
      { text: 'Exam booking arranged for you', enabled: true },
      { text: 'Choose preferred test centre', enabled: true },
      { text: 'Choose preferred available date', enabled: true },
      { text: 'Booking confirmation provided', enabled: true },
      { text: 'Human support throughout the process', enabled: true },
    ],
    button: { text: 'Request Booking →', href: '', visible: true, enabled: true },
    displayOrder: 2,
  },
  {
    _id: 'pte-ukvi-default',
    key: 'pte-ukvi',
    name: 'PTE Academic UKVI',
    shortDescription: 'Secure English Language Test (SELT) approved by the UK Home Office for UK visas.',
    serviceLabel: 'EXAM BOOKING SERVICE',
    badgeText: 'UK VISA (SELT)',
    badgeTint: '#6C3CE0',
    image: '',
    imageAlt: 'PTE Academic UKVI exam booking illustration for UK visa with London landmarks',
    pricing: {
      bookingPrice: 14499,
      standardPrice: 0,
      currency: 'INR',
      showStandardPrice: false,
      showSavingsBadge: false,
    },
    features: [
      { text: 'Exam booking arranged for you', enabled: true },
      { text: 'Choose preferred test centre', enabled: true },
      { text: 'Choose preferred available date', enabled: true },
      { text: 'Booking confirmation provided', enabled: true },
      { text: 'Human support throughout the process', enabled: true },
    ],
    button: { text: 'Request Booking →', href: '', visible: true, enabled: true },
    displayOrder: 3,
  },
];

const getFallbackIllustration = (key: string) => {
  const k = (key || '').toLowerCase();
  if (k.includes('core')) return 'pte-core';
  if (k.includes('ukvi')) return 'pte-academic-ukvi';
  return 'pte-academic';
};

export function PTEBookingAssistance({ catalog }: PTEBookingAssistanceProps) {
  const { addToCart, setIsCartOpen } = useCart();
  const pathname = usePathname();
  const onBookingPage = pathname === '/exam-booking';

  const [bookingProducts, setBookingProducts] = useState<PTEBookingProduct[]>(
    catalog?.products && catalog.products.length > 0
      ? catalog.products
      : INITIAL_FALLBACK_PRODUCTS
  );

  const [pageContent, setPageContent] = useState<PTEBookingPageContent>(
    catalog?.page || {}
  );

  // Fetch live catalog if not supplied via SSR or to re-verify client side
  useEffect(() => {
    let cancelled = false;
    const fetchLiveCatalog = async () => {
      try {
        const res = await fetch('/api/pte-booking-catalog');
        if (!res.ok) return;
        const data = (await res.json()) as PTEBookingCatalog;
        if (!cancelled && data && data.success && Array.isArray(data.products) && data.products.length > 0) {
          setBookingProducts(data.products);
          if (data.page) setPageContent(data.page);
        }
      } catch {
        // Fallback already in place
      }
    };

    fetchLiveCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBookNow = (product: PTEBookingProduct) => {
    // Map PTEBookingProduct into a cart-ready item with its database ID and live price.
    // The server will validate this exact price from PTEBookingProduct at checkout time.
    const standardPrice = Number(product.pricing?.standardPrice) || 0;
    const bookingPrice = Number(product.pricing?.bookingPrice) || 14999;
    const savings = standardPrice > bookingPrice ? standardPrice - bookingPrice : 0;

    const cartProduct: Product = {
      _id: product._id,
      id: product._id,
      name: product.name,
      slug: product.key,
      category: 'PTE',
      voucherType: 'PTE-BOOKING',
      brand: 'Pearson PTE',
      provider: 'Pearson',
      sellingPrice: bookingPrice,
      discountedPrice: bookingPrice,
      originalPrice: standardPrice > 0 ? standardPrice : bookingPrice,
      pricing: {
        currency: (product.pricing?.currency as 'INR' | 'USD') || 'INR',
        displayPrice: bookingPrice,
        displayOriginalPrice: standardPrice > 0 ? standardPrice : bookingPrice,
        basePriceINR: bookingPrice,
      },
      savings,
      active: true,
      image: product.image || getFallbackIllustration(product.key),
      features: (product.features || []).filter((f) => f.enabled !== false).map((f) => f.text),
      shortDescription: product.shortDescription || product.serviceLabel || 'PTE Exam Booking Service',
      description: product.shortDescription || 'PTE Exam Booking Service',
    };

    addToCart(cartProduct);
    setIsCartOpen(true);
  };

  const [showDetails, setShowDetails] = useState(false);

  const brandBadge = pageContent.brand?.badgeText || 'PTE EXAM BOOKING';
  const heroHeading = pageContent.hero?.heading || 'Get Your PTE Exam Booked.';
  const heroHighlight = pageContent.hero?.highlight || 'PTE Exam';
  const heroSubtitle = pageContent.hero?.subtitle || 'Simple booking. Better pricing. Zero hassle.';
  const noticeEnabled = pageContent.notice?.enabled !== false;
  const noticeTitle = pageContent.notice?.title || 'EXAM BOOKING ASSISTANCE ONLY';
  const noticeDesc =
    pageContent.notice?.description ||
    'This payment is for PTE exam booking assistance only. No voucher, voucher code, or voucher credit is included.';

  // Highlight heading helper
  const renderHeading = () => {
    if (!heroHighlight || !heroHeading.includes(heroHighlight)) {
      return heroHeading;
    }
    const parts = heroHeading.split(heroHighlight);
    return (
      <>
        {parts[0]}
        <span className="text-[#FF005C]">{heroHighlight}</span>
        {parts.slice(1).join(heroHighlight)}
      </>
    );
  };

  return (
    <section id="pte-booking-service" className="py-12 sm:py-16 bg-surface-raised border-b border-line transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-2">
          <div className="inline-flex items-center mb-3">
            {pageContent.brand?.showPearsonLogo !== false && (
              <PearsonOfficialLogo className="h-8 sm:h-10 w-auto dark:brightness-0 dark:invert" />
            )}
            <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-[#FFF0F5] text-[#FF005C] dark:bg-[#FF005C]/10 dark:text-[#FF005C]">
              {brandBadge}
            </span>
          </div>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl lg:text-[42px] leading-tight text-neutral-900 dark:text-white tracking-tight">
            {renderHeading()}
          </h2>
          <p className="mt-1.5 text-sm sm:text-base font-normal text-neutral-600 dark:text-neutral-400">
            {heroSubtitle}
          </p>
        </div>

        {/* Booking Service Only Notice with Explore More Explainer */}
        {noticeEnabled && (
          <div className="w-full max-w-4xl mx-auto mt-5 mb-4 p-3.5 rounded-2xl bg-[#FFF5F7] dark:bg-[#FF005C]/10 border border-[#FFE0E8] dark:border-[#FF005C]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left text-xs sm:text-sm text-neutral-700 dark:text-neutral-200">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-[#FF005C] shrink-0" />
              <span>
                <span className="font-bold text-[#FF005C] uppercase tracking-wider text-[11px] sm:text-xs mr-1.5">
                  {noticeTitle}
                </span>
                <span className="font-normal">{noticeDesc}</span>
              </span>
            </div>
            {onBookingPage ? (
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs font-bold text-[#FF005C] hover:underline whitespace-nowrap cursor-pointer flex items-center gap-1 shrink-0"
              >
                <span>{showDetails ? 'Hide Details' : 'Explore More'}</span>
                <span className="text-[10px]">{showDetails ? '▲' : '▼'}</span>
              </button>
            ) : (
              <Link
                href="/exam-booking"
                className="text-xs font-bold text-[#FF005C] hover:underline whitespace-nowrap cursor-pointer flex items-center gap-1 shrink-0"
              >
                <span>Explore More</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        )}

        {showDetails && (
          <div className="w-full max-w-4xl mx-auto mb-8 p-4 rounded-2xl bg-white dark:bg-[#161616] border border-neutral-200 dark:border-white/10 text-xs text-neutral-600 dark:text-neutral-300 space-y-2.5 shadow-xs transition-all">
            <div className="font-bold text-neutral-900 dark:text-white text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>How PTE Exam Booking Assistance Works</span>
            </div>
            <p className="font-medium text-neutral-700 dark:text-neutral-200">
              Your payment submits a booking request for PTE exam booking assistance. Your exam is NOT considered booked until our team processes and confirms the booking.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#11141B] border border-neutral-100 dark:border-white/5 space-y-1">
                <div className="font-bold text-neutral-900 dark:text-white text-xs">1. Submit Preferences</div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Pick your preferred exam (Academic, Core, UKVI), test centre city, and available dates.</div>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#11141B] border border-neutral-100 dark:border-white/5 space-y-1">
                <div className="font-bold text-neutral-900 dark:text-white text-xs">2. Slot Reservation</div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Our dedicated team reserves your official slot through Pearson Authorized channels.</div>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#11141B] border border-neutral-100 dark:border-white/5 space-y-1">
                <div className="font-bold text-neutral-900 dark:text-white text-xs">3. Official Confirmation</div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Receive your Pearson Booking Reference, test centre address, and appointment schedule.</div>
              </div>
            </div>
          </div>
        )}

        {/* 3 Booking Product Cards (Fully Dynamic) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 items-stretch">
          {bookingProducts.map((card) => {
            const bookingPrice = Number(card.pricing?.bookingPrice) || 0;
            const standardPrice = Number(card.pricing?.standardPrice) || 0;
            const savings = standardPrice > bookingPrice ? standardPrice - bookingPrice : 0;
            const showStandard = card.pricing?.showStandardPrice !== false && standardPrice > 0;
            const showSavings = card.pricing?.showSavingsBadge !== false && savings > 0;
            const cardImg = card.image || getFallbackIllustration(card.key);
            const cardImgAlt = card.imageAlt || `${card.name} exam booking illustration`;
            const activeFeatures = (card.features || []).filter((f) => f && f.enabled !== false && f.text);

            return (
              <div
                key={card._id || card.key}
                className="flex flex-col h-full rounded-2xl bg-white dark:bg-[#11141B] border border-neutral-100 dark:border-white/10 p-5 shadow-sm hover:shadow-md transition-all duration-300 justify-between"
              >
                <div>
                  {/* Image/Illustration */}
                  <div className="w-full h-44 sm:h-48 rounded-xl overflow-hidden mb-4 bg-neutral-50 dark:bg-neutral-900/40 flex items-center justify-center relative">
                    <Image
                      src={cardImg}
                      alt={cardImgAlt}
                      fill
                      sizes="(max-width: 640px) 90vw, 380px"
                      loading="lazy"
                      className="object-cover object-center"
                    />
                  </div>

                  {/* Title & Service Label */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                      <h3 className="font-heading font-bold text-xl text-neutral-900 dark:text-white leading-snug">
                        {card.name}
                      </h3>
                      {card.badgeText && (
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-white"
                          style={{ backgroundColor: card.badgeTint || '#FF005C' }}
                        >
                          {card.badgeText}
                        </span>
                      )}
                    </div>
                    <span className="inline-block text-xs font-bold uppercase tracking-wider text-[#FF005C] mt-0.5">
                      {card.serviceLabel || 'EXAM BOOKING SERVICE'}
                    </span>
                  </div>

                  {/* Special Booking Price Box */}
                  <div className="p-3.5 rounded-xl bg-neutral-50/80 dark:bg-white/[0.04] border border-neutral-100 dark:border-white/10 mb-4 min-h-[82px] flex flex-col justify-center">
                    <span className="text-xs font-semibold text-[#FF005C] block mb-1">
                      Special Booking Price
                    </span>
                    <div>
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
                        <span className="font-heading font-bold text-2xl text-neutral-900 dark:text-white tracking-tight">
                          {formatPrice(bookingPrice)}
                        </span>
                        {showSavings && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/80">
                            SAVE {formatPrice(savings)}
                          </span>
                        )}
                      </div>
                      {showStandard && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          Standard Exam Price:{' '}
                          <span className="line-through text-neutral-400 dark:text-neutral-500">
                            {formatPrice(standardPrice)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Features List */}
                  <ul className="space-y-2 text-xs text-neutral-600 dark:text-neutral-300 font-normal mb-5">
                    {activeFeatures.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2.5} />
                        <span>{feature.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Request Booking Button (Adds to Cart with live server-backed price) */}
                <button
                  type="button"
                  onClick={() => handleBookNow(card)}
                  aria-label={`Request ${card.name} Exam Booking Assistance`}
                  className="w-full py-3 px-4 rounded-xl bg-[#FF005C] hover:bg-[#E00052] text-white font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.99] mt-auto"
                >
                  <span>{card.button?.text && card.button.text !== 'Book Now' ? card.button.text : 'Request Booking →'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Bottom Information Trust Bar */}
        <div className="bg-white dark:bg-[#11141B] border border-neutral-100 dark:border-white/10 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 sm:gap-8 flex-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFF0F5] dark:bg-[#FF005C]/10 text-[#FF005C] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="text-left leading-snug">
                <div className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white">
                  Authorized Pearson
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Test Centre Booking Assistance
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFF0F5] dark:bg-[#FF005C]/10 text-[#FF005C] flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="text-left leading-snug">
                <div className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white">
                  Slot Selection Assistance
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Across India
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFF0F5] dark:bg-[#FF005C]/10 text-[#FF005C] flex items-center justify-center shrink-0">
                <Headphones className="w-5 h-5" />
              </div>
              <div className="text-left leading-snug">
                <div className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white">
                  Dedicated Human Support
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  on WhatsApp &amp; Phone
                </div>
              </div>
            </div>
          </div>

          <Link
            href={pageContent.bottomBar?.button?.href && !pageContent.bottomBar.button.href.includes('exam-vouchers') ? pageContent.bottomBar.button.href : '/contact'}
            aria-label="Learn More About Booking Assistance"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[#FF005C] text-[#FF005C] hover:bg-[#FF005C]/5 transition-all text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer shrink-0"
          >
            <span>{pageContent.bottomBar?.button?.text && !pageContent.bottomBar.button.text.includes('Browse') ? pageContent.bottomBar.button.text : 'Learn More About Booking Assistance →'}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
