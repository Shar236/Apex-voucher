'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Megaphone, RefreshCw, Plus, Save, ExternalLink, X, Trash2, HelpCircle, ShieldCheck, FileText, Info, Sparkles, CheckCircle2,
} from 'lucide-react';
import { adminApi, formatPrice } from '@/lib/api';
import { Pill, Empty } from '@/components/admin/admin-ui';
import type { Product } from '@/lib/types';
import { notify } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/use-confirm';

interface Campaign {
  _id: string;
  name?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  status?: string;
  badgeText?: string;
  discountType?: string;
  discountValue?: number;
  maxDiscount?: number;
  minOrderAmount?: number;
  startDate?: string;
  endDate?: string;
  priority?: number;
  applicableProducts?: Array<string | { _id: string }>;
  ctaText?: string;
  showCountdown?: boolean;
}

interface WebsiteSettings {
  heroSettings?: Record<string, string>;
  announcementSettings?: Record<string, unknown>;
  benefitCards?: unknown;
  footerSettings?: Record<string, string>;
  policySettings?: Record<string, unknown>;
}

const DEFAULT_HERO = { headingLine1: 'Your Exam. Your Dream.', headingHighlight: 'Our Vouchers.', headingLine3: 'Your Savings.', descriptionText: 'Get official voucher codes for PTE, IELTS, TOEFL & Duolingo at the best prices and save more on your exam fees.', ctaText: 'Browse Vouchers', ctaLink: '/#vouchers' };
const DEFAULT_ANNOUNCEMENT = { enabled: true, text: '⚡ Instant Voucher Delivery in 10s • 100% Genuine Official Vouchers', link: '/#vouchers', overrideWithCampaign: true };
const DEFAULT_FOOTER = { address: 'near ROSHAN LAL SHOWROOM, Badhni Kalan, Punjab 142037', phone: '+91 9855926113', email: 'info@apexvouchers.com', copyright: '© 2026 Apex Vouchers. All rights reserved.' };
const DEFAULT_POLICY = {
  apexRefund: {
    enabled: true, effectiveDate: '2026-01-01', eligibilityCriteria: 'Vouchers that are 100% unredeemed and unallocated on the Pearson / ETS portal within the allowable refund window.',
    cancellationPeriodDays: 7, refundPercentage: 100, processingFeePercent: 0, voucherValidityPeriod: '6 to 11 months from date of purchase (check voucher specification)',
    cancellationRules: 'Once a voucher refund is issued, the alphanumeric code is permanently deactivated in our database and cannot be applied to any exam booking.',
    reschedulingRules: 'Vouchers cannot be used to pay Pearson rescheduling fees. Rescheduling is managed directly via the student\'s myPTE account.',
    exceptionalCircumstances: 'For medical or family emergencies, official documentation may be submitted to support for expedited case-by-case review.',
    refundProcessingTime: '24 to 48 business hours via source payment method.', supportEmail: 'info@apexvouchers.com', supportPhone: '+91 98559 26113', whatsappNumber: '9855926113',
  },
  guideSettings: {
    pageTitle: 'How to Reschedule or Cancel a PTE Exam in 2026', subtitle: 'Complete Guide to PTE Rescheduling, Cancellation, Refunds & Voucher Bookings',
    ctaTitle: 'Planning to Book a New PTE Exam?', ctaSubtitle: 'Purchase your official PTE voucher from Apex Vouchers and save instantly on your exam fee.',
    ctaButtonText: 'BUY PTE VOUCHER ONLINE', ctaButtonLink: 'https://apexvouchers.com/', ctaEmail: 'info@apexvouchers.com', ctaPhone: '98559 26113',
    isPublished: true,
    disclaimerText: 'Disclaimer: This article is for general informational purposes and is not affiliated with or endorsed by Pearson. PTE fees, cancellation rules, refund policies, voucher terms and booking procedures may change. Students should verify the latest information directly with Pearson and review the terms of their voucher provider before making a cancellation, rescheduling request or refund claim.',
  },
  faqs: [
    { question: 'Can I change my PTE exam date?', answer: 'Yes. Eligible appointments can generally be rescheduled through your myPTE account under My Activity.' },
    { question: 'Is PTE rescheduling free?', answer: 'Under Pearson\'s current policy, rescheduling is generally free when more than 14 full calendar days remain before the test date.' },
    { question: 'Can I cancel my PTE exam and get a refund?', answer: 'Where applicable, the refund depends on how many full calendar days remain before the appointment. Cancellations made 14 or more full days before the test are generally eligible for a 100% refund, while cancellations made 13–8 full calendar days before the test are generally eligible for a 50% refund.' },
    { question: 'What refund do I get if I cancel 14 or more days before my PTE exam?', answer: 'Generally 100%, subject to Pearson\'s current terms and policies.' },
    { question: 'What if I cancel 10 days before my PTE exam?', answer: 'A cancellation made 13–8 full calendar days before the test date is generally eligible for a 50% refund under Pearson\'s published schedule.' },
    { question: 'What if I cancel fewer than 7 days before my PTE exam?', answer: 'Under Pearson\'s current published schedule, cancellations made fewer than 7 full calendar days before the test are generally not refundable.' },
    { question: 'What if I bought my PTE voucher from a third-party provider?', answer: 'Contact the provider from which the voucher was purchased and check that provider\'s applicable refund policy. Cancelling a Pearson exam appointment does not automatically refund payments made to a third-party voucher vendor.' },
    { question: 'Can I use a voucher to pay a rescheduling fee?', answer: 'Pearson states that PTE vouchers can be applied toward the test fee but cannot be used to pay a rescheduling fee.' },
  ],
};

function CampaignFormModal({ campaign, products, onClose, onSave }: { campaign: Campaign | null; products: Product[]; onClose: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    name: campaign?.name || '',
    status: campaign?.status || 'ACTIVE',
    startDate: campaign?.startDate ? new Date(campaign.startDate).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
    endDate: campaign?.endDate ? new Date(campaign.endDate).toISOString().slice(0, 16) : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    priority: campaign?.priority || 1,
    badgeText: campaign?.badgeText || '🇮🇳 Independence Day Special',
    title: campaign?.title || '50% OFF EXAM VOUCHERS',
    subtitle: campaign?.subtitle || 'Celebrate & Save Big on Your Exam Fees',
    description: campaign?.description || 'Get official exam vouchers at maximum discount during our special sale.',
    discountType: campaign?.discountType || 'PERCENTAGE',
    discountValue: campaign?.discountValue !== undefined ? campaign.discountValue : 50,
    maxDiscount: campaign?.maxDiscount || 0,
    minOrderAmount: campaign?.minOrderAmount || 0,
    applicableProducts: campaign?.applicableProducts ? campaign.applicableProducts.map((p) => (typeof p === 'object' ? p._id : p)) : [] as string[],
    ctaText: campaign?.ctaText || 'Shop Independence Day Offer',
    showCountdown: campaign?.showCountdown !== false,
  });

  const inputCls = 'w-full p-3 rounded-2xl border border-slate-200 dark:border-[#292929] bg-slate-50 dark:bg-[#1A1A1A] font-bold text-xs';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label={campaign ? 'Edit campaign' : 'Create campaign'}>
      <div className="bg-white dark:bg-[#141414] w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-[#292929] shadow-2xl p-6 space-y-6 my-8">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#252525] pb-4">
          <div>
            <h3 className="font-heading font-black text-xl text-slate-900 dark:text-white">{campaign ? 'Edit Campaign' : 'Create New Campaign'}</h3>
            <p className="text-xs text-neutral-500 font-medium">Configure festival offers, date ranges, and discounts.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-[#252525] cursor-pointer" aria-label="Close"><X className="w-5 h-5 text-neutral-500" /></button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-4 text-xs font-semibold">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-black">Campaign Name *</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Independence Day Sale" />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-black">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                <option value="ACTIVE">ACTIVE (Live on Site)</option>
                <option value="SCHEDULED">SCHEDULED (Auto-activates on start date)</option>
                <option value="DRAFT">DRAFT</option>
                <option value="PAUSED">PAUSED</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-black">Start Date &amp; Time *</label>
              <input type="datetime-local" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-black">End Date &amp; Time *</label>
              <input type="datetime-local" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-black">Discount Type</label>
              <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })} className={inputCls}>
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (₹)</option>
              </select>
            </div>
            <div>
              <label className="block text-brand-pink mb-1 font-black">Discount Value *</label>
              <input type="number" required min="0" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} className={`${inputCls} border-brand-pink/40 bg-rose-50/50 dark:bg-[#2A0A17]/30 font-black text-brand-pink`} />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-black">Max Discount Cap (₹)</label>
              <input type="number" min="0" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: Number(e.target.value) })} className={inputCls} placeholder="0 = No limit" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-black">Badge Text</label>
              <input type="text" value={form.badgeText} onChange={(e) => setForm({ ...form, badgeText: e.target.value })} className={inputCls} placeholder="🇮🇳 Independence Day Special" />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-black">Promotional Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="50% OFF EXAM VOUCHERS" />
            </div>
          </div>
          <div>
            <label className="block text-slate-700 dark:text-slate-300 mb-1 font-black">Subtitle / Tagline</label>
            <input type="text" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className={inputCls} placeholder="Celebrate & Save Big on Your Exam Fees" />
          </div>
          <div>
            <label className="block text-slate-700 dark:text-slate-300 mb-1 font-black">Included Products</label>
            <div className="p-3 rounded-2xl border border-slate-200 dark:border-[#292929] bg-slate-50 dark:bg-[#1A1A1A] space-y-2 max-h-36 overflow-y-auto">
              <label className="flex items-center gap-2 text-xs font-bold text-brand-pink cursor-pointer">
                <input type="checkbox" checked={form.applicableProducts.length === 0} onChange={(e) => { if (e.target.checked) setForm({ ...form, applicableProducts: [] }); }} className="w-4 h-4 accent-brand-pink" />
                Apply to ALL Vouchers (PTE, IELTS, TOEFL, Duolingo)
              </label>
              {products.map((prod) => {
                const prodId = prod._id || prod.id;
                const isSelected = form.applicableProducts.includes(prodId || '');
                return (
                  <label key={prodId} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) setForm({ ...form, applicableProducts: [...form.applicableProducts, prodId || ''] });
                        else setForm({ ...form, applicableProducts: form.applicableProducts.filter((id) => id !== prodId) });
                      }}
                      className="w-4 h-4 accent-brand-pink"
                    />
                    {prod.name} ({prod.brand || prod.provider})
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-[#252525]">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold cursor-pointer">Cancel</button>
            <button type="submit" className="px-6 py-2.5 rounded-2xl bg-brand-pink hover:bg-[#E00052] text-white font-black shadow-lg shadow-brand-pink/20 cursor-pointer">{campaign ? 'Update Campaign' : 'Save & Publish Campaign'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function WebsiteCMSAdmin() {
  const confirm = useConfirm();
  const [activeSubTab, setActiveSubTab] = useState('campaigns');

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);

  const [heroForm, setHeroForm] = useState(DEFAULT_HERO);
  const [announcementForm, setAnnouncementForm] = useState(DEFAULT_ANNOUNCEMENT);
  const [footerForm, setFooterForm] = useState(DEFAULT_FOOTER);
  const [policyForm, setPolicyForm] = useState(DEFAULT_POLICY as Record<string, unknown> & { faqs: Array<{ question: string; answer: string }>; apexRefund: Record<string, unknown>; guideSettings: Record<string, unknown> });

  const [productPrices, setProductPrices] = useState<Array<{ _id: string; name: string; brand?: string; originalPrice: number | string; sellingPrice: number | string; inStock: boolean }>>([]);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadCMSData = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      const [cRes, sRes, pRes] = await Promise.all([adminApi.campaigns(), adminApi.getWebsiteSettings(), adminApi.products()]);
      if (cRes.success) setCampaigns(Array.isArray(cRes.data) ? (cRes.data as Campaign[]) : []);
      if (sRes.success && sRes.data) {
        const data = sRes.data as WebsiteSettings;
        if (data.heroSettings) setHeroForm((prev) => ({ ...prev, ...data.heroSettings }));
        if (data.announcementSettings) setAnnouncementForm((prev) => ({ ...prev, ...(data.announcementSettings as typeof DEFAULT_ANNOUNCEMENT) }));
        if (data.footerSettings) setFooterForm((prev) => ({ ...prev, ...data.footerSettings }));
        if (data.policySettings) setPolicyForm((prev) => ({ ...prev, ...(data.policySettings as typeof DEFAULT_POLICY) }));
      }
      if (pRes.success) setProducts((pRes.data as Product[]) || []);
    } catch (err) {
      console.error('Failed to load CMS settings:', err);
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCMSData();
  }, [loadCMSData]);

  useEffect(() => {
    if (Array.isArray(products) && products.length > 0) {
      setProductPrices(
        products.map((p) => ({
          _id: p._id || p.id || '',
          name: p.name,
          brand: p.brand || p.provider,
          originalPrice: p.originalPrice || 0,
          sellingPrice: p.sellingPrice || 0,
          inStock: p.inStock !== false,
        }))
      );
    }
  }, [products]);

  const handleSaveHeroSettings = async () => {
    setSavingSettings(true);
    try {
      await adminApi.updateWebsiteSettings({ heroSettings: heroForm });
      notify.success('Hero slogans updated successfully!');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to update hero settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveAnnouncement = async () => {
    setSavingSettings(true);
    try {
      await adminApi.updateWebsiteSettings({ announcementSettings: announcementForm });
      notify.success('Announcement bar updated successfully!');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to update announcement bar');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveFooterSettings = async () => {
    setSavingSettings(true);
    try {
      await adminApi.updateWebsiteSettings({ footerSettings: footerForm });
      notify.success('Footer settings updated successfully!');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to update footer settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSavePolicySettings = async () => {
    setSavingSettings(true);
    try {
      await adminApi.updateWebsiteSettings({ policySettings: policyForm });
      notify.success('Policy and Guide settings updated successfully!');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to update policy settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleQuickPriceSave = async (prod: (typeof productPrices)[number]) => {
    // inStock was silently dropped by the backend (stock is voucher-inventory
    // derived) while the UI claimed success — only real fields are sent now.
    const res = await adminApi.quickUpdatePrice(prod._id, {
      originalPrice: Number(prod.originalPrice),
      sellingPrice: Number(prod.sellingPrice),
    });
    if (res.success) notify.success(`Updated price for ${prod.name}!`);
    else notify.error(res.message || `Failed to update price for ${prod.name}`);
  };

  const handleToggleCampaign = async (id: string) => {
    try {
      const res = await adminApi.toggleCampaign(id);
      if (res.success) setCampaigns((prev) => prev.map((c) => (c._id === id ? { ...c, status: String(res.status ?? '') as Campaign['status'] } : c)));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to toggle campaign status');
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!(await confirm({ title: 'Are you sure you want to delete this campaign?' }))) return;
    try {
      await adminApi.deleteCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to delete campaign');
    }
  };

  const handleSaveCampaignSubmit = async (campaignData: Record<string, unknown>) => {
    try {
      if (editingCampaign?._id) {
        const res = await adminApi.updateCampaign(editingCampaign._id, campaignData);
        if (res.success) setCampaigns((prev) => prev.map((c) => (c._id === editingCampaign._id ? (res.data as Campaign) : c)));
      } else {
        const res = await adminApi.createCampaign(campaignData);
        if (res.success) setCampaigns((prev) => [res.data as Campaign, ...prev]);
      }
      setIsCampaignModalOpen(false);
      setEditingCampaign(null);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to save campaign');
    }
  };

  const activeCampaign = campaigns.find((c) => c.status === 'ACTIVE' || c.status === 'SCHEDULED');

  const subTabs = [
    { id: 'campaigns', label: '🚀 Campaigns Manager', count: campaigns.length },
    { id: 'hero', label: '✍️ Hero Slogans & Copy' },
    { id: 'announcement', label: '⚡ Announcement Bar' },
    { id: 'prices', label: '💰 Voucher Price Controls' },
    { id: 'policies', label: '📜 Policy & Legal CMS' },
    { id: 'footer', label: '🛡️ Footer CMS' },
    { id: 'preview', label: '👁️ Live Homepage Preview' },
  ];

  const inputCls = 'w-full p-3 rounded-2xl border border-slate-200 dark:border-[#292929] bg-slate-50 dark:bg-[#1A1A1A] font-bold text-xs';
  const areaCls = 'w-full p-3 rounded-2xl border border-slate-200 dark:border-[#292929] bg-slate-50 dark:bg-[#1A1A1A] font-medium text-xs';
  const labelCls = 'block text-xs font-black text-slate-700 dark:text-slate-300 mb-1';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-[#121212] p-6 rounded-3xl border border-[#EAEAEA] dark:border-[#222] shadow-sm">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-pink/10 text-brand-pink font-black text-xs border border-brand-pink/20 mb-2">
            <Megaphone className="w-3.5 h-3.5" /> WEBSITE CONTENT &amp; CAMPAIGN CMS
          </span>
          <h1 className="font-heading font-black text-2xl text-slate-900 dark:text-white">Dynamic Marketing &amp; Pricing Management</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Control homepage slogans, festival offers, voucher prices, announcement bar, and footer content without code changes.</p>
        </div>
        <button onClick={loadCMSData} className="px-4 py-2.5 rounded-2xl bg-neutral-100 dark:bg-[#1A1A1A] hover:bg-neutral-200 dark:hover:bg-[#252525] font-black text-xs text-neutral-700 dark:text-neutral-200 inline-flex items-center gap-2 transition cursor-pointer">
          <RefreshCw className={`w-4 h-4 ${campaignsLoading ? 'animate-spin' : ''}`} /> Refresh CMS Data
        </button>
      </div>

      <div className="flex overflow-x-auto gap-2 p-1.5 bg-white dark:bg-[#121212] rounded-2xl border border-[#EAEAEA] dark:border-[#222]">
        {subTabs.map((sub) => (
          <button key={sub.id} onClick={() => setActiveSubTab(sub.id)} className={`px-4 py-2.5 rounded-xl font-black text-xs whitespace-nowrap transition flex items-center gap-2 cursor-pointer ${activeSubTab === sub.id ? 'bg-brand-pink text-white shadow-md' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#1D1D1D]'}`}>
            <span>{sub.label}</span>
            {sub.count !== undefined && <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black">{sub.count}</span>}
          </button>
        ))}
      </div>

      {activeSubTab === 'campaigns' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white dark:bg-[#121212] p-5 rounded-3xl border border-[#EAEAEA] dark:border-[#222]">
            <div>
              <h3 className="font-heading font-black text-lg text-slate-900 dark:text-white">Promotional Campaigns</h3>
              <p className="text-xs text-neutral-500 font-medium">Create festival sales (Independence Day, Diwali, New Year) with automatic start/end dates.</p>
            </div>
            <button onClick={() => { setEditingCampaign(null); setIsCampaignModalOpen(true); }} className="px-5 py-3 rounded-2xl bg-brand-pink hover:bg-[#E00052] text-white font-black text-xs shadow-lg shadow-brand-pink/20 inline-flex items-center gap-2 cursor-pointer transition">
              <Plus className="w-4 h-4" /> Create New Campaign
            </button>
          </div>

          <div className="bg-white dark:bg-[#121212] rounded-3xl border border-[#EAEAEA] dark:border-[#222] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-[#171717] border-b border-[#EAEAEA] dark:border-[#222] text-[11px] font-black text-neutral-500 uppercase tracking-wider">
                    <th className="p-4">Campaign Name</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Badge / Offer</th>
                    <th className="p-4">Discount</th>
                    <th className="p-4">Start - End Date</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA] dark:divide-[#222] text-xs font-semibold">
                  {campaigns.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-neutral-400 font-medium">No promotional campaigns created yet. Click <strong>&quot;Create New Campaign&quot;</strong> to launch your first sale.</td></tr>
                  ) : campaigns.map((c) => (
                    <tr key={c._id} className="hover:bg-neutral-50/50 dark:hover:bg-[#171717]/50">
                      <td className="p-4 font-black text-slate-900 dark:text-white">
                        <div>{c.name}</div>
                        <div className="text-[10px] text-neutral-400 font-medium">{c.title}</div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400' : c.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-400' : c.status === 'PAUSED' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}>{c.status}</span>
                      </td>
                      <td className="p-4"><span className="inline-flex items-center px-2 py-0.5 rounded bg-rose-50 text-brand-pink font-extrabold text-[10px] border border-rose-200">{c.badgeText || 'Offer'}</span></td>
                      <td className="p-4 font-black text-brand-pink">
                        {c.discountType === 'PERCENTAGE' ? `${c.discountValue}% OFF` : `₹${c.discountValue} OFF`}
                        {c.maxDiscount && c.maxDiscount > 0 && <div className="text-[10px] text-neutral-400 font-normal">Max: ₹{c.maxDiscount}</div>}
                      </td>
                      <td className="p-4 text-[11px] text-neutral-500">
                        <div>{c.startDate ? new Date(c.startDate).toLocaleDateString() : '—'}</div>
                        <div>to {c.endDate ? new Date(c.endDate).toLocaleDateString() : '—'}</div>
                      </td>
                      <td className="p-4 text-right space-x-2 whitespace-nowrap">
                        <button onClick={() => handleToggleCampaign(c._id)} className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition cursor-pointer ${c.status === 'ACTIVE' ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}>
                          {c.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                        </button>
                        <button onClick={() => { setEditingCampaign(c); setIsCampaignModalOpen(true); }} className="px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-black text-[11px] cursor-pointer">Edit</button>
                        <button onClick={() => handleDeleteCampaign(c._id)} className="px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 font-black text-[11px] cursor-pointer">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'hero' && (
        <div className="bg-white dark:bg-[#121212] p-6 rounded-3xl border border-[#EAEAEA] dark:border-[#222] space-y-6">
          <div>
            <h3 className="font-heading font-black text-lg text-slate-900 dark:text-white">Hero Slogan &amp; Subheading CMS</h3>
            <p className="text-xs text-neutral-500 font-medium">Edit main headline lines, highlighted brand text, and sub-text without touching code.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Headline Line 1</label>
              <input type="text" value={heroForm.headingLine1} onChange={(e) => setHeroForm({ ...heroForm, headingLine1: e.target.value })} className={inputCls} placeholder="Your Exam. Your Dream." />
            </div>
            <div>
              <label className={`${labelCls} text-brand-pink`}>Highlighted Heading (Pink)</label>
              <input type="text" value={heroForm.headingHighlight} onChange={(e) => setHeroForm({ ...heroForm, headingHighlight: e.target.value })} className="w-full p-3 rounded-2xl border border-brand-pink/40 bg-[#FFF0F5] dark:bg-[#2A0A17] font-black text-xs text-brand-pink" placeholder="Our Vouchers." />
            </div>
            <div>
              <label className={labelCls}>Headline Line 3</label>
              <input type="text" value={heroForm.headingLine3} onChange={(e) => setHeroForm({ ...heroForm, headingLine3: e.target.value })} className={inputCls} placeholder="Your Savings." />
            </div>
          </div>
          <div>
            <label className={labelCls}>Hero Subheading Description</label>
            <textarea rows={3} value={heroForm.descriptionText} onChange={(e) => setHeroForm({ ...heroForm, descriptionText: e.target.value })} className={areaCls} placeholder="Get official voucher codes for PTE, IELTS, TOEFL & Duolingo at the best prices..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Primary CTA Button Text</label>
              <input type="text" value={heroForm.ctaText} onChange={(e) => setHeroForm({ ...heroForm, ctaText: e.target.value })} className={inputCls} placeholder="Browse Vouchers" />
            </div>
            <div>
              <label className={labelCls}>Primary CTA Target Link</label>
              <input type="text" value={heroForm.ctaLink} onChange={(e) => setHeroForm({ ...heroForm, ctaLink: e.target.value })} className={inputCls} placeholder="/#vouchers" />
            </div>
          </div>
          <div className="pt-2 flex justify-end">
            <button onClick={handleSaveHeroSettings} disabled={savingSettings} className="px-6 py-3 rounded-2xl bg-brand-pink hover:bg-[#E00052] text-white font-black text-xs shadow-lg shadow-brand-pink/20 cursor-pointer transition flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Hero Slogans
            </button>
          </div>
        </div>
      )}

      {activeSubTab === 'announcement' && (
        <div className="bg-white dark:bg-[#121212] p-6 rounded-3xl border border-[#EAEAEA] dark:border-[#222] space-y-6">
          <div>
            <h3 className="font-heading font-black text-lg text-slate-900 dark:text-white">Top Announcement Bar CMS</h3>
            <p className="text-xs text-neutral-500 font-medium">Manage the top notice bar shown across every page of the website.</p>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#222]">
            <input type="checkbox" id="annEnabled" checked={!!announcementForm.enabled} onChange={(e) => setAnnouncementForm({ ...announcementForm, enabled: e.target.checked })} className="w-4 h-4 accent-brand-pink" />
            <label htmlFor="annEnabled" className="text-xs font-black text-slate-900 dark:text-white cursor-pointer">Enable Top Announcement Bar</label>
          </div>
          <div>
            <label className={labelCls}>Standard Announcement Text</label>
            <input type="text" value={(announcementForm.text as string) || ''} onChange={(e) => setAnnouncementForm({ ...announcementForm, text: e.target.value })} className={inputCls} placeholder="⚡ Instant Voucher Delivery in 10s • 100% Genuine Official Vouchers" />
          </div>
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50/50 dark:bg-[#2A0A17]/30 border border-brand-pink/20">
            <input type="checkbox" id="annOverride" checked={!!announcementForm.overrideWithCampaign} onChange={(e) => setAnnouncementForm({ ...announcementForm, overrideWithCampaign: e.target.checked })} className="w-4 h-4 accent-brand-pink" />
            <label htmlFor="annOverride" className="text-xs font-black text-brand-pink cursor-pointer">Automatically Override with Active Campaign Banner (e.g. 🇮🇳 Independence Day Sale — 50% OFF)</label>
          </div>
          <div className="pt-2 flex justify-end">
            <button onClick={handleSaveAnnouncement} disabled={savingSettings} className="px-6 py-3 rounded-2xl bg-brand-pink hover:bg-[#E00052] text-white font-black text-xs shadow-lg shadow-brand-pink/20 cursor-pointer transition flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Announcement Settings
            </button>
          </div>
        </div>
      )}

      {activeSubTab === 'prices' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white dark:bg-[#121212] p-5 rounded-3xl border border-[#EAEAEA] dark:border-[#222]">
            <div>
              <h3 className="font-heading font-black text-lg text-slate-900 dark:text-white">Voucher Pricing Quick Controls</h3>
              <p className="text-xs text-neutral-500 font-medium">Update MRP, selling prices, and stock availability instantly across all site pages.</p>
            </div>
          </div>
          <div className="bg-white dark:bg-[#121212] rounded-3xl border border-[#EAEAEA] dark:border-[#222] overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 dark:bg-[#171717] border-b border-[#EAEAEA] dark:border-[#222] text-[11px] font-black text-neutral-500 uppercase tracking-wider">
                  <th className="p-4">Voucher Name</th>
                  <th className="p-4">MRP (Original)</th>
                  <th className="p-4">Selling Price (Discounted)</th>
                  <th className="p-4">Savings</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA] dark:divide-[#222] text-xs font-semibold">
                {productPrices.map((prod, idx) => {
                  const mrp = Number(prod.originalPrice) || 0;
                  const sell = Number(prod.sellingPrice) || 0;
                  const savings = Math.max(0, mrp - sell);
                  const disc = mrp > 0 ? Math.round((savings / mrp) * 100) : 0;
                  return (
                    <tr key={prod._id} className="hover:bg-neutral-50/50 dark:hover:bg-[#171717]/50">
                      <td className="p-4 font-black text-slate-900 dark:text-white">
                        <div>{prod.name}</div>
                        <div className="text-[10px] text-neutral-400 font-medium">{prod.brand}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <span className="text-neutral-400 font-bold">₹</span>
                          <input type="number" value={prod.originalPrice} onChange={(e) => { const val = e.target.value; setProductPrices((prev) => prev.map((p, i) => (i === idx ? { ...p, originalPrice: val } : p))); }} className="w-24 p-2 rounded-xl border border-slate-200 dark:border-[#292929] bg-slate-50 dark:bg-[#1A1A1A] font-bold text-xs" />
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <span className="text-brand-pink font-black">₹</span>
                          <input type="number" value={prod.sellingPrice} onChange={(e) => { const val = e.target.value; setProductPrices((prev) => prev.map((p, i) => (i === idx ? { ...p, sellingPrice: val } : p))); }} className="w-24 p-2 rounded-xl border border-brand-pink/30 bg-rose-50/50 dark:bg-[#2A0A17]/30 font-black text-xs text-brand-pink" />
                        </div>
                      </td>
                      <td className="p-4 text-emerald-600 dark:text-emerald-400 font-black">Save ₹{savings.toLocaleString()} ({disc}%)</td>
                      <td className="p-4">
                        {/* Stock is derived from voucher inventory (Products &amp; Pricing) —
                            the old editable checkbox here was a silent no-op. */}
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black border ${prod.inStock ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400'}`}>
                          {prod.inStock ? 'IN STOCK' : 'NO INVENTORY'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button onClick={() => handleQuickPriceSave(prod)} className="px-4 py-2 rounded-xl bg-brand-pink hover:bg-[#E00052] text-white font-black text-xs shadow-md inline-flex items-center gap-1.5 cursor-pointer">
                          <Save className="w-3.5 h-3.5" /> Save Price
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'policies' && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-[#121212] p-6 rounded-3xl border border-[#EAEAEA] dark:border-[#222]">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-pink/10 text-brand-pink text-xs font-black uppercase">📜 Dynamic Legal &amp; Policy System</span>
              <h3 className="font-heading font-black text-xl text-slate-900 dark:text-white mt-1">Refund, Rescheduling, Voucher &amp; Legal Policies</h3>
              <p className="text-xs text-neutral-500 font-medium max-w-2xl">Configure Apex Vouchers refund terms, cancellation windows, Pearson rescheduling guide copy, live CTA banner, FAQ items, and non-affiliation disclaimers without modifying application code.</p>
            </div>
            <button onClick={handleSavePolicySettings} disabled={savingSettings} className="px-6 py-3 rounded-2xl bg-brand-pink hover:bg-[#E00052] text-white font-black text-xs shadow-lg shadow-brand-pink/20 cursor-pointer transition inline-flex items-center gap-2">
              <Save className="w-4 h-4" /> {savingSettings ? 'Saving Policies...' : 'Save All Policies'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Refund Policy', path: '/refund-policy' },
              { label: 'PTE Reschedule Guide', path: '/how-to-reschedule-cancel-pte-exam' },
              { label: 'Voucher Policy', path: '/voucher-refund-policy' },
              { label: 'Terms & Conditions', path: '/terms' },
              { label: 'Privacy Policy', path: '/privacy-policy' },
            ].map((p) => (
              <a key={p.path} href={p.path} target="_blank" rel="noopener noreferrer" className="p-3 rounded-2xl bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#262626] hover:border-brand-pink text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center justify-between transition group">
                <span className="truncate">{p.label}</span>
                <ExternalLink className="w-3.5 h-3.5 text-neutral-400 group-hover:text-brand-pink shrink-0" />
              </a>
            ))}
          </div>

          <div className="bg-white dark:bg-[#121212] p-6 sm:p-7 rounded-3xl border border-[#EAEAEA] dark:border-[#222] space-y-6">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] dark:border-[#222] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black"><ShieldCheck className="w-4 h-4" /></div>
                <div>
                  <h4 className="font-heading font-black text-base text-slate-900 dark:text-white">Apex Vouchers Refund &amp; Cancellation Rules</h4>
                  <p className="text-xs text-neutral-500 font-medium">Controls actual business terms rendered across all policy pages and trust sections.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Effective Date</label>
                <input type="date" value={(policyForm.apexRefund?.effectiveDate as string) || '2026-01-01'} onChange={(e) => setPolicyForm((prev) => ({ ...prev, apexRefund: { ...prev.apexRefund, effectiveDate: e.target.value } }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cancellation Window (Days)</label>
                <input type="number" value={(policyForm.apexRefund?.cancellationPeriodDays as number) ?? 7} onChange={(e) => setPolicyForm((prev) => ({ ...prev, apexRefund: { ...prev.apexRefund, cancellationPeriodDays: Number(e.target.value) } }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Refund Percentage (%)</label>
                <input type="number" value={(policyForm.apexRefund?.refundPercentage as number) ?? 100} onChange={(e) => setPolicyForm((prev) => ({ ...prev, apexRefund: { ...prev.apexRefund, refundPercentage: Number(e.target.value) } }))} className={`${inputCls} text-emerald-600 dark:text-emerald-400 font-mono`} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Refund Eligibility Statement</label>
              <textarea rows={2} value={(policyForm.apexRefund?.eligibilityCriteria as string) || ''} onChange={(e) => setPolicyForm((prev) => ({ ...prev, apexRefund: { ...prev.apexRefund, eligibilityCriteria: e.target.value } }))} className={areaCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Voucher Validity Term</label>
                <input type="text" value={(policyForm.apexRefund?.voucherValidityPeriod as string) || ''} onChange={(e) => setPolicyForm((prev) => ({ ...prev, apexRefund: { ...prev.apexRefund, voucherValidityPeriod: e.target.value } }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Refund Processing Turnaround Time</label>
                <input type="text" value={(policyForm.apexRefund?.refundProcessingTime as string) || ''} onChange={(e) => setPolicyForm((prev) => ({ ...prev, apexRefund: { ...prev.apexRefund, refundProcessingTime: e.target.value } }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Code Deactivation / Invalidation Rules</label>
                <textarea rows={2} value={(policyForm.apexRefund?.cancellationRules as string) || ''} onChange={(e) => setPolicyForm((prev) => ({ ...prev, apexRefund: { ...prev.apexRefund, cancellationRules: e.target.value } }))} className={areaCls} />
              </div>
              <div>
                <label className={labelCls}>Rescheduling Limitation Note</label>
                <textarea rows={2} value={(policyForm.apexRefund?.reschedulingRules as string) || ''} onChange={(e) => setPolicyForm((prev) => ({ ...prev, apexRefund: { ...prev.apexRefund, reschedulingRules: e.target.value } }))} className={areaCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Exceptional Circumstances (Medical/Emergencies)</label>
              <textarea rows={2} value={(policyForm.apexRefund?.exceptionalCircumstances as string) || ''} onChange={(e) => setPolicyForm((prev) => ({ ...prev, apexRefund: { ...prev.apexRefund, exceptionalCircumstances: e.target.value } }))} className={areaCls} />
            </div>
          </div>

          <div className="bg-white dark:bg-[#121212] p-6 sm:p-7 rounded-3xl border border-[#EAEAEA] dark:border-[#222] space-y-6">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] dark:border-[#222] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-brand-pink/10 text-brand-pink flex items-center justify-center font-black"><FileText className="w-4 h-4" /></div>
                <div>
                  <h4 className="font-heading font-black text-base text-slate-900 dark:text-white">PTE Rescheduling Guide &amp; CTA Controls</h4>
                  <p className="text-xs text-neutral-500 font-medium">Customize article headings, bottom CTA text, link target, and non-affiliation disclaimer.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Guide Main H1 Title</label>
                <input type="text" value={(policyForm.guideSettings?.pageTitle as string) || ''} onChange={(e) => setPolicyForm((prev) => ({ ...prev, guideSettings: { ...prev.guideSettings, pageTitle: e.target.value } }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Guide Subtitle</label>
                <input type="text" value={(policyForm.guideSettings?.subtitle as string) || ''} onChange={(e) => setPolicyForm((prev) => ({ ...prev, guideSettings: { ...prev.guideSettings, subtitle: e.target.value } }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>CTA Heading Title</label>
                <input type="text" value={(policyForm.guideSettings?.ctaTitle as string) || ''} onChange={(e) => setPolicyForm((prev) => ({ ...prev, guideSettings: { ...prev.guideSettings, ctaTitle: e.target.value } }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>CTA Subtitle Copy</label>
                <input type="text" value={(policyForm.guideSettings?.ctaSubtitle as string) || ''} onChange={(e) => setPolicyForm((prev) => ({ ...prev, guideSettings: { ...prev.guideSettings, ctaSubtitle: e.target.value } }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>CTA Button Text</label>
                <input type="text" value={(policyForm.guideSettings?.ctaButtonText as string) || 'BUY PTE VOUCHER ONLINE'} onChange={(e) => setPolicyForm((prev) => ({ ...prev, guideSettings: { ...prev.guideSettings, ctaButtonText: e.target.value } }))} className={`${inputCls} border-brand-pink/30 bg-rose-50/50 dark:bg-[#2A0A17]/30 font-black text-brand-pink`} />
              </div>
              <div>
                <label className={labelCls}>CTA Target URL</label>
                <input type="text" value={(policyForm.guideSettings?.ctaButtonLink as string) || 'https://apexvouchers.com/'} onChange={(e) => setPolicyForm((prev) => ({ ...prev, guideSettings: { ...prev.guideSettings, ctaButtonLink: e.target.value } }))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Official Non-Affiliation Disclaimer</label>
              <textarea rows={3} value={(policyForm.guideSettings?.disclaimerText as string) || ''} onChange={(e) => setPolicyForm((prev) => ({ ...prev, guideSettings: { ...prev.guideSettings, disclaimerText: e.target.value } }))} className={areaCls} />
            </div>
          </div>

          <div className="bg-white dark:bg-[#121212] p-6 sm:p-7 rounded-3xl border border-[#EAEAEA] dark:border-[#222] space-y-6">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] dark:border-[#222] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-black"><HelpCircle className="w-4 h-4" /></div>
                <div>
                  <h4 className="font-heading font-black text-base text-slate-900 dark:text-white">PTE Rescheduling &amp; Cancellation FAQs</h4>
                  <p className="text-xs text-neutral-500 font-medium">Add, update, or remove question and answer items shown in the guide.</p>
                </div>
              </div>
              <button type="button" onClick={() => setPolicyForm((prev) => ({ ...prev, faqs: [...prev.faqs, { question: 'New Question?', answer: 'Detailed helpful answer.' }] }))} className="px-3.5 py-2 rounded-xl bg-neutral-100 dark:bg-[#202020] hover:bg-neutral-200 dark:hover:bg-[#2A2A2A] text-xs font-black text-neutral-800 dark:text-neutral-200 inline-flex items-center gap-1.5 cursor-pointer">
                <Plus className="w-3.5 h-3.5 text-brand-pink" /> Add FAQ Item
              </button>
            </div>
            <div className="space-y-4">
              {policyForm.faqs.map((faq, fIdx) => (
                <div key={fIdx} className="p-4 rounded-2xl bg-[#FAF8F5] dark:bg-[#181818] border border-[#EAEAEA] dark:border-[#282828] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-neutral-400 uppercase">Question #{fIdx + 1}</span>
                    <button type="button" onClick={() => setPolicyForm((prev) => ({ ...prev, faqs: prev.faqs.filter((_, idx) => idx !== fIdx) }))} className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold cursor-pointer" title="Delete question"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <input type="text" value={faq.question} onChange={(e) => { const val = e.target.value; setPolicyForm((prev) => ({ ...prev, faqs: prev.faqs.map((f, i) => (i === fIdx ? { ...f, question: val } : f)) })); }} className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#141414] font-bold text-xs" placeholder="Enter question" />
                  <textarea rows={2} value={faq.answer} onChange={(e) => { const val = e.target.value; setPolicyForm((prev) => ({ ...prev, faqs: prev.faqs.map((f, i) => (i === fIdx ? { ...f, answer: val } : f)) })); }} className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#141414] font-medium text-xs text-neutral-600 dark:text-neutral-300" placeholder="Enter answer" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'footer' && (
        <div className="bg-white dark:bg-[#121212] p-6 rounded-3xl border border-[#EAEAEA] dark:border-[#222] space-y-6">
          <div>
            <h3 className="font-heading font-black text-lg text-slate-900 dark:text-white">Footer Content Management</h3>
            <p className="text-xs text-neutral-500 font-medium">Update footer address, support phone, support email, and copyright text.</p>
          </div>
          <div>
            <label className={labelCls}>Physical Address</label>
            <input type="text" value={footerForm.address ?? ''} onChange={(e) => setFooterForm({ ...footerForm, address: e.target.value })} className={inputCls} placeholder="near ROSHAN LAL SHOWROOM, Badhni Kalan, Punjab 142037" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Support Phone Number</label>
              <input type="text" value={footerForm.phone} onChange={(e) => setFooterForm({ ...footerForm, phone: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Support Email Address</label>
              <input type="text" value={footerForm.email} onChange={(e) => setFooterForm({ ...footerForm, email: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Copyright Line</label>
            <input type="text" value={footerForm.copyright} onChange={(e) => setFooterForm({ ...footerForm, copyright: e.target.value })} className={inputCls} />
          </div>
          <div className="pt-2 flex justify-end">
            <button onClick={handleSaveFooterSettings} disabled={savingSettings} className="px-6 py-3 rounded-2xl bg-brand-pink hover:bg-[#E00052] text-white font-black text-xs shadow-lg shadow-brand-pink/20 cursor-pointer transition flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Footer Settings
            </button>
          </div>
        </div>
      )}

      {activeSubTab === 'preview' && (
        <div className="bg-white dark:bg-[#121212] p-6 rounded-3xl border border-[#EAEAEA] dark:border-[#222] space-y-6">
          <div>
            <h3 className="font-heading font-black text-lg text-slate-900 dark:text-white">Live Campaign &amp; Hero Preview</h3>
            <p className="text-xs text-neutral-500 font-medium">This shows how your campaign and slogans will render to visitors on the homepage.</p>
          </div>
          <div className="p-6 rounded-3xl bg-slate-50 dark:bg-[#06070B] border border-slate-200/80 dark:border-[#292929] space-y-6">
            {activeCampaign ? (
              <div className="p-5 rounded-3xl bg-linear-to-r from-[#FFF0F5] via-rose-50 to-pink-50 dark:from-[#2A0A17] dark:via-[#1F0811] dark:to-[#16050B] border border-brand-pink/30 shadow-lg space-y-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-brand-pink text-white font-black text-xs uppercase">{activeCampaign.badgeText || '🇮🇳 CAMPAIGN ACTIVE'}</span>
                <h4 className="text-2xl font-black text-slate-900 dark:text-white">{activeCampaign.title}</h4>
                <p className="text-sm font-bold text-brand-pink">{activeCampaign.subtitle}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{activeCampaign.description}</p>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FFF0F5] border border-brand-pink/20 text-xs font-black text-brand-pink">🎟️ Save on Exam Fees with Apex Vouchers</div>
            )}
            {/* A visual preview of the customer hero, not a document heading —
                a real <h1> here would outrank the page's own title. */}
            <div className="font-heading font-black text-3xl sm:text-4xl text-slate-900 dark:text-white leading-tight">
              {heroForm.headingLine1} <br />
              <span className="text-brand-pink">{heroForm.headingHighlight}</span> <br />
              {heroForm.headingLine3}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium max-w-xl">{heroForm.descriptionText}</p>
            {/* Preview chrome, not an admin action — kept out of the tab order
                so it never reads as a clickable control that does nothing. */}
            <span aria-hidden="true" className="inline-block px-6 py-3 rounded-full bg-brand-pink text-white font-black text-xs shadow-lg select-none">
              {activeCampaign?.ctaText || heroForm.ctaText || 'Browse Vouchers'}
            </span>
          </div>
        </div>
      )}

      {isCampaignModalOpen && (
        <CampaignFormModal
          campaign={editingCampaign}
          products={products}
          onClose={() => { setIsCampaignModalOpen(false); setEditingCampaign(null); }}
          onSave={handleSaveCampaignSubmit}
        />
      )}
    </div>
  );
}