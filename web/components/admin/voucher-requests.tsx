'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, RefreshCw, Download, Mail, Plus, Ticket, Ban } from 'lucide-react';
import { adminApi, formatPrice } from '@/lib/api';
import { Th, Td, Empty, FormCard, Label } from '@/components/admin/admin-ui';
import { ErrorState } from '@/components/ui/data-table';
import { notify } from '@/components/ui/toast';

interface VRRow {
  _id: string;
  requestId?: string;
  customerName?: string;
  customerEmail?: string;
  productName?: string;
  productId?: { _id?: string } | string;
  voucherType?: string;
  category?: string;
  priceSnapshot?: number;
  status?: string;
  adminNotes?: string;
  activityHistory?: Array<{ timestamp?: string; status?: string; note?: string; adminEmail?: string }>;
  createdAt?: string;
  fulfilledAt?: string | null;
  orderId?: { orderNo?: string } | string | null;
  assignedVoucherId?: { code?: string } | null;
}

const VR_STATUSES = ['PENDING', 'PROCESSING', 'AWAITING_PAYMENT', 'FULFILLED', 'CANCELLED'];
const VR_ADMIN_STATUSES = ['PENDING', 'PROCESSING', 'AWAITING_PAYMENT', 'CANCELLED'];

function VRStatusPill({ status }: { status?: string }) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/40',
    PROCESSING: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900/40',
    AWAITING_PAYMENT: 'bg-brand-pink/10 text-brand-pink border-brand-pink/30',
    FULFILLED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40',
    CANCELLED: 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700',
  };
  const s = String(status || 'PENDING');
  return <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black whitespace-nowrap ${map[s] || map.PENDING}`}>{s.replace('_', ' ')}</span>;
}

export function VoucherRequestsAdmin() {
  const [rows, setRows] = useState<VRRow[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState<VRRow | null>(null);
  const [statusDraft, setStatusDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [inv, setInv] = useState<{ available?: number } | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [codeExpiry, setCodeExpiry] = useState('');
  const [addingCodes, setAddingCodes] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (status) params.status = status;
    if (search) params.search = search;
    const res = await adminApi.voucherRequests(params);
    // request() never throws — a failed load must not render as an empty list.
    if (!res?.success) {
      setLoadError((res?.message as string) || 'Could not load voucher requests.');
      setRows([]);
    } else {
      setRows((res.data as VRRow[]) || []);
      setStats((res.stats as Record<string, number>) || {});
      setPages(Number(res.pages) || 1);
    }
    setLoading(false);
  }, [status, search, page]);

  useEffect(() => {
    const t = setTimeout(refresh, 300);
    return () => clearTimeout(t);
  }, [refresh]);

  const loadInventory = async (productId?: string) => {
    setInv(null);
    if (!productId) return;
    const res = await adminApi.getProductInventory(productId);
    if (res?.success) setInv((res.data as { counts?: { available?: number } })?.counts || null);
  };

  const openDetail = (row: VRRow) => {
    setSelected(row);
    setStatusDraft(row.status || '');
    setNotesDraft(row.adminNotes || '');
    setCodeInput('');
    setCodeExpiry('');
    const pid = typeof row.productId === 'object' ? row.productId?._id : row.productId;
    loadInventory(pid);
  };

  const closeDetail = () => {
    setSelected(null);
    setInv(null);
  };

  const saveDetail = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await adminApi.updateVoucherRequest(selected._id, { status: statusDraft, adminNotes: notesDraft });
    setSaving(false);
    if (res.success) {
      closeDetail();
      refresh();
    } else {
      notify.error((res.message as string) || 'Failed to update request');
    }
  };

  const quickStatus = async (row: VRRow, newStatus: string) => {
    const res = await adminApi.updateVoucherRequest(row._id, { status: newStatus });
    if (res.success) refresh();
    else notify.error((res.message as string) || 'Failed to update request');
  };

  const cancelRequest = async (row: VRRow) => {
    const label = row.customerName ? `${row.customerName} (${row.productName || 'Voucher'})` : (row.productName || 'this request');
    if (!window.confirm(`Are you sure you want to cancel the voucher request for ${label}?`)) {
      return;
    }
    const res = await adminApi.cancelVoucherRequest(row._id, 'Cancelled by admin');
    if (res?.success) {
      notify.success(`Voucher request ${row.requestId || ''} cancelled.`);
      if (selected?._id === row._id) closeDetail();
      refresh();
    } else {
      notify.error((res?.message as string) || 'Failed to cancel voucher request');
    }
  };

  const addCodesForRequest = async () => {
    if (!selected) return;
    const codes = codeInput.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (codes.length === 0 || !codeExpiry) {
      notify.error('Paste at least one voucher code and set an expiry date.');
      return;
    }
    setAddingCodes(true);
    const productId = typeof selected.productId === 'object' ? selected.productId?._id : selected.productId;
    if (!productId) {
      setAddingCodes(false);
      return;
    }
    const res = await adminApi.addVouchers({ productId, codes, expiryDate: new Date(codeExpiry) });
    setAddingCodes(false);
    if (res?.success) {
      setCodeInput('');
      await loadInventory(productId);
      notify.success(`${(res.added as number) || codes.length} code(s) added to inventory. You can now mark this request "AWAITING_PAYMENT".`);
    } else {
      notify.error((res?.message as string) || 'Failed to add voucher codes');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (search) params.search = search;
    await adminApi.downloadExport('voucher-requests', false, params);
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-black text-2xl sm:text-3xl tracking-tight">Voucher Requests</h1>
          <p className="text-xs font-bold text-neutral-500 dark:text-[#B5B5B5] mt-1">
            Customers who requested a voucher that had zero available codes. Source a code, add it to inventory, then mark the request ready for payment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleExport} disabled={exporting} className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] hover:border-brand-pink text-xs font-black flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50">
            <Download className="w-4 h-4 text-brand-pink" />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
          <button type="button" onClick={refresh} className="p-2.5 rounded-xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] hover:border-brand-pink text-xs font-black transition-colors shadow-sm" title="Refresh list">
            <RefreshCw className={`w-4 h-4 text-neutral-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', count: stats.total || 0, tint: '#6C3CE0', filterVal: '' },
          { label: 'Pending', count: stats.pending || 0, tint: '#D97706', filterVal: 'PENDING' },
          { label: 'Processing', count: stats.processing || 0, tint: '#0284C7', filterVal: 'PROCESSING' },
          { label: 'Awaiting Payment', count: stats.awaitingPayment || 0, tint: '#EC4899', filterVal: 'AWAITING_PAYMENT' },
          { label: 'Fulfilled', count: stats.fulfilled || 0, tint: '#10B981', filterVal: 'FULFILLED' },
          { label: 'Cancelled', count: stats.cancelled || 0, tint: '#64748B', filterVal: 'CANCELLED' },
        ].map((kpi, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => { setStatus(kpi.filterVal); setPage(1); }}
            className={`p-4 rounded-2xl bg-white dark:bg-[#161616] border text-left transition-all shadow-sm cursor-pointer ${
              status === kpi.filterVal ? 'border-brand-pink ring-1 ring-brand-pink/30' : 'border-[#EAEAEA] dark:border-[#292929] hover:border-brand-pink/40'
            }`}
          >
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">{kpi.label}</div>
            <div className="font-heading font-black text-2xl mt-1" style={{ color: kpi.tint }}>{kpi.count}</div>
          </button>
        ))}
      </div>

      <div className="p-4 rounded-2xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-55 px-3.5 py-2 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929]">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input placeholder="Search request ID, name, email, voucher..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-transparent outline-none text-xs font-bold w-full" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-xs font-bold">
          <option value="">All Statuses</option>
          {VR_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      {selected && (
        <FormCard title={`Request ${selected.requestId}`} onClose={closeDetail} onSave={saveDetail}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-4">
              <div>
                <Label>Customer</Label>
                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] space-y-2 text-xs font-bold">
                  <div className="text-neutral-900 dark:text-white font-black text-sm">{selected.customerName}</div>
                  <a href={`mailto:${selected.customerEmail}`} className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300 hover:text-brand-pink">
                    <Mail className="w-3.5 h-3.5 text-neutral-400" /> {selected.customerEmail}
                  </a>
                </div>
              </div>

              <div>
                <Label>Requested Voucher</Label>
                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] space-y-2 text-xs font-bold">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Product:</span>
                    <span className="font-black text-brand-pink text-right">{selected.productName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Type:</span>
                    <span className="text-neutral-900 dark:text-white">{selected.voucherType}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Category:</span>
                    <span className="text-neutral-900 dark:text-white">{selected.category || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Price at request:</span>
                    <span className="text-neutral-900 dark:text-white">{formatPrice(selected.priceSnapshot)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-neutral-200/60 dark:border-[#252525] pt-2">
                    <span className="text-neutral-400">Available codes now:</span>
                    <span className={`font-black ${inv && (inv.available ?? 0) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{inv ? (inv.available ?? 0) : '…'}</span>
                  </div>
                </div>
              </div>

              {(selected.status === 'FULFILLED' || selected.orderId) && (
                <div>
                  <Label>Fulfilment</Label>
                  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 space-y-1.5 text-xs font-bold">
                    {typeof selected.orderId === 'object' && selected.orderId?.orderNo && (
                      <div className="flex justify-between"><span className="text-neutral-400">Order:</span><span className="font-mono">{selected.orderId.orderNo}</span></div>
                    )}
                    {selected.assignedVoucherId?.code && (
                      <div className="flex justify-between"><span className="text-neutral-400">Voucher:</span><span className="font-mono">{selected.assignedVoucherId.code.slice(0, 4)}••••{selected.assignedVoucherId.code.slice(-4)}</span></div>
                    )}
                    {selected.fulfilledAt && (
                      <div className="flex justify-between"><span className="text-neutral-400">Fulfilled:</span><span>{new Date(selected.fulfilledAt).toLocaleString()}</span></div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <Label>Activity History</Label>
                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] space-y-3 max-h-48 overflow-y-auto">
                  {selected.activityHistory?.length ? (
                    [...selected.activityHistory].reverse().map((act, i) => (
                      <div key={i} className="text-[11px] font-bold border-l-2 border-brand-pink pl-2.5 py-0.5 space-y-0.5">
                        <div className="flex items-center justify-between text-neutral-400">
                          <span>{act.timestamp ? new Date(act.timestamp).toLocaleString() : ''}</span>
                          <span className="text-[10px]">{(act.adminEmail || '').split('@')[0]}</span>
                        </div>
                        <div className="text-neutral-900 dark:text-white font-black">{String(act.status || '').replace('_', ' ')}</div>
                        {act.note && <div className="text-neutral-500 font-medium">{act.note}</div>}
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] font-bold text-neutral-400">Submitted {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : ''}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-4">
              <div>
                <Label>Request Status</Label>
                <select
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  disabled={selected.status === 'FULFILLED'}
                  className="w-full px-4 py-3 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-sm font-bold focus:outline-none focus:border-brand-pink disabled:opacity-60"
                >
                  {(selected.status === 'FULFILLED' ? VR_STATUSES : VR_ADMIN_STATUSES).map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
                <p className="text-[11px] font-bold text-neutral-400 mt-1.5">
                  &ldquo;Fulfilled&rdquo; is set automatically once the customer completes payment — it can&apos;t be set here.
                </p>
              </div>

              {selected.status !== 'FULFILLED' && (
                <div className="flex flex-wrap gap-1.5">
                  {VR_ADMIN_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusDraft(st)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-colors ${
                        statusDraft === st ? 'bg-brand-pink text-white border-brand-pink' : 'bg-neutral-50 dark:bg-[#0E0E0E] text-neutral-600 dark:text-neutral-300 border-[#EAEAEA] dark:border-[#292929]'
                      }`}
                    >
                      {st.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              )}

              {selected.status !== 'FULFILLED' && (
                <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black text-indigo-800 dark:text-indigo-300">
                    <Ticket className="w-4 h-4" /> Add voucher code(s) to inventory
                  </div>
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-400 font-medium">
                    Paste the sourced code(s) for <strong>{selected.productName}</strong>. Once inventory &gt; 0 you can set the status to &ldquo;Awaiting Payment&rdquo; and the customer is emailed a payment link.
                  </p>
                  <textarea
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    rows={3}
                    placeholder="One code per line, or comma-separated"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-xs font-mono focus:outline-none focus:border-brand-pink"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="date" value={codeExpiry} onChange={(e) => setCodeExpiry(e.target.value)} className="px-3 py-2 rounded-xl bg-white dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-xs font-bold" />
                    <button
                      type="button"
                      onClick={addCodesForRequest}
                      disabled={addingCodes}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" /> {addingCodes ? 'Adding…' : 'Add to Inventory'}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <Label>Admin Notes {selected.status === 'CANCELLED' ? '(sent to customer on cancel)' : ''}</Label>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={4}
                  placeholder="Internal notes / reason shared with the customer on status change"
                  className="w-full px-4 py-3 rounded-xl bg-neutral-50 dark:bg-[#0E0E0E] border border-[#EAEAEA] dark:border-[#292929] text-sm font-medium focus:outline-none focus:border-brand-pink"
                />
              </div>

              {selected.status !== 'CANCELLED' && selected.status !== 'FULFILLED' && (
                <div className="pt-3 border-t border-neutral-100 dark:border-[#202020] flex items-center justify-between">
                  <span className="text-xs text-neutral-400 font-bold">No longer fulfilling this request?</span>
                  <button
                    type="button"
                    onClick={() => cancelRequest(selected)}
                    className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" /> Cancel Request
                  </button>
                </div>
              )}
            </div>
          </div>
        </FormCard>
      )}

      <div className="rounded-3xl bg-white dark:bg-[#161616] border border-[#EAEAEA] dark:border-[#292929] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-bold">
            <thead className="bg-neutral-50 dark:bg-[#0E0E0E] text-neutral-500">
              <tr>
                <Th>Customer</Th>
                <Th>Email</Th>
                <Th>Requested Voucher</Th>
                <Th>Requested</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="p-4"><div className="h-8 bg-neutral-100 dark:bg-[#292929] rounded animate-pulse" /></td></tr>}
              {!loading && rows.map((r) => (
                <tr key={r._id} className="border-t border-[#EAEAEA] dark:border-[#292929] hover:bg-neutral-50/60 dark:hover:bg-[#0E0E0E]/60">
                  <Td className="whitespace-nowrap font-black text-neutral-900 dark:text-white">{r.customerName}</Td>
                  <Td className="whitespace-nowrap text-neutral-500">{r.customerEmail}</Td>
                  <Td className="whitespace-nowrap">
                    <span className="font-black">{r.productName}</span>
                    <span className="text-neutral-400"> · {r.voucherType}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-neutral-500">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</Td>
                  <Td><VRStatusPill status={r.status} /></Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {r.status === 'PENDING' && (
                        <button onClick={() => quickStatus(r, 'PROCESSING')} className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-[10px] font-black">Start</button>
                      )}
                      <button onClick={() => openDetail(r)} className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-[#262626] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-[#333] text-[10px] font-black transition-colors">Open</button>
                      {r.status !== 'CANCELLED' && r.status !== 'FULFILLED' && (
                        <button
                          type="button"
                          onClick={() => cancelRequest(r)}
                          className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 text-[10px] font-black transition-colors cursor-pointer"
                          title="Cancel this voucher request"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && loadError && <ErrorState message={loadError} onRetry={refresh} />}
        {!loading && !loadError && rows.length === 0 && (
          <Empty title="No voucher requests found" desc="When a customer requests an out-of-stock voucher it appears here." />
        )}
      </div>

      {!loading && !loadError && pages > 1 && (
        <div className="flex items-center justify-between text-xs font-bold text-neutral-500">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded-lg border border-[#EAEAEA] dark:border-[#292929] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
            ← Prev
          </button>
          <span>Page {page} of {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="px-3 py-1.5 rounded-lg border border-[#EAEAEA] dark:border-[#292929] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
