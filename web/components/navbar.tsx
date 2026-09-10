'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Phone, Mail, ShoppingCart, User, ChevronDown, Ticket, Menu, X, BookOpen, HelpCircle, CalendarCheck, Trophy, Calculator, Info, MessageCircle } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { useCart } from '@/components/cart-provider';
import { ApexLogo } from '@/components/apex-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui';

interface NavbarProps {
  supportPhone?: string;
  supportEmail?: string;
  announcementText?: string;
  announcementEnabled?: boolean;
  /** Makes the announcement strip clickable — CMS-configurable. */
  announcementLink?: string;
  /** Campaign banners replace the standard strip when this is on. */
  announcementOverrideWithCampaign?: boolean;
  activeCampaignTitle?: string | null;
}

const EXAM_CATEGORIES = [
  { name: 'PTE Academic Voucher', desc: 'Save up to ₹3,401 on official PTE Academic test', tag: 'PTE' },
  { name: 'PTE Core Voucher', desc: 'IRCC accepted for Canada PR & Work Permits', tag: 'PTE Core' },
  { name: 'ETS GRE Voucher', desc: 'Accepted by top global grad schools & MS programs', tag: 'GRE' },
  { name: 'ETS TOEFL iBT Voucher', desc: 'Accepted by 12,000+ universities worldwide', tag: 'TOEFL' },
  { name: 'Duolingo English Test Voucher', desc: 'Fast 48-hour results & 18% instant discount', tag: 'Duolingo' },
];

export function Navbar({
  supportPhone = '+91 9855926113',
  supportEmail = 'info@apexvouchers.com',
  announcementText = '⚡ Instant Voucher Delivery in 10s • 100% Genuine Official Vouchers',
  announcementEnabled = true,
  announcementLink,
  announcementOverrideWithCampaign = false,
  activeCampaignTitle = null,
}: NavbarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [vouchersDropdownOpen, setVouchersDropdownOpen] = useState(false);
  const { cartCount, setIsCartOpen } = useCart();
  const { isAuthenticated, user, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const accountHref = isAdmin ? '/admin' : '/account';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isHomeActive = pathname === '/';
  const isShopActive = pathname.startsWith('/exam-vouchers');
  const isExamBookingActive = pathname === '/exam-booking';
  const isCalculatorsActive = pathname.startsWith('/calculators');
  const isGuidesActive = pathname.startsWith('/blog');
  const isAwardsActive = pathname === '/awards';

  const navLinkClass = (active: boolean) =>
    `px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors ${active ? 'text-accent font-medium bg-accent/8' : 'hover:bg-accent/6 hover:text-accent'}`;

  return (
    <header className="sticky top-0 z-40 w-full transition-colors duration-300">
      <div className="bg-[#0B0D12] text-neutral-400 text-xs py-1.5 px-4 sm:px-6 lg:px-8 border-b border-white/5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-5 whitespace-nowrap text-[11px] sm:text-xs">
            <a href={`tel:${supportPhone.replace(/\s+/g, '')}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
              <Phone className="w-3.5 h-3.5 text-accent" />
              <span>
                Support: <strong className="text-white font-medium">{supportPhone}</strong>
              </span>
            </a>
            <a href={`mailto:${supportEmail}`} className="hidden md:flex items-center gap-1.5 hover:text-white transition-colors">
              <Mail className="w-3.5 h-3.5 text-accent" />
              <span>
                Email: <strong className="text-white font-medium">{supportEmail}</strong>
              </span>
            </a>
          </div>

          <div className="flex items-center gap-3 ml-auto sm:ml-0 whitespace-nowrap text-[11px] sm:text-xs">
            {/* CMS: overrideWithCampaign swaps the standard strip for the active
                campaign title; link makes the strip clickable. */}
            {announcementEnabled && !(
              announcementOverrideWithCampaign && activeCampaignTitle
            ) && (
              announcementLink ? (
                <Link href={announcementLink} className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium text-[10.5px] border border-accent/30 hover:bg-accent/25 transition-colors">
                  {announcementText}
                </Link>
              ) : (
                <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium text-[10.5px] border border-accent/30">
                  {announcementText}
                </span>
              )
            )}
            {announcementEnabled && announcementOverrideWithCampaign && activeCampaignTitle && (
              <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium text-[10.5px] border border-accent/30">
                {activeCampaignTitle}
              </span>
            )}
            {isAuthenticated ? (
              <button onClick={() => router.push(accountHref)} className="flex items-center gap-1 hover:text-white font-normal text-xs transition-colors cursor-pointer">
                <User className="w-3.5 h-3.5 text-accent" />
                <span>{isAdmin ? 'Admin Console' : `My Account (${user?.name?.split(' ')[0] || 'Dashboard'})`}</span>
              </button>
            ) : (
              <Link href="/login" className="flex items-center gap-1 hover:text-white font-normal text-xs transition-colors">
                <User className="w-3.5 h-3.5 text-accent" />
                <span>Login / Register</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      <nav className={`w-full transition-all duration-300 ${scrolled ? 'bg-surface/95 backdrop-blur-md shadow-sm py-2.5 border-b border-line' : 'bg-surface border-b border-line py-3.5'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center text-left focus:outline-none cursor-pointer group shrink-0" aria-label="Go to Apex Vouchers Home">
              <ApexLogo showTagline={false} />
            </Link>

            <div className="hidden 2xl:flex items-center gap-0.5 font-normal text-[13px] text-ink-muted whitespace-nowrap">
              <Link href="/" className={navLinkClass(isHomeActive)}>
                Home
              </Link>

              <Link href="/about" className={navLinkClass(pathname === '/about')}>
                About
              </Link>

              <div className="relative" onMouseEnter={() => setVouchersDropdownOpen(true)} onMouseLeave={() => setVouchersDropdownOpen(false)}>
                <Link href="/exam-vouchers" className={`flex items-center gap-1 px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors ${isShopActive ? 'text-accent font-medium bg-accent/8' : 'hover:bg-accent/6 hover:text-accent'}`}>
                  <span>Vouchers</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${vouchersDropdownOpen ? 'rotate-180 text-accent' : 'text-ink-muted'}`} />
                </Link>

                {vouchersDropdownOpen && (
                  <div className="absolute top-full left-0 w-100 bg-surface rounded-2xl shadow-xl border border-line p-3 mt-1 animate-in fade-in slide-in-from-top-2 z-50">
                    <div className="text-[11px] font-medium text-ink-muted uppercase tracking-wider px-3 py-1.5">Supported Exams</div>
                    <div className="space-y-1">
                      {EXAM_CATEGORIES.map((exam) => (
                        <Link
                          key={exam.tag}
                          href="/exam-vouchers"
                          onClick={() => setVouchersDropdownOpen(false)}
                          className="w-full text-left p-2.5 sm:p-3 rounded-xl hover:bg-accent/6 transition-all group flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-ink group-hover:text-accent transition-colors leading-tight">{exam.name}</div>
                            <div className="text-xs text-ink-muted font-normal mt-0.5 leading-snug">{exam.desc}</div>
                          </div>
                          <span className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-accent/10 text-accent border border-accent/25 whitespace-nowrap shrink-0">{exam.tag}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Link href="/exam-booking" className={`px-3 py-1.5 rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors ${isExamBookingActive ? 'text-accent font-medium bg-accent/8' : 'hover:bg-accent/6 hover:text-accent'}`}>
                <span>Exam Booking</span>
                <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-accent/10 text-accent border border-accent/20 leading-tight">PTE</span>
              </Link>

              <Link href="/calculators" className={navLinkClass(isCalculatorsActive)}>
                Score Calculators
              </Link>

              <Link href="/blog" className={navLinkClass(isGuidesActive)}>
                Blog
              </Link>

              <Link href="/awards" className={`hidden xl:inline-block ${navLinkClass(isAwardsActive)}`}>
                Awards
              </Link>

              <Link href="/faq" className={navLinkClass(pathname === '/faq')}>
                FAQ
              </Link>

              <Link href="/contact" className={navLinkClass(pathname === '/contact')}>
                Contact
              </Link>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              <ThemeToggle compact showLabel={false} />

              <button onClick={() => setIsCartOpen(true)} className="relative p-2 rounded-xl bg-surface-raised hover:bg-accent/6 text-ink hover:text-accent transition-all border border-line cursor-pointer" aria-label="Shopping Cart">
                <ShoppingCart className="w-4 h-4" />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-accent text-white text-[10px] font-medium flex items-center justify-center shadow-md">{cartCount}</span>
                )}
              </button>

              <div className="hidden 2xl:flex">
                <Button as={Link} href="/exam-booking" variant="secondary" size="sm">
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>Book Exam</span>
                </Button>
              </div>

              <div className="hidden 2xl:flex">
                <Button as={Link} href="/exam-vouchers" variant="primary" size="sm">
                  <Ticket className="w-3.5 h-3.5" />
                  <span>Buy Voucher</span>
                </Button>
              </div>

              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="2xl:hidden p-2 rounded-xl bg-surface-raised text-ink border border-line cursor-pointer" aria-label="Open navigation menu">
                {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {isMenuOpen && (
          <div className="2xl:hidden bg-surface border-b border-line px-4 pt-3 pb-6 space-y-2.5 mt-2 animate-in slide-in-from-top duration-200">
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-line">
              <span className="text-xs font-medium text-ink">Theme Mode</span>
              <ThemeToggle compact={false} showLabel />
            </div>

            <Link href="/exam-vouchers" onClick={() => setIsMenuOpen(false)} className="w-full text-left px-4 py-2.5 rounded-xl font-medium text-ink bg-accent/8 flex items-center justify-between">
              <span>🎟️ Browse All Vouchers</span>
              <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-md font-medium">Save 22%</span>
            </Link>

            <Link
              href="/exam-booking"
              onClick={() => setIsMenuOpen(false)}
              className={`w-full text-left px-4 py-2.5 rounded-xl font-normal flex items-center justify-between ${isExamBookingActive ? 'bg-accent/8 text-accent' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'}`}
            >
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-accent" />
                <span>PTE Exam Booking Assistance</span>
              </div>
              <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-md font-medium">NEW</span>
            </Link>

            <Link
              href="/calculators"
              onClick={() => setIsMenuOpen(false)}
              className={`w-full text-left px-4 py-2.5 rounded-xl font-normal flex items-center justify-between ${isCalculatorsActive ? 'bg-accent/8 text-accent font-medium' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'}`}
            >
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-accent" />
                <span>Score Calculators</span>
              </div>
              <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-md font-medium">12 Tools</span>
            </Link>

            <Link href="/blog" onClick={() => setIsMenuOpen(false)} className="w-full text-left px-4 py-2.5 rounded-xl font-normal text-ink-muted hover:bg-surface-raised hover:text-ink flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-accent" />
              <span>Students Diary & Blog</span>
            </Link>

            <Link href="/about" onClick={() => setIsMenuOpen(false)} className="w-full text-left px-4 py-2.5 rounded-xl font-normal text-ink-muted hover:bg-surface-raised hover:text-ink flex items-center gap-2">
              <Info className="w-4 h-4 text-accent" />
              <span>About Apex Vouchers</span>
            </Link>

            <Link href="/awards" onClick={() => setIsMenuOpen(false)} className="w-full text-left px-4 py-2.5 rounded-xl font-normal text-ink-muted hover:bg-surface-raised hover:text-ink flex items-center gap-2">
              <Trophy className="w-4 h-4 text-accent" />
              <span>Awards & Achievements</span>
            </Link>

            <Link href="/faq" onClick={() => setIsMenuOpen(false)} className="w-full text-left px-4 py-2.5 rounded-xl font-normal text-ink-muted hover:bg-surface-raised hover:text-ink flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-ink-muted" />
              <span>FAQ & Help</span>
            </Link>

            <Link href="/contact" onClick={() => setIsMenuOpen(false)} className="w-full text-left px-4 py-2.5 rounded-xl font-normal text-ink-muted hover:bg-surface-raised hover:text-ink flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-accent" />
              <span>Contact Support</span>
            </Link>

            <div className="pt-2 flex flex-col gap-2">
              <Button as={Link} href="/exam-booking" variant="secondary" size="md" fullWidth onClick={() => setIsMenuOpen(false)}>
                <CalendarCheck className="w-4 h-4" />
                <span>Book PTE Exam</span>
              </Button>
              <Button as={Link} href="/exam-vouchers" variant="primary" size="md" fullWidth onClick={() => setIsMenuOpen(false)}>
                Buy Voucher Now
              </Button>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
