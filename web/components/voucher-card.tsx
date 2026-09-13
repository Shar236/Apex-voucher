'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, ShoppingCart, Compass } from 'lucide-react';
import { useCart } from '@/components/cart-provider';
import { useVoucher } from '@/components/voucher-provider';
import { Button, StockBadge, PriceDisplay, DiscountBadge, ProviderLogo } from '@/components/ui';
import type { Product, DurationOption } from '@/lib/types';
import { unitDisplayPrice, calculateDiscountPercent } from '@/lib/pricing';

/** The single voucher card used on every product surface (grids, best-sellers, related rows). */
export function VoucherCard({ product }: { product: Product }) {
  const { formatPrice, addToCart, currency } = useCart();
  const { startCheckout } = useVoucher();
  const detailHref = `/exam-vouchers/${product.slug || product._id || product.id}`;

  const enabledDurations = useMemo(
    () => (product.durationOptions || []).filter((o) => o.enabled !== false),
    [product.durationOptions]
  );
  const [selectedDuration, setSelectedDuration] = useState<DurationOption | null>(
    enabledDurations.length > 0 ? enabledDurations[0] : null
  );

  const activeSelectedDuration =
    selectedDuration && enabledDurations.some((o) => o.key === selectedDuration.key)
      ? selectedDuration
      : (enabledDurations.length > 0 ? enabledDurations[0] : null);

  // Derive price from the selected duration, otherwise from the product base.
  const priced = unitDisplayPrice(product, activeSelectedDuration, currency);
  const current = priced.current;
  const original = priced.original;
  const discountPercent = calculateDiscountPercent(original, current);
  const savings = Math.max(0, original - current);

  // Build a product-with-duration to pass to cart/checkout.
  const productWithDuration = useMemo(
    () => (activeSelectedDuration ? {
      ...product,
      selectedDuration: activeSelectedDuration,
      sellingPrice: activeSelectedDuration.sellingPrice || product.sellingPrice,
      originalPrice: activeSelectedDuration.originalPrice || product.originalPrice || activeSelectedDuration.sellingPrice,
      discountedPrice: activeSelectedDuration.sellingPrice || product.discountedPrice || product.sellingPrice,
    } : product),
    [product, activeSelectedDuration]
  );

  // Validity label derived from the selected duration (the shared bar prefers validityMonths/validity).
  const durationValidity = activeSelectedDuration
    ? activeSelectedDuration.validityDays >= 30 && activeSelectedDuration.validityDays % 30 === 0
      ? `Valid ${activeSelectedDuration.validityDays / 30} Month${activeSelectedDuration.validityDays / 30 === 1 ? '' : 's'}`
      : `Valid ${activeSelectedDuration.validityDays} Days`
    : null;

  const isComingSoon = product.comingSoon || product.stockStatus === 'COMING SOON';
  const canBuyNow = !isComingSoon;

  const validityLabel = durationValidity || (product.validityMonths
    ? `Valid ${product.validityMonths} Month${product.validityMonths === 1 ? '' : 's'}`
    : product.validity || 'Valid 6 Months');

  return (
    <div
      className={[
        'group relative flex flex-col h-full rounded-xl overflow-hidden',
        'bg-surface border border-line',
        'shadow-[0_1px_3px_rgba(15,20,35,0.04)]',
        'dark:shadow-[0_1px_3px_rgba(0,0,0,0.4),0_10px_30px_-18px_rgba(0,0,0,0.7)]',
        'transition-all duration-200 hover:border-accent/40 hover:-translate-y-1',
        isComingSoon ? 'opacity-92' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4 min-w-0">
        <div className="min-w-0 flex-1 flex items-center">
          <StockBadge product={product} />
        </div>
        <span className="text-[11px] font-medium text-ink-muted text-right whitespace-nowrap shrink-0">
          {validityLabel}
        </span>
      </div>

      <div className="mx-4 mt-4 flex h-20 items-center justify-center rounded-xl border border-line bg-surface-raised px-3 py-2">
        <ProviderLogo product={product} size="md" />
      </div>

      <div className="px-4 pt-4">
        <Link href={detailHref} className="block font-heading text-[17px] font-normal leading-snug text-ink line-clamp-2 hover:text-accent transition-colors">
          {product.name}
        </Link>
        <p className="mt-2 min-h-10 text-[12px] font-normal leading-relaxed text-ink-muted line-clamp-2">
          {product.shortDescription || product.description || 'Official exam voucher with instant digital delivery.'}
        </p>
      </div>

      <div className="mx-4 mt-4 border-t border-line" />

      {/* Duration selector */}
      {enabledDurations.length > 1 && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-1 rounded-xl bg-neutral-100 dark:bg-[#262626] p-1">
            {enabledDurations.map((opt) => {
              const isActive = activeSelectedDuration?.key === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSelectedDuration(opt)}
                  aria-pressed={isActive}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                    isActive ? 'bg-white dark:bg-[#161616] shadow-sm text-accent' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-4 pt-3 flex items-end justify-between gap-2">
        <PriceDisplay original={original} current={current} formatPrice={(n) => formatPrice(n, priced.currency)} emphasis="ink" />
        <DiscountBadge percent={discountPercent} savings={savings} formatPrice={(n) => formatPrice(n, priced.currency)} />
      </div>

      <div className="px-4 pt-4 pb-4 mt-auto space-y-2">
        {isComingSoon ? (
          <Button variant="disabled" size="md" fullWidth disabled>
            Coming Soon
          </Button>
        ) : (
          <Button variant="primary" size="md" fullWidth onClick={() => startCheckout(productWithDuration)}>
            <ShoppingCart className="w-4 h-4" />
            Buy Now
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        )}

        <Button as={Link} href={detailHref} variant="secondary" size="sm" fullWidth>
          <Compass className="w-3.5 h-3.5" />
          Explore More
        </Button>

        {canBuyNow && (
          <Button variant="ghost" size="sm" fullWidth onClick={() => addToCart(productWithDuration)}>
            <ShoppingCart className="w-3.5 h-3.5" />
            Add to Cart
          </Button>
        )}
      </div>
    </div>
  );
}
