'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Package,
  FileText,
  Trophy,
  Video,
  Users,
  LayoutTemplate,
  Clock,
  X,
  ArrowRight,
  LayoutDashboard,
  MessageSquareText,
  Clapperboard,
  BookOpen,
  Settings,
  CalendarClock,
  ListChecks,
  Eye,
  CreditCard,
  Building2,
  UserCircle,
  Lightbulb,
  Sparkles,
} from 'lucide-react';

interface SearchResult {
  id: string;
  type: 'brand' | 'product' | 'persona' | 'concept' | 'hook' | 'script' | 'winner' | 'video' | 'competitor' | 'template';
  title: string;
  subtitle?: string;
  href: string;
}

const TYPE_CONFIG: Record<SearchResult['type'], { icon: typeof Search; label: string; color: string }> = {
  brand: { icon: Building2, label: 'Brands', color: 'text-orange-400' },
  product: { icon: Package, label: 'Products', color: 'text-teal-400' },
  persona: { icon: UserCircle, label: 'Personas', color: 'text-pink-400' },
  concept: { icon: Lightbulb, label: 'Concepts', color: 'text-amber-400' },
  hook: { icon: Sparkles, label: 'Hooks', color: 'text-cyan-400' },
  script: { icon: FileText, label: 'Scripts', color: 'text-green-400' },
  winner: { icon: Trophy, label: 'Winners', color: 'text-yellow-400' },
  video: { icon: Video, label: 'Pipeline', color: 'text-teal-400' },
  competitor: { icon: Users, label: 'Competitors', color: 'text-red-400' },
  template: { icon: LayoutTemplate, label: 'Templates', color: 'text-teal-400' },
};

interface PageEntry {
  name: string;
  href: string;
  icon: typeof Search;
  keywords: string[];
}

const PAGES: PageEntry[] = [
  { name: 'Transcriber', href: '/transcribe', icon: MessageSquareText, keywords: ['transcribe', 'tiktok', 'video', 'transcript'] },
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, keywords: ['home', 'overview', 'stats'] },
  { name: 'Pipeline', href: '/admin/pipeline', icon: Video, keywords: ['videos', 'render', 'queue', 'recording'] },
  { name: 'Content Studio', href: '/admin/content-studio', icon: Clapperboard, keywords: ['studio', 'compose', 'create', 'content'] },
  { name: 'Skit Library', href: '/admin/skit-library', icon: BookOpen, keywords: ['scripts', 'skits', 'library', 'browse'] },
  { name: 'Products', href: '/admin/products', icon: Package, keywords: ['product', 'brand', 'catalog'] },
  { name: 'Winners Bank', href: '/admin/winners', icon: Trophy, keywords: ['winners', 'bank', 'winning', 'hooks'] },
  { name: 'Audience', href: '/admin/audience', icon: Users, keywords: ['audience', 'persona', 'target', 'demographic'] },
  { name: 'Settings', href: '/admin/settings', icon: Settings, keywords: ['settings', 'config', 'preferences', 'account'] },
  { name: 'Posting Queue', href: '/admin/posting-queue', icon: CalendarClock, keywords: ['posting', 'queue', 'schedule', 'post'] },
  { name: 'Tasks', href: '/admin/tasks', icon: ListChecks, keywords: ['tasks', 'todo', 'checklist'] },
  { name: 'Review', href: '/admin/review', icon: Eye, keywords: ['review', 'approve', 'moderate'] },
  { name: 'Billing', href: '/admin/billing', icon: CreditCard, keywords: ['billing', 'plan', 'subscription', 'payment', 'upgrade'] },
];

const RECENT_KEY = 'ff_recent_searches';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const recent = getRecentSearches().filter(q => q !== query);
  recent.unshift(query);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [matchedPages, setMatchedPages] = useState<PageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Total navigable items = pages + content results
  const totalItems = matchedPages.length + results.length;

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Search across endpoints
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setMatchedPages([]);
      return;
    }

    const lower = q.toLowerCase();

    // Filter pages instantly (no API call needed)
    const pages = PAGES.filter(p =>
      p.name.toLowerCase().includes(lower) ||
      p.keywords.some(k => k.includes(lower))
    );
    setMatchedPages(pages);

    setLoading(true);

    try {
      const fetchJson = (url: string) => fetch(url).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] }));

      const [brandsRes, productsRes, personasRes, conceptsRes, hooksRes, scriptsRes, winnersRes, videosRes, competitorsRes, templatesRes] = await Promise.all([
        fetchJson('/api/brands'),
        fetchJson('/api/products'),
        fetchJson('/api/audience/personas'),
        fetchJson('/api/concepts'),
        fetchJson('/api/hooks'),
        fetchJson('/api/scripts'),
        fetchJson('/api/admin/winners-bank'),
        fetchJson('/api/admin/videos?limit=50'),
        fetchJson('/api/competitors'),
        fetchJson('/api/admin/templates'),
      ]);

      const matched: SearchResult[] = [];
      const matches = (text: string | null | undefined) => (text || '').toLowerCase().includes(lower);

      // Brands
      for (const b of brandsRes.data || []) {
        if (matches(b.name) || matches(b.description) || matches(b.target_audience)) {
          matched.push({ id: b.id, type: 'brand', title: b.name, subtitle: b.description?.slice(0, 60) || '', href: '/admin/products' });
        }
      }

      // Products
      for (const p of productsRes.data || []) {
        if (matches(p.name) || matches(p.brand) || matches(p.category) || matches(p.description)) {
          matched.push({ id: p.id, type: 'product', title: p.name, subtitle: p.brand || '', href: '/admin/products' });
        }
      }

      // Personas
      for (const p of personasRes.data || []) {
        if (matches(p.name) || matches(p.description) || matches(p.life_stage) || (p.interests || []).some((i: string) => matches(i))) {
          matched.push({ id: p.id, type: 'persona', title: p.name, subtitle: p.description?.slice(0, 60) || '', href: '/admin/audience' });
        }
      }

      // Concepts
      for (const c of conceptsRes.data || []) {
        const title = c.concept_title || c.title || `Concept ${c.id?.slice(0, 8)}`;
        if (matches(title) || matches(c.core_angle) || matches(c.notes)) {
          matched.push({ id: c.id, type: 'concept', title, subtitle: c.core_angle?.slice(0, 60) || '', href: '/admin/content-studio' });
        }
      }

      // Hooks
      for (const h of hooksRes.data || []) {
        if (matches(h.hook_text) || matches(h.hook_style)) {
          matched.push({ id: h.id, type: 'hook', title: h.hook_text, subtitle: h.hook_style || '', href: '/admin/content-studio' });
        }
      }

      // Scripts
      for (const s of scriptsRes.data || []) {
        const title = s.title || s.hook || `Script ${s.id?.slice(0, 8)}`;
        if (matches(title) || matches(s.hook) || matches(s.spoken_script) || matches(s.product_name)) {
          matched.push({ id: s.id, type: 'script', title, subtitle: s.product_name || '', href: '/admin/skit-library' });
        }
      }

      // Winners
      for (const w of winnersRes.data || []) {
        const title = w.hook || w.title || `Winner ${w.id?.slice(0, 8)}`;
        if (matches(title) || matches(w.product_name) || matches(w.full_script) || matches(w.hook_type)) {
          matched.push({ id: w.id, type: 'winner', title, subtitle: w.product_name || '', href: '/admin/winners' });
        }
      }

      // Videos (pipeline)
      for (const v of videosRes.data || []) {
        const title = v.video_code || v.title || `Video ${v.id?.slice(0, 8)}`;
        if (matches(title) || matches(v.product_name) || matches(v.brand_name) || matches(v.recording_status)) {
          matched.push({ id: v.id, type: 'video', title, subtitle: v.product_name || v.recording_status || '', href: '/admin/pipeline' });
        }
      }

      // Competitors
      for (const c of competitorsRes.data || []) {
        if (matches(c.name) || matches(c.handle) || matches(c.platform)) {
          matched.push({ id: c.id, type: 'competitor', title: c.name || c.handle, subtitle: c.platform || '', href: '/admin/competitors' });
        }
      }

      // Templates
      for (const t of templatesRes.data || []) {
        if (matches(t.name) || matches(t.category) || (t.tags || []).some((tag: string) => matches(tag))) {
          matched.push({ id: t.id, type: 'template', title: t.name, subtitle: t.category || '', href: '/admin/templates' });
        }
      }

      setResults(matched.slice(0, 30));
      setSelectedIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const navigateTo = (href: string) => {
    if (query) saveRecentSearch(query);
    setOpen(false);
    router.push(href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, totalItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && totalItems > 0) {
      if (selectedIndex < matchedPages.length) {
        navigateTo(matchedPages[selectedIndex].href);
      } else {
        const result = results[selectedIndex - matchedPages.length];
        if (result) navigateTo(result.href);
      }
    }
  };

  // Group results by type
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="relative mx-auto mt-[15vh] w-full max-w-xl">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-zinc-800">
            <Search className="w-5 h-5 text-zinc-500 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search brands, products, scripts, hooks, personas..."
              className="flex-1 py-4 bg-transparent text-white placeholder:text-zinc-500 outline-none text-base"
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              {loading && <div className="w-4 h-4 border-2 border-zinc-600 border-t-teal-400 rounded-full animate-spin" />}
              <button onClick={() => setOpen(false)} className="p-1 text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto">
            {query.length < 2 && recentSearches.length > 0 && (
              <div className="p-3">
                <p className="text-xs font-medium text-zinc-500 uppercase px-2 mb-2">Recent Searches</p>
                {recentSearches.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(q)}
                    className="flex items-center gap-3 w-full px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    {q}
                  </button>
                ))}
              </div>
            )}

            {query.length >= 2 && matchedPages.length === 0 && results.length === 0 && !loading && (
              <div className="py-12 text-center text-zinc-500">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No results for &quot;{query}&quot;</p>
              </div>
            )}

            {/* Pages / Go to... */}
            {matchedPages.length > 0 && (
              <div className="p-2">
                <p className="text-xs font-medium uppercase px-3 py-1 text-teal-400">
                  Go to...
                </p>
                {matchedPages.map((page, i) => {
                  const PageIcon = page.icon;
                  return (
                    <button
                      key={page.href}
                      onClick={() => navigateTo(page.href)}
                      className={`flex items-center gap-3 w-full px-3 py-2.5 text-left rounded-lg transition-colors ${
                        i === selectedIndex
                          ? 'bg-teal-500/20 text-white'
                          : 'text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <PageIcon className="w-4 h-4 flex-shrink-0 text-teal-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{page.name}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Content results */}
            {Object.entries(grouped).map(([type, items]) => {
              const config = TYPE_CONFIG[type as SearchResult['type']];
              const Icon = config.icon;
              return (
                <div key={type} className="p-2">
                  <p className={`text-xs font-medium uppercase px-3 py-1 ${config.color}`}>
                    {config.label}
                  </p>
                  {items.map((result) => {
                    const globalIdx = results.indexOf(result) + matchedPages.length;
                    return (
                      <button
                        key={result.id}
                        onClick={() => navigateTo(result.href)}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 text-left rounded-lg transition-colors ${
                          globalIdx === selectedIndex
                            ? 'bg-teal-500/20 text-white'
                            : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.title}</p>
                          {result.subtitle && (
                            <p className="text-xs text-zinc-500 truncate">{result.subtitle}</p>
                          )}
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-600">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono">↵</kbd> open</span>
              <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono">esc</kbd> close</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
