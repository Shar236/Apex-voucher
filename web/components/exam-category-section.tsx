'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ThemedBrandLogo } from '@/components/ui/themed-brand-logo';
import { SectionHeading, Badge, Button } from '@/components/ui';
import { formatPrice } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { unitDisplayPrice } from '@/lib/pricing';
import type { Product } from '@/lib/types';

const CATEGORIES = [
  { id: 'pte', searchKey: 'pte', name: 'PTE Voucher', fullName: 'Pearson PTE Academic & Core', desc: 'Save more on your PTE Academic & PTE Core exam booking.', validity: 'Valid 6 Months', badge: 'Most Popular', featured: true },
  { id: 'ielts', searchKey: 'ielts', name: 'IELTS Voucher', fullName: 'IELTS Academic & General', desc: 'Exclusive discount codes for official IELTS test registration.', validity: 'Valid 12 Months', badge: 'Best Value', featured: false },
  { id: 'toefl', searchKey: 'toefl', name: 'TOEFL Voucher', fullName: 'ETS TOEFL iBT Test', desc: 'Save on TOEFL iBT, accepted by universities worldwide.', validity: 'Valid 12 Months', badge: 'Max Discount', featured: false },
  { id: 'duolingo', searchKey: 'duolingo', name: 'Duolingo Test Voucher', fullName: 'Duolingo English Test Coupon', desc: 'Fast digital delivery with instant coupon savings.', validity: 'Valid 90 Days', badge: 'Fast Results', featured: false },
];

export function ExamCategorySection({ products }: { products: Product[] }) {
  const { currency } = useCurrency();

  return (
    <section id="choose-your-exam" className="py-16 sm:py-24 bg-surface border-b border-line transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Choose your exam" title="Save on your English test booking" subtitle="Select your test and get genuine vouchers at exclusive prices." className="mb-14" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          {CATEGORIES.map((cat) => {
            const matchingProducts = products.filter((p) => {
              const key = cat.searchKey.toLowerCase();
              const haystack = `${p.name || ''} ${p.brand || ''} ${p.provider || ''} ${p.slug || ''}`.toLowerCase();
              return haystack.includes(key);
            });

            // Prioritize genuine Exam Vouchers so practice tests or mock AI tools are not chosen as the main voucher
            const examVouchers = matchingProducts.filter((p) => {
              const catLower = (p.category || '').toLowerCase();
              return catLower.includes('voucher') || catLower === 'exam voucher';
            });

            const pool = examVouchers.length > 0 ? examVouchers : matchingProducts;
            const sortedCandidates = [...pool].sort((a, b) => (a.sellingPrice || 0) - (b.sellingPrice || 0));
            const target = sortedCandidates[0] || products[0];
            const priced = target ? unitDisplayPrice(target, undefined, currency) : { current: 15499, original: 18900, currency };
            const price = priced.current;
            const savings = Math.max(0, priced.original - priced.current);
            const itemCurrency = priced.currency;
            const href = target ? `/exam-vouchers/${target.slug}` : '/exam-vouchers';

            return (
              <div key={cat.id} className={['group relative flex flex-col rounded-2xl p-6 transition-all duration-200', 'bg-surface border', cat.featured ? 'border-accent ring-1 ring-accent/30 shadow-sm' : 'border-line hover:border-accent/45 hover:-translate-y-1'].join(' ')}>
                <div className="flex items-center justify-between mb-4">
                  <Badge tone={cat.featured ? 'accent' : 'neutral'}>{cat.badge}</Badge>
                  <span className="text-[11px] font-normal text-ink-muted">{cat.validity}</span>
                </div>

                <div className="rounded-xl mb-4 h-20 flex items-center justify-center bg-surface-raised border border-line">
                  <ThemedBrandLogo brand={cat.searchKey} name={cat.fullName} className="h-9" />
                </div>

                <h3 className="font-heading font-normal text-lg leading-snug text-ink">{cat.name}</h3>
                <p className="mt-1.5 text-xs font-normal leading-relaxed text-ink-muted flex-1">{cat.desc}</p>

                <div className="mt-5 pt-4 border-t border-line space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block text-[10px] uppercase tracking-[0.08em] font-medium text-ink-muted">Starting from</span>
                      <span className="font-heading font-semibold text-xl text-ink">{formatPrice(price, itemCurrency)}</span>
                    </div>
                    {savings > 0 && <span className="shrink-0 px-2 py-0.5 rounded-md bg-success/12 text-success border border-success/20 text-[11px] font-medium whitespace-nowrap">Save {formatPrice(savings, itemCurrency)}</span>}
                  </div>

                  <Button as={Link} href={href} variant={cat.featured ? 'primary' : 'secondary'} size="md" fullWidth>
                    View {cat.name}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
