'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  ExternalLink,
  Search,
  Plus,
  TrendingUp,
  Eye,
  ArrowUpDown,
  Filter,
  RefreshCw,
  Loader2,
  Sparkles,
  Bookmark,
  Copy,
  Trash2,
} from 'lucide-react';
import { useHydrated } from '@/lib/useHydrated';
import type { Winner } from '@/lib/winners';
import { WinnerCard } from '@/components/WinnerCard';
import { WinnerDetailModal } from '@/components/WinnerDetailModal';
import { MarkAsWinnerModal } from '@/components/MarkAsWinnerModal';
import { AddExternalWinnerModal } from '@/components/AddExternalWinnerModal';

type SourceFilter = 'all' | 'generated' | 'external';
type SortOption = 'performance_score' | 'views' | 'engagement' | 'recent';
type ActiveView = 'winners' | 'hooks';

interface SavedHook {
  id: string;
  hook_text: string;
  source: string;
  content_type: string | null;
  content_format: string | null;
  product_name: string | null;
  brand_name: string | null;
  notes: string | null;
  created_at: string;
}

export default function WinnersBankPage() {
  const hydrated = useHydrated();
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('performance_score');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // View toggle
  const [activeView, setActiveView] = useState<ActiveView>('winners');

  // Saved hooks state
  const [savedHooks, setSavedHooks] = useState<SavedHook[]>([]);
  const [loadingHooks, setLoadingHooks] = useState(false);
  const [copiedHookId, setCopiedHookId] = useState<string | null>(null);

  // Modals
  const [selectedWinner, setSelectedWinner] = useState<Winner | null>(null);
  const [showAddExternal, setShowAddExternal] = useState(false);
  const [showMarkWinner, setShowMarkWinner] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    ourScripts: 0,
    external: 0,
    avgEngagement: 0,
    avgViews: 0,
  });

  const fetchWinners = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (sourceFilter !== 'all') params.set('source_type', sourceFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      params.set('sort', sortBy);
      params.set('limit', '100');

      const response = await fetch(`/api/winners?${params.toString()}`);
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to fetch winners');
      }

      const fetchedWinners = data.winners as Winner[];
      setWinners(fetchedWinners);

      // Calculate stats
      const ourScripts = fetchedWinners.filter(w => w.source_type === 'generated').length;
      const external = fetchedWinners.filter(w => w.source_type === 'external').length;
      const engagements = fetchedWinners.filter(w => w.engagement_rate).map(w => w.engagement_rate!);
      const views = fetchedWinners.filter(w => w.view_count).map(w => w.view_count!);

      setStats({
        total: fetchedWinners.length,
        ourScripts,
        external,
        avgEngagement: engagements.length > 0
          ? engagements.reduce((a, b) => a + b, 0) / engagements.length
          : 0,
        avgViews: views.length > 0
          ? views.reduce((a, b) => a + b, 0) / views.length
          : 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, sortBy, categoryFilter]);

  useEffect(() => {
    fetchWinners();
  }, [fetchWinners]);

  const handleDeleteWinner = async (id: string) => {
    try {
      const res = await fetch(`/api/winners/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setWinners(prev => prev.filter(w => w.id !== id));
        setSelectedWinner(null);
      }
    } catch (err) {
      console.error('Failed to delete winner:', err);
    }
  };

  const fetchSavedHooks = useCallback(async () => {
    setLoadingHooks(true);
    try {
      const res = await fetch('/api/saved-hooks?limit=100');
      const data = await res.json();
      setSavedHooks(data.hooks || []);
    } catch {
      // Failed silently
    } finally {
      setLoadingHooks(false);
    }
  }, []);

  useEffect(() => {
    if (activeView === 'hooks') {
      fetchSavedHooks();
    }
  }, [activeView, fetchSavedHooks]);

  const handleDeleteHook = async (id: string) => {
    try {
      const res = await fetch(`/api/saved-hooks/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSavedHooks(prev => prev.filter(h => h.id !== id));
      }
    } catch {
      // Failed silently
    }
  };

  const copyHookText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHookId(id);
      setTimeout(() => setCopiedHookId(null), 2000);
    } catch {
      // Clipboard not available
    }
  };

  // Filter winners by search query
  const filteredWinners = winners.filter(winner => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      winner.hook?.toLowerCase().includes(query) ||
      winner.product_category?.toLowerCase().includes(query) ||
      winner.content_format?.toLowerCase().includes(query) ||
      winner.notes?.toLowerCase().includes(query)
    );
  });

  // Get unique categories from winners
  const categories = [...new Set(winners.filter(w => w.product_category).map(w => w.product_category!))];

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Winners Bank</h1>
                <p className="text-sm text-zinc-500">Analyze winning content to improve your scripts</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="button"
                onClick={() => setShowMarkWinner(true)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                Mark Script as Winner
              </button>
              <button type="button"
                onClick={() => setShowAddExternal(true)}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Reference Video
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard
            icon={Trophy}
            label="Total Winners"
            value={stats.total.toString()}
            color="amber"
          />
          <StatCard
            icon={Sparkles}
            label="Our Scripts"
            value={stats.ourScripts.toString()}
            color="violet"
          />
          <StatCard
            icon={ExternalLink}
            label="References"
            value={stats.external.toString()}
            color="teal"
          />
          <StatCard
            icon={TrendingUp}
            label="Avg Engagement"
            value={`${stats.avgEngagement.toFixed(1)}%`}
            color="emerald"
          />
          <StatCard
            icon={Eye}
            label="Avg Views"
            value={formatNumber(stats.avgViews)}
            color="blue"
          />
        </div>

        {/* View Toggle */}
        <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          <button type="button"
            onClick={() => setActiveView('winners')}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              activeView === 'winners' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <Trophy className="w-4 h-4" />
            Winning Scripts
          </button>
          <button type="button"
            onClick={() => setActiveView('hooks')}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              activeView === 'hooks' ? 'bg-teal-600 text-white' : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            Winning Hooks
          </button>
        </div>

        {/* Hooks View */}
        {activeView === 'hooks' && (
          <div className="space-y-4">
            {loadingHooks ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
              </div>
            ) : savedHooks.length === 0 ? (
              <div className="text-center py-20">
                <Bookmark className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-zinc-300 mb-2">No Saved Hooks Yet</h2>
                <p className="text-zinc-500 max-w-md mx-auto">
                  Save hooks from generated scripts in the Content Studio to build your collection.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedHooks.map((hook) => (
                  <div key={hook.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                    <p className="text-white text-lg font-medium mb-3">
                      &ldquo;{hook.hook_text}&rdquo;
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-sm text-zinc-400">
                        {hook.product_name && (
                          <span className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-300">{hook.product_name}</span>
                        )}
                        {hook.content_type && (
                          <span className="px-2 py-0.5 bg-zinc-800 rounded">{hook.content_type}</span>
                        )}
                        {hook.brand_name && (
                          <span>{hook.brand_name}</span>
                        )}
                        <span>{new Date(hook.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button"
                          onClick={() => copyHookText(hook.id, hook.hook_text)}
                          className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedHookId === hook.id ? 'Copied!' : 'Copy'}
                        </button>
                        <button type="button"
                          onClick={() => {
                            if (confirm('Delete this hook?')) {
                              handleDeleteHook(hook.id);
                            }
                          }}
                          className="px-3 py-1.5 text-sm text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Winners View */}
        {activeView === 'winners' && <>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Source Filter Tabs */}
          <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
            {(['all', 'generated', 'external'] as const).map((source) => (
              <button type="button"
                key={source}
                onClick={() => setSourceFilter(source)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  sourceFilter === source
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-300'
                }`}
              >
                {source === 'all' ? 'All' : source === 'generated' ? 'Our Scripts' : 'References'}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search hooks, titles, tags..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
            />
          </div>

          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="pl-10 pr-8 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50 appearance-none"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sort */}
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="pl-10 pr-8 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50 appearance-none"
            >
              <option value="performance_score">Best Performing</option>
              <option value="views">Most Views</option>
              <option value="engagement">Highest Engagement</option>
              <option value="recent">Most Recent</option>
            </select>
          </div>

          {/* Refresh */}
          <button type="button"
            onClick={fetchWinners}
            disabled={loading}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredWinners.length === 0 && (
          <div className="text-center py-20">
            <Trophy className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-zinc-300 mb-2">
              {searchQuery || categoryFilter
                ? 'No winners found'
                : 'Start Building Your Winners Bank'}
            </h2>
            <p className="text-zinc-500 mb-6 max-w-md mx-auto">
              {searchQuery || categoryFilter
                ? 'Try adjusting your search or filters.'
                : 'Add your best-performing scripts and reference videos to help AI generate better content.'}
            </p>
            {!searchQuery && !categoryFilter && (
              <div className="flex items-center justify-center gap-3">
                <button type="button"
                  onClick={() => setShowMarkWinner(true)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Trophy className="w-4 h-4" />
                  Mark a Script as Winner
                </button>
                <button type="button"
                  onClick={() => setShowAddExternal(true)}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Reference Video
                </button>
              </div>
            )}
          </div>
        )}

        {/* Winners Grid */}
        {!loading && filteredWinners.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredWinners.map((winner) => (
              <WinnerCard
                key={winner.id}
                winner={winner}
                onClick={() => setSelectedWinner(winner)}
                onDelete={handleDeleteWinner}
              />
            ))}
          </div>
        )}
        </>}
      </div>

      {/* Winner Detail Modal */}
      {selectedWinner && (
        <WinnerDetailModal
          isOpen={!!selectedWinner}
          onClose={() => setSelectedWinner(null)}
          winner={selectedWinner}
          onUpdate={() => {
            fetchWinners();
            setSelectedWinner(null);
          }}
          onDelete={handleDeleteWinner}
        />
      )}

      {/* Add External Winner Modal */}
      <AddExternalWinnerModal
        isOpen={showAddExternal}
        onClose={() => setShowAddExternal(false)}
        onSuccess={() => {
          fetchWinners();
          setShowAddExternal(false);
        }}
      />

      {/* Mark As Winner Modal - needs script selection */}
      {showMarkWinner && (
        <ScriptSelectionModal
          isOpen={showMarkWinner}
          onClose={() => setShowMarkWinner(false)}
          onSuccess={() => {
            fetchWinners();
            setShowMarkWinner(false);
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: 'amber' | 'violet' | 'teal' | 'emerald' | 'blue';
}) {
  const colorClasses = {
    amber: 'bg-amber-500/10 text-amber-400',
    violet: 'bg-violet-500/10 text-violet-400',
    teal: 'bg-teal-500/10 text-teal-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    blue: 'bg-blue-500/10 text-blue-400',
  };

  return (
    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
      <div className={`w-8 h-8 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

// Simple script selection modal for marking scripts as winners
function ScriptSelectionModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [scripts, setScripts] = useState<Array<{ id: string; title: string; hook_line?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScript, setSelectedScript] = useState<{ id: string; title: string; hook_line?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchScripts();
    }
  }, [isOpen]);

  const fetchScripts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/scripts?limit=50');
      const data = await response.json();
      if (data.ok) {
        setScripts(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch scripts:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredScripts = scripts.filter(s =>
    !searchQuery ||
    s.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.hook_line?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">Select a Script</h2>
          <p className="text-sm text-zinc-400">Choose a script to mark as a winner</p>
        </div>

        <div className="p-4 border-b border-zinc-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search scripts..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          ) : filteredScripts.length === 0 ? (
            <p className="text-center text-zinc-500 py-8">No scripts found</p>
          ) : (
            filteredScripts.map((script) => (
              <button type="button"
                key={script.id}
                onClick={() => setSelectedScript(script)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  selectedScript?.id === script.id
                    ? 'bg-amber-500/20 border border-amber-500/50'
                    : 'bg-zinc-800 border border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <p className="text-sm font-medium text-white truncate">
                  {script.title || 'Untitled Script'}
                </p>
                {script.hook_line && (
                  <p className="text-xs text-zinc-400 mt-1 truncate">
                    &ldquo;{script.hook_line}&rdquo;
                  </p>
                )}
              </button>
            ))
          )}
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-300"
          >
            Cancel
          </button>
          <button type="button"
            onClick={() => {
              if (selectedScript) {
                // Open MarkAsWinnerModal with selected script
                // For now, just show an alert - in production this would chain to the modal
                onClose();
              }
            }}
            disabled={!selectedScript}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            Continue
          </button>
        </div>
      </div>

      {/* When a script is selected, show the MarkAsWinnerModal */}
      {selectedScript && (
        <MarkAsWinnerModal
          isOpen={!!selectedScript}
          onClose={() => setSelectedScript(null)}
          onSuccess={onSuccess}
          scriptId={selectedScript.id}
          scriptTitle={selectedScript.title}
          hookText={selectedScript.hook_line}
        />
      )}
    </div>
  );
}
