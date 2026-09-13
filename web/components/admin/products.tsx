'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Search, Plus, Edit2, Trash2, Copy, RefreshCw, GripVertical, ChevronUp, ChevronDown,
  Package, CheckCircle2, X, AlertTriangle, Clock, Ticket, AlertOctagon,
} from 'lucide-react';
import { adminApi, formatPrice } from '@/lib/api';
import { StatCard, Pill, Th, Td, Empty } from '@/components/admin/admin-ui';
import { ProductEditor, type AdminProduct } from '@/components/admin/product-editor';
import { ErrorState } from '@/components/ui/data-table';
import { notify } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/use-confirm';

export function ProductsAdmin({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<AdminProduct[]>([]);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');

  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [quickPriceId, setQuickPriceId] = useState<string | null>(null);
  const [quickPrices, setQuickPrices] = useState({ sellingPrice: 0, originalPrice: 0 });

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  const filtersActive = !!(search || statusFilter || categoryFilter || providerFilter) || pages > 1;

  const refresh = useCallback(async (targetPage = page) => {
    setLoading(true);
    setLoadError('');
    const params: Record<string, string> = { sort: 'displayOrder', page: String(targetPage), limit: String(PAGE_SIZE) };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (categoryFilter) params.category = categoryFilter;
    if (providerFilter) params.provider = providerFilter;
    const res = await adminApi.products(params);
    // request() never throws — a failed load must show the error state instead
    // of silently rendering "No products found" with zeroed KPIs.
    if (!res.success) {
      setLoadError(res.message || 'Could not load products.');
      setRows([]);
      setKpis({});
    } else {
      setRows((res.data as AdminProduct[]) || []);
      setKpis((res.kpis as Record<string, number>) || {});
      setPage((res.page as number) || 1);
      setPages((res.pages as number) || 1);
      const totalCount = (res.total as number) ?? ((res.data as AdminProduct[]) || []).length;
      setTotal(totalCount);
    }
    setLoading(false);
  }, [page, search, statusFilter, categoryFilter, providerFilter]);

  useEffect(() => {
    const t = setTimeout(() => refresh(1), 300);
    return () => clearTimeout(t);
    // `refresh` is intentionally omitted: it also closes over `page`, and this
    // debounced "filters changed → jump to page 1" fetch must NOT re-fire on
    // pagination. It only ever needs the filter values below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, categoryFilter, providerFilter]);

  const startCreate = () => { setEditing(null); setIsCreating(true); };
  const startEdit = (p: AdminProduct) => { setIsCreating(false); setEditing(p); };
  const closeEditor = () => { setIsCreating(false); setEditing(null); };
  const editorOpen = isCreating || editing !== null;

  const handleQuickPriceSave = async (id: string) => {
    if (Number(quickPrices.sellingPrice) > Number(quickPrices.originalPrice)) {
      notify.error('Selling price cannot exceed original price.');
      return;
    }
    const res = await adminApi.quickUpdatePrice(id, quickPrices);
    if (res.success) {
      setQuickPriceId(null);
      adminApi.revalidatePublicProducts();
      refresh();
    } else notify.error((res.message as string) || 'Failed to update price');
  };

  const toggleStatus = async (p: AdminProduct) => {
    const res = await adminApi.quickUpdateStatus(p._id, !p.active);
    if (res.success) {
      adminApi.revalidatePublicProducts(p.slug ? [p.slug] : []);
      refresh();
    }
  };
  const toggleStock = async (p: AdminProduct) => {
    const nextStock = p.inStock === false ? true : false;
    const res = await adminApi.quickUpdateStock(p._id, nextStock);
    if (res.success) {
      notify.success(`${p.name} is now ${nextStock ? 'In Stock' : 'Out of Stock'}`);
      adminApi.revalidatePublicProducts(p.slug ? [p.slug] : []);
      refresh();
    } else {
      notify.error((res.message as string) || 'Failed to update availability status');
    }
  };
  const toggleFeatured = async (p: AdminProduct) => {
    const res = await adminApi.quickUpdateFeatured(p._id, !p.featured);
    if (res.success) {
      adminApi.revalidatePublicProducts(p.slug ? [p.slug] : []);
      refresh();
    }
  };
  const removeProduct = async (p: AdminProduct) => {
    if (!(await confirm({ title: `Are you sure you want to deactivate or remove ${p.name}?` }))) return;
    const res = await adminApi.deleteProduct(p._id);
    if (res.success) {
      if (res.deactivated) notify.success('Product archived. Historical records preserved.');
      adminApi.revalidatePublicProducts(p.slug ? [p.slug] : []);
      refresh();
    } else notify.error((res.message as string) || 'Action failed');
  };
  const duplicateProduct = async (p: AdminProduct) => {
    const res = await adminApi.duplicateProduct(p._id);
    if (res.success) {
      notify.success(`Duplicated as "${(res.data as { name?: string })?.name}" (inactive, review before publishing).`);
      adminApi.revalidatePublicProducts();
      refresh();
    } else notify.error((res.message as string) || 'Failed to duplicate product');
  };
  const archiveProduct = async (p: AdminProduct) => {
    if (!(await confirm({ title: `Archive ${p.name}? It will be hidden from the public site but kept in Admin.` }))) return;
    const res = await adminApi.archiveProduct(p._id);
    if (res.success) {
      adminApi.revalidatePublicProducts(p.slug ? [p.slug] : []);
      refresh();
    } else notify.error((res.message as string) || 'Failed to archive product');
  };
  const restoreProduct = async (p: AdminProduct) => {
    const res = await adminApi.restoreProduct(p._id);
    if (res.success) {
      adminApi.revalidatePublicProducts(p.slug ? [p.slug] : []);
      refresh();
    } else notify.error((res.message as string) || 'Failed to restore product');
  };

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const reorderTo = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || filtersActive) return;
    const reordered = [...rows];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const items = reordered.map((r, i) => ({ id: r._id, order: i + 1 }));
    const res = await adminApi.reorderProducts(items);
    if (res.success) {
      adminApi.revalidatePublicProducts();
      refresh();
    } else notify.error((res.message as string) || 'Failed to reorder products');
  };
  const moveProduct = (index: number, direction: number) => reorderTo(index, index + direction);

  if (editorOpen) {
    return (
      <ProductEditor
        productId={editing?._id}
        onClose={closeEditor}
        onSaved={() => { closeEditor(); refresh(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-black text-2xl sm:text-3xl tracking-tight">Products Management</h1>
          <p className="text-xs font-bold text-neutral-500 dark:text-[#B5B5B5]">Single source of truth for product pricing, availability, validity, and customer store layout.</p>
        </div>
        <button onClick={startCreate} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl btn-pink text-white font-black text-xs shadow-lg">
          <Plus className="w-4 h-4" /> Add New Product
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Products" value={kpis.totalProducts || 0} icon={<Package className="w-4 h-4" />} tint="#6C3CE0" onClick={() => setStatusFilter('')} />
        <StatCard label="Active Products" value={kpis.activeProducts || 0} icon={<CheckCircle2 className="w-4 h-4" />} tint="#10B981" onClick={() => setStatusFilter('active')} />
        <StatCard label="Inactive Products" value={kpis.inactiveProducts || 0} icon={<X className="w-4 h-4" />} tint="#64748B" onClick={() => setStatusFilter('inactive')} />
        <StatCard label="Archived" value={kpis.archivedProducts || 0} icon={<Trash2 className="w-4 h-4" />} tint="#71717A" onClick={() => setStatusFilter('archived')} />
        <StatCard label="Out of Stock" value={kpis.outOfStockProducts || 0} icon={<AlertTriangle className="w-4 h-4" />} tint="#EF4444" onClick={() => setStatusFilter('out_of_stock')} />
        <StatCard label="Low Stock Alert" value={kpis.lowStockProducts || 0} icon={<Clock className="w-4 h-4" />} tint="#F59E0B" onClick={() => setStatusFilter('low_stock')} />
      </div>

      <div className="rounded-3xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] flex-1 max-w-md">
            <Search className="w-4 h-4 text-neutral-400" />
            <input placeholder="Search products by name, provider, category, slug..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-transparent outline-none text-xs font-bold w-full text-neutral-900 dark:text-white" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3.5 py-2.5 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-xs font-bold text-neutral-700 dark:text-neutral-300">
              <option value="">All Categories</option>
              <option value="PTE">PTE</option>
              <option value="English Language Test">English Language Test</option>
              <option value="Graduate Admissions">Graduate Admissions</option>
              <option value="Professional Certifications">Professional Certifications</option>
            </select>
            <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="px-3.5 py-2.5 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-xs font-bold text-neutral-700 dark:text-neutral-300">
              <option value="">All Providers</option>
              <option value="Pearson">Pearson</option>
              <option value="ETS">ETS</option>
              <option value="Duolingo">Duolingo</option>
              <option value="IELTS IDP">IELTS IDP</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
          {[
            { id: '', label: 'All Products' },
            { id: 'active', label: 'Active' },
            { id: 'inactive', label: 'Inactive' },
            { id: 'out_of_stock', label: 'Out of Stock' },
            { id: 'low_stock', label: 'Low Stock' },
            { id: 'featured', label: 'Featured' },
            { id: 'archived', label: 'Archived' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition whitespace-nowrap ${
                statusFilter === pill.id ? 'bg-brand-pink text-white shadow-sm' : 'bg-neutral-100 dark:bg-[#262626] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>


      {filtersActive && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs font-bold text-amber-700 dark:text-amber-400">
          <GripVertical className="w-3.5 h-3.5 shrink-0" />
          <span>Clear search/filters to reorder products — reordering a filtered subset would corrupt the global display order.</span>
        </div>
      )}

      <div className="rounded-3xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-bold">
            <thead className="bg-neutral-50 dark:bg-[#0E0E0E] text-neutral-500">
              <tr>
                <Th>Product & Branding</Th>
                <Th>Provider</Th>
                <Th>Category</Th>
                <Th className="text-right">Original MRP</Th>
                <Th className="text-right">Selling Price</Th>
                <Th className="text-center">Discount</Th>
                <Th className="text-center">Availability</Th>
                <Th className="text-center">Status</Th>
                <Th className="text-center">Featured</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={10} className="p-4"><div className="h-10 bg-neutral-100 dark:bg-[#292929] rounded-xl animate-pulse" /></td></tr>
              ))}
              {!loading && rows.map((p, rowIndex) => {
                const isQuickEditing = quickPriceId === p._id;
                // UNLIMITED-stock products come back with availableVouchers: null —
                // they never run out, so no count/badge applies.
                const isUnlimited = p.stockType === 'UNLIMITED';
                const availableCount = p.availableVouchers ?? 0;
                const stockBadge = isUnlimited ? 'emerald' : availableCount > (p.lowStockThreshold || 10) ? 'emerald' : availableCount > 0 ? 'amber' : 'rose';
                return (
                  <tr
                    key={p._id}
                    draggable={!filtersActive}
                    onDragStart={() => setDragIndex(rowIndex)}
                    onDragOver={(e) => { e.preventDefault(); if (!filtersActive) setDragOverIndex(rowIndex); }}
                    onDragLeave={() => setDragOverIndex((cur) => (cur === rowIndex ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null) reorderTo(dragIndex, rowIndex);
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    className={`border-t transition-colors ${
                      dragOverIndex === rowIndex && dragIndex !== null && dragIndex !== rowIndex ? 'border-t-2 border-t-brand-pink' : 'border-[#EAEAEA] dark:border-[#292929]'
                    } ${dragIndex === rowIndex ? 'opacity-40' : ''} hover:bg-neutral-50/50 dark:hover:bg-[#111111]`}
                  >
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className={`text-neutral-300 dark:text-neutral-600 shrink-0 ${filtersActive ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing hover:text-brand-pink'}`} title={filtersActive ? 'Clear search/filters to reorder' : 'Drag to reorder'}>
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-[#FFF0F5] dark:bg-[#2A0A17] border border-brand-pink/20 flex items-center justify-center font-black text-brand-pink shrink-0">
                          {p.providerShortName || p.brand?.slice(0, 3) || 'APX'}
                        </div>
                        <div>
                          <div className="font-black text-sm text-neutral-900 dark:text-white flex items-center gap-2">
                            <span>{p.name}</span>
                            {p.badge && <span className="px-2 py-0.5 rounded-md bg-brand-pink/10 text-brand-pink border border-brand-pink/20 text-[9px] font-black">{p.badge}</span>}
                          </div>
                          <div className="text-[11px] font-semibold text-neutral-400 truncate max-w-xs">
                            {p.shortDescription || p.description || `Valid for ${p.validityMonths || 6} Months`}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{p.provider || p.brand}</Td>
                    <Td className="whitespace-nowrap text-neutral-500">{p.category}</Td>
                    <Td className="text-right tabular-nums text-neutral-400 line-through">{formatPrice(p.originalPrice)}</Td>
                    <Td className="text-right tabular-nums whitespace-nowrap">
                      {isQuickEditing ? (
                        <div className="inline-flex items-center gap-1 bg-white dark:bg-[#161616] p-1 rounded-xl border border-brand-pink">
                          <input
                            type="number"
                            value={quickPrices.sellingPrice}
                            onChange={(e) => setQuickPrices({ ...quickPrices, sellingPrice: Number(e.target.value) })}
                            className="w-20 px-2 py-1 rounded bg-neutral-100 dark:bg-[#0E0E0E] text-xs font-black outline-none"
                          />
                          <button onClick={() => handleQuickPriceSave(p._id)} className="p-1 rounded bg-brand-pink text-white text-[10px] font-black">Save</button>
                          <button onClick={() => setQuickPriceId(null)} className="p-1 rounded bg-neutral-200 dark:bg-[#262626] text-neutral-700 dark:text-neutral-300 text-[10px]">✕</button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <span className="font-black text-sm text-brand-pink">{formatPrice(p.sellingPrice)}</span>
                          <button
                            onClick={() => { setQuickPriceId(p._id); setQuickPrices({ sellingPrice: p.sellingPrice || 0, originalPrice: p.originalPrice || 0 }); }}
                            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-[#262626] text-neutral-400 hover:text-brand-pink"
                            title="Quick edit price"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </Td>
                    <Td className="text-center whitespace-nowrap">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 text-[10px] font-black">
                        {p.originalPrice ? Math.round(((p.originalPrice - (p.sellingPrice || 0)) / p.originalPrice) * 100) : 0}% OFF
                      </span>
                    </Td>
                    <Td className="text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleStock(p)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all cursor-pointer shadow-xs ${
                          p.inStock === false
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                        }`}
                        title={p.inStock === false ? 'Click to mark In Stock' : 'Click to mark Out of Stock'}
                      >
                        <span className={`w-2 h-2 rounded-full ${p.inStock === false ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                        <span>{p.inStock === false ? 'Out of Stock' : 'In Stock'}</span>
                      </button>
                    </Td>
                    <Td className="text-center whitespace-nowrap">
                      {p.archived ? (
                        <Pill text="ARCHIVED" tint="neutral" />
                      ) : (
                        <button onClick={() => toggleStatus(p)} className="cursor-pointer">
                          <Pill text={p.active ? 'ACTIVE' : 'INACTIVE'} tint={p.active ? 'emerald' : 'neutral'} />
                        </button>
                      )}
                    </Td>
                    <Td className="text-center whitespace-nowrap">
                      <button
                        onClick={() => toggleFeatured(p)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black border cursor-pointer ${
                          p.featured ? 'bg-brand-pink/10 text-brand-pink border-brand-pink/30' : 'bg-neutral-100 text-neutral-400 border-neutral-200 dark:bg-[#262626]'
                        }`}
                      >
                        {p.featured ? '★ Featured' : '☆ Standard'}
                      </button>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <div className="flex flex-col mr-1">
                          <button onClick={() => moveProduct(rowIndex, -1)} disabled={rowIndex === 0 || filtersActive} className="text-neutral-400 hover:text-brand-pink disabled:opacity-30 disabled:cursor-not-allowed" title={filtersActive ? 'Clear search/filters to reorder' : 'Move up'}>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => moveProduct(rowIndex, 1)} disabled={rowIndex === rows.length - 1 || filtersActive} className="text-neutral-400 hover:text-brand-pink disabled:opacity-30 disabled:cursor-not-allowed" title={filtersActive ? 'Clear search/filters to reorder' : 'Move down'}>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button onClick={() => startEdit(p)} className="px-2.5 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 text-[11px] font-black flex items-center gap-1">
                          <Edit2 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => onNavigate?.('vouchers')}
                          className="px-2.5 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 text-[11px] font-black flex items-center gap-1"
                          title="Manage associated voucher codes"
                        >
                          <Ticket className="w-3.5 h-3.5" /> Inventory
                        </button>
                        <button onClick={() => duplicateProduct(p)} className="p-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200" title="Duplicate product">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {p.archived ? (
                          <button onClick={() => restoreProduct(p)} className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200" title="Restore product">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => archiveProduct(p)} className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200" title="Archive product">
                            <AlertOctagon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => removeProduct(p)} className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200" title="Deactivate or Remove">
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
        {!loading && loadError && <ErrorState message={loadError} onRetry={() => refresh()} />}
        {!loading && !loadError && rows.length === 0 && <Empty title="No products found" desc="Add your first exam voucher product to start selling." />}
      </div>

      {!loading && total > 0 && (
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-xs font-bold text-neutral-500 dark:text-[#B5B5B5]">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => refresh(page - 1)} disabled={page <= 1} className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed">
              Previous
            </button>
            <span className="text-xs font-bold text-neutral-500">Page {page} of {pages}</span>
            <button onClick={() => refresh(page + 1)} disabled={page >= pages} className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
