'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Trophy, Loader2, RefreshCw, Sparkles, Filter,
  TrendingUp, Users, Eye, MessageCircle,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface WinnerPattern {
  id: string;
  platform: string;
  product_id: string | null;
  product_name: string | null;
  hook_text: string | null;
  format_tag: string | null;
  length_bucket: string | null;
  cta_tag: string | null;
  score: number;
  sample_size: number;
  avg_views: number;
  avg_engagement_rate: number;
  last_win_at: string | null;
}

const PLATFORM_OPTIONS = [
  { value: '', label: 'All Platforms' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
];

const FORMAT_OPTIONS = [
  { value: '', label: 'All Formats' },
  { value: 'ugc', label: 'UGC' },
  { value: 'voiceover', label: 'Voiceover' },
  { value: 'skit', label: 'Skit' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'review', label: 'Review' },
  { value: 'slideshow', label: 'Slideshow' },
  { value: 'story', label: 'Story' },
  { value: 'comparison', label: 'Comparison' },
  { value: 'transformation', label: 'Transformation' },
  { value: 'unboxing', label: 'Unboxing' },
  { value: 'trend', label: 'Trend' },
];

function ScorePill({ score }: { score: number }) {
  let color = 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
  if (score >= 80) color = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  else if (score >= 60) color = 'text-teal-400 bg-teal-500/10 border-teal-500/20';
  else if (score >= 40) color = 'text-amber-400 bg-amber-500/10 border-amber-500/20';

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${color}`}>
      <TrendingUp className="w-3 h-3" />
      {score}
    </span>
  );
}

function FormatBadge({ format }: { format: string | null }) {
  if (!format) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider bg-violet-500/10 text-violet-400 border border-violet-500/20">
      {format}
    </span>
  );
}

function LengthBadge({ bucket }: { bucket: string | null }) {
  if (!bucket) return null;
  const labels: Record<string, string> = {
    micro: '< 15s',
    short: '15–30s',
    medium: '30–60s',
    long: '60s+',
  };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
      {labels[bucket] || bucket}
    </span>
  );
}

export default function WinnersBankPage() {
  const { showSuccess, showError } = useToast();
  const [patterns, setPatterns] = useState<WinnerPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [platform, setPlatform] = useState('');
  const [formatTag, setFormatTag] = useState('');

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (platform) params.set('platform', platform);
      if (formatTag) params.set('format_tag', formatTag);

      const res = await fetch(`/api/intelligence/winner-patterns?${params}`);
      const json = await res.json();
      if (json.ok) {
        setPatterns(json.data || []);
      } else {
        showError(json.error || 'Failed to load patterns');
      }
    } catch {
      showError('Network error');
    } finally {
      setLoading(false);
    }
  }, [platform, formatTag, showError]);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const res = await fetch('/api/intelligence/winner-patterns', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        showSuccess(`Detected ${json.data.patterns_upserted} patterns from ${json.data.posts_analyzed} posts`);
        fetchPatterns();
      } else {
        showError(json.error || 'Detection failed');
      }
    } catch {
      showError('Network error');
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#09090b]/95 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                Winners Bank
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">Proven patterns from your top content</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border transition-colors ${
                  showFilters ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' : 'bg-zinc-800 text-zinc-400 border-white/10'
                }`}
              >
                <Filter className="w-4 h-4" />
              </button>
              <button
                onClick={handleDetect}
                disabled={detecting}
                className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-teal-500 text-white rounded-xl text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                {detecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">{detecting ? 'Detecting...' : 'Run Detection'}</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="px-3 py-2 min-h-[44px] bg-zinc-800 border border-white/10 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              >
                {PLATFORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select
                value={formatTag}
                onChange={(e) => setFormatTag(e.target.value)}
                className="px-3 py-2 min-h-[44px] bg-zinc-800 border border-white/10 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              >
                {FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-4 pb-24 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
          </div>
        ) : patterns.length === 0 ? (
          <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-8 text-center">
            <Trophy className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm font-medium">No winning patterns yet</p>
            <p className="text-zinc-600 text-xs mt-1">
              Post more content and track metrics, then run detection to discover your winning patterns.
            </p>
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="mt-4 px-6 py-3 min-h-[48px] bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-xl text-sm font-medium hover:bg-teal-500/20 transition-colors disabled:opacity-50"
            >
              {detecting ? 'Detecting...' : 'Run First Detection'}
            </button>
          </div>
        ) : (
          patterns.map((pattern) => (
            <div
              key={pattern.id}
              className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 space-y-3 hover:border-white/15 transition-colors"
            >
              {/* Hook text */}
              {pattern.hook_text && (
                <p className="text-sm text-white font-medium leading-relaxed">
                  &ldquo;{pattern.hook_text}&rdquo;
                </p>
              )}

              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2">
                <ScorePill score={pattern.score} />
                {pattern.product_name && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20">
                    {pattern.product_name}
                  </span>
                )}
                <FormatBadge format={pattern.format_tag} />
                <LengthBadge bucket={pattern.length_bucket} />
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-800 text-zinc-500 border border-zinc-700">
                  {pattern.platform}
                </span>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {pattern.sample_size} posts
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {pattern.avg_views >= 1000
                    ? `${(pattern.avg_views / 1000).toFixed(1)}k`
                    : pattern.avg_views
                  } avg views
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  {pattern.avg_engagement_rate.toFixed(1)}% eng
                </span>
              </div>

              {/* Use This button */}
              <Link
                href={`/admin/content-studio?${new URLSearchParams({
                  ...(pattern.hook_text ? { inspiration: pattern.hook_text } : {}),
                  ...(pattern.format_tag ? { format: pattern.format_tag } : {}),
                  ...(pattern.length_bucket ? { length: pattern.length_bucket } : {}),
                }).toString()}`}
                className="flex items-center justify-center gap-2 w-full py-3 min-h-[48px] bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-xl text-sm font-medium hover:bg-teal-500/20 active:bg-teal-500/30 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Use This Pattern
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
