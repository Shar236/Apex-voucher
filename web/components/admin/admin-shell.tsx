'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Crown, LogOut, Menu, ChevronDown, User, ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetClose } from '@/components/ui/sheet';
import type { AdminNotificationCounts } from '@/components/admin/notifications';
import { ApexLogo } from '@/components/apex-logo';

/**
 * The admin console shell — sidebar, mobile drawer and page header.
 *
 * Extracted from admin-console.tsx so the same navigation renders in two places
 * (the fixed desktop rail and the mobile Sheet) from one definition rather than
 * being duplicated, and so the previous mobile layout — a horizontally scrolling
 * strip of fifteen buttons above the content — is replaced by a real drawer.
 */

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: keyof AdminNotificationCounts;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

function NavButton({
  item,
  active,
  count,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  count: number;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={`w-full inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl font-black text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink ${
        active
          ? 'bg-brand-pink text-white shadow-lg'
          : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#1e1e1e]'
      }`}
    >
      {item.icon}
      <span className="flex-1 text-left">{item.label}</span>
      {count > 0 && (
        <span
          aria-label={`${count} needing attention`}
          className={`min-w-5 px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums ${
            active
              ? 'bg-white/25 text-white'
              : item.badge === 'pendingFulfillments'
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
          }`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

export function AdminNav({
  groups,
  tab,
  counts,
  onSelect,
  user,
  onLogout,
}: {
  groups: NavGroup[];
  tab: string;
  counts: AdminNotificationCounts;
  onSelect: (id: string) => void;
  user?: { name?: string; email?: string } | null;
  onLogout: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="mb-6 rounded-2xl border border-[#6C3CE0]/20 bg-[#F3EEFF] p-4 dark:bg-[#1e1638]">
          <p className="mb-1 text-xs font-black text-[#6C3CE0]">Signed in as</p>
          <p className="truncate font-black">{user?.name}</p>
          <p className="truncate text-xs font-bold text-neutral-500 dark:text-[#B5B5B5]">{user?.email}</p>
        </div>

        <nav aria-label="Admin sections" className="flex flex-col gap-1">
          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-4 pb-1.5 pt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-600">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={tab === item.id}
                  count={item.badge ? counts[item.badge] || 0 : 0}
                  onSelect={() => onSelect(item.id)}
                />
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-6 space-y-2 border-t border-[#EAEAEA] pt-5 dark:border-[#292929]">
        <Link
          href="/"
          className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[#EAEAEA] bg-neutral-50 px-4 py-3 text-xs font-black text-neutral-700 transition hover:border-brand-pink dark:border-[#292929] dark:bg-[#161616] dark:text-neutral-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back to store
        </Link>
        <button
          onClick={onLogout}
          className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-black text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}

/** Sticky header: drawer trigger, breadcrumb + page title, notification bell. */
export function AdminHeader({
  groups,
  tab,
  criticalCount,
  salesCount,
  onOpenNav,
  onOpenNotifications,
  onSelectTab,
  user,
  onLogout,
}: {
  groups: NavGroup[];
  tab: string;
  criticalCount: number;
  salesCount: number;
  onOpenNav: () => void;
  onOpenNotifications: () => void;
  onSelectTab?: (tab: string) => void;
  user?: { name?: string; email?: string } | null;
  onLogout?: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileOpen]);

  const group = groups.find((g) => g.items.some((i) => i.id === tab));
  const item = group?.items.find((i) => i.id === tab);

  return (
    <header className="sticky top-0 z-30 -mx-4 mb-6 flex items-center gap-3 border-b border-[#EAEAEA] bg-white/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 dark:border-[#222] dark:bg-[#0B0D13]/95 shadow-sm">
      <button
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="rounded-xl bg-neutral-100 p-2 text-neutral-700 transition hover:text-brand-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink lg:hidden dark:bg-[#202020] dark:text-neutral-200 cursor-pointer"
      >
        <Menu className="h-4 w-4" />
      </button>

      {tab !== 'dashboard' && onSelectTab && (
        <button
          onClick={() => onSelectTab('dashboard')}
          aria-label="Back to Dashboard"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-pink text-white px-3.5 py-1.5 text-xs font-black shadow-md hover:bg-brand-pink/90 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </button>
      )}

      <div className="min-w-0 flex-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-neutral-400">
          <button
            onClick={() => onSelectTab?.('dashboard')}
            className="hover:text-brand-pink text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
          >
            Dashboard
          </button>
          {group && group.label !== 'Overview' && (
            <>
              <span>/</span>
              <span>{group.label}</span>
            </>
          )}
          {item && item.id !== 'dashboard' && (
            <>
              <span>/</span>
              <span className="text-brand-pink">{item.label}</span>
            </>
          )}
        </nav>
        <h2 className="truncate font-heading text-sm font-black text-neutral-900 dark:text-white">
          {item?.label || 'Overview'}
        </h2>
      </div>

      <button
        onClick={onOpenNotifications}
        aria-label={`Notifications${criticalCount ? `, ${criticalCount} needing attention` : ''}`}
        title="Admin Notifications"
        className="relative rounded-xl bg-neutral-100 p-2 text-neutral-700 transition hover:text-brand-pink hover:bg-brand-pink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink dark:bg-[#202020] dark:text-neutral-200 cursor-pointer active:scale-95"
      >
        <Bell className="h-4 w-4" />
        {(criticalCount > 0 || salesCount > 0) && (
          <span
            className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white ${
              criticalCount > 0 ? 'bg-rose-600 animate-pulse' : 'bg-emerald-600'
            }`}
          >
            {criticalCount > 0 ? '!' : salesCount}
          </span>
        )}
      </button>

      {/* Interactive Admin Profile Dropdown */}
      <div className="relative" ref={profileRef}>
        <button
          onClick={() => setProfileOpen((prev) => !prev)}
          className="items-center gap-1.5 rounded-full border border-brand-pink/30 bg-brand-pink/10 hover:bg-brand-pink/20 px-3 py-1.5 text-[11px] font-black text-brand-pink inline-flex transition cursor-pointer active:scale-95 shadow-sm"
          title="Admin Profile Menu"
          aria-expanded={profileOpen}
        >
          <Crown className="h-3.5 w-3.5" />
          <span>ADMIN</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
        </button>

        {profileOpen && (
          <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-[#EAEAEA] dark:border-[#262626] bg-white dark:bg-[#141414] p-3 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#F3EEFF] dark:bg-[#1e1638] mb-2 border border-[#6C3CE0]/20">
              <div className="w-9 h-9 rounded-xl bg-brand-pink text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                <Crown className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-xs truncate text-neutral-900 dark:text-white">
                  {user?.name || 'Apex Administrator'}
                </p>
                <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 truncate">
                  {user?.email || 'info@apexvouchers.com'}
                </p>
                <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-mono text-[9px] font-black">
                  Super Admin
                </span>
              </div>
            </div>

            <div className="space-y-1 text-xs font-bold text-neutral-700 dark:text-neutral-200">
              <Link
                href="/"
                onClick={() => setProfileOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-[#202020] transition"
              >
                <span className="flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5 text-brand-pink" />
                  <span>Visit Storefront</span>
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">Store</span>
              </Link>
              <Link
                href="/account"
                onClick={() => setProfileOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-[#202020] transition"
              >
                <span className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-purple-500" />
                  <span>Account Settings</span>
                </span>
              </Link>
            </div>

            {onLogout && (
              <div className="mt-2 pt-2 border-t border-[#EAEAEA] dark:border-[#262626]">
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/** Mobile navigation drawer. */
export function AdminNavDrawer({
  open,
  onOpenChange,
  ...navProps
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & React.ComponentProps<typeof AdminNav>) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" title="Admin navigation" className="p-5">
        <div className="mb-6">
          <ApexLogo className="h-7" />
        </div>
        <SheetClose asChild>
          <div>
            <AdminNav {...navProps} />
          </div>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
