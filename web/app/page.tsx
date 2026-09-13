import type { Metadata } from 'next';
import { HeroSection } from '@/components/hero/hero-section';
import { TrustStrip } from '@/components/trust-strip';
import { ExamLogoMarquee } from '@/components/exam-logo-marquee';
import { ExamCategorySection } from '@/components/exam-category-section';
import { FeaturedVouchers } from '@/components/featured-vouchers';
import { PTEBookingAssistance } from '@/components/pte-booking-assistance';
import { HowItWorks } from '@/components/how-it-works';
import { WhyApexVoucher } from '@/components/why-apex-voucher';
import { Testimonials } from '@/components/testimonials';
import { ExamGuidesSection } from '@/components/exam-guides-section';
import { FinalCTASection } from '@/components/final-cta-section';
import { ReelsSection } from '@/components/reels/reels-section';
import { getWebsiteConfig } from '@/lib/website-config';
import { listPublicBlogPosts } from '@/lib/blog-api';
import { buildMetadata, JsonLd } from '@/lib/seo';
import { siteConfig } from '@/lib/config';

import { getPTEBookingCatalog } from '@/lib/pte-booking-api';

export async function generateMetadata(): Promise<Metadata> {
  const config = await getWebsiteConfig();
  return buildMetadata({
    title: config.globalSEO.defaultSeoTitle || siteConfig.defaultTitle,
    description: config.globalSEO.defaultMetaDescription || siteConfig.defaultDescription,
    path: '/',
    ogImage: config.globalSEO.defaultOgImage,
  });
}

export default async function HomePage() {
  const [config, blogResult, pteCatalog] = await Promise.all([
    getWebsiteConfig(),
    listPublicBlogPosts({ limit: 6 }),
    getPTEBookingCatalog(),
  ]);

  return (
    <>
      {config.structuredData.organization && Object.keys(config.structuredData.organization).length > 0 && <JsonLd data={config.structuredData.organization} />}
      {config.structuredData.website && Object.keys(config.structuredData.website).length > 0 && <JsonLd data={config.structuredData.website} />}
      <HeroSection heroSettings={config.heroSettings} activeCampaign={config.activeCampaign} benefitCards={config.benefitCards} />
      <TrustStrip />
      <ExamLogoMarquee />
      <ExamCategorySection products={config.products} />
      <FeaturedVouchers products={config.products} />
      <PTEBookingAssistance catalog={pteCatalog} />
      <HowItWorks />
      <WhyApexVoucher />
      <ReelsSection />
      <Testimonials />
      <ExamGuidesSection posts={blogResult.data} />
      <FinalCTASection />
    </>
  );
}
