'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface SearchResult {
  id: string;
  type: 'script' | 'persona' | 'product' | 'template' | 'action';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  href?: string;
  action?: () => void;
}

const QUICK_ACTIONS: SearchResult[] = [
  {
    id: 'action-generate',
    type: 'action',
    title: 'Generate new script',
    subtitle: 'Create a new AI-powered script',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    href: '/admin/skit-generator',
  },
  {
    id: 'action-persona',
    type: 'action',
    title: 'Create persona',
    subtitle: 'Add a new audience persona',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>,
    href: '/admin/audience',
  },
  {
    id: 'action-templates',
    type: 'action',
    title: 'Browse templates',
    subtitle: 'View content templates',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>,
    href: '/admin/templates',
  },
  {
    id: 'action-library',
    type: 'action',
    title: 'View script library',
    subtitle: 'Browse saved scripts',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>,
    href: '/admin/skit-library',
  },
  {
    id: 'action-settings',
    type: 'action',
    title: 'Settings',
    subtitle: 'Account and preferences',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    href: '/admin/settings',
  },
];

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('flashflow-recent-searches');
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch { /* ignore */ }
    }
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search when query changes
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setLoading(true);
      try {
        const searchResults: SearchResult[] = [];

        // Search scripts
        const skitsRes = await fetch(`/api/skits?search=${encodeURIComponent(query)}&limit=5`);
        if (skitsRes.ok) {
          const skitsData = await skitsRes.json();
          (skitsData.data || []).forEach((skit: { id: string; title: string; product_name?: string }) => {
            searchResults.push({
              id: `skit-${skit.id}`,
              type: 'script',
              title: skit.title,
              subtitle: skit.product_name || 'Script',
              icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
              href: '/admin/skit-library',
            });
          });
        }

        // Search personas
        const personasRes = await fetch(`/api/audience/personas?search=${encodeURIComponent(query)}&limit=3`);
        if (personasRes.ok) {
          const personasData = await personasRes.json();
          (personasData.data || []).forEach((persona: { id: string; name: string; description?: string }) => {
            searchResults.push({
              id: `persona-${persona.id}`,
              type: 'persona',
              title: persona.name,
              subtitle: persona.description?.slice(0, 50) || 'Persona',
              icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
              href: '/admin/audience',
            });
          });
        }

        // Filter quick actions by query
        const matchingActions = QUICK_ACTIONS.filter(action =>
          action.title.toLowerCase().includes(query.toLowerCase()) ||
          action.subtitle?.toLowerCase().includes(query.toLowerCase())
        );

        setResults([...matchingActions.slice(0, 2), ...searchResults]);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(searchTimeout);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = query ? results : QUICK_ACTIONS;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        const selected = items[selectedIndex];
        if (selected) {
          handleSelect(selected);
        }
        break;
      case 'Escape':
        onClose();
        break;
    }
  }, [query, results, selectedIndex, onClose]);

  const handleSelect = (result: SearchResult) => {
    // Save to recent searches
    if (query.trim()) {
      const newRecent = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
      setRecentSearches(newRecent);
      localStorage.setItem('flashflow-recent-searches', JSON.stringify(newRecent));
    }

    if (result.action) {
      result.action();
    } else if (result.href) {
      router.push(result.href);
    }
    onClose();
  };

  if (!isOpen) return null;

  const displayResults = query ? results : QUICK_ACTIONS;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Search Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search scripts, personas, or type a command..."
            className="flex-1 bg-transparent text-white placeholder-zinc-500 focus:outline-none text-lg"
          />
          <kbd className="px-2 py-1 text-xs bg-zinc-800 border border-white/10 rounded text-zinc-500">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-auto">
          {loading && (
            <div className="p-4 text-center text-zinc-500">
              Searching...
            </div>
          )}

          {!loading && displayResults.length === 0 && query && (
            <div className="p-8 text-center text-zinc-500">
              No results found for "{query}"
            </div>
          )}

          {!loading && displayResults.length > 0 && (
            <div className="py-2">
              {!query && (
                <div className="px-4 py-2 text-xs text-zinc-500 uppercase tracking-wider">
                  Quick Actions
                </div>
              )}
              {displayResults.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                    index === selectedIndex
                      ? 'bg-violet-500/20 text-white'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <div className={`flex-shrink-0 ${index === selectedIndex ? 'text-violet-400' : 'text-zinc-500'}`}>
                    {result.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{result.title}</div>
                    {result.subtitle && (
                      <div className="text-sm text-zinc-500 truncate">{result.subtitle}</div>
                    )}
                  </div>
                  <span className="flex-shrink-0 px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-500 capitalize">
                    {result.type}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Recent Searches */}
          {!query && recentSearches.length > 0 && (
            <div className="border-t border-white/10 py-2">
              <div className="px-4 py-2 text-xs text-zinc-500 uppercase tracking-wider">
                Recent Searches
              </div>
              {recentSearches.map((search, index) => (
                <button
                  key={index}
                  onClick={() => setQuery(search)}
                  className="w-full px-4 py-2 flex items-center gap-3 text-left text-zinc-400 hover:bg-zinc-800"
                >
                  <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{search}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10 flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↑↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">Enter</kbd>
            Select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">Esc</kbd>
            Close
          </span>
        </div>
      </div>
    </div>
  );
}

// Hook to manage global search state
export function useGlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}
