'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Package,
  Search,
  Star,
  Trash2,
  Zap,
  FileText,
  Camera,
  Plus,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import type { ContentPack, PackSourceType } from '@/lib/content-pack/types';

const SOURCE_LABELS: Record<PackSourceType, string> = {
  opportunity: 'Opportunity',
  product: 'Product',
  topic: 'Topic',
  transcript: 'Transcript',
  comment: 'Comment',
  blank: 'Blank',
  remix: 'Remix',
};

const SOURCE_COLORS: Record<PackSourceType, string> = {
  opportunity: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  product: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  topic: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  transcript: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  comment: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  blank: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  remix: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
};

const PAGE_SIZE = 12;

export default function ContentPacksPage() {
  const { showSuccess, showError } = useToast();
  const [packs, setPacks] = useState<ContentPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingFavId, setTogglingFavId] = useState<string | null>(null);

  const fetchPacks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (search) params.set('search', search);
      if (sourceFilter) params.set('source', sourceFilter);
      if (favoritesOnly) params.set('favorites', '1');

      const res = await fetch(`/api/content-pack?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load packs');
      const data = await res.json();
      setPacks(data.data || []);
      setTotal(data.total || 0);
    } catch {
      showError('Failed to load content packs');
    } finally {
      setLoading(false);
    }
  }, [page, search, sourceFilter, favoritesOnly, showError]);

  useEffect(() => { fetchPacks(); }, [fetchPacks]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput);
  };

  const toggleFavorite = async (pack: ContentPack) => {
    setTogglingFavId(pack.id);
    try {
      const res = await fetch('/api/content-pack', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: pack.id, favorited: !pack.favorited }),
      });
      if (!res.ok) throw new Error('Failed');
      setPacks(prev => prev.map(p => p.id === pack.id ? { ...p, favorited: !p.favorited } : p));
      showSuccess(pack.favorited ? 'Removed from favorites' : 'Added to favorites');
    } catch {
      showError('Failed to update favorite');
    } finally {
      setTogglingFavId(null);
    }
  };

  const deletePack = async (id: string) => {
    if (!confirm('Delete this content pack? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/content-pack?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
      setPacks(prev => prev.filter(p => p.id !== id));
      setTotal(prev => prev - 1);
      showSuccess('Pack deleted');
    } catch {
      showError('Failed to delete pack');
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasNoResults = !loading && packs.length === 0;

  return (
    <AdminPageLayout
      title="Pack Library"
      subtitle="Browse and reuse your saved content packs"
      stage="create"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search packs..."
                className="pl-8 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500 w-48"
              />
            </div>
          </form>

          {/* Source filter */}
          <div className="relative">
            <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
              className="pl-8 pr-8 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Favorites toggle */}
          <button
            onClick={() => { setFavoritesOnly(!favoritesOnly); setPage(0); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              favoritesOnly
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
            }`}
          >
            <Star size={12} className={favoritesOnly ? 'fill-amber-400' : ''} />
            Favorites
          </button>
        </div>

        <Link
          href="/admin/content-pack"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={14} /> New Pack
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
        </div>
      )}

      {/* Empty state */}
      {hasNoResults && (
        <AdminCard>
          <div className="text-center py-12">
            <Package size={32} className="text-zinc-600 mx-auto mb-3" />
            {search || sourceFilter || favoritesOnly ? (
              <>
                <p className="text-sm text-zinc-400 mb-1">No packs match your filters</p>
                <button
                  onClick={() => { setSearch(''); setSearchInput(''); setSourceFilter(''); setFavoritesOnly(false); setPage(0); }}
                  className="text-xs text-teal-400 hover:text-teal-300"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-400 mb-3">No content packs yet</p>
                <Link
                  href="/admin/content-pack"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus size={14} /> Create your first pack
                </Link>
              </>
            )}
          </div>
        </AdminCard>
      )}

      {/* Pack grid */}
      {!loading && packs.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packs.map((pack) => {
              const hookCount = pack.hooks?.length || 0;
              const hasScript = !!pack.script;
              const visualCount = pack.visual_hooks?.length || 0;
              const sourceStyle = SOURCE_COLORS[pack.source_type] || SOURCE_COLORS.topic;
              const firstHookPreview = pack.hooks?.[0]?.verbal_hook;
              const scriptPreview = pack.script?.hook;

              return (
                <div
                  key={pack.id}
                  className="group relative p-4 bg-zinc-900/60 border border-white/10 hover:border-white/20 rounded-xl transition-colors"
                >
                  {/* Top row: source badge + actions */}
                  <div className="flex items-start justify-between mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium border rounded ${sourceStyle}`}>
                      {SOURCE_LABELS[pack.source_type] || pack.source_type}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.preventDefault(); toggleFavorite(pack); }}
                        disabled={togglingFavId === pack.id}
                        className="p-1 text-zinc-500 hover:text-amber-400 transition-colors"
                        title={pack.favorited ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star size={14} className={pack.favorited ? 'fill-amber-400 text-amber-400' : ''} />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); deletePack(pack.id); }}
                        disabled={deletingId === pack.id}
                        className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Delete pack"
                      >
                        {deletingId === pack.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Favorite indicator (always visible if favorited) */}
                  {pack.favorited && (
                    <Star size={12} className="absolute top-4 right-12 fill-amber-400 text-amber-400" />
                  )}

                  {/* Topic */}
                  <Link href={`/admin/content-packs/${pack.id}`} className="block">
                    <h3 className="text-sm font-medium text-white mb-2 line-clamp-2 group-hover:text-teal-300 transition-colors">
                      {pack.topic}
                    </h3>

                    {/* Preview text */}
                    {(firstHookPreview || scriptPreview) && (
                      <p className="text-xs text-zinc-500 line-clamp-2 mb-3">
                        {scriptPreview || firstHookPreview}
                      </p>
                    )}

                    {/* Content counts */}
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                      {hookCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Zap size={10} className="text-teal-400" /> {hookCount}
                        </span>
                      )}
                      {hasScript && (
                        <span className="inline-flex items-center gap-1">
                          <FileText size={10} className="text-violet-400" /> Script
                        </span>
                      )}
                      {visualCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Camera size={10} className="text-blue-400" /> {visualCount}
                        </span>
                      )}
                    </div>

                    {/* Date */}
                    <p className="text-[10px] text-zinc-600 mt-2">
                      {new Date(pack.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 text-sm text-zinc-500">
              <span>{total} pack{total !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg transition-colors"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="text-xs">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg transition-colors"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AdminPageLayout>
  );
}
