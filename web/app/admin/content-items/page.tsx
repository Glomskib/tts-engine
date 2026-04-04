'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/contexts/ToastContext';
import { Plus, FileText, X, Search, ExternalLink, ChevronRight } from 'lucide-react';
import AdminPageLayout, { AdminCard, StatusBadge, type ContentStatus } from '@/app/admin/components/AdminPageLayout';
import ContentItemPanel from '../pipeline/components/ContentItemPanel';
import RecordingKitModal from '../pipeline/components/RecordingKitModal';
import type { ContentItem } from '@/lib/content-items/types';
import type { CreatorBriefData } from '@/lib/briefs/creator-brief-types';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'briefing', label: 'Briefing' },
  { value: 'scripted', label: 'Scripted' },
  { value: 'ready_to_record', label: 'Ready to Record' },
  { value: 'recorded', label: 'Recorded' },
  { value: 'editing', label: 'Editing' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'ready_to_post', label: 'Ready to Post' },
  { value: 'posted', label: 'Posted' },
];

interface ExperimentTag {
  variable_type: 'hook' | 'format' | 'product' | 'length';
  variant: string;
}

interface CreateModalState {
  open: boolean;
  title: string;
  brandId: string;
  productId: string;
  dueAt: string;
  experiments: ExperimentTag[];
}

const inputClass = 'w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50';
const selectClass = 'px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50';

export default function ContentItemsPage() {
  const { showSuccess, showError } = useToast();
  const router = useRouter();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  // Brands & products for filter dropdowns
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [brandFilter, setBrandFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');

  // Panel state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [recordingKitItem, setRecordingKitItem] = useState<ContentItem | null>(null);
  const [recordingKitBrief, setRecordingKitBrief] = useState<CreatorBriefData | null>(null);

  // Create modal
  const [createModal, setCreateModal] = useState<CreateModalState>({
    open: false, title: '', brandId: '', productId: '', dueAt: '', experiments: [],
  });
  const [creating, setCreating] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (brandFilter) params.set('brand_id', brandFilter);
      if (productFilter) params.set('product_id', productFilter);
      params.set('limit', '100');

      const res = await fetch(`/api/content-items?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data || []);
        setTotal(json.total ?? json.data?.length ?? 0);
      }
    } catch {
      showError('Failed to load content items');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, brandFilter, productFilter, showError]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Fetch brands & products once
  useEffect(() => {
    fetch('/api/brands').then(r => r.json()).then(json => {
      if (json.ok) setBrands((json.data || []).map((b: any) => ({ id: b.id, name: b.name })));
    }).catch(() => {});
    fetch('/api/products').then(r => r.json()).then(json => {
      if (json.ok) setProducts((json.data || []).map((p: any) => ({ id: p.id, name: p.name })));
    }).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!createModal.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/content-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createModal.title.trim(),
          brand_id: createModal.brandId || undefined,
          product_id: createModal.productId || undefined,
          due_at: createModal.dueAt || undefined,
          experiments: createModal.experiments.length > 0 ? createModal.experiments : undefined,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        showSuccess('Content item created');
        setCreateModal({ open: false, title: '', brandId: '', productId: '', dueAt: '', experiments: [] });
        fetchItems();
        setSelectedItemId(json.data.id);
      } else {
        showError(json.error || 'Failed to create');
      }
    } catch {
      showError('Failed to create content item');
    } finally {
      setCreating(false);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (brandFilter) params.set('brand_id', brandFilter);
      if (productFilter) params.set('product_id', productFilter);
      params.set('limit', '100');
      params.set('offset', String(items.length));

      const res = await fetch(`/api/content-items?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(prev => [...prev, ...(json.data || [])]);
      }
    } catch {
      showError('Failed to load more items');
    } finally {
      setLoadingMore(false);
    }
  };

  // Client-side search filter
  const filtered = search
    ? items.filter(i =>
        i.title.toLowerCase().includes(search.toLowerCase()) ||
        i.short_id.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  return (
    <AdminPageLayout
      title="Content Items"
      subtitle={`${total} item${total !== 1 ? 's' : ''} across your pipeline`}
      stage="production"
      maxWidth="2xl"
      headerActions={
        <button
          onClick={() => setCreateModal({ open: true, title: '', brandId: '', productId: '', dueAt: '', experiments: [] })}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors min-h-[40px]"
        >
          <Plus size={16} /> New Item
        </button>
      }
    >
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by title or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {brands.length > 0 && (
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className={selectClass}>
              <option value="">All Brands</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {products.length > 0 && (
            <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className={selectClass}>
              <option value="">All Products</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-teal-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-white/[0.06] bg-zinc-900/30">
          <FileText size={36} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-sm text-zinc-500">
            {items.length === 0 ? 'No content items yet. Create one to get started.' : 'No items match your filters.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-zinc-900/50">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">ID</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Title</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Due</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Links</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr
                    key={item.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">{item.short_id}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/content-items/${item.id}`}
                        className="font-medium text-zinc-200 hover:text-white truncate max-w-[300px] block transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status as ContentStatus} size="xs" />
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {item.due_at ? new Date(item.due_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {item.drive_folder_url && (
                          <a href={item.drive_folder_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                            className="text-blue-400 hover:text-blue-300" title="Drive Folder">
                            <ExternalLink size={14} />
                          </a>
                        )}
                        {item.brief_doc_url && (
                          <a href={item.brief_doc_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                            className="text-emerald-400 hover:text-emerald-300" title="Brief Doc">
                            <FileText size={14} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden space-y-2">
            {filtered.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                className="w-full text-left bg-zinc-900/50 border border-white/[0.06] rounded-xl p-3.5 hover:bg-white/[0.03] transition-colors group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-medium text-zinc-200 leading-snug line-clamp-2">{item.title}</h3>
                  <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 mt-0.5" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={item.status as ContentStatus} size="xs" />
                  <span className="text-[10px] text-zinc-600 font-mono">{item.short_id}</span>
                  {item.due_at && (
                    <span className="text-[10px] text-zinc-500">Due {new Date(item.due_at).toLocaleDateString()}</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Load More */}
          {items.length < total && (
            <div className="text-center pt-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : `Load More (${items.length} of ${total})`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {createModal.open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-zinc-900 border-b border-white/[0.06] px-5 py-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-100">New Content Item</h2>
              <button onClick={() => setCreateModal({ ...createModal, open: false })} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Title *</label>
                <input
                  type="text"
                  value={createModal.title}
                  onChange={(e) => setCreateModal({ ...createModal, title: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Hop Water Beach Vibes UGC"
                  autoFocus
                />
              </div>
              {brands.length > 0 && (
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Brand</label>
                  <select value={createModal.brandId} onChange={(e) => setCreateModal({ ...createModal, brandId: e.target.value })} className={inputClass}>
                    <option value="">None</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {products.length > 0 && (
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Product</label>
                  <select value={createModal.productId} onChange={(e) => setCreateModal({ ...createModal, productId: e.target.value })} className={inputClass}>
                    <option value="">None</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Due Date</label>
                <input type="date" value={createModal.dueAt} onChange={(e) => setCreateModal({ ...createModal, dueAt: e.target.value })} className={inputClass} />
              </div>
              {/* Experiment Tags */}
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Experiment Tags</label>
                {createModal.experiments.map((exp, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <select
                      value={exp.variable_type}
                      onChange={(e) => {
                        const exps = [...createModal.experiments];
                        exps[i] = { ...exps[i], variable_type: e.target.value as ExperimentTag['variable_type'] };
                        setCreateModal({ ...createModal, experiments: exps });
                      }}
                      className="px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100"
                    >
                      <option value="hook">Hook</option>
                      <option value="format">Format</option>
                      <option value="product">Product</option>
                      <option value="length">Length</option>
                    </select>
                    <input
                      type="text"
                      value={exp.variant}
                      onChange={(e) => {
                        const exps = [...createModal.experiments];
                        exps[i] = { ...exps[i], variant: e.target.value };
                        setCreateModal({ ...createModal, experiments: exps });
                      }}
                      className="flex-1 px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100"
                      placeholder="e.g. pocket_reveal"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const exps = createModal.experiments.filter((_, j) => j !== i);
                        setCreateModal({ ...createModal, experiments: exps });
                      }}
                      className="p-1 text-zinc-500 hover:text-red-400"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCreateModal({
                    ...createModal,
                    experiments: [...createModal.experiments, { variable_type: 'hook', variant: '' }],
                  })}
                  className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 mt-1"
                >
                  <Plus size={12} /> Add experiment tag
                </button>
              </div>
              <button
                onClick={handleCreate}
                disabled={creating || !createModal.title.trim()}
                className="w-full py-2.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {creating ? 'Creating...' : 'Create Content Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content Item Panel */}
      {selectedItemId && (
        <ContentItemPanel
          contentItemId={selectedItemId}
          onClose={() => setSelectedItemId(null)}
          onOpenRecordingKit={(item, brief) => {
            setRecordingKitItem(item);
            setRecordingKitBrief(brief);
          }}
        />
      )}

      {/* Recording Kit Modal */}
      {recordingKitItem && (
        <RecordingKitModal
          item={recordingKitItem}
          brief={recordingKitBrief}
          onClose={() => { setRecordingKitItem(null); setRecordingKitBrief(null); }}
          onMarkRecorded={() => {
            fetchItems();
            setRecordingKitItem(null);
            setRecordingKitBrief(null);
          }}
        />
      )}
    </AdminPageLayout>
  );
}
