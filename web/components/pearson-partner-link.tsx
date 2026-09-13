import { ExternalLink, ShieldCheck } from 'lucide-react';

/**
 * Official Pearson PTE Registered Partner verification page.
 * Single source of truth — every PTE product links here.
 */
export const PEARSON_REGISTERED_PARTNER_URL =
  'https://in.pearson.com/assessment-platform/pearson-test-of-english/partners/registered-partner.html';

/**
 * True when a product belongs to the Pearson PTE family (Academic, Core,
 * Academic UKVI, Canada, Practice Test, …). Same provider-family matching
 * approach as lib/redemption-guides.ts — no per-product name checks.
 */
export function isPearsonPteProduct(p: { provider?: string; brand?: string; name?: string; category?: string }): boolean {
  return /pearson|\bpte\b/i.test(`${p.provider ?? ''} ${p.brand ?? ''} ${p.name ?? ''} ${p.category ?? ''}`);
}

/**
 * Compact, non-disruptive "Official Pearson Registered Partner" link for the
 * product information area on PTE product pages. Opens Pearson in a new tab.
 */
export function PearsonPartnerLink() {
  return (
    <a
      href={PEARSON_REGISTERED_PARTNER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 self-start rounded-full border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent/40 hover:text-accent"
    >
      <ShieldCheck className="w-3.5 h-3.5 text-accent shrink-0" />
      <span>Official Pearson Registered Partner</span>
      <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
    </a>
  );
}
