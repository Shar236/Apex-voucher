'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Save, Loader2, Plus, X, Trash2, ChevronDown, ChevronUp, ChevronsUpDown,
  Image as ImageIcon, AlertTriangle, Eye, GripVertical,
} from 'lucide-react';
import { adminApi, formatPrice } from '@/lib/api';
import { Field, Label, TextArea, Check } from '@/components/admin/admin-ui';
import { BlogRichEditor } from '@/components/admin/blog-rich-editor';
import { RedemptionGuideSection } from '@/components/product/redemption-guide-section';
import { PurchaseGuideSection } from '@/components/product/purchase-guide-section';
import type { Product, InfoRow } from '@/lib/types';

// ── Shared types ────────────────────────────────────────────────────────────

export interface AdminProduct {
  _id: string;
  name?: string;
  provider?: string;
  providerShortName?: string;
  brand?: string;
  category?: string;
  shortDescription?: string;
  description?: string;
  logo?: string;
  image?: string;
  imagePublicId?: string;
  originalPrice?: number;
  sellingPrice?: number;
  validityDays?: number;
  validityMonths?: number;
  badge?: string;
  badgeEnabled?: boolean;
  badges?: string[];
  officialWebsiteUrl?: string;
  officialProductUrl?: string;
  sku?: string;
  productCode?: string;
  stockType?: string;
  deliveryType?: string;
  comingSoon?: boolean;
  featured?: boolean;
  active?: boolean;
  displayOrder?: number;
  seoTitle?: string;
  seoDescription?: string;
  slug?: string;
  inclusions?: string[] | string;
  redemptionSteps?: string[] | string;
  cta?: string;
  availableVouchers?: number | null;
  stockStatus?: string;
  lowStockThreshold?: number;
  archived?: boolean;
  durationOptions?: Array<{ key: string; label: string; sellingPrice: number; originalPrice: number; validityDays: number; enabled: boolean }>;
  redemptionGuide?: Product['redemptionGuide'];
  purchaseGuide?: Product['purchaseGuide'];
  productContent?: Product['productContent'];
  importantInfo?: InfoRow[];
  importantNotes?: string[];
  faqs?: Array<{ question: string; answer: string }>;
  relatedProducts?: string[];
}

const DURATION_KEYS = [
  { key: '1-week', label: '1 Week', defaultDays: 7 },
  { key: '1-month', label: '1 Month', defaultDays: 30 },
  { key: '3-months', label: '3 Months', defaultDays: 90 },
];

const IMG_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMG_MAX_SIZE = 5 * 1024 * 1024;

// ── Draft model ─────────────────────────────────────────────────────────────

interface ScreenshotDraft { url: string; publicId: string; alt: string; caption: string; width?: number; height?: number }
interface StepDraft { title: string; description: string; importantNote: string; videoUrl: string; screenshot: ScreenshotDraft }
interface PurchaseStepDraft { title: string; description: string; ctaText: string; ctaUrl: string; screenshot: ScreenshotDraft }
interface DurationDraft { key: string; label: string; sellingPrice: number; originalPrice: number; validityDays: number; enabled: boolean }

interface Draft {
  name: string; provider: string; providerShortName: string; brand: string; category: string;
  displayOrder: string; cta: string; slug: string;
  originalPrice: string; sellingPrice: string; validityMonths: string; validityDays: string;
  durationOptions: DurationDraft[];
  deliveryType: string; stockType: string; logo: string; image: string; imagePublicId: string;
  badge: string; badges: string;
  badgeEnabled: boolean; featured: boolean; active: boolean; comingSoon: boolean;
  shortDescription: string; description: string; inclusions: string;
  officialWebsiteUrl: string; officialProductUrl: string; sku: string; productCode: string;
  productContent: { enabled: boolean; heading: string; content: string };
  purchaseGuide: {
    enabled: boolean; eyebrow: string; title: string; description: string;
    steps: PurchaseStepDraft[];
  };
  redemptionGuide: {
    enabled: boolean; providerLabel: string; officialUrl: string; buttonText: string; introduction: string;
    steps: StepDraft[]; warnings: string[];
  };
  importantInfo: InfoRow[];
  importantNotes: string[];
  faqs: Array<{ question: string; answer: string }>;
  relatedProducts: string[];
  seoTitle: string; seoDescription: string;
}

const emptyScreenshot = (): ScreenshotDraft => ({ url: '', publicId: '', alt: '', caption: '' });
const emptyStep = (): StepDraft => ({ title: '', description: '', importantNote: '', videoUrl: '', screenshot: emptyScreenshot() });
const emptyPurchaseStep = (): PurchaseStepDraft => ({ title: '', description: '', ctaText: '', ctaUrl: '', screenshot: emptyScreenshot() });

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

const toDraft = (p?: AdminProduct | null): Draft => ({
  name: str(p?.name),
  provider: str(p?.provider) || 'Pearson',
  providerShortName: str(p?.providerShortName) || 'PTE',
  brand: str(p?.brand) || str(p?.provider) || 'Pearson PTE',
  category: str(p?.category) || 'English Language Test',
  displayOrder: str(p?.displayOrder ?? 0),
  cta: str(p?.cta) || 'Buy Now',
  slug: str(p?.slug),
  originalPrice: str(p?.originalPrice ?? 18900),
  sellingPrice: str(p?.sellingPrice ?? 15499),
  validityMonths: str(p?.validityMonths ?? 6),
  validityDays: str(p?.validityDays ?? 180),
  durationOptions: (p?.durationOptions || []).map((o) => ({
    key: o.key, label: o.label, sellingPrice: o.sellingPrice, originalPrice: o.originalPrice,
    validityDays: o.validityDays, enabled: o.enabled !== false,
  })),
  deliveryType: str(p?.deliveryType) || 'Instant Delivery',
  stockType: str(p?.stockType) || 'LIMITED',
  logo: str(p?.logo),
  image: str(p?.image),
  imagePublicId: str(p?.imagePublicId),
  badge: str(p?.badge),
  badges: Array.isArray(p?.badges) ? (p!.badges as string[]).join(', ') : str(p?.badges),
  badgeEnabled: p?.badgeEnabled !== false,
  featured: !!p?.featured,
  active: p?.active !== false,
  comingSoon: !!p?.comingSoon,
  shortDescription: str(p?.shortDescription),
  description: str(p?.description),
  inclusions: Array.isArray(p?.inclusions) ? (p!.inclusions as string[]).join('\n') : str(p?.inclusions),
  officialWebsiteUrl: str(p?.officialWebsiteUrl),
  officialProductUrl: str(p?.officialProductUrl),
  sku: str(p?.sku),
  productCode: str(p?.productCode),
  productContent: {
    enabled: !!p?.productContent?.enabled,
    heading: str(p?.productContent?.heading),
    content: str(p?.productContent?.content),
  },
  purchaseGuide: {
    enabled: !!p?.purchaseGuide?.enabled,
    eyebrow: str(p?.purchaseGuide?.eyebrow),
    title: str(p?.purchaseGuide?.title),
    description: str(p?.purchaseGuide?.description),
    steps: (p?.purchaseGuide?.steps || []).map((s) => ({
      title: str(s.title),
      description: str(s.description),
      ctaText: str(s.ctaText),
      ctaUrl: str(s.ctaUrl),
      screenshot: {
        url: str(s.screenshot?.url),
        publicId: str(s.screenshot?.publicId),
        alt: str(s.screenshot?.alt),
        caption: str(s.screenshot?.caption),
        width: s.screenshot?.width,
        height: s.screenshot?.height,
      },
    })),
  },
  redemptionGuide: {
    enabled: !!p?.redemptionGuide?.enabled,
    providerLabel: str(p?.redemptionGuide?.providerLabel),
    officialUrl: str(p?.redemptionGuide?.officialUrl),
    buttonText: str(p?.redemptionGuide?.buttonText),
    introduction: str(p?.redemptionGuide?.introduction),
    steps: (p?.redemptionGuide?.steps || []).map((s) => ({
      title: str(s.title),
      description: str(s.description),
      importantNote: str(s.importantNote),
      videoUrl: str(s.videoUrl),
      screenshot: {
        url: str(s.screenshot?.url),
        publicId: str(s.screenshot?.publicId),
        alt: str(s.screenshot?.alt),
        caption: str(s.screenshot?.caption),
        width: s.screenshot?.width,
        height: s.screenshot?.height,
      },
    })),
    warnings: (p?.redemptionGuide?.warnings || []).map(str),
  },
  importantInfo: (p?.importantInfo || []).map((r) => ({ label: str(r.label), value: str(r.value) })),
  importantNotes: (p?.importantNotes || []).map(str),
  faqs: (p?.faqs || []).map((f) => ({ question: str(f.question), answer: str(f.answer) })),
  relatedProducts: (p?.relatedProducts || []).map((r) => (typeof r === 'string' ? r : String((r as { _id?: string })?._id || ''))).filter(Boolean),
  seoTitle: str(p?.seoTitle),
  seoDescription: str(p?.seoDescription),
});

const buildPayload = (d: Draft) => ({
  name: d.name.trim(),
  provider: d.provider.trim(),
  providerShortName: d.providerShortName.trim(),
  brand: d.brand.trim() || d.provider.trim(),
  category: d.category.trim(),
  displayOrder: Number(d.displayOrder) || 0,
  cta: d.cta.trim() || 'Buy Now',
  slug: d.slug.trim(),
  originalPrice: Number(d.originalPrice) || 0,
  sellingPrice: Number(d.sellingPrice) || 0,
  validityMonths: Number(d.validityMonths) || 0,
  validityDays: Number(d.validityDays) || 0,
  durationOptions: d.durationOptions
    .filter((o) => o.enabled)
    .map((o) => ({
      key: o.key, label: o.label || o.key,
      sellingPrice: Number(o.sellingPrice) || 0, originalPrice: Number(o.originalPrice) || 0,
      validityDays: Number(o.validityDays) || 7, enabled: true,
    })),
  deliveryType: d.deliveryType.trim(),
  stockType: d.stockType,
  logo: d.logo.trim(),
  image: d.image.trim(),
  imagePublicId: d.imagePublicId,
  badge: d.badge.trim(),
  badges: d.badges.split(',').map((b) => b.trim()).filter(Boolean),
  badgeEnabled: d.badgeEnabled,
  featured: d.featured,
  active: d.active,
  comingSoon: d.comingSoon,
  shortDescription: d.shortDescription.trim(),
  description: d.description.trim(),
  inclusions: d.inclusions.split('\n').map((s) => s.trim()).filter(Boolean),
  officialWebsiteUrl: d.officialWebsiteUrl.trim(),
  officialProductUrl: d.officialProductUrl.trim(),
  sku: d.sku.trim(),
  productCode: d.productCode.trim(),
  productContent: {
    enabled: d.productContent.enabled,
    heading: d.productContent.heading.trim(),
    content: d.productContent.content,
  },
  purchaseGuide: {
    enabled: d.purchaseGuide.enabled,
    eyebrow: d.purchaseGuide.eyebrow.trim(),
    title: d.purchaseGuide.title.trim(),
    description: d.purchaseGuide.description.trim(),
    steps: d.purchaseGuide.steps.map((s) => ({
      title: s.title.trim(),
      description: s.description.trim(),
      ctaText: s.ctaText.trim(),
      ctaUrl: s.ctaUrl.trim(),
      screenshot: s.screenshot.url
        ? {
            url: s.screenshot.url.trim(),
            publicId: s.screenshot.publicId,
            alt: s.screenshot.alt.trim(),
            caption: s.screenshot.caption.trim(),
            width: s.screenshot.width,
            height: s.screenshot.height,
          }
        : {},
    })),
  },
  redemptionGuide: {
    enabled: d.redemptionGuide.enabled,
    providerLabel: d.redemptionGuide.providerLabel.trim(),
    officialUrl: d.redemptionGuide.officialUrl.trim(),
    buttonText: d.redemptionGuide.buttonText.trim(),
    introduction: d.redemptionGuide.introduction.trim(),
    warnings: d.redemptionGuide.warnings.map((w) => w.trim()).filter(Boolean),
    steps: d.redemptionGuide.steps.map((s) => ({
      title: s.title.trim(),
      description: s.description.trim(),
      importantNote: s.importantNote.trim(),
      videoUrl: s.videoUrl.trim(),
      screenshot: s.screenshot.url
        ? {
            url: s.screenshot.url.trim(),
            publicId: s.screenshot.publicId,
            alt: s.screenshot.alt.trim(),
            caption: s.screenshot.caption.trim(),
            width: s.screenshot.width,
            height: s.screenshot.height,
          }
        : {},
    })),
  },
  importantInfo: d.importantInfo
    .map((r) => ({ label: (r.label || '').trim(), value: (r.value || '').trim() }))
    .filter((r) => r.label || r.value),
  importantNotes: d.importantNotes.map((n) => n.trim()).filter(Boolean),
  faqs: d.faqs.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() })).filter((f) => f.question && f.answer),
  relatedProducts: d.relatedProducts,
  seoTitle: d.seoTitle.trim(),
  seoDescription: d.seoDescription.trim(),
});

// ── UI primitives ───────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true, badge }: { title: string; children: React.ReactNode; defaultOpen?: boolean; badge?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-3xl border border-[#EAEAEA] dark:border-[#292929] bg-white dark:bg-[#161616] overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-4">
        <span className="font-black text-sm flex items-center gap-2">
          {title}
          {badge ? <span className="px-2 py-0.5 rounded-full bg-brand-pink/10 text-brand-pink text-[10px] font-black">{badge}</span> : null}
        </span>
        <ChevronsUpDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="px-5 pb-5 space-y-4">{children}</div> : null}
    </div>
  );
}

function MoveButtons({ index, total, onMove, onRemove }: { index: number; total: number; onMove: (dir: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="p-1.5 rounded-lg bg-neutral-100 dark:bg-[#262626] text-neutral-500 disabled:opacity-30" title="Move up"><ChevronUp className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="p-1.5 rounded-lg bg-neutral-100 dark:bg-[#262626] text-neutral-500 disabled:opacity-30" title="Move down"><ChevronDown className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={onRemove} className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function ImageUploaderBox({
  label, value, onChange, uploader,
}: {
  label: string;
  value: string;
  onChange: (url: string, publicId?: string, width?: number, height?: number) => void;
  uploader: (file: File) => Promise<{ success: boolean; url?: unknown; publicId?: unknown; width?: unknown; height?: unknown; message?: unknown }>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(value || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) { setPrevValue(value); setPreview(value || ''); }

  const handleFile = (file?: File) => {
    if (!file || uploading) return;
    setError('');
    if (!IMG_ALLOWED_TYPES.includes(file.type)) { setError('Use JPG, PNG, or WebP.'); return; }
    if (file.size > IMG_MAX_SIZE) { setError('Maximum size is 5MB.'); return; }
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    uploader(file).then((res) => {
      setUploading(false);
      if (res.success && res.url) {
        onChange(String(res.url), res.publicId ? String(res.publicId) : '', Number(res.width) || undefined, Number(res.height) || undefined);
        setPreview(String(res.url));
      } else {
        setError(String(res.message || 'Upload failed'));
      }
    });
  };

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-start gap-3">
        <div className="w-20 h-20 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] flex items-center justify-center overflow-hidden shrink-0">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="preview" className="w-full h-full object-contain" />
          ) : (
            <ImageIcon className="w-6 h-6 text-neutral-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {uploading ? (
            <div className="text-xs font-bold text-neutral-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 text-[11px] font-black">
                {preview ? 'Replace' : 'Upload'}
              </button>
              {preview && (
                <button type="button" onClick={() => { onChange('', '', undefined, undefined); setPreview(''); setError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 text-[11px] font-black">
                  Remove
                </button>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          {error && <p className="text-[11px] font-bold text-rose-500 mt-1.5">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function StringList({ items, onChange, placeholder, addLabel }: { items: string[]; onChange: (next: string[]) => void; placeholder: string; addLabel: string }) {
  return (
    <div className="space-y-2">
      {items.map((val, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={val}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            className="flex-1 px-3 py-2 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-xs font-bold focus:outline-none focus:border-brand-pink"
          />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ''])} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#262626] text-xs font-black">
        <Plus className="w-4 h-4" /> {addLabel}
      </button>
    </div>
  );
}

function ScreenshotUploader({ value, onChange }: { value: ScreenshotDraft; onChange: (next: ScreenshotDraft) => void }) {
  return (
    <div className="rounded-2xl border border-[#EAEAEA] dark:border-[#292929] p-3 space-y-3 bg-neutral-50/50 dark:bg-[#0E0E0E]/40">
      <ImageUploaderBox
        label="Step Screenshot"
        value={value.url}
        uploader={(f) => adminApi.uploadProductScreenshot(f)}
        onChange={(url, publicId, width, height) =>
          onChange(url ? { ...value, url, publicId: publicId || '', width, height } : emptyScreenshot())
        }
      />
      {value.url && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Screenshot Alt Text" value={value.alt} onChange={(v) => onChange({ ...value, alt: v })} placeholder="Pearson booking page login screen" />
          <Field label="Screenshot Caption" value={value.caption} onChange={(v) => onChange({ ...value, caption: v })} placeholder="Pearson booking page" />
        </div>
      )}
    </div>
  );
}

function RedemptionStepEditor({
  step, index, total, incomplete, onChange, onMove, onRemove,
}: {
  step: StepDraft; index: number; total: number; incomplete: boolean;
  onChange: (next: StepDraft) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void;
}) {
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${incomplete ? 'border-amber-300 dark:border-amber-800/60' : 'border-[#EAEAEA] dark:border-[#292929]'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-black flex items-center gap-2"><GripVertical className="w-4 h-4 text-neutral-300" /> Step {index + 1}</span>
        <MoveButtons index={index} total={total} onMove={onMove} onRemove={onRemove} />
      </div>
      <Field label="Step Title" value={step.title} onChange={(v) => onChange({ ...step, title: v })} placeholder="Open the official website" />
      <TextArea label="Step Description" value={step.description} onChange={(v) => onChange({ ...step, description: v })} rows={2} />
      <ScreenshotUploader value={step.screenshot} onChange={(v) => onChange({ ...step, screenshot: v })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <TextArea label="Important Note (optional)" value={step.importantNote} onChange={(v) => onChange({ ...step, importantNote: v })} rows={2} />
        <Field label="Video URL (optional)" value={step.videoUrl} onChange={(v) => onChange({ ...step, videoUrl: v })} placeholder="https://…" />
      </div>
    </div>
  );
}

function PurchaseStepEditor({
  step, index, total, incomplete, onChange, onMove, onRemove,
}: {
  step: PurchaseStepDraft; index: number; total: number; incomplete: boolean;
  onChange: (next: PurchaseStepDraft) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void;
}) {
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${incomplete ? 'border-amber-300 dark:border-amber-800/60' : 'border-[#EAEAEA] dark:border-[#292929]'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-black flex items-center gap-2"><GripVertical className="w-4 h-4 text-neutral-300" /> Step {index + 1}</span>
        <MoveButtons index={index} total={total} onMove={onMove} onRemove={onRemove} />
      </div>
      <Field label="Step Title" value={step.title} onChange={(v) => onChange({ ...step, title: v })} placeholder="Choose Your Voucher" />
      <TextArea label="Step Description" value={step.description} onChange={(v) => onChange({ ...step, description: v })} rows={2} />
      <ScreenshotUploader value={step.screenshot} onChange={(v) => onChange({ ...step, screenshot: v })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="CTA Text (optional)" value={step.ctaText} onChange={(v) => onChange({ ...step, ctaText: v })} placeholder="Browse Vouchers" />
        <Field label="CTA URL (optional)" value={step.ctaUrl} onChange={(v) => onChange({ ...step, ctaUrl: v })} placeholder="https://…" />
      </div>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

export function ProductEditor({
  productId, onClose, onSaved,
}: {
  productId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !productId;
  const [loading, setLoading] = useState(!isNew);
  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [allProducts, setAllProducts] = useState<AdminProduct[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v })), []);
  const setGuide = useCallback((patch: Partial<Draft['redemptionGuide']>) =>
    setDraft((d) => ({ ...d, redemptionGuide: { ...d.redemptionGuide, ...patch } })), []);
  const setPurchaseGuide = useCallback((patch: Partial<Draft['purchaseGuide']>) =>
    setDraft((d) => ({ ...d, purchaseGuide: { ...d.purchaseGuide, ...patch } })), []);

  useEffect(() => {
    adminApi.products({ limit: '200', sort: 'displayOrder' }).then((r) => setAllProducts((r.data as AdminProduct[]) || []));
  }, []);

  useEffect(() => {
    // `loading` initialises to `!isNew`, so no synchronous setState is needed here.
    if (isNew) return;
    let cancelled = false;
    adminApi.getProduct(productId!).then((r) => {
      if (cancelled) return;
      if (r.success && r.data) setDraft(toDraft(r.data as AdminProduct));
      else setMsg({ kind: 'err', text: (r.message as string) || 'Could not load product' });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [productId, isNew]);

  const incompleteSteps = useMemo(
    () => draft.redemptionGuide.enabled
      ? draft.redemptionGuide.steps.reduce((n, s) => n + (s.title.trim() && s.description.trim() ? 0 : 1), 0)
      : 0,
    [draft.redemptionGuide],
  );

  const incompletePurchaseSteps = useMemo(
    () => draft.purchaseGuide.enabled
      ? draft.purchaseGuide.steps.reduce((n, s) => n + (s.title.trim() && s.description.trim() ? 0 : 1), 0)
      : 0,
    [draft.purchaseGuide],
  );

  const previewProduct = useMemo(() => ({
    ...buildPayload(draft),
    _id: productId || 'preview',
  }) as unknown as Product, [draft, productId]);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    if (kind === 'ok') window.setTimeout(() => setMsg(null), 6000);
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.provider.trim()) return flash('err', 'Product name and provider are required.');
    if (Number(draft.sellingPrice) < 0 || Number(draft.originalPrice) < 0) return flash('err', 'Prices must be non-negative.');
    if (Number(draft.sellingPrice) > Number(draft.originalPrice)) return flash('err', 'Selling price cannot exceed the original price.');

    setSaving(true);
    const payload = buildPayload(draft);
    const res = isNew
      ? await adminApi.createProduct(payload)
      : await adminApi.updateProduct(productId!, payload);
    setSaving(false);

    if (!res.success) return flash('err', (res.message as string) || 'Failed to save product');
    const warnings = (res.warnings as string[]) || [];
    if (warnings.length > 0) {
      flash('err', `Saved, but check: ${warnings.join(' ')}`);
      if (!isNew) return; // stay so the admin can fix; for new, fall through to close
    }
    const slug = draft.slug || (res.data as { slug?: string })?.slug;
    adminApi.revalidatePublicProducts(slug ? [slug] : []);
    onSaved();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-neutral-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const selectableProducts = allProducts.filter((p) => p._id !== productId);
  const selectedRelated = draft.relatedProducts
    .map((id) => selectableProducts.find((p) => p._id === id))
    .filter((p): p is AdminProduct => !!p);

  const moveInArray = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10 bg-[#F3EEFF]/80 dark:bg-[#06070B]/80 backdrop-blur py-2 -my-2">
        <button onClick={onClose} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] text-xs font-black">
          <ArrowLeft className="w-4 h-4" /> Back to products
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview((v) => !v)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] text-xs font-black">
            <Eye className="w-4 h-4" /> {showPreview ? 'Hide' : 'Preview'} Guides
          </button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl btn-pink text-white font-black text-xs shadow-lg disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {saving ? 'Saving…' : isNew ? 'Create Product' : 'Save Changes'}
          </button>
        </div>
      </div>

      <h1 className="font-heading font-black text-2xl tracking-tight">
        {isNew ? 'Add New Product' : `Edit Product: ${draft.name || '—'}`}
      </h1>

      {msg && (
        <div className={`px-4 py-3 rounded-2xl text-xs font-bold border ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400'}`}>
          {msg.text}
        </div>
      )}

      {showPreview && (
        <div className="rounded-3xl border border-[#EAEAEA] dark:border-[#292929] bg-surface p-6 space-y-8">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-neutral-400 mb-4">Live preview — public &quot;How to Purchase&quot; section</p>
            {draft.purchaseGuide.enabled && draft.purchaseGuide.steps.some((s) => s.title.trim() || s.description.trim()) ? (
              <PurchaseGuideSection product={previewProduct} headingAlign="left" previewMode />
            ) : (
              <p className="text-sm text-neutral-500 font-bold">Enable the purchase guide and add at least one step to preview it.</p>
            )}
          </div>
          <div className="pt-8 border-t border-[#EAEAEA] dark:border-[#292929]">
            <p className="text-[11px] font-black uppercase tracking-wider text-neutral-400 mb-4">Live preview — public &quot;How to Redeem&quot; section</p>
            {draft.redemptionGuide.enabled && draft.redemptionGuide.steps.some((s) => s.title.trim() || s.description.trim()) ? (
              <RedemptionGuideSection product={previewProduct} headingAlign="left" previewMode />
            ) : (
              <p className="text-sm text-neutral-500 font-bold">Enable the redemption guide and add at least one step to preview it.</p>
            )}
          </div>
        </div>
      )}

      <Section title="Basic Information">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Product Name *" value={draft.name} onChange={(v) => set('name', v)} placeholder="e.g. PTE Academic Voucher" />
          <Field label="Exam Provider *" value={draft.provider} onChange={(v) => setDraft((d) => ({ ...d, provider: v, brand: v }))} placeholder="Pearson / ETS / IDP" />
          <Field label="Provider Short Name" value={draft.providerShortName} onChange={(v) => set('providerShortName', v)} placeholder="PTE / GRE / TOEFL" />
          <Field label="Brand" value={draft.brand} onChange={(v) => set('brand', v)} placeholder="Pearson PTE" />
          <Field label="Category" value={draft.category} onChange={(v) => set('category', v)} placeholder="English Language Test" />
          <Field label="Display Order (Rank)" type="number" value={draft.displayOrder} onChange={(v) => set('displayOrder', v)} />
          <Field label="CTA Button Text" value={draft.cta} onChange={(v) => set('cta', v)} />
          <Field label="Slug (URL)" value={draft.slug} onChange={(v) => set('slug', v)} placeholder="pte-academic-voucher" />
        </div>
      </Section>

      <Section title="Pricing & Duration">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Original Price (MRP ₹) *" type="number" value={draft.originalPrice} onChange={(v) => set('originalPrice', v)} />
          <Field label="Selling Price (₹) *" type="number" value={draft.sellingPrice} onChange={(v) => set('sellingPrice', v)} />
          <div>
            <Label>Calculated Discount</Label>
            <div className="px-4 py-3 rounded-xl bg-neutral-100 dark:bg-[#0E0E0E] font-black text-sm text-emerald-600 dark:text-emerald-400">
              Save {formatPrice(Math.max(0, (Number(draft.originalPrice) || 0) - (Number(draft.sellingPrice) || 0)))} (
              {Number(draft.originalPrice) > 0 ? Math.round(((Number(draft.originalPrice) - Number(draft.sellingPrice)) / Number(draft.originalPrice)) * 100) : 0}% OFF)
            </div>
          </div>
          <Field label="Validity (Months)" type="number" value={draft.validityMonths} onChange={(v) => set('validityMonths', v)} />
          <Field label="Validity (Days)" type="number" value={draft.validityDays} onChange={(v) => set('validityDays', v)} />
        </div>
        <div>
          <Label>Duration Options (variants with their own prices)</Label>
          {DURATION_KEYS.map((dk) => {
            const opt = draft.durationOptions.find((o) => o.key === dk.key);
            const enabled = !!opt?.enabled;
            const upsert = (patch: Partial<DurationDraft>) => {
              const cur = [...draft.durationOptions];
              const idx = cur.findIndex((o) => o.key === dk.key);
              const base: DurationDraft = { key: dk.key, label: dk.label, sellingPrice: 0, originalPrice: 0, validityDays: dk.defaultDays, enabled: true };
              if (idx >= 0) cur[idx] = { ...cur[idx], ...patch };
              else cur.push({ ...base, ...patch });
              set('durationOptions', cur);
            };
            return (
              <div key={dk.key} className="rounded-2xl border border-[#EAEAEA] dark:border-[#292929] p-3 mt-2 space-y-2">
                <label className="flex items-center justify-between">
                  <span className="text-xs font-black">{dk.label}</span>
                  <span className="inline-flex items-center gap-2 text-[10px] font-bold text-neutral-500">
                    <input type="checkbox" checked={enabled} onChange={(e) => upsert({ enabled: e.target.checked })} /> Active
                  </span>
                </label>
                {enabled && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Field label="Selling ₹" type="number" value={opt?.sellingPrice ?? 0} onChange={(v) => upsert({ sellingPrice: Number(v) })} />
                    <Field label="Original ₹" type="number" value={opt?.originalPrice ?? 0} onChange={(v) => upsert({ originalPrice: Number(v) })} />
                    <Field label="Validity Days" type="number" value={opt?.validityDays ?? dk.defaultDays} onChange={(v) => upsert({ validityDays: Number(v) })} />
                    <Field label="Label" value={opt?.label ?? dk.label} onChange={(v) => upsert({ label: v || dk.label })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Delivery & Display">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Delivery Type" value={draft.deliveryType} onChange={(v) => set('deliveryType', v)} placeholder="Instant Delivery" />
          <div>
            <Label>Stock Type</Label>
            <select value={draft.stockType} onChange={(e) => set('stockType', e.target.value)} className="w-full px-4 py-3 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-sm font-bold focus:outline-none focus:border-brand-pink">
              <option value="LIMITED">Limited (tracked via voucher inventory)</option>
              <option value="UNLIMITED">Unlimited (always in stock)</option>
            </select>
          </div>
          <ImageUploaderBox label="Product Logo" value={draft.logo} uploader={(f) => adminApi.uploadProductLogo(f)} onChange={(url) => set('logo', url)} />
          <ImageUploaderBox
            label="Product Image"
            value={draft.image}
            uploader={(f) => adminApi.uploadProductImage(f)}
            onChange={(url, publicId) => setDraft((d) => ({ ...d, image: url, imagePublicId: publicId ?? d.imagePublicId }))}
          />
          <Field label="Card Badge Text" value={draft.badge} onChange={(v) => set('badge', v)} placeholder="MOST POPULAR" />
          <Field label="Badges (comma separated)" value={draft.badges} onChange={(v) => set('badges', v)} placeholder="Best Seller, Study Abroad" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Check label="Show Badge on Card" checked={draft.badgeEnabled} onChange={(v) => set('badgeEnabled', v)} />
          <Check label="Featured Product" checked={draft.featured} onChange={(v) => set('featured', v)} />
          <Check label="Active & Visible" checked={draft.active} onChange={(v) => set('active', v)} />
          <Check label="Coming Soon" checked={draft.comingSoon} onChange={(v) => set('comingSoon', v)} />
        </div>
      </Section>

      <Section title="Product Description">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextArea label="Short Description (card)" value={draft.shortDescription} onChange={(v) => set('shortDescription', v)} rows={2} />
          <TextArea label="Full Description" value={draft.description} onChange={(v) => set('description', v)} rows={2} />
        </div>
        <TextArea label="Inclusions (one per line)" value={draft.inclusions} onChange={(v) => set('inclusions', v)} rows={4} />
      </Section>

      <Section title="About This Product" defaultOpen={false} badge={draft.productContent.enabled ? 'On' : undefined}>
        <Check label="Enable 'About This Product' section" checked={draft.productContent.enabled} onChange={(v) => setDraft((d) => ({ ...d, productContent: { ...d.productContent, enabled: v } }))} />
        <Field label="Section Heading" value={draft.productContent.heading} onChange={(v) => setDraft((d) => ({ ...d, productContent: { ...d.productContent, heading: v } }))} placeholder="About the PTE Academic Voucher" />
        <div>
          <Label>Content</Label>
          <BlogRichEditor value={draft.productContent.content} onChange={(html) => setDraft((d) => ({ ...d, productContent: { ...d.productContent, content: html } }))} />
        </div>
      </Section>

      <Section title="Official Website" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Official Website URL" value={draft.officialWebsiteUrl} onChange={(v) => set('officialWebsiteUrl', v)} placeholder="https://www.pearsonpte.com/" />
          <Field label="Official Product Page URL" value={draft.officialProductUrl} onChange={(v) => set('officialProductUrl', v)} placeholder="https://www.pearsonpte.com/pte-academic/" />
          <Field label="SKU" value={draft.sku} onChange={(v) => set('sku', v)} />
          <Field label="Product Code" value={draft.productCode} onChange={(v) => set('productCode', v)} />
        </div>
      </Section>

      <Section title="How to Purchase" badge={draft.purchaseGuide.enabled ? `${draft.purchaseGuide.steps.length} step${draft.purchaseGuide.steps.length === 1 ? '' : 's'}` : undefined}>
        <Check label="Enable Purchase Guide" checked={draft.purchaseGuide.enabled} onChange={(v) => setPurchaseGuide({ enabled: v })} />

        {draft.purchaseGuide.enabled && incompletePurchaseSteps > 0 && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs font-bold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {incompletePurchaseSteps} step{incompletePurchaseSteps === 1 ? '' : 's'} still missing a title or description. You can save now and finish later.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Section Eyebrow" value={draft.purchaseGuide.eyebrow} onChange={(v) => setPurchaseGuide({ eyebrow: v })} placeholder="Buying Guide" />
          <Field label="Section Title" value={draft.purchaseGuide.title} onChange={(v) => setPurchaseGuide({ title: v })} placeholder="How to Purchase from Apex Vouchers" />
          <Field label="Section Description" value={draft.purchaseGuide.description} onChange={(v) => setPurchaseGuide({ description: v })} placeholder="A simple, secure checkout — from selection to your inbox." />
        </div>

        <div className="space-y-3">
          <Label>Purchase Steps</Label>
          {draft.purchaseGuide.steps.map((step, i) => (
            <PurchaseStepEditor
              key={i}
              step={step}
              index={i}
              total={draft.purchaseGuide.steps.length}
              incomplete={draft.purchaseGuide.enabled && !(step.title.trim() && step.description.trim())}
              onChange={(next) => setPurchaseGuide({ steps: draft.purchaseGuide.steps.map((s, j) => (j === i ? next : s)) })}
              onMove={(dir) => setPurchaseGuide({ steps: moveInArray(draft.purchaseGuide.steps, i, dir) })}
              onRemove={() => setPurchaseGuide({ steps: draft.purchaseGuide.steps.filter((_, j) => j !== i) })}
            />
          ))}
          <button type="button" onClick={() => setPurchaseGuide({ steps: [...draft.purchaseGuide.steps, emptyPurchaseStep()] })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-pink/10 text-brand-pink text-xs font-black">
            <Plus className="w-4 h-4" /> Add Purchase Step
          </button>
        </div>
      </Section>

      <Section title="How to Redeem" badge={draft.redemptionGuide.enabled ? `${draft.redemptionGuide.steps.length} step${draft.redemptionGuide.steps.length === 1 ? '' : 's'}` : undefined}>
        <Check label="Enable Redemption Guide" checked={draft.redemptionGuide.enabled} onChange={(v) => setGuide({ enabled: v })} />

        {draft.redemptionGuide.enabled && incompleteSteps > 0 && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs font-bold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {incompleteSteps} step{incompleteSteps === 1 ? '' : 's'} still missing a title or description. You can save now and finish later.
          </div>
        )}

        <TextArea label="Introduction" value={draft.redemptionGuide.introduction} onChange={(v) => setGuide({ introduction: v })} rows={3} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Provider Name" value={draft.redemptionGuide.providerLabel} onChange={(v) => setGuide({ providerLabel: v })} placeholder="Pearson" />
          <Field label="Official / Redemption URL" value={draft.redemptionGuide.officialUrl} onChange={(v) => setGuide({ officialUrl: v })} placeholder="https://…" />
          <Field label="Button Text" value={draft.redemptionGuide.buttonText} onChange={(v) => setGuide({ buttonText: v })} placeholder="Visit Official Pearson Website" />
        </div>

        <div className="space-y-3">
          <Label>Redemption Steps</Label>
          {draft.redemptionGuide.steps.map((step, i) => (
            <RedemptionStepEditor
              key={i}
              step={step}
              index={i}
              total={draft.redemptionGuide.steps.length}
              incomplete={draft.redemptionGuide.enabled && !(step.title.trim() && step.description.trim())}
              onChange={(next) => setGuide({ steps: draft.redemptionGuide.steps.map((s, j) => (j === i ? next : s)) })}
              onMove={(dir) => setGuide({ steps: moveInArray(draft.redemptionGuide.steps, i, dir) })}
              onRemove={() => setGuide({ steps: draft.redemptionGuide.steps.filter((_, j) => j !== i) })}
            />
          ))}
          <button type="button" onClick={() => setGuide({ steps: [...draft.redemptionGuide.steps, emptyStep()] })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-pink/10 text-brand-pink text-xs font-black">
            <Plus className="w-4 h-4" /> Add Redemption Step
          </button>
        </div>

        <div>
          <Label>Warnings (shown at the end of the guide)</Label>
          <StringList items={draft.redemptionGuide.warnings} onChange={(next) => setGuide({ warnings: next })} placeholder="Always use the official link supplied with your voucher." addLabel="Add Warning" />
        </div>
      </Section>

      <Section title="Important Information" defaultOpen={false} badge={draft.importantInfo.length ? String(draft.importantInfo.length) : undefined}>
        <Label>Information Rows</Label>
        <div className="space-y-2">
          {draft.importantInfo.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={row.label || ''} placeholder="Label (e.g. Voucher Validity)" onChange={(e) => set('importantInfo', draft.importantInfo.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} className="flex-1 px-3 py-2 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-xs font-bold focus:outline-none focus:border-brand-pink" />
              <input value={row.value || ''} placeholder="Value (e.g. 6 Months)" onChange={(e) => set('importantInfo', draft.importantInfo.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} className="flex-1 px-3 py-2 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-xs font-bold focus:outline-none focus:border-brand-pink" />
              <button type="button" onClick={() => set('importantInfo', draft.importantInfo.filter((_, j) => j !== i))} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => set('importantInfo', [...draft.importantInfo, { label: '', value: '' }])} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#262626] text-xs font-black">
            <Plus className="w-4 h-4" /> Add Info Row
          </button>
        </div>
        <div>
          <Label>Important Notes / Warnings</Label>
          <StringList items={draft.importantNotes} onChange={(next) => set('importantNotes', next)} placeholder="Make sure you use the official booking link supplied with your voucher." addLabel="Add Note" />
        </div>
      </Section>

      <Section title="FAQs" defaultOpen={false} badge={draft.faqs.length ? String(draft.faqs.length) : undefined}>
        {draft.faqs.map((f, i) => (
          <div key={i} className="rounded-2xl border border-[#EAEAEA] dark:border-[#292929] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={f.question}
                placeholder="Question"
                onChange={(e) => set('faqs', draft.faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                className="flex-1 px-3 py-2 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-xs font-bold focus:outline-none focus:border-brand-pink"
              />
              <MoveButtons index={i} total={draft.faqs.length} onMove={(dir) => set('faqs', moveInArray(draft.faqs, i, dir))} onRemove={() => set('faqs', draft.faqs.filter((_, j) => j !== i))} />
            </div>
            <textarea
              value={f.answer}
              placeholder="Answer"
              rows={2}
              onChange={(e) => set('faqs', draft.faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
              className="w-full px-3 py-2 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-xs font-bold focus:outline-none focus:border-brand-pink"
            />
          </div>
        ))}
        <button type="button" onClick={() => set('faqs', [...draft.faqs, { question: '', answer: '' }])} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#262626] text-xs font-black">
          <Plus className="w-4 h-4" /> Add FAQ
        </button>
      </Section>

      <Section title="Explore More (Related Products)" defaultOpen={false} badge={selectedRelated.length ? String(selectedRelated.length) : undefined}>
        <p className="text-[11px] font-bold text-neutral-500 dark:text-[#B5B5B5]">
          Curate the &quot;Explore More&quot; list. When none are selected, the site falls back to the automatic related-product algorithm.
        </p>
        {selectedRelated.length > 0 && (
          <div className="space-y-2">
            <Label>Selected (in display order)</Label>
            {selectedRelated.map((p, i) => (
              <div key={p._id} className="flex items-center justify-between gap-2 rounded-xl border border-[#EAEAEA] dark:border-[#292929] px-3 py-2">
                <span className="text-xs font-black truncate">{p.name}</span>
                <MoveButtons
                  index={i}
                  total={selectedRelated.length}
                  onMove={(dir) => set('relatedProducts', moveInArray(draft.relatedProducts, draft.relatedProducts.indexOf(p._id), dir))}
                  onRemove={() => set('relatedProducts', draft.relatedProducts.filter((id) => id !== p._id))}
                />
              </div>
            ))}
          </div>
        )}
        <div className="max-h-60 overflow-y-auto rounded-xl border border-[#EAEAEA] dark:border-[#292929] divide-y divide-[#EAEAEA] dark:divide-[#292929]">
          {selectableProducts.map((p) => (
            <label key={p._id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-[#0E0E0E]">
              <input
                type="checkbox"
                className="accent-brand-pink"
                checked={draft.relatedProducts.includes(p._id)}
                onChange={(e) => set('relatedProducts', e.target.checked ? [...draft.relatedProducts, p._id] : draft.relatedProducts.filter((id) => id !== p._id))}
              />
              <span className="text-xs font-bold">{p.name}</span>
              <span className="text-[10px] font-bold text-neutral-400">{p.provider}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="SEO" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="SEO Title" value={draft.seoTitle} onChange={(v) => set('seoTitle', v)} />
          <Field label="SEO Description" value={draft.seoDescription} onChange={(v) => set('seoDescription', v)} />
        </div>
      </Section>

      <div className="flex justify-end gap-2 pb-10">
        <button onClick={onClose} className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-[#262626] text-xs font-black">Cancel</button>
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl btn-pink text-white font-black text-xs shadow-lg disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {isNew ? 'Create Product' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
