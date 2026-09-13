'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight, BadgeCheck, ShieldCheck, Phone, Mail, Users, Info, GraduationCap, MapPin,
  Building2, Calendar, Clock, Search, ChevronDown, CheckCircle2, AlertCircle, Loader2,
  Copy, Check, MessageCircle, HelpCircle, FileCheck, Sparkles, ListChecks, Ban, RefreshCcw,
  Lock, Star, Quote, Ticket, ExternalLink, AlertTriangle,
} from 'lucide-react';
import { pteBookingApi, formatPrice } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { unitDisplayPrice } from '@/lib/pricing';
import { PhoneInput } from '@/components/auth/phone-input';
import { FaqAccordion } from '@/components/blog/faq-accordion';
import { PTE_INDIAN_CITIES, EXAM_TYPE_OPTIONS, TIME_OPTIONS, BEFORE_YOU_BOOK_CHECKLIST, BOOKING_MISTAKES, FAQ_LIST } from '@/lib/pte-booking-data';
import { PTEBookingAssistance } from '@/components/pte-booking-assistance';
import type { Product, PTEBookingCatalog } from '@/lib/types';

const todayISO = () => new Date().toISOString().slice(0, 10);

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}>
      {children}
    </div>
  );
}

interface SubmittedData {
  requestId: string;
  examType: string;
  preferredCity: string;
  preferredDate: string;
  preferredTime: string;
  duplicate: boolean;
}

export function PTEExamBookingPage({
  products,
  catalog,
}: {
  products: Product[];
  catalog?: PTEBookingCatalog | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currency } = useCurrency();
  const formRef = useRef<HTMLDivElement>(null);
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [examType, setExamType] = useState('PTE Academic');
  const [preferredCity, setPreferredCity] = useState('');
  const [otherCity, setOtherCity] = useState('');
  const [preferredTestCentre, setPreferredTestCentre] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('Any Time');
  const [alternativeDate, setAlternativeDate] = useState('');
  const [additionalRequirements, setAdditionalRequirements] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [citySearch, setCitySearch] = useState('');
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState<SubmittedData | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [citiesExpanded, setCitiesExpanded] = useState(false);
  const [showStickyCta, setShowStickyCta] = useState(false);

  const supportPhone = '+91 9855926113';
  const supportEmail = 'info@apexvouchers.com';

  useEffect(() => {
    const examParam = searchParams.get('exam')?.toLowerCase();
    if (examParam) {
      if (examParam.includes('core')) setExamType('PTE Core');
      else if (examParam.includes('ukvi')) setExamType('PTE Academic UKVI');
      else setExamType('PTE Academic');
    }
  }, [searchParams]);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setShowStickyCta(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const resolvedCity = preferredCity === 'Other' ? otherCity.trim() : preferredCity;

  const filteredCities = useMemo(() => {
    if (!citySearch.trim()) return PTE_INDIAN_CITIES;
    return PTE_INDIAN_CITIES.filter((c) => c.name.toLowerCase().includes(citySearch.toLowerCase()) || c.state.toLowerCase().includes(citySearch.toLowerCase()));
  }, [citySearch]);

  const sortedCoverageCities = useMemo(() => [...PTE_INDIAN_CITIES].sort((a, b) => Number(b.prominent) - Number(a.prominent)), []);
  const visibleCoverageCities = citiesExpanded ? sortedCoverageCities : sortedCoverageCities.slice(0, 12);

  const pteVouchers = useMemo(() => products.filter((p) => ['pte-academic', 'pte-core'].includes(p.slug || p.id || '')), [products]);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!fullName.trim() || fullName.trim().length < 2) errs.fullName = 'Please enter your full legal name';
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = 'Please enter a valid email address';
    if (!phone || phone.replace(/\D/g, '').length < 6) errs.phone = 'Please enter a valid mobile number';
    if (!resolvedCity) errs.preferredCity = 'Please select or enter your preferred test city';
    if (preferredCity === 'Other' && !otherCity.trim()) errs.otherCity = 'Please specify your city';
    const today = todayISO();
    if (preferredDate && preferredDate < today) errs.preferredDate = 'Exam date cannot be in the past';
    if (alternativeDate && alternativeDate < today) errs.alternativeDate = 'Alternative date cannot be in the past';
    if (!termsAccepted) errs.termsAccepted = 'Please acknowledge that this is a booking assistance request';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError('');
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const res = await pteBookingApi.submit({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        examType,
        preferredCity: resolvedCity,
        preferredTestCentre: preferredTestCentre.trim(),
        preferredDate: preferredDate || null,
        preferredTime,
        alternativeDate: alternativeDate || null,
        additionalRequirements: additionalRequirements.trim(),
        message: additionalRequirements.trim(),
        termsAccepted,
      });
      setIsSubmitting(false);
      if (res?.success) {
        setSubmittedData({
          requestId: (res.data as { requestId?: string })?.requestId || 'PTE-REQUEST',
          examType,
          preferredCity: resolvedCity,
          preferredDate,
          preferredTime,
          duplicate: !!res.duplicate,
        });
      } else {
        setSubmitError((res?.message as string) || 'Something went wrong. Please check your details and try again.');
      }
    } catch (err) {
      setIsSubmitting(false);
      setSubmitError(err instanceof Error ? err.message : 'Unable to connect. Please check your internet connection and try again.');
    }
  };

  const copyRequestId = (reqId: string) => {
    navigator.clipboard.writeText(reqId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const resetForm = () => {
    setSubmittedData(null);
    setErrors({});
    setSubmitError('');
    setPreferredDate('');
    setAlternativeDate('');
    setAdditionalRequirements('');
    setTermsAccepted(false);
  };

  const whatsappHref = (text: string) => `https://wa.me/${supportPhone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

  const inputCls = (hasError: boolean) =>
    `w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-[#1A1A1A] border text-xs sm:text-sm font-bold text-neutral-900 dark:text-white outline-none transition-colors ${
      hasError ? 'border-rose-500 focus:border-rose-500' : 'border-[#EAEAEA] dark:border-[#292929] focus:border-brand-pink'
    }`;

  return (
    <div className="min-h-screen bg-white dark:bg-[#06070B] text-neutral-900 dark:text-white antialiased transition-colors duration-300">
      <div className="border-b border-[#EAEAEA] dark:border-[#202020] bg-neutral-50/70 dark:bg-[#0D0D0D]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 text-xs font-bold text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
          <span onClick={() => router.push('/')} className="hover:text-brand-pink transition-colors cursor-pointer">Home</span>
          <span className="text-neutral-300 dark:text-neutral-600">/</span>
          <span className="text-brand-pink">PTE Exam Booking</span>
        </div>
      </div>

      <section ref={heroRef} className="relative overflow-hidden pt-12 pb-16 sm:pt-16 sm:pb-24 border-b border-[#EAEAEA] dark:border-[#222]">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-150 h-87.5 bg-linear-to-tr from-brand-pink/15 via-[#6C3CE0]/15 to-transparent blur-3xl pointer-events-none rounded-full" aria-hidden="true" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-linear-to-tl from-[#005A9C]/10 to-transparent blur-3xl pointer-events-none rounded-full" aria-hidden="true" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#FFF0F5] dark:bg-[#2A0A17] text-brand-pink font-black text-xs border border-brand-pink/30 shadow-sm">
                  <Sparkles className="w-3.5 h-3.5" /> PTE EXAM BOOKING ASSISTANCE
                </span>
              </div>
              <h1 className="font-heading text-3xl sm:text-5xl lg:text-6xl font-black text-neutral-900 dark:text-white tracking-tight leading-[1.1]">
                Book Your <span className="text-brand-pink">PTE Exam</span> With Confidence
              </h1>
              <p className="text-base sm:text-lg text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-2xl mx-auto lg:mx-0 font-medium">
                Not sure which PTE test to book, where to take it, or how to choose your preferred date?
                Apex Vouchers can guide you through the booking process and help you prepare the right details before you book.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] text-left shrink-0">
                  <div className="w-9 h-9 rounded-xl bg-[#FFF0F5] dark:bg-[#2A0A17] text-brand-pink flex items-center justify-center shrink-0">
                    <Users className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="font-heading font-black text-sm text-neutral-900 dark:text-white leading-none">13,500+</div>
                    <div className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 mt-0.5">Students helped</div>
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs font-bold text-amber-800 dark:text-amber-300 flex items-start gap-3 text-left">
                  <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <p><strong>Important:</strong> Our service provides booking assistance and guidance. Your exam appointment is confirmed only through the official booking process.</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <button onClick={scrollToForm} className="w-full sm:w-auto btn-pink py-3.5 px-8 text-sm font-extrabold flex items-center justify-center gap-2 shadow-xl hover:shadow-brand-pink/25 cursor-pointer">
                  Book Your PTE Exam <ArrowRight className="w-4 h-4" />
                </button>
                <button onClick={() => howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' })} className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-neutral-100 dark:bg-[#1A1A1A] hover:bg-neutral-200 dark:hover:bg-[#252525] text-neutral-800 dark:text-neutral-200 font-bold text-sm border border-[#EAEAEA] dark:border-[#292929] transition-colors cursor-pointer">
                  Check How It Works ↓
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 sm:gap-6 pt-2 text-xs font-bold text-neutral-500 dark:text-neutral-400">
                <span className="flex items-center gap-1.5"><BadgeCheck className="w-4 h-4 text-brand-pink" /> 100% Genuine Guidance</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Never Asks For Passwords</span>
                <span className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-sky-500" /> WhatsApp &amp; Call Support</span>
              </div>
            </div>

            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-md rounded-3xl p-6 sm:p-7 bg-white dark:bg-[#141414] border-2 border-[#EAEAEA] dark:border-[#262626] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-brand-pink/10 to-[#6C3CE0]/10 blur-2xl rounded-full pointer-events-none" aria-hidden="true" />
                <div className="flex items-center justify-between border-b border-neutral-100 dark:border-[#222] pb-4 mb-5">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500" />
                    <span className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                  </div>
                  <span className="text-[11px] font-mono font-black uppercase tracking-wider text-neutral-400">PTE EXAM BOOKING</span>
                </div>
                <div className="space-y-3.5 mb-6">
                  {[
                    { label: 'Test Type', value: 'PTE Academic / Core / UKVI', tint: '#005A9C' },
                    { label: 'Preferred City', value: 'Delhi, Mumbai, Chandigarh & more', tint: '#FF005C' },
                    { label: 'Test Centre', value: 'Select Nearest Authorized Centre', tint: '#6C3CE0' },
                    { label: 'Preferred Date', value: 'Custom Slots & Morning/Afternoon', tint: '#10B981' },
                  ].map((item) => (
                    <div key={item.label} className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-[#1B1B1B] border border-neutral-100 dark:border-[#282828] flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-extrabold text-neutral-400 uppercase">{item.label}</div>
                        <div className="text-xs font-black text-neutral-900 dark:text-white">{item.value}</div>
                      </div>
                      <div className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-black">✓</div>
                    </div>
                  ))}
                </div>
                <div className="p-3.5 rounded-2xl bg-[#FFF0F5] dark:bg-[#200A13] border border-brand-pink/20 flex items-center justify-between text-xs font-black">
                  <div className="flex items-center gap-2 text-brand-pink"><Sparkles className="w-4 h-4" /> Booking Assistance</div>
                  <span className="text-neutral-600 dark:text-neutral-300 font-bold">Apex Vouchers</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dynamic PTE Exam Booking Services (PTE Academic, PTE Core, PTE Academic UKVI) with Special Booking Prices & Cart Integration */}
      <PTEBookingAssistance catalog={catalog} />

      <section ref={formRef} id="booking-form-section" className="py-16 sm:py-20 bg-neutral-50/60 dark:bg-[#0E0E0E] border-b border-[#EAEAEA] dark:border-[#222]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {submittedData ? (
            <div className="rounded-3xl p-6 sm:p-10 bg-white dark:bg-[#141414] border-2 border-emerald-500/50 shadow-2xl text-center animate-in fade-in slide-in-from-bottom-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-5 shadow-lg">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-900/50">
                {submittedData.duplicate ? 'REQUEST ALREADY EXISTS' : 'REQUEST SUBMITTED SUCCESSFULLY'}
              </span>
              <h2 className="font-heading font-black text-2xl sm:text-3xl text-neutral-900 dark:text-white mt-3">
                {submittedData.duplicate ? 'We Already Have Your Booking Request' : "We've Received Your Booking Request"}
              </h2>
              <div className="my-6 p-4 sm:p-5 rounded-2xl bg-neutral-50 dark:bg-[#1C1C1C] border border-[#EAEAEA] dark:border-[#292929] inline-flex flex-col sm:flex-row items-center gap-3 sm:gap-6 justify-center">
                <div className="text-left">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">Your Request ID</div>
                  <div className="font-mono font-black text-lg sm:text-xl text-brand-pink">{submittedData.requestId}</div>
                </div>
                <button type="button" onClick={() => copyRequestId(submittedData.requestId)} className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#121212] border border-[#EAEAEA] dark:border-[#292929] hover:border-brand-pink text-xs font-black flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer">
                  {copiedId ? <><Check className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-600 dark:text-emerald-400">Copied</span></> : <><Copy className="w-3.5 h-3.5 text-neutral-500" /><span>Copy ID</span></>}
                </button>
              </div>
              <div className="max-w-md mx-auto p-4 rounded-2xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#262626] text-left text-xs font-bold space-y-2 mb-6">
                <div className="flex items-center justify-between"><span className="text-neutral-400">Exam:</span><span className="text-neutral-900 dark:text-white font-black">{submittedData.examType}</span></div>
                <div className="flex items-center justify-between"><span className="text-neutral-400">City:</span><span className="text-neutral-900 dark:text-white font-black">{submittedData.preferredCity}</span></div>
                {submittedData.preferredDate && <div className="flex items-center justify-between"><span className="text-neutral-400">Date:</span><span className="text-neutral-900 dark:text-white font-black">{submittedData.preferredDate}</span></div>}
                <div className="flex items-center justify-between"><span className="text-neutral-400">Time:</span><span className="text-neutral-900 dark:text-white font-black">{submittedData.preferredTime}</span></div>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 font-medium leading-relaxed max-w-lg mx-auto mb-6">
                Our team will review your booking preferences and contact you using the details provided to assist with scheduling through Pearson&apos;s official process.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a href={whatsappHref(`Hello Apex Vouchers, I submitted PTE booking assistance request ${submittedData.requestId} and need help with my booking.`)} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-colors">
                  <MessageCircle className="w-4 h-4" /> Chat on WhatsApp for Faster Assistance
                </a>
                <button type="button" onClick={resetForm} className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-neutral-100 dark:bg-[#1E1E1E] text-neutral-800 dark:text-neutral-200 font-extrabold text-xs hover:bg-neutral-200 dark:hover:bg-[#282828] transition-colors cursor-pointer">
                  Back to Exam Booking Form
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl p-6 sm:p-10 bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] shadow-xl">
              <div className="text-center max-w-xl mx-auto mb-8">
                <span className="text-xs font-black uppercase tracking-widest text-brand-pink">QUICK ASSISTANCE FORM</span>
                <h2 className="font-heading font-black text-2xl sm:text-3xl text-neutral-900 dark:text-white mt-1">Tell Us What You Need</h2>
                <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 font-medium mt-2">Share your preferred exam and booking details. Our team will review your request and guide you through the next step.</p>
              </div>

              {submitError && (
                <div className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" /> <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-2">Select PTE Test <span className="text-brand-pink">*</span></label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {EXAM_TYPE_OPTIONS.map((opt) => {
                      const isSelected = examType === opt.id;
                      return (
                        <button key={opt.id} type="button" onClick={() => setExamType(opt.id)} className={`p-4 rounded-2xl border-2 text-left transition-all relative cursor-pointer ${isSelected ? 'border-brand-pink bg-[#FFF0F5] dark:bg-[#250915] shadow-md' : 'border-[#EAEAEA] dark:border-[#292929] bg-neutral-50/50 dark:bg-[#181818] hover:border-neutral-300 dark:hover:border-neutral-700'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md text-white" style={{ backgroundColor: opt.tint }}>{opt.badge}</span>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-pink" />}
                          </div>
                          <div className="font-heading font-black text-sm text-neutral-900 dark:text-white">{opt.label}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="fullName" className="block text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Full Legal Name <span className="text-brand-pink">*</span></label>
                    <input id="fullName" type="text" placeholder="As per your official ID / Passport" value={fullName} onChange={(e) => { setFullName(e.target.value); if (errors.fullName) setErrors({ ...errors, fullName: '' }); }} className={inputCls(!!errors.fullName)} />
                    {errors.fullName && <p className="text-[11px] font-bold text-rose-500 mt-1">{errors.fullName}</p>}
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Email Address <span className="text-brand-pink">*</span></label>
                    <input id="email" type="email" placeholder="name@example.com" value={email} onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({ ...errors, email: '' }); }} className={inputCls(!!errors.email)} />
                    {errors.email && <p className="text-[11px] font-bold text-rose-500 mt-1">{errors.email}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="phone" className="block text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Mobile Number (WhatsApp) <span className="text-brand-pink">*</span></label>
                  <PhoneInput value={phone} country="IN" onChange={(val) => { setPhone(val); if (errors.phone) setErrors({ ...errors, phone: '' }); }} error={errors.phone} id="phone" />
                  {errors.phone && <p className="text-[11px] font-bold text-rose-500 mt-1">{errors.phone}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="block text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Preferred City <span className="text-brand-pink">*</span></label>
                    <div onClick={() => setCityDropdownOpen(!cityDropdownOpen)} className={`w-full px-4 py-3 rounded-2xl bg-neutral-50 dark:bg-[#1A1A1A] border text-xs sm:text-sm font-bold flex items-center justify-between cursor-pointer transition-colors ${errors.preferredCity ? 'border-rose-500' : 'border-[#EAEAEA] dark:border-[#292929] hover:border-brand-pink'}`}>
                      <span className={preferredCity ? 'text-neutral-900 dark:text-white' : 'text-neutral-400'}>{preferredCity ? preferredCity : 'Select city...'}</span>
                      <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${cityDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>
                    {cityDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 z-30 mt-1.5 p-2 rounded-2xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-2xl animate-in fade-in slide-in-from-top-2">
                        <div className="p-2 border-b border-neutral-100 dark:border-[#222] flex items-center gap-2">
                          <Search className="w-3.5 h-3.5 text-neutral-400" />
                          <input type="text" placeholder="Filter cities..." value={citySearch} onChange={(e) => setCitySearch(e.target.value)} onClick={(e) => e.stopPropagation()} className="w-full bg-transparent text-xs font-bold outline-none" />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 py-1">
                          {filteredCities.map((c) => (
                            <button key={c.name} type="button" onClick={() => { setPreferredCity(c.name); setCityDropdownOpen(false); if (errors.preferredCity) setErrors({ ...errors, preferredCity: '' }); }} className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${preferredCity === c.name ? 'bg-[#FFF0F5] dark:bg-[#280B17] text-brand-pink' : 'hover:bg-neutral-100 dark:hover:bg-[#202020] text-neutral-800 dark:text-neutral-200'}`}>
                              <span>{c.name}</span><span className="text-[10px] text-neutral-400">{c.state}</span>
                            </button>
                          ))}
                          <button type="button" onClick={() => { setPreferredCity('Other'); setCityDropdownOpen(false); }} className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold transition-colors cursor-pointer ${preferredCity === 'Other' ? 'bg-[#FFF0F5] dark:bg-[#280B17] text-brand-pink' : 'hover:bg-neutral-100 dark:hover:bg-[#202020] text-neutral-500'}`}>
                            + Other City (Enter Manually)
                          </button>
                        </div>
                      </div>
                    )}
                    {errors.preferredCity && <p className="text-[11px] font-bold text-rose-500 mt-1">{errors.preferredCity}</p>}
                  </div>
                  <div>
                    <label htmlFor="preferredTestCentre" className="block text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Preferred Test Centre <span className="text-neutral-400 font-normal">(Optional)</span></label>
                    <input id="preferredTestCentre" type="text" placeholder="e.g. Pearson Professional Centre" value={preferredTestCentre} onChange={(e) => setPreferredTestCentre(e.target.value)} className={inputCls(false)} />
                  </div>
                </div>

                {preferredCity === 'Other' && (
                  <div>
                    <label htmlFor="otherCity" className="block text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Specify City Name <span className="text-brand-pink">*</span></label>
                    <input id="otherCity" type="text" placeholder="Enter city or town name" value={otherCity} onChange={(e) => { setOtherCity(e.target.value); if (errors.otherCity) setErrors({ ...errors, otherCity: '' }); }} className={inputCls(!!errors.otherCity)} />
                    {errors.otherCity && <p className="text-[11px] font-bold text-rose-500 mt-1">{errors.otherCity}</p>}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="preferredDate" className="block text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Preferred Date</label>
                    <input id="preferredDate" type="date" min={todayISO()} value={preferredDate} onChange={(e) => { setPreferredDate(e.target.value); if (errors.preferredDate) setErrors({ ...errors, preferredDate: '' }); }} className={inputCls(!!errors.preferredDate)} />
                    {errors.preferredDate && <p className="text-[11px] font-bold text-rose-500 mt-1">{errors.preferredDate}</p>}
                  </div>
                  <div>
                    <label htmlFor="preferredTime" className="block text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Preferred Time</label>
                    <select id="preferredTime" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} className={inputCls(false)}>
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="alternativeDate" className="block text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Alternative Date <span className="text-neutral-400 font-normal">(Optional)</span></label>
                    <input id="alternativeDate" type="date" min={todayISO()} value={alternativeDate} onChange={(e) => { setAlternativeDate(e.target.value); if (errors.alternativeDate) setErrors({ ...errors, alternativeDate: '' }); }} className={inputCls(!!errors.alternativeDate)} />
                    {errors.alternativeDate && <p className="text-[11px] font-bold text-rose-500 mt-1">{errors.alternativeDate}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="additionalRequirements" className="block text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Additional Requirements or Questions <span className="text-neutral-400 font-normal">(Optional)</span></label>
                  <textarea id="additionalRequirements" rows={3} placeholder="Tell us if you have a preferred centre, flexible dates, or any other booking preference." value={additionalRequirements} onChange={(e) => setAdditionalRequirements(e.target.value)} className={`${inputCls(false)} resize-none`} />
                </div>

                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#292929]">
                  <label className="flex items-start gap-3 cursor-pointer text-xs font-bold text-neutral-700 dark:text-neutral-300">
                    <input type="checkbox" checked={termsAccepted} onChange={(e) => { setTermsAccepted(e.target.checked); if (errors.termsAccepted) setErrors({ ...errors, termsAccepted: '' }); }} className="w-4 h-4 mt-0.5 rounded border-neutral-300 text-brand-pink focus:ring-brand-pink" />
                    <span>I confirm that the information provided is correct and understand that this is a <strong className="text-brand-pink">booking assistance request</strong>, not a guaranteed exam slot.</span>
                  </label>
                  {errors.termsAccepted && <p className="text-[11px] font-bold text-rose-500 mt-1.5 ml-7">{errors.termsAccepted}</p>}
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full btn-pink py-4 text-sm sm:text-base font-extrabold flex items-center justify-center gap-2 shadow-xl hover:shadow-brand-pink/30 disabled:opacity-60 cursor-pointer">
                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Submitting Booking Request...</span></> : <><span>Request Booking Assistance</span><ArrowRight className="w-5 h-5" /></>}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      <section ref={howItWorksRef} id="how-it-works-section" className="py-16 sm:py-24 border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-xs font-black uppercase tracking-widest text-brand-pink">SIMPLE 4-STEP PROCESS</span>
            <h2 className="font-heading font-black text-3xl sm:text-4xl lg:text-5xl tracking-tight text-neutral-900 dark:text-white mt-2">How PTE Exam Booking Works</h2>
            <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 font-medium mt-3">A clear, transparent process from choosing your test to getting your booking details ready.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            <div className="hidden lg:block absolute top-10 left-12 right-12 h-0.5 bg-neutral-200 dark:bg-[#292929] z-0" aria-hidden="true" />
            {[
              { step: '01', title: 'Choose Your PTE Test', desc: 'Select PTE Academic, PTE Core, or PTE Academic UKVI based on your specific university or immigration route.', tint: '#005A9C' },
              { step: '02', title: 'Share Your Preferences', desc: 'Tell us your preferred city, centre, preferred exam date, time slot, and alternative dates.', tint: '#FF005C' },
              { step: '03', title: 'Get Booking Guidance', desc: 'Our team reviews your request and personally guides you through the official Pearson booking steps.', tint: '#6C3CE0' },
              { step: '04', title: 'Confirm Your Appointment', desc: 'The exam appointment is officially confirmed once processed through Pearson\'s official booking system.', tint: '#10B981' },
            ].map((s) => (
              <div key={s.step} className="relative z-10 rounded-3xl p-6 bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-mono font-black text-sm mb-5" style={{ backgroundColor: `${s.tint}15`, color: s.tint }}>{s.step}</div>
                <h3 className="font-heading font-black text-lg text-neutral-900 dark:text-white mb-2">{s.title}</h3>
                <p className="text-xs sm:text-sm font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="py-16 sm:py-24 bg-neutral-50/60 dark:bg-[#0D0D0D] border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-xs font-black uppercase tracking-widest text-brand-pink">WHY CHOOSE APEX VOUCHERS</span>
            <h2 className="font-heading font-black text-3xl sm:text-4xl lg:text-5xl tracking-tight text-neutral-900 dark:text-white mt-2">More Than a Voucher</h2>
            <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 font-medium mt-3">We provide human guidance, transparent processes, and dedicated booking support every step of the way.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Clear Guidance', desc: 'Understand the booking process, requirements, and timeline before you proceed.' },
              { title: 'Right Test Selection', desc: 'Get unbiased guidance on the differences between PTE Academic, PTE Core, and PTE UKVI.' },
              { title: 'Booking Support', desc: 'Get human help preparing all personal and identification details required for booking.' },
              { title: 'Transparent Process', desc: 'Know exactly what happens at each stage of your booking assistance request.' },
              { title: 'Customer Support', desc: 'Get fast assistance by email, WhatsApp, and phone whenever you have questions.' },
              { title: 'Official Voucher Discounts', desc: 'Save significantly on official Pearson exam fees with our genuine instant vouchers.' },
            ].map((card) => (
              <div key={card.title} className="rounded-3xl p-6 bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                <div className="w-10 h-10 rounded-2xl bg-[#FFF0F5] dark:bg-[#2A0A17] text-brand-pink flex items-center justify-center mb-4"><HelpCircle className="w-5 h-5" /></div>
                <h3 className="font-heading font-black text-lg text-neutral-900 dark:text-white mb-2">{card.title}</h3>
                <p className="text-xs sm:text-sm font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="py-16 sm:py-24 border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-black uppercase tracking-widest text-brand-pink">EXAM SELECTION GUIDE</span>
            <h2 className="font-heading font-black text-3xl sm:text-4xl lg:text-5xl tracking-tight text-neutral-900 dark:text-white mt-2">Which PTE Test Do You Need?</h2>
            <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 font-medium mt-3">Different PTE tests serve different purposes. Make sure you choose the one required for your application.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {EXAM_TYPE_OPTIONS.map((card) => (
              <div key={card.id} className="rounded-3xl p-6 sm:p-7 bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] hover:border-brand-pink hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full text-white shadow-sm" style={{ backgroundColor: card.tint }}>{card.badge}</span>
                  </div>
                  <h3 className="font-heading font-black text-xl text-neutral-900 dark:text-white mb-2">{card.label}</h3>
                  <p className="text-xs sm:text-sm font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed mb-6">{card.desc}</p>
                </div>
                <button onClick={() => { setExamType(card.id); scrollToForm(); }} className="w-full py-3 rounded-xl bg-neutral-100 dark:bg-[#202020] group-hover:bg-brand-pink text-neutral-900 dark:text-white group-hover:text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer">
                  Book {card.label} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="p-4 sm:p-5 rounded-2xl bg-neutral-50 dark:bg-[#121212] border border-[#EAEAEA] dark:border-[#262626] text-xs font-bold text-neutral-600 dark:text-neutral-400 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p><strong>Important Disclaimer:</strong> Not sure which test you need? Confirm the required test with your university, immigration authority, visa requirements or the official Pearson PTE information before booking. Apex Vouchers provides guidance based on publicly available requirements but does not make official visa decisions.</p>
          </div>
        </Reveal>
      </section>

      {pteVouchers.length > 0 && (
        <section className="py-16 sm:py-24 bg-neutral-50/60 dark:bg-[#0D0D0D] border-b border-[#EAEAEA] dark:border-[#222]">
          <Reveal className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-brand-pink"><Ticket className="w-3.5 h-3.5" /> REAL, GENUINE SAVINGS</span>
              <h2 className="font-heading font-black text-3xl sm:text-4xl lg:text-5xl tracking-tight text-neutral-900 dark:text-white mt-2">Save With an Official PTE Voucher</h2>
              <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 font-medium mt-3">Buy a genuine discounted exam voucher and apply the code directly at the Pearson checkout step when you book.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {pteVouchers.map((product) => (
                <div key={product.id} className="rounded-3xl p-6 sm:p-7 bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-[#FFF0F5] dark:bg-[#2A0A17] text-brand-pink border border-brand-pink/20">{product.badge || 'EXAM VOUCHER'}</span>
                  </div>
                  <h3 className="font-heading font-black text-xl text-neutral-900 dark:text-white mb-1.5">{product.name}</h3>
                  <p className="text-xs sm:text-sm font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed mb-5">{product.shortDescription || product.description}</p>
                  {(() => {
                    const priced = unitDisplayPrice(product, undefined, currency);
                    const savings = Math.max(0, priced.original - priced.current);
                    return (
                      <div className="flex items-end gap-2.5 mb-4">
                        <span className="font-heading font-black text-2xl sm:text-3xl text-neutral-900 dark:text-white">{formatPrice(priced.current, priced.currency)}</span>
                        <span className="text-sm font-bold text-neutral-400 line-through mb-1">{formatPrice(priced.original, priced.currency)}</span>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 mb-1">Save {formatPrice(savings, priced.currency)}</span>
                      </div>
                    );
                  })()}
                  <button onClick={() => router.push(`/exam-vouchers/${product.slug}`)} className="mt-auto w-full btn-pink py-3.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-md">
                    View &amp; Buy This Voucher <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-center text-xs font-medium text-neutral-400 mt-6 max-w-2xl mx-auto">Vouchers are applied at the official Pearson checkout step, not on this page. Prices shown are live prices from our voucher shop.</p>
          </Reveal>
        </section>
      )}

      <section className="py-16 sm:py-24 border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-black uppercase tracking-widest text-brand-pink">NATIONWIDE ASSISTANCE</span>
            <h2 className="font-heading font-black text-3xl sm:text-4xl tracking-tight text-neutral-900 dark:text-white mt-2">Find a PTE Test Centre Near You</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium mt-2">Assisting test takers across major Indian cities with authorized Pearson test centres.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
            {visibleCoverageCities.map((city) => (
              <button key={city.name} type="button" onClick={() => { setPreferredCity(city.name); scrollToForm(); }} className="p-3.5 rounded-2xl bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] hover:border-brand-pink hover:bg-[#FFF0F5] dark:hover:bg-[#200A13] text-left transition-all group cursor-pointer">
                <div className="flex items-center gap-1.5 text-neutral-400 group-hover:text-brand-pink text-xs font-bold mb-1"><MapPin className="w-3.5 h-3.5" /><span>{city.state.split('/')[0]}</span></div>
                <div className="font-heading font-black text-sm text-neutral-900 dark:text-white group-hover:text-brand-pink">{city.name}</div>
              </button>
            ))}
          </div>
          {sortedCoverageCities.length > 12 && (
            <div className="text-center mb-8">
              <button type="button" onClick={() => setCitiesExpanded((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-black text-brand-pink hover:underline cursor-pointer">
                <span>{citiesExpanded ? 'Show fewer cities' : `Show all ${sortedCoverageCities.length} cities`}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${citiesExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}
          <div className="rounded-3xl p-6 sm:p-8 bg-neutral-50 dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1.5 text-center md:text-left">
              <span className="text-[11px] font-black uppercase tracking-widest text-brand-pink">OFFICIAL AVAILABILITY GUIDANCE</span>
              <p className="text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-xl">Test centres, dates and available times can change as appointments are booked, cancelled or rescheduled. Check current official Pearson availability directly.</p>
            </div>
            <a href="https://www.pearsonpte.com/test-centers-and-fees" target="_blank" rel="noopener noreferrer" className="px-6 py-3.5 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-extrabold text-xs flex items-center gap-2 shadow-md hover:opacity-90 transition-opacity shrink-0">
              Check Official PTE Availability <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </Reveal>
      </section>

      <section className="py-16 sm:py-24 bg-neutral-50/60 dark:bg-[#0D0D0D] border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-brand-pink"><ListChecks className="w-3.5 h-3.5" /> PREPARATION CHECKLIST</span>
            <h2 className="font-heading font-black text-3xl sm:text-4xl tracking-tight text-neutral-900 dark:text-white mt-2">Before You Book Your PTE Exam</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BEFORE_YOU_BOOK_CHECKLIST.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 p-4 rounded-2xl bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626]">
                <div className="w-8 h-8 rounded-xl bg-[#FFF0F5] dark:bg-[#2A0A17] text-brand-pink flex items-center justify-center shrink-0"><FileCheck className="w-4 h-4" /></div>
                <span className="text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-200 leading-relaxed pt-1">{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-300 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <span>Double-check your personal details before confirming your booking. Small mismatches can delay your appointment.</span>
          </div>
        </Reveal>
      </section>

      <section className="py-16 sm:py-24 border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-brand-pink"><Ban className="w-3.5 h-3.5" /> AVOID THESE PITFALLS</span>
            <h2 className="font-heading font-black text-3xl sm:text-4xl tracking-tight text-neutral-900 dark:text-white mt-2">Common Booking Mistakes to Avoid</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {BOOKING_MISTAKES.map((m, idx) => (
              <div key={idx} className="flex items-start gap-3 p-5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-heading font-black text-sm text-neutral-900 dark:text-white mb-1">{m.title}</h3>
                  <p className="text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-300 leading-relaxed">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="py-16 sm:py-20 border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl p-8 sm:p-10 bg-linear-to-br from-[#121A2D] to-[#0A0E17] text-white border border-slate-800 shadow-2xl relative overflow-hidden">
            <div className="flex items-center gap-3 text-sky-400 text-xs font-black uppercase tracking-wider mb-3"><Lock className="w-4 h-4" /> SECURITY &amp; PRIVACY GUARANTEE</div>
            <h2 className="font-heading font-black text-2xl sm:text-4xl text-white tracking-tight">Your Booking. Your Account. Your Control.</h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed mt-3 font-medium">
              Keep control of your official Pearson account and personal credentials. Apex Vouchers will <strong className="text-white">never ask you to share your Pearson password, OTP, UPI PIN, or bank credentials</strong> through our website or support team.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800 text-xs font-bold text-slate-300">
              <div className="flex items-center gap-2"><span className="text-emerald-400 font-black">✓</span><span>You own your myPTE login</span></div>
              <div className="flex items-center gap-2"><span className="text-emerald-400 font-black">✓</span><span>No password collection</span></div>
              <div className="flex items-center gap-2"><span className="text-emerald-400 font-black">✓</span><span>Secure data handling</span></div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="py-16 sm:py-20 bg-neutral-50/50 dark:bg-[#0D0D0D] border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-black uppercase tracking-widest text-brand-pink">WHAT HAPPENS AFTER YOU BOOK</span>
            <h2 className="font-heading font-black text-2xl sm:text-3xl text-neutral-900 dark:text-white mt-1">Booking Request vs Official Confirmation</h2>
            <p className="text-xs sm:text-sm text-neutral-500 font-medium mt-2">Understanding what happens after you submit your assistance request.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 max-w-5xl mx-auto relative">
            <div className="hidden sm:block absolute top-8 left-8 right-8 h-0.5 bg-neutral-200 dark:bg-[#292929] z-0" aria-hidden="true" />
            {[
              { status: 'Request Submitted', desc: 'Your preferred city, exam, and dates are safely received by our team.' },
              { status: 'Under Review', desc: 'Our team evaluates test centre schedules and requirements.' },
              { status: 'Booking Guidance', desc: 'We coordinate with you on official Pearson scheduling steps.' },
              { status: 'Official Confirmation', desc: 'Your appointment is confirmed once Pearson officially issues your admit card.' },
            ].map((item, idx) => (
              <div key={idx} className="relative z-10 p-5 rounded-2xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
                <div className="w-7 h-7 rounded-xl bg-neutral-100 dark:bg-[#222] font-mono font-black text-xs flex items-center justify-center text-brand-pink mb-3">0{idx + 1}</div>
                <h4 className="font-heading font-black text-sm text-neutral-900 dark:text-white mb-1.5">{item.status}</h4>
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="py-16 sm:py-20 border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-left">
          <div className="rounded-3xl p-8 bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] shadow-md space-y-4">
            <span className="text-xs font-black uppercase tracking-widest text-sky-600 dark:text-sky-400">FLEXIBILITY &amp; CONTINGENCY</span>
            <h2 className="font-heading font-black text-2xl sm:text-3xl text-neutral-900 dark:text-white">What If My Preferred Slot Isn&apos;t Available?</h2>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300 leading-relaxed">Test centre availability can change quickly. If your preferred date, time or centre is unavailable, our team can help you evaluate the alternatives you provided in your request:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs font-bold text-neutral-700 dark:text-neutral-200">
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#282828] flex items-center gap-2"><Clock className="w-4 h-4 text-brand-pink" /> Try alternative morning or afternoon slots</div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#282828] flex items-center gap-2"><Calendar className="w-4 h-4 text-brand-pink" /> Try adjacent dates in the same week</div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#282828] flex items-center gap-2"><Building2 className="w-4 h-4 text-brand-pink" /> Try another authorized centre in the same city</div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#282828] flex items-center gap-2"><MapPin className="w-4 h-4 text-brand-pink" /> Check available centres in nearby cities</div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="py-16 sm:py-20 bg-neutral-50/60 dark:bg-[#0D0D0D] border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-brand-pink"><RefreshCcw className="w-3.5 h-3.5" /> CHANGING YOUR PLANS?</span>
            <h2 className="font-heading font-black text-3xl sm:text-4xl tracking-tight text-neutral-900 dark:text-white mt-2">Can I Reschedule or Cancel My PTE Exam?</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium mt-3">Rescheduling and cancellation are governed entirely by Pearson&apos;s official policy — not by Apex Vouchers. Always check the latest official terms before requesting a change.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-6 rounded-3xl bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] shadow-sm">
              <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-4"><RefreshCcw className="w-5 h-5" /></div>
              <h3 className="font-heading font-black text-lg text-neutral-900 dark:text-white mb-2">Rescheduling</h3>
              <p className="text-xs sm:text-sm font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed">You can reschedule your appointment directly through your official myPTE account, subject to Pearson&apos;s deadlines and any applicable fee.</p>
            </div>
            <div className="p-6 rounded-3xl bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] shadow-sm">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4"><Ban className="w-5 h-5" /></div>
              <h3 className="font-heading font-black text-lg text-neutral-900 dark:text-white mb-2">Cancellation &amp; Refunds</h3>
              <p className="text-xs sm:text-sm font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed">Cancellation eligibility and any refund amount are determined solely by Pearson&apos;s official policy at the time of your request.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="https://www.pearsonpte.com/help" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-extrabold text-xs flex items-center justify-center gap-2 shadow-md hover:opacity-90 transition-opacity">
              Read Pearson&apos;s Official Policy <ExternalLink className="w-4 h-4" />
            </a>
            <a href={whatsappHref('Hello Apex Vouchers, I need help understanding PTE reschedule/cancellation options.')} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-colors">
              <MessageCircle className="w-4 h-4" /> Ask Us on WhatsApp
            </a>
          </div>
        </Reveal>
      </section>

      <section className="py-16 sm:py-24 bg-neutral-50/60 dark:bg-[#0D0D0D] border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-black uppercase tracking-widest text-brand-pink">QUESTIONS &amp; ANSWERS</span>
            <h2 className="font-heading font-black text-3xl sm:text-4xl text-neutral-900 dark:text-white mt-1">PTE Exam Booking FAQs</h2>
            <p className="text-xs sm:text-sm text-neutral-500 font-medium mt-2">Everything you need to know about PTE exam booking assistance with Apex Vouchers.</p>
          </div>
          <FaqAccordion faqs={FAQ_LIST.map((f) => ({ question: f.q, answer: f.a }))} />
        </Reveal>
      </section>

      <section className="py-16 sm:py-24 border-b border-[#EAEAEA] dark:border-[#222]">
        <Reveal className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="rounded-3xl p-8 sm:p-14 bg-linear-to-tr from-[#FFF0F5] via-white to-[#F3EEFF] dark:from-[#1E0914] dark:via-[#141414] dark:to-[#160D26] border-2 border-brand-pink/30 shadow-2xl relative overflow-hidden">
            <span className="text-xs font-black uppercase tracking-widest text-brand-pink">READY TO BOOK YOUR PTE EXAM?</span>
            <h2 className="font-heading font-black text-3xl sm:text-5xl text-neutral-900 dark:text-white mt-2 tracking-tight">Tell Us Your Preferences</h2>
            <p className="text-sm sm:text-base font-medium text-neutral-600 dark:text-neutral-300 max-w-xl mx-auto mt-3">Choose your preferred test, date and centre and we&apos;ll guide you through the next step with 100% genuine support.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
              <button onClick={scrollToForm} className="w-full sm:w-auto btn-pink py-4 px-8 text-sm font-black flex items-center justify-center gap-2 shadow-xl cursor-pointer">
                Book My PTE Exam <ArrowRight className="w-4 h-4" />
              </button>
              <a href={whatsappHref('Hello Apex Vouchers, I have a question about PTE exam booking assistance.')} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:opacity-90 transition-opacity">
                <MessageCircle className="w-4 h-4 text-emerald-400 dark:text-emerald-600" /> Need Help? Contact Support
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="py-12 bg-neutral-50/50 dark:bg-[#06070B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-2xl bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626]">
            <div>
              <h3 className="font-heading font-black text-base text-neutral-900 dark:text-white">Need Help Before You Book?</h3>
              <p className="text-xs text-neutral-500 font-medium">Contact our support team directly for immediate assistance with your PTE test choice.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a href={`tel:${supportPhone.replace(/\s+/g, '')}`} className="px-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-[#202020] text-xs font-black flex items-center gap-2 hover:text-brand-pink transition-colors">
                <Phone className="w-3.5 h-3.5 text-brand-pink" /> <span>{supportPhone}</span>
              </a>
              <a href={`mailto:${supportEmail}`} className="px-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-[#202020] text-xs font-black flex items-center gap-2 hover:text-brand-pink transition-colors">
                <Mail className="w-3.5 h-3.5 text-brand-pink" /> <span>{supportEmail}</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {!submittedData && (
        <div className={`fixed bottom-0 inset-x-0 z-30 transition-transform duration-300 ease-out ${showStickyCta ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}>
          <div className="bg-white/95 dark:bg-[#111111]/95 backdrop-blur-md border-t border-[#EAEAEA] dark:border-[#262626] shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
            <div className="max-w-7xl mx-auto pl-4 sm:pl-6 lg:pl-8 pr-24 sm:pr-28 py-3 flex items-center justify-between gap-4">
              <div className="hidden sm:flex items-center gap-2 min-w-0">
                <BadgeCheck className="w-4 h-4 text-brand-pink shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-200 truncate">Ready to book your PTE exam?</span>
              </div>
              <button onClick={scrollToForm} className="w-full sm:w-auto btn-pink py-2.5 px-6 text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg cursor-pointer">
                Book PTE Exam <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
