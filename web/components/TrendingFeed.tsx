'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, ExternalLink, Eye, DollarSign, Sparkles, Image as ImageIcon } from 'lucide-react';

interface TrendingItem {
  id: string;
  rank: number;
  product_name: string;
  product_id: string | null;
  category: string | null;
  gmv_velocity: string | null;
  views: string | null;
  hook_text: string | null;
  visual_tags: string[] | null;
  source_url: string;
  screenshot_urls: string[] | null;
  creator_style_id: string | null;
  raw: { thumbnail_url?: string } | null;
}

interface TrendingFeedProps {
  /** Pre-fetched items from server — skips client fetch if provided */
  initialItems?: TrendingItem[];
  initialDate?: string;
}

export default function TrendingFeed({ initialItems, initialDate }: TrendingFeedProps) {
  const [items, setItems] = useState<TrendingItem[]>(initialItems ?? []);
  const [date, setDate] = useState(initialDate ?? '');
  const [loading, setLoading] = useState(!initialItems);
  const [error, setError] = useState<string | null>(null);
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/flashflow/trending');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setDate(data.date ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialItems) fetchItems();
  }, [initialItems, fetchItems]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-zinc-800 rounded w-1/3" />
                <div className="h-3 bg-zinc-800 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <TrendingUp className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-400">Failed to load trending products</p>
        <button
          onClick={fetchItems}
          className="mt-3 text-sm text-teal-400 hover:text-teal-300"
        >
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <TrendingUp className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-400">No trending products yet</p>
        <p className="text-xs text-zinc-600 mt-1">Data appears after the Daily Virals scraper runs</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {date && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-zinc-500">Data from {date}</span>
          <button
            onClick={fetchItems}
            className="text-xs text-teal-500 hover:text-teal-400"
          >
            Refresh
          </button>
        </div>
      )}

      {items.map(item => {
        const thumbnail = item.screenshot_urls?.[0] || (item.raw as Record<string, string> | null)?.thumbnail_url;

        return (
          <div
            key={item.id}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-4 hover:border-zinc-700 transition-colors"
          >
            {/* Rank badge */}
            <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-teal-400">#{item.rank}</span>
            </div>

            {/* Thumbnail */}
            {thumbnail && (
              <button
                type="button"
                onClick={() => setExpandedScreenshot(expandedScreenshot === thumbnail ? null : thumbnail)}
                className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-zinc-700 hover:border-teal-500 transition-colors"
              >
                <img
                  src={thumbnail}
                  alt={item.product_name}
                  className="w-full h-full object-cover"
                />
              </button>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-white truncate">
                  {item.product_name}
                </span>
                {item.category && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    {item.category}
                  </span>
                )}
                {item.creator_style_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5" /> Fingerprinted
                  </span>
                )}
              </div>

              {/* Hook text */}
              {item.hook_text && (
                <p className="text-xs text-zinc-400 mt-1 line-clamp-2 italic">
                  &ldquo;{item.hook_text}&rdquo;
                </p>
              )}

              {/* Metrics row */}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500">
                {item.views && (
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" /> {item.views}
                  </span>
                )}
                {item.gmv_velocity && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> {item.gmv_velocity}
                  </span>
                )}
                {item.screenshot_urls && item.screenshot_urls.length > 0 && (
                  <span className="flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> {item.screenshot_urls.length} screenshot{item.screenshot_urls.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Visual tags */}
              {item.visual_tags && item.visual_tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {item.visual_tags.map((tag, i) => (
                    <span key={i} className="text-[10px] px-1 py-0.5 rounded bg-zinc-800/50 text-zinc-500">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Source link */}
            {item.source_url && (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-1.5 text-zinc-600 hover:text-teal-400 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        );
      })}

      {/* Expanded screenshot overlay */}
      {expandedScreenshot && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setExpandedScreenshot(null)}
        >
          <img
            src={expandedScreenshot}
            alt="Screenshot"
            className="max-w-full max-h-[90vh] rounded-lg border border-zinc-700"
          />
        </div>
      )}
    </div>
  );
}
