import { apiBase } from './api';
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

/** backend/controllers/productController.js getProduct — product + related + Product/BreadcrumbList JSON-LD, all server-computed. */
export async function getProductBySlug(slug: string): Promise<ProductDetailResponse | null> {
  try {
    const res = await fetch(`${apiBase()}/api/products/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
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
    const res = await fetch(`${apiBase()}/api/products`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { success: boolean; data: Product[] };
    return data.success ? data.data : [];
  } catch {
    return [];
  }
}
