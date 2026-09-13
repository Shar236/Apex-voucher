import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PTEExamBookingPage } from '@/components/pte-exam-booking/pte-exam-booking-client';
import { getWebsiteConfig } from '@/lib/website-config';
import { getPTEBookingCatalog } from '@/lib/pte-booking-api';
import { buildMetadata, JsonLd, breadcrumbJsonLd } from '@/lib/seo';
import { FAQ_LIST } from '@/lib/pte-booking-data';

export const metadata: Metadata = buildMetadata({
  title: 'PTE Exam Booking Assistance',
  description:
    'Get assistance with PTE Academic, PTE Core and PTE Academic UKVI exam booking. Choose your preferred test, city and date and get guidance through the booking process.',
  path: '/exam-booking',
});

const serviceJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'PTE Exam Booking Assistance',
  provider: { '@type': 'Organization', name: 'Apex Vouchers', url: 'https://apexvouchers.com' },
  serviceType: 'Educational Examination Guidance & Support',
  areaServed: 'India, Global',
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_LIST.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default async function ExamBookingPage() {
  const [config, pteCatalog] = await Promise.all([
    getWebsiteConfig(),
    getPTEBookingCatalog(),
  ]);

  return (
    <>
      <JsonLd data={serviceJsonLd} />
      <JsonLd data={faqJsonLd} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Exam Booking', path: '/exam-booking' },
        ])}
      />
      <Suspense fallback={<div className="min-h-[60vh]" />}>
        <PTEExamBookingPage products={config.products} catalog={pteCatalog} />
      </Suspense>
    </>
  );
}
