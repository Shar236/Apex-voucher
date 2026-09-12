import type { Metadata } from 'next';
import { DM_Sans, Sora } from 'next/font/google';
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/components/theme-provider';
import { CurrencyProvider } from '@/lib/currency';
import { getSessionCurrency } from '@/lib/currency-server';
import { Toaster } from '@/components/ui/toast';
import { SocialProofToaster } from '@/components/social-proof/social-proof-toast';
import { AuthProvider } from '@/components/auth-provider';
import { CartProvider } from '@/components/cart-provider';
import { VoucherProvider } from '@/components/voucher-provider';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { CartDrawer, CartToast } from '@/components/cart-drawer';
import { CheckoutModal } from '@/components/checkout/checkout-modal';
import { siteConfig } from '@/lib/config';
import { getWebsiteConfig } from '@/lib/website-config';
import './globals.css';

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const sora = Sora({
  variable: '--font-sora',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: siteConfig.defaultTitle,
    absolute: siteConfig.defaultTitle,
  },
  description: siteConfig.defaultDescription,
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
    url: siteConfig.siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await getWebsiteConfig();
  // Session display currency from the short-lived cookie (null on first visit —
  // the client provider then asks the backend once and sets the cookie).
  const sessionCurrency = await getSessionCurrency();

  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${sora.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        <ThemeProvider>
          <CurrencyProvider initialCurrency={sessionCurrency}>
            <AuthProvider>
              <CartProvider>
                <VoucherProvider>
                  <Navbar
                    supportPhone={config.footerSettings.phone}
                    supportEmail={config.footerSettings.email}
                    announcementText={config.announcementSettings.text}
                    announcementEnabled={config.announcementSettings.enabled !== false}
                    announcementLink={config.announcementSettings.link}
                    announcementOverrideWithCampaign={config.announcementSettings.overrideWithCampaign === true}
                    activeCampaignTitle={config.activeCampaign ? config.activeCampaign.title || null : null}
                  />
                  <CartToast />
                  <main className="flex-1">{children}</main>
                  <Footer
                    phone={config.footerSettings.phone}
                    email={config.footerSettings.email}
                    copyright={config.footerSettings.copyright}
                  />
                  <CartDrawer />
                  <CheckoutModal />
                  <Toaster />
                  <SocialProofToaster />
                </VoucherProvider>
              </CartProvider>
            </AuthProvider>
          </CurrencyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
