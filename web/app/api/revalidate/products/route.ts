import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { siteConfig } from '@/lib/config';

/**
 * On-demand cache invalidation for product / storefront-section content.
 *
 * Section membership, pricing and purchase switches are admin data rendered by
 * server components (`/`, `/exam-booking`, `/exam-vouchers`), so an edit would
 * otherwise wait for the ISR window. The admin Products screen calls this after
 * every successful mutation — best effort, it never blocks the save.
 *
 * Authorisation is delegated to the Express backend — the caller's bearer token
 * must resolve to an admin via /api/auth/me. This route never touches the DB.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  let me: { success?: boolean; user?: { role?: string } } = {};
  try {
    const res = await fetch(`${siteConfig.apiUrl}/api/auth/me`, { headers: { Authorization: auth }, cache: 'no-store' });
    me = await res.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Auth check failed' }, { status: 502 });
  }
  if (!me.success || me.user?.role !== 'admin') {
    return NextResponse.json({ success: false, message: 'Admin only' }, { status: 403 });
  }

  let slugs: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.slugs)) slugs = body.slugs.filter((s: unknown) => typeof s === 'string' && s);
  } catch {
    /* no body — revalidate the storefront pages only */
  }

  try {
    revalidateTag('products', { expire: 0 });
    revalidateTag('website-config', { expire: 0 });
    // PTE Exam Booking storefront catalog (booking cards on `/`).
    revalidateTag('pte-booking-catalog', { expire: 0 });
    for (const slug of slugs) {
      revalidateTag(`product-${slug}`, { expire: 0 });
    }
  } catch {
    /* non-fatal */
  }

  revalidatePath('/', 'layout');
  revalidatePath('/');
  revalidatePath('/exam-booking');
  revalidatePath('/exam-vouchers');
  revalidatePath('/exam-vouchers/[slug]', 'page');
  revalidatePath('/sitemap.xml');
  for (const slug of slugs) revalidatePath(`/exam-vouchers/${slug}`);

  return NextResponse.json({
    success: true,
    revalidated: ['/', '/exam-booking', '/exam-vouchers', '/exam-vouchers/[slug]', '/sitemap.xml', ...slugs.map((s) => `/exam-vouchers/${s}`)],
  });
}
