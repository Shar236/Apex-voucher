import Link from 'next/link';
import type { ReactNode } from 'react';
import { Heart, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { ApexLogo } from '@/components/apex-logo';
import { CALCULATORS } from '@/lib/calculators';

interface FooterProps {
  description?: string;
  phone?: string;
  email?: string;
  copyright?: string;
}

type FooterNavLink = {
  name: string;
  href: string;
  badge?: string;
};

const PAYMENT_METHODS = [
  'UPI',
  'GPay',
  'PhonePe',
  'Visa',
  'Mastercard',
  'NetBanking',
  'EMI',
] as const;

const COMPANY_LINKS = [
  { name: 'About Us', href: '/about' },
  { name: 'Contact', href: '/contact' },
  { name: 'FAQ', href: '/faq' },
  { name: 'How It Works', href: '/#how-it-works' },
  { name: 'Blog', href: '/blog' },
] satisfies readonly FooterNavLink[];

const POLICY_LINKS = [
  { name: 'Refund & Cancellation Policy', href: '/refund-policy' },
  {
    name: 'PTE Rescheduling Guide',
    href: '/how-to-reschedule-cancel-pte-exam',
    badge: '2026',
  },
  { name: 'Voucher Refund Policy', href: '/voucher-refund-policy' },
  { name: 'Terms & Conditions', href: '/terms' },
  { name: 'Privacy Policy', href: '/privacy-policy' },
] satisfies readonly FooterNavLink[];

const SERVICE_LINKS = [
  { name: 'Exam Vouchers', href: '/exam-vouchers' },
  {
    name: 'PTE Exam Booking',
    href: '/exam-booking',
    badge: 'NEW',
  },
  { name: 'PTE Academic', href: '/exam-booking?exam=pte-academic' },
  { name: 'PTE Core', href: '/exam-booking?exam=pte-core' },
  { name: 'PTE Academic UKVI', href: '/exam-booking?exam=pte-ukvi' },
] satisfies readonly FooterNavLink[];

const LINK_CLASS =
  'font-normal text-left text-neutral-500 transition-colors hover:text-accent';

const HEADING_CLASS =
  'font-heading text-xs font-semibold uppercase tracking-wider text-neutral-800';

const BADGE_CLASS =
  'rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent';

const FooterLink = ({
  href,
  children,
  className = LINK_CLASS,
  title,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) => (
  <Link href={href} className={className} title={title}>
    {children}
  </Link>
);
const Badge = ({ children }: { children: ReactNode }) => (
  <span className={BADGE_CLASS}>{children}</span>
);

export function Footer({
  phone = '+91 9855926113',
  email = 'info@apexvouchers.com',
  copyright = '© 2026 Apex Vouchers. All rights reserved.',
}: FooterProps) {
  const phoneNumber = phone.replace(/\s+/g, '');
  const whatsappNumber = phone.replace(/\D/g, '');

  const phoneHref = `tel:${phoneNumber}`;
  const emailHref = `mailto:${email}`;

  const whatsappMessage = encodeURIComponent(
    'Hello Apex Vouchers support team, I need assistance.',
  );

  const whatsappHref = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  return (
    <footer
      className="border-t border-neutral-200 bg-white text-xs text-neutral-500"
      aria-label="Footer"
    >
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 border-b border-neutral-200 pb-12 sm:grid-cols-3 lg:grid-cols-6">
          {/* Brand */}
          <div className="col-span-2 space-y-4 sm:col-span-3 lg:col-span-1">
            <Link
              href="/"
              aria-label="Apex Vouchers home"
              className="inline-block"
            >
              <ApexLogo />
            </Link>

            <div className="space-y-1.5 pt-1 text-[11px]">
              <div className="flex items-start gap-1.5 text-neutral-600">
                <MapPin
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-accent mt-0.5"
                />
                <a
                  href="https://www.google.com/maps/place/APEX+INSTITUTE+IELTS,+PTE,+AND+OET/@30.675596,75.2884119,17z/data=!3m1!4b1!4m6!3m5!1s0x3910a34f04c55d99:0x2fae665204ba95fb!8m2!3d30.675596!4d75.2884119!16s%2Fg%2F11q943f75z?entry=ttu&g_ep=EgoyMDI2MDkwNi4wIKXMDSoASAFQAw%3D%3D"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="leading-snug transition-colors hover:text-accent"
                  aria-label="View Apex Institute on Google Maps"
                >
                  Near ROSHAN LAL SHOWROOM, Badhni Kalan, Punjab 142037
                </a>
              </div>

              <div className="flex items-center gap-1.5 text-neutral-600">
                <Phone
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-accent"
                />
                <a
                  href={phoneHref}
                  className="transition-colors hover:text-accent"
                  aria-label={`Call ${phone}`}
                >
                  {phone}
                </a>
              </div>

              <div className="flex items-center gap-1.5 text-neutral-600">
                <Mail
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-accent"
                />
                <a
                  href={emailHref}
                  className="transition-colors hover:text-accent"
                  aria-label={`Email ${email}`}
                >
                  {email}
                </a>
              </div>
            </div>
          </div>

          {/* Services & Booking */}
          <div className="space-y-3">
            <h2 className={HEADING_CLASS}>Services &amp; Booking</h2>

            <ul className="space-y-2">
              {SERVICE_LINKS.map(({ name, href, badge }) => (
                <li key={href}>
                  <FooterLink
                    href={href}
                    className={
                      badge
                        ? `${LINK_CLASS} flex items-center gap-1`
                        : LINK_CLASS
                    }
                  >
                    <span>{name}</span>
                    {badge && <Badge>{badge}</Badge>}
                  </FooterLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Score Calculators */}
          <div className="space-y-3">
            <h2 className={HEADING_CLASS}>
              <FooterLink
                href="/calculators"
                className="flex items-center justify-between gap-2 font-semibold text-neutral-800 transition-colors hover:text-accent"
              >
                <span>Score Calculators</span>
                <Badge>{CALCULATORS.length} FREE</Badge>
              </FooterLink>
            </h2>

            <ul className="space-y-1.5 text-[11px]">
              {CALCULATORS.map(({ slug, name }) => (
                <li key={slug}>
                  <FooterLink
                    href={`/calculators/${slug}`}
                    className={`${LINK_CLASS} block truncate`}
                    title={name}
                  >
                    {name}
                  </FooterLink>
                </li>
              ))}

              <li className="pt-1">
                <FooterLink
                  href="/calculators"
                  className="block text-[11px] font-semibold text-accent hover:underline"
                >
                  All Calculators →
                </FooterLink>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-3">
            <h2 className={HEADING_CLASS}>Company</h2>

            <ul className="space-y-2">
              {COMPANY_LINKS.map(({ name, href }) => (
                <li key={href}>
                  <FooterLink href={href}>{name}</FooterLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Policies */}
          <div className="space-y-3">
            <h2 className={HEADING_CLASS}>Policies</h2>

            <ul className="space-y-2">
              {POLICY_LINKS.map(({ name, href, badge }) => (
                <li key={href}>
                  <FooterLink
                    href={href}
                    className={
                      badge
                        ? `${LINK_CLASS} flex items-center gap-1.5`
                        : `${LINK_CLASS} block`
                    }
                  >
                    <span>{name}</span>
                    {badge && <Badge>{badge}</Badge>}
                  </FooterLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Support & Payment */}
          <div className="space-y-3">
            <h2 className={HEADING_CLASS}>Support &amp; Payment</h2>

            <ul className="space-y-1.5 pb-2">
              <li>
                <FooterLink
                  href="/faq"
                  className={`${LINK_CLASS} text-xs`}
                >
                  Help Center & FAQs
                </FooterLink>
              </li>

              <li>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${LINK_CLASS} text-xs text-neutral-600`}
                  aria-label="Contact Apex Vouchers on WhatsApp"
                >
                  Live WhatsApp Support
                </a>
              </li>
            </ul>

            <p className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
              Safe &amp; Secure Checkout
            </p>

            <div
              className="flex flex-wrap gap-1.5"
              aria-label="Accepted payment methods"
            >
              {PAYMENT_METHODS.map((method) => (
                <span
                  key={method}
                  className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-medium text-neutral-600"
                >
                  {method}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="flex flex-col items-center justify-between gap-4 pt-8 text-[11px] text-neutral-400 sm:flex-row border-t border-neutral-100 mt-0">
          <p>{copyright}</p>

          <div className="flex items-center gap-1 font-normal text-neutral-400">
            <span>Built with</span>

            <Heart
              aria-hidden="true"
              className="h-3.5 w-3.5 fill-accent text-accent"
            />

            <span>for study abroad candidates worldwide.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
