import { Product } from '../models/Product.js';
import { Campaign } from '../models/Campaign.js';
import { Setting } from '../models/Setting.js';
import { Redirect } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { isValidObjectId } from '../config/db.js';
import { escapeRegex } from '../utils/index.js';
import { config } from '../config/index.js';
import { resolveImageUrl } from '../utils/imageUrl.js';
import { createDisplayPricingResolver } from '../services/pricing.js';

const baseUrl = () => config.siteUrl || config.business?.website || config.clientUrl || 'http://localhost:5173';

// Shared CMS defaults — used by both getWebsiteConfig (full storefront bootstrap)
// and getLayoutConfig (the tiny nav/footer-only payload the root layout needs).
const DEFAULT_ANNOUNCEMENT = {
  enabled: true,
  text: '⚡ Instant Voucher Delivery in 10s • 100% Genuine Official Vouchers',
  link: '/#vouchers',
  overrideWithCampaign: true,
};

const DEFAULT_FOOTER = {
  description: 'Apex Vouchers helps candidates save on official exam voucher fees for PTE, IELTS, TOEFL and Duolingo with 100% genuine guaranteed vouchers.',
  phone: '+91 9855926113',
  email: 'info@apexvouchers.com',
  copyright: '© 2026 Apex Vouchers. All rights reserved.',
  usefulLinks: [
    { label: 'About Us', url: '/#about' },
    { label: 'Exam Vouchers', url: '/#vouchers' },
    { label: 'How It Works', url: '/#how-it-works' },
    { label: 'FAQ', url: '/#faq' },
    { label: 'Privacy Policy', url: '/#privacy' },
    { label: 'Terms of Service', url: '/#terms' },
  ],
};

/**
 * GET /api/products/layout-config
 * The minimal payload the Next.js root layout needs on EVERY route (Navbar +
 * Footer + announcement bar). Two Setting reads, ~1 KB response — vs
 * getWebsiteConfig's full catalog + all SEO + structured data (~30 KB).
 */
export const getLayoutConfig = async (_req, res, next) => {
  try {
    const rows = await Setting.find({ key: { $in: ['footerSettings', 'announcementSettings'] } }).lean();
    const S = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const footer = S.footerSettings || DEFAULT_FOOTER;
    res.json({
      success: true,
      footerSettings: {
        description: footer.description || DEFAULT_FOOTER.description,
        phone: footer.phone || DEFAULT_FOOTER.phone,
        email: footer.email || DEFAULT_FOOTER.email,
        copyright: footer.copyright || DEFAULT_FOOTER.copyright,
      },
      announcementSettings: S.announcementSettings || DEFAULT_ANNOUNCEMENT,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Customer-facing product hydration.
 *
 * IMPORTANT: voucher-code inventory is NEVER exposed to customers. Every active
 * product presents as purchasable ("Buy Now") regardless of how many codes are
 * currently in stock — a paid order with no available code is turned into a
 * post-payment fulfilment request by the payment pipeline, invisibly to the
 * buyer. The only non-purchasable state is `comingSoon` (an explicit admin flag,
 * also enforced in createPaymentOrder). Real stock counts stay in the admin
 * console (adminController.aggregateVoucherStatsByProduct), not here.
 */
const applyAvailability = async (products, req = null) => {
  if (!products.length) return products;
  // One geo/FX resolution serves the whole page — the FX rate is cached
  // backend-side, so N products cost zero extra provider calls (requirement:
  // never call the FX API per render/card/page).
  let resolvePricing = null;
  if (req) {
    try {
      resolvePricing = await createDisplayPricingResolver(req);
    } catch {
      resolvePricing = null;
    }
  }
  return products.map((p) => {
    const raw = typeof p.toObject === 'function' ? p.toObject() : p;
    const activeDurations = Array.isArray(raw.durationOptions)
      ? raw.durationOptions.filter((o) => o && o.enabled !== false && Number(o.sellingPrice) > 0)
      : [];
    const firstDuration = activeDurations.length > 0 ? activeDurations[0] : null;
    const effectiveSellingPrice =
      Number(raw.sellingPrice) > 0
        ? Number(raw.sellingPrice)
        : (firstDuration ? Number(firstDuration.sellingPrice) : 0);
    const effectiveOriginalPrice =
      Number(raw.originalPrice) > 0
        ? Number(raw.originalPrice)
        : (firstDuration ? Number(firstDuration.originalPrice || firstDuration.sellingPrice) : effectiveSellingPrice);
    const savings = Math.max(0, effectiveOriginalPrice - effectiveSellingPrice);
    const isComingSoon = !!raw.comingSoon;

    // Deliver each guide-step screenshot through the same Cloudinary
    // f_auto,q_auto transform as the primary image.
    const resolveGuideSteps = (steps) =>
      (steps || []).map((s) => ({
        ...s,
        screenshot:
          s && s.screenshot && s.screenshot.url
            ? { ...s.screenshot, url: resolveImageUrl(s.screenshot.url) }
            : s?.screenshot,
      }));
    const redemptionGuide =
      raw.redemptionGuide && typeof raw.redemptionGuide === 'object'
        ? { ...raw.redemptionGuide, steps: resolveGuideSteps(raw.redemptionGuide.steps) }
        : raw.redemptionGuide;
    const purchaseGuide =
      raw.purchaseGuide && typeof raw.purchaseGuide === 'object'
        ? { ...raw.purchaseGuide, steps: resolveGuideSteps(raw.purchaseGuide.steps) }
        : raw.purchaseGuide;

    return {
      ...raw,
      redemptionGuide,
      purchaseGuide,
      // Deliver every image through Cloudinary's f_auto,q_auto transform when it
      // is a Cloudinary asset; legacy/local paths pass through untouched.
      image: resolveImageUrl(raw.image),
      logo: resolveImageUrl(raw.logo),
      // No inventory signal reaches the browser. `availability` / `availableStock`
      // are nulled (kept only so old clients don't crash on a missing key).
      availability: null,
      availableStock: null,
      inStock: isComingSoon ? false : raw.inStock !== false,
      stockStatus: isComingSoon ? 'COMING SOON' : (raw.inStock === false ? 'OUT OF STOCK' : 'IN STOCK'),
      sellingPrice: effectiveSellingPrice,
      originalPrice: effectiveOriginalPrice,
      discountedPrice: effectiveSellingPrice,
      savings,
      // ── Display pricing (INR is the base; USD derived server-side) ────────
      // `pricing.currency` is the display/billing currency for this visitor.
      // The frontend formats `displayPrice` — it NEVER converts currencies.
      ...(resolvePricing
        ? {
            pricing: resolvePricing(effectiveSellingPrice, effectiveOriginalPrice),
            // Duration variants get display prices too (USD), keeping every
            // surface consistent for international visitors.
            durationOptions: Array.isArray(raw.durationOptions)
              ? raw.durationOptions.map((o) => {
                  if (!o || o.enabled === false) return o;
                  const priced = resolvePricing(o.sellingPrice, o.originalPrice || 0);
                  return {
                    ...o,
                    displaySellingPrice: priced.displayPrice,
                    displayOriginalPrice: priced.displayOriginalPrice,
                    displayCurrency: priced.currency,
                    inr: {
                      ...priced.inr,
                      displayPrice: priced.inr?.displayPrice ?? o.sellingPrice,
                      displaySellingPrice: priced.inr?.displaySellingPrice ?? priced.inr?.displayPrice ?? o.sellingPrice,
                      displayOriginalPrice: priced.inr?.displayOriginalPrice ?? o.originalPrice ?? o.sellingPrice,
                    },
                    usd: priced.usd
                      ? {
                          ...priced.usd,
                          displayPrice: priced.usd.displayPrice,
                          displaySellingPrice: priced.usd.displaySellingPrice ?? priced.usd.displayPrice,
                          displayOriginalPrice: priced.usd.displayOriginalPrice ?? priced.usd.displayPrice,
                        }
                      : null,
                  };
                })
              : raw.durationOptions,
          }
        : {}),
    };
  });
};

const buildProductJsonLd = (product) => {
  if (!product) return null;
  const base = baseUrl().replace(/\/$/, '');
  const price = product.sellingPrice || product.discountedPrice || 0;
  // Always InStock for search engines — the store fulfils every purchase (from
  // inventory or via post-payment fulfilment). Only a "coming soon" product,
  const availability = product.comingSoon
    ? 'https://schema.org/PreOrder'
    : (product.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock');
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.seo?.description || product.seoDescription || product.description || product.shortDescription || '',
    image: product.image ? [product.image] : undefined,
    sku: product.slug,
    brand: {
      '@type': 'Brand',
      name: product.brand || product.provider || 'Apex Vouchers',
    },
    offers: {
      '@type': 'Offer',
      url: `${base}/exam-vouchers/${product.slug}`,
      priceCurrency: product.currency || 'INR',
      price: String(price),
      availability,
      priceValidUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      seller: {
        '@type': 'Organization',
        name: 'Apex Vouchers',
        url: base,
      },
    },
    aggregateRating: product.reviewsCount > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: String(product.rating || 5),
      reviewCount: product.reviewsCount,
    } : undefined,
  };
};

/**
 * FAQPage structured data from a product's admin-authored FAQs. Returns null
 * when the product has no configured FAQs (the page then renders generated
 * fallback FAQs, which are intentionally not advertised to search engines).
 */
const buildFaqJsonLd = (product) => {
  const faqs = Array.isArray(product?.faqs)
    ? product.faqs.filter((f) => f && f.question && f.answer)
    : [];
  if (faqs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
};

export const listProducts = async (req, res, next) => {
  try {
    const { category, brand, provider, featured, search, all } = req.query;
    const filter = all === '1' ? {} : { active: true, archived: { $ne: true } };
    if (category) filter.category = category;
    if (brand) filter.brand = brand;
    if (provider) filter.provider = provider;
    if (featured) filter.featured = featured === '1';
    if (search) {
      const s = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: s }, { brand: s }, { provider: s }, { category: s }];
    }

    const products = await Product.find(filter).sort({ displayOrder: 1, featured: -1, createdAt: -1 }).lean();
    const hydrated = await applyAvailability(products, req);
    res.json({ success: true, count: hydrated.length, data: hydrated });
  } catch (err) {
    next(err);
  }
};

export const getProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    let product = null;
    if (isValidObjectId(id)) {
      product = await Product.findById(id);
    }
    if (!product) {
      product = await Product.findOne({ slug: String(id).toLowerCase() });
    }
    if (!product) {
      const asPath = `/exam-vouchers/${String(id).toLowerCase()}`;
      const redirect = await Redirect.findOne({ sourcePath: asPath, enabled: true }).lean();
      if (redirect) {
        await Redirect.findByIdAndUpdate(redirect._id, { $inc: { hits: 1 }, $set: { lastHitAt: new Date() } }).catch(() => {});
        const newSlug = redirect.targetPath.split('/').pop();
        if (newSlug) {
          product = await Product.findOne({ slug: newSlug });
        }
      }
    }
    const isPubliclyHidden = !product?.active || product?.archived;
    if (!product || (isPubliclyHidden && req.user?.role !== 'admin')) {
      return next(new AppError('Product not found', 404, 'NOT_FOUND'));
    }
    const hydrated = (await applyAvailability([product], req))[0];

    let related = [];
    if (hydrated.relatedProducts && hydrated.relatedProducts.length > 0) {
      // "Explore More" — admin-curated list. Preserve the admin's ordering
      // ($in does not) and silently drop any now-inactive/deleted picks.
      const orderedIds = hydrated.relatedProducts.map((x) => String(x));
      const rel = await Product.find({ _id: { $in: orderedIds }, active: true }).select('name slug brand provider image sellingPrice originalPrice badge badgeType seo featured').lean();
      const byId = new Map(rel.map((r) => [String(r._id), r]));
      const orderedRel = orderedIds.map((rid) => byId.get(rid)).filter(Boolean);
      related = await applyAvailability(orderedRel, req);
    } else if (hydrated.brand || hydrated.provider) {
      const rel = await Product.find({
        _id: { $ne: hydrated._id },
        active: true,
        $or: [{ brand: hydrated.brand }, { provider: hydrated.provider }, { category: hydrated.category }],
      }).select('name slug brand provider image sellingPrice originalPrice badge badgeType seo featured').sort({ featured: -1, displayOrder: 1 }).limit(4).lean();
      related = await applyAvailability(rel, req);
    }

    const jsonLd = buildProductJsonLd(hydrated);

    const breadcrumbJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl().replace(/\/$/, '')}/` },
        { '@type': 'ListItem', position: 2, name: 'Exam Vouchers', item: `${baseUrl().replace(/\/$/, '')}/#vouchers` },
        { '@type': 'ListItem', position: 3, name: hydrated.name },
      ],
    };

    res.json({
      success: true,
      data: hydrated,
      relatedProducts: related,
      structuredData: {
        product: jsonLd,
        breadcrumb: breadcrumbJsonLd,
        faq: buildFaqJsonLd(hydrated),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getWebsiteConfig = async (req, res, next) => {
  try {
    const now = new Date();

    // One round trip for every CMS/SEO setting instead of 14 (5 sequential +
    // a Promise.all of 9). Campaign housekeeping, the active-campaign lookup and
    // the product catalog all run in parallel with it.
    const SETTING_KEYS = [
      'heroSettings', 'announcementSettings', 'benefitCards', 'footerSettings', 'policySettings',
      'seo_siteName', 'seo_defaultTitle', 'seo_defaultDescription', 'seo_defaultOgImage',
      'seo_siteUrl', 'seo_orgName', 'seo_orgLogo', 'seo_gscVerification', 'seo_gaMeasurementId',
    ];

    const [settingRows, activeCampaigns, products] = await Promise.all([
      Setting.find({ key: { $in: SETTING_KEYS } }).lean(),
      Campaign.updateMany(
        { endDate: { $lt: now }, status: { $in: ['ACTIVE', 'SCHEDULED'] } },
        { $set: { status: 'EXPIRED' } }
      )
        .catch(() => {})
        .then(() =>
          Campaign.find({
            status: { $in: ['ACTIVE', 'SCHEDULED'] },
            startDate: { $lte: now },
            endDate: { $gte: now },
          })
            .sort({ priority: -1, createdAt: -1 })
            .populate('applicableProducts', 'name brand sellingPrice originalPrice')
            .lean()
        ),
      Product.find({ active: true, archived: { $ne: true } })
        .sort({ displayOrder: 1, featured: -1, createdAt: -1 })
        .lean(),
    ]);

    const S = Object.fromEntries(settingRows.map((row) => [row.key, row.value]));
    const settingValue = (key) => (S[key] !== undefined ? { value: S[key] } : null);
    const heroSettingDoc = settingValue('heroSettings');
    const announcementDoc = settingValue('announcementSettings');
    const benefitCardsDoc = settingValue('benefitCards');
    const footerDoc = settingValue('footerSettings');
    const policySettingsDoc = settingValue('policySettings');
    const siteName = settingValue('seo_siteName');
    const defaultTitle = settingValue('seo_defaultTitle');
    const defaultDesc = settingValue('seo_defaultDescription');
    const defaultOgImage = settingValue('seo_defaultOgImage');
    const siteUrl = settingValue('seo_siteUrl');
    const orgName = settingValue('seo_orgName');
    const orgLogo = settingValue('seo_orgLogo');
    const gscCode = settingValue('seo_gscVerification');
    const gaId = settingValue('seo_gaMeasurementId');

    const activeCampaign = activeCampaigns.length > 0 ? activeCampaigns[0] : null;

    const heroSettings = heroSettingDoc?.value || {
      headingLine1: 'Your Exam. Your Dream.',
      headingHighlight: 'Our Vouchers.',
      headingLine3: 'Your Savings.',
      descriptionText: 'Get official voucher codes for PTE, IELTS, TOEFL & Duolingo at the best prices and save more on your exam fees.',
      ctaText: 'Browse Vouchers',
      ctaLink: '/exam-vouchers',
    };

    const announcementSettings = announcementDoc?.value || DEFAULT_ANNOUNCEMENT;

    const benefitCards = benefitCardsDoc?.value || [
      { id: 1, title: 'Best Prices', sub: 'Guaranteed', icon: '🏷️' },
      { id: 2, title: 'Instant Delivery', sub: 'in 10 Seconds', icon: '⚡' },
      { id: 3, title: '100% Official', sub: 'Vouchers', icon: '🛡️' },
      { id: 4, title: 'Secure Payments', sub: '& Safe Checkout', icon: '🔒' },
    ];

    const footerSettings = footerDoc?.value || DEFAULT_FOOTER;

    const globalSEO = {
      websiteName: siteName?.value || 'Apex Vouchers',
      defaultSeoTitle: defaultTitle?.value || 'Exam Vouchers at Best Prices | PTE, IELTS, TOEFL & Duolingo | Apex Vouchers',
      defaultMetaDescription: defaultDesc?.value || 'Buy official exam vouchers for PTE, IELTS, TOEFL and Duolingo at competitive prices. Save on exam fees with Apex Vouchers.',
      defaultOgImage: defaultOgImage?.value || '',
      websiteUrl: siteUrl?.value || baseUrl(),
      organizationName: orgName?.value || 'Apex Vouchers',
      organizationLogo: orgLogo?.value || '',
      gscVerificationCode: gscCode?.value || '',
      gaMeasurementId: gaId?.value || '',
    };

    const orgJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: globalSEO.organizationName,
      url: globalSEO.websiteUrl,
      logo: globalSEO.organizationLogo || undefined,
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'info@apexvouchers.com',
        telephone: '+91 9855926113',
        areaServed: 'IN',
      },
      sameAs: [],
    };

    const websiteJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: globalSEO.websiteName,
      url: globalSEO.websiteUrl,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${globalSEO.websiteUrl}/#vouchers?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    };

    const hydratedProducts = await applyAvailability(products, req);

    const policySettings = policySettingsDoc?.value || {
      apexRefund: {
        enabled: true,
        effectiveDate: '2026-01-01',
        eligibilityCriteria: 'Vouchers that are 100% unredeemed and unallocated on the Pearson / ETS portal within the allowable refund window.',
        cancellationPeriodDays: 7,
        refundPercentage: 100,
        processingFeePercent: 0,
        voucherValidityPeriod: '6 to 11 months from date of purchase (check voucher specification)',
        cancellationRules: 'Once a voucher refund is issued, the alphanumeric code is permanently deactivated and cannot be applied to any test booking.',
        reschedulingRules: 'Vouchers cannot be used to pay Pearson rescheduling fees. Rescheduling is managed directly via the student\'s myPTE account.',
        exceptionalCircumstances: 'For medical or family emergencies, official documentation may be submitted to support for expedited case-by-case review.',
        refundProcessingTime: '24 to 48 business hours via the original payment method (UPI / Bank Account / Card).',
        supportEmail: 'info@apexvouchers.com',
        supportPhone: '+91 98559 26113',
        whatsappNumber: '9855926113',
      },
      guideSettings: {
        pageTitle: 'How to Reschedule or Cancel a PTE Exam in 2026',
        subtitle: 'Complete Guide to PTE Rescheduling, Cancellation, Refunds & Voucher Bookings',
        ctaTitle: 'Planning to Book a New PTE Exam?',
        ctaSubtitle: 'Purchase your official PTE voucher from Apex Vouchers and save instantly on your exam fee.',
        ctaButtonText: 'BUY PTE VOUCHER ONLINE',
        ctaButtonLink: 'https://apexvouchers.com/',
        ctaEmail: 'info@apexvouchers.com',
        ctaPhone: '98559 26113',
        isPublished: true,
        disclaimerText: 'Disclaimer: This article is for general informational purposes and is not affiliated with or endorsed by Pearson. PTE fees, cancellation rules, refund policies, voucher terms and booking procedures may change. Students should verify the latest information directly with Pearson and review the terms of their voucher provider before making a cancellation, rescheduling request or refund claim.',
      },
      faqs: [
        {
          question: 'Can I change my PTE exam date?',
          answer: 'Yes. Eligible appointments can generally be rescheduled through your myPTE account under My Activity.',
        },
        {
          question: 'Is PTE rescheduling free?',
          answer: 'Under Pearson\'s current policy, rescheduling is generally free when more than 14 full calendar days remain before the test date.',
        },
        {
          question: 'Can I cancel my PTE exam and get a refund?',
          answer: 'Where applicable, the refund depends on how many full calendar days remain before the appointment. Cancellations made 14 or more full days before the test are generally eligible for a 100% refund, while cancellations made 13–8 full calendar days before the test are generally eligible for a 50% refund.',
        },
        {
          question: 'What refund do I get if I cancel 14 or more days before my PTE exam?',
          answer: 'Generally 100%, subject to Pearson\'s current terms and policies.',
        },
        {
          question: 'What if I cancel 10 days before my PTE exam?',
          answer: 'A cancellation made 13–8 full calendar days before the test date is generally eligible for a 50% refund under Pearson\'s published schedule.',
        },
        {
          question: 'What if I cancel fewer than 7 days before my PTE exam?',
          answer: 'Under Pearson\'s current published schedule, cancellations made fewer than 7 full calendar days before the test are generally not refundable.',
        },
        {
          question: 'What if I bought my PTE voucher from a third-party provider?',
          answer: 'Contact the provider from which the voucher was purchased and check that provider\'s applicable refund policy. Cancelling a Pearson exam appointment does not automatically refund payments made to a third-party voucher vendor.',
        },
        {
          question: 'Can I use a voucher to pay a rescheduling fee?',
          answer: 'Pearson states that PTE vouchers can be applied toward the test fee but cannot be used to pay a rescheduling fee.',
        },
      ],
    };

    res.json({
      success: true,
      activeCampaign,
      heroSettings,
      announcementSettings,
      benefitCards,
      footerSettings,
      policySettings,
      globalSEO,
      structuredData: {
        organization: orgJsonLd,
        website: websiteJsonLd,
      },
      products: hydratedProducts,
    });
  } catch (err) {
    next(err);
  }
};
