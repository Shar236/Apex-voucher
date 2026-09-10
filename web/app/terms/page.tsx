import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Scale } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Terms & Conditions',
  description: 'Official Terms and Conditions governing voucher purchases, portal redemption, booking assistance services, and consumer rights on Apex Vouchers.',
  path: '/terms',
});

const SUPPORT_PHONE = '+91 98559 26113';
const SUPPORT_EMAIL = 'info@apexvouchers.com';

const SECTIONS = [
  {
    title: '1. Agreement to Terms',
    body: 'By accessing or using Apex Vouchers (apexvouchers.com), registering an account, or purchasing test vouchers for examinations including PTE Academic, PTE Core, IELTS, TOEFL iBT, GRE, or Duolingo, you agree to be legally bound by these Terms & Conditions. If you do not agree with any part of these terms, you must not use our website.',
  },
  {
    title: '2. Nature of Service & Digital Delivery',
    body: 'Apex Vouchers distributes 100% genuine, official examination discount vouchers. Upon successful payment verification via our PCI-DSS compliant checkout gateway, voucher codes are generated and transmitted instantly via SMS, Email, and your secure online User Dashboard.',
  },
  {
    title: '3. Non-Affiliation & Independent Reseller Disclaimer',
    body: 'Apex Vouchers is an independent provider and reseller of genuine educational exam vouchers. Pearson PTE, ETS, IELTS, and Duolingo are registered trademarks of their respective owners. Apex Vouchers is not directly endorsed by or affiliated with Pearson Inc. or ETS. All official examination booking guidelines, test-day rules, identity verifications, and score reports are governed strictly by the respective test conducting bodies.',
  },
  {
    title: '4. Voucher Validity & Redemption Obligations',
    body: 'Each voucher code carries a specific validity expiration date (typically 6 to 11 months from purchase). Candidates must redeem their voucher and schedule their test appointment before the code expires. Expired codes cannot be renewed or refunded. Vouchers cannot be used to settle rescheduling penalty fees on testing portals.',
  },
  {
    title: '5. Limitation of Liability',
    body: 'In no event shall Apex Vouchers, its directors, employees, or partners be liable for any indirect, incidental, punitive, or consequential damages arising from test center cancellations, candidate test-day disqualifications, internet outages during testing, or missed examination appointments. Our maximum liability shall not exceed the amount paid for the specific voucher purchased.',
  },
  {
    title: '6. Governing Law & Dispute Resolution',
    body: 'These Terms and Conditions shall be governed by and construed in accordance with the laws of India. Any disputes arising in connection with these terms shall be subject to the exclusive jurisdiction of the competent courts in India.',
  },
];

export default function TermsAndConditionsPage() {
  return (
    <div className="bg-surface-sunken text-ink min-h-screen antialiased transition-colors duration-300">
      <div className="bg-surface border-b border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <nav className="flex items-center gap-2 text-xs font-normal text-ink-muted">
            <Link href="/" className="hover:text-accent transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-neutral-400">Legal</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-accent font-normal">Terms & Conditions</span>
          </nav>
        </div>
      </div>

      <header className="bg-surface border-b border-line py-12 sm:py-16 text-center">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium uppercase tracking-wide">
            <Scale className="w-4 h-4" /> Legal Agreement
          </div>
          <h1 className="font-heading font-medium text-3xl sm:text-4xl text-ink tracking-tight">Terms & Conditions</h1>
          <p className="text-sm sm:text-base text-ink-muted font-medium">Please read these terms and conditions carefully before purchasing exam vouchers or utilizing our booking assistance services.</p>
          <div className="pt-2 text-xs font-mono text-neutral-400">Effective Date: January 1, 2026 • Apex Vouchers Platform Terms</div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8 text-sm sm:text-base text-ink-muted leading-relaxed">
        {SECTIONS.map((s) => (
          <section key={s.title} className="bg-surface p-6 sm:p-8 rounded-3xl border border-line shadow-sm space-y-3">
            <h2 className="font-heading font-medium text-lg sm:text-xl text-ink">{s.title}</h2>
            <p>{s.body}</p>
          </section>
        ))}

        <section className="p-6 rounded-3xl bg-[#0B0D12] text-white border border-white/5 text-xs space-y-2">
          <div className="font-normal text-white">Questions regarding these terms?</div>
          <p className="text-neutral-400">
            Reach out to our legal and compliance desk at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent">{SUPPORT_EMAIL}</a> or call <a href={`tel:${SUPPORT_PHONE.replace(/\s+/g, '')}`} className="text-accent">{SUPPORT_PHONE}</a>.
          </p>
        </section>
      </main>
    </div>
  );
}