import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Legitimate routes that exist in the Next.js app.
 * Requests to these routes should never be intercepted or altered.
 */
const KNOWN_EXACT_PATHS = new Set([
  '/',
  '/about',
  '/awards',
  '/blog',
  '/calculators',
  '/contact',
  '/exam-booking',
  '/exam-vouchers',
  '/faq',
  '/how-to-reschedule-cancel-pte-exam',
  '/login',
  '/payment',
  '/privacy-policy',
  '/refund-policy',
  '/register',
  '/reset-password',
  '/forgot-password',
  '/terms',
  '/voucher-refund-policy',
  '/sitemap.xml',
  '/robots.txt',
]);

const KNOWN_PREFIXES = [
  '/api',
  '/exam-vouchers/',
  '/calculators/',
  '/blog/',
  '/exam-booking/',
  '/account',
  '/admin',
];

/**
 * Global Smart Redirect Middleware
 * Intercepts legacy WordPress URLs, old product links, and broken URLs,
 * automatically redirecting them (301 Permanent) to the appropriate Next.js page
 * so that users and Google NEVER encounter a 404 error.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const lower = pathname.toLowerCase().replace(/\/+$/, '') || '/';

  // 1. Pass through legitimate routes untouched
  if (KNOWN_EXACT_PATHS.has(lower) || KNOWN_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return NextResponse.next();
  }

  // 2. Legacy WordPress Home / System variations
  if (lower.startsWith('/home') || lower === '/home-3') {
    return NextResponse.redirect(new URL('/', request.url), 301);
  }
  if (lower === '/tc') {
    return NextResponse.redirect(new URL('/terms', request.url), 301);
  }

  // 3. City-specific voucher landing pages (Vadodara, Ludhiana, Haryana, Jalandhar, Karnal)
  if (
    lower.includes('vadodara') ||
    lower.includes('ludhiana') ||
    lower.includes('haryana') ||
    lower.includes('jalandhar') ||
    lower.includes('karnal')
  ) {
    return NextResponse.redirect(new URL('/exam-vouchers', request.url), 301);
  }

  // 4. Bulk purchase & Institute inquiries
  if (lower.includes('bulk-purchase') || lower.includes('institute')) {
    return NextResponse.redirect(new URL('/contact', request.url), 301);
  }

  // 5. Smart PTE Redirects
  if (lower.includes('pte')) {
    if (lower.includes('core')) {
      return NextResponse.redirect(new URL('/exam-vouchers/pearson-pte-core-voucher', request.url), 301);
    }
    if (lower.includes('canada')) {
      return NextResponse.redirect(new URL('/exam-vouchers/pearson-pte-canada-voucher', request.url), 301);
    }
    if (lower.includes('practice') || lower.includes('mock')) {
      return NextResponse.redirect(new URL('/exam-vouchers/pearson-pte-practice-test', request.url), 301);
    }
    if (lower.includes('ai')) {
      return NextResponse.redirect(new URL('/exam-vouchers/pteai-test', request.url), 301);
    }
    return NextResponse.redirect(new URL('/exam-vouchers/pearson-pte-academic-voucher', request.url), 301);
  }

  // 6. Smart TOEFL Redirects
  if (lower.includes('toefl')) {
    return NextResponse.redirect(new URL('/exam-vouchers/ets-toefl-voucher', request.url), 301);
  }

  // 7. Smart GRE Redirects
  if (lower.includes('gre')) {
    return NextResponse.redirect(new URL('/exam-vouchers/ets-gre-voucher', request.url), 301);
  }

  // 8. Smart Duolingo Redirects
  if (lower.includes('duolingo') || lower.includes('duolingi')) {
    return NextResponse.redirect(new URL('/exam-vouchers/duolingo-english-test-voucher', request.url), 301);
  }

  // 9. Smart IELTS Redirects
  if (lower.includes('ielts')) {
    return NextResponse.redirect(new URL('/exam-vouchers/ielts-exam-voucher', request.url), 301);
  }

  // 10. Smart CELPIP Redirects
  if (lower.includes('celpip')) {
    return NextResponse.redirect(new URL('/exam-vouchers/celpip-exam-voucher', request.url), 301);
  }

  // 11. Smart OET Redirects
  if (lower.includes('oet')) {
    return NextResponse.redirect(new URL('/exam-vouchers/oet-exam-voucher', request.url), 301);
  }

  // 12. Smart ACT Redirects
  if (lower.includes('act')) {
    return NextResponse.redirect(new URL('/exam-vouchers/act-exam-voucher', request.url), 301);
  }

  // 13. Smart LanguageCert Redirects
  if (lower.includes('languagecert')) {
    return NextResponse.redirect(new URL('/exam-vouchers/languagecert-exam-voucher', request.url), 301);
  }

  // 14. Legacy Shop / Catalog / Store / Cart / Product routes
  if (
    lower.includes('shop') ||
    lower.includes('voucher') ||
    lower.includes('store') ||
    lower.includes('product') ||
    lower.includes('cart') ||
    lower.includes('checkout') ||
    lower.includes('coupon') ||
    lower.includes('deal') ||
    lower.includes('discount')
  ) {
    return NextResponse.redirect(new URL('/exam-vouchers', request.url), 301);
  }

  // 15. Booking and calculators
  if (lower.includes('book') || lower.includes('booking')) {
    return NextResponse.redirect(new URL('/exam-booking', request.url), 301);
  }
  if (lower.includes('calc')) {
    return NextResponse.redirect(new URL('/calculators', request.url), 301);
  }

  // 16. Blog / Articles & Legacy WordPress Posts
  if (
    lower.includes('blog') ||
    lower.includes('article') ||
    lower.includes('news') ||
    lower.includes('post') ||
    lower.includes('scholarship') ||
    lower.includes('overtime') ||
    lower.includes('tips') ||
    lower.includes('write-for-us') ||
    lower.startsWith('/tag')
  ) {
    return NextResponse.redirect(new URL('/blog', request.url), 301);
  }

  // 17. Contact / About / Policy / FAQ
  if (lower.includes('contact')) {
    return NextResponse.redirect(new URL('/contact', request.url), 301);
  }
  if (lower.includes('about')) {
    return NextResponse.redirect(new URL('/about', request.url), 301);
  }
  if (lower.includes('faq')) {
    return NextResponse.redirect(new URL('/faq', request.url), 301);
  }
  if (lower.includes('refund')) {
    return NextResponse.redirect(new URL('/refund-policy', request.url), 301);
  }
  if (lower.includes('privacy')) {
    return NextResponse.redirect(new URL('/privacy-policy', request.url), 301);
  }
  if (lower.includes('term')) {
    return NextResponse.redirect(new URL('/terms', request.url), 301);
  }
  if (lower.includes('account') || lower.includes('profile')) {
    return NextResponse.redirect(new URL('/account', request.url), 301);
  }

  // 18. WordPress administrative / system routes
  if (lower.startsWith('/wp-') || lower.includes('xmlrpc') || lower.includes('feed')) {
    return NextResponse.redirect(new URL('/', request.url), 301);
  }

  // If completely unknown and no pattern matches, let it fall through to branded 404 page
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - image / media files
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm)$).*)',
  ],
};
