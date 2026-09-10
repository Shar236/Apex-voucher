import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Mail, Phone, MessageCircle, MapPin, Clock, Send, CheckCircle2 } from 'lucide-react';
import { buildMetadata, JsonLd, breadcrumbJsonLd } from '@/lib/seo';
import { getWebsiteConfig } from '@/lib/website-config';
import { ContactForm } from '@/components/contact/contact-form';

export const metadata: Metadata = buildMetadata({
  title: 'Contact Apex Vouchers — Support & Customer Care',
  description: 'Contact Apex Vouchers support for help with exam voucher redemption, PTE booking assistance, refunds, or order status. Email, WhatsApp and phone support available 7 days a week.',
  path: '/contact',
});

const CONTACT_METHODS = [
  {
    icon: <MessageCircle className="w-5 h-5" />,
    title: 'WhatsApp — Fastest Response',
    desc: 'Message our support desk for instant help with voucher codes, bookings, and order status.',
    value: '+91 98559 26113',
    href: 'https://wa.me/919855926113?text=' + encodeURIComponent('Hello Apex Vouchers, I need assistance with my exam voucher.'),
    cta: 'Chat on WhatsApp',
    tint: '#10B981',
  },
  {
    icon: <Mail className="w-5 h-5" />,
    title: 'Email Support',
    desc: 'Write to us with your order ID for detailed help. We reply within a few business hours.',
    value: 'info@apexvouchers.com',
    href: 'mailto:info@apexvouchers.com',
    cta: 'Send an Email',
    tint: '#FF005C',
  },
  {
    icon: <Phone className="w-5 h-5" />,
    title: 'Phone Support',
    desc: 'Call us during support hours for voucher verification, refunds, and booking assistance.',
    value: '+91 98559 26113',
    href: 'tel:+919855926113',
    cta: 'Call Now',
    tint: '#0EA5E9',
  },
];

export default async function ContactPage() {
  const config = await getWebsiteConfig();
  const supportEmail = config.footerSettings.email || 'info@apexvouchers.com';
  const supportPhone = config.footerSettings.phone || '+91 9855926113';
  const contactJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Contact Apex Vouchers',
    url: 'https://apexvouchers.com/contact',
    mainEntity: {
      '@type': 'Organization',
      name: 'Apex Vouchers',
      url: 'https://apexvouchers.com',
      contactPoint: [
        { '@type': 'ContactPoint', contactType: 'customer support', email: supportEmail, telephone: supportPhone, availableLanguage: ['en', 'hi'] },
      ],
    },
  };

  return (
    <div className="min-h-screen bg-surface-sunken text-ink transition-colors duration-300">
      <JsonLd data={contactJsonLd} />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }])} />

      <div className="bg-surface border-b border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <nav className="flex items-center gap-2 text-xs font-medium text-ink-muted">
            <Link href="/" className="hover:text-accent transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-accent font-medium">Contact</span>
          </nav>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-medium uppercase tracking-widest mb-4">
            <Send className="w-4 h-4" /> Customer Support
          </span>
          <h1 className="font-heading font-light text-3xl sm:text-4xl lg:text-5xl text-ink tracking-tight">Contact Us</h1>
          <p className="text-ink-muted text-sm sm:text-base font-normal mt-3">
            Have a question about a voucher, payment, booking, or your order? We&apos;re here to help.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.35fr] mb-12">
          <div className="space-y-5">
          {[...CONTACT_METHODS].map((m) => {
            const value = m.title === 'Email Support' ? supportEmail : m.title === 'Phone Support' ? supportPhone : m.value;
            const href = m.title === 'Email Support'
              ? `mailto:${supportEmail}`
              : m.title === 'Phone Support' || m.title.startsWith('WhatsApp')
                ? (m.title.startsWith('WhatsApp') ? `https://wa.me/${supportPhone.replace(/\D/g, '')}?text=${encodeURIComponent('Hello Apex Vouchers, I need assistance with my exam voucher.')}` : `tel:${supportPhone.replace(/\s+/g, '')}`)
                : m.href;
            return (
            <div key={m.title} className="rounded-3xl p-6 bg-surface border border-line shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white mb-4" style={{ background: m.tint }}>{m.icon}</div>
              <h2 className="font-heading font-medium text-base text-ink mb-1.5">{m.title}</h2>
              <p className="text-xs font-normal text-ink-muted leading-relaxed mb-4">{m.desc}</p>
              <div className="text-sm font-medium text-ink mb-4">{value}</div>
              <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined} className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-xs transition-colors">
                {m.cta}
              </a>
            </div>
            );
          })}
          </div>

          <div>
            <ContactForm />
          </div>
        </div>

        <div className="rounded-3xl p-6 sm:p-8 bg-[#0B0D12] text-white border border-white/5 space-y-4 mb-8">
          <h2 className="font-heading font-medium text-xl sm:text-2xl text-white">Before You Contact Us</h2>
          <div className="space-y-2.5 text-xs sm:text-sm font-normal text-neutral-300">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span><strong className="text-white">Voucher not received?</strong> Check your spam/junk folder first — codes are emailed automatically within seconds of payment.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span><strong className="text-white">Booking a PTE exam?</strong> Use our <Link href="/exam-booking" className="text-accent hover:underline">PTE Exam Booking Assistance</Link> form to get guidance on city, date, and test type.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span><strong className="text-white">Refund questions?</strong> Review our <Link href="/refund-policy" className="text-accent hover:underline">Refund Policy</Link> and <Link href="/voucher-refund-policy" className="text-accent hover:underline">Voucher Refund Policy</Link> before reaching out.</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-normal text-ink-muted">
          <div className="p-5 rounded-2xl bg-surface border border-line flex items-start gap-3">
            <Clock className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-ink mb-0.5">Support Hours</div>
              <span>Monday – Sunday, 9:00 AM – 9:00 PM IST. WhatsApp replies typically within minutes during support hours.</span>
            </div>
          </div>
          <div className="p-5 rounded-2xl bg-surface border border-line flex items-start gap-3">
            <MapPin className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-ink mb-0.5">Service Area</div>
              <span>Proudly serving study-abroad aspirants across India and around the world with genuine exam vouchers.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}