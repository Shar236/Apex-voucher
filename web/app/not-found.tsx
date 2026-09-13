import Link from 'next/link';
import { ArrowRight, Search, Home, Tag } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-xl w-full text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          Page Moved or Not Found
        </div>

        {/* 404 Headline */}
        <h1 className="text-6xl sm:text-8xl font-black font-heading tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent mb-4">
          404
        </h1>

        <h2 className="text-xl sm:text-2xl font-bold font-heading text-white mb-3">
          Looking for Discounted Exam Vouchers?
        </h2>

        <p className="text-neutral-400 text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto">
          We recently upgraded to our new platform! The page you are looking for may have moved to a new address.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          <Link
            href="/exam-vouchers"
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-accent text-accent-foreground font-bold text-sm shadow-[0_0_25px_-5px_rgba(255,0,92,0.4)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Tag className="w-4 h-4" />
            Explore All Vouchers
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white font-medium text-sm hover:bg-neutral-800 hover:border-neutral-700 transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
        </div>

        {/* Popular Quick Links */}
        <div className="pt-6 border-t border-neutral-800/80">
          <p className="text-xs uppercase font-semibold text-neutral-400 tracking-wider mb-3">
            Popular Exam Vouchers
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/exam-vouchers/pearson-pte-academic-voucher"
              className="px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-800 text-xs text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors"
            >
              PTE Academic (Save ₹3,900+)
            </Link>
            <Link
              href="/exam-vouchers/pearson-pte-core-voucher"
              className="px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-800 text-xs text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors"
            >
              PTE Core (Canada PR)
            </Link>
            <Link
              href="/exam-vouchers/ets-toefl-voucher"
              className="px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-800 text-xs text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors"
            >
              TOEFL iBT
            </Link>
            <Link
              href="/exam-vouchers/ets-gre-voucher"
              className="px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-800 text-xs text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors"
            >
              GRE General
            </Link>
            <Link
              href="/exam-vouchers/duolingo-english-test-voucher"
              className="px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-800 text-xs text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors"
            >
              Duolingo English Test
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
