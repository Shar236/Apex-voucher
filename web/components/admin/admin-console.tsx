'use client';

import { useState } from 'react';
import {
  ArrowLeft, LayoutDashboard, Package, Ticket, Users, ShoppingCart, Tag, Clock, CalendarCheck, Search as SearchIcon, Crown, Film, Megaphone, PencilRuler, History,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { ApexLogo } from '@/components/apex-logo';
import { AdminGuard } from '@/components/admin/admin-guard';
import { ConfirmProvider } from '@/components/ui/use-confirm';
import { AdminNav, AdminNavDrawer, AdminHeader, type NavGroup } from '@/components/admin/admin-shell';
import { Dashboard } from '@/components/admin/dashboard';
import { OrdersAdmin } from '@/components/admin/orders';
import { ProductsAdmin } from '@/components/admin/products';
import { VouchersAdmin } from '@/components/admin/vouchers';
import { UsersAdmin } from '@/components/admin/users';
import { FulfillmentsAdmin } from '@/components/admin/fulfillments';
import { VoucherRequestsAdmin } from '@/components/admin/voucher-requests';
import { PTEBookingsAdmin } from '@/components/admin/pte-bookings';
import { PromotionsAdmin } from '@/components/admin/promotions';
import { AuditLogsAdmin } from '@/components/admin/audit-logs';
import { NotificationsDrawer, useAdminNotifications, type AdminNotificationCounts } from '@/components/admin/notifications';
import { SEOManager } from '@/components/admin/seo-manager';
import { VideosAdmin } from '@/components/admin/videos-admin';
import { AwardsAdmin } from '@/components/admin/awards-admin';
import { WebsiteCMSAdmin } from '@/components/admin/website-cms-admin';
import { BlogAdmin } from '@/components/admin/blog-admin';

/**
 * Sidebar navigation, grouped so the daily-work sections (sales & fulfillment)
 * are not buried in a flat list of fifteen items. `badge` names the key in the
 * live /api/admin/notifications counts payload — never a hardcoded number.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ id: 'dashboard', label: 'Overview & Analytics', icon: <LayoutDashboard className="w-4 h-4" /> }],
  },
  {
    label: 'Catalog',
    items: [
      { id: 'products', label: 'Products & Pricing', icon: <Package className="w-4 h-4" /> },
      { id: 'vouchers', label: 'Voucher Inventory', icon: <Ticket className="w-4 h-4" />, badge: 'stockAlerts' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { id: 'orders', label: 'Orders', icon: <ShoppingCart className="w-4 h-4" /> },
      { id: 'voucher-requests', label: 'Voucher Requests', icon: <Ticket className="w-4 h-4" />, badge: 'voucherRequests' },
      { id: 'fulfillments', label: 'Fulfillment Requests', icon: <Clock className="w-4 h-4" />, badge: 'pendingFulfillments' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { id: 'users', label: 'Customers', icon: <Users className="w-4 h-4" /> },
      { id: 'pte-bookings', label: 'PTE Booking Requests', icon: <CalendarCheck className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Marketing',
    items: [{ id: 'promotions', label: 'Promo Coupons', icon: <Tag className="w-4 h-4" /> }],
  },
  {
    label: 'Content',
    items: [
      { id: 'blog', label: 'Blog Management', icon: <PencilRuler className="w-4 h-4" /> },
      { id: 'seo', label: 'SEO Manager', icon: <SearchIcon className="w-4 h-4" /> },
      { id: 'videos', label: 'Videos & Reels', icon: <Film className="w-4 h-4" /> },
      { id: 'awards-admin', label: 'Awards', icon: <Crown className="w-4 h-4" /> },
      { id: 'cms', label: 'Website CMS', icon: <Megaphone className="w-4 h-4" /> },
    ],
  },
  {
    label: 'System',
    items: [{ id: 'audit-logs', label: 'Audit Logs', icon: <History className="w-4 h-4" /> }],
  },
];

export function AdminConsole() {
  const [tab, setTab] = useState('dashboard');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { user, logout } = useAuth();
  const { notificationsData, notifLoading, notifError, loadNotifications } = useAdminNotifications();

  const counts: AdminNotificationCounts = notificationsData?.counts || {};
  const criticalCount = counts.critical || 0;
  const salesCount = counts.sales || 0;

  return (
    <AdminGuard>
      <ConfirmProvider>
        <div className="min-h-screen bg-[#F3EEFF]/30 dark:bg-[#06070B] text-neutral-900 dark:text-white flex flex-col lg:flex-row transition-colors duration-300">
          {/* Desktop rail. On mobile the same nav renders inside a drawer. */}
          <aside className="hidden lg:flex lg:w-72 lg:min-h-screen lg:sticky lg:top-0 shrink-0 flex-col bg-white dark:bg-[#101010] border-r border-[#EAEAEA] dark:border-[#222] p-5">
            <div className="mb-8">
              <ApexLogo className="h-7" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <AdminNav
                groups={NAV_GROUPS}
                tab={tab}
                counts={counts}
                onSelect={setTab}
                user={user}
                onLogout={logout}
              />
            </div>
          </aside>

          <AdminNavDrawer
            open={navOpen}
            onOpenChange={setNavOpen}
            groups={NAV_GROUPS}
            tab={tab}
            counts={counts}
            onSelect={(id) => { setTab(id); setNavOpen(false); }}
            user={user}
            onLogout={logout}
          />

          <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 max-w-350 mx-auto w-full relative">
            <AdminHeader
              groups={NAV_GROUPS}
              tab={tab}
              criticalCount={criticalCount}
              salesCount={salesCount}
              onOpenNav={() => setNavOpen(true)}
              onOpenNotifications={() => { setNotificationsOpen(true); loadNotifications(); }}
              onSelectTab={setTab}
              user={user}
              onLogout={logout}
            />

            <NotificationsDrawer
              open={notificationsOpen}
              onClose={() => setNotificationsOpen(false)}
              data={notificationsData}
              loading={notifLoading}
              error={notifError}
              onRefresh={loadNotifications}
              onNavigate={setTab}
            />

            {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
            {tab === 'products' && <ProductsAdmin />}
            {tab === 'vouchers' && <VouchersAdmin />}
            {tab === 'orders' && <OrdersAdmin />}
            {tab === 'voucher-requests' && <VoucherRequestsAdmin />}
            {tab === 'fulfillments' && <FulfillmentsAdmin />}
            {tab === 'pte-bookings' && <PTEBookingsAdmin />}
            {tab === 'users' && <UsersAdmin />}
            {tab === 'promotions' && <PromotionsAdmin />}
            {tab === 'blog' && <BlogAdmin />}
            {tab === 'seo' && <SEOManager />}
            {tab === 'videos' && <VideosAdmin />}
            {tab === 'awards-admin' && <AwardsAdmin />}
            {tab === 'cms' && <WebsiteCMSAdmin />}
            {tab === 'audit-logs' && <AuditLogsAdmin />}
          </main>
        </div>
      </ConfirmProvider>
    </AdminGuard>
  );
}
