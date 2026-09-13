import { apiBase, getToken, request } from './api';
import type {
  AdminPTEBookingConfig,
  AdminPTEBookingProduct,
  PTEBookingCatalog,
  PTEBookingPageContent,
} from './types';

/**
 * PTE Exam Booking catalog — public read for Server Components + the admin
 * write layer. The storefront section renders from the published catalog;
 * drafts are never served publicly.
 */

const isDev = process.env.NODE_ENV === 'development';

/** Server Component fetch (ISR-cached; revalidated by the admin after saves). */
export async function getPTEBookingCatalog(): Promise<PTEBookingCatalog> {
  try {
    const res = await fetch(`${apiBase()}/api/pte-booking-catalog`, {
      next: { revalidate: isDev ? 0 : 120, tags: ['pte-booking-catalog'] },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as PTEBookingCatalog;
  } catch {
    return { success: false, products: [], page: {} };
  }
}

export const pteBookingAdminApi = {
  list: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/pte-booking-products${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => request(`/api/admin/pte-booking-products/${id}`),
  create: (data: unknown) =>
    request('/api/admin/pte-booking-products', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    request(`/api/admin/pte-booking-products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    request(`/api/admin/pte-booking-products/${id}`, { method: 'DELETE' }),
  reorder: (items: Array<{ _id: string; displayOrder?: number }>) =>
    request('/api/admin/pte-booking-products/reorder', { method: 'PATCH', body: JSON.stringify({ items }) }),
  publish: (id: string) =>
    request(`/api/admin/pte-booking-products/${id}/publish`, { method: 'PATCH' }),
  unpublish: (id: string) =>
    request(`/api/admin/pte-booking-products/${id}/unpublish`, { method: 'PATCH' }),
  removeImage: (id: string) =>
    request(`/api/admin/pte-booking-products/${id}/image`, { method: 'PATCH' }),
  getConfig: () => request('/api/admin/pte-booking/config'),
  updateConfig: (payload: { content: PTEBookingPageContent; status: 'draft' | 'published' }) =>
    request('/api/admin/pte-booking/config', { method: 'PUT', body: JSON.stringify(payload) }),
  uploadImage: async (file: File): Promise<{ success: boolean; url?: string; publicId?: string; width?: number; height?: number; message?: string }> => {
    const formData = new FormData();
    formData.append('image', file);
    const token = getToken();
    try {
      const resp = await fetch(`${apiBase()}/api/admin/pte-booking-products/image-upload`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.success === false) {
        return { success: false, message: data?.message || `Upload failed (${resp.status})` };
      }
      return { success: true, url: String(data.url || ''), publicId: String(data.publicId || ''), width: Number(data.width) || undefined, height: Number(data.height) || undefined };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Upload failed' };
    }
  },
};

export type { AdminPTEBookingConfig, AdminPTEBookingProduct };