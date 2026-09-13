'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
import { X, ShieldCheck, Lock, CheckCircle2, QrCode, CreditCard, Sparkles, ArrowRight, Copy, Check, AlertCircle, ExternalLink, LogIn, Mail, Calendar, Info } from 'lucide-react';
import { ApexLogo } from '@/components/apex-logo';
import { useAuth } from '@/components/auth-provider';
import { useCart } from '@/components/cart-provider';
import { useVoucher } from '@/components/voucher-provider';
import { accountApi, paymentApi, formatPrice as fmt, type ApiResponse } from '@/lib/api';
import { unitDisplayPrice } from '@/lib/pricing';

const RAZORPAY_SDK_URL = 'https://checkout.razorpay.com/v1/checkout.js';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (resp: unknown) => void) => void };
  }
}

const loadRazorpaySdk = (): Promise<Window['Razorpay'] | null> =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const existing = document.querySelector(`script[src="${RAZORPAY_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Razorpay || null));
      existing.addEventListener('error', () => resolve(null));
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.Razorpay || null);
    script.onerror = () => resolve(null);
    document.body.appendChild(script);
  });

interface CompletedOrder {
  orderNo?: string;
  emailStatus?: string;
  fulfillmentStatus?: string;
  orderStatus?: string;
  pendingFulfillment?: boolean;
  paymentStatus?: string;
  paidAt?: string;
  [key: string]: unknown;
}

interface CompletedVoucher {
  productName?: string;
  voucherType?: string;
  code: string;
  expiryDate: string;
  officialWebsiteUrl?: string;
  [key: string]: unknown;
}

/**
 * Real Razorpay checkout wired to the existing Express payment endpoints.
 * The browser never decides a payment succeeded — it only renders what the
 * backend's /verify, /reconcile, or /order/:id status endpoints report after
 * signature verification and gateway re-checks.
 */
export function CheckoutModal() {
  const router = useRouter();
  const { isCheckoutOpen, setIsCheckoutOpen, checkoutProduct, checkoutMeta, handlePurchaseSuccess } = useVoucher();
  const voucherRequestId = checkoutMeta?.voucherRequestId || null;
  const { isAuthenticated, user, login, register } = useAuth();
  const { formatPrice, clearCart, currency } = useCart();

  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card'>('upi');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingState, setProcessingState] = useState<'idle' | 'creating' | 'opening' | 'verifying'>('idle');
  const [isCompleted, setIsCompleted] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);
  const [completedVouchers, setCompletedVouchers] = useState<CompletedVoucher[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [guestLoginTab, setGuestLoginTab] = useState<'login' | 'billing'>(isAuthenticated ? 'billing' : 'login');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [registerMode, setRegisterMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
  const [bookingPrefs, setBookingPrefs] = useState({
    preferredCity: '',
    preferredTestCentre: '',
    preferredDate: '',
    preferredTime: 'Any Time',
    message: '',
  });

  const paymentHandledRef = useRef(false);

  const checkoutItems = useMemo(() => {
    if (!checkoutProduct) return [];
    if (Array.isArray(checkoutProduct)) return checkoutProduct;
    return [{ ...checkoutProduct, quantity: checkoutProduct.quantity || 1 }];
  }, [checkoutProduct]);

  const isPteBooking = useMemo(
    () =>
      checkoutItems.some(
        (it) =>
          it.voucherType === 'PTE-BOOKING' ||
          it.category === 'PTE' ||
          (it.name || '').toLowerCase().includes('pte')
      ),
    [checkoutItems]
  );

  useEffect(() => {
    if (!isCheckoutOpen) return;
    setGuestLoginTab(isAuthenticated ? 'billing' : 'login');
    if (user) {
      setFormData((f) => ({
        ...f,
        name: f.name || user.name || '',
        email: f.email || user.email || '',
        phone: f.phone || (user.phone as string) || '',
      }));
    }
  }, [isCheckoutOpen, isAuthenticated, user]);

  if (!isCheckoutOpen || checkoutItems.length === 0) return null;

  const subtotal = checkoutItems.reduce((acc, it) => {
    const p = unitDisplayPrice(it, it.selectedDuration, currency);
    return acc + p.current * (it.quantity || 1);
  }, 0);

  const totalOriginal = checkoutItems.reduce((acc, it) => {
    const p = unitDisplayPrice(it, it.selectedDuration, currency);
    return acc + p.original * (it.quantity || 1);
  }, 0);
  const totalSavings = Math.max(0, totalOriginal - subtotal);
  const finalPrice = Math.max(0, subtotal - promoDiscount);

  const inrSubtotal = checkoutItems.reduce((s, it) => {
    const p = unitDisplayPrice(it, it.selectedDuration, 'INR');
    return s + p.current * (it.quantity || 1);
  }, 0);

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    if (!isAuthenticated) {
      setPromoError('Please log in first to apply a promo code');
      return;
    }
    setPromoError('');
    const res = await accountApi.validatePromo({
      code: promoCode,
      subtotal: inrSubtotal,
      productIds: checkoutItems.map((it) => it._id || it.id),
    });
    if (res.success && res.valid) {
      setPromoApplied(true);
      setPromoDiscount(res.discount as number);
    } else {
      setPromoApplied(false);
      setPromoDiscount(0);
      setPromoError((res.reason as string) || res.message || 'Invalid promo code');
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = registerMode ? await register(registerForm) : await login(loginForm);
      if (!res.success) {
        setAuthError(res.message || 'Login failed');
      } else {
        setGuestLoginTab('billing');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const showSuccess = (data: unknown, vouchers: unknown, orderRef: { orderNo?: string; _id?: string } | null) => {
    setIsProcessing(false);
    setProcessingState('idle');
    setError('');
    setIsCompleted(true);
    setCompletedOrder((data as CompletedOrder) || (orderRef as CompletedOrder) || null);
    const voucherList = (vouchers as CompletedVoucher[]) || [];
    setCompletedVouchers(voucherList);
    if (voucherList.length > 0) {
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
    }
    clearCart();
    handlePurchaseSuccess({ orderId: (data as CompletedOrder)?.orderNo || orderRef?.orderNo });
  };

  const isPaidResult = (r: ApiResponse | null | undefined) =>
    !!r?.success && (r.paymentStatus === 'PAID' || r.orderStatus === 'FULFILLED' || r.fulfillmentStatus === 'FULFILLED');

  const applyVerifiedResult = (verifyRes: ApiResponse | null | undefined, orderRef: { orderNo?: string; _id?: string } | null) => {
    if (isPaidResult(verifyRes) && !verifyRes?.needsAllocation) {
      showSuccess(verifyRes?.data, verifyRes?.vouchers, orderRef);
      return true;
    }
    if (verifyRes?.needsAllocation) {
      showSuccess(verifyRes.data, [], orderRef);
      return true;
    }
    if (verifyRes?.notCollectable) {
      setIsProcessing(false);
      setProcessingState('idle');
      setError((verifyRes.message as string) || 'We received a payment but this order is closed — our team has been alerted and will contact you.');
      return true;
    }
    if (verifyRes?.failed || verifyRes?.paymentStatus === 'FAILED') {
      setIsProcessing(false);
      setProcessingState('idle');
      setError('This payment did not complete. No voucher was issued — you can safely retry.');
      return true;
    }
    return false;
  };

  const pollFulfilment = async (
    orderId: string,
    orderRef: { orderNo?: string; _id?: string },
    { attempts = 12, delayMs = 2500 }: { attempts?: number; delayMs?: number } = {}
  ) => {
    setProcessingState('verifying');
    for (let i = 0; i < attempts; i += 1) {
      let res: ApiResponse | null = null;
      try {
        res = i === 0 ? await paymentApi.reconcile(orderId).catch(() => paymentApi.getStatus(orderId)) : await paymentApi.getStatus(orderId);
      } catch {
        // keep trying
      }
      if (res && applyVerifiedResult(res, orderRef)) return true;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    setIsProcessing(false);
    setProcessingState('idle');
    setError(
      'Payment received — we are still confirming it with the bank. Your voucher will appear in your Candidate Vault and email within a few minutes. You have not been charged twice.'
    );
    return false;
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isProcessing) return;
    if (!isAuthenticated) {
      setGuestLoginTab('login');
      setError('Please log in or create an account to complete your purchase.');
      return;
    }
    if (!formData.name || (!formData.email && !formData.phone)) {
      setError('Please fill in your name and email/WhatsApp number for voucher delivery.');
      return;
    }
    const hasOutOfStock = checkoutItems.some(
      (it) => it.inStock === false || it.stockStatus === 'OUT OF STOCK'
    );
    if (hasOutOfStock) {
      setError('This product is currently out of stock.');
      return;
    }

    setIsProcessing(true);
    setProcessingState('creating');
    paymentHandledRef.current = false;

    const orderPayload = {
      items: checkoutItems.map((it) => {
        const effectiveDuration =
          it.selectedDuration ||
          (Array.isArray(it.durationOptions)
            ? it.durationOptions.find((o) => o && o.enabled !== false && Number(o.sellingPrice ?? o.displaySellingPrice) > 0)
            : null);
        return {
          productId: it._id || it.id,
          quantity: it.quantity || 1,
          ...(effectiveDuration?.key ? { durationKey: effectiveDuration.key } : {}),
        };
      }),
      promoCode: promoApplied ? promoCode.trim().toUpperCase() : null,
      paymentMethod,
      billing: { ...formData, email: formData.email || user?.email },
      ...(voucherRequestId ? { voucherRequestId } : {}),
      ...(isPteBooking ? { bookingPreferences: bookingPrefs } : {}),
    };

    let createRes: ApiResponse;
    try {
      createRes = await paymentApi.createOrder(orderPayload);
    } catch (err) {
      setIsProcessing(false);
      setProcessingState('idle');
      setError(err instanceof Error ? err.message : 'Could not start checkout. Please try again.');
      return;
    }
    if (!createRes?.success || !createRes.razorpayOrderId || !createRes.keyId) {
      setIsProcessing(false);
      setProcessingState('idle');
      setError((createRes?.message as string) || 'Online payment is temporarily unavailable. Please try again later.');
      return;
    }

    const { orderId, orderNo, amount, currency, razorpayOrderId, keyId, prefill } = createRes as unknown as {
      orderId: string;
      orderNo: string;
      amount: number;
      currency: string;
      razorpayOrderId: string;
      keyId: string;
      prefill?: { name?: string; email?: string; contact?: string };
    };
    const orderRef = { orderNo, _id: orderId };

    setProcessingState('opening');
    const Razorpay = await loadRazorpaySdk();
    if (!Razorpay) {
      setIsProcessing(false);
      setProcessingState('idle');
      setError('Could not load the secure payment window. Check your connection and try again — your order is saved.');
      return;
    }

    const displayConfig = {
      display: {
        blocks: {
          apex_upi: { name: 'Pay via UPI (scan QR / choose an app)', instruments: [{ method: 'upi', flows: ['qr', 'intent'] }] },
          apex_card: { name: 'Cards', instruments: [{ method: 'card' }] },
        },
        sequence: paymentMethod === 'card' ? ['block.apex_card', 'block.apex_upi'] : ['block.apex_upi', 'block.apex_card'],
        preferences: { show_default_blocks: true },
      },
    };

    const rzp = new Razorpay({
      key: keyId,
      order_id: razorpayOrderId,
      amount,
      currency: currency || 'INR',
      name: 'Apex Vouchers',
      description: `Order ${orderNo}`,
      prefill: {
        name: prefill?.name || formData.name || '',
        email: prefill?.email || formData.email || user?.email || '',
        contact: prefill?.contact || formData.phone || '',
      },
      config: displayConfig,
      theme: { color: '#FF005C' },
      modal: {
        escape: true,
        ondismiss: () => {
          if (paymentHandledRef.current) return;
          paymentHandledRef.current = true;
          pollFulfilment(orderId, orderRef, { attempts: 8, delayMs: 2500 }).then((paid) => {
            if (!paid && !isCompleted) {
              setError((prev) => prev || 'Payment window closed. If you completed the payment your voucher will appear in your Candidate Vault shortly; otherwise you can retry — no voucher has been issued.');
            }
          });
        },
      },
      handler: async (resp: unknown) => {
        paymentHandledRef.current = true;
        setProcessingState('verifying');
        const r = resp as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
        try {
          const verifyRes = await paymentApi.verify({
            orderId,
            razorpay_order_id: r.razorpay_order_id,
            razorpay_payment_id: r.razorpay_payment_id,
            razorpay_signature: r.razorpay_signature,
          });
          if (!applyVerifiedResult(verifyRes, orderRef)) {
            await pollFulfilment(orderId, orderRef);
          }
        } catch {
          await pollFulfilment(orderId, orderRef);
        }
      },
    });

    rzp.on('payment.failed', (resp: unknown) => {
      const r = resp as { error?: { description?: string } };
      const reason = r?.error?.description || 'The payment attempt could not be completed.';
      setError(`${reason} If you retried and it went through, your voucher will appear shortly.`);
    });

    rzp.open();
  };

  const handleCopy = (idx: number, code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 3000);
  };

  const handleClose = () => {
    setIsCheckoutOpen(false);
    setIsCompleted(false);
    setCompletedOrder(null);
    setCompletedVouchers([]);
    setPromoApplied(false);
    setPromoDiscount(0);
    setPromoCode('');
    setPromoError('');
    setError('');
    setIsProcessing(false);
    setProcessingState('idle');
    paymentHandledRef.current = false;
    setLoginForm({ email: '', password: '' });
    setRegisterForm({ name: '', email: '', phone: '', password: '' });
  };

  const goAccount = (tab?: string) => {
    handleClose();
    router.push(tab ? `/account?tab=${tab}` : '/account');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[92vh] text-ink transition-colors duration-300">
        <button onClick={handleClose} className="absolute top-5 right-5 p-2 rounded-full bg-surface-raised text-ink-muted hover:text-ink transition-colors cursor-pointer">
          <X className="w-5 h-5" />
        </button>

        {!isCompleted ? (
          <div>
            <div className="mb-6 border-b border-line pb-4">
              <div className="flex items-center gap-2 mb-2">
                <ApexLogo className="h-6" />
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/80 text-success border border-emerald-200">Secure Checkout</span>
              </div>
              <h2 className="font-heading font-medium text-2xl">Complete Exam Voucher Order</h2>
              <p className="text-xs text-ink-muted font-normal">Vouchers appear in your Candidate Vault and email instantly after payment.</p>
            </div>

            {checkoutItems.length === 1 ? (
              <div className="bg-accent/8 p-4 rounded-2xl border border-accent/20 mb-5 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] uppercase font-normal text-accent tracking-wider block">
                    {checkoutItems[0].quantity > 1 ? `Selected Voucher (${checkoutItems[0].quantity}×)` : 'Selected Voucher'}
                  </span>
                  <h4 className="font-heading font-medium text-base leading-snug">{checkoutItems[0].name}</h4>
                  <span className="text-xs font-normal text-success block mt-0.5">Instant Delivery • Valid {checkoutItems[0].validityMonths || 6} months</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-normal text-neutral-400 line-through block">{formatPrice(totalOriginal)}</span>
                  <span className="font-heading font-medium text-2xl text-accent block leading-none">{formatPrice(finalPrice)}</span>
                </div>
              </div>
            ) : (
              <div className="bg-accent/8 p-4 rounded-2xl border border-accent/20 mb-5 space-y-3">
                <div className="flex items-center justify-between border-b border-accent/20 pb-2">
                  <span className="text-[10px] uppercase font-normal text-accent tracking-wider block">
                    Order Summary ({checkoutItems.reduce((acc, it) => acc + (it.quantity || 1), 0)} Vouchers)
                  </span>
                  <div className="text-right">
                    <span className="text-xs font-normal text-neutral-400 line-through mr-2">{formatPrice(totalOriginal)}</span>
                    <span className="font-heading font-medium text-xl text-accent">{formatPrice(finalPrice)}</span>
                  </div>
                </div>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {checkoutItems.map((item, idx) => {
                    const p = unitDisplayPrice(item, item.selectedDuration, currency);
                    return (
                      <div key={item.id || item._id || idx} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-accent">{item.quantity || 1}×</span>
                          <span className="font-normal text-ink line-clamp-1">
                            {item.name}
                            {item.selectedDuration?.label ? <span className="text-[10px] font-bold text-accent"> ({item.selectedDuration.label})</span> : null}
                          </span>
                        </div>
                        <span className="font-medium text-neutral-900 dark:text-white shrink-0">
                          {formatPrice(p.current * (item.quantity || 1))}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {totalSavings > 0 && (
                  <div className="text-[11px] font-normal text-success flex items-center gap-1 pt-1 border-t border-accent/10">
                    <span>🎁 Total Savings: {formatPrice(totalSavings + promoDiscount)}</span>
                  </div>
                )}
              </div>
            )}

            {!isAuthenticated && (
              <div className="mb-5 rounded-2xl border border-line p-4">
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setRegisterMode(false)} className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-medium border cursor-pointer ${!registerMode ? 'bg-accent text-white border-accent' : 'bg-surface-raised text-ink-muted border-line'}`}>
                    Log In
                  </button>
                  <button onClick={() => setRegisterMode(true)} className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-medium border cursor-pointer ${registerMode ? 'bg-accent text-white border-accent' : 'bg-surface-raised text-ink-muted border-line'}`}>
                    Create Account
                  </button>
                </div>
                <form onSubmit={handleAuth} className="space-y-3">
                  {registerMode ? (
                    <>
                      <MiniField label="Full name" value={registerForm.name} onChange={(v) => setRegisterForm({ ...registerForm, name: v })} required />
                      <MiniField label="Email" type="email" value={registerForm.email} onChange={(v) => setRegisterForm({ ...registerForm, email: v })} required />
                      <MiniField label="Phone / WhatsApp" value={registerForm.phone} onChange={(v) => setRegisterForm({ ...registerForm, phone: v })} />
                      <MiniField label="Password (min 6)" type="password" value={registerForm.password} onChange={(v) => setRegisterForm({ ...registerForm, password: v })} required />
                    </>
                  ) : (
                    <>
                      <MiniField label="Email" type="email" value={loginForm.email} onChange={(v) => setLoginForm({ ...loginForm, email: v })} required />
                      <MiniField label="Password" type="password" value={loginForm.password} onChange={(v) => setLoginForm({ ...loginForm, password: v })} required />
                    </>
                  )}
                  {authError && <div className="text-xs font-normal text-rose-700 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 rounded-xl px-3 py-2">{authError}</div>}
                  <button disabled={authLoading} className="w-full px-4 py-3 rounded-xl bg-ink text-surface font-medium text-xs flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer">
                    <LogIn className="w-4 h-4" />
                    {authLoading ? 'Please wait…' : registerMode ? 'Create account & continue' : 'Log in & continue'}
                  </button>
                </form>
              </div>
            )}

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              {isPteBooking && (
                <div className="p-3.5 rounded-2xl bg-[#FFF5F7] dark:bg-[#FF005C]/10 border border-[#FFE0E8] dark:border-[#FF005C]/20 text-xs text-neutral-700 dark:text-neutral-200 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#FF005C] text-white text-[10px] uppercase tracking-wider font-bold">
                      EXAM BOOKING SERVICE
                    </span>
                  </div>
                  <p className="text-xs font-normal leading-relaxed text-neutral-700 dark:text-neutral-200">
                    This payment is for PTE exam booking assistance only. No voucher, voucher code, or voucher credit is included.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <MiniLabel>Full Candidate Name *</MiniLabel>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-line text-sm font-normal focus:outline-none focus:border-accent transition-all"
                  />
                </div>
                <div>
                  <MiniLabel>Email Address *</MiniLabel>
                  <input
                    type="email"
                    required
                    placeholder="name@gmail.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-line text-sm font-normal focus:outline-none focus:border-accent transition-all"
                  />
                </div>
                <div>
                  <MiniLabel>WhatsApp Number *</MiniLabel>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-line text-sm font-normal focus:outline-none focus:border-accent transition-all"
                  />
                </div>

                {isPteBooking && (
                  <div className="sm:col-span-2 pt-2 space-y-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#FF005C]" />
                      <span className="text-xs font-bold text-ink uppercase tracking-wider">Exam Booking Preferences</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-surface-raised border border-line">
                      <div>
                        <MiniLabel>Preferred City</MiniLabel>
                        <input
                          type="text"
                          placeholder="e.g. Mumbai, Bangalore, Delhi"
                          value={bookingPrefs.preferredCity}
                          onChange={(e) => setBookingPrefs({ ...bookingPrefs, preferredCity: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-xs font-normal focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <MiniLabel>Preferred Test Centre (Optional)</MiniLabel>
                        <input
                          type="text"
                          placeholder="e.g. Pearson Professional Centre"
                          value={bookingPrefs.preferredTestCentre}
                          onChange={(e) => setBookingPrefs({ ...bookingPrefs, preferredTestCentre: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-xs font-normal focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <MiniLabel>Preferred Exam Date</MiniLabel>
                        <input
                          type="date"
                          min={new Date().toISOString().slice(0, 10)}
                          value={bookingPrefs.preferredDate}
                          onChange={(e) => setBookingPrefs({ ...bookingPrefs, preferredDate: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-xs font-normal focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <MiniLabel>Preferred Time Slot</MiniLabel>
                        <select
                          value={bookingPrefs.preferredTime}
                          onChange={(e) => setBookingPrefs({ ...bookingPrefs, preferredTime: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-xs font-normal focus:outline-none focus:border-accent"
                        >
                          <option value="Any Time">Any Time</option>
                          <option value="Morning">Morning (09:00 - 12:00)</option>
                          <option value="Afternoon">Afternoon (12:00 - 16:00)</option>
                          <option value="Evening">Evening (16:00 - 20:00)</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <MiniLabel>Additional Notes or Instructions (Optional)</MiniLabel>
                        <input
                          type="text"
                          placeholder="e.g. Urgent slot required or alternative date preference"
                          value={bookingPrefs.message}
                          onChange={(e) => setBookingPrefs({ ...bookingPrefs, message: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-xs font-normal focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter Coupon (e.g. APEX100)"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-surface-raised border border-line text-xs font-normal focus:outline-none focus:border-accent"
                  />
                  <button type="button" onClick={handleApplyPromo} className="px-4 py-2.5 rounded-xl bg-ink text-surface text-xs font-medium hover:bg-accent transition-colors cursor-pointer">
                    Apply
                  </button>
                </div>
                {promoApplied && (
                  <p className="text-xs font-normal text-success mt-1.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Promo applied — {fmt(promoDiscount)} saved!
                  </p>
                )}
                {promoError && (
                  <p className="text-xs font-normal text-amber-700 dark:text-amber-400 mt-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> {promoError}
                  </p>
                )}
              </div>

              <div className="pt-2 space-y-2">
                <MiniLabel>Preferred Payment Method</MiniLabel>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi')}
                    className={`p-3 rounded-xl border font-normal text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${paymentMethod === 'upi' ? 'border-accent bg-accent/8 text-accent' : 'border-line bg-surface-raised text-ink-muted'}`}
                  >
                    <QrCode className="w-4 h-4" />
                    <span>UPI — QR / Apps</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`p-3 rounded-xl border font-normal text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${paymentMethod === 'card' ? 'border-accent bg-accent/8 text-accent' : 'border-line bg-surface-raised text-ink-muted'}`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Card / NetBanking</span>
                  </button>
                </div>
                <p className="text-[10px] font-normal text-neutral-400">
                  Opens Razorpay&apos;s secure window. UPI shows a scannable QR on desktop and your installed UPI apps on mobile — no need to type a UPI ID. Cards, Netbanking &amp; Wallets are also available.
                </p>
              </div>

              <div className="rounded-2xl bg-accent/8 border border-accent/20 p-4 space-y-2 mt-3 text-sm font-normal">
                <Row label="Subtotal (MRP)" value={formatPrice(totalOriginal)} line />
                <Row label="Product discount" value={`− ${formatPrice(totalOriginal - subtotal)}`} good />
                {promoApplied && <Row label="Promo code" value={`− ${fmt(promoDiscount)}`} good />}
                <div className="h-px bg-accent/20 my-1" />
                <Row label="Total Payable" value={formatPrice(finalPrice)} big />
              </div>

              {error && (
                <div className="text-xs font-normal text-rose-700 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                </div>
              )}

              <div className="pt-2 space-y-2">
                <button type="submit" disabled={isProcessing} className="w-full bg-accent hover:bg-accent-hover text-white py-4 rounded-xl text-base font-medium flex items-center justify-center gap-2 shadow-lg transition-colors disabled:opacity-60 cursor-pointer">
                  {isProcessing ? (
                    <span>
                      {processingState === 'creating' && 'Creating Secure Payment…'}
                      {processingState === 'opening' && 'Opening Secure Checkout…'}
                      {processingState === 'verifying' && (isPteBooking ? 'Verifying Payment & Submitting Booking Request…' : 'Verifying Payment & Issuing Voucher…')}
                      {processingState === 'idle' && 'Processing Payment…'}
                    </span>
                  ) : (
                    <>
                      <Lock className="w-5 h-5" />
                      <span>
                        {isPteBooking
                          ? `Pay ${formatPrice(finalPrice)} & Submit Booking Request →`
                          : `Pay ${formatPrice(finalPrice)} & Get Code Instantly`}
                      </span>
                      {!isPteBooking && <ArrowRight className="w-5 h-5" />}
                    </>
                  )}
                </button>
                <p className="text-center text-[11px] font-normal text-neutral-400 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>
                    {isPteBooking
                      ? 'Secure Payment • Dedicated Pearson Exam Booking Assistance'
                      : 'Secure Payment • 100% Genuine Official Vouchers'}
                  </span>
                </p>
              </div>
            </form>
          </div>
        ) : (
          (() => {
            const emailSent = completedOrder?.emailStatus === 'SENT';

            if (isPteBooking) {
              return (
                <div className="text-center space-y-6 py-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-success flex items-center justify-center mx-auto shadow-md">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div>
                    <span className="text-xs font-medium uppercase tracking-widest text-[#FF005C] block mb-1">
                      ORDER # {completedOrder?.orderNo || 'SUCCESSFUL'}
                    </span>
                    <h2 className="font-heading font-medium text-3xl">Payment Successful</h2>
                    <p className="text-base font-semibold text-neutral-800 dark:text-neutral-100 mt-1">
                      Your PTE booking request has been received.
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mt-2 max-w-md mx-auto leading-relaxed">
                      Your payment has been received successfully. Our team will now process your booking request. Your exam is NOT confirmed until our team completes and confirms the booking.
                    </p>

                    <div className="mt-4 p-4 rounded-2xl bg-surface-raised border border-line max-w-sm mx-auto text-left space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Service:</span>
                        <span className="font-bold text-neutral-900 dark:text-white">
                          {checkoutItems[0]?.name || 'PTE Exam Booking Assistance'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Order Number:</span>
                        <span className="font-bold text-neutral-900 dark:text-white">
                          {completedOrder?.orderNo || '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Amount Paid:</span>
                        <span className="font-bold text-neutral-900 dark:text-white">
                          {formatPrice(finalPrice)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Payment Status:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">Paid</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Booking Status:</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          Processing / Pending Confirmation
                        </span>
                      </div>
                    </div>

                    <div
                      className={`mt-4 text-xs font-normal rounded-xl py-2 px-3 inline-flex items-center gap-1.5 ${
                        emailSent
                          ? 'text-success bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40'
                          : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {emailSent ? (
                        <span>
                          Acknowledgment sent to <span className="underline">{formData.email || user?.email}</span>
                        </span>
                      ) : (
                        <span>Your booking request is safely saved in your account.</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      onClick={() => {
                        handleClose();
                        router.push('/account?tab=pte-bookings');
                      }}
                      className="w-full bg-[#FF005C] hover:bg-[#E00052] text-white py-3.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-md"
                    >
                      <span>View Booking Request in Account →</span>
                    </button>
                    <button
                      onClick={() => {
                        handleClose();
                        router.push('/account?tab=orders');
                      }}
                      className="w-full bg-surface-raised text-ink py-2.5 rounded-xl text-xs font-medium border border-line hover:border-accent transition-colors cursor-pointer"
                    >
                      View Order Details
                    </button>
                  </div>
                </div>
              );
            }

            const pendingFulfillment =
              completedOrder?.fulfillmentStatus === 'PROCESSING' || completedOrder?.orderStatus === 'PROCESSING' || !!completedOrder?.pendingFulfillment;
            const needsAllocation = pendingFulfillment || (completedVouchers.length === 0 && completedOrder?.paymentStatus === 'PAID');

            return (
              <div className="text-center space-y-6 py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-success flex items-center justify-center mx-auto shadow-md">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-widest text-accent block mb-1">ORDER # {completedOrder?.orderNo || 'SUCCESSFUL'}</span>
                  <h2 className="font-heading font-medium text-3xl">Congratulations! 🎉</h2>
                  <p className="text-sm text-ink font-medium mt-1">
                    {needsAllocation
                      ? 'Your payment was successful. Your voucher is being prepared and will be delivered to your email and My Vouchers within 1–2 minutes.'
                      : 'Your voucher has been delivered successfully. It has also been sent to your email and is available in My Vouchers.'}
                  </p>

                  {!needsAllocation && (
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-normal text-ink-muted max-w-xs mx-auto text-left">
                      {completedVouchers[0]?.productName && (
                        <>
                          <span>Voucher</span>
                          <span className="text-ink font-medium text-right">{completedVouchers[0].productName}</span>
                        </>
                      )}
                      <span>Order number</span>
                      <span className="text-ink font-medium text-right">{completedOrder?.orderNo || '—'}</span>
                      <span>Purchase date</span>
                      <span className="text-ink font-medium text-right">{new Date(completedOrder?.paidAt || Date.now()).toLocaleDateString()}</span>
                      <span>Payment</span>
                      <span className="text-success font-medium text-right">Paid</span>
                      <span>Voucher</span>
                      <span className="text-success font-medium text-right">Delivered</span>
                    </div>
                  )}
                  {needsAllocation && (
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-normal text-ink-muted max-w-xs mx-auto text-left">
                      <span>Order number</span>
                      <span className="text-ink font-medium text-right">{completedOrder?.orderNo || '—'}</span>
                      <span>Payment</span>
                      <span className="text-success font-medium text-right">Paid</span>
                      <span>Voucher</span>
                      <span className="text-amber-600 dark:text-amber-400 font-medium text-right">Being prepared</span>
                    </div>
                  )}

                  <div
                    className={`mt-3 text-xs font-normal rounded-xl py-2 px-3 inline-flex items-center gap-1.5 ${
                      emailSent
                        ? 'text-success bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40'
                        : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {emailSent ? (
                      <span>
                        We&apos;ve sent your voucher to <span className="underline">{formData.email || user?.email}</span>
                      </span>
                    ) : (
                      <span>Your voucher is safely stored in your account. Email delivery is temporarily unavailable.</span>
                    )}
                  </div>
                </div>

                {completedVouchers.length > 0 ? (
                  <div className="space-y-3">
                    {completedVouchers.map((v, i) => (
                      <div key={i} className="p-5 rounded-2xl bg-accent/8 border-2 border-dashed border-accent/40 text-left space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-accent uppercase tracking-wider">
                            {v.productName || 'Your Voucher Code'}
                            {v.voucherType ? ` • ${v.voucherType}` : ''}
                          </span>
                          <span className="text-[10px] font-medium text-ink-muted">Exp {new Date(v.expiryDate).toLocaleDateString()}</span>
                        </div>
                        <div className="font-mono font-medium text-2xl sm:text-3xl tracking-wider select-all break-all">{v.code}</div>
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => handleCopy(i, v.code)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface text-accent font-medium text-xs border border-accent/40 shadow-sm hover:bg-accent hover:text-white transition-all cursor-pointer"
                          >
                            {copiedIdx === i ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            <span>{copiedIdx === i ? 'Copied!' : 'Copy Code'}</span>
                          </button>
                          {v.officialWebsiteUrl && (
                            <a href={v.officialWebsiteUrl} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-accent inline-flex items-center gap-1">
                              Redeem now <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-xs font-normal text-amber-700 dark:text-amber-300">
                    {needsAllocation
                      ? 'Your payment is confirmed. Your voucher is being prepared and will be delivered to your email and My Vouchers within 1–2 minutes — please keep this page or your inbox handy.'
                      : 'Your voucher codes are available in your Account → My Vouchers.'}
                  </div>
                )}

                <div className="pt-2 flex flex-col gap-2">
                  <button onClick={() => goAccount('vouchers')} className="w-full bg-accent hover:bg-accent-hover text-white py-3.5 rounded-xl text-sm font-medium transition-colors cursor-pointer">
                    View My Vouchers
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => goAccount('orders')} className="flex-1 bg-surface-raised text-ink py-3 rounded-xl text-xs font-medium border border-line hover:border-accent transition-colors cursor-pointer">
                      View My Orders
                    </button>
                    <button
                      onClick={() => {
                        handleClose();
                        router.push('/exam-vouchers');
                      }}
                      className="flex-1 bg-surface-raised text-ink py-3 rounded-xl text-xs font-medium border border-line hover:border-accent transition-colors cursor-pointer"
                    >
                      Continue Shopping
                    </button>
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs font-normal text-ink-muted uppercase tracking-wider mb-1.5">{children}</span>;
}

function MiniField({
  label,
  type = 'text',
  value,
  onChange,
  required = false,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <MiniLabel>{label}</MiniLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-line text-sm font-normal focus:outline-none focus:border-accent transition-all"
      />
    </label>
  );
}

function Row({ label, value, line = false, good = false, big = false }: { label: string; value: string; line?: boolean; good?: boolean; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${line ? 'line-through text-neutral-400' : good ? 'text-success' : 'text-ink-muted'} ${big ? 'uppercase tracking-wider text-black dark:text-white' : ''}`}>{label}</span>
      <span className={big ? 'font-heading font-medium text-2xl' : ''}>{value}</span>
    </div>
  );
}
