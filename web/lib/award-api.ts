import { apiBase } from './api';

export interface Award {
  _id: string;
  id: string;
  title: string;
  slug?: string;
  description?: string;
  year?: string;
  dateAwarded?: string | null;
  organization?: string;
  category?: string;
  imageUrl?: string;
  imagePublicId?: string;
  imageAlt?: string;
  videoUrl?: string;
  videoThumbnail?: string;
  externalLink?: string;
  featured?: boolean;
  displayOrder?: number;
  createdAt?: string;
}

export interface AwardListResponse {
  success: boolean;
  count: number;
  total: number;
  featuredCount: number;
  page: number;
  pages: number;
  hasMore: boolean;
  data: Award[];
}

export async function listAwards(params: { page?: number; limit?: number; category?: string } = {}): Promise<AwardListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.category) qs.set('category', params.category);
  const query = qs.toString();
  try {
    const res = await fetch(`${apiBase()}/api/awards${query ? `?${query}` : ''}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return { success: false, count: 0, total: 0, featuredCount: 0, page: 1, pages: 1, hasMore: false, data: [] };
    return (await res.json()) as AwardListResponse;
  } catch {
    return { success: false, count: 0, total: 0, featuredCount: 0, page: 1, pages: 1, hasMore: false, data: [] };
  }
}