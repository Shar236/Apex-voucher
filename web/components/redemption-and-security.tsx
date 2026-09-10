import { ShieldCheck, Lock, CreditCard, Mail, Headphones, Info, Zap } from 'lucide-react';
import { ExpressCarDeliveryVector, DaylightExpressCarDeliveryVector } from '@/components/vector-illustrations';
import { SectionHeading } from '@/components/ui';

const REDEMPTION_STEPS = [
  { num: 1, title: 'Pick Your Exam', desc: 'Select PTE, GRE, TOEFL, or Duolingo discount voucher.' },
  { num: 2, title: 'Instant Express Pay', desc: 'Pay via UPI, Cards, NetBanking or EMI in seconds.' },
  { num: 3, title: 'Code Speeding to You', desc: 'Voucher code arrives instantly by email.' },
  { num: 4, title: 'Redeem at Provider', desc: 'Paste code on official Pearson, ETS, or Duolingo site.' },
  { num: 5, title: 'Payable Drops to ₹0', desc: 'Confirm your test appointment with 0 extra fee!' },
];

const SECURITY_ITEMS = [
  { icon: Lock, title: 'Safe & Secure Checkout', desc: 'Your payment is protected end to end' },
  { icon: ShieldCheck, title: 'Direct Partner Code', desc: 'Direct official reseller issuing' },
  { icon: CreditCard, title: 'All Payment Options', desc: 'UPI, Credit/Debit & EMI' },
  { icon: Mail, title: 'Instant Invoice', desc: 'GST invoice + email delivery' },
  { icon: Headphones, title: 'Human Desk 24/7', desc: 'Instant email & call support' },
];

export function SecurityTrustSection() {
  return (
    <section className="py-16 sm:py-24 bg-[#0B0D12] text-white border-b border-white/5 relative transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="inline-flex text-[11px] font-medium uppercase tracking-[0.14em] text-accent mb-3">100% Security &amp; Trust</span>
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-light text-white tracking-tight leading-[1.15]">
            Your Payment. Your Voucher. <br />
            <span className="text-accent">Your Peace of Mind.</span>
          </h2>
          <p className="text-neutral-400 font-normal text-base mt-3">Bank-grade security protocols so you can buy your voucher with 100% confidence.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 text-center">
          {SECURITY_ITEMS.map((item) => {
            const IconComp = item.icon;
            return (
              <div key={item.title} className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-3 hover:border-accent/50 hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-2xl bg-white/10 text-accent border border-white/10 flex items-center justify-center mx-auto">
                  <IconComp className="w-6 h-6" />
                </div>
                <h3 className="font-heading font-medium text-sm text-white">{item.title}</h3>
                <p className="text-xs text-neutral-400 font-normal leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function RedemptionAndSecurity() {
  return (
    <>
      <section className="py-16 sm:py-24 bg-surface-raised text-ink border-b border-line relative overflow-hidden transition-colors duration-300">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-175 h-87.5 bg-accent/5 blur-3xl pointer-events-none rounded-full" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/8 border border-accent/25 text-xs font-medium text-accent uppercase tracking-wider">
                <Zap className="w-4 h-4" />
                <span>Express Speed Delivery</span>
              </div>

              <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-light tracking-tight leading-tight text-ink">
                Delivered Faster Than <br />
                <span className="text-accent">Your OTP.</span>
              </h2>

              <p className="text-ink-muted font-normal text-base leading-relaxed max-w-lg">
                No waiting around! The moment your payment completes, our automated engine dispatches your official voucher code directly to your <strong className="text-ink font-medium">email in under 10 seconds</strong>.
              </p>

              <div className="space-y-3 pt-2">
                {['Speeding to your inbox in 10 seconds', '100% Genuine, verified official reseller codes', 'Up to 11 months validity with zero hassle'].map((feat) => (
                  <div key={feat} className="flex items-center gap-3 text-sm font-normal text-ink bg-surface p-3 rounded-2xl border border-line shadow-sm">
                    <div className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center font-medium text-xs shrink-0">✓</div>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 flex justify-center">
              <div className="w-full max-w-lg bg-surface p-6 rounded-3xl border border-line shadow-2xl backdrop-blur-sm">
                <div className="block dark:hidden">
                  <DaylightExpressCarDeliveryVector className="w-full h-auto drop-shadow-2xl" />
                </div>
                <div className="hidden dark:block">
                  <ExpressCarDeliveryVector className="w-full h-auto drop-shadow-2xl" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 bg-surface border-b border-line transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Step-by-Step Redemption" title="How to Redeem Your Voucher" subtitle="Redeeming your code on official testing portals (Pearson, ETS, Duolingo) takes under 60 seconds." />

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {REDEMPTION_STEPS.map((s) => (
              <div key={s.num} className="p-6 rounded-3xl bg-surface-raised border border-line space-y-3 flex flex-col justify-between hover:border-accent/40 hover:-translate-y-1 transition-all duration-300">
                <div>
                  <div className="w-9 h-9 rounded-2xl bg-accent text-white font-medium text-xs flex items-center justify-center mb-3 shadow-md">0{s.num}</div>
                  <h3 className="font-heading font-medium text-sm text-ink leading-snug">{s.title}</h3>
                  <p className="text-xs text-ink-muted font-normal leading-relaxed mt-1">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 p-5 rounded-2xl bg-surface-raised border border-line text-xs text-ink-muted font-normal flex items-start gap-3 max-w-3xl mx-auto">
            <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <p>
              <strong className="text-ink font-medium">Official Acceptance Notice:</strong> Apex Vouchers provides authorized bulk reseller voucher codes. All vouchers are redeemed directly on official test provider portals (Pearson, ETS, Duolingo). Zero hassle &amp; guaranteed acceptance.
            </p>
          </div>
        </div>
      </section>

      <SecurityTrustSection />
    </>
  );
}
