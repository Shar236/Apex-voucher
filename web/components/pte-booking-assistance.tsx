import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ShieldCheck, Calendar, Headphones, Check, Info } from 'lucide-react';
import { PearsonOfficialLogo } from '@/components/official-brand-logos';
import { formatPrice } from '@/lib/api';
import type { Product } from '@/lib/types';

const EXAM_CARDS = [
  { examType: 'PTE Academic', slug: 'pte-academic', illustration: 'pte-academic', illustrationAlt: 'PTE Academic exam booking illustration with graduation cap, passport and study materials' },
  { examType: 'PTE Core', slug: 'pte-core', illustration: 'pte-core', illustrationAlt: 'PTE Core exam booking illustration for Canada PR with maple leaf and passport' },
  { examType: 'PTE Academic UKVI', slug: 'pte-ukvi', illustration: 'pte-academic-ukvi', illustrationAlt: 'PTE Academic UKVI exam booking illustration for UK visa with London landmarks' },
] as const;

const SERVICE_FEATURES = ['Exam booking arranged for you', 'Choose preferred test centre', 'Choose preferred available date', 'Booking confirmation provided', 'Human support throughout the process'];

const getExamPricing = (slug: string, products: Product[]) => {
  const cleanSlug = slug.toLowerCase();
  const product = products.find((p) => {
    const pSlug = (p.slug || '').toLowerCase();
    const pName = (p.name || '').toLowerCase();
    if (pSlug === cleanSlug) return true;
    if (cleanSlug === 'pte-academic') return pName.includes('pte') && pName.includes('academic') && !pName.includes('ukvi');
    if (cleanSlug === 'pte-core') return pName.includes('pte') && pName.includes('core');
    if (cleanSlug === 'pte-ukvi') return pName.includes('pte') && (pName.includes('ukvi') || pSlug.includes('ukvi'));
    return false;
  });
  if (!product) return { bookingPrice: null as number | null, originalPrice: null as number | null, savings: 0, hasSavings: false };
  const bookingPrice = product.discountedPrice ?? product.sellingPrice ?? null;
  const originalPrice = product.originalPrice ?? null;
  const savings = originalPrice && bookingPrice && originalPrice > bookingPrice ? product.savings || originalPrice - bookingPrice : 0;
  return { bookingPrice, originalPrice, savings, hasSavings: Boolean(savings > 0 && originalPrice && bookingPrice) };
};

export function PTEBookingAssistance({ products }: { products: Product[] }) {
  return (
    <section id="pte-booking-service" className="py-12 sm:py-16 bg-surface-raised border-b border-line transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-2">
          <div className="inline-flex items-center mb-3">
            <PearsonOfficialLogo className="h-8 sm:h-10 w-auto dark:brightness-0 dark:invert" />
            <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-[#FFF0F5] text-[#FF005C] dark:bg-[#FF005C]/10 dark:text-[#FF005C]">PTE EXAM BOOKING</span>
          </div>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl lg:text-[42px] leading-tight text-neutral-900 dark:text-white tracking-tight">
            Get Your <span className="text-[#FF005C]">PTE Exam</span> Booked.
          </h2>
          <p className="mt-1.5 text-sm sm:text-base font-normal text-neutral-600 dark:text-neutral-400">Simple booking. Better pricing. Zero hassle.</p>
        </div>

        <div className="w-full max-w-4xl mx-auto mt-5 mb-8 p-3 rounded-2xl bg-[#FFF5F7] dark:bg-[#FF005C]/10 border border-[#FFE0E8] dark:border-[#FF005C]/20 flex items-center justify-center gap-2 text-center text-xs sm:text-sm text-neutral-700 dark:text-neutral-200">
          <Info className="w-4 h-4 text-[#FF005C] shrink-0" />
          <span className="font-bold text-[#FF005C] uppercase tracking-wider text-[11px] sm:text-xs">BOOKING SERVICE ONLY</span>
          <span className="font-normal">This service is only for booking your PTE exam. No PTE voucher, voucher code, or voucher credit is included.</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 items-stretch">
          {EXAM_CARDS.map((card) => {
            const pricing = getExamPricing(card.slug, products);
            return (
              <div key={card.slug} className="flex flex-col h-full rounded-2xl bg-white dark:bg-[#11141B] border border-neutral-100 dark:border-white/10 p-5 shadow-sm hover:shadow-md transition-all duration-300 justify-between">
                <div>
                  <div className="w-full h-44 sm:h-48 rounded-xl overflow-hidden mb-4 bg-neutral-50 dark:bg-neutral-900/40 flex items-center justify-center relative">
                    <Image src={card.illustration} alt={card.illustrationAlt} fill sizes="(max-width: 640px) 90vw, 380px" loading="lazy" className="object-cover object-center" />
                  </div>

                  <div className="mb-3">
                    <h3 className="font-heading font-bold text-xl text-neutral-900 dark:text-white leading-snug">{card.examType}</h3>
                    <span className="inline-block text-xs font-bold uppercase tracking-wider text-[#FF005C] mt-0.5">EXAM BOOKING SERVICE</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-neutral-50/80 dark:bg-white/[0.04] border border-neutral-100 dark:border-white/10 mb-4 min-h-[82px] flex flex-col justify-center">
                    <span className="text-xs font-semibold text-[#FF005C] block mb-1">Special Booking Price</span>
                    {pricing.bookingPrice != null ? (
                      <div>
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
                          <span className="font-heading font-bold text-2xl text-neutral-900 dark:text-white tracking-tight">{formatPrice(pricing.bookingPrice)}</span>
                          {pricing.hasSavings && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/80">SAVE {formatPrice(pricing.savings)}</span>}
                        </div>
                        {pricing.hasSavings && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            Standard Exam Price: <span className="line-through text-neutral-400 dark:text-neutral-500">{formatPrice(pricing.originalPrice)}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
                          <span className="font-heading font-bold text-2xl text-neutral-900 dark:text-white tracking-tight">₹14,499</span>
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">Assisted slot reservation service</div>
                      </div>
                    )}
                  </div>

                  <ul className="space-y-2 text-xs text-neutral-600 dark:text-neutral-300 font-normal mb-5">
                    {SERVICE_FEATURES.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2.5} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link href={`/exam-booking?exam=${card.slug}`} aria-label={`Book ${card.examType} Exam`} className="w-full py-3 px-4 rounded-xl bg-[#FF005C] hover:bg-[#E00052] text-white font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.99] mt-auto">
                  <span>Book Now</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            );
          })}
        </div>

        <div className="bg-white dark:bg-[#11141B] border border-neutral-100 dark:border-white/10 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 sm:gap-8 flex-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFF0F5] dark:bg-[#FF005C]/10 text-[#FF005C] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="text-left leading-snug">
                <div className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white">Authorized Pearson</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">Test Centre Booking</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFF0F5] dark:bg-[#FF005C]/10 text-[#FF005C] flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="text-left leading-snug">
                <div className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white">Slot Selection Assistance</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">Across India</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFF0F5] dark:bg-[#FF005C]/10 text-[#FF005C] flex items-center justify-center shrink-0">
                <Headphones className="w-5 h-5" />
              </div>
              <div className="text-left leading-snug">
                <div className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white">Dedicated Human Support</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">on WhatsApp &amp; Phone</div>
              </div>
            </div>
          </div>

          <Link href="/exam-vouchers" aria-label="Browse all available PTE vouchers" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[#FF005C] text-[#FF005C] hover:bg-[#FF005C]/5 transition-all text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer shrink-0">
            <span>Browse PTE Vouchers</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
