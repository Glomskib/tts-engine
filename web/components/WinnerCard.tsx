'use client';

import { Trophy, ExternalLink, Eye, Heart, MessageCircle, Sparkles, Clock, TrendingUp } from 'lucide-react';
import type { Winner } from '@/lib/winners';

interface WinnerCardProps {
  winner: Winner;
  onClick?: () => void;
}

export function WinnerCard({ winner, onClick }: WinnerCardProps) {
  const isOurScript = winner.source_type === 'our_script';

  const formatNumber = (num?: number | null) => {
    if (num === null || num === undefined) return '-';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getPerformanceColor = (score?: number | null) => {
    if (!score) return 'text-zinc-400';
    if (score >= 8) return 'text-emerald-400';
    if (score >= 6) return 'text-amber-400';
    return 'text-zinc-400';
  };

  return (
    <div
      onClick={onClick}
      className={`group relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-zinc-700 hover:bg-zinc-800/50' : ''
      }`}
    >
      {/* Source Badge */}
      <div className="absolute top-3 right-3 z-10">
        <span
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            isOurScript
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
          }`}
        >
          {isOurScript ? (
            <>
              <Trophy className="w-3 h-3" />
              Our Script
            </>
          ) : (
            <>
              <ExternalLink className="w-3 h-3" />
              Reference
            </>
          )}
        </span>
      </div>

      {/* Thumbnail or Placeholder */}
      {winner.thumbnail_url ? (
        <div className="aspect-video bg-zinc-800 relative">
          <img
            src={winner.thumbnail_url}
            alt={winner.video_title || 'Winner thumbnail'}
            className="w-full h-full object-cover"
          />
          {winner.video_length_seconds && (
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-xs text-white flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {Math.floor(winner.video_length_seconds / 60)}:{(winner.video_length_seconds % 60).toString().padStart(2, '0')}
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-video bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
          <Trophy className={`w-8 h-8 ${isOurScript ? 'text-amber-500/30' : 'text-teal-500/30'}`} />
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Hook Preview */}
        <div>
          <p className="text-sm text-white line-clamp-2 font-medium">
            &ldquo;{winner.hook_text || 'No hook captured'}&rdquo;
          </p>
          {winner.hook_type && (
            <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-zinc-800 text-zinc-400 rounded">
              {winner.hook_type.replace('_', ' ')}
            </span>
          )}
        </div>

        {/* Creator info for external */}
        {!isOurScript && winner.creator_handle && (
          <p className="text-xs text-zinc-500">
            @{winner.creator_handle}
            {winner.creator_niche && ` · ${winner.creator_niche}`}
          </p>
        )}

        {/* Metrics Row */}
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          {winner.views !== null && winner.views !== undefined && (
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              {formatNumber(winner.views)}
            </span>
          )}
          {winner.likes !== null && winner.likes !== undefined && (
            <span className="flex items-center gap-1">
              <Heart className="w-3.5 h-3.5" />
              {formatNumber(winner.likes)}
            </span>
          )}
          {winner.comments !== null && winner.comments !== undefined && (
            <span className="flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5" />
              {formatNumber(winner.comments)}
            </span>
          )}
          {winner.engagement_rate !== null && winner.engagement_rate !== undefined && (
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {winner.engagement_rate.toFixed(1)}%
            </span>
          )}
        </div>

        {/* AI Analysis indicator */}
        {winner.ai_analysis && (
          <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <p className="text-xs text-zinc-400 line-clamp-1">
              {winner.ai_analysis.summary?.substring(0, 60) || 'AI analyzed'}...
            </p>
          </div>
        )}

        {/* Performance Score */}
        {winner.performance_score !== null && winner.performance_score !== undefined && (
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <span className="text-xs text-zinc-500">Performance Score</span>
            <span className={`text-sm font-semibold ${getPerformanceColor(winner.performance_score)}`}>
              {winner.performance_score.toFixed(1)}/10
            </span>
          </div>
        )}
      </div>

      {/* Hover Overlay */}
      {onClick && (
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="absolute bottom-4 left-4 right-4 text-center">
            <span className="text-sm text-white font-medium">View Details</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default WinnerCard;
