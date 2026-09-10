import { siteConfig } from './config';
import { formatMoney } from './money';

const TOKEN_KEY = 'apex.token';
const USER_KEY = 'apex.user';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  status?: number;
  [key: string]: unknown;
}

export const apiBase = () => {
  if (typeof window !== 'undefined') {
    const configured = siteConfig.apiUrl;
    if (
      configured &&
      configured.includes('localhost') &&
      window.location.hostname &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      return configured.replace('localhost', window.location.hostname);
    }
    return configured;
  }
  return siteConfig.apiUrl;
};

const storage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
};

export const getToken = (): string | null => {
  try {
    return storage()?.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

export const setToken = (t: string | null) => {
  try {
    if (t) storage()?.setItem(TOKEN_KEY, t);
    else storage()?.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable — auth still works for this page load via in-memory state
  }
};

export const getStoredUser = <T = unknown>(): T | null => {
  try {
    const raw = storage()?.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const setStoredUser = (u: unknown) => {
  try {
    if (u) storage()?.setItem(USER_KEY, JSON.stringify(u));
    else storage()?.removeItem(USER_KEY);
  } catch {
    // storage unavailable
  }
};

export const clearAuth = () => {
  try {
    storage()?.removeItem(TOKEN_KEY);
    storage()?.removeItem(USER_KEY);
  } catch {
    // storage unavailable
  }
};

const parseJSON = async (resp: Response): Promise<Record<string, unknown>> => {
  const text = await resp.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, message: text || 'Invalid server response' };
  }
};

/**
 * The single HTTP client for the whole app — usable from both Server
 * Components (public, unauthenticated reads; no `window`/localStorage there,
 * guarded above) and Client Components (authenticated requests via the
 * bearer token). Mirrors the response contract the Express API already uses:
 * { success, data, message, code }.
 */
export const request = async <T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  const fullUrl = url.startsWith('http') ? url : `${apiBase()}${url}`;
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let resp: Response;
  try {
    resp = await fetch(fullUrl, { ...options, headers });
  } catch (err) {
    // If direct request failed (e.g. CORS block, device hostname mismatch),
    // and we are in the browser with a relative route, fall back to same-origin Next.js rewrite
    if (typeof window !== 'undefined' && fullUrl.startsWith('http') && url.startsWith('/')) {
      try {
        resp = await fetch(url, { ...options, headers });
      } catch {
        return {
          success: false,
          message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
          code: 'NETWORK',
        };
      }
    } else {
      return {
        success: false,
        message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        code: 'NETWORK',
      };
    }
  }

  const data = await parseJSON(resp);
  if (!resp.ok || data.success === false) {
    return {
      success: false,
      message: (data?.message as string) || `Request failed (${resp.status})`,
      code: (data?.code as string) || String(resp.status),
      status: resp.status,
      data: data as T,
    };
  }
  return { success: true, data: (data?.data ?? data) as T, ...data };
};

export const authApi = {
  register: (data: unknown) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  verifyRegistrationOtp: (email: string, otp: string) =>
    request('/api/auth/register/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) }),
  resendRegistrationOtp: (email: string) =>
    request('/api/auth/register/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  login: (data: unknown) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: (email: string) =>
    request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  me: () => request('/api/auth/me'),
};

export const productApi = {
  list: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/products${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => request(`/api/products/${id}`),
  // Server Components bootstrap the storefront via getWebsiteConfig() in
  // lib/website-config.ts (which also carries hero/footer/announcement CMS
  // state) — productApi had thin duplicates of those reads here.
};

export const contactApi = {
  submit: (data: unknown) => request('/api/contact', { method: 'POST', body: JSON.stringify(data) }),
};

export const accountApi = {
  me: () => request('/api/account'),
  updateProfile: (data: unknown) => request('/api/account/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  uploadAvatar: async (file: File): Promise<ApiResponse> => {
    const formData = new FormData();
    formData.append('avatar', file);
    const token = getToken();
    try {
      const resp = await fetch(`${apiBase()}/api/account/profile/avatar`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok || data.success === false) {
        return { success: false, message: data?.message || `Upload failed (${resp.status})` };
      }
      return { success: true, ...data };
    } catch (err) {
      return { success: false, message: `Network error: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
  removeAvatar: () => request('/api/account/profile/avatar', { method: 'DELETE' }),
  sendEmailOtp: (newEmail: string) =>
    request('/api/account/email/send-otp', { method: 'POST', body: JSON.stringify({ newEmail }) }),
  verifyEmailOtp: (otp: string) =>
    request('/api/account/email/verify-otp', { method: 'POST', body: JSON.stringify({ otp }) }),
  updatePhone: (phone: string, phoneCountry: string, currentPassword: string) =>
    request('/api/account/phone', {
      method: 'PATCH',
      body: JSON.stringify({ phone, phoneCountry, currentPassword }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request('/api/account/password/change', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  logout: () => request('/api/account/logout', { method: 'POST' }),
  stats: () => request('/api/account/stats'),
  orders: () => request('/api/account/orders'),
  vouchers: () => request('/api/account/vouchers'),
  fulfillments: () => request('/api/account/fulfillments'),
  transferVoucher: (id: string, targetEmail: string) =>
    request(`/api/account/vouchers/${id}/transfer`, { method: 'PATCH', body: JSON.stringify({ targetEmail }) }),
  markUsed: (id: string) => request(`/api/account/vouchers/${id}/used`, { method: 'PATCH' }),
  validatePromo: (payload: unknown) =>
    request('/api/account/validate-promo', { method: 'POST', body: JSON.stringify(payload) }),
};

// Orders are created only through paymentApi.createOrder (which also creates the
// matching Razorpay order) — /api/orders is read-only.
export const orderApi = {
  get: (id: string) => request(`/api/orders/${id}`),
};

export const paymentApi = {
  // Publishable Razorpay config for the browser (key id only — no secret).
  getConfig: () => request('/api/payments/config'),
  // Create the internal order + a Razorpay order for the server-calculated total.
  createOrder: (payload: unknown) => request('/api/payments/order', { method: 'POST', body: JSON.stringify(payload) }),
  // Verify the Razorpay Checkout result on the server (signature + gateway re-check).
  verify: (payload: unknown) => request('/api/payments/verify', { method: 'POST', body: JSON.stringify(payload) }),
  // Self-heal: ask the server to check the gateway for a captured payment and
  // fulfil the order (used when the Checkout callback never fired). Idempotent.
  reconcile: (orderId: string) => request(`/api/payments/reconcile/${orderId}`, { method: 'POST' }),
  // Server truth about an order (also opportunistically self-heals a PENDING order).
  getStatus: (orderId: string) => request(`/api/payments/order/${orderId}`),
};

export const seoApi = {
  overview: () => request('/api/seo/overview'),
  updateProductSEO: (id: string, data: unknown) =>
    request(`/api/seo/products/${id}/seo`, { method: 'PATCH', body: JSON.stringify(data) }),
  pages: () => request('/api/seo/pages'),
  getPage: (pageKey: string) => request(`/api/seo/pages/${pageKey}`),
  updatePage: (pageKey: string, data: unknown) =>
    request(`/api/seo/pages/${pageKey}`, { method: 'PATCH', body: JSON.stringify(data) }),
  redirects: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/seo/redirects${qs ? `?${qs}` : ''}`);
  },
  createRedirect: (data: unknown) => request('/api/seo/redirects', { method: 'POST', body: JSON.stringify(data) }),
  updateRedirect: (id: string, data: unknown) =>
    request(`/api/seo/redirects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRedirect: (id: string) => request(`/api/seo/redirects/${id}`, { method: 'DELETE' }),
  globalSettings: () => request('/api/seo/global-settings'),
  updateGlobalSettings: (data: unknown) =>
    request('/api/seo/global-settings', { method: 'PATCH', body: JSON.stringify(data) }),
};

// Blog HTTP layers: public reads in lib/blog-api.ts, admin writes in lib/admin-blog-api.ts.

export const adminApi = {
  dashboard: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/dashboard${qs ? `?${qs}` : ''}`);
  },
  users: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/users${qs ? `?${qs}` : ''}`);
  },
  setUserStatus: (id: string, status: string) =>
    request(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  products: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/products${qs ? `?${qs}` : ''}`);
  },
  getProduct: (id: string) => request(`/api/admin/products/${id}`),
  createProduct: (data: unknown) => request('/api/admin/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: unknown) =>
    request(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  quickUpdatePrice: (id: string, payload: unknown) =>
    request(`/api/admin/products/${id}/price`, { method: 'PATCH', body: JSON.stringify(payload) }),
  quickUpdateStatus: (id: string, active: boolean) =>
    request(`/api/admin/products/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  quickUpdateFeatured: (id: string, featured: boolean) =>
    request(`/api/admin/products/${id}/featured`, { method: 'PATCH', body: JSON.stringify({ featured }) }),
  deleteProduct: (id: string) => request(`/api/admin/products/${id}`, { method: 'DELETE' }),
  duplicateProduct: (id: string) => request(`/api/admin/products/${id}/duplicate`, { method: 'POST' }),
  archiveProduct: (id: string) => request(`/api/admin/products/${id}/archive`, { method: 'PATCH' }),
  restoreProduct: (id: string) => request(`/api/admin/products/${id}/restore`, { method: 'PATCH' }),
  reorderProducts: (items: unknown) =>
    request('/api/admin/products/reorder', { method: 'PATCH', body: JSON.stringify({ items }) }),
  revalidatePublicProducts: async (slugs: string[] = []) => {
    const token = getToken();
    try {
      await fetch('/api/revalidate/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ slugs }),
      });
    } catch {
      /* non-fatal — Next.js ISR window refreshes public pages */
    }
  },
  getProductInventory: (id: string) => request(`/api/admin/products/${id}/inventory`),
  uploadProductLogo: async (file: File): Promise<ApiResponse> => {
    const formData = new FormData();
    formData.append('logo', file);
    const token = getToken();
    const resp = await fetch(`${apiBase()}/api/admin/products/logo-upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.success === false) {
      return { success: false, message: data?.message || `Upload failed (${resp.status})` };
    }
    return { success: true, ...data };
  },
  uploadProductImage: async (file: File): Promise<ApiResponse> => {
    const formData = new FormData();
    formData.append('image', file);
    const token = getToken();
    const resp = await fetch(`${apiBase()}/api/admin/products/image-upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.success === false) {
      return { success: false, message: data?.message || `Upload failed (${resp.status})` };
    }
    return { success: true, ...data };
  },
  uploadProductScreenshot: async (file: File): Promise<ApiResponse> => {
    const formData = new FormData();
    formData.append('image', file);
    const token = getToken();
    const resp = await fetch(`${apiBase()}/api/admin/products/screenshot-upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.success === false) {
      return { success: false, message: data?.message || `Upload failed (${resp.status})` };
    }
    return { success: true, ...data };
  },
  vouchers: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/vouchers${qs ? `?${qs}` : ''}`);
  },
  voucherSummaryByProduct: () => request('/api/admin/vouchers/summary-by-product'),
  revealVoucherCode: (id: string) => request(`/api/admin/vouchers/${id}/reveal`),
  notifications: () => request('/api/admin/notifications'),
  addVouchers: (payload: unknown) => request('/api/admin/vouchers', { method: 'POST', body: JSON.stringify(payload) }),
  addVouchersBulk: (payload: unknown) =>
    request('/api/admin/vouchers/bulk', { method: 'POST', body: JSON.stringify(payload) }),
  // Note: there is deliberately no updateVoucher wrapper — the admin UI edits
  // voucher status/expiry only, via setVoucherStatus, and the backend
  // mass-assignment guard forbids rewriting code/userId/orderId anyway.
  deleteVoucher: (id: string) => request(`/api/admin/vouchers/${id}`, { method: 'DELETE' }),
  // Asks the server what a delete would actually do before showing the confirm
  // dialog — delivered codes are always kept, so the count in the dialog is real.
  previewVoucherDelete: (ids: string[]) =>
    request('/api/admin/vouchers/delete-preview', { method: 'POST', body: JSON.stringify({ ids }) }),
  bulkDeleteVouchers: (ids: string[]) =>
    request('/api/admin/vouchers/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  setVoucherStatus: (ids: string[], status: string) =>
    request('/api/admin/vouchers/status', { method: 'PATCH', body: JSON.stringify({ ids, status }) }),
  orders: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/orders${qs ? `?${qs}` : ''}`);
  },
  order: (id: string) => request(`/api/admin/orders/${id}`),
  updateOrderStatus: (id: string, payload: unknown) =>
    request(`/api/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
  resendOrderEmail: (id: string) => request(`/api/admin/orders/${id}/resend-email`, { method: 'POST' }),
  promotions: () => request('/api/admin/promotions'),
  createPromotion: (data: unknown) => request('/api/admin/promotions', { method: 'POST', body: JSON.stringify(data) }),
  updatePromotion: (id: string, data: unknown) =>
    request(`/api/admin/promotions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePromotion: (id: string) => request(`/api/admin/promotions/${id}`, { method: 'DELETE' }),
  campaigns: () => request('/api/admin/campaigns'),
  createCampaign: (data: unknown) => request('/api/admin/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  updateCampaign: (id: string, data: unknown) =>
    request(`/api/admin/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCampaign: (id: string) => request(`/api/admin/campaigns/${id}`, { method: 'DELETE' }),
  toggleCampaign: (id: string) => request(`/api/admin/campaigns/${id}/toggle`, { method: 'POST' }),
  getWebsiteSettings: () => request('/api/admin/website-settings'),
  updateWebsiteSettings: (data: unknown) =>
    request('/api/admin/website-settings', { method: 'PATCH', body: JSON.stringify(data) }),
  auditLogs: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/audit-logs${qs ? `?${qs}` : ''}`);
  },
  downloadExport: async (
    resource: string,
    unmasked = false,
    params: Record<string, string> = {}
  ): Promise<ApiResponse> => {
    const token = getToken();
    const queryParams: Record<string, string> = { ...params };
    if (unmasked) queryParams.unmasked = 'true';
    const qs = new URLSearchParams(queryParams).toString();
    const url = `${apiBase()}/api/admin/export/${resource}${qs ? `?${qs}` : ''}`;
    const resp = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (!resp.ok) return { success: false, message: 'Export failed' };
    const text = await resp.text();
    const blob = new Blob([text], { type: 'text/csv' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `apex_${resource}_export.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
    return { success: true };
  },
  // Reels and videos are one resource served by /api/admin/reels. The parallel
  // `*Video` wrappers that duplicated every call below had no callers and were
  // removed; use the `*Reel` names.
  reels: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/reels${qs ? `?${qs}` : ''}`);
  },
  createReel: (data: unknown) => request('/api/admin/reels', { method: 'POST', body: JSON.stringify(data) }),
  updateReel: (id: string, data: unknown) =>
    request(`/api/admin/reels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  quickToggleFeaturedReel: (id: string, featured: boolean) =>
    request(`/api/admin/reels/${id}/featured`, { method: 'PATCH', body: JSON.stringify({ featured }) }),
  quickTogglePublishReel: (id: string, published: boolean) =>
    request(`/api/admin/reels/${id}/publish`, { method: 'PATCH', body: JSON.stringify({ published }) }),
  bulkReorderReels: (items: unknown) =>
    request('/api/admin/reels/reorder', { method: 'PATCH', body: JSON.stringify({ items }) }),
  deleteReel: (id: string) => request(`/api/admin/reels/${id}`, { method: 'DELETE' }),
  updateReelSettings: (data: unknown) => request('/api/admin/reels/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  uploadMedia: async (formData: FormData) => {
    const token = getToken();
    const resp = await fetch(`${apiBase()}/api/admin/reels/upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    return resp.json();
  },
  awards: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/awards${qs ? `?${qs}` : ''}`);
  },
  createAward: (data: unknown) => request('/api/admin/awards', { method: 'POST', body: JSON.stringify(data) }),
  updateAward: (id: string, data: unknown) =>
    request(`/api/admin/awards/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  quickToggleFeaturedAward: (id: string, featured: boolean) =>
    request(`/api/admin/awards/${id}/featured`, { method: 'PATCH', body: JSON.stringify({ featured }) }),
  quickToggleStatusAward: (id: string, status: string) =>
    request(`/api/admin/awards/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  bulkReorderAwards: (items: unknown) =>
    request('/api/admin/awards/reorder', { method: 'PATCH', body: JSON.stringify({ items }) }),
  deleteAward: (id: string) => request(`/api/admin/awards/${id}`, { method: 'DELETE' }),
  uploadAwardMedia: async (formData: FormData) => {
    const token = getToken();
    const resp = await fetch(`${apiBase()}/api/admin/awards/upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    return resp.json();
  },
  seo: seoApi,
  // Admin blog HTTP layer lives in lib/admin-blog-api.ts.
  pteBookings: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/pte-bookings${qs ? `?${qs}` : ''}`);
  },
  updatePTEBooking: (id: string, data: unknown) =>
    request(`/api/admin/pte-bookings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  voucherRequests: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/voucher-requests${qs ? `?${qs}` : ''}`);
  },
  updateVoucherRequest: (id: string, data: unknown) =>
    request(`/api/admin/voucher-requests/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  fulfillments: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/fulfillments${qs ? `?${qs}` : ''}`);
  },
  deliverFulfillment: (id: string, code: string) =>
    request(`/api/admin/fulfillments/${id}/deliver`, { method: 'POST', body: JSON.stringify({ code }) }),
  cancelFulfillment: (id: string, reason = '') =>
    request(`/api/admin/fulfillments/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
};

export const pteBookingApi = {
  submit: (payload: unknown) => request('/api/pte-booking-requests', { method: 'POST', body: JSON.stringify(payload) }),
  mine: () => request('/api/pte-bookings/mine'),
};

export const videoApi = {
  // Public carousel reads go through lib/video-api.ts (revalidate-cached);
  // only the view counter is posted live from the client.
  incrementView: (id: string) => request(`/api/reels/${id}/view`, { method: 'POST' }),
};

export const awardApi = {
  list: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/awards${qs ? `?${qs}` : ''}`);
  },
};

/**
 * Currency formatting is centralized in lib/currency.tsx (formatMoney).
 * This alias keeps existing import sites working. IMPORTANT: the amount must
 * already be in the given currency — conversion to USD happens ONLY on the
 * backend from the live USD/INR rate; the browser never converts.
 */
export const formatPrice = (amount: number | null | undefined, currency: 'INR' | 'USD' = 'INR'): string => {
  if (amount == null) return '—';
  return formatMoney(amount, currency);
};
