import Link from 'next/link';
import { ArrowRight, ShieldCheck, Zap, Tag, Headphones, LayoutGrid } from 'lucide-react';
import { VoucherCard } from '@/components/voucher-card';
import type { Product } from '@/lib/types';

const isPTE = (p: Product) => {
  const haystack = `${p.name || ''} ${p.brand || ''} ${p.provider || ''} ${p.category || ''}`.toLowerCase();
  const isPteFamily = haystack.includes('pte') || haystack.includes('aps test') || haystack.includes('ptai');
  return isPteFamily && !haystack.includes('gre') && !haystack.includes('toefl');
};

const FEATURES = [
  { icon: Zap, title: 'Instant Digital Delivery', subtitle: 'Get voucher in 10 seconds' },
  { icon: ShieldCheck, title: '100% Genuine Vouchers', subtitle: 'Official exam partners' },
  { icon: Tag, title: 'Best Prices Guaranteed', subtitle: 'Save more on every purchase' },
  { icon: Headphones, title: '24/7 Customer Support', subtitle: "We're here to help you" },
];

/** The "PTE Vouchers" homepage section — a curated slice of the full catalog (see /exam-vouchers for all products). */
export function FeaturedVouchers({ products }: { products: Product[] }) {
  const activeProducts = products.filter((p) => p.active !== false && !p.archived);
  const pteProducts = activeProducts.filter(isPTE).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  if (pteProducts.length === 0) return null;

  return (
    <section id="vouchers" className="py-16 sm:py-24 bg-[#0B0D12] text-white border-b border-white/5 transition-colors duration-300 scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 shadow-sm text-xs font-normal text-neutral-200">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <span>TRUSTED BY 15,000+ STUDENTS</span>
          </div>
          <h2 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-light text-white tracking-tight">
            PTE <span className="text-accent">Vouchers</span>
          </h2>
          <p className="text-neutral-400 font-medium text-base sm:text-lg">Choose the right PTE option for your test preparation, study or eligible pathway.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {FEATURES.map((feat) => {
            const IconComp = feat.icon;
            return (
              <div key={feat.title} className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center gap-3.5 shadow-md">
                <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                  <IconComp className="w-5 h-5" />
                </div>
                <div className="flex flex-col text-left leading-snug">
                  <span className="text-xs font-medium text-white">{feat.title}</span>
                  <span className="text-[11px] font-medium text-neutral-400">{feat.subtitle}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 mb-12 items-stretch">
          {pteProducts.map((product) => (
            <VoucherCard key={product._id || product.id} product={product} />
          ))}
        </div>

        <div className="text-center">
          <Link href="/exam-vouchers" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white font-medium text-xs px-7 py-3.5 rounded-full border border-white/10 transition-colors cursor-pointer shadow-md">
            <LayoutGrid className="w-4 h-4 text-accent" />
            <span>Explore All Vouchers</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
