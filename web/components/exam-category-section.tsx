'use client';

import { SectionHeading } from '@/components/ui';
import { ProductCarousel } from '@/components/product-carousel';
import type { Product } from '@/lib/types';

export function ExamCategorySection({ products }: { products: Product[] }) {
  const activeProducts = products
    .filter((p) => p.active !== false && !p.archived)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  if (activeProducts.length === 0) return null;

  return (
    <section id="choose-your-exam" className="py-16 sm:py-24 bg-surface border-b border-line transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Choose your exam" title="Save on your English test booking" subtitle="Select your test and get genuine vouchers at exclusive prices." className="mb-14" />
        <ProductCarousel products={activeProducts} />
      </div>
    </section>
  );
}
