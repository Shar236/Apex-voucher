export interface ProductSeo {
  title?: string;
  description?: string;
  slug?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  noindex?: boolean;
  nofollow?: boolean;
}

/** One guide-step screenshot stored on the product (Cloudinary). */
export interface GuideScreenshot {
  url?: string;
  publicId?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}

/** One admin-authored redemption step for a specific product. */
export interface RedemptionStep {
  _id?: string;
  order?: number;
  title?: string;
  description?: string;
  screenshot?: GuideScreenshot;
  importantNote?: string;
  videoUrl?: string;
}

/** Product-specific "How to Redeem" content (data-driven, see redemption-guides.ts). */
export interface RedemptionGuide {
  enabled?: boolean;
  providerLabel?: string;
  officialUrl?: string;
  buttonText?: string;
  introduction?: string;
  steps?: RedemptionStep[];
  warnings?: string[];
  lastUpdated?: string;
}

/** One admin-authored purchase step for a specific product. */
export interface PurchaseStep {
  _id?: string;
  order?: number;
  title?: string;
  description?: string;
  screenshot?: GuideScreenshot;
  ctaText?: string;
  ctaUrl?: string;
}

/** Product-specific "How to Purchase" content (data-driven, see purchase-guide.ts). */
export interface PurchaseGuide {
  enabled?: boolean;
  eyebrow?: string;
  title?: string;
  description?: string;
  steps?: PurchaseStep[];
  lastUpdated?: string;
}

/** Product-specific long-form "About This Product" rich content. */
export interface ProductContent {
  enabled?: boolean;
  heading?: string;
  content?: string;
}

export interface InfoRow {
  label?: string;
  value?: string;
}

/** A selectable duration/plan variant of a product (e.g. APS Test: 1 Week / 1 Month). */
export interface DurationOption {
  key: '1-week' | '1-month' | '3-months' | string;
  label: string;
  sellingPrice: number;
  originalPrice: number;
  validityDays: number;
  enabled?: boolean;
  // Server-converted display prices (USD for international visitors; equal to
  // sellingPrice/originalPrice when the display currency is INR).
  displaySellingPrice?: number;
  displayOriginalPrice?: number;
  displayCurrency?: 'INR' | 'USD';
  inr?: { displayPrice?: number; displaySellingPrice?: number; displayOriginalPrice?: number };
  usd?: { displayPrice?: number; displaySellingPrice?: number; displayOriginalPrice?: number } | null;
}

/** The hydrated product shape returned by the backend (backend/controllers/productController.js applyAvailability). */
export interface Product {
  _id: string;
  id?: string;
  name: string;
  slug: string;
  brand?: string;
  provider?: string;
  category?: string;
  voucherType?: string;
  shortDescription?: string;
  description?: string;
  richDescription?: string;
  logo?: string;
  image?: string;
  originalPrice: number;
  sellingPrice: number;
  discountedPrice?: number;
  discountPercent?: number;
  savings?: number;
  // ── Server-computed display pricing (backend/services/pricing.js) ────────
  // INR is the base price; `pricing.displayPrice` is already converted to the
  // visitor's display currency. The browser NEVER converts currencies itself.
  pricing?: {
    currency: 'INR' | 'USD';
    displayPrice: number;
    displayOriginalPrice?: number;
    basePriceINR: number;
    countryCode?: string | null;
    inr?: { displayPrice: number; displayOriginalPrice?: number };
    usd?: { displayPrice: number; displayOriginalPrice?: number } | null;
  };
  comingSoon?: boolean;
  stockType?: 'LIMITED' | 'UNLIMITED';
  stockStatus?: string;
  inStock?: boolean;
  availableStock?: number | null;
  availability?: number | null;
  validityMonths?: number;
  validityDays?: number;
  validity?: string;
  deliveryType?: string;
  badge?: string;
  badgeEnabled?: boolean;
  badges?: string[];
  rating?: number;
  reviewsCount?: number;
  featured?: boolean;
  displayOrder?: number;
  active?: boolean;
  archived?: boolean;
  durationOptions?: DurationOption[];
  /** Selected duration variant (carried by the cart/checkout payload, not stored on the product). */
  selectedDuration?: DurationOption | null;
  faqs?: Array<{ question: string; answer: string }>;
  relatedProducts?: string[] | Product[];
  seo?: ProductSeo;
  inclusions?: string[];
  features?: string[];
  /** Legacy free-text redemption steps — fallback only; superseded by redemptionGuide. */
  redemptionSteps?: string[];
  redemptionGuide?: RedemptionGuide;
  purchaseGuide?: PurchaseGuide;
  productContent?: ProductContent;
  importantInfo?: InfoRow[];
  importantNotes?: string[];
  officialWebsiteUrl?: string;
  officialProductUrl?: string;
}

// ── PTE Exam Booking (storefront booking service cards) ─────────────────────

export interface PTEBookingFeature {
  text: string;
  enabled: boolean;
}

export interface PTEBookingButton {
  text: string;
  href: string;
  visible: boolean;
  enabled: boolean;
}

export interface PTEBookingPricing {
  bookingPrice: number;
  standardPrice: number;
  currency: 'INR' | 'USD';
  showStandardPrice: boolean;
  showSavingsBadge: boolean;
}

/** The public payload shape served by GET /api/pte-booking-catalog. */
export interface PTEBookingProduct {
  _id: string;
  key: string;
  name: string;
  shortDescription?: string;
  serviceLabel?: string;
  badgeText?: string;
  badgeTint?: string;
  image?: string;
  imageAlt?: string;
  pricing: PTEBookingPricing;
  features: PTEBookingFeature[];
  button: PTEBookingButton;
  displayOrder?: number;
}

export interface PTEBookingPageContent {
  brand?: { showPearsonLogo?: boolean; badgeText?: string };
  hero?: { heading?: string; highlight?: string; subtitle?: string };
  notice?: { enabled?: boolean; title?: string; description?: string };
  bottomBar?: {
    cards?: Array<{ title?: string; description?: string; icon?: string }>;
    button?: { text?: string; href?: string; visible?: boolean };
  };
}

export interface PTEBookingCatalog {
  success: boolean;
  products: PTEBookingProduct[];
  page: PTEBookingPageContent;
}

/** Admin document shape (adds status/active/audit fields, never public). */
export interface AdminPTEBookingProduct extends PTEBookingProduct {
  status?: 'draft' | 'published';
  active?: boolean;
  imagePublicId?: string;
  createdAt?: string;
  updatedAt?: string;
  auditHistory?: Array<{
    action: string;
    adminEmail?: string;
    timestamp?: string;
    changes?: Record<string, unknown>;
  }>;
}

export interface AdminPTEBookingConfig {
  status?: 'draft' | 'published';
  content?: PTEBookingPageContent;
  updatedBy?: string;
  updatedAt?: string;
  auditHistory?: Array<{
    action: string;
    adminEmail?: string;
    timestamp?: string;
    changes?: Record<string, unknown>;
  }>;
}
