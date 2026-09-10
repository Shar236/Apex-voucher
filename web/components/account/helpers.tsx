import type { ReactNode } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { formatPrice } from '@/lib/api';
import type { AccountOrder, AccountVoucher } from '@/components/voucher-provider';

export const statusColor = (s?: string) => {
  const l = String(s || '').toUpperCase();
  if (['ASSIGNED', 'SOLD', 'ACTIVE', 'PAID', 'FULFILLED'].includes(l))
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40';
  if (['USED'].includes(l)) return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900/40';
  if (['EXPIRED', 'CANCELLED', 'FAILED', 'REFUNDED'].includes(l))
    return 'bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-neutral-800/50 dark:text-neutral-400 dark:border-neutral-700';
  if (['REFUND_REQUESTED', 'TRANSFERRED'].includes(l)) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/40';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

export const VR_STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Request Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/40' },
  PROCESSING: { label: 'Processing', cls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900/40' },
  AWAITING_PAYMENT: { label: 'Ready — Payment Required', cls: 'bg-brand-pink/10 text-brand-pink border-brand-pink/30' },
  FULFILLED: { label: 'Voucher Ready', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-neutral-800/50 dark:text-neutral-400 dark:border-neutral-700' },
};

export const formatDate = (d?: string | null, includeTime = false) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
};

export function AccountInfoCard({
  icon,
  label,
  value,
  verified,
  verifiedLabel,
  unverifiedLabel,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  verified?: boolean;
  verifiedLabel?: string;
  unverifiedLabel?: string;
}) {
  return (
    <div className="rounded-3xl p-4 sm:p-5 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929]">
      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-neutral-400 mb-2">
        {icon} {label}
      </div>
      <div className="text-sm font-black text-neutral-900 dark:text-white truncate mb-2">{value}</div>
      <VerifiedBadge verified={verified} verifiedLabel={verifiedLabel} unverifiedLabel={unverifiedLabel} />
    </div>
  );
}

export function VerifiedBadge({ verified, verifiedLabel = 'Verified', unverifiedLabel = 'Not verified' }: { verified?: boolean; verifiedLabel?: string; unverifiedLabel?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border shrink-0 ${
        verified
          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/40'
      }`}
    >
      {verified ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {verified ? verifiedLabel : unverifiedLabel}
    </span>
  );
}

export function ReadOnlyRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div>
      <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-500 dark:text-[#B5B5B5] mb-2 flex items-center gap-1.5">
        {icon} {label}
      </span>
      <div className="px-4 py-3 bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] rounded-2xl text-neutral-900 dark:text-white text-sm font-bold">{value}</div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled,
  placeholder,
  required,
  error,
  icon,
}: {
  label: string;
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
  icon?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-500 dark:text-[#B5B5B5] mb-2 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
        className={`w-full px-4 py-3 bg-neutral-50 dark:bg-[#0E0E0E] border rounded-2xl text-neutral-900 dark:text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-pink/20 disabled:opacity-60 transition-colors ${
          error ? 'border-rose-400 dark:border-rose-500 focus:border-rose-400' : 'border-[#EAEAEA] dark:border-[#292929] focus:border-brand-pink'
        }`}
      />
      {error && <p className="mt-1.5 text-xs font-bold text-rose-500">{error}</p>}
    </label>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  show: boolean;
  onToggle: () => void;
  error?: string | null;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-500 dark:text-[#B5B5B5] mb-2 flex items-center gap-1.5">{label}</span>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full px-4 py-3 pr-12 bg-neutral-50 dark:bg-[#0E0E0E] border rounded-2xl text-neutral-900 dark:text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-pink/20 transition-colors ${
            error ? 'border-rose-400 dark:border-rose-500 focus:border-rose-400' : 'border-[#EAEAEA] dark:border-[#292929] focus:border-brand-pink'
          }`}
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition cursor-pointer">
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs font-bold text-rose-500">{error}</p>}
    </label>
  );
}

export function OrderRow({ o, detailed = false }: { o: AccountOrder; detailed?: boolean }) {
  const items = o.items || [];
  return (
    <div className="rounded-2xl p-4 bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-black text-neutral-900 dark:text-white text-sm">#{o.orderNo}</span>
          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black ${statusColor(o.orderStatus)}`}>{o.orderStatus}</span>
          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black ${statusColor(o.paymentStatus)}`}>{o.paymentStatus}</span>
        </div>
        <div className="text-xs font-bold text-neutral-500 dark:text-[#B5B5B5]">
          {new Date(o.createdAt).toLocaleString()} · {items.length} {items.length === 1 ? 'item' : 'items'}
          {detailed && o.billingDetails?.email && <> · {o.billingDetails.email}</>}
        </div>
      </div>
      <div className="text-right">
        <div className="font-heading font-black text-lg text-neutral-900 dark:text-white tabular-nums">{formatPrice(o.total, (o.currency as 'INR' | 'USD') || 'INR')}</div>
        {detailed && o.promoCode && <div className="text-[10px] font-black text-brand-pink">Promo: {o.promoCode as string}</div>}
      </div>
    </div>
  );
}

export function VoucherMini({ v }: { v: AccountVoucher }) {
  return (
    <div className="rounded-2xl p-4 bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929]">
      <div className="flex items-center justify-between mb-1.5">
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black ${statusColor(v.status)}`}>{v.status}</span>
        <span className="text-[10px] font-black text-neutral-500 dark:text-[#B5B5B5]">{v.daysRemaining}d left</span>
      </div>
      <div className="font-black text-sm text-neutral-900 dark:text-white truncate">{v.productName}</div>
      <div className="font-mono text-[11px] font-bold text-[#6C3CE0] mt-0.5">{v.code?.slice(0, 12) || 'XXXX-XXXX-XX'}…</div>
    </div>
  );
}

export function EmptyState({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="text-center py-10 rounded-2xl border border-dashed border-[#EAEAEA] dark:border-[#292929]">
      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-neutral-100 dark:bg-[#262626] flex items-center justify-center">{icon}</div>
      <div className="font-black text-neutral-900 dark:text-white">{title}</div>
      <div className="text-xs font-bold text-neutral-500 dark:text-[#B5B5B5] mt-1 max-w-sm mx-auto">{desc}</div>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white dark:bg-[#161616] p-7 border border-[#EAEAEA] dark:border-[#292929] shadow-2xl text-neutral-900 dark:text-white max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-xl bg-neutral-100 dark:bg-[#262626] text-neutral-600 dark:text-neutral-200 text-xs font-black cursor-pointer">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
