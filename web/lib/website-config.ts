import { apiBase } from './api';
import { getSessionCurrency, currencyDisplayHeaders } from './currency-server';
import type { Product } from './types';
import type { ActiveCampaign, BenefitCard, HeroSettings } from '@/components/hero/hero-section';

export interface FooterSettings {
  description?: string;
  phone?: string;
  email?: string;
  copyright?: string;
}

export interface AnnouncementSettings {
  enabled?: boolean;
  text?: string;
  /** When an active campaign exists, the campaign banner replaces this strip. */
  overrideWithCampaign?: boolean;
  /** Where the strip links to (only rendered when a link is set). */
  link?: string;
}

export interface GlobalSeo {
  websiteName?: string;
  defaultSeoTitle?: string;
  defaultMetaDescription?: string;
  defaultOgImage?: string;
  websiteUrl?: string;
  organizationName?: string;
  organizationLogo?: string;
}

export interface WebsiteConfig {
  success: boolean;
  activeCampaign: ActiveCampaign | null;
  heroSettings: HeroSettings;
  announcementSettings: AnnouncementSettings;
  benefitCards: BenefitCard[];
  footerSettings: FooterSettings;
  globalSEO: GlobalSeo;
  structuredData: { organization: Record<string, unknown>; website: Record<string, unknown> };
  products: Product[];
}

const FALLBACK: WebsiteConfig = {
  success: false,
  activeCampaign: null,
  heroSettings: {},
  announcementSettings: { enabled: true, text: '⚡ Instant Voucher Delivery in 10s • 100% Genuine Official Vouchers' },
  benefitCards: [],
  footerSettings: {},
  globalSEO: {},
  structuredData: { organization: {}, website: {} },
  products: [],
};

/**
 * The storefront's single bootstrap fetch (backend/controllers/productController.js
 * getWebsiteConfig) — hero/announcement/footer CMS settings, the active campaign,
 * global SEO defaults, and the full live product catalog in one call. Used by both
 * the root layout (Navbar/Footer settings) and the homepage; Next.js dedupes
 * identical fetches within a single render pass, so this only hits the API once
 * per request despite being called from two places.
 */
const isDev = process.env.NODE_ENV === 'development';

export async function getWebsiteConfig(): Promise<WebsiteConfig> {
  try {
    // Forward the session display currency (short-lived cookie) so the backend
    // hydrates product prices in the SAME currency the visitor already saw —
    // no currency flipping mid-session. Display-only: payments re-detect.
    const currency = await getSessionCurrency();
    const qs = currency ? `?currency=${encodeURIComponent(currency)}` : '';
    const res = await fetch(`${apiBase()}/api/products/website-config${qs}`, {
      ...(currency ? { headers: currencyDisplayHeaders(currency) } : {}),
      next: { revalidate: isDev ? 0 : 300, tags: ['website-config', 'products'] },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as WebsiteConfig;
    return { ...FALLBACK, ...data };
  } catch {
    return FALLBACK;
  }
}
