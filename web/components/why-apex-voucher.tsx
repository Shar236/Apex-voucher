import { Tag, Zap, Lock, GraduationCap, Headphones, CheckCircle2 } from 'lucide-react';
import { SectionHeading } from '@/components/ui';

const FEATURES = [
  { icon: Tag, title: 'Unmatched Discount Prices', desc: 'Save big on PTE, GRE, TOEFL, and Duolingo. Zero hidden fees. Direct official reseller pricing.', badge: '💰 Max Student Savings' },
  { icon: Zap, title: 'Faster Than Your OTP', desc: 'Receive your unique voucher code instantly in your email within 10 seconds of payment.', badge: '⚡ 10-Second Express' },
  { icon: Lock, title: 'Secure Payment', desc: 'Pay safely via UPI, Credit/Debit Cards, NetBanking or EMI — your payment is protected end to end.', badge: '🔒 100% Secure' },
  { icon: GraduationCap, title: 'Up to 11 Months Validity', desc: 'Book your exam whenever you are confident. Long validity period gives you complete peace of mind.', badge: '📅 Maximum Validity' },
  { icon: Headphones, title: 'Real Human Support Desk', desc: 'Got stuck or need help selecting an exam date? Our student desk responds instantly.', badge: '💬 Support Desk' },
  { icon: CheckCircle2, title: 'Zero Credentials Sharing', desc: 'Redeem directly on official test provider websites (Pearson, ETS, Duolingo). Zero credential sharing.', badge: '✓ 100% Safe' },
];

export function WhyApexVoucher() {
  return (
    <section className="py-16 sm:py-24 bg-surface-raised border-b border-line transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Why Students Love Apex"
          title="Why 13,500+ Aspirants Trust Apex Vouchers"
          subtitle="Built from the ground up to give study abroad aspirants a faster, cheaper, and reassuring exam booking experience."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((feat) => {
            const IconComp = feat.icon;
            return (
              <div key={feat.title} className="bg-surface rounded-3xl p-7 border border-line shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-accent/8 text-accent flex items-center justify-center group-hover:scale-105 transition-transform border border-accent/20">
                      <IconComp className="w-6 h-6" strokeWidth={2} />
                    </div>
                    <span className="text-[10px] font-medium uppercase px-3 py-1 rounded-full bg-surface-sunken text-ink-muted">{feat.badge}</span>
                  </div>
                  <h3 className="font-heading font-medium text-xl text-ink leading-snug mb-2 group-hover:text-accent transition-colors">{feat.title}</h3>
                  <p className="text-ink-muted text-xs font-normal leading-relaxed">{feat.desc}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-line flex items-center text-xs font-normal text-success">
                  <span>✓ 100% Student Approved</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
