'use client';

import { useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ApexLogo } from '@/components/apex-logo';

export function PageShell({ title, subtitle, children, badge = null }: { title: string; subtitle: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <section className="min-h-screen bg-surface-sunken flex items-center justify-center py-16 px-4 transition-colors duration-300">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center mb-6">
          <ApexLogo />
          {badge && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 text-[11px] font-medium uppercase tracking-wider">{badge}</div>
          )}
        </div>
        <div className="bg-surface border border-line rounded-3xl shadow-xl p-7 text-ink">
          <h1 className="font-heading text-2xl font-medium mb-1 tracking-tight">{title}</h1>
          <p className="text-sm text-ink-muted mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </section>
  );
}

export function LabeledInput({
  icon,
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  required = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-muted mb-2 block">{label}</span>
      <div className="relative">
        <div className="absolute inset-y-0 left-3.5 flex items-center text-neutral-400">{icon}</div>
        <input
          required={required}
          type={effectiveType}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          className={`w-full pl-11 ${isPassword ? 'pr-11' : 'pr-4'} py-3.5 bg-surface-raised border border-line rounded-2xl text-ink text-sm font-normal placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-3.5 flex items-center text-neutral-400 hover:text-ink transition-colors cursor-pointer"
            title={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </label>
  );
}
