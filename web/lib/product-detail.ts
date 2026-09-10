import { apiBase } from './api';
import { getSessionCurrency, currencyDisplayHeaders } from './currency-server';
import type { Product } from './types';

export interface ProductDetailResponse {
  success: boolean;
  data: Product;
  relatedProducts: Product[];
  structuredData: {
    product: Record<string, unknown> | null;
    breadcrumb: Record<string, unknown> | null;
  };
}

const isDev = process.env.NODE_ENV === 'development';

/** backend/controllers/productController.js getProduct — product + related + Product/BreadcrumbList JSON-LD, all server-computed. */
export async function getProductBySlug(slug: string): Promise<ProductDetailResponse | null> {
  try {
    const currency = await getSessionCurrency();
    const qs = currency ? `?currency=${encodeURIComponent(currency)}` : '';
    const res = await fetch(`${apiBase()}/api/products/${encodeURIComponent(slug)}${qs}`, {
      ...(currency ? { headers: currencyDisplayHeaders(currency) } : {}),
      next: { revalidate: isDev ? 0 : 300, tags: ['products', `product-${slug}`] },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ProductDetailResponse;
    if (!data.success || !data.data) return null;
    return data;
  } catch {
    return null;
  }
}

export async function listProducts(): Promise<Product[]> {
  try {
    const currency = await getSessionCurrency();
    const qs = currency ? `?currency=${encodeURIComponent(currency)}` : '';
    const res = await fetch(`${apiBase()}/api/products${qs}`, {
      ...(currency ? { headers: currencyDisplayHeaders(currency) } : {}),
      next: { revalidate: isDev ? 0 : 300, tags: ['products'] },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { success: boolean; data: Product[] };
    return data.success ? data.data : [];
  } catch {
    return [];
  }
}
