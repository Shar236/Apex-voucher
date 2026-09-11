'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Play, Tag, Award, Mail, Calendar, Headphones, Star } from 'lucide-react';
import { HeroTrioVisual } from './hero-trio-visual';
import { Button } from '@/components/ui';

export interface HeroSettings {
  headingLine1?: string;
  headingHighlight?: string;
  headingLine3?: string;
  descriptionText?: string;
  ctaText?: string;
  ctaLink?: string;
}

export interface ActiveCampaign {
  badgeText?: string;
  title?: string;
  subtitle?: string;
  ctaText?: string;
  showCountdown?: boolean;
  endDate?: string;
}

export interface BenefitCard {
  icon?: string;
  title?: string;
  label?: string;
  sub?: string;
}

function CampaignCountdownTimer({ endDate }: { endDate?: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!endDate) return;
    const calc = () => {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / 1000 / 60) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [endDate]);

  const neutralChip = 'bg-surface-sunken text-ink border border-line px-1.5 py-0.5 rounded';
  const accentChip = 'bg-accent text-white px-1.5 py-0.5 rounded';

  return (
    <div className="inline-flex items-center gap-2 text-xs font-medium text-ink bg-surface px-3.5 py-1.5 rounded-full border border-accent/30 shadow-sm">
      <span className="text-accent">🔥 Offer Ends In:</span>
      <div className="flex items-center gap-1 font-mono text-xs">
        <span className={accentChip}>{String(timeLeft.days).padStart(2, '0')}d</span>
        <span>:</span>
        <span className={neutralChip}>{String(timeLeft.hours).padStart(2, '0')}h</span>
        <span>:</span>
        <span className={neutralChip}>{String(timeLeft.minutes).padStart(2, '0')}m</span>
        <span>:</span>
        <span className={accentChip}>{String(timeLeft.seconds).padStart(2, '0')}s</span>
      </div>
    </div>
  );
}

const DEFAULT_BENEFITS: Required<BenefitCard>[] = [
  { icon: '🏷️', label: 'Best Prices', sub: 'Guaranteed', title: '' },
  { icon: '⚡', label: 'Instant Delivery', sub: 'in 10 Seconds', title: '' },
  { icon: '🛡️', label: '100% Official', sub: 'Vouchers', title: '' },
  { icon: '🔒', label: 'Secure Payments', sub: '& Safe Checkout', title: '' },
];

const TRUST_BAR = [
  { icon: Award, title: 'Official Exam Partners', sub: '100% Genuine Vouchers' },
  { icon: Mail, title: 'Instant Email Delivery', sub: 'Get in 10 Seconds' },
  { icon: Calendar, title: 'Valid for 6-24 Months', sub: 'Long Validity' },
  { icon: Tag, title: 'No Hidden Charges', sub: 'What You See is What You Pay' },
  { icon: Headphones, title: '24/7 Customer Support', sub: "We're Here to Help" },
  { icon: Star, title: '4.8/5 Rating', sub: 'From 15,000+ Students' },
];

export function HeroSection({
  heroSettings,
  activeCampaign,
  benefitCards,
}: {
  heroSettings?: HeroSettings;
  activeCampaign?: ActiveCampaign | null;
  benefitCards?: BenefitCard[];
}) {
  const heading1 = heroSettings?.headingLine1 || 'Your Exam. Your Dream.';
  const headingHighlight = heroSettings?.headingHighlight || 'Our Vouchers.';
  const heading3 = heroSettings?.headingLine3 || 'Your Savings.';
  const descriptionText = heroSettings?.descriptionText || 'Get official voucher codes for PTE, IELTS, TOEFL & Duolingo at the best prices and save more on your exam fees.';
  const mainCtaText = activeCampaign?.ctaText || heroSettings?.ctaText || 'Browse Vouchers';
  // Admin-configurable target — previously saved but never rendered (the CTA
  // always hardcoded /exam-vouchers). Falls back to the catalog page.
  const rawCtaHref = heroSettings?.ctaLink?.trim();
  const mainCtaHref =
    rawCtaHref && !['/#vouchers', '#vouchers', '/', ''].includes(rawCtaHref) && (rawCtaHref.startsWith('/') || /^https?:\/\//.test(rawCtaHref))
      ? rawCtaHref
      : '/exam-vouchers';

  const displayBenefits =
    Array.isArray(benefitCards) && benefitCards.length > 0
      ? benefitCards.map((b, idx) => ({
          icon: b.icon && b.icon.length <= 4 ? b.icon : DEFAULT_BENEFITS[idx % 4]?.icon || '🎟️',
          label: b.title || b.label || DEFAULT_BENEFITS[idx % 4]?.label,
          sub: b.sub || DEFAULT_BENEFITS[idx % 4]?.sub || '',
        }))
      : DEFAULT_BENEFITS;

  return (
    <section className="relative overflow-hidden bg-linear-to-b from-surface-raised via-surface to-surface-raised dark:from-[#0A0B12] dark:via-[#08090E] dark:to-[#0A0B12] pt-8 lg:pt-14 pb-16 border-b border-line transition-colors duration-300">
      <div className="absolute top-0 right-1/4 w-150 h-150 bg-accent/5 dark:bg-accent/12 rounded-full blur-3xl pointer-events-none -translate-y-1/2" />
      <div className="hidden dark:block absolute -bottom-24 left-[6%] w-136 h-136 rounded-full bg-[#5D3FD3]/14 blur-[130px] pointer-events-none" />
      <div className="hidden dark:block absolute inset-0 pointer-events-none bg-[radial-gradient(120%_120%_at_50%_35%,transparent_45%,rgba(4,5,9,0.55)_100%)]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-center">
          <div className="lg:col-span-7 space-y-6">
            {activeCampaign ? (
              <div className="p-4 sm:p-5 rounded-3xl bg-accent/6 border border-accent/25 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent text-white font-medium text-xs uppercase tracking-wider shadow-sm">
                    {activeCampaign.badgeText || '🇮🇳 SPECIAL CAMPAIGN'}
                  </span>
                  {activeCampaign.showCountdown !== false && <CampaignCountdownTimer endDate={activeCampaign.endDate} />}
                </div>
                <div>
                  <h2 className="font-heading text-xl sm:text-2xl font-normal text-ink leading-tight">{activeCampaign.title || '50% OFF EXAM VOUCHERS'}</h2>
                  <p className="text-sm font-normal text-accent mt-0.5">{activeCampaign.subtitle || 'Limited period promotional offer'}</p>
                </div>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/8 border border-accent/20 text-xs font-medium text-accent">
                <span>🎟️</span>
                <span>Save on Exam Fees with Apex Vouchers</span>
              </div>
            )}

            <h1 className="font-heading font-light text-4xl sm:text-5xl lg:text-6xl leading-[1.08] text-ink tracking-tight">
              {heading1} <br />
              <span className="text-accent">{headingHighlight}</span> <br />
              {heading3}
            </h1>

            <p className="text-ink-muted font-normal text-base sm:text-lg leading-relaxed max-w-xl">{descriptionText}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {displayBenefits.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2.5 bg-surface p-2.5 px-3 rounded-2xl border border-line shadow-sm">
                  <span className="text-base">{item.icon}</span>
                  <div className="flex flex-col text-left leading-none">
                    <span className="text-xs font-medium text-ink">{item.label}</span>
                    {item.sub && <span className="text-[10px] font-normal text-ink-muted mt-0.5">{item.sub}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button as={Link} href={mainCtaHref} variant="primary" size="lg">
                <span>{mainCtaText}</span>
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button as={Link} href="/#how-it-works" variant="secondary" size="lg">
                <Play className="w-4 h-4 fill-current" />
                <span>How It Works</span>
              </Button>
            </div>
          </div>

          <div className="lg:col-span-5 flex justify-center">
            <HeroTrioVisual />
          </div>
        </div>

        <div className="mt-12 bg-surface rounded-3xl p-5 border border-line shadow-sm grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {TRUST_BAR.map((item, idx) => {
            const IconComp = item.icon;
            return (
              <div key={idx} className="flex items-center gap-3 p-1">
                <div className="w-10 h-10 rounded-2xl bg-accent/8 text-accent flex items-center justify-center shrink-0">
                  <IconComp className="w-5 h-5" />
                </div>
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-xs font-medium text-ink">{item.title}</span>
                  <span className="text-[10px] font-normal text-ink-muted mt-0.5">{item.sub}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
