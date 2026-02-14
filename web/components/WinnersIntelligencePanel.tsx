'use client';

import { useState, useEffect } from 'react';
import {
  Trophy,
  TrendingUp,
  Eye,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface WinnersIntelligence {
  totalWinners: number;
  ourScripts: number;
  references: number;
  avgViews: number;
  avgEngagement: number;
  totalViews: number;
  topHookTypes: Array<{ type: string; count: number; avgEngagement: number }>;
  topContentFormats: Array<{ format: string; count: number; avgEngagement: number }>;
  optimalVideoLength: { min: number; max: number; avg: number } | null;
  commonPatterns: string[];
  patternsToAvoid: string[];
  topHooks: Array<{ text: string; views: number; engagement: number }>;
}

interface WinnersIntelligencePanelProps {
  className?: string;
}

export function WinnersIntelligencePanel({ className = '' }: WinnersIntelligencePanelProps) {
  const [intelligence, setIntelligence] = useState<WinnersIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchIntelligence();
  }, []);

  const fetchIntelligence = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/winners/intelligence');
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to fetch intelligence');
      }

      if (data.hasData) {
        setIntelligence(data.intelligence);
      } else {
        setIntelligence(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Don't show if loading or no data
  if (loading) {
    return (
      <div className={`bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 ${className}`}>
        <div className="flex items-center gap-2 text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading winners intelligence...</span>
        </div>
      </div>
    );
  }

  if (error || !intelligence) {
    return null; // Silently hide if no data
  }

  return (
    <div className={`bg-gradient-to-r from-amber-500/10 to-violet-500/10 border border-amber-500/20 rounded-xl overflow-hidden ${className}`}>
      {/* Summary Header - Always Visible */}
      <button type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              Based on {intelligence.totalWinners} winner{intelligence.totalWinners !== 1 ? 's' : ''} in your bank
            </p>
            <p className="text-xs text-zinc-400">
              {intelligence.topHookTypes.length > 0 && (
                <>Top hooks: {intelligence.topHookTypes.slice(0, 2).map(h => h.type).join(', ')}</>
              )}
              {intelligence.optimalVideoLength && (
                <> · Avg length: {intelligence.optimalVideoLength.avg}s</>
              )}
              {intelligence.avgEngagement > 0 && (
                <> · Best engagement: {intelligence.avgEngagement}%</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-zinc-400">
          <span className="text-xs">View patterns</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="p-4 pt-0 space-y-4 border-t border-zinc-800/50">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-zinc-800/50 rounded-lg text-center">
              <Eye className="w-4 h-4 text-teal-400 mx-auto mb-1" />
              <p className="text-lg font-semibold text-white">{formatNumber(intelligence.avgViews)}</p>
              <p className="text-xs text-zinc-500">Avg Views</p>
            </div>
            <div className="p-3 bg-zinc-800/50 rounded-lg text-center">
              <TrendingUp className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <p className="text-lg font-semibold text-white">{intelligence.avgEngagement}%</p>
              <p className="text-xs text-zinc-500">Avg Engagement</p>
            </div>
            <div className="p-3 bg-zinc-800/50 rounded-lg text-center">
              <Trophy className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <p className="text-lg font-semibold text-white">{intelligence.ourScripts}</p>
              <p className="text-xs text-zinc-500">Your Wins</p>
            </div>
          </div>

          {/* Top Hook Types */}
          {intelligence.topHookTypes.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                Most Effective Hook Types
              </h4>
              <div className="flex flex-wrap gap-2">
                {intelligence.topHookTypes.map((hook, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-amber-500/20 text-amber-300 text-xs rounded-full flex items-center gap-1"
                  >
                    {hook.type}
                    <span className="text-amber-400/60">({hook.count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top Content Formats */}
          {intelligence.topContentFormats.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                Best Content Formats
              </h4>
              <div className="flex flex-wrap gap-2">
                {intelligence.topContentFormats.map((format, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-teal-500/20 text-teal-300 text-xs rounded-full flex items-center gap-1"
                  >
                    {format.format}
                    <span className="text-teal-400/60">({format.avgEngagement}%)</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Common Patterns */}
          {intelligence.commonPatterns.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                <Sparkles className="w-3 h-3 text-violet-400" />
                Winning Patterns
              </h4>
              <ul className="space-y-1">
                {intelligence.commonPatterns.map((pattern, i) => (
                  <li key={i} className="text-xs text-zinc-300 flex items-start gap-2">
                    <span className="text-emerald-400">+</span>
                    {pattern}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Patterns to Avoid */}
          {intelligence.patternsToAvoid.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                Avoid These
              </h4>
              <ul className="space-y-1">
                {intelligence.patternsToAvoid.map((pattern, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                    <span className="text-red-400">-</span>
                    {pattern}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Top Hooks */}
          {intelligence.topHooks.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                Top Performing Hooks
              </h4>
              <div className="space-y-2">
                {intelligence.topHooks.slice(0, 3).map((hook, i) => (
                  <div key={i} className="p-2 bg-zinc-800/50 rounded-lg">
                    <p className="text-xs text-zinc-300 italic">&ldquo;{hook.text}&rdquo;</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                      <span>{formatNumber(hook.views)} views</span>
                      {hook.engagement > 0 && <span>{hook.engagement}% eng</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default WinnersIntelligencePanel;
