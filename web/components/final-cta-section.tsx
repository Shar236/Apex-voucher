import Link from 'next/link';
import { ArrowRight, MessageCircle, Ticket, ShieldCheck } from 'lucide-react';
import { ApexLogo } from '@/components/apex-logo';
import { Button } from '@/components/ui';

export function FinalCTASection() {
  return (
    <section className="relative overflow-hidden bg-[#0B0D12] py-20 sm:py-24 text-white border-b border-white/5 transition-colors duration-300">
      <div className="absolute top-0 right-1/4 w-125 h-125 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-medium uppercase tracking-widest">
              <ShieldCheck className="w-4 h-4" />
              Guaranteed Official Vouchers
            </div>

            <h2 className="font-heading text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight leading-tight text-white">
              Ready to Save on Your <br />
              <span className="text-accent">Next English Exam?</span>
            </h2>

            <p className="text-neutral-300 font-normal text-base sm:text-lg max-w-xl">Choose your exam voucher and get started. Instant 10-second delivery to your email.</p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button as={Link} href="/exam-vouchers" variant="primary" size="lg">
                <Ticket className="w-5 h-5" />
                <span>Browse Vouchers</span>
                <ArrowRight className="w-5 h-5" />
              </Button>

              <Button as="a" href="https://wa.me/919855926113" target="_blank" rel="noreferrer" variant="secondary" size="lg" className="bg-white/5! text-white! border-white/15! hover:border-accent!">
                <MessageCircle className="w-5 h-5" />
                <span>Contact Us</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs font-normal text-neutral-400 pt-4">
              <span>⚡ 10-Second Instant Delivery</span>
              <span>•</span>
              <span>🔒 Safe &amp; Secure Checkout</span>
              <span>•</span>
              <span>💬 24/7 Support Available</span>
            </div>
          </div>

          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-md bg-white/5 rounded-3xl p-6 border border-white/10 shadow-2xl text-center space-y-4">
              <div className="flex justify-center py-4">
                <div className="p-4 rounded-2xl bg-[#0B0D12] border border-white/10">
                  <ApexLogo className="h-10" showTagline whiteText />
                </div>
              </div>
              <div className="space-y-1">
                <span className="font-heading font-medium text-xl text-white block">Official Bulk Discount Offers</span>
                <span className="text-xs text-neutral-400 font-normal block">PTE • GRE • TOEFL • Duolingo • IELTS</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
