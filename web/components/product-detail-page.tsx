'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ExternalLink, CheckCircle2, MessageCircle, Mail, Headphones, AlertTriangle } from 'lucide-react';
import { BrandLogoContainer } from '@/components/official-brand-logos';
import { BuyActions, StickyMobileBar } from '@/components/product/buy-actions';
import { FaqAccordion } from '@/components/product/faq-accordion';
import { RedemptionGuideSection } from '@/components/product/redemption-guide-section';
import { PurchaseGuideSection } from '@/components/product/purchase-guide-section';
import { VoucherCard } from '@/components/voucher-card';
import { PearsonPartnerLink, isPearsonPteProduct } from '@/components/pearson-partner-link';
import { StockBadge, PriceDisplay, DiscountBadge, DeliveryValidityBar, SectionHeading } from '@/components/ui';
import { getRedemptionGuide } from '@/lib/redemption-guides';
import { formatPrice } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import type { Product, DurationOption } from '@/lib/types';
import { unitDisplayPrice, calculateDiscountPercent } from '@/lib/pricing';

const DEFAULT_INCLUSIONS = ['Genuine Digital Voucher', 'Fast Delivery to Email', 'Clear Redemption Instructions', 'Official Provider Redemption', 'Customer Support', 'Transparent Pricing'];

export function ProductDetailPage({ product, related, supportPhone = '+91 9855926113', supportEmail = 'info@apexvouchers.com' }: { product: Product; related: Product[]; supportPhone?: string; supportEmail?: string }) {
  const { currency } = useCurrency();
  const enabledDurations = useMemo(
    () => (product.durationOptions || []).filter((o) => o.enabled !== false),
    [product.durationOptions]
  );
  const [selectedDuration, setSelectedDuration] = useState<DurationOption | null>(enabledDurations.length > 0 ? enabledDurations[0] : null);

  const activeSelectedDuration =
    selectedDuration && enabledDurations.some((o) => o.key === selectedDuration.key)
      ? selectedDuration
      : (enabledDurations.length > 0 ? enabledDurations[0] : null);

  const priced = unitDisplayPrice(product, activeSelectedDuration, currency);
  const currentPrice = priced.current;
  const originalPrice = priced.original;
  const priceCurrency = priced.currency;
  const displayValidity = activeSelectedDuration
    ? activeSelectedDuration.validityDays >= 30 && activeSelectedDuration.validityDays % 30 === 0
      ? `Valid ${activeSelectedDuration.validityDays / 30} Month${activeSelectedDuration.validityDays / 30 === 1 ? '' : 's'}`
      : `Valid ${activeSelectedDuration.validityDays} Days`
    : null;

  const inclusions = Array.isArray(product.inclusions) && product.inclusions.length > 0 ? product.inclusions : DEFAULT_INCLUSIONS;
  const redemptionGuide = getRedemptionGuide(product);
  const productContent = product.productContent?.enabled && product.productContent.content?.trim() ? product.productContent : null;
  const importantInfoRows = (product.importantInfo || []).filter((r) => r.label?.trim() || r.value?.trim());
  const importantNotes = (product.importantNotes || []).filter((n) => n?.trim());

  const faqs =
    Array.isArray(product.faqs) && product.faqs.length > 0
      ? product.faqs
      : [
          { question: 'How will I receive my voucher?', answer: `Your voucher will be delivered to your registered email${product.deliveryType ? ` (${product.deliveryType})` : ''} shortly after your payment is confirmed.` },
          {
            question: 'Where do I redeem the voucher?',
            answer: redemptionGuide.officialUrl ? `You redeem it directly on the official ${redemptionGuide.providerLabel} website: ${redemptionGuide.officialUrl}` : `You redeem it directly on the official ${redemptionGuide.providerLabel} website.`,
          },
          { question: 'Can I use the voucher more than once?', answer: 'No — each Apex voucher code is valid for a single redemption only.' },
          {
            question: 'How long is the voucher valid?',
            answer: product.validityMonths ? `This voucher is valid for ${product.validityMonths} months from the date of purchase.` : 'Please check the validity period shown in the pricing section above.',
          },
          { question: 'Can I get a refund?', answer: 'Apex Vouchers offers a refund guarantee if your voucher code is unredeemed within 7 days of purchase. Contact support to request a refund.' },
          { question: "What should I do if my voucher doesn't work?", answer: 'Contact our support team via email with your order ID and we will verify and resolve the issue promptly.' },
        ];

  const supportWhatsAppLink = `https://wa.me/${supportPhone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(`Hi Apex Vouchers team! I need help redeeming my ${product.name} voucher.`)}`;

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <Link href="/exam-vouchers" className="inline-flex items-center gap-1.5 text-xs font-normal text-ink-muted hover:text-accent transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Exam Vouchers
        </Link>
      </div>

      <section className="py-8 sm:py-12 bg-surface transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-line bg-surface shadow-[0_1px_3px_rgba(15,20,35,0.04),0_20px_50px_-24px_rgba(15,20,35,0.15)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4),0_20px_50px_-24px_rgba(0,0,0,0.7)] p-6 sm:p-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-4 flex justify-center">
              <div className="w-full max-w-55 aspect-square rounded-2xl border border-line bg-white flex items-center justify-center p-6">
                {product.logo ? (
                  <Image src={product.logo} alt={`${product.name} logo`} width={440} height={440} className="max-h-full max-w-full object-contain" />
                ) : (
                  <BrandLogoContainer brand={product.brand || product.provider} name={product.name} inverted={false} />
                )}
              </div>
            </div>

            <div className="md:col-span-8 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-widest text-ink-muted">{product.provider || product.brand}</span>
                <StockBadge product={product} />
              </div>

              <h1 className="font-heading font-normal text-2xl sm:text-3xl lg:text-4xl text-ink leading-tight">{/\bvoucher\b/i.test(product.name) ? product.name : `${product.name} Voucher`}</h1>

              <p className="text-sm text-ink-muted font-normal leading-relaxed">{product.shortDescription || product.description || 'Official genuine exam voucher with instant digital delivery from Apex Vouchers.'}</p>

              {enabledDurations.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs font-medium uppercase tracking-widest text-ink-muted">Choose your access period:</span>
                  <div className="flex items-center gap-1 rounded-xl bg-neutral-100 dark:bg-[#262626] p-1">
                    {enabledDurations.map((opt) => {
                      const isActive = activeSelectedDuration?.key === opt.key;
                      return (
                        <button
                          key={opt.key}
                          onClick={() => setSelectedDuration(opt)}
                          className={`px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            isActive ? 'bg-white dark:bg-[#161616] shadow-sm text-accent' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-end gap-4">
                <PriceDisplay original={originalPrice} current={currentPrice} formatPrice={(n) => formatPrice(n, priceCurrency)} size="lg" emphasis="accent" showSaved />
                <DiscountBadge percent={calculateDiscountPercent(originalPrice, currentPrice)} savings={Math.max(0, originalPrice - currentPrice)} formatPrice={(n) => formatPrice(n, priceCurrency)} />
                <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider pb-1.5 whitespace-nowrap">
                  {priceCurrency === 'USD' ? 'USD $' : 'INR ₹'}
                </span>
              </div>

              <DeliveryValidityBar product={displayValidity ? { ...product, validity: displayValidity } : product} className="max-w-xs" />

              <BuyActions product={product} selectedDuration={activeSelectedDuration} />

              {(product as { officialWebsiteUrl?: string; officialProductUrl?: string }).officialWebsiteUrl && (
                <a href={(product as { officialWebsiteUrl?: string }).officialWebsiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-accent transition-colors">
                  Official Website <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              {isPearsonPteProduct(product) && <PearsonPartnerLink />}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-surface-raised border-y border-line transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Simple 3-Step Process" title="How It Works" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: '01', title: 'Buy Your Voucher', desc: 'Purchase your voucher securely from Apex Vouchers.' },
              { n: '02', title: 'Receive Your Code', desc: `Your voucher is delivered to your registered email — ${(product.deliveryType || 'Instant Delivery').toLowerCase()}.` },
              { n: '03', title: 'Redeem on Official Website', desc: `Visit the official ${redemptionGuide.providerLabel} website and apply your code during checkout.` },
            ].map((step) => (
              <div key={step.n} className="bg-surface rounded-3xl border border-line p-6 space-y-3 shadow-sm">
                <span className="font-heading font-medium text-4xl text-accent/20">{step.n}</span>
                <h3 className="font-heading font-medium text-lg text-ink">{step.title}</h3>
                <p className="text-sm text-ink-muted font-normal leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {productContent && (
        <section className="py-16 sm:py-20 bg-surface transition-colors duration-300">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="Product Details" title={productContent.heading?.trim() || `About the ${product.name}`} align="left" />
            <div
              className="product-rich-content text-sm sm:text-base font-normal text-ink-muted leading-relaxed space-y-4 [&_h2]:font-heading [&_h2]:font-medium [&_h2]:text-xl [&_h2]:text-ink [&_h2]:mt-8 [&_h3]:font-heading [&_h3]:font-medium [&_h3]:text-lg [&_h3]:text-ink [&_h3]:mt-6 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_a]:text-accent [&_a]:underline [&_strong]:text-ink [&_strong]:font-medium [&_img]:rounded-2xl [&_img]:border [&_img]:border-line [&_blockquote]:border-l-2 [&_blockquote]:border-accent/40 [&_blockquote]:pl-4 [&_blockquote]:italic"
              dangerouslySetInnerHTML={{ __html: productContent.content || '' }}
            />
          </div>
        </section>
      )}

      <section className="py-16 sm:py-20 bg-surface transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <PurchaseGuideSection product={product} />
        </div>
      </section>

      <section id="how-to-redeem" className="py-16 sm:py-20 bg-surface-raised border-y border-line transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RedemptionGuideSection product={product} />
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-surface transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="What You Get" title="Everything Included With Your Voucher" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inclusions.map((inc) => (
              <div key={inc} className="flex items-center gap-3 bg-surface-raised rounded-2xl border border-line px-4 py-3.5">
                <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                <span className="text-sm font-normal text-ink">{inc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-surface-raised border-y border-line transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Good to Know" title="Important Information" />
          <div className="bg-surface rounded-3xl border border-line divide-y divide-line overflow-hidden">
            {(importantInfoRows.length > 0
              ? importantInfoRows.map((r) => ({ label: r.label?.trim() || '', value: r.value?.trim() || '' }))
              : [
                  product.validityMonths ? { label: 'Voucher Validity', value: `${product.validityMonths} Months from purchase date` } : null,
                  product.deliveryType ? { label: 'Delivery Method', value: product.deliveryType } : null,
                  redemptionGuide.providerLabel ? { label: 'Redemption Method', value: `Online, directly on the official ${redemptionGuide.providerLabel} website` } : null,
                  { label: 'Refund Policy', value: 'Refund guarantee if the voucher code is unredeemed within 7 days of purchase. Contact support to request one.' },
                ].filter((row): row is { label: string; value: string } => Boolean(row))
            ).map((row, idx) => (
              <div key={`${row.label}-${idx}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-6 py-4">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-muted">{row.label}</span>
                <span className="text-sm font-normal text-ink">{row.value}</span>
              </div>
            ))}
          </div>

          {importantNotes.length > 0 && (
            <div className="mt-5 space-y-2.5">
              {importantNotes.map((note, idx) => (
                <div key={idx} className="flex items-start gap-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 px-4 py-3.5 text-xs font-normal text-amber-800 dark:text-amber-300 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span><strong className="font-semibold">Important:</strong> {note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-surface transition-colors duration-300">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="FAQ" title="Frequently Asked Questions" />
          <FaqAccordion faqs={faqs} />
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-[#0B0D12] text-white transition-colors duration-300">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-5">
          <Headphones className="w-8 h-8 text-accent mx-auto" />
          <h2 className="font-heading text-2xl sm:text-3xl font-light">Need Help Redeeming Your Voucher?</h2>
          <p className="text-neutral-400 font-normal text-sm sm:text-base max-w-xl mx-auto">Our support team can help you understand the purchase and redemption process.</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <a href={supportWhatsAppLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white rounded-full py-3.5 px-6 text-sm font-medium shadow-lg transition-all cursor-pointer">
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp Support</span>
            </a>
            <a href={`mailto:${supportEmail}`} className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white rounded-full py-3.5 px-6 text-sm font-medium border border-white/10 transition-colors cursor-pointer">
              <Mail className="w-4 h-4" />
              <span>Contact Support</span>
            </a>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="py-16 sm:py-20 bg-surface transition-colors duration-300">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="Explore More" title="Related Vouchers" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 items-stretch">
              {related.map((r) => (
                <VoucherCard key={r._id || r.id} product={r} />
              ))}
            </div>
          </div>
        </section>
      )}

      <p className="text-center text-[11px] font-medium text-ink-muted py-8 px-4 max-w-2xl mx-auto leading-relaxed">
        All trademarks and logos belong to their respective owners. Apex Vouchers is an independent voucher/service provider unless otherwise stated.
      </p>

      <StickyMobileBar product={product} selectedDuration={activeSelectedDuration} />
    </>
  );
}
