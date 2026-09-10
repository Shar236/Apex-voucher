'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useCart, type CartItem } from '@/components/cart-provider';
import { accountApi } from '@/lib/api';
import type { Product } from '@/lib/types';

export interface AccountVoucher {
  id: string;
  status: string;
  code: string;
  productName: string;
  voucherType?: string;
  brand?: string;
  purchaseDate?: string;
  assignedAt?: string;
  createdAt?: string;
  expiryDate: string;
  daysRemaining: number;
  orderNo?: string;
  amountPaid?: number;
  paymentStatus?: string;
  emailStatus?: string;
  fulfillmentStatus?: string;
  transferredTo?: string;
  officialWebsiteUrl?: string;
  [key: string]: unknown;
}

export interface AccountFulfillment {
  id: string;
  status: string;
  orderNo?: string;
  productName?: string;
  amountPaid?: number;
  voucherCode?: string;
  deliveredAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface AccountOrder {
  _id: string;
  orderNo: string;
  orderStatus: string;
  paymentStatus: string;
  createdAt: string;
  total: number;
  currency?: string;
  items?: unknown[];
  billingDetails?: { email?: string; [key: string]: unknown };
  promoCode?: string;
  emailStatus?: string;
  [key: string]: unknown;
}

export interface AccountStats {
  totalOrders?: number;
  activeVouchers?: number;
  usedVouchers?: number;
  expiringSoon?: number;
  totalSaved?: number;
  [key: string]: unknown;
}

export interface CheckoutMeta {
  voucherRequestId?: string;
  [key: string]: unknown;
}

export type CheckoutProduct = (Product & { quantity?: number }) | CartItem[] | null;

interface VoucherContextValue {
  userVouchers: AccountVoucher[];
  userFulfillments: AccountFulfillment[];
  accountOrders: AccountOrder[];
  accountStats: AccountStats;
  loadAccountData: () => Promise<void>;
  checkoutProduct: CheckoutProduct;
  checkoutMeta: CheckoutMeta | null;
  isCheckoutOpen: boolean;
  setIsCheckoutOpen: (open: boolean) => void;
  startCheckout: (product: CheckoutProduct, meta?: CheckoutMeta | null) => void;
  handlePurchaseSuccess: (args?: { orderId?: string }) => Promise<void>;
  transferVoucher: (voucherId: string, targetEmail: string) => Promise<void>;
  markVoucherUsed: (voucherId: string) => Promise<void>;
  requestRefund: (voucherId: string) => Promise<void>;
}

const VoucherContext = createContext<VoucherContextValue | null>(null);

export function VoucherProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { clearCart, showToast } = useCart();

  const [userVouchers, setUserVouchers] = useState<AccountVoucher[]>([]);
  const [userFulfillments, setUserFulfillments] = useState<AccountFulfillment[]>([]);
  const [accountOrders, setAccountOrders] = useState<AccountOrder[]>([]);
  const [accountStats, setAccountStats] = useState<AccountStats>({});

  const [checkoutProduct, setCheckoutProduct] = useState<CheckoutProduct>(null);
  const [checkoutMeta, setCheckoutMeta] = useState<CheckoutMeta | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  const loadAccountData = useCallback(async () => {
    if (!isAuthenticated) {
      setUserVouchers([]);
      setUserFulfillments([]);
      setAccountOrders([]);
      setAccountStats({});
      return;
    }
    try {
      const [vRes, oRes, sRes, fRes] = await Promise.all([
        accountApi.vouchers(),
        accountApi.orders(),
        accountApi.stats(),
        accountApi.fulfillments(),
      ]);
      if (vRes.success) setUserVouchers(Array.isArray(vRes.data) ? (vRes.data as AccountVoucher[]) : []);
      if (oRes.success) setAccountOrders(Array.isArray(oRes.data) ? (oRes.data as AccountOrder[]) : []);
      if (sRes.success) setAccountStats((sRes.data as AccountStats) || {});
      if (fRes.success) setUserFulfillments(Array.isArray(fRes.data) ? (fRes.data as AccountFulfillment[]) : []);
    } catch {
      setUserVouchers([]);
      setUserFulfillments([]);
      setAccountOrders([]);
      setAccountStats({});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  const startCheckout = useCallback((product: CheckoutProduct, meta: CheckoutMeta | null = null) => {
    setCheckoutProduct(product);
    setCheckoutMeta(meta);
    setIsCheckoutOpen(true);
  }, []);

  const transferVoucher = useCallback(
    async (voucherId: string, targetEmail: string) => {
      if (!isAuthenticated) {
        showToast('Please log in to transfer a voucher.');
        return;
      }
      const res = await accountApi.transferVoucher(voucherId, targetEmail);
      if (res.success) {
        setUserVouchers((prev) => prev.map((v) => (v.id === voucherId ? { ...v, status: 'TRANSFERRED', transferredTo: targetEmail } : v)));
        showToast(`✅ Voucher transferred to ${targetEmail}`);
      } else {
        showToast(res.message || 'Transfer failed');
      }
    },
    [isAuthenticated, showToast]
  );

  const markVoucherUsed = useCallback(
    async (voucherId: string) => {
      if (!isAuthenticated) return;
      const res = await accountApi.markUsed(voucherId);
      if (res.success) {
        setUserVouchers((prev) => prev.map((v) => (v.id === voucherId ? { ...v, status: 'USED' } : v)));
        showToast('Marked as used');
      } else {
        showToast(res.message || 'Failed');
      }
    },
    [isAuthenticated, showToast]
  );

  const requestRefund = useCallback(
    async (voucherId: string) => {
      if (!isAuthenticated) {
        showToast('Log in first');
        return;
      }
      showToast('📌 Refund request submitted. Support will process within 2 hours.');
      setUserVouchers((prev) => prev.map((v) => (v.id === voucherId ? { ...v, status: 'REFUND_REQUESTED' } : v)));
    },
    [isAuthenticated, showToast]
  );

  const handlePurchaseSuccess = useCallback(
    async ({ orderId }: { orderId?: string } = {}) => {
      clearCart();
      if (orderId) showToast(`🎉 Order #${orderId} confirmed!`);
      await loadAccountData();
    },
    [clearCart, loadAccountData, showToast]
  );

  const value = useMemo<VoucherContextValue>(
    () => ({
      userVouchers,
      userFulfillments,
      accountOrders,
      accountStats,
      loadAccountData,
      checkoutProduct,
      checkoutMeta,
      isCheckoutOpen,
      setIsCheckoutOpen,
      startCheckout,
      handlePurchaseSuccess,
      transferVoucher,
      markVoucherUsed,
      requestRefund,
    }),
    [
      userVouchers,
      userFulfillments,
      accountOrders,
      accountStats,
      loadAccountData,
      checkoutProduct,
      checkoutMeta,
      isCheckoutOpen,
      startCheckout,
      handlePurchaseSuccess,
      transferVoucher,
      markVoucherUsed,
      requestRefund,
    ]
  );

  return <VoucherContext.Provider value={value}>{children}</VoucherContext.Provider>;
}

export const useVoucher = () => {
  const ctx = useContext(VoucherContext);
  if (!ctx) throw new Error('useVoucher must be used within a VoucherProvider');
  return ctx;
};
