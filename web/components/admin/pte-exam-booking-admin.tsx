'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  GraduationCap, Plus, Search, RefreshCw, Edit2, Trash2, CheckCircle2,
  XCircle, AlertTriangle, Eye, EyeOff, Sparkles, Upload, Image as ImageIcon,
  Settings2, ExternalLink, Save, ArrowUpDown, Tag, Check, IndianRupee,
  Layers, Clock, ShieldCheck, Calendar, Headphones, FileText, ChevronRight, X
} from 'lucide-react';
import { pteBookingAdminApi } from '@/lib/pte-booking-api';
import { adminApi, formatPrice } from '@/lib/api';
import { StatCard, Pill, Th, Td, Empty } from '@/components/admin/admin-ui';
import { notify } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/use-confirm';
import type {
  AdminPTEBookingProduct,
  AdminPTEBookingConfig,
  PTEBookingPageContent,
  PTEBookingFeature,
} from '@/lib/types';

const DEFAULT_FEATURES: PTEBookingFeature[] = [
  { text: 'Exam booking arranged for you', enabled: true },
  { text: 'Choose preferred test centre', enabled: true },
  { text: 'Choose preferred available date', enabled: true },
  { text: 'Booking confirmation provided', enabled: true },
  { text: 'Human support throughout the process', enabled: true },
];

export function PTEExamBookingAdmin() {
  const confirm = useConfirm();

  // Product catalog state
  const [products, setProducts] = useState<AdminPTEBookingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');

  // Page CMS config state
  const [pageConfig, setPageConfig] = useState<AdminPTEBookingConfig | null>(null);
  const [cmsModalOpen, setCmsModalOpen] = useState(false);
  const [cmsSaving, setCmsSaving] = useState(false);
  const [cmsForm, setCmsForm] = useState<PTEBookingPageContent>({});

  // Product editor modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminPTEBookingProduct | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Quick inline price edit state
  const [quickPriceId, setQuickPriceId] = useState<string | null>(null);
  const [quickPriceVal, setQuickPriceVal] = useState<number>(0);
  const [quickStandardVal, setQuickStandardVal] = useState<number>(0);

  // Form fields for editing/creating
  const [formName, setFormName] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formServiceLabel, setFormServiceLabel] = useState('EXAM BOOKING SERVICE');
  const [formDescription, setFormDescription] = useState('');
  const [formBadgeText, setFormBadgeText] = useState('');
  const [formBadgeTint, setFormBadgeTint] = useState('#FF005C');
  const [formBookingPrice, setFormBookingPrice] = useState<number>(14999);
  const [formStandardPrice, setFormStandardPrice] = useState<number>(18900);
  const [formShowStandardPrice, setFormShowStandardPrice] = useState(true);
  const [formShowSavingsBadge, setFormShowSavingsBadge] = useState(true);
  const [formFeatures, setFormFeatures] = useState<PTEBookingFeature[]>(DEFAULT_FEATURES);
  const [formImage, setFormImage] = useState('');
  const [formImageAlt, setFormImageAlt] = useState('');
  const [formButtonText, setFormButtonText] = useState('Book Now');
  const [formButtonVisible, setFormButtonVisible] = useState(true);
  const [formButtonEnabled, setFormButtonEnabled] = useState(true);
  const [formDisplayOrder, setFormDisplayOrder] = useState(1);
  const [formActive, setFormActive] = useState(true);
  const [formStatus, setFormStatus] = useState<'draft' | 'published'>('published');
  const [newFeatureText, setNewFeatureText] = useState('');
  const [activeTabInModal, setActiveTabInModal] = useState<'details' | 'features' | 'audit'>('details');

  // Load all products and page config
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [prodRes, cfgRes] = await Promise.all([
        pteBookingAdminApi.list(),
        pteBookingAdminApi.getConfig(),
      ]);

      if (prodRes && prodRes.success !== false) {
        setProducts((prodRes.data as AdminPTEBookingProduct[]) || []);
      } else {
        setLoadError((prodRes?.message as string) || 'Failed to load booking products');
      }

      if (cfgRes && cfgRes.success !== false) {
        setPageConfig(cfgRes.data as AdminPTEBookingConfig);
        if (cfgRes.data && (cfgRes.data as AdminPTEBookingConfig).content) {
          setCmsForm((cfgRes.data as AdminPTEBookingConfig).content || {});
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error connecting to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived filter list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q) ||
        (p.shortDescription || '').toLowerCase().includes(q) ||
        (p.badgeText || '').toLowerCase().includes(q)
      );
    });
  }, [products, search, statusFilter]);

  // Open editor for creating
  const handleStartCreate = () => {
    setIsCreating(true);
    setEditingProduct(null);
    setFormName('');
    setFormKey('');
    setFormServiceLabel('EXAM BOOKING SERVICE');
    setFormDescription('');
    setFormBadgeText('');
    setFormBadgeTint('#FF005C');
    setFormBookingPrice(14999);
    setFormStandardPrice(18900);
    setFormShowStandardPrice(true);
    setFormShowSavingsBadge(true);
    setFormFeatures(DEFAULT_FEATURES);
    setFormImage('');
    setFormImageAlt('');
    setFormButtonText('Book Now');
    setFormButtonVisible(true);
    setFormButtonEnabled(true);
    setFormDisplayOrder(products.length + 1);
    setFormActive(true);
    setFormStatus('published');
    setActiveTabInModal('details');
    setEditorOpen(true);
  };

  // Open editor for modifying existing product
  const handleStartEdit = (p: AdminPTEBookingProduct) => {
    setIsCreating(false);
    setEditingProduct(p);
    setFormName(p.name || '');
    setFormKey(p.key || '');
    setFormServiceLabel(p.serviceLabel || 'EXAM BOOKING SERVICE');
    setFormDescription(p.shortDescription || '');
    setFormBadgeText(p.badgeText || '');
    setFormBadgeTint(p.badgeTint || '#FF005C');
    setFormBookingPrice(Number(p.pricing?.bookingPrice) || 0);
    setFormStandardPrice(Number(p.pricing?.standardPrice) || 0);
    setFormShowStandardPrice(p.pricing?.showStandardPrice !== false);
    setFormShowSavingsBadge(p.pricing?.showSavingsBadge !== false);
    setFormFeatures(p.features && p.features.length > 0 ? p.features : DEFAULT_FEATURES);
    setFormImage(p.image || '');
    setFormImageAlt(p.imageAlt || `${p.name} exam booking service`);
    setFormButtonText(p.button?.text || 'Book Now');
    setFormButtonVisible(p.button?.visible !== false);
    setFormButtonEnabled(p.button?.enabled !== false);
    setFormDisplayOrder(p.displayOrder || 1);
    setFormActive(p.active !== false);
    setFormStatus(p.status || 'published');
    setActiveTabInModal('details');
    setEditorOpen(true);
  };

  // Save product (create or update)
  const handleSaveProduct = async (overrideStatus?: 'draft' | 'published') => {
    if (!formName.trim()) {
      notify.error('Product name is required');
      return;
    }
    const cleanKey = (formKey || formName)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!cleanKey) {
      notify.error('Unique key is required');
      return;
    }

    if (formBookingPrice < 0 || isNaN(formBookingPrice)) {
      notify.error('Special booking price must be a valid number');
      return;
    }

    setEditorSaving(true);
    const targetStatus = overrideStatus || formStatus;

    const payload = {
      name: formName.trim(),
      key: cleanKey,
      serviceLabel: formServiceLabel.trim() || 'EXAM BOOKING SERVICE',
      shortDescription: formDescription.trim(),
      badgeText: formBadgeText.trim(),
      badgeTint: formBadgeTint || '#FF005C',
      pricing: {
        bookingPrice: Number(formBookingPrice),
        standardPrice: Number(formStandardPrice) || 0,
        currency: 'INR',
        showStandardPrice: formShowStandardPrice,
        showSavingsBadge: formShowSavingsBadge,
      },
      features: formFeatures.filter((f) => f && f.text.trim()),
      image: formImage.trim(),
      imageAlt: formImageAlt.trim() || `${formName.trim()} exam booking`,
      button: {
        text: formButtonText.trim() || 'Book Now',
        href: '',
        visible: formButtonVisible,
        enabled: formButtonEnabled,
      },
      displayOrder: Number(formDisplayOrder) || 1,
      active: formActive,
      status: targetStatus,
    };

    try {
      let res;
      if (isCreating) {
        res = await pteBookingAdminApi.create(payload);
      } else if (editingProduct) {
        res = await pteBookingAdminApi.update(editingProduct._id, payload);
      }

      if (res && res.success !== false) {
        notify.success(isCreating ? 'Booking product created successfully!' : 'Booking product updated successfully!');
        setEditorOpen(false);
        // Bust frontend cache tags
        adminApi.revalidatePublicProducts(['pte-academic', 'pte-core', 'pte-ukvi']);
        loadData();
      } else {
        notify.error((res?.message as string) || 'Failed to save product');
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setEditorSaving(false);
    }
  };

  // Quick inline price update
  const handleQuickPriceSave = async (id: string) => {
    if (quickPriceVal < 0 || isNaN(quickPriceVal)) {
      notify.error('Invalid booking price');
      return;
    }
    try {
      const res = await pteBookingAdminApi.update(id, {
        pricing: {
          bookingPrice: quickPriceVal,
          standardPrice: quickStandardVal,
        },
      });
      if (res && res.success !== false) {
        notify.success('Price updated successfully!');
        setQuickPriceId(null);
        adminApi.revalidatePublicProducts();
        loadData();
      } else {
        notify.error((res?.message as string) || 'Failed to update price');
      }
    } catch {
      notify.error('Failed to update price');
    }
  };

  // Quick active toggle
  const handleToggleActive = async (p: AdminPTEBookingProduct) => {
    const nextState = !p.active;
    try {
      const res = await pteBookingAdminApi.update(p._id, { active: nextState });
      if (res && res.success !== false) {
        notify.success(`${p.name} is now ${nextState ? 'Active' : 'Inactive'}`);
        adminApi.revalidatePublicProducts();
        loadData();
      } else {
        notify.error((res?.message as string) || 'Failed to update status');
      }
    } catch {
      notify.error('Failed to update status');
    }
  };

  // Quick publish/unpublish toggle
  const handleTogglePublish = async (p: AdminPTEBookingProduct) => {
    const isPub = p.status === 'published';
    try {
      const res = isPub
        ? await pteBookingAdminApi.unpublish(p._id)
        : await pteBookingAdminApi.publish(p._id);
      if (res && res.success !== false) {
        notify.success(`${p.name} ${isPub ? 'unpublished (Draft)' : 'published (Live)'}`);
        adminApi.revalidatePublicProducts();
        loadData();
      } else {
        notify.error((res?.message as string) || 'Failed to toggle publication');
      }
    } catch {
      notify.error('Failed to toggle publication');
    }
  };

  // Delete product
  const handleDeleteProduct = async (p: AdminPTEBookingProduct) => {
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      body: p.status === 'published' && p.active
        ? `This product is currently LIVE. Deleting it will first deactivate it to keep customer order history safe.`
        : `Are you sure you want to permanently delete "${p.name}"? This action cannot be undone.`,
      confirmLabel: 'Yes, Delete',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      const res = await pteBookingAdminApi.remove(p._id);
      if (res && res.success !== false) {
        notify.success((res.message as string) || 'Product removed');
        adminApi.revalidatePublicProducts();
        loadData();
      } else {
        notify.error((res?.message as string) || 'Failed to delete');
      }
    } catch {
      notify.error('Failed to delete');
    }
  };

  // Image file upload
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const res = await pteBookingAdminApi.uploadImage(file);
      if (res.success && res.url) {
        setFormImage(res.url);
        notify.success('Image uploaded successfully!');
      } else {
        notify.error(res.message || 'Image upload failed');
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  // Feature add/toggle/remove
  const handleAddFeature = () => {
    if (!newFeatureText.trim()) return;
    setFormFeatures((prev) => [...prev, { text: newFeatureText.trim(), enabled: true }]);
    setNewFeatureText('');
  };

  const handleToggleFeature = (index: number) => {
    setFormFeatures((prev) =>
      prev.map((f, i) => (i === index ? { ...f, enabled: !f.enabled } : f))
    );
  };

  const handleRemoveFeature = (index: number) => {
    setFormFeatures((prev) => prev.filter((_, i) => i !== index));
  };

  // Save Page CMS Content
  const handleSaveCmsConfig = async (status: 'draft' | 'published') => {
    setCmsSaving(true);
    try {
      const res = await pteBookingAdminApi.updateConfig({
        content: cmsForm,
        status,
      });
      if (res && res.success !== false) {
        notify.success(`Page storefront content saved as ${status}!`);
        setCmsModalOpen(false);
        adminApi.revalidatePublicProducts();
        loadData();
      } else {
        notify.error((res?.message as string) || 'Failed to save storefront configuration');
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setCmsSaving(false);
    }
  };

  // Live calculated savings
  const computedSavings = Math.max(0, formStandardPrice - formBookingPrice);
  const computedDiscount =
    formStandardPrice > 0 && computedSavings > 0
      ? Number(((computedSavings / formStandardPrice) * 100).toFixed(1))
      : 0;

  // KPIs
  const activeCount = products.filter((p) => p.status === 'published' && p.active).length;
  const avgPrice =
    products.length > 0
      ? Math.round(
          products.reduce((acc, p) => acc + (Number(p.pricing?.bookingPrice) || 0), 0) /
            products.length
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-brand-pink/10 text-brand-pink dark:bg-brand-pink/20">
              <GraduationCap className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-heading font-black tracking-tight text-neutral-900 dark:text-white">
              PTE Exam Booking
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              Dedicated Service
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 font-medium">
            Manage PTE exam-booking services, live special booking prices, features, and public storefront content.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/exam-booking"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#EAEAEA] dark:border-[#262626] bg-white dark:bg-[#141414] hover:border-brand-pink text-xs font-bold text-neutral-700 dark:text-neutral-200 transition-colors shadow-xs"
          >
            <ExternalLink className="w-3.5 h-3.5 text-brand-pink" />
            <span>Storefront View</span>
          </Link>

          <button
            onClick={() => setCmsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#EAEAEA] dark:border-[#262626] bg-white dark:bg-[#141414] hover:border-brand-pink text-xs font-bold text-neutral-700 dark:text-neutral-200 transition-colors shadow-xs cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>Page CMS</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl border border-[#EAEAEA] dark:border-[#262626] bg-white dark:bg-[#141414] hover:bg-neutral-50 dark:hover:bg-[#1c1c1c] text-neutral-600 dark:text-neutral-300 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-pink' : ''}`} />
          </button>

          <button
            onClick={handleStartCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-pink hover:bg-[#E00052] text-white text-xs font-black shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={3} />
            <span>Add Booking Service</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Booking Services"
          value={products.length}
          sub="Managed booking products"
          icon={<Layers className="w-4 h-4" />}
          tint="#FF005C"
        />
        <StatCard
          label="Live & Active on Store"
          value={activeCount}
          sub={`of ${products.length} total services`}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          tint="#10B981"
        />
        <StatCard
          label="Average Booking Price"
          value={formatPrice(avgPrice)}
          sub="Dynamic booking charge"
          icon={<IndianRupee className="w-4 h-4 text-purple-500" />}
          tint="#8B5CF6"
        />
        <StatCard
          label="Storefront CMS Status"
          value={pageConfig?.status === 'published' ? 'Published' : 'Draft'}
          sub="Hero, notice & trust bar"
          icon={<Sparkles className="w-4 h-4 text-brand-pink" />}
          tint="#FF005C"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#121212] p-3.5 rounded-2xl border border-[#EAEAEA] dark:border-[#222] shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search booking services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9.5 pr-4 py-2 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] text-xs font-bold text-neutral-900 dark:text-white placeholder:text-neutral-400 outline-none focus:border-brand-pink"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="inline-flex rounded-xl bg-neutral-100 dark:bg-[#1E1E1E] p-1 border border-[#EAEAEA] dark:border-[#2A2A2A]">
            {(['all', 'published', 'draft'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1 text-xs font-black rounded-lg capitalize transition-colors cursor-pointer ${
                  statusFilter === filter
                    ? 'bg-white dark:bg-[#121212] text-brand-pink shadow-xs'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Services Table */}
      <div className="bg-white dark:bg-[#121212] rounded-3xl border border-[#EAEAEA] dark:border-[#222] overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-brand-pink mx-auto mb-2" />
            <p className="text-xs font-bold text-neutral-400">Loading PTE Exam Booking catalog...</p>
          </div>
        ) : loadError ? (
          <div className="py-16 text-center text-rose-500">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm font-black">{loadError}</p>
            <button
              onClick={loadData}
              className="mt-3 px-4 py-1.5 text-xs font-bold rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300"
            >
              Retry
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center">
            <Empty
              title="No PTE Exam Booking products found"
              desc={search ? 'Try clearing your search query' : 'Get started by adding your first booking service.'}
            />
            <button
              onClick={handleStartCreate}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-pink text-white text-xs font-black shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Booking Service
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#EAEAEA] dark:border-[#222] bg-neutral-50/50 dark:bg-[#181818]/50">
                  <Th>Service</Th>
                  <Th className="text-right">Special Booking Price</Th>
                  <Th className="text-right">Standard Exam Price</Th>
                  <Th className="text-right">Savings &amp; Discount</Th>
                  <Th className="text-center">Active</Th>
                  <Th className="text-center">Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA] dark:divide-[#222]">
                {filteredProducts.map((p) => {
                  const bPrice = Number(p.pricing?.bookingPrice) || 0;
                  const sPrice = Number(p.pricing?.standardPrice) || 0;
                  const savings = Math.max(0, sPrice - bPrice);
                  const discountPct = sPrice > 0 && savings > 0 ? ((savings / sPrice) * 100).toFixed(1) : null;
                  const isQuickEditing = quickPriceId === p._id;

                  return (
                    <tr
                      key={p._id}
                      className="hover:bg-neutral-50/70 dark:hover:bg-[#181818]/60 transition-colors"
                    >
                      {/* Service Info */}
                      <Td>
                        <div className="flex items-center gap-3.5">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-neutral-100 dark:bg-[#1C1C1C] border border-[#EAEAEA] dark:border-[#282828] relative shrink-0 flex items-center justify-center">
                            {p.image ? (
                              <Image
                                src={p.image}
                                alt={p.imageAlt || p.name}
                                fill
                                sizes="48px"
                                className="object-cover"
                              />
                            ) : (
                              <GraduationCap className="w-5 h-5 text-brand-pink/70" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-heading font-black text-sm text-neutral-900 dark:text-white">
                                {p.name}
                              </span>
                              {p.badgeText && (
                                <span
                                  className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white"
                                  style={{ backgroundColor: p.badgeTint || '#FF005C' }}
                                >
                                  {p.badgeText}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-[#202020] text-neutral-600 dark:text-neutral-300">
                                {p.key}
                              </span>
                              <span>•</span>
                              <span className="font-bold text-[#FF005C] uppercase tracking-wider text-[10px]">
                                {p.serviceLabel || 'EXAM BOOKING SERVICE'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Td>

                      {/* Special Booking Price (Dynamic) */}
                      <Td className="text-right">
                        {isQuickEditing ? (
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              value={quickPriceVal}
                              onChange={(e) => setQuickPriceVal(Number(e.target.value))}
                              className="w-24 px-2 py-1 rounded-lg border border-brand-pink bg-white dark:bg-[#181818] text-right font-black text-xs outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handleQuickPriceSave(p._id)}
                              className="p-1 rounded-md bg-brand-pink text-white hover:bg-[#E00052]"
                              title="Save Price"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setQuickPriceId(null)}
                              className="p-1 rounded-md bg-neutral-200 dark:bg-[#2A2A2A] text-neutral-600 dark:text-neutral-300"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="group inline-flex items-center justify-end gap-1.5">
                            <span className="font-heading font-black text-sm text-neutral-900 dark:text-white tabular-nums">
                              {formatPrice(bPrice)}
                            </span>
                            <button
                              onClick={() => {
                                setQuickPriceId(p._id);
                                setQuickPriceVal(bPrice);
                                setQuickStandardVal(sPrice);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-brand-pink transition-opacity"
                              title="Quick edit price"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </Td>

                      {/* Standard Exam Price */}
                      <Td className="text-right font-bold text-neutral-500 dark:text-neutral-400 tabular-nums">
                        {sPrice > 0 ? (
                          <span className="line-through text-neutral-400 dark:text-neutral-500">
                            {formatPrice(sPrice)}
                          </span>
                        ) : (
                          <span className="text-neutral-300 dark:text-neutral-600">—</span>
                        )}
                      </Td>

                      {/* Savings & Discount */}
                      <Td className="text-right">
                        {savings > 0 && discountPct ? (
                          <div className="inline-flex flex-col items-end">
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-black text-xs">
                              Save {formatPrice(savings)}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700/80 dark:text-emerald-500">
                              ({discountPct}% off)
                            </span>
                          </div>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-600">—</span>
                        )}
                      </Td>

                      {/* Active Status Toggle */}
                      <Td className="text-center">
                        <button
                          onClick={() => handleToggleActive(p)}
                          className="inline-flex items-center cursor-pointer transition-transform hover:scale-105"
                          title={p.active ? 'Click to deactivate' : 'Click to activate'}
                        >
                          <Pill text={p.active ? 'Active' : 'Inactive'} tint={p.active ? 'emerald' : 'neutral'} />
                        </button>
                      </Td>

                      {/* Publication Status Toggle */}
                      <Td className="text-center">
                        <button
                          onClick={() => handleTogglePublish(p)}
                          className="inline-flex items-center cursor-pointer transition-transform hover:scale-105"
                          title={p.status === 'published' ? 'Click to unpublish (Draft)' : 'Click to publish (Live)'}
                        >
                          <Pill text={p.status === 'published' ? 'Published' : 'Draft'} tint={p.status === 'published' ? 'pink' : 'amber'} />
                        </button>
                      </Td>

                      {/* Actions */}
                      <Td className="text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => handleStartEdit(p)}
                            className="p-1.5 rounded-lg border border-[#EAEAEA] dark:border-[#262626] hover:border-brand-pink text-neutral-600 dark:text-neutral-300 hover:text-brand-pink transition-colors cursor-pointer"
                            title="Full Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteProduct(p)}
                            className="p-1.5 rounded-lg border border-[#EAEAEA] dark:border-[#262626] hover:border-rose-500 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete or Deactivate"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =========================================================================
          FULL PRODUCT EDITOR MODAL
      ========================================================================== */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-[#121212] rounded-3xl border border-[#EAEAEA] dark:border-[#262626] shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#EAEAEA] dark:border-[#222] flex items-center justify-between bg-neutral-50/50 dark:bg-[#161616]">
              <div>
                <h2 className="text-lg font-heading font-black text-neutral-900 dark:text-white flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-brand-pink" />
                  {isCreating ? 'Add PTE Exam Booking Service' : `Edit: ${formName || 'Booking Service'}`}
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Changes save to database and immediately power the live booking catalog and cart.
                </p>
              </div>

              <button
                onClick={() => setEditorOpen(false)}
                className="p-2 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#202020] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="px-6 border-b border-[#EAEAEA] dark:border-[#222] flex gap-4 bg-neutral-50/20 dark:bg-[#141414]">
              <button
                onClick={() => setActiveTabInModal('details')}
                className={`py-3 text-xs font-black border-b-2 transition-colors cursor-pointer ${
                  activeTabInModal === 'details'
                    ? 'border-brand-pink text-brand-pink'
                    : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                Service &amp; Pricing Details
              </button>
              <button
                onClick={() => setActiveTabInModal('features')}
                className={`py-3 text-xs font-black border-b-2 transition-colors cursor-pointer ${
                  activeTabInModal === 'features'
                    ? 'border-brand-pink text-brand-pink'
                    : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                Features Checklist ({formFeatures.length})
              </button>
              {!isCreating && editingProduct?.auditHistory && editingProduct.auditHistory.length > 0 && (
                <button
                  onClick={() => setActiveTabInModal('audit')}
                  className={`py-3 text-xs font-black border-b-2 transition-colors cursor-pointer ${
                    activeTabInModal === 'audit'
                      ? 'border-brand-pink text-brand-pink'
                      : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                  }`}
                >
                  Audit History ({editingProduct.auditHistory.length})
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {activeTabInModal === 'details' && (
                <>
                  {/* Identity */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                        Product Name <span className="text-brand-pink">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. PTE Academic"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] text-xs font-bold text-neutral-900 dark:text-white outline-none focus:border-brand-pink"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                        Unique Key / Identifier <span className="text-brand-pink">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. pte-academic, pte-core, pte-ukvi"
                        value={formKey}
                        onChange={(e) => setFormKey(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] text-xs font-mono font-bold text-neutral-900 dark:text-white outline-none focus:border-brand-pink"
                      />
                    </div>
                  </div>

                  {/* Subtitle / Service Label & Badge */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                        Service Label
                      </label>
                      <input
                        type="text"
                        placeholder="EXAM BOOKING SERVICE"
                        value={formServiceLabel}
                        onChange={(e) => setFormServiceLabel(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] text-xs font-bold text-neutral-900 dark:text-white outline-none focus:border-brand-pink"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                        Badge Text (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. MOST POPULAR, CANADA PR"
                        value={formBadgeText}
                        onChange={(e) => setFormBadgeText(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] text-xs font-bold text-neutral-900 dark:text-white outline-none focus:border-brand-pink"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                        Badge Tint
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formBadgeTint}
                          onChange={(e) => setFormBadgeTint(e.target.value)}
                          className="w-10 h-9 rounded-lg border border-[#EAEAEA] dark:border-[#2A2A2A] cursor-pointer bg-transparent p-1"
                        />
                        <input
                          type="text"
                          value={formBadgeTint}
                          onChange={(e) => setFormBadgeTint(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] text-xs font-mono font-bold text-neutral-900 dark:text-white outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Main Description
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Brief summary of who this exam booking is for..."
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] text-xs font-medium text-neutral-900 dark:text-white outline-none focus:border-brand-pink leading-relaxed"
                    />
                  </div>

                  {/* Pricing Box (Highlight) */}
                  <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 space-y-4">
                    <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                      <IndianRupee className="w-4 h-4" />
                      <span className="font-heading font-black text-xs uppercase tracking-wider">
                        Pricing &amp; Savings Configuration
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          Special Booking Price (₹) <span className="text-brand-pink">*</span>
                        </label>
                        <input
                          type="number"
                          value={formBookingPrice}
                          onChange={(e) => setFormBookingPrice(Number(e.target.value))}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#2A2A2A] text-base font-heading font-black text-neutral-900 dark:text-white outline-none focus:border-brand-pink"
                        />
                        <span className="text-[11px] text-neutral-400 mt-1 block">
                          This is the exact price charged at checkout.
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          Standard Exam Price (₹)
                        </label>
                        <input
                          type="number"
                          value={formStandardPrice}
                          onChange={(e) => setFormStandardPrice(Number(e.target.value))}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#141414] border border-[#EAEAEA] dark:border-[#2A2A2A] text-base font-heading font-black text-neutral-900 dark:text-white outline-none focus:border-brand-pink"
                        />
                        <span className="text-[11px] text-neutral-400 mt-1 block">
                          Official Pearson test fee (used for strike-through &amp; savings computation).
                        </span>
                      </div>
                    </div>

                    {/* Live computed savings banner */}
                    <div className="p-3 rounded-xl bg-white dark:bg-[#101010] border border-purple-100 dark:border-purple-900/30 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <span className="text-neutral-500 dark:text-neutral-400 font-bold block">
                          Calculated Customer Savings:
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-heading font-black text-base text-emerald-600 dark:text-emerald-400">
                            {formatPrice(computedSavings)}
                          </span>
                          {computedDiscount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              {computedDiscount}% DISCOUNT
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5 text-right">
                        <label className="flex items-center justify-end gap-2 cursor-pointer text-xs font-bold text-neutral-700 dark:text-neutral-300">
                          <input
                            type="checkbox"
                            checked={formShowStandardPrice}
                            onChange={(e) => setFormShowStandardPrice(e.target.checked)}
                            className="rounded accent-brand-pink"
                          />
                          <span>Show Standard Price line</span>
                        </label>
                        <label className="flex items-center justify-end gap-2 cursor-pointer text-xs font-bold text-neutral-700 dark:text-neutral-300">
                          <input
                            type="checkbox"
                            checked={formShowSavingsBadge}
                            onChange={(e) => setFormShowSavingsBadge(e.target.checked)}
                            className="rounded accent-brand-pink"
                          />
                          <span>Show SAVE badge</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Product Image */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                      Product Illustration / Image
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden bg-neutral-100 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] relative shrink-0 flex items-center justify-center">
                        {formImage ? (
                          <Image src={formImage} alt="Preview" fill sizes="80px" className="object-cover" />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-neutral-300 dark:text-neutral-600" />
                        )}
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="px-3.5 py-2 rounded-xl bg-neutral-100 dark:bg-[#202020] hover:bg-neutral-200 dark:hover:bg-[#282828] text-neutral-700 dark:text-neutral-200 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{uploadingImage ? 'Uploading...' : 'Upload Image'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageFileChange}
                              disabled={uploadingImage}
                              className="hidden"
                            />
                          </label>

                          {formImage && (
                            <button
                              type="button"
                              onClick={() => setFormImage('')}
                              className="px-3 py-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold transition-colors"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <input
                          type="text"
                          placeholder="Or enter direct image URL (defaults to standard SVG illustration if empty)"
                          value={formImage}
                          onChange={(e) => setFormImage(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] text-xs font-mono text-neutral-900 dark:text-white outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Publishing Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-neutral-50 dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#262626]">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                        Publication Status
                      </label>
                      <select
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value as 'draft' | 'published')}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#1C1C1C] border border-[#EAEAEA] dark:border-[#2E2E2E] text-xs font-black text-neutral-900 dark:text-white outline-none"
                      >
                        <option value="published">Published (Live)</option>
                        <option value="draft">Draft (Hidden)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                        Active Switch
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormActive((v) => !v)}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-black transition-colors ${
                          formActive
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}
                      >
                        {formActive ? 'Active (Purchasable)' : 'Inactive'}
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                        Display Order
                      </label>
                      <input
                        type="number"
                        value={formDisplayOrder}
                        onChange={(e) => setFormDisplayOrder(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#1C1C1C] border border-[#EAEAEA] dark:border-[#2E2E2E] text-xs font-black text-neutral-900 dark:text-white outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {activeTabInModal === 'features' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-heading font-black text-sm text-neutral-900 dark:text-white">
                        Service Features Checklist
                      </h3>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        These points appear with green checkmarks on the customer-facing booking card.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Add a new feature benefit..."
                      value={newFeatureText}
                      onChange={(e) => setNewFeatureText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddFeature();
                        }
                      }}
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] text-xs font-bold text-neutral-900 dark:text-white outline-none focus:border-brand-pink"
                    />
                    <button
                      type="button"
                      onClick={handleAddFeature}
                      className="px-4 py-2.5 rounded-xl bg-brand-pink text-white text-xs font-black hover:bg-[#E00052] transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  <div className="space-y-2">
                    {formFeatures.map((f, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#262626]"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleFeature(idx)}
                          className={`p-1 rounded-md cursor-pointer ${
                            f.enabled
                              ? 'text-emerald-500 hover:text-emerald-600'
                              : 'text-neutral-300 dark:text-neutral-600'
                          }`}
                          title={f.enabled ? 'Click to disable' : 'Click to enable'}
                        >
                          <CheckCircle2 className="w-5 h-5" />
                        </button>

                        <input
                          type="text"
                          value={f.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormFeatures((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, text: val } : item))
                            );
                          }}
                          className={`flex-1 bg-transparent text-xs font-medium outline-none ${
                            f.enabled
                              ? 'text-neutral-900 dark:text-white'
                              : 'text-neutral-400 line-through'
                          }`}
                        />

                        <button
                          type="button"
                          onClick={() => handleRemoveFeature(idx)}
                          className="p-1 text-neutral-400 hover:text-rose-500 transition-colors"
                          title="Remove feature"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTabInModal === 'audit' && editingProduct?.auditHistory && (
                <div className="space-y-3">
                  <h3 className="font-heading font-black text-sm text-neutral-900 dark:text-white">
                    Audit Log &amp; Modification History
                  </h3>
                  <div className="space-y-2">
                    {editingProduct.auditHistory.slice(-20).reverse().map((entry, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-neutral-50 dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#262626] text-xs"
                      >
                        <div className="flex items-center justify-between text-neutral-400 text-[11px] mb-1">
                          <span className="font-bold text-neutral-700 dark:text-neutral-300">
                            {entry.adminEmail || 'Admin'}
                          </span>
                          <span className="font-mono">
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-brand-pink font-bold">
                          {entry.action}
                        </div>
                        {entry.changes && Object.keys(entry.changes).length > 0 && (
                          <pre className="mt-1 p-2 rounded bg-neutral-100 dark:bg-[#202020] text-[10px] font-mono overflow-x-auto text-neutral-600 dark:text-neutral-300">
                            {JSON.stringify(entry.changes, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[#EAEAEA] dark:border-[#222] flex items-center justify-between bg-neutral-50/50 dark:bg-[#161616]">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-[#EAEAEA] dark:border-[#262626] text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#202020] transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={editorSaving}
                  onClick={() => handleSaveProduct('draft')}
                  className="px-4 py-2.5 rounded-xl border border-[#EAEAEA] dark:border-[#262626] text-xs font-black text-neutral-800 dark:text-neutral-200 hover:border-brand-pink transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save as Draft
                </button>

                <button
                  type="button"
                  disabled={editorSaving}
                  onClick={() => handleSaveProduct('published')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-pink hover:bg-[#E00052] text-white text-xs font-black shadow-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{editorSaving ? 'Saving...' : 'Save & Publish Live'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAGE CONTENT (CMS) MODAL
      ========================================================================== */}
      {cmsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-[#121212] rounded-3xl border border-[#EAEAEA] dark:border-[#262626] shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EAEAEA] dark:border-[#222] flex items-center justify-between bg-neutral-50/50 dark:bg-[#161616]">
              <div>
                <h2 className="text-lg font-heading font-black text-neutral-900 dark:text-white flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  Storefront Page CMS Content
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Controls the header, hero text, booking notice banner, and bottom trust bar on /exam-booking and homepage.
                </p>
              </div>

              <button
                onClick={() => setCmsModalOpen(false)}
                className="p-2 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#202020] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Brand & Hero */}
              <div className="space-y-3">
                <span className="font-heading font-black text-neutral-900 dark:text-white uppercase tracking-wider text-[11px] block">
                  Header &amp; Hero Headline
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Brand Badge Text
                    </label>
                    <input
                      type="text"
                      value={cmsForm.brand?.badgeText || 'PTE EXAM BOOKING'}
                      onChange={(e) =>
                        setCmsForm((prev) => ({
                          ...prev,
                          brand: { ...prev.brand, badgeText: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] font-bold text-neutral-900 dark:text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Highlight Word
                    </label>
                    <input
                      type="text"
                      value={cmsForm.hero?.highlight || 'PTE Exam'}
                      onChange={(e) =>
                        setCmsForm((prev) => ({
                          ...prev,
                          hero: { ...prev.hero, highlight: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] font-bold text-neutral-900 dark:text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Hero Main Heading
                  </label>
                  <input
                    type="text"
                    value={cmsForm.hero?.heading || 'Get Your PTE Exam Booked.'}
                    onChange={(e) =>
                      setCmsForm((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, heading: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] font-bold text-neutral-900 dark:text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Subtitle
                  </label>
                  <input
                    type="text"
                    value={cmsForm.hero?.subtitle || 'Simple booking. Better pricing. Zero hassle.'}
                    onChange={(e) =>
                      setCmsForm((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, subtitle: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 dark:bg-[#1A1A1A] border border-[#EAEAEA] dark:border-[#2A2A2A] font-medium text-neutral-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              {/* Booking Notice */}
              <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider text-[11px]">
                    Booking Service Notice Banner
                  </span>
                  <label className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cmsForm.notice?.enabled !== false}
                      onChange={(e) =>
                        setCmsForm((prev) => ({
                          ...prev,
                          notice: { ...prev.notice, enabled: e.target.checked },
                        }))
                      }
                      className="rounded accent-amber-600"
                    />
                    <span>Visible on Page</span>
                  </label>
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Notice Title Badge
                  </label>
                  <input
                    type="text"
                    value={cmsForm.notice?.title || 'BOOKING SERVICE ONLY'}
                    onChange={(e) =>
                      setCmsForm((prev) => ({
                        ...prev,
                        notice: { ...prev.notice, title: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141414] border border-amber-200 dark:border-amber-900/40 font-bold text-neutral-900 dark:text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Notice Description Text
                  </label>
                  <textarea
                    rows={2}
                    value={
                      cmsForm.notice?.description ||
                      'This service is only for booking your PTE exam. No PTE voucher, voucher code, or voucher credit is included.'
                    }
                    onChange={(e) =>
                      setCmsForm((prev) => ({
                        ...prev,
                        notice: { ...prev.notice, description: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141414] border border-amber-200 dark:border-amber-900/40 font-medium text-neutral-900 dark:text-white outline-none leading-relaxed"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#EAEAEA] dark:border-[#222] flex items-center justify-between bg-neutral-50/50 dark:bg-[#161616]">
              <button
                type="button"
                onClick={() => setCmsModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-[#EAEAEA] dark:border-[#262626] text-xs font-bold text-neutral-600 dark:text-neutral-300"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={cmsSaving}
                  onClick={() => handleSaveCmsConfig('draft')}
                  className="px-4 py-2.5 rounded-xl border border-[#EAEAEA] dark:border-[#262626] text-xs font-black text-neutral-800 dark:text-neutral-200"
                >
                  Save as Draft
                </button>

                <button
                  type="button"
                  disabled={cmsSaving}
                  onClick={() => handleSaveCmsConfig('published')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-pink text-white text-xs font-black shadow-lg hover:bg-[#E00052] disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{cmsSaving ? 'Saving...' : 'Publish Content'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
