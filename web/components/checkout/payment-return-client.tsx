'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import { CheckCircle2, AlertCircle, ArrowRight, Ticket, RefreshCw } from 'lucide-react';
import { ApexLogo } from '@/components/apex-logo';
import { useCart } from '@/components/cart-provider';
import { useVoucher } from '@/components/voucher-provider';
import { paymentApi, type ApiResponse } from '@/lib/api';

/**
 * Fallback payment-status page. Razorpay Checkout is modal-based, so most
 * users never land here — the checkout modal verifies the payment inline.
 * This page exists for edge cases (browser closed mid-flow, deep link,
 * manual refresh).
 *
 * SECURITY: reads only the server's truth via GET /api/payments/order/:id.
 * It cannot and does not mark anything paid.
 */
export function PaymentReturnClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order_id') || searchParams.get('orderId') || searchParams.get('orderNo') || '';
  const router = useRouter();
  const { clearCart } = useCart();
  const { handlePurchaseSuccess } = useVoucher();

  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState('');
  const celebrated = useRef(false);
  const firstCheck = useRef(true);

  const check = useCallback(async () => {
    if (!orderId) {
      setLoading(false);
      setError('No order reference found in the URL.');
      return null;
    }
    try {
      const res = firstCheck.current ? await paymentApi.reconcile(orderId).catch(() => paymentApi.getStatus(orderId)) : await paymentApi.getStatus(orderId);
      firstCheck.current = false;
      setLoading(false);
      if (!res?.success) {
        setError(res?.message || 'Could not load payment status.');
        return null;
      }
      setStatusData(res);
      const isPte = Boolean(res.isPteBooking || (res.data as { isPteBooking?: boolean })?.isPteBooking);
      const paid = isPte
        ? res.paymentStatus === 'PAID'
        : res.paymentStatus === 'PAID' && (res.orderStatus === 'FULFILLED' || res.fulfillmentStatus === 'FULFILLED');
      if (paid && !celebrated.current) {
        celebrated.current = true;
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        clearCart();
        const data = res.data as { orderNo?: string } | undefined;
        handlePurchaseSuccess({ orderId: data?.orderNo || orderId });
      }
      return res;
    } catch {
      setLoading(false);
      setError('Network error while checking payment status.');
      return null;
    }
  }, [orderId, clearCart, handlePurchaseSuccess]);

  useEffect(() => {
    let alive = true;
    let attempts = 0;
    check().then((res) => {
      const settled = res && (res.paymentStatus === 'PAID' || res.paymentStatus === 'FAILED');
      if (alive && !settled) {
        const t = setInterval(() => {
          attempts += 1;
          if (attempts >= 10) {
            clearInterval(t);
            return;
          }
          check().then((r) => {
            if (r && (r.paymentStatus === 'PAID' || r.paymentStatus === 'FAILED')) clearInterval(t);
          });
        }, 3000);
        return () => clearInterval(t);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPteBooking = Boolean(statusData?.isPteBooking || (statusData?.data as { isPteBooking?: boolean })?.isPteBooking);
  const bookingRequest = ((statusData as any)?.bookingRequest || (statusData?.data as any)?.bookingRequest) as
    | { examType?: string; amountPaid?: number; status?: string }
    | undefined;
  const isPtePaid = isPteBooking && statusData?.paymentStatus === 'PAID';
  const isPaid = !isPteBooking && statusData?.paymentStatus === 'PAID' && (statusData?.orderStatus === 'FULFILLED' || statusData?.fulfillmentStatus === 'FULFILLED');
  const isProcessing = !isPteBooking && statusData?.paymentStatus === 'PAID' && (statusData?.orderStatus === 'PROCESSING' || statusData?.fulfillmentStatus === 'PROCESSING');
  const isPending = statusData?.paymentStatus === 'PENDING';
  const order = statusData?.data as { orderNo?: string; total?: number; emailStatus?: string } | undefined;
  const vouchers = (statusData?.vouchers as Array<{ productName?: string; expiryDate: string; code: string }>) || [];
  const emailSent = (statusData?.emailStatus || order?.emailStatus) === 'SENT';

  return (
    <div className="min-h-screen bg-surface-sunken text-ink flex items-center justify-center p-4 transition-colors duration-300">
      <div className="w-full max-w-lg bg-surface border border-line rounded-3xl p-7 shadow-2xl text-center space-y-6">
        <div className="flex justify-center">
          <ApexLogo className="h-8" />
        </div>

        {loading ? (
          <div className="py-12 space-y-4">
            <RefreshCw className="w-10 h-10 text-accent animate-spin mx-auto" />
            <h2 className="font-heading font-medium text-xl">Checking your payment…</h2>
            <p className="text-xs text-ink-muted font-normal">We&apos;re confirming your payment with Razorpay.</p>
          </div>
        ) : isPtePaid ? (
          <div className="py-4 space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-success flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-widest text-[#FF005C] block mb-1">
                ORDER # {order?.orderNo || orderId}
              </span>
              <h2 className="font-heading font-medium text-3xl">Payment Successful</h2>
              <p className="text-base font-semibold text-neutral-800 dark:text-neutral-100 mt-1">
                Your PTE booking request has been received.
              </p>
              <p className="text-xs text-ink-muted font-normal mt-2 max-w-md mx-auto leading-relaxed">
                Your payment has been received successfully. Our team will now process your booking request. Your exam is NOT confirmed until our team completes and confirms the booking.
              </p>

              <div className="mt-4 p-4 rounded-2xl bg-surface-raised border border-line max-w-sm mx-auto text-left space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">Service:</span>
                  <span className="font-bold text-ink">
                    {bookingRequest?.examType || 'PTE Exam Booking Assistance'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">Order Number:</span>
                  <span className="font-bold text-ink">{order?.orderNo || orderId}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">Amount Paid:</span>
                  <span className="font-bold text-ink">
                    ₹{Number(order?.total || bookingRequest?.amountPaid || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">Payment Status:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">Paid</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-ink-muted">Booking Status:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {bookingRequest?.status === 'Booking Confirmed' ? 'Confirmed' : 'Processing / Pending Confirmation'}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push('/account?tab=pte-bookings')}
              className="w-full py-4 rounded-2xl bg-[#FF005C] hover:bg-[#E00052] text-white font-medium text-sm shadow-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>View Booking Request in Account →</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : isPaid ? (
          <div className="py-4 space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-success flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-widest text-accent block mb-1">ORDER # {order?.orderNo || orderId}</span>
              <h2 className="font-heading font-medium text-3xl">Payment Successful</h2>
              <p className="text-xs text-ink-muted font-normal mt-1">{emailSent ? 'Your voucher code has been issued and sent to your email.' : 'Your voucher is safely stored in your account. Email delivery is temporarily unavailable.'}</p>
            </div>

            {vouchers.length > 0 ? (
              <div className="space-y-3 text-left">
                {vouchers.map((v, i) => (
                  <div key={i} className="p-5 rounded-2xl bg-accent/8 border-2 border-dashed border-accent/40 space-y-2">
                    <div className="flex justify-between items-center text-xs font-medium text-accent">
                      <span>{v.productName || 'Voucher Code'}</span>
                      <span>Exp: {new Date(v.expiryDate).toLocaleDateString()}</span>
                    </div>
                    <div className="font-mono font-medium text-2xl tracking-wider select-all break-all text-ink">{v.code}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-xs font-normal text-success">Your voucher codes are ready in your Candidate Vault.</div>
            )}

            <button onClick={() => router.push('/account')} className="w-full py-4 rounded-2xl bg-accent hover:bg-accent-hover text-white font-medium text-sm shadow-xl flex items-center justify-center gap-2 transition-colors cursor-pointer">
              <Ticket className="w-4 h-4" />
              <span>Go to Candidate Vault</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : isProcessing ? (
          <div className="py-4 space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-success flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-widest text-accent block mb-1">ORDER # {order?.orderNo || orderId}</span>
              <h2 className="font-heading font-medium text-3xl">Congratulations! 🎉</h2>
              <p className="text-xs text-ink-muted font-normal mt-1.5 max-w-sm mx-auto">Your payment was successful. Your voucher is delivered to your email within 1–2 minutes. You can safely close this page.</p>
            </div>
            <div className="mx-auto w-full max-w-xs grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-normal text-ink-muted text-left">
              <span>Payment</span>
              <span className="text-success font-medium text-right">Paid</span>
              <span>Voucher</span>
              <span className="text-amber-600 dark:text-amber-400 font-medium text-right">Being prepared</span>
            </div>
            <button onClick={() => router.push('/account?tab=vouchers')} className="w-full py-4 rounded-2xl bg-accent hover:bg-accent-hover text-white font-medium text-sm shadow-xl flex items-center justify-center gap-2 transition-colors cursor-pointer">
              <Ticket className="w-4 h-4" />
              <span>View My Vouchers</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="py-6 space-y-5">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mx-auto shadow-md">
              <AlertCircle className="w-10 h-10" />
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-widest text-amber-600 block mb-1">{isPending ? 'PAYMENT PENDING' : 'PAYMENT NOT CONFIRMED'}</span>
              <h2 className="font-heading font-medium text-2xl">{isPending ? 'Still confirming…' : 'Payment status'}</h2>
              <p className="text-xs text-ink-muted font-normal mt-1.5 max-w-sm mx-auto">
                {error
                  ? error
                  : isPending
                    ? isPteBooking
                      ? 'If money was deducted, your booking request will appear in your account automatically within a few minutes. You will not be charged twice.'
                      : 'If money was deducted, your voucher will appear here and in your Candidate Vault automatically within a few minutes. You will not be charged twice.'
                    : 'No completed payment was found for this order. If you were charged, it will be auto-refunded by Razorpay.'}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setLoading(true);
                  check();
                }}
                className="flex-1 py-3.5 rounded-2xl bg-surface-raised font-medium text-xs border border-line cursor-pointer"
              >
                Refresh status
              </button>
              <Link href={isPteBooking ? '/account?tab=pte-bookings' : '/account'} className="flex-1 py-3.5 rounded-2xl bg-accent hover:bg-accent-hover text-white font-medium text-xs transition-colors flex items-center justify-center">
                {isPteBooking ? 'My Bookings' : 'Candidate Vault'}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
