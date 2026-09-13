import { Star } from 'lucide-react';
import { SectionHeading } from '@/components/ui';

const TESTIMONIALS = [
  {
    id: 1,
    name: 'Ananya Sharma',
    city: 'Delhi',
    exam: 'PTE Academic',
    saved: '₹3,401',
    comment: 'I was skeptical at first about buying a voucher online, but Apex delivered the code in literally 8 seconds! Saved ₹3,400+ on my PTE test. Scored 86 overall!',
  },
  {
    id: 2,
    name: 'Rohan Patel',
    city: 'Ahmedabad',
    exam: 'PTE Core',
    saved: '₹3,101',
    comment: 'Used the PTE Core voucher for my Canada PR application. Code worked smoothly on the Pearson portal. The voucher savings were super helpful!',
  },
  {
    id: 3,
    name: 'Priya Venkatesh',
    city: 'Bangalore',
    exam: 'ETS GRE',
    saved: '₹2,701',
    comment: 'Instant GRE voucher delivery at midnight! Got ₹2,700 off and booked my center test immediately. Highly recommend Apex Vouchers.',
  },
];

export function Testimonials() {
  return (
    <section className="py-16 sm:py-24 bg-surface border-b border-line transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Student Reviews & Rating" title="Trusted by Over 13,500+ Students" subtitle="Read verified reviews from real candidates who booked their PTE, GRE, and TOEFL exams with Apex Vouchers." />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((rev) => (
            <div key={rev.id} className="bg-surface rounded-3xl p-6 border border-line shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-400" />
                    ))}
                  </div>
                  <span className="text-[10px] font-medium px-2.5 py-1 rounded-md bg-accent/8 text-accent">Verified Purchase ✓</span>
                </div>
                <p className="text-xs text-ink-muted font-normal leading-relaxed italic">&ldquo;{rev.comment}&rdquo;</p>
              </div>
              <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
                <div>
                  <h4 className="font-heading font-medium text-sm text-ink">{rev.name}</h4>
                  <span className="text-[11px] text-ink-muted font-normal">
                    {rev.city} • {rev.exam}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-medium text-success block">Saved {rev.saved}</span>
                  <span className="text-[10px] text-ink-muted font-normal block">Rating 5.0</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
