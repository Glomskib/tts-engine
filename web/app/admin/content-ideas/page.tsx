'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import AdminPageLayout, { AdminCard, AdminButton } from '../components/AdminPageLayout';
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  Trophy,
  Users,
  Package,
  FileText,
  Sparkles,
  Target,
  Zap,
  Lightbulb,
  TrendingUp,
  Clipboard,
  Check,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp,
  Bookmark,
  BookmarkCheck,
  Plus,
  Play,
  X,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ContentIdea {
  id: string;
  title: string;
  hook: string;
  content_type: string;
  format_notes: string;
  target_product: string | null;
  target_brand: string | null;
  why_it_works: string;
  effort: 'quick' | 'medium' | 'production';
  priority: number;
  estimated_duration: string;
  hashtags: string[];
  on_screen_text: string;
}

interface ContentIdeasData {
  trendingHooks: { hookText: string; hookType: string; performanceScore: number | null; viewCount: number | null; category: string | null }[];
  topPersonas: { personaName: string; avgScore: number; scriptCount: number }[];
  suggestions: { type: string; title: string; message: string; action?: { label: string; href: string } }[];
  stats: { totalWinners: number; totalPersonas: number; totalProducts: number; totalScripts: number };
}

interface Brand {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EFFORT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  quick:      { label: 'Quick',      color: 'text-green-400',  bgColor: 'bg-green-500/10 border-green-500/20' },
  medium:     { label: 'Medium',     color: 'text-amber-400',  bgColor: 'bg-amber-500/10 border-amber-500/20' },
  production: { label: 'Production', color: 'text-red-400',    bgColor: 'bg-red-500/10 border-red-500/20' },
};

const PRIORITY_CONFIG = (p: number) => {
  if (p >= 8) return { emoji: '\uD83D\uDD34', label: 'High', color: 'text-red-400', bg: 'bg-red-500/10' };
  if (p >= 5) return { emoji: '\uD83D\uDFE1', label: 'Medium', color: 'text-amber-400', bg: 'bg-amber-500/10' };
  return { emoji: '\uD83D\uDFE2', label: 'Low', color: 'text-green-400', bg: 'bg-green-500/10' };
};

const STARTER_PROMPTS = [
  { label: 'Highest-commission products', prompt: 'Ideas for my highest-commission products', icon: Trophy },
  { label: 'Quick 15-second videos', prompt: 'Quick 15-second video ideas that are easy to film', icon: Zap },
  { label: 'Upcoming deadlines', prompt: 'Ideas for brands with upcoming campaign deadlines', icon: Clock },
  { label: 'Trending angles', prompt: 'Trending content angles that fit my niche and style', icon: TrendingUp },
];

const LS_KEY = 'flashflow_saved_ideas';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function loadSavedIdeas(): ContentIdea[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedIdeas(ideas: ContentIdea[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ideas));
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ContentIdeasPage() {
  // Base data (existing API)
  const [baseData, setBaseData] = useState<ContentIdeasData | null>(null);
  const [baseLoading, setBaseLoading] = useState(true);

  // AI ideas
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  // Filters & sort
  const [filterBrand, setFilterBrand] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterEffort, setFilterEffort] = useState('');
  const [sortBy, setSortBy] = useState<'priority' | 'effort' | 'brand'>('priority');
  const [showFilters, setShowFilters] = useState(false);

  // Brands for dropdown
  const [brands, setBrands] = useState<Brand[]>([]);

  // Saved ideas
  const [savedIdeas, setSavedIdeas] = useState<ContentIdea[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);

  // Action states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pipelineAdded, setPipelineAdded] = useState<Set<string>>(new Set());
  const [pipelineAdding, setPipelineAdding] = useState<string | null>(null);

  // Load base data + brands
  useEffect(() => {
    Promise.all([
      fetch('/api/content-ideas').then(r => r.json()).catch(() => null),
      fetch('/api/admin/brands').then(r => r.json()).catch(() => null),
    ]).then(([ideasData, brandsData]) => {
      if (ideasData?.ok) setBaseData(ideasData.data);
      if (brandsData?.brands || brandsData?.data) {
        const list = brandsData.brands || brandsData.data || [];
        setBrands(list.map((b: any) => ({ id: b.id, name: b.name })));
      }
      setBaseLoading(false);
    });

    setSavedIdeas(loadSavedIdeas());
  }, []);

  // Generate ideas
  const generate = useCallback(async (starterPrompt?: string) => {
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/content-ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          brand: filterBrand || undefined,
          content_type: filterType || undefined,
          starter_prompt: starterPrompt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || 'Failed to generate ideas');
        return;
      }
      setIdeas(data.ideas || []);
    } catch {
      setGenError('Network error. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [filterBrand, filterType]);

  // Copy hook
  const copyHook = useCallback((hook: string, id: string) => {
    navigator.clipboard.writeText(hook);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Save idea
  const toggleSave = useCallback((idea: ContentIdea) => {
    setSavedIdeas(prev => {
      const exists = prev.some(s => s.id === idea.id);
      const next = exists ? prev.filter(s => s.id !== idea.id) : [...prev, idea];
      persistSavedIdeas(next);
      return next;
    });
  }, []);

  // Add to pipeline
  const addToPipeline = useCallback(async (idea: ContentIdea) => {
    setPipelineAdding(idea.id);
    try {
      const res = await fetch('/api/admin/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: idea.title,
          script_text: `Hook: ${idea.hook}\n\n${idea.format_notes}\n\nOn-screen text: ${idea.on_screen_text}`,
          status: 'SCRIPT_READY',
        }),
      });
      if (res.ok) {
        setPipelineAdded(prev => new Set([...prev, idea.id]));
      }
    } catch (e) {
      console.error('Failed to add to pipeline:', e);
    } finally {
      setPipelineAdding(null);
    }
  }, []);

  // Filter and sort ideas
  const filteredIdeas = useMemo(() => {
    let list = [...ideas];
    if (filterBrand) list = list.filter(i => i.target_brand?.toLowerCase() === filterBrand.toLowerCase());
    if (filterType) list = list.filter(i => i.content_type.toLowerCase().includes(filterType.toLowerCase()));
    if (filterEffort) list = list.filter(i => i.effort === filterEffort);

    if (sortBy === 'priority') list.sort((a, b) => b.priority - a.priority);
    else if (sortBy === 'effort') {
      const order = { quick: 0, medium: 1, production: 2 };
      list.sort((a, b) => order[a.effort] - order[b.effort]);
    } else if (sortBy === 'brand') {
      list.sort((a, b) => (a.target_brand || 'zzz').localeCompare(b.target_brand || 'zzz'));
    }
    return list;
  }, [ideas, filterBrand, filterType, filterEffort, sortBy]);

  const savedIdSet = useMemo(() => new Set(savedIdeas.map(s => s.id)), [savedIdeas]);

  // Get unique content types from current ideas
  const contentTypes = useMemo(() => [...new Set(ideas.map(i => i.content_type))], [ideas]);

  return (
    <AdminPageLayout
      title="Content Ideas"
      subtitle="AI-powered content suggestions based on your data"
      headerActions={
        <Link href="/admin/content-studio">
          <AdminButton variant="primary" size="sm">
            <Sparkles size={16} className="mr-1.5" />
            Content Studio
          </AdminButton>
        </Link>
      }
    >
      <div className="space-y-6">
        {/* Stats Row */}
        {baseLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-zinc-500" />
          </div>
        ) : baseData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Winners',  value: baseData.stats.totalWinners,  icon: Trophy,   color: 'text-amber-400' },
              { label: 'Personas', value: baseData.stats.totalPersonas, icon: Users,    color: 'text-teal-400' },
              { label: 'Products', value: baseData.stats.totalProducts, icon: Package,  color: 'text-emerald-400' },
              { label: 'Scripts',  value: baseData.stats.totalScripts,  icon: FileText, color: 'text-violet-400' },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon size={14} className={stat.color} />
                  <span className="text-xs text-zinc-500">{stat.label}</span>
                </div>
                <p className="text-xl font-semibold text-zinc-100">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ─── Generate Section ───────────────────────────────────────── */}
        <AdminCard>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Lightbulb size={20} className="text-amber-400" />
                AI Content Ideas
              </h3>
              <p className="text-sm text-zinc-400 mt-1">
                Generate personalized video ideas based on your brands, products, and performance data
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-white/5"
              >
                <Filter size={14} />
                Filters
                {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <AdminButton
                variant="primary"
                onClick={() => generate()}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-1.5" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} className="mr-1.5" />
                    {ideas.length > 0 ? 'Regenerate' : 'Generate Ideas'}
                  </>
                )}
              </AdminButton>
            </div>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">Brand</label>
                <select
                  value={filterBrand}
                  onChange={e => setFilterBrand(e.target.value)}
                  className="w-full h-9 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none appearance-none"
                >
                  <option value="">All brands</option>
                  {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">Content Type</label>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="w-full h-9 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none appearance-none"
                >
                  <option value="">All types</option>
                  {contentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">Effort</label>
                <select
                  value={filterEffort}
                  onChange={e => setFilterEffort(e.target.value)}
                  className="w-full h-9 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none appearance-none"
                >
                  <option value="">Any effort</option>
                  <option value="quick">Quick</option>
                  <option value="medium">Medium</option>
                  <option value="production">Production</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">Sort By</label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="w-full h-9 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none appearance-none"
                >
                  <option value="priority">Priority</option>
                  <option value="effort">Effort</option>
                  <option value="brand">Brand</option>
                </select>
              </div>
            </div>
          )}
        </AdminCard>

        {/* Error */}
        {genError && (
          <AdminCard>
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle size={20} />
              <p className="text-sm">{genError}</p>
            </div>
          </AdminCard>
        )}

        {/* ─── Starter Prompts (before any ideas generated) ───────────── */}
        {ideas.length === 0 && !generating && (
          <AdminCard title="Quick Start" subtitle="Click a prompt to generate targeted ideas">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STARTER_PROMPTS.map(sp => (
                <button
                  key={sp.label}
                  onClick={() => generate(sp.prompt)}
                  className="flex items-center gap-3 rounded-lg border border-white/5 bg-zinc-800/40 hover:bg-zinc-800 hover:border-white/10 px-4 py-3 text-left transition-colors group"
                >
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <sp.icon size={16} className="text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{sp.label}</p>
                    <p className="text-xs text-zinc-500 truncate">{sp.prompt}</p>
                  </div>
                  <ArrowRight size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </AdminCard>
        )}

        {/* ─── Generating Spinner ─────────────────────────────────────── */}
        {generating && (
          <AdminCard>
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={28} className="animate-spin text-amber-400" />
              <p className="text-sm text-zinc-400">Analyzing your data and generating personalized ideas...</p>
              <p className="text-xs text-zinc-600">This usually takes 10-20 seconds</p>
            </div>
          </AdminCard>
        )}

        {/* ─── Ideas Grid ─────────────────────────────────────────────── */}
        {filteredIdeas.length > 0 && !generating && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                {filteredIdeas.length} Idea{filteredIdeas.length !== 1 ? 's' : ''}
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredIdeas.map(idea => {
                const priority = PRIORITY_CONFIG(idea.priority);
                const effort = EFFORT_CONFIG[idea.effort] || EFFORT_CONFIG.medium;
                const isSaved = savedIdSet.has(idea.id);
                const isAdded = pipelineAdded.has(idea.id);
                const isAdding = pipelineAdding === idea.id;

                return (
                  <div
                    key={idea.id}
                    className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 hover:border-white/15 transition-colors"
                  >
                    {/* Header: priority + title */}
                    <div className="flex items-start gap-3 mb-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${priority.bg} ${priority.color} shrink-0 mt-0.5`}>
                        {priority.emoji} {idea.priority}
                      </span>
                      <h4 className="text-sm font-semibold text-white leading-snug flex-1">{idea.title}</h4>
                      <button
                        onClick={() => toggleSave(idea)}
                        className={`shrink-0 p-1 rounded transition-colors ${isSaved ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'}`}
                        title={isSaved ? 'Remove from saved' : 'Save for later'}
                      >
                        {isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                      </button>
                    </div>

                    {/* Hook */}
                    <div className="bg-zinc-800/60 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
                      <p className="text-sm text-zinc-200 font-medium flex-1 leading-relaxed">
                        &ldquo;{idea.hook}&rdquo;
                      </p>
                      <button
                        onClick={() => copyHook(idea.hook, idea.id)}
                        className="shrink-0 p-1 text-zinc-500 hover:text-white transition-colors"
                        title="Copy hook"
                      >
                        {copiedId === idea.id ? <Check size={14} className="text-green-400" /> : <Clipboard size={14} />}
                      </button>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="px-2 py-0.5 rounded-full text-xs border bg-violet-500/10 border-violet-500/20 text-violet-400">
                        {idea.content_type}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${effort.bgColor} ${effort.color}`}>
                        {effort.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs border bg-zinc-800 border-white/10 text-zinc-400">
                        {idea.estimated_duration}
                      </span>
                      {idea.target_brand && (
                        <span className="px-2 py-0.5 rounded-full text-xs border bg-teal-500/10 border-teal-500/20 text-teal-400">
                          {idea.target_brand}
                        </span>
                      )}
                      {idea.target_product && (
                        <span className="px-2 py-0.5 rounded-full text-xs border bg-blue-500/10 border-blue-500/20 text-blue-400">
                          {idea.target_product}
                        </span>
                      )}
                    </div>

                    {/* Format notes */}
                    {idea.format_notes && (
                      <p className="text-xs text-zinc-500 mb-2 flex items-start gap-1.5">
                        <Play size={10} className="mt-0.5 shrink-0" />
                        {idea.format_notes}
                      </p>
                    )}

                    {/* Why it works */}
                    <p className="text-xs text-zinc-400 mb-3">
                      <span className="text-zinc-500 font-medium">Why: </span>
                      {idea.why_it_works}
                    </p>

                    {/* On-screen text */}
                    {idea.on_screen_text && (
                      <p className="text-xs text-zinc-500 mb-3">
                        <span className="font-medium">Text overlay: </span>
                        &ldquo;{idea.on_screen_text}&rdquo;
                      </p>
                    )}

                    {/* Hashtags */}
                    {idea.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {idea.hashtags.map((tag, j) => (
                          <span key={j} className="text-xs text-zinc-600">{tag}</span>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                      <Link
                        href={`/admin/content-studio?hook=${encodeURIComponent(idea.hook)}&inspiration=${encodeURIComponent(idea.format_notes || idea.title)}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors"
                      >
                        Use in Studio <ArrowRight size={12} />
                      </Link>
                      {isAdded ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-400">
                          <Check size={12} /> Added
                        </span>
                      ) : (
                        <button
                          onClick={() => addToPipeline(idea)}
                          disabled={isAdding}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                          Pipeline
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Saved Ideas ────────────────────────────────────────────── */}
        {savedIdeas.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
            <button
              onClick={() => setSavedOpen(!savedOpen)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2">
                <BookmarkCheck size={18} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-white">
                  Saved Ideas ({savedIdeas.length})
                </h3>
              </div>
              {savedOpen ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
            </button>

            {savedOpen && (
              <div className="px-5 pb-5 space-y-2">
                {savedIdeas.map(idea => (
                  <div key={idea.id} className="flex items-start gap-3 rounded-lg border border-white/5 bg-zinc-800/40 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{idea.title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5 truncate">&ldquo;{idea.hook}&rdquo;</p>
                      <div className="flex gap-1.5 mt-1.5">
                        <span className="px-2 py-0.5 rounded-full text-xs border bg-violet-500/10 border-violet-500/20 text-violet-400">
                          {idea.content_type}
                        </span>
                        {idea.target_brand && (
                          <span className="px-2 py-0.5 rounded-full text-xs border bg-teal-500/10 border-teal-500/20 text-teal-400">
                            {idea.target_brand}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        href={`/admin/content-studio?hook=${encodeURIComponent(idea.hook)}&inspiration=${encodeURIComponent(idea.format_notes || idea.title)}`}
                        className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
                      >
                        Studio <ArrowRight size={10} className="inline" />
                      </Link>
                      <button
                        onClick={() => toggleSave(idea)}
                        className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Remove"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => {
                    setSavedIdeas([]);
                    persistSavedIdeas([]);
                  }}
                  className="text-xs text-zinc-600 hover:text-red-400 transition-colors mt-2"
                >
                  Clear all saved ideas
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── Trending Data (existing) ───────────────────────────────── */}
        {baseData && (baseData.trendingHooks.length > 0 || baseData.topPersonas.length > 0) && (
          <AdminCard
            title="Trending Angles"
            subtitle="Top performing hooks and personas from your winners and scripts"
          >
            <div className="space-y-6">
              {baseData.trendingHooks.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Zap size={12} />
                    Top Performing Hooks
                  </h4>
                  <div className="space-y-2">
                    {baseData.trendingHooks.map((hook, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 rounded-lg border border-white/5 bg-zinc-800/40 px-4 py-3 group hover:border-white/10 transition-colors"
                      >
                        <span className="text-lg font-bold text-zinc-600 mt-0.5 w-5 text-right shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 leading-relaxed">&ldquo;{hook.hookText}&rdquo;</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full text-xs border bg-orange-500/10 border-orange-500/20 text-orange-400 capitalize">
                              {hook.hookType}
                            </span>
                            {hook.category && <span className="text-xs text-zinc-500">{hook.category}</span>}
                            {hook.viewCount != null && hook.viewCount > 0 && (
                              <span className="text-xs text-zinc-500">
                                {hook.viewCount >= 1000 ? `${(hook.viewCount / 1000).toFixed(1)}K` : hook.viewCount} views
                              </span>
                            )}
                          </div>
                        </div>
                        <Link
                          href={`/admin/content-studio?inspiration=${encodeURIComponent(hook.hookText)}`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                          <AdminButton variant="secondary" size="sm">
                            Use this <ArrowRight size={12} className="ml-1" />
                          </AdminButton>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {baseData.topPersonas.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Target size={12} />
                    Top Performing Personas
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {baseData.topPersonas.map((persona, idx) => (
                      <div key={idx} className="rounded-lg border border-white/10 bg-zinc-800/40 px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-zinc-100">{persona.personaName}</h5>
                          {persona.avgScore > 0 && (
                            <span className="text-xs font-mono text-emerald-400">{persona.avgScore.toFixed(1)}</span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mb-2">{persona.scriptCount} script{persona.scriptCount !== 1 ? 's' : ''} scored</p>
                        <Link href="/admin/content-studio" className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300">
                          Use this persona <ArrowRight size={10} />
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AdminCard>
        )}

        {/* ─── Suggestions (existing) ─────────────────────────────────── */}
        {baseData && baseData.suggestions.length > 0 && (
          <AdminCard title="Suggestions" subtitle="Smart recommendations to improve your content output">
            <div className="space-y-2">
              {baseData.suggestions.map((suggestion, idx) => (
                <div key={idx} className="flex items-start gap-3 rounded-lg border border-white/5 bg-zinc-800/40 px-4 py-3">
                  <div className="mt-0.5 shrink-0">
                    <Lightbulb size={16} className="text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{suggestion.title}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{suggestion.message}</p>
                  </div>
                  {suggestion.action && (
                    <Link href={suggestion.action.href} className="shrink-0">
                      <AdminButton variant="secondary" size="sm">
                        {suggestion.action.label}
                        <ArrowRight size={12} className="ml-1" />
                      </AdminButton>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </AdminCard>
        )}
      </div>
    </AdminPageLayout>
  );
}
