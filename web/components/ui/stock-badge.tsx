import { Clock, Flame, CheckCircle2, AlertTriangle } from 'lucide-react';
import Badge from './badge';
import type { Product } from '@/lib/types';

/** A marketing badge must never leak an inventory state to the customer. */
const STOCK_PHRASE = /out of stock|in stock|low stock|limited stock|sold out|unavailable|available on request|backorder|restock/i;

/**
 * A single status/marketing pill for a product card.
 *
 * Priority: coming soon → out of stock → promo/marketing badge → "In Stock".
 */
export default function StockBadge({ product, className = '' }: { product: Product; className?: string }) {
  const isComingSoon = product?.comingSoon || product?.stockStatus === 'COMING SOON';
  const isOutOfStock = product?.inStock === false || product?.stockStatus === 'OUT OF STOCK';
  const rawPromo = (Array.isArray(product?.badges) && product.badges[0]) || (product?.badgeEnabled !== false && product?.badge) || '';
  const promo = STOCK_PHRASE.test(String(rawPromo)) ? '' : rawPromo;

  if (isComingSoon)
    return (
      <Badge tone="info" icon={<Clock className="w-3 h-3 shrink-0" />} className={className} title="Coming Soon">
        Coming Soon
      </Badge>
    );

  if (isOutOfStock)
    return (
      <Badge tone="danger" icon={<AlertTriangle className="w-3 h-3 shrink-0" />} className={className} title="Out of Stock">
        Out of Stock
      </Badge>
    );

  if (promo) {
    const t = promo.toLowerCase();
    const tone = /best.?sell|popular|top/.test(t) ? 'warn' : /canada|express|australia|ukvi?|study abroad/.test(t) ? 'info' : 'accent';
    const icon = /best.?sell|popular/.test(t) ? <Flame className="w-3 h-3 shrink-0" /> : null;
    return (
      <Badge tone={tone} icon={icon} className={className} title={promo}>
        {promo}
      </Badge>
    );
  }

  return (
    <Badge tone="success" icon={<CheckCircle2 className="w-3 h-3 shrink-0" />} className={className} title="In Stock">
      In Stock
    </Badge>
  );
}
