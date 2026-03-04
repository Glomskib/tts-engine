'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { useToast } from '@/contexts/ToastContext';
import { Filter, Plus, ExternalLink, FileText, ChevronDown, X } from 'lucide-react';
import ContentItemPanel from '../pipeline/components/ContentItemPanel';
import RecordingKitModal from '../pipeline/components/RecordingKitModal';
import type { ContentItem, ContentItemStatus } from '@/lib/content-items/types';
import type { CreatorBriefData } from '@/lib/briefs/creator-brief-types';

const STATUS_OPTIONS: { value: ContentItemStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'briefing', label: 'Briefing' },
  { value: 'ready_to_record', label: 'Ready to Record' },
  { value: 'recorded', label: 'Recorded' },
  { value: 'editing', label: 'Editing' },
  { value: 'ready_to_post', label: 'Ready to Post' },
  { value: 'posted', label: 'Posted' },
];

const STATUS_COLORS: Record<ContentItemStatus, string> = {
  briefing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  ready_to_record: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  recorded: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  editing: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  ready_to_post: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  posted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

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

export default function ContentItemsPage() {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { showSuccess, showError } = useToast();
  const router = useRouter();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

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

  // Client-side search filter
  const filtered = search
    ? items.filter(i =>
        i.title.toLowerCase().includes(search.toLowerCase()) ||
        i.short_id.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.text }}>Content Items</h1>
          <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
            {total} item{total !== 1 ? 's' : ''} total
          </p>
        </div>
        <button
          onClick={() => setCreateModal({ open: true, title: '', brandId: '', productId: '', dueAt: '', experiments: [] })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: colors.accent }}
        >
          <Plus size={16} /> New Content Item
        </button>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by title or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, minWidth: '200px' }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }}
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {brands.length > 0 && (
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }}
          >
            <option value="">All Brands</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {products.length > 0 && (
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }}
          >
            <option value="">All Products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: colors.accent }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
          <FileText size={40} className="mx-auto mb-3 opacity-30" style={{ color: colors.textMuted }} />
          <p className="text-sm" style={{ color: colors.textMuted }}>
            {items.length === 0 ? 'No content items yet. Create one to get started.' : 'No items match your filters.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}`, backgroundColor: colors.surface }}>
                <th className="text-left px-4 py-2.5 font-medium text-xs" style={{ color: colors.textMuted }}>ID</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs" style={{ color: colors.textMuted }}>Title</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs" style={{ color: colors.textMuted }}>Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs" style={{ color: colors.textMuted }}>Due</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs" style={{ color: colors.textMuted }}>Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  key={item.id}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: `1px solid ${colors.border}` }}
                  onClick={() => setSelectedItemId(item.id)}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.surface2; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: colors.textMuted }}>{item.short_id}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium truncate max-w-[300px]" style={{ color: colors.text }}>{item.title}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status]}`}>
                      {STATUS_OPTIONS.find(o => o.value === item.status)?.label || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: colors.textMuted }}>
                    {item.due_at ? new Date(item.due_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {item.drive_folder_url && (
                        <a href={item.drive_folder_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                          className="text-blue-500 hover:text-blue-600" title="Drive Folder">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      {item.brief_doc_url && (
                        <a href={item.brief_doc_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                          className="text-green-500 hover:text-green-600" title="Brief Doc">
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
      )}

      {/* Create Modal */}
      {createModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">New Content Item</h2>
              <button onClick={() => setCreateModal({ ...createModal, open: false })} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title *</label>
              <input
                type="text"
                value={createModal.title}
                onChange={(e) => setCreateModal({ ...createModal, title: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                placeholder="e.g. Hop Water Beach Vibes UGC"
                autoFocus
              />
            </div>
            {brands.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Brand</label>
                <select value={createModal.brandId} onChange={(e) => setCreateModal({ ...createModal, brandId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
                  <option value="">None</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            {products.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Product</label>
                <select value={createModal.productId} onChange={(e) => setCreateModal({ ...createModal, productId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
                  <option value="">None</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
              <input type="date" value={createModal.dueAt} onChange={(e) => setCreateModal({ ...createModal, dueAt: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
            </div>
            {/* Experiment Tags */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Experiment Tags</label>
              {createModal.experiments.map((exp, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <select
                    value={exp.variable_type}
                    onChange={(e) => {
                      const exps = [...createModal.experiments];
                      exps[i] = { ...exps[i], variable_type: e.target.value as ExperimentTag['variable_type'] };
                      setCreateModal({ ...createModal, experiments: exps });
                    }}
                    className="px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
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
                    className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                    placeholder="e.g. pocket_reveal"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const exps = createModal.experiments.filter((_, j) => j !== i);
                      setCreateModal({ ...createModal, experiments: exps });
                    }}
                    className="p-1 text-gray-400 hover:text-red-400"
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
                className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-400 mt-1"
              >
                <Plus size={12} /> Add experiment tag
              </button>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !createModal.title.trim()}
              className="w-full py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: colors.accent }}
            >
              {creating ? 'Creating...' : 'Create Content Item'}
            </button>
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
    </div>
  );
}
