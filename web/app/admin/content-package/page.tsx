'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AdminPageLayout, { AdminCard, AdminButton } from '../components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import { Package, Loader2, Check, X, Plus, Zap, RefreshCw, ArrowRight, Star, Trash2, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { CONTENT_TYPES } from '@/lib/content-types';

// --- Helpers ---
function getContentTypeName(id: string): string {
  const ct = CONTENT_TYPES.find(c => c.id === id);
  return ct?.name || id;
}

// --- Types ---

interface FullScript {
  hook: string;
  setup: string;
  body: string;
  cta: string;
  on_screen_text: string[];
  filming_notes: string;
  persona: string;
  sales_approach: string;
  estimated_length: string;
}

interface PackageItem {
  id: string;
  product_name: string;
  brand: string;
  content_type: string;
  hook: string;
  full_script: FullScript | null;
  score: number;
  kept: boolean;
  added_to_pipeline: boolean;
}

interface ContentPackage {
  id: string;
  created_at: string;
  status: 'generating' | 'complete' | 'failed';
  items: PackageItem[];
  error?: string;
}

// --- Helpers ---

function getScoreColor(score: number): string {
  if (score >= 9) return 'text-amber-300';
  if (score >= 7) return 'text-emerald-400';
  if (score >= 5) return 'text-yellow-400';
  return 'text-red-400';
}

function getScoreBg(score: number): string {
  if (score >= 9) return 'bg-amber-400/15 border-amber-400/30';
  if (score >= 7) return 'bg-emerald-400/15 border-emerald-400/30';
  if (score >= 5) return 'bg-yellow-400/15 border-yellow-400/30';
  return 'bg-red-400/15 border-red-400/30';
}

function getStatusConfig(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'generating':
      return { label: 'Generating...', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' };
    case 'complete':
      return { label: 'Complete', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' };
    case 'failed':
      return { label: 'Failed', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' };
    default:
      return { label: status, color: 'text-zinc-400', bg: 'bg-zinc-400/10 border-zinc-400/20' };
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// --- Component ---

export default function ContentPackagePage() {
  const { showSuccess, showError } = useToast();

  // State
  const [pkg, setPkg] = useState<ContentPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [addingToPipeline, setAddingToPipeline] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set());

  // Sort & Filter
  const [sortBy, setSortBy] = useState<'score' | 'product' | 'content_type'>('score');
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const [filterContentType, setFilterContentType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'kept' | 'discarded'>('all');

  // Derived filter options
  const filterOptions = useMemo(() => {
    if (!pkg?.items) return { products: [] as string[], contentTypes: [] as string[] };
    const products = [...new Set(pkg.items.map(i => i.product_name))].sort();
    const contentTypes = [...new Set(pkg.items.map(i => i.content_type))].sort();
    return { products, contentTypes };
  }, [pkg?.items]);

  // Filtered and sorted items
  const displayItems = useMemo(() => {
    if (!pkg?.items) return [];
    let items = [...pkg.items];

    // Mark discarded
    items = items.map(item => ({
      ...item,
      kept: discardedIds.has(item.id) ? false : item.kept,
    }));

    // Filter by product
    if (filterProduct !== 'all') {
      items = items.filter(i => i.product_name === filterProduct);
    }

    // Filter by content type
    if (filterContentType !== 'all') {
      items = items.filter(i => i.content_type === filterContentType);
    }

    // Filter by status
    if (filterStatus === 'kept') {
      items = items.filter(i => i.kept && !discardedIds.has(i.id));
    } else if (filterStatus === 'discarded') {
      items = items.filter(i => discardedIds.has(i.id));
    }

    // Sort
    switch (sortBy) {
      case 'score':
        items.sort((a, b) => b.score - a.score);
        break;
      case 'product':
        items.sort((a, b) => a.product_name.localeCompare(b.product_name));
        break;
      case 'content_type':
        items.sort((a, b) => a.content_type.localeCompare(b.content_type));
        break;
    }

    return items;
  }, [pkg?.items, sortBy, filterProduct, filterContentType, filterStatus, discardedIds]);

  // Discard handler
  const discardItem = useCallback((itemId: string) => {
    setDiscardedIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
    // Also mark as not-kept locally
    setPkg(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item =>
          item.id === itemId ? { ...item, kept: false } : item
        ),
      };
    });
  }, []);

  // Fetch latest package
  const fetchPackage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/content-package/generate');
      const data = await res.json();

      if (data.ok && data.data) {
        setPkg(data.data);
      } else {
        setPkg(null);
      }
    } catch (err) {
      console.error('Failed to fetch package:', err);
      showError('Failed to load content package');
      setPkg(null);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchPackage();
  }, [fetchPackage]);

  // Poll for status updates while generating
  useEffect(() => {
    if (!pkg || pkg.status !== 'generating') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/content-package/generate');
        const data = await res.json();
        if (data.ok && data.data) {
          setPkg(data.data);
          if (data.data.status !== 'generating') {
            clearInterval(interval);
            if (data.data.status === 'complete') {
              showSuccess(`Package generated with ${data.data.items?.length || 0} items`);
            }
          }
        }
      } catch {
        // Silently retry
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [pkg?.status, pkg?.id, showSuccess]);

  // Generate new package
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/content-package/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 20 }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        showError(data.error || 'Failed to generate package');
        return;
      }

      setPkg(data.data);
      showSuccess('Package generation started');
    } catch (err) {
      console.error('Generate error:', err);
      showError('Network error generating package');
    } finally {
      setGenerating(false);
    }
  };

  // Toggle kept status
  const toggleKept = useCallback((itemId: string) => {
    setPkg(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item =>
          item.id === itemId ? { ...item, kept: !item.kept } : item
        ),
      };
    });
  }, []);

  // Add single item to pipeline
  const addToPipeline = async (item: PackageItem) => {
    setAddingToPipeline(prev => new Set(prev).add(item.id));
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: item.product_name,
          brand: item.brand,
          content_type: item.content_type,
          hook_text: item.hook,
          score: item.score,
          source: 'content_package',
          package_id: pkg?.id,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        showError(data.error || 'Failed to add to pipeline');
        return;
      }

      // Mark as added
      setPkg(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(i =>
            i.id === item.id ? { ...i, added_to_pipeline: true } : i
          ),
        };
      });

      showSuccess(`"${item.product_name}" added to pipeline`);
    } catch (err) {
      console.error('Add to pipeline error:', err);
      showError('Network error adding to pipeline');
    } finally {
      setAddingToPipeline(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Add all kept items to pipeline
  const addAllKeptToPipeline = async () => {
    if (!pkg) return;

    const keptItems = pkg.items.filter(i => i.kept && !i.added_to_pipeline);
    if (keptItems.length === 0) {
      showError('No kept items to add');
      return;
    }

    setBulkAdding(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of keptItems) {
      try {
        const res = await fetch('/api/pipeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_name: item.product_name,
            brand: item.brand,
            content_type: item.content_type,
            hook_text: item.hook,
            score: item.score,
            source: 'content_package',
            package_id: pkg.id,
          }),
        });

        const data = await res.json();

        if (res.ok && data.ok) {
          successCount++;
          setPkg(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              items: prev.items.map(i =>
                i.id === item.id ? { ...i, added_to_pipeline: true } : i
              ),
            };
          });
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    if (successCount > 0) {
      showSuccess(`Added ${successCount} item${successCount !== 1 ? 's' : ''} to pipeline`);
    }
    if (failCount > 0) {
      showError(`Failed to add ${failCount} item${failCount !== 1 ? 's' : ''}`);
    }

    setBulkAdding(false);
  };

  // Computed stats
  const stats = useMemo(() => {
    if (!pkg || !pkg.items) {
      return { total: 0, kept: 0, avgScore: 0, products: 0 };
    }

    const items = pkg.items;
    const total = items.length;
    const kept = items.filter(i => i.kept).length;
    const avgScore = total > 0
      ? Math.round((items.reduce((sum, i) => sum + i.score, 0) / total) * 10) / 10
      : 0;
    const products = new Set(items.map(i => i.product_name)).size;

    return { total, kept, avgScore, products };
  }, [pkg]);

  // Kept items count for bulk action
  const keptNotAdded = pkg?.items.filter(i => i.kept && !i.added_to_pipeline).length || 0;

  // --- Render ---

  return (
    <AdminPageLayout
      title="Content Package"
      subtitle="AI-generated daily content batches for your pipeline"
      maxWidth="2xl"
      headerActions={
        <div className="flex items-center gap-2">
          {pkg && (
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={fetchPackage}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </AdminButton>
          )}
          <AdminButton
            variant="primary"
            onClick={handleGenerate}
            disabled={generating || (pkg?.status === 'generating')}
          >
            {generating || pkg?.status === 'generating' ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Generate Daily Package
              </>
            )}
          </AdminButton>
        </div>
      }
    >
      {/* Loading State */}
      {loading && !pkg && (
        <AdminCard>
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin mr-3" />
            <span className="text-zinc-400 text-sm">Loading content package...</span>
          </div>
        </AdminCard>
      )}

      {/* Empty State - No Package */}
      {!loading && !pkg && (
        <AdminCard>
          <div className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Package className="w-8 h-8 text-violet-400" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">No Content Package Yet</h3>
            <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
              Generate your first daily content package. The AI will analyze your products, trending hooks,
              and winning patterns to create a batch of content ideas scored by potential.
            </p>
            <AdminButton
              variant="primary"
              size="lg"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Generate First Package
                </>
              )}
            </AdminButton>
          </div>
        </AdminCard>
      )}

      {/* Package Content */}
      {pkg && (
        <>
          {/* Status Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-zinc-900/50 rounded-xl border border-white/10">
            <div className="flex items-center gap-3">
              {pkg.status === 'generating' && (
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
              )}
              {pkg.status === 'complete' && (
                <div className="w-5 h-5 rounded-full bg-emerald-400/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
              )}
              {pkg.status === 'failed' && (
                <div className="w-5 h-5 rounded-full bg-red-400/20 flex items-center justify-center flex-shrink-0">
                  <X className="w-3 h-3 text-red-400" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${getStatusConfig(pkg.status).color}`}>
                    {getStatusConfig(pkg.status).label}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusConfig(pkg.status).bg}`}>
                    {pkg.status}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Generated {formatDate(pkg.created_at)}
                </p>
              </div>
            </div>

            {pkg.status === 'failed' && pkg.error && (
              <p className="text-xs text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg border border-red-400/20">
                {pkg.error}
              </p>
            )}
          </div>

          {/* Summary Stats */}
          {pkg.status === 'complete' && pkg.items && pkg.items.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="px-4 py-3 rounded-xl border bg-zinc-800/50 border-white/10">
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                  Total Generated
                </div>
                <div className="text-xl font-semibold text-zinc-100">{stats.total}</div>
              </div>
              <div className="px-4 py-3 rounded-xl border bg-emerald-500/10 border-emerald-500/20">
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                  Kept
                </div>
                <div className="text-xl font-semibold text-emerald-400">{stats.kept}</div>
              </div>
              <div className="px-4 py-3 rounded-xl border bg-amber-500/10 border-amber-500/20">
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                  Avg Score
                </div>
                <div className="text-xl font-semibold text-amber-400">{stats.avgScore}</div>
              </div>
              <div className="px-4 py-3 rounded-xl border bg-violet-500/10 border-violet-500/20">
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
                  Products Covered
                </div>
                <div className="text-xl font-semibold text-violet-400">{stats.products}</div>
              </div>
            </div>
          )}

          {/* Bulk Action Bar */}
          {pkg.status === 'complete' && keptNotAdded > 0 && (
            <div className="flex items-center justify-between p-4 bg-violet-500/10 rounded-xl border border-violet-500/20">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-violet-400" />
                <span className="text-sm text-zinc-200">
                  <span className="font-semibold text-violet-400">{keptNotAdded}</span> kept item{keptNotAdded !== 1 ? 's' : ''} ready to add
                </span>
              </div>
              <AdminButton
                variant="primary"
                size="sm"
                onClick={addAllKeptToPipeline}
                disabled={bulkAdding}
              >
                {bulkAdding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4 mr-1.5" />
                    Add All Kept to Pipeline
                  </>
                )}
              </AdminButton>
            </div>
          )}

          {/* Generating Placeholder */}
          {pkg.status === 'generating' && (
            <AdminCard>
              <div className="py-16 text-center">
                <Loader2 className="w-10 h-10 text-violet-400 animate-spin mx-auto mb-4" />
                <h3 className="text-base font-medium text-zinc-100 mb-1">Generating Your Package</h3>
                <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                  Analyzing products, hooks, and trends to build your daily content batch.
                  This usually takes 30-60 seconds.
                </p>
              </div>
            </AdminCard>
          )}

          {/* Sort & Filter Bar */}
          {pkg.status === 'complete' && pkg.items && pkg.items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-3 bg-zinc-900/50 rounded-xl border border-white/10">
              <SlidersHorizontal className="w-4 h-4 text-zinc-500 flex-shrink-0" />

              {/* Sort */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'score' | 'product' | 'content_type')}
                  className="appearance-none bg-zinc-800 text-zinc-300 text-xs font-medium pl-2.5 pr-7 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                >
                  <option value="score">Sort: Score</option>
                  <option value="product">Sort: Product</option>
                  <option value="content_type">Sort: Type</option>
                </select>
                <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Filter: Product */}
              <div className="relative">
                <select
                  value={filterProduct}
                  onChange={(e) => setFilterProduct(e.target.value)}
                  className="appearance-none bg-zinc-800 text-zinc-300 text-xs font-medium pl-2.5 pr-7 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:ring-1 focus:ring-violet-500/50 max-w-[140px]"
                >
                  <option value="all">All Products</option>
                  {filterOptions.products.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Filter: Content Type */}
              <div className="relative">
                <select
                  value={filterContentType}
                  onChange={(e) => setFilterContentType(e.target.value)}
                  className="appearance-none bg-zinc-800 text-zinc-300 text-xs font-medium pl-2.5 pr-7 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:ring-1 focus:ring-violet-500/50 max-w-[160px]"
                >
                  <option value="all">All Types</option>
                  {filterOptions.contentTypes.map(ct => (
                    <option key={ct} value={ct}>{getContentTypeName(ct)}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Filter: Status */}
              <div className="relative">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as 'all' | 'kept' | 'discarded')}
                  className="appearance-none bg-zinc-800 text-zinc-300 text-xs font-medium pl-2.5 pr-7 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                >
                  <option value="all">All Status</option>
                  <option value="kept">Kept Only</option>
                  <option value="discarded">Discarded</option>
                </select>
                <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Count */}
              <span className="text-xs text-zinc-500 ml-auto">
                {displayItems.length} of {pkg.items.length}
              </span>
            </div>
          )}

          {/* Package Items Grid */}
          {pkg.status === 'complete' && displayItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayItems.map((item) => (
                <div
                  key={item.id}
                  className={`
                    relative rounded-xl border overflow-hidden transition-all duration-200
                    ${discardedIds.has(item.id)
                      ? 'bg-zinc-900/20 border-red-500/15 opacity-40 hover:opacity-60'
                      : item.kept
                        ? 'bg-zinc-900/80 border-violet-500/30 shadow-lg shadow-violet-500/5'
                        : 'bg-zinc-900/30 border-white/5 opacity-60 hover:opacity-80'
                    }
                    ${item.added_to_pipeline ? 'ring-1 ring-emerald-500/30' : ''}
                  `}
                >
                  {/* Added badge */}
                  {item.added_to_pipeline && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-xs text-emerald-400 font-medium">In Pipeline</span>
                    </div>
                  )}

                  <div className="p-4">
                    {/* Header: Product + Score */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="text-sm font-semibold text-zinc-100 truncate">
                          {item.product_name}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">{item.brand}</p>
                      </div>
                      {!item.added_to_pipeline && (
                        <div className={`flex-shrink-0 px-2.5 py-1 rounded-lg border text-sm font-bold ${getScoreBg(item.score)} ${getScoreColor(item.score)}`}>
                          {item.score >= 9 && <Star className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                          {item.score}
                        </div>
                      )}
                    </div>

                    {/* Content Type + Full Script Badge */}
                    <div className="mb-3 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300 border border-white/5">
                        {getContentTypeName(item.content_type)}
                      </span>
                      {item.full_script && (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-teal-500/15 text-teal-300 border border-teal-500/20">
                          Full Script
                        </span>
                      )}
                      {item.full_script?.persona && (
                        <span className="text-[11px] text-zinc-500">
                          {item.full_script.persona}
                        </span>
                      )}
                    </div>

                    {/* Hook Text */}
                    <p className="text-sm text-zinc-300 leading-relaxed mb-4 line-clamp-3">
                      &ldquo;{item.full_script?.hook || item.hook}&rdquo;
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                      {/* Keep Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleKept(item.id)}
                        className={`
                          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                          ${item.kept
                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30'
                            : 'bg-zinc-800 text-zinc-400 border border-white/5 hover:bg-zinc-700 hover:text-zinc-300'
                          }
                        `}
                      >
                        {item.kept ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Kept
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            Keep
                          </>
                        )}
                      </button>

                      {/* Discard Toggle */}
                      {!item.added_to_pipeline && (
                        <button
                          type="button"
                          onClick={() => discardItem(item.id)}
                          className={`
                            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                            ${discardedIds.has(item.id)
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30'
                              : 'bg-zinc-800 text-zinc-500 border border-white/5 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                            }
                          `}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {discardedIds.has(item.id) ? 'Discarded' : 'Discard'}
                        </button>
                      )}

                      {/* Add to Pipeline */}
                      {!item.added_to_pipeline && !discardedIds.has(item.id) && (
                        <button
                          type="button"
                          onClick={() => addToPipeline(item)}
                          disabled={addingToPipeline.has(item.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 border border-white/5 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
                        >
                          {addingToPipeline.has(item.id) ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            <>
                              <ArrowRight className="w-3.5 h-3.5" />
                              Add to Pipeline
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No results for current filter */}
          {pkg.status === 'complete' && pkg.items && pkg.items.length > 0 && displayItems.length === 0 && (
            <AdminCard>
              <div className="py-10 text-center">
                <SlidersHorizontal className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-zinc-400 mb-3">No items match the current filters.</p>
                <button
                  type="button"
                  onClick={() => { setFilterProduct('all'); setFilterContentType('all'); setFilterStatus('all'); }}
                  className="text-sm text-violet-400 hover:text-violet-300 underline"
                >
                  Clear all filters
                </button>
              </div>
            </AdminCard>
          )}

          {/* Complete but empty */}
          {pkg.status === 'complete' && (!pkg.items || pkg.items.length === 0) && (
            <AdminCard>
              <div className="py-12 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
                  <Package className="w-6 h-6 text-zinc-400" />
                </div>
                <h3 className="text-lg font-medium text-zinc-100 mb-1">Package is Empty</h3>
                <p className="text-sm text-zinc-500 mb-4 max-w-sm mx-auto">
                  The package was generated but no items were produced. Try generating a new one.
                </p>
                <AdminButton variant="primary" onClick={handleGenerate} disabled={generating}>
                  <Zap className="w-4 h-4 mr-2" />
                  Regenerate Package
                </AdminButton>
              </div>
            </AdminCard>
          )}
        </>
      )}
    </AdminPageLayout>
  );
}
