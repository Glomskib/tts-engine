'use client';

import { useState, useEffect } from 'react';
import { Star, Sparkles, Wrench, Bug, Megaphone } from 'lucide-react';

interface ChangelogEntry {
  id: string;
  title: string;
  description: string;
  category: 'feature' | 'improvement' | 'fix' | 'announcement';
  is_major: boolean;
  created_at: string;
}

const CATEGORY_CONFIG = {
  feature: { label: 'Feature', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: Sparkles },
  improvement: { label: 'Improvement', color: 'bg-teal-500/15 text-teal-400 border-teal-500/20', icon: Wrench },
  fix: { label: 'Fix', color: 'bg-orange-500/15 text-orange-400 border-orange-500/20', icon: Bug },
  announcement: { label: 'Announcement', color: 'bg-purple-500/15 text-teal-400 border-purple-500/20', icon: Megaphone },
} as const;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function groupByDate(entries: ChangelogEntry[]): Record<string, ChangelogEntry[]> {
  const groups: Record<string, ChangelogEntry[]> = {};
  for (const entry of entries) {
    const key = new Date(entry.created_at).toISOString().split('T')[0];
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }
  return groups;
}

export default function WhatsNewPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Mark as seen for the "new" dot indicator
    localStorage.setItem('ffai-changelog-last-seen', new Date().toISOString());

    async function fetchChangelog() {
      try {
        const res = await fetch('/api/admin/changelog');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setEntries(data.entries);
      } catch {
        setError('Could not load changelog.');
      } finally {
        setLoading(false);
      }
    }

    fetchChangelog();
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-24 lg:pb-8">
        <div className="mb-8">
          <div className="h-8 w-48 bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-4 w-72 bg-zinc-800/60 rounded mt-3 animate-pulse" />
        </div>
        <div className="space-y-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-px bg-zinc-800 shrink-0 ml-3" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-64 bg-zinc-800 rounded animate-pulse" />
                <div className="h-4 w-full bg-zinc-800/40 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-24 lg:pb-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">What&apos;s New</h1>
        <div className="mt-8 p-6 rounded-xl bg-zinc-900 border border-zinc-800 text-center">
          <p className="text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  const grouped = groupByDate(entries);
  const dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="max-w-3xl mx-auto px-4 pt-8 pb-24 lg:pb-8">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-zinc-100">What&apos;s New</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Recent updates, features, and improvements to FlashFlow AI.
        </p>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-0 w-px bg-zinc-800" />

        {dateKeys.map((dateKey) => (
          <div key={dateKey} className="mb-10">
            {/* Date header */}
            <div className="flex items-center gap-3 mb-5 relative">
              <div className="w-[15px] h-[15px] rounded-full bg-zinc-800 border-2 border-zinc-700 z-10 shrink-0" />
              <span className="text-sm font-semibold text-zinc-300">
                {formatDate(dateKey)}
              </span>
            </div>

            {/* Entries for this date */}
            <div className="ml-[30px] space-y-3">
              {grouped[dateKey].map((entry) => {
                const config = CATEGORY_CONFIG[entry.category];
                const Icon = config.icon;

                return (
                  <div
                    key={entry.id}
                    className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${config.color}`}>
                          <Icon size={12} />
                          {config.label}
                        </span>
                        {entry.is_major && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            <Star size={12} />
                            Major
                          </span>
                        )}
                      </div>
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-100 mt-2">
                      {entry.title}
                    </h3>
                    <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
                      {entry.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {entries.length === 0 && (
          <div className="text-center py-12">
            <p className="text-zinc-500">No changelog entries yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
