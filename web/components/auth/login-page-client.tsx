'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { PageShell, LabeledInput } from '@/components/auth/page-shell';

export function LoginPageClient() {
  const { login, resendRegistrationOtp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [resendMsg, setResendMsg] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorCode('');
    setResendState('idle');
    setLoading(true);
    const res = await login({ email, password });
    setLoading(false);
    if (res.success) {
      // Route by the backend-provided role, never a hardcoded default. An admin
      // landing on /login directly (no ?from=) must still go to /admin, not the
      // customer dashboard. A ?from= that points at an area the user may not
      // enter (e.g. a customer bounced off /admin) is corrected below.
      const role = (res.user as { role?: string } | undefined)?.role;
      const isAdmin = role === 'admin';
      // Only same-origin absolute paths — reject "//host" / "/\host" open-redirects.
      const safeFrom = fromParam && /^\/(?![/\\])/.test(fromParam) ? fromParam : null;
      let target = safeFrom ?? (isAdmin ? '/admin' : '/account');
      if (target.startsWith('/admin') && !isAdmin) target = '/account';
      if (target.startsWith('/account') && isAdmin) target = '/admin';
      router.replace(target);
    } else {
      setError(res.message || 'Login failed');
      setErrorCode(res.code || '');
    }
  };

  const handleResendVerification = async () => {
    setResendState('sending');
    const res = await resendRegistrationOtp(email);
    if (res.success) {
      setResendState('sent');
      setResendMsg(res.message || 'Verification email sent. Check your inbox and spam folder.');
    } else {
      setResendState('failed');
      setResendMsg(res.message || 'Unable to send the verification email. Please try again shortly.');
    }
  };

  return (
    <PageShell title="Welcome Back" subtitle="Log in to your Apex Vouchers account to manage vouchers.">
      <form onSubmit={onSubmit} className="space-y-4">
        <LabeledInput icon={<Mail className="w-4 h-4" />} label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <LabeledInput icon={<Lock className="w-4 h-4" />} label="Password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && (
          <div className="text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 rounded-xl px-3 py-2.5 space-y-2">
            <p>{error}</p>
            {errorCode === 'EMAIL_NOT_VERIFIED' && (
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendState === 'sending' || resendState === 'sent'}
                className="text-accent hover:underline font-medium disabled:opacity-60 cursor-pointer"
              >
                {resendState === 'sending' && 'Sending…'}
                {resendState === 'sent' && (resendMsg || 'Verification code sent — check your inbox & spam')}
                {(resendState === 'idle' || resendState === 'failed') && 'Resend verification email'}
              </button>
            )}
            {resendState === 'failed' && <p className="text-rose-600">{resendMsg}</p>}
            {resendState === 'sent' && (
              <Link href={`/register?pendingEmail=${encodeURIComponent(email)}`} className="block text-accent hover:underline font-medium">
                Enter verification code →
              </Link>
            )}
          </div>
        )}
        <button disabled={loading} className="w-full py-3.5 rounded-2xl bg-accent hover:bg-accent-hover text-white font-medium shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? 'Signing in…' : 'Log in'}
          {!loading && <ArrowRight className="w-4 h-4" />}
        </button>
        <div className="flex justify-between text-xs font-semibold text-ink-muted pt-1">
          <Link className="hover:text-accent transition-colors" href="/forgot-password">
            Forgot password?
          </Link>
          <Link className="hover:text-accent transition-colors" href="/register">
            Create Account →
          </Link>
        </div>
        <div className="mt-4 pt-4 border-t border-line flex items-center justify-center text-[11px] font-bold text-neutral-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Safe &amp; Secure
          </span>
        </div>
      </form>
    </PageShell>
  );
}
