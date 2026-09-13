'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Crown,
  User as UserIcon,
  ClipboardList,
  Ticket,
  RotateCcw,
  Shield,
  ShoppingBag,
  CheckCircle2,
  Clock,
  TrendingUp,
  Mail,
  Phone,
  Calendar,
  ArrowRight,
  Package,
  LogOut,
  ShieldCheck,
  Copy,
  Check,
  Send,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Camera,
  Upload,
  X,
  Trash2,
  Loader2,
  Lock,
  Info,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { useVoucher } from '@/components/voucher-provider';
import { useCart } from '@/components/cart-provider';
import { ApexLogo } from '@/components/apex-logo';
import { accountApi, apiBase, pteBookingApi } from '@/lib/api';
import { PasswordStrengthChecklist } from '@/components/auth/password-strength-checklist';
import { validatePasswordStrength } from '@/lib/password-rules';
import { AccountInfoCard, VerifiedBadge, ReadOnlyRow, Field, PasswordField, OrderRow, VoucherMini, EmptyState, Modal, statusColor, VR_STATUS_META, formatDate } from '@/components/account/helpers';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Crown, mobileLabel: 'Overview' },
  { id: 'profile', label: 'Personal Information', icon: UserIcon, mobileLabel: 'Profile' },
  { id: 'orders', label: 'My Orders', icon: ClipboardList, mobileLabel: 'Orders' },
  { id: 'pte-bookings', label: 'PTE Bookings', icon: Calendar, mobileLabel: 'PTE' },
  { id: 'vouchers', label: 'My Vouchers', icon: Ticket, mobileLabel: 'Vouchers' },
  { id: 'preparing', label: 'Preparing Vouchers', icon: Clock, mobileLabel: 'Preparing' },
  { id: 'security', label: 'Security', icon: Shield, mobileLabel: 'Security' },
] as const;

const avatarUrl = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${apiBase()}${url}`;
};

export function AccountDashboard() {
  const { user, logout, updateAuthenticatedUser } = useAuth();
  const { formatPrice } = useCart();
  const { accountStats, accountOrders, userVouchers, userFulfillments, transferVoucher, markVoucherUsed, requestRefund, loadAccountData, startCheckout } = useVoucher();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedCodes, setRevealedCodes] = useState<Record<string, boolean>>({});
  const [transferModalId, setTransferModalId] = useState<string | null>(null);
  const [transferEmail, setTransferEmail] = useState('');
  const [refundConfirmId, setRefundConfirmId] = useState<string | null>(null);

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileNameError, setProfileNameError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRemoving, setAvatarRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [passwordForm, setPasswordForm] = useState({ current: '', newPwd: '', confirm: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string | null>>({});
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  const [pteBookings, setPteBookings] = useState<
    Array<{
      _id: string;
      requestId?: string;
      orderNo?: string;
      examType?: string;
      amountPaid?: number;
      currency?: string;
      paymentStatus?: string;
      status?: string;
      preferredCity?: string;
      preferredTestCentre?: string;
      preferredDate?: string;
      preferredTime?: string;
      message?: string;
      createdAt?: string;
      confirmationDetails?: {
        bookingReference?: string;
        confirmedCentre?: string;
        confirmedCity?: string;
        confirmedDate?: string;
        confirmedTime?: string;
        importantInstructions?: string;
      };
    }>
  >([]);
  const [pteBookingsLoading, setPteBookingsLoading] = useState(false);
  const [pteBookingsError, setPteBookingsError] = useState('');

  const loadPteBookings = useCallback(async () => {
    setPteBookingsLoading(true);
    setPteBookingsError('');
    try {
      const res = await pteBookingApi.mine();
      if (res?.success) {
        setPteBookings((res.data as typeof pteBookings) || []);
      } else {
        setPteBookingsError((res?.message as string) || 'Failed to load PTE booking requests.');
      }
    } catch {
      setPteBookingsError('Could not load PTE booking requests.');
    } finally {
      setPteBookingsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPteBookings();
  }, [loadPteBookings]);

  useEffect(() => {
    if (tab === 'pte-bookings') {
      loadPteBookings();
    }
  }, [tab, loadPteBookings]);

  useEffect(() => {
    if (user) setProfileName(user.name || '');
  }, [user]);

  const profileDirty = editingProfile && profileName.trim() !== (user?.name || '');

  useEffect(() => {
    if (!profileDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [profileDirty]);

  useEffect(() => {
    const wanted = searchParams.get('tab');
    if (wanted && TABS.some((t) => t.id === wanted)) setTab(wanted as (typeof TABS)[number]['id']);
  }, [searchParams]);

  const startEditProfile = () => {
    setProfileName(user?.name || '');
    setProfileNameError('');
    setEditingProfile(true);
  };

  const discardProfileEdit = () => {
    setProfileName(user?.name || '');
    setProfileNameError('');
    setEditingProfile(false);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileNameError('');
    setProfileSuccess(false);

    const name = profileName.trim();
    if (name.length < 2) return setProfileNameError('Name must be at least 2 characters');
    if (name.length > 80) return setProfileNameError('Name must be at most 80 characters');
    if (!/^[\p{L}\p{M}' \-.]+$/u.test(name)) return setProfileNameError('Name contains invalid characters');

    setProfileLoading(true);
    const res = await accountApi.updateProfile({ name });
    setProfileLoading(false);

    if (res.success) {
      updateAuthenticatedUser(res.user);
      setProfileSuccess(true);
      setEditingProfile(false);
      loadAccountData();
      setTimeout(() => setProfileSuccess(false), 4000);
    } else {
      const errors = res.data as { errors?: { name?: string } } | undefined;
      setProfileNameError(errors?.errors?.name || res.message || 'Failed to update profile');
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) return;
    if (file.size > 5 * 1024 * 1024) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const uploadAvatar = async () => {
    if (!avatarFile) return;
    setAvatarUploading(true);
    const res = await accountApi.uploadAvatar(avatarFile);
    setAvatarUploading(false);
    if (res.success) {
      updateAuthenticatedUser(res.user);
      setAvatarFile(null);
      setAvatarPreview(null);
    }
  };

  const removeAvatar = async () => {
    setAvatarRemoving(true);
    const res = await accountApi.removeAvatar();
    setAvatarRemoving(false);
    if (res.success) {
      updateAuthenticatedUser(res.user);
      setAvatarFile(null);
      setAvatarPreview(null);
    }
  };

  const cancelAvatarPreview = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrors({});
    setPasswordSuccess(false);
    const errors: Record<string, string> = {};

    if (!passwordForm.current) errors.current = 'Current password is required';
    const strengthError = validatePasswordStrength(passwordForm.newPwd);
    if (!passwordForm.newPwd) errors.newPwd = 'New password is required';
    else if (strengthError) errors.newPwd = strengthError;
    if (passwordForm.newPwd !== passwordForm.confirm) errors.confirm = 'Passwords do not match';

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    setPasswordLoading(true);
    const res = await accountApi.changePassword(passwordForm.current, passwordForm.newPwd);
    setPasswordLoading(false);

    if (res.success) {
      setPasswordSuccess(true);
      setPasswordForm({ current: '', newPwd: '', confirm: '' });
      setTimeout(() => setPasswordSuccess(false), 4000);
    } else if (res.code === 'WRONG_PASSWORD' || res.message?.toLowerCase().includes('incorrect')) {
      setPasswordErrors({ current: 'Current password is incorrect' });
    }
  };

  const copy = (id: string, code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const toggleReveal = (id: string) => setRevealedCodes((p) => ({ ...p, [id]: !p[id] }));

  const submitTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferEmail || !transferModalId) return;
    transferVoucher(transferModalId, transferEmail);
    setTransferModalId(null);
    setTransferEmail('');
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const stats = [
    { label: 'Total Orders', value: accountStats?.totalOrders || 0, icon: <ShoppingBag className="w-5 h-5 text-brand-pink" strokeWidth={2.3} />, bgLight: 'bg-brand-pink/10', borderLight: 'border-brand-pink/20', badge: 'Orders', accentColor: 'text-brand-pink' },
    { label: 'Active Vouchers', value: accountStats?.activeVouchers || 0, icon: <Ticket className="w-5 h-5 text-emerald-500" strokeWidth={2.3} />, bgLight: 'bg-emerald-500/10', borderLight: 'border-emerald-500/20', badge: 'Ready to use', accentColor: 'text-emerald-500' },
    { label: 'Used Vouchers', value: accountStats?.usedVouchers || 0, icon: <CheckCircle2 className="w-5 h-5 text-sky-500" strokeWidth={2.3} />, bgLight: 'bg-sky-500/10', borderLight: 'border-sky-500/20', badge: 'Redeemed', accentColor: 'text-sky-500' },
    { label: 'Expiring Soon', value: accountStats?.expiringSoon || 0, icon: <Clock className="w-5 h-5 text-amber-500" strokeWidth={2.3} />, bgLight: 'bg-amber-500/10', borderLight: 'border-amber-500/20', badge: (accountStats?.expiringSoon || 0) > 0 ? 'Urgent' : 'All valid', accentColor: 'text-amber-500' },
    { label: 'Total Saved', value: formatPrice(accountStats?.totalSaved || 0), icon: <TrendingUp className="w-5 h-5 text-indigo-500" strokeWidth={2.3} />, bgLight: 'bg-indigo-500/10', borderLight: 'border-indigo-500/20', badge: 'Saved', accentColor: 'text-indigo-500' },
  ];

  return (
    <section className="py-8 sm:py-12 bg-white dark:bg-[#06070B] min-h-[80vh] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-7">
          <div>
            <button onClick={() => router.push('/')} className="flex items-center gap-2 mb-3 text-left focus:outline-none cursor-pointer group" aria-label="Go to Apex Vouchers Home">
              <ApexLogo className="h-7" />
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF0F5] dark:bg-[#2A0A17] text-[11px] font-black text-brand-pink border border-brand-pink/20 group-hover:border-brand-pink/50 transition-colors">
                <Ticket className="w-3.5 h-3.5" />
                CANDIDATE PORTAL
              </span>
            </button>
            <h1 className="font-heading font-black text-2xl sm:text-3xl tracking-tight text-neutral-900 dark:text-white">Welcome, {user?.name?.split(' ')[0] || 'Apex User'}</h1>
            <p className="text-sm text-neutral-500 dark:text-[#B5B5B5] mt-1">Manage your account information, contact details, orders and security.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => router.push('/exam-vouchers')} className="px-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-[#262626] text-neutral-700 dark:text-neutral-200 text-xs font-black transition hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer">
              Browse Vouchers
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <nav className="lg:w-56 shrink-0">
            <div className="hidden lg:flex flex-col gap-1 sticky top-24">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all text-left w-full cursor-pointer ${
                      tab === t.id ? 'bg-brand-pink text-white shadow-lg shadow-brand-pink/20' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#1A1A1A] hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-4.5 h-4.5" strokeWidth={2.2} />
                    {t.label}
                  </button>
                );
              })}
              <div className="h-px bg-[#EAEAEA] dark:bg-[#292929] my-2" />
              <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all text-left w-full cursor-pointer">
                <LogOut className="w-4.5 h-4.5" strokeWidth={2.2} />
                Log out
              </button>
            </div>

            <div className="flex lg:hidden gap-2 overflow-x-auto pb-2 -mx-4 px-4">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-black border whitespace-nowrap transition shrink-0 cursor-pointer ${
                      tab === t.id ? 'bg-brand-pink text-white border-brand-pink shadow-lg' : 'bg-white dark:bg-[#161616] text-neutral-600 dark:text-neutral-300 border-[#EAEAEA] dark:border-[#292929] hover:text-brand-pink'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={2.3} />
                    {t.mobileLabel}
                  </button>
                );
              })}
              <button onClick={handleLogout} className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-black border whitespace-nowrap transition shrink-0 bg-white dark:bg-[#161616] text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/40 cursor-pointer">
                <LogOut className="w-3.5 h-3.5" strokeWidth={2.3} />
                Logout
              </button>
            </div>
          </nav>

          <div className="flex-1 min-w-0">
            {tab === 'overview' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
                  <AccountInfoCard icon={<Mail className="w-4.5 h-4.5" />} label="Email Address" value={user?.email || '—'} verified={!!user?.emailVerified} verifiedLabel="Verified" unverifiedLabel="Not verified" />
                  {user?.phone ? (
                    <AccountInfoCard icon={<Phone className="w-4.5 h-4.5" />} label="Phone Number" value={user.phone} verified={!!user?.phoneVerified} verifiedLabel="Verified" unverifiedLabel="Not verified" />
                  ) : (
                    <div className="rounded-3xl p-4 sm:p-5 bg-white dark:bg-[#161616] border border-dashed border-[#EAEAEA] dark:border-[#292929] flex flex-col justify-between">
                      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-neutral-400 mb-2">
                        <Phone className="w-4 h-4" /> Phone Number
                      </div>
                      <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400">Phone number not added</p>
                    </div>
                  )}
                  <div className="rounded-3xl p-4 sm:p-5 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929]">
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-neutral-400 mb-2">
                      <Calendar className="w-4 h-4" /> Member Since
                    </div>
                    <div className="text-sm font-black text-neutral-900 dark:text-white">{formatDate(user?.createdAt as string)}</div>
                  </div>
                  <div className="rounded-3xl p-4 sm:p-5 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929]">
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-neutral-400 mb-2">
                      <Clock className="w-4 h-4" /> Last Login
                    </div>
                    <div className="text-sm font-black text-neutral-900 dark:text-white">{user?.lastLoginAt ? formatDate(user.lastLoginAt as string, true) : 'This session'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-7">
                  {stats.map((s) => (
                    <div key={s.label} className={`group relative rounded-3xl p-4 sm:p-5 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] hover:border-neutral-300 dark:hover:border-neutral-700 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden`}>
                      <div className={`absolute -right-6 -top-6 w-20 h-20 rounded-full ${s.bgLight} blur-xl pointer-events-none group-hover:scale-150 transition-transform duration-500`} />
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl ${s.bgLight} border ${s.borderLight} flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shadow-sm`}>{s.icon}</div>
                          <span className={`text-[9px] sm:text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full ${s.bgLight} ${s.accentColor} border ${s.borderLight} hidden sm:inline`}>{s.badge}</span>
                        </div>
                        <div className="text-[11px] sm:text-xs font-bold text-neutral-500 dark:text-[#B5B5B5] tracking-tight">{s.label}</div>
                      </div>
                      <div className="font-heading font-black text-xl sm:text-2xl lg:text-3xl mt-2 tabular-nums text-neutral-900 dark:text-white tracking-tight">{s.value}</div>
                    </div>
                  ))}
                </div>

                {(() => {
                  const processing = (userFulfillments || []).filter((r) => r.status === 'PROCESSING');
                  if (processing.length === 0) return null;
                  return (
                    <button onClick={() => setTab('preparing')} className="w-full text-left mb-4 rounded-3xl p-5 bg-brand-pink/5 border border-brand-pink/25 hover:border-brand-pink/50 transition-colors cursor-pointer flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-brand-pink/10 text-brand-pink flex items-center justify-center shrink-0">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-black text-sm text-neutral-900 dark:text-white">
                            {processing.length} voucher {processing.length === 1 ? 'is' : 'are'} being prepared
                          </p>
                          <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400">Paid • Preparing — you&apos;ll receive your voucher within 1–2 minutes</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-brand-pink shrink-0" />
                    </button>
                  );
                })()}

                {(() => {
                  const activePte = pteBookings.filter(
                    (b) => b.status !== 'Booking Confirmed' && b.status !== 'Cancelled / Refund Required'
                  );
                  if (activePte.length === 0) return null;
                  return (
                    <button
                      onClick={() => setTab('pte-bookings')}
                      className="w-full text-left mb-4 rounded-3xl p-5 bg-[#FF005C]/5 border border-[#FF005C]/25 hover:border-[#FF005C]/50 transition-colors cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-[#FF005C]/10 text-[#FF005C] flex items-center justify-center shrink-0">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-black text-sm text-neutral-900 dark:text-white">
                            {activePte.length} PTE exam booking {activePte.length === 1 ? 'request' : 'requests'} in progress
                          </p>
                          <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
                            Payment verified • Our team is processing your Pearson booking details
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#FF005C] shrink-0" />
                    </button>
                  );
                })()}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 rounded-3xl p-5 sm:p-6 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-black text-neutral-900 dark:text-white">Recent Orders</h3>
                      <button onClick={() => setTab('orders')} className="text-xs font-black text-brand-pink flex items-center gap-1 cursor-pointer">
                        View all <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      {(accountOrders?.length || 0) === 0 && <EmptyState icon={<Package className="w-7 h-7 text-neutral-400" />} title="No orders yet" desc="Browse vouchers and place your first discounted exam order." />}
                      {accountOrders?.slice(0, 4)?.map((o) => (
                        <OrderRow key={o._id} o={o} />
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl p-5 sm:p-6 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-black text-neutral-900 dark:text-white">Voucher Wallet</h3>
                      <button onClick={() => setTab('vouchers')} className="text-xs font-black text-brand-pink cursor-pointer">
                        See all
                      </button>
                    </div>
                    <div className="space-y-3">
                      {(userVouchers?.length || 0) === 0 && <EmptyState icon={<Ticket className="w-7 h-7 text-neutral-400" />} title="No vouchers yet" desc="Your purchased codes will appear here instantly after payment." />}
                      {userVouchers?.slice(0, 3)?.map((v) => (
                        <VoucherMini key={v.id} v={v} />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {tab === 'orders' && (
              <div className="rounded-3xl p-5 sm:p-6 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
                <h3 className="font-black text-xl mb-5 text-neutral-900 dark:text-white">All Orders</h3>
                <div className="space-y-3">
                  {(accountOrders?.length || 0) === 0 && <EmptyState icon={<ClipboardList className="w-7 h-7 text-neutral-400" />} title="No orders yet" desc="Place an order and it will appear here." />}
                  {accountOrders?.map((o) => (
                    <OrderRow key={o._id} o={o} detailed />
                  ))}
                </div>
              </div>
            )}

            {tab === 'pte-bookings' && (
              <div className="rounded-3xl p-5 sm:p-6 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full border border-[#FF005C]/30 bg-[#FF005C]/10 text-[10px] font-black text-[#FF005C] uppercase tracking-wider">
                        EXAM BOOKING SERVICE
                      </span>
                    </div>
                    <h3 className="font-black text-xl text-neutral-900 dark:text-white">PTE Exam Bookings</h3>
                    <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Track Pearson PTE exam booking assistance requests and view confirmed appointment details.
                    </p>
                  </div>
                  <button
                    onClick={loadPteBookings}
                    disabled={pteBookingsLoading}
                    className="px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] hover:border-brand-pink text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className={`w-4 h-4 ${pteBookingsLoading ? 'animate-spin' : ''}`} /> Refresh
                  </button>
                </div>

                {pteBookingsLoading && pteBookings.length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <Loader2 className="w-8 h-8 text-brand-pink animate-spin mx-auto" />
                    <p className="text-xs font-bold text-neutral-500">Loading your booking requests…</p>
                  </div>
                ) : pteBookingsError ? (
                  <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 text-xs font-bold text-rose-700">
                    {pteBookingsError}
                  </div>
                ) : pteBookings.length === 0 ? (
                  <EmptyState
                    icon={<Calendar className="w-7 h-7 text-neutral-400" />}
                    title="No PTE booking requests yet"
                    desc="When you request PTE exam booking assistance, your request details and official appointment confirmation will appear here."
                  />
                ) : (
                  <div className="space-y-5">
                    {pteBookings.map((b) => {
                      const isConfirmed = b.status === 'Booking Confirmed';
                      const isFailed = b.status === 'Booking Failed / Unable to Book' || b.status === 'Cancelled / Refund Required';
                      const cd = b.confirmationDetails;

                      return (
                        <div
                          key={b._id}
                          className="rounded-2xl p-5 bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] space-y-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200/60 dark:border-[#202020] pb-3">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-neutral-200/80 dark:bg-[#222] text-[#FF005C]">
                                {b.requestId || b.orderNo || 'REQUEST'}
                              </span>
                              <span className="font-black text-neutral-900 dark:text-white text-sm">
                                {b.examType || 'PTE Academic'}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black ${
                                  isConfirmed
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                                    : isFailed
                                      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400'
                                      : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
                                }`}
                              >
                                {isConfirmed
                                  ? 'Confirmed'
                                  : isFailed
                                    ? b.status
                                    : 'Processing / Pending Confirmation'}
                              </span>
                            </div>
                            <div className="text-xs font-bold text-neutral-400">
                              Requested {b.createdAt ? formatDate(b.createdAt) : '—'}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-bold">
                            <div>
                              <span className="text-[10px] uppercase text-neutral-400 block">Order Number</span>
                              <span className="text-neutral-900 dark:text-white">#{b.orderNo || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase text-neutral-400 block">Amount Paid</span>
                              <span className="text-neutral-900 dark:text-white">
                                {b.amountPaid != null ? formatPrice(b.amountPaid, (b.currency as 'INR' | 'USD') || 'INR') : '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase text-neutral-400 block">Payment Status</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Paid</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase text-neutral-400 block">Booking Status</span>
                              <span
                                className={`font-bold ${
                                  isConfirmed
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : isFailed
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {isConfirmed ? 'Confirmed' : isFailed ? b.status : 'Processing / Pending Confirmation'}
                              </span>
                            </div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] text-xs space-y-2">
                            <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-extrabold block">
                              Requested Booking Preferences
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-neutral-700 dark:text-neutral-300 font-medium">
                              <div>
                                <span className="text-neutral-400 text-[11px] block">City:</span>
                                <span className="font-bold text-neutral-900 dark:text-white">{b.preferredCity || 'Not specified'}</span>
                              </div>
                              <div>
                                <span className="text-neutral-400 text-[11px] block">Test Centre:</span>
                                <span className="font-bold text-neutral-900 dark:text-white">{b.preferredTestCentre || 'Any Test Centre'}</span>
                              </div>
                              <div>
                                <span className="text-neutral-400 text-[11px] block">Date:</span>
                                <span className="font-bold text-neutral-900 dark:text-white">{b.preferredDate ? formatDate(b.preferredDate) : 'Flexible'}</span>
                              </div>
                              <div>
                                <span className="text-neutral-400 text-[11px] block">Time Slot:</span>
                                <span className="font-bold text-neutral-900 dark:text-white">{b.preferredTime || 'Any Time'}</span>
                              </div>
                            </div>
                            {b.message && (
                              <div className="pt-1 text-[11px] text-neutral-500 border-t border-neutral-100 dark:border-neutral-800">
                                <span className="font-semibold text-neutral-700 dark:text-neutral-300">Notes: </span>
                                {b.message}
                              </div>
                            )}
                          </div>

                          {isConfirmed && cd ? (
                            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 space-y-3">
                              <div className="flex items-center gap-2 text-xs font-black text-emerald-800 dark:text-emerald-300">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>Official Pearson PTE Appointment Confirmed</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3.5 rounded-xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] text-xs">
                                <div>
                                  <span className="text-[10px] uppercase text-neutral-400 block font-bold">Booking Reference</span>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="font-mono font-black text-sm text-[#FF005C] select-all">
                                      {cd.bookingReference || '—'}
                                    </span>
                                    {cd.bookingReference && (
                                      <button
                                        onClick={() => copy(b._id, cd.bookingReference as string)}
                                        className="p-1 rounded bg-neutral-100 dark:bg-[#222] text-neutral-500 hover:text-ink cursor-pointer"
                                        title="Copy reference"
                                      >
                                        {copiedId === b._id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase text-neutral-400 block font-bold">Test Centre</span>
                                  <span className="font-bold text-neutral-900 dark:text-white block mt-0.5">
                                    {cd.confirmedCentre || '—'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase text-neutral-400 block font-bold">City</span>
                                  <span className="font-bold text-neutral-900 dark:text-white block mt-0.5">
                                    {cd.confirmedCity || b.preferredCity || '—'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase text-neutral-400 block font-bold">Exam Date</span>
                                  <span className="font-bold text-neutral-900 dark:text-white block mt-0.5">
                                    {cd.confirmedDate ? formatDate(cd.confirmedDate) : '—'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase text-neutral-400 block font-bold">Exam Time</span>
                                  <span className="font-bold text-neutral-900 dark:text-white block mt-0.5">
                                    {cd.confirmedTime || '—'}
                                  </span>
                                </div>
                              </div>
                              {cd.importantInstructions && (
                                <div className="p-3 rounded-lg bg-emerald-100/50 dark:bg-emerald-900/30 text-xs text-emerald-900 dark:text-emerald-200">
                                  <span className="font-bold block mb-0.5">Important Instructions:</span>
                                  <p className="whitespace-pre-line leading-relaxed font-normal">{cd.importantInstructions}</p>
                                </div>
                              )}
                            </div>
                          ) : isFailed ? (
                            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-xs font-bold text-rose-700 dark:text-rose-300">
                              {b.status === 'Cancelled / Refund Required'
                                ? 'This booking request was cancelled. If you are eligible for a refund, our support team will process it to your original payment method.'
                                : 'Our team was unable to complete this booking. A representative will contact you with alternative options or a full refund.'}
                            </div>
                          ) : (
                            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                              <Clock className="w-4 h-4 shrink-0 text-amber-600" />
                              <span>
                                Payment Received • Booking in Progress — Our team is actively processing your booking with Pearson. Your exam is NOT confirmed until our team enters and confirms the official appointment.
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === 'vouchers' && (
              <div className="space-y-4">
                {(userVouchers?.length || 0) === 0 && <EmptyState icon={<Ticket className="w-7 h-7 text-neutral-400" />} title="Your vault is empty" desc="Buy your first voucher and the code lands here instantly." />}
                {userVouchers?.map((v) => {
                  const isRevealed = revealedCodes[v.id];
                  const isExpired = v.status === 'EXPIRED' || v.daysRemaining <= 0;
                  return (
                    <div key={v.id} className={`rounded-3xl p-5 sm:p-7 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm ${isExpired ? 'opacity-70' : ''}`}>
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black border ${statusColor(v.status)}`}>{v.status}</span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-neutral-500 dark:text-[#B5B5B5]">
                              <Clock className="w-3.5 h-3.5" />
                              {v.daysRemaining > 0 ? `${v.daysRemaining} days left` : 'Expired'}
                            </span>
                            {v.transferredTo && <span className="text-[11px] font-bold text-amber-700">Transferred to {v.transferredTo}</span>}
                          </div>
                          <h4 className="font-heading font-black text-lg text-neutral-900 dark:text-white mb-1">
                            {v.productName}
                            {v.voucherType ? <span className="text-neutral-400 font-bold text-sm"> · {v.voucherType}</span> : null}
                          </h4>
                          {v.paymentStatus && (
                            <div className="mb-1.5">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                                {v.paymentStatus === 'PAID' ? 'Paid' : v.paymentStatus}
                                {' • '}
                                {v.emailStatus === 'SENT' ? 'Delivered' : v.emailStatus === 'FAILED' ? 'Email pending' : v.fulfillmentStatus === 'FULFILLED' ? 'In account' : 'Processing'}
                              </span>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-bold text-neutral-500 dark:text-[#B5B5B5]">
                            <span>Brand: {v.brand || '—'}</span>
                            <span>Purchased: {new Date((v.purchaseDate as string) || (v.assignedAt as string) || (v.createdAt as string)).toLocaleDateString()}</span>
                            <span>Expiry: {new Date(v.expiryDate).toLocaleDateString()}</span>
                            {v.orderNo && <span>Order: #{v.orderNo}</span>}
                            {v.amountPaid != null && <span>Paid: {formatPrice(v.amountPaid)}</span>}
                          </div>

                          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#F3EEFF] dark:bg-[#1e1638] border border-[#6C3CE0]/20 flex-1 min-w-0">
                              <ShieldCheck className="w-5 h-5 text-[#6C3CE0] shrink-0" />
                              <span className="font-mono font-black tracking-wider text-neutral-900 dark:text-white truncate text-sm">{isRevealed ? v.code : `${v.code?.slice(0, 4) || 'XXXX'}-XXXX-XXXX-XXXX`}</span>
                              <div className="ml-auto flex items-center gap-2 shrink-0">
                                <button onClick={() => toggleReveal(v.id)} className="p-1.5 rounded-lg bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] text-neutral-600 dark:text-neutral-300 text-[10px] font-black cursor-pointer">
                                  {isRevealed ? 'HIDE' : 'REVEAL'}
                                </button>
                                <button onClick={() => copy(v.id, v.code)} className="p-2 rounded-lg bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] text-neutral-600 dark:text-neutral-300 cursor-pointer">
                                  {copiedId === v.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {!['USED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(v.status) && (
                            <>
                              <button onClick={() => markVoucherUsed(v.id)} className="px-3.5 py-2.5 rounded-xl text-xs font-black bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-900/40 flex items-center gap-1.5 cursor-pointer">
                                <ShieldCheck className="w-4 h-4" /> Mark Used
                              </button>
                              <button onClick={() => setTransferModalId(v.id)} className="px-3.5 py-2.5 rounded-xl text-xs font-black bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 flex items-center gap-1.5 cursor-pointer">
                                <Send className="w-4 h-4" /> Transfer
                              </button>
                              <button onClick={() => setRefundConfirmId(v.id)} className="px-3.5 py-2.5 rounded-xl text-xs font-black bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 flex items-center gap-1.5 cursor-pointer">
                                <RefreshCw className="w-4 h-4" /> Request Refund
                              </button>
                            </>
                          )}
                          {v.officialWebsiteUrl && (
                            <a href={v.officialWebsiteUrl} target="_blank" rel="noreferrer" className="px-3.5 py-2.5 rounded-xl text-xs font-black bg-brand-pink text-white shadow flex items-center gap-1.5">
                              <ExternalLink className="w-4 h-4" /> Redeem
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'preparing' && (
              <div className="rounded-3xl p-5 sm:p-6 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <div>
                    <h3 className="font-black text-xl text-neutral-900 dark:text-white">Preparing Vouchers</h3>
                    <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 mt-0.5">Paid vouchers that are being prepared and will be delivered within 1–2 minutes.</p>
                  </div>
                  <button onClick={() => loadAccountData()} className="px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] hover:border-brand-pink text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer">
                    <RotateCcw className="w-4 h-4" /> Refresh
                  </button>
                </div>

                <div className="space-y-4">
                  {(!userFulfillments || userFulfillments.length === 0) && (
                    <EmptyState icon={<Ticket className="w-7 h-7 text-neutral-400" />} title="Nothing being prepared" desc="Paid vouchers awaiting delivery will appear here." />
                  )}

                  {userFulfillments?.map((r) => {
                    const isProcessing = r.status === 'PROCESSING';
                    return (
                      <div key={r.id} className="rounded-2xl p-5 bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200/60 dark:border-[#202020] pb-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-neutral-200/80 dark:bg-[#222] text-brand-pink">{(r.requestId as string) || (r.orderNo as string) || '—'}</span>
                            <span className="font-black text-neutral-900 dark:text-white text-sm">{(r.productName as string) || 'Voucher'}</span>
                            <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black ${isProcessing ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400' : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'}`}>
                              {isProcessing ? 'Paid • Preparing' : 'Delivered'}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-neutral-400">Ordered {formatDate(r.createdAt as string)}</div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-bold">
                          <div>
                            <span className="text-[10px] uppercase text-neutral-400 block">Amount Paid</span>
                            <span className="text-neutral-900 dark:text-white">{formatPrice(r.amountPaid as number)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-neutral-400 block">Order</span>
                            <span className="text-neutral-900 dark:text-white">#{(r.orderNo as string) || '—'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-neutral-400 block">Delivered</span>
                            <span className="text-neutral-900 dark:text-white">{r.deliveredAt ? formatDate(r.deliveredAt as string) : '—'}</span>
                          </div>
                        </div>

                        {isProcessing && (
                          <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/40 text-[11px] font-bold text-sky-700 dark:text-sky-300 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5" />
                            Paid • Preparing — your voucher is being prepared and will be delivered within 1–2 minutes.
                          </div>
                        )}

                        {!isProcessing && r.voucherCode && (
                          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-black text-emerald-800 dark:text-emerald-300">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Voucher Ready</span>
                            </div>
                            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929]">
                              <ShieldCheck className="w-5 h-5 text-[#6C3CE0] shrink-0" />
                              <span className="font-mono font-black tracking-wider text-neutral-900 dark:text-white truncate text-sm">{r.voucherCode}</span>
                              <div className="ml-auto flex items-center gap-2 shrink-0">
                                <button onClick={() => copy(r.id, r.voucherCode as string)} className="p-2 rounded-lg bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-neutral-600 dark:text-neutral-300 cursor-pointer">
                                  {copiedId === r.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                            <button onClick={() => setTab('vouchers')} className="text-brand-pink hover:underline text-[11px] font-bold cursor-pointer">
                              View in My Vouchers
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'profile' && (
              <div className="space-y-6 max-w-3xl">
                <div className="rounded-3xl p-5 sm:p-7 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                    <div className="relative group shrink-0">
                      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl border-2 border-[#EAEAEA] dark:border-[#292929] overflow-hidden bg-neutral-100 dark:bg-[#1A1A1A] flex items-center justify-center">
                        {avatarPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : user?.profileImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarUrl(user.profileImageUrl) || undefined} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-4xl font-black text-neutral-300 dark:text-neutral-600 select-none">{(user?.name?.[0] || 'A').toUpperCase()}</span>
                        )}
                      </div>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 rounded-3xl bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all cursor-pointer">
                        <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarSelect} className="hidden" />
                    </div>

                    <div className="flex-1 text-center sm:text-left">
                      <h2 className="font-heading font-black text-xl sm:text-2xl text-neutral-900 dark:text-white">{user?.name || 'Apex User'}</h2>
                      <p className="text-sm font-bold text-neutral-500 dark:text-[#B5B5B5] mt-0.5">{user?.email}</p>
                      <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                        <VerifiedBadge verified={!!user?.emailVerified} verifiedLabel="Email verified" unverifiedLabel="Email not verified" />
                        {user?.phone && <VerifiedBadge verified={!!user?.phoneVerified} verifiedLabel="Phone verified" unverifiedLabel="Phone not verified" />}
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4 justify-center sm:justify-start">
                        {avatarPreview ? (
                          <>
                            <button onClick={uploadAvatar} disabled={avatarUploading} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-brand-pink text-white shadow disabled:opacity-60 cursor-pointer">
                              {avatarUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                              {avatarUploading ? 'Uploading...' : 'Save Photo'}
                            </button>
                            <button onClick={cancelAvatarPreview} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-neutral-100 dark:bg-[#262626] text-neutral-700 dark:text-neutral-300 cursor-pointer">
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-neutral-100 dark:bg-[#262626] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer">
                              <Camera className="w-3.5 h-3.5" /> Change Photo
                            </button>
                            {user?.profileImageUrl && (
                              <button onClick={removeAvatar} disabled={avatarRemoving} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-60 cursor-pointer">
                                {avatarRemoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                Remove
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl p-5 sm:p-7 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-black text-lg text-neutral-900 dark:text-white flex items-center gap-2">
                      <UserIcon className="w-5 h-5 text-brand-pink" />
                      Personal Information
                    </h3>
                    {!editingProfile && (
                      <button type="button" onClick={startEditProfile} className="text-xs font-black text-brand-pink hover:underline cursor-pointer">
                        Edit Profile
                      </button>
                    )}
                  </div>

                  {profileDirty && (
                    <div className="mb-5 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <span className="text-xs font-black text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> You have unsaved changes.
                      </span>
                      <div className="flex gap-2">
                        <button type="button" onClick={discardProfileEdit} className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-white dark:bg-[#161616] border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 cursor-pointer">
                          Discard Changes
                        </button>
                        <button type="button" onClick={saveProfile} className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-amber-600 text-white cursor-pointer">
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}

                  <form onSubmit={saveProfile} className="space-y-5">
                    {editingProfile ? (
                      <Field label="Full Name" value={profileName} onChange={(e) => { setProfileName(e.target.value); setProfileNameError(''); }} required error={profileNameError} icon={<UserIcon className="w-4 h-4" />} />
                    ) : (
                      <ReadOnlyRow icon={<UserIcon className="w-3.5 h-3.5" />} label="Full Name" value={user?.name || '—'} />
                    )}

                    <div>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-500 dark:text-[#B5B5B5] mb-2 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> Email Address
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="email" value={user?.email || ''} disabled className="flex-1 min-w-0 px-4 py-3 bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] rounded-2xl text-neutral-900 dark:text-white text-sm font-bold opacity-70 cursor-not-allowed" />
                        <VerifiedBadge verified={!!user?.emailVerified} verifiedLabel="Verified" unverifiedLabel="Not verified" />
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-500 dark:text-[#B5B5B5] mb-2 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" /> Phone Number
                      </span>
                      {user?.phone ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input type="text" value={user.phone} disabled className="flex-1 min-w-0 px-4 py-3 bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] rounded-2xl text-neutral-900 dark:text-white text-sm font-bold opacity-70 cursor-not-allowed" />
                          <VerifiedBadge verified={!!user?.phoneVerified} verifiedLabel="Verified" unverifiedLabel="Not verified" />
                        </div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-dashed border-[#EAEAEA] dark:border-[#292929]">
                          <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">Phone number not added</span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 flex gap-3">
                      <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-black text-amber-800 dark:text-amber-300 mb-0.5">Government ID Match Required</p>
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400/80">Pearson and other exam providers require the name on your exam booking to exactly match your government-issued photo ID (passport, national ID, etc.).</p>
                      </div>
                    </div>

                    {editingProfile && (
                      <div className="flex items-center gap-3 pt-1">
                        <button type="submit" disabled={profileLoading} className="btn-pink text-white px-6 py-3 rounded-2xl font-black shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer">
                          {profileLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" /> Saving changes...
                            </>
                          ) : (
                            'Save Changes'
                          )}
                        </button>
                        <button type="button" onClick={discardProfileEdit} className="px-5 py-3 rounded-2xl text-sm font-black bg-neutral-100 dark:bg-[#262626] text-neutral-700 dark:text-neutral-300 cursor-pointer">
                          Cancel
                        </button>
                      </div>
                    )}
                    {profileSuccess && (
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Profile updated successfully
                      </span>
                    )}
                  </form>
                </div>
              </div>
            )}

            {tab === 'security' && (
              <div className="space-y-6 max-w-2xl">
                <div className="rounded-3xl p-5 sm:p-7 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
                  <h3 className="font-black text-lg mb-5 text-neutral-900 dark:text-white flex items-center gap-2">
                    <Lock className="w-5 h-5 text-brand-pink" />
                    Change Password
                  </h3>

                  <form onSubmit={submitPasswordChange} className="space-y-4">
                    <PasswordField
                      label="Current Password"
                      value={passwordForm.current}
                      onChange={(e) => { setPasswordForm({ ...passwordForm, current: e.target.value }); setPasswordErrors({ ...passwordErrors, current: null }); }}
                      show={showCurrentPwd}
                      onToggle={() => setShowCurrentPwd(!showCurrentPwd)}
                      error={passwordErrors.current}
                      placeholder="Enter your current password"
                    />

                    <div>
                      <PasswordField
                        label="New Password"
                        value={passwordForm.newPwd}
                        onChange={(e) => { setPasswordForm({ ...passwordForm, newPwd: e.target.value }); setPasswordErrors({ ...passwordErrors, newPwd: null }); }}
                        show={showNewPwd}
                        onToggle={() => setShowNewPwd(!showNewPwd)}
                        error={passwordErrors.newPwd}
                        placeholder="Choose a strong new password"
                      />
                      <PasswordStrengthChecklist password={passwordForm.newPwd} />
                    </div>

                    <Field
                      label="Confirm New Password"
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) => { setPasswordForm({ ...passwordForm, confirm: e.target.value }); setPasswordErrors({ ...passwordErrors, confirm: null }); }}
                      error={passwordErrors.confirm}
                      placeholder="Re-enter new password"
                      icon={<Lock className="w-4 h-4" />}
                    />

                    <div className="flex items-center gap-3 pt-1">
                      <button type="submit" disabled={passwordLoading || (!passwordForm.current && !passwordForm.newPwd)} className="btn-pink text-white px-6 py-3 rounded-2xl font-black shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer">
                        {passwordLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Updating...
                          </>
                        ) : (
                          <>
                            <Shield className="w-4 h-4" /> Update Password
                          </>
                        )}
                      </button>
                      {passwordSuccess && (
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Password changed
                        </span>
                      )}
                    </div>
                  </form>
                </div>

                <div className="rounded-3xl p-5 sm:p-7 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
                  <h4 className="font-black text-sm text-neutral-900 dark:text-white mb-4">Verification Status</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929]">
                      <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> Email
                      </span>
                      <VerifiedBadge verified={!!user?.emailVerified} verifiedLabel="Verified" unverifiedLabel="Not verified" />
                    </div>
                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929]">
                      <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" /> Phone
                      </span>
                      {user?.phone ? <VerifiedBadge verified={!!user?.phoneVerified} verifiedLabel="Verified" unverifiedLabel="Not verified" /> : <span className="text-[10px] font-black text-neutral-400">Not added</span>}
                    </div>
                  </div>
                </div>

                <button onClick={handleLogout} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition cursor-pointer">
                  <LogOut className="w-4 h-4" /> Log Out of This Account
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {transferModalId && (
        <Modal title="Transfer Voucher" onClose={() => setTransferModalId(null)}>
          <form onSubmit={submitTransfer} className="space-y-4">
            <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400">Enter the email address of the person you want to transfer this voucher to. This cannot be undone.</p>
            <Field label="Recipient Email" type="email" value={transferEmail} onChange={(e) => setTransferEmail(e.target.value)} required icon={<Mail className="w-4 h-4" />} />
            <button type="submit" className="w-full btn-pink text-white py-3 rounded-2xl font-black cursor-pointer">
              Transfer Voucher
            </button>
          </form>
        </Modal>
      )}

      {refundConfirmId && (
        <Modal title="Request Refund" onClose={() => setRefundConfirmId(null)}>
          <p className="text-sm font-bold text-neutral-600 dark:text-neutral-300 mb-5">Are you sure you want to request a refund for this voucher? Our support team will process eligible requests within 2 hours.</p>
          <div className="flex gap-3">
            <button onClick={() => setRefundConfirmId(null)} className="flex-1 py-3 rounded-2xl text-sm font-black bg-neutral-100 dark:bg-[#262626] text-neutral-700 dark:text-neutral-300 cursor-pointer">
              Cancel
            </button>
            <button
              onClick={() => {
                requestRefund(refundConfirmId);
                setRefundConfirmId(null);
              }}
              className="flex-1 py-3 rounded-2xl text-sm font-black bg-rose-600 text-white cursor-pointer"
            >
              Confirm Refund
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
