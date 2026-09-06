'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Sparkles, Clock, ShoppingCart, Package, Users, Ticket, Tag, AlertTriangle, RefreshCw,
  CalendarCheck, FileSpreadsheet, Download, ShieldAlert, PencilRuler,
} from 'lucide-react';
import { adminApi, formatPrice } from '@/lib/api';
import { StatCard, Empty } from '@/components/admin/admin-ui';
import { notify } from '@/components/ui/toast';
import { DashboardCharts, type RevenuePoint, type CountPoint } from '@/components/admin/charts';

interface DashboardData {
  kpi?: Record<string, number | null>;
  charts?: {
    dailyRevenue?: RevenuePoint[];
    dailyVouchersSold?: CountPoint[];
    dailyNewCustomers?: CountPoint[];
  };
  tables?: {
    bestSellers?: Array<{ id: string; name: string; unitsSold: number; stock: number; revenue: number; sellingPrice: number }>;
    lowStockProducts?: Array<{ id: string; name: string; brand: string; availableStock: number; sellingPrice: number; lowStockThreshold: number }>;
    recentOrders?: Array<Record<string, unknown>>;
  };
  alerts?: Record<string, number>;
}

export function Dashboard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [period, setPeriod] = useState('today');
  const [unmaskedExport, setUnmaskedExport] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchDashboard = useCallback(async (selectedPeriod: string) => {
    setLoading(true);
    try {
      const res = await adminApi.dashboard({ period: selectedPeriod });
      if (!res.success) {
        setLoadError(res.message || 'Could not load dashboard data.');
        setData(null);
      } else {
        setLoadError('');
        setData((res.data as DashboardData) || null);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load dashboard data.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard(period);
  }, [period, reloadKey, fetchDashboard]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await adminApi.dashboard({ period });
      if (res.success) {
        setData((res.data as DashboardData) || null);
        setLoadError('');
        notify.success('Dashboard metrics updated');
      } else {
        notify.error(res.message || 'Failed to refresh dashboard');
      }
    } catch {
      notify.error('Failed to refresh dashboard');
    } finally {
      setLoading(false);
    }
  };

  const kpi = data?.kpi || {};
  const charts = data?.charts || {};
  const tables = data?.tables || {};
  const alerts = data?.alerts || {};

  const periodLabel =
    period === 'today'
      ? 'Today'
      : period === '7d'
      ? 'Last 7 Days'
      : period === '90d'
      ? 'Last 90 Days'
      : 'Last 30 Days';

  const stats = [
    {
      label: `Net Revenue (${periodLabel})`,
      value: formatPrice((kpi.netRevenue as number) || 0),
      icon: <Sparkles className="w-5 h-5" />,
      tint: '#FF005C',
      sub: kpi.lifetimeRevenue ? `All-time: ${formatPrice(kpi.lifetimeRevenue as number)}` : 'Excludes refunded/cancelled',
    },
    { label: "Today's Revenue", value: formatPrice((kpi.todayRevenue as number) || 0), icon: <Sparkles className="w-5 h-5" />, tint: '#10B981', growth: (kpi.revenueGrowth as number) ?? null },
    { label: "Yesterday's Revenue", value: formatPrice((kpi.yesterdayRevenue as number) || 0), icon: <Clock className="w-5 h-5" />, tint: '#8B5CF6' },
    {
      label: `Orders (${periodLabel})`,
      value: kpi.totalOrders ?? 0,
      icon: <ShoppingCart className="w-5 h-5" />,
      tint: '#EC4899',
      sub: kpi.lifetimeOrders ? `All-time: ${kpi.lifetimeOrders}` : undefined,
      onClick: () => onNavigate('orders'),
    },
    { label: "Today's Orders", value: kpi.todayOrders || 0, icon: <ShoppingCart className="w-5 h-5" />, tint: '#0EA5E9', growth: (kpi.ordersGrowth as number) ?? null, onClick: () => onNavigate('orders') },
    {
      label: `Products Sold (${periodLabel})`,
      value: kpi.totalProductsSold ?? 0,
      icon: <Package className="w-5 h-5" />,
      tint: '#6C3CE0',
      sub: kpi.lifetimeProductsSold ? `All-time: ${kpi.lifetimeProductsSold}` : undefined,
      onClick: () => onNavigate('products'),
    },
    { label: 'Total Customers', value: kpi.totalCustomers || 0, icon: <Users className="w-5 h-5" />, tint: '#14B8A6', onClick: () => onNavigate('users') },
    { label: 'Available Vouchers', value: kpi.availableVouchers || 0, icon: <Ticket className="w-5 h-5" />, tint: '#F59E0B', onClick: () => onNavigate('vouchers') },
    { label: 'Active Promotions', value: kpi.activePromotions || 0, icon: <Tag className="w-5 h-5" />, tint: '#3B82F6', onClick: () => onNavigate('promotions') },
    { label: 'Pending Orders', value: kpi.pendingOrders || 0, icon: <Clock className="w-5 h-5" />, tint: '#F97316', onClick: () => onNavigate('orders') },
    { label: 'Refunds Processed', value: kpi.refunds || 0, icon: <AlertTriangle className="w-5 h-5" />, tint: '#EF4444', onClick: () => onNavigate('orders') },
    { label: 'New PTE Requests', value: kpi.newPTEBookingRequests || 0, icon: <CalendarCheck className="w-5 h-5" />, tint: '#0EA5E9', onClick: () => onNavigate('pte-bookings') },
    { label: 'Open Voucher Requests', value: kpi.newVoucherRequests || 0, icon: <Ticket className="w-5 h-5" />, tint: '#EA580C', onClick: () => onNavigate('voucher-requests') },
  ];

  // Quick actions. Each one navigates to the section that owns the task —
  // nothing here is decorative, and no action exists without a destination.
  const quickActions = [
    { label: 'Add voucher codes', icon: <Ticket className="w-4 h-4" />, tab: 'vouchers' },
    { label: 'Add product', icon: <Package className="w-4 h-4" />, tab: 'products' },
    { label: 'Pending fulfillment', icon: <Clock className="w-4 h-4" />, tab: 'fulfillments' },
    { label: 'View orders', icon: <ShoppingCart className="w-4 h-4" />, tab: 'orders' },
    { label: 'Create coupon', icon: <Tag className="w-4 h-4" />, tab: 'promotions' },
    { label: 'Write blog post', icon: <PencilRuler className="w-4 h-4" />, tab: 'blog' },
  ];

  return (
    <div className="space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-black text-2xl sm:text-3xl tracking-tight">Enterprise Business Dashboard</h1>
          <p className="text-xs font-bold text-neutral-500 dark:text-[#B5B5B5]">Real MongoDB revenue metrics, inventory depletion, and analytics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={loading}
            className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] font-black text-xs shadow-sm focus:outline-none focus:border-brand-pink cursor-pointer disabled:opacity-60"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] font-black text-xs shadow-sm hover:border-brand-pink transition cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-pink' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {quickActions.map((a) => (
          <button
            key={a.label}
            onClick={() => onNavigate(a.tab)}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#EAEAEA] bg-white px-4 py-2.5 text-xs font-black text-neutral-700 shadow-sm transition hover:border-brand-pink hover:text-brand-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink dark:border-[#292929] dark:bg-[#161616] dark:text-neutral-200"
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>

      {/* Load failure — never render zeros as if the store were empty */}
      {!loading && loadError && (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center rounded-3xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929]" role="alert">
          <AlertTriangle className="w-6 h-6 text-rose-500" />
          <p className="font-black text-sm text-neutral-900 dark:text-white">Unable to load the dashboard</p>
          <p className="text-xs font-bold text-neutral-500">{loadError}</p>
            <button onClick={() => setReloadKey((k) => k + 1)} className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-xs font-bold text-surface transition hover:opacity-90">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Real-time Alerts Banner */}
      {!loadError && (alerts.lowStockCount > 0 || alerts.failedPaymentsCount > 0 || alerts.pendingOrdersCount > 0 || alerts.expiringPromosCount > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(alerts.lowStockCount ?? 0) > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <div className="font-black text-xs text-amber-900 dark:text-amber-300">Low Stock Alert</div>
                <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">{alerts.lowStockCount} products need restocking</div>
              </div>
            </div>
          )}
          {(alerts.pendingOrdersCount ?? 0) > 0 && (
            <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/40 flex items-center gap-3">
              <Clock className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
              <div>
                <div className="font-black text-xs text-sky-900 dark:text-sky-300">Pending Orders</div>
                <div className="text-[11px] font-bold text-sky-700 dark:text-sky-400">{alerts.pendingOrdersCount} orders awaiting action</div>
              </div>
            </div>
          )}
          {(alerts.failedPaymentsCount ?? 0) > 0 && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              <div>
                <div className="font-black text-xs text-rose-900 dark:text-rose-300">Failed Payments</div>
                <div className="text-[11px] font-bold text-rose-700 dark:text-rose-400">{alerts.failedPaymentsCount} transaction attempts failed</div>
              </div>
            </div>
          )}
          {(alerts.expiringPromosCount ?? 0) > 0 && (
            <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/40 flex items-center gap-3">
              <Tag className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
              <div>
                <div className="font-black text-xs text-purple-900 dark:text-purple-300">Expiring Promos</div>
                <div className="text-[11px] font-bold text-purple-700 dark:text-purple-400">{alerts.expiringPromosCount} promotions ending in 48h</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards Grid */}
      {!loadError && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-3xl p-5 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] animate-pulse h-32" />
              ))
            : stats.map((s) => <StatCard key={s.label} {...s} />)}
        </div>
      )}

      {/* Analytics — real series from /api/admin/dashboard, honouring the period selector. */}
      {!loadError && (
        <DashboardCharts
          dailyRevenue={charts.dailyRevenue}
          dailyVouchersSold={charts.dailyVouchersSold}
          dailyNewCustomers={charts.dailyNewCustomers}
          period={period}
          loading={loading}
        />
      )}

      {/* Best-Selling Products & Low Stock Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl p-6 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
          <h3 className="font-black text-lg mb-4 text-neutral-900 dark:text-white">Best-Selling Products</h3>
          <div className="space-y-3">
            {(tables.bestSellers || []).map((p, i) => (
              <div key={p.id || i} className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929]">
                <div>
                  <div className="font-black text-sm text-neutral-900 dark:text-white">{p.name}</div>
                  <div className="text-xs font-bold text-neutral-500">
                    Sold: <span className="text-neutral-900 dark:text-white">{p.unitsSold} units</span> • Available Stock: <span className="text-emerald-600 dark:text-emerald-400">{p.stock}</span>
                  </div>
                </div>
                <div className="text-right font-heading font-black text-base text-brand-pink">{formatPrice(p.revenue)}</div>
              </div>
            ))}
            {!tables.bestSellers?.length && <Empty title="No best sellers yet" />}
          </div>
        </div>

        <div className="rounded-3xl p-6 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-lg text-neutral-900 dark:text-white">Low Stock Inventory Alerts</h3>
            {/* Each product's own lowStockThreshold decides inclusion — not a global 10. */}
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">At or below each product&apos;s threshold</span>
          </div>
          <div className="space-y-3">
            {(tables.lowStockProducts || []).map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40">
                <div>
                  <div className="font-black text-sm text-neutral-900 dark:text-white">{p.name}</div>
                  <div className="text-xs font-bold text-neutral-500">Brand: {p.brand}</div>
                </div>
                <div className="text-right">
                  <span className="inline-flex px-3 py-1 rounded-full bg-rose-500 text-white font-black text-xs">{p.availableStock} Left</span>
                </div>
              </div>
            ))}
            {!tables.lowStockProducts?.length && <div className="py-8 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ All products have sufficient voucher inventory.</div>}
          </div>
        </div>
      </div>

      {/* CSV Reports Export Panel */}
      <div className="rounded-3xl p-6 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="font-black text-lg text-neutral-900 dark:text-white">Export Business Reports (CSV)</h3>
            <p className="text-xs font-bold text-neutral-500 dark:text-[#B5B5B5]">Download sanitized e-commerce reports for auditing and accounting.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-neutral-600 dark:text-neutral-300">
            <input type="checkbox" checked={unmaskedExport} onChange={(e) => setUnmaskedExport(e.target.checked)} className="accent-brand-pink" />
            <span>Allow Unmasked Voucher Export</span>
          </label>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Orders CSV', resource: 'orders', tint: '#FF005C' },
            { label: 'Customers CSV', resource: 'customers', tint: '#6C3CE0' },
            { label: 'Vouchers CSV', resource: 'vouchers', tint: '#10B981', unmasked: unmaskedExport },
            { label: 'Sales Summary CSV', resource: 'sales', tint: '#0EA5E9' },
            { label: 'Fulfillments CSV', resource: 'fulfillments', tint: '#8B5CF6' },
          ].map((b) => (
            <button
              key={b.resource}
              onClick={async () => {
                // Report the outcome — a failed export previously did nothing
                // at all, indistinguishable from a slow download.
                const res = await adminApi.downloadExport(b.resource, !!b.unmasked);
                if (!res.success) notify.error(res.message || `Could not export ${b.label}.`);
              }}
              className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] hover:border-brand-pink text-left font-black text-xs flex items-center justify-between transition"
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" style={{ color: b.tint }} />
                <span>{b.label}</span>
              </div>
              <Download className="w-4 h-4 text-neutral-400" />
            </button>
          ))}
        </div>
      </div>

      {/* Recent Orders List */}
      <div className="rounded-3xl p-6 bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm">
        <h3 className="font-black text-lg mb-4 text-neutral-900 dark:text-white">Recent Orders</h3>
        <div className="space-y-2.5">
          {(tables.recentOrders || []).map((o) => {
            const ord = o as { _id: string; orderNo?: string; total?: number; orderStatus?: string; paymentStatus?: string; createdAt?: string; userId?: { name?: string; email?: string } | null };
            return (
              <div key={ord._id} className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FFF0F5] dark:bg-[#2A0A17] border border-brand-pink/20 flex items-center justify-center font-black text-brand-pink text-[10px]">
                    {(ord.orderNo || 'ORD').slice(0, 3).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-black text-sm text-neutral-900 dark:text-white">#{ord.orderNo}</div>
                    <div className="text-[11px] font-bold text-neutral-400">{ord.userId?.name || 'Guest'} · {ord.userId?.email || ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-neutral-500">{ord.paymentStatus || '—'} / {ord.orderStatus || '—'}</span>
                  <span className="font-heading font-black text-brand-pink">{formatPrice(ord.total)}</span>
                </div>
              </div>
            );
          })}
          {!tables.recentOrders?.length && <Empty title="No recent orders" />}
        </div>
      </div>
    </div>
  );
}
