'use client';

import { ShoppingCart, Clock, Lock } from 'lucide-react';
import { useCart } from '@/components/cart-provider';
import { useVoucher } from '@/components/voucher-provider';
import { Button } from '@/components/ui';
import type { Product, DurationOption } from '@/lib/types';
import { unitDisplayPrice } from '@/lib/pricing';

/**
 * Buy Now / Add to Cart — the real interactivity on the product detail page.
 */
export function BuyActions({ product, selectedDuration, size = 'lg' }: { product: Product; selectedDuration?: DurationOption | null; size?: 'md' | 'lg' }) {
  const { addToCart } = useCart();
  const { startCheckout } = useVoucher();
  const isComingSoon = product.comingSoon || product.stockStatus === 'COMING SOON';
  const productWithDuration = selectedDuration ? { ...product, selectedDuration } : product;

  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      {isComingSoon ? (
        <Button variant="disabled" size={size} disabled>
          <Clock className="w-4 h-4" /> Coming Soon
        </Button>
      ) : (
        <>
          <Button variant="primary" size={size} onClick={() => startCheckout(productWithDuration)}>
            <ShoppingCart className="w-4 h-4" /> Buy Now
          </Button>
          <Button variant="secondary" size={size} onClick={() => addToCart(productWithDuration)}>
            <ShoppingCart className="w-4 h-4" /> Add to Cart
          </Button>
        </>
      )}
    </div>
  );
}

/** Sticky mobile checkout bar. */
export function StickyMobileBar({ product, selectedDuration }: { product: Product; selectedDuration?: DurationOption | null }) {
  const { formatPrice, currency } = useCart();
  const { startCheckout } = useVoucher();
  const isComingSoon = product.comingSoon || product.stockStatus === 'COMING SOON';
  if (isComingSoon) return null;

  const { current: unitPrice, currency: itemCurrency } = unitDisplayPrice(product, selectedDuration, currency);
  const productWithDuration = selectedDuration ? { ...product, selectedDuration } : product;

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md border-t border-line px-4 py-3 flex items-center justify-between gap-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]">
      <div className="min-w-0">
        <span className="block text-[10px] font-normal text-ink-muted uppercase tracking-wider truncate">{product.name}</span>
        <span className="font-heading font-semibold text-lg text-ink">{formatPrice(unitPrice, itemCurrency)}</span>
      </div>
      <Button variant="primary" size="md" className="shrink-0" onClick={() => startCheckout(productWithDuration)}>
        <Lock className="w-3.5 h-3.5" /> Buy This Voucher
      </Button>
    </div>
  );
}