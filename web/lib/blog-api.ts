import { apiBase } from './api';
import type { BlogPost, BlogCategoryCount, StructuredDataSet } from './blog-types';

export interface BlogListResponse {
  success: boolean;
  count: number;
  total: number;
  page: number;
  pages: number;
  hasMore: boolean;
  data: BlogPost[];
}

export interface BlogPostResponse {
  success: boolean;
  data: BlogPost;
  relatedPosts: BlogPost[];
  structuredData: StructuredDataSet;
  code?: string;
  redirectTo?: string;
}

const REVALIDATE_SECONDS = 300;

export async function listPublicBlogPosts(params: { category?: string; search?: string; page?: number; limit?: number } = {}): Promise<BlogListResponse> {
  const qs = new URLSearchParams();
  if (params.category && params.category !== 'All') qs.set('category', params.category);
  if (params.search) qs.set('search', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();

  try {
    const res = await fetch(`${apiBase()}/api/blog${query ? `?${query}` : ''}`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return { success: false, count: 0, total: 0, page: 1, pages: 1, hasMore: false, data: [] };
    return (await res.json()) as BlogListResponse;
  } catch {
    return { success: false, count: 0, total: 0, page: 1, pages: 1, hasMore: false, data: [] };
  }
}

export async function listBlogCategories(): Promise<BlogCategoryCount[]> {
  try {
    const res = await fetch(`${apiBase()}/api/blog/categories`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { success: boolean; data: BlogCategoryCount[] };
    return data.success ? data.data : [];
  } catch {
    return [];
  }
}

/**
 * Returns the raw response so the caller can also handle the REDIRECT case
 * (an old slug that now 301s to a new one — see backend getPublicBlog).
 * Blog content can change at any time from Admin → Blog, so this uses a short
 * revalidate window rather than being fully static — fresh edits show up
 * within minutes without a full site rebuild.
 */
export async function getPublicBlogPost(slug: string): Promise<BlogPostResponse | null> {
  try {
    const res = await fetch(`${apiBase()}/api/blog/${encodeURIComponent(slug)}`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(3500),
    });
    const data = (await res.json()) as BlogPostResponse;
    return data;
  } catch {
    return null;
  }
}
