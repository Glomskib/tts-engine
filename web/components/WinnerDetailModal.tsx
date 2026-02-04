'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Trophy,
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Sparkles,
  Clock,
  TrendingUp,
  Lightbulb,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Link2,
  Wand2,
  Trash2,
} from 'lucide-react';
import type { Winner } from '@/lib/winners';

interface WinnerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  winner: Winner;
  onUpdate?: () => void;
  onDelete?: (id: string) => void;
}

export function WinnerDetailModal({ isOpen, onClose, winner, onUpdate, onDelete }: WinnerDetailModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'patterns'>('overview');
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  // Generate a similar script based on this winner
  const handleGenerateSimilar = () => {
    const params = new URLSearchParams();

    // Pass winner ID for context
    params.set('winner_id', winner.id);

    // Pass hook type if available
    if (winner.hook_type) {
      params.set('hook_type', winner.hook_type);
    }

    // Pass content format if available
    if (winner.content_format) {
      params.set('content_format', winner.content_format);
    }

    // Pass product info if available
    if (winner.product_category) {
      params.set('product_category', winner.product_category);
    }

    // Navigate to generator with params
    router.push(`/admin/skit-generator?${params.toString()}`);
    onClose();
  };

  const isOurScript = winner.source_type === 'generated';
  const analysis = winner.ai_analysis;

  const formatNumber = (num?: number | null) => {
    if (num === null || num === undefined) return '-';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const handleReanalyze = async () => {
    setIsReanalyzing(true);
    try {
      const response = await fetch(`/api/winners/${winner.id}/analyze`, {
        method: 'POST',
      });
      if (response.ok) {
        onUpdate?.();
      }
    } catch (err) {
      console.error('Reanalysis failed:', err);
    } finally {
      setIsReanalyzing(false);
    }
  };

  const tabs: { id: 'overview' | 'analysis' | 'patterns'; label: string; disabled?: boolean }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'analysis', label: 'AI Analysis', disabled: !analysis },
    { id: 'patterns', label: 'Patterns', disabled: !analysis },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isOurScript ? 'bg-amber-500/20' : 'bg-teal-500/20'
              }`}
            >
              {isOurScript ? (
                <Trophy className="w-5 h-5 text-amber-400" />
              ) : (
                <ExternalLink className="w-5 h-5 text-teal-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {isOurScript ? 'Our Script Winner' : 'Reference Winner'}
              </h2>
              <p className="text-sm text-zinc-400">
                {isOurScript ? 'Generated Script' : 'External Reference'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-white border-b-2 border-teal-400 bg-teal-500/5'
                  : tab.disabled
                  ? 'text-zinc-600 cursor-not-allowed'
                  : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Hook Section */}
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Hook</h3>
                <blockquote className="text-lg text-white border-l-2 border-teal-500 pl-4 italic">
                  &ldquo;{winner.hook || 'No hook captured'}&rdquo;
                </blockquote>
                {winner.hook_type && (
                  <span className="inline-block mt-2 px-2 py-1 text-xs bg-zinc-800 text-zinc-400 rounded">
                    {winner.hook_type.replace('_', ' ')}
                  </span>
                )}
              </div>

              {/* Video Link */}
              {winner.video_url && (
                <a
                  href={winner.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors"
                >
                  <Link2 className="w-4 h-4" />
                  View on TikTok
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              {/* Metrics Grid */}
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-3">Performance Metrics</h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  <MetricCard icon={Eye} label="Views" value={formatNumber(winner.view_count)} />
                  <MetricCard icon={Heart} label="Likes" value={formatNumber(winner.like_count)} />
                  <MetricCard icon={MessageCircle} label="Comments" value={formatNumber(winner.comment_count)} />
                  <MetricCard icon={Share2} label="Shares" value={formatNumber(winner.share_count)} />
                  <MetricCard icon={Bookmark} label="Saves" value={formatNumber(winner.save_count)} />
                </div>

                {(winner.engagement_rate || winner.performance_score) && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {winner.engagement_rate !== null && winner.engagement_rate !== undefined && (
                      <div className="p-3 bg-zinc-800/50 rounded-lg">
                        <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                          <TrendingUp className="w-3.5 h-3.5" />
                          Engagement Rate
                        </div>
                        <p className="text-xl font-semibold text-emerald-400">
                          {winner.engagement_rate.toFixed(2)}%
                        </p>
                      </div>
                    )}
                    {winner.performance_score !== null && winner.performance_score !== undefined && (
                      <div className="p-3 bg-zinc-800/50 rounded-lg">
                        <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          Performance Score
                        </div>
                        <p className="text-xl font-semibold text-amber-400">
                          {winner.performance_score.toFixed(1)}/10
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Retention Data */}
              {(winner.avg_watch_time || winner.retention_3s) && (
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-3">Retention</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {winner.avg_watch_time != null && (
                      <div className="p-3 bg-zinc-800/50 rounded-lg text-center">
                        <p className="text-xs text-zinc-500 mb-1">Avg Watch</p>
                        <p className="text-lg font-semibold text-white">{winner.avg_watch_time}s</p>
                      </div>
                    )}
                    {winner.retention_3s != null && (
                      <div className="p-3 bg-zinc-800/50 rounded-lg text-center">
                        <p className="text-xs text-zinc-500 mb-1">@ 3 sec</p>
                        <p className="text-lg font-semibold text-white">{winner.retention_3s}%</p>
                      </div>
                    )}
                    {winner.retention_5s != null && (
                      <div className="p-3 bg-zinc-800/50 rounded-lg text-center">
                        <p className="text-xs text-zinc-500 mb-1">@ 5 sec</p>
                        <p className="text-lg font-semibold text-white">{winner.retention_5s}%</p>
                      </div>
                    )}
                    {winner.retention_10s != null && (
                      <div className="p-3 bg-zinc-800/50 rounded-lg text-center">
                        <p className="text-xs text-zinc-500 mb-1">@ 10 sec</p>
                        <p className="text-lg font-semibold text-white">{winner.retention_10s}%</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {winner.notes && (
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2">Notes</h3>
                  <p className="text-sm text-zinc-300 bg-zinc-800/50 rounded-lg p-3">
                    {winner.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Analysis Tab */}
          {activeTab === 'analysis' && analysis && (
            <div className="space-y-6">
              {/* Summary */}
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Summary</h3>
                <p className="text-sm text-zinc-300">{analysis.summary}</p>
              </div>

              {/* Hook Analysis */}
              {analysis.hook_analysis && (
                <div className="p-4 bg-zinc-800/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-white">Hook Analysis</h3>
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded">
                      {analysis.hook_analysis.effectiveness_score}/10
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="text-zinc-300">
                      <span className="text-zinc-500">What worked: </span>
                      {analysis.hook_analysis.what_worked}
                    </p>
                    <p className="text-zinc-300">
                      <span className="text-zinc-500">Pattern: </span>
                      {analysis.hook_analysis.pattern}
                    </p>
                    <p className="text-teal-400 font-medium">
                      Template: {analysis.hook_analysis.reusable_structure}
                    </p>
                  </div>
                </div>
              )}

              {/* Content Structure */}
              {analysis.content_structure && (
                <div className="p-4 bg-zinc-800/50 rounded-lg space-y-3">
                  <h3 className="text-sm font-medium text-white">Content Structure</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-zinc-500">Pacing</p>
                      <p className="text-zinc-300">{analysis.content_structure.pacing}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Story Arc</p>
                      <p className="text-zinc-300">{analysis.content_structure.story_arc}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Product Integration</p>
                      <p className="text-zinc-300">{analysis.content_structure.product_integration}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">CTA</p>
                      <p className="text-zinc-300">{analysis.content_structure.cta_effectiveness}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Audience Psychology */}
              {analysis.audience_psychology && (
                <div className="p-4 bg-zinc-800/50 rounded-lg space-y-3">
                  <h3 className="text-sm font-medium text-white">Audience Psychology</h3>
                  <div className="space-y-2 text-sm">
                    {analysis.audience_psychology.emotions_triggered && (
                      <div className="flex flex-wrap gap-2">
                        {analysis.audience_psychology.emotions_triggered.map((emotion, i) => (
                          <span key={i} className="px-2 py-1 bg-violet-500/20 text-violet-400 rounded text-xs">
                            {emotion}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-zinc-300">
                      <span className="text-zinc-500">Why shared: </span>
                      {analysis.audience_psychology.why_people_shared}
                    </p>
                    <p className="text-zinc-300">
                      <span className="text-zinc-500">Comment drivers: </span>
                      {analysis.audience_psychology.comment_drivers}
                    </p>
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {analysis.recommendations && analysis.recommendations.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-2">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    Recommendations
                  </h3>
                  <ul className="space-y-2">
                    {analysis.recommendations.map((rec, i) => (
                      <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                        <span className="text-emerald-400">+</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Avoid */}
              {analysis.avoid && analysis.avoid.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    What to Avoid
                  </h3>
                  <ul className="space-y-2">
                    {analysis.avoid.map((item, i) => (
                      <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                        <span className="text-red-400">-</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Patterns Tab */}
          {activeTab === 'patterns' && analysis?.patterns && (
            <div className="space-y-6">
              <p className="text-sm text-zinc-500">
                Extracted patterns from this winner - these inform future script generation.
              </p>

              {analysis.patterns.hook_pattern && (
                <div className="p-4 bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20 rounded-lg">
                  <h3 className="text-sm font-medium text-amber-400 mb-2">Hook Pattern</h3>
                  <p className="text-white">{analysis.patterns.hook_pattern}</p>
                </div>
              )}

              {analysis.patterns.content_pattern && (
                <div className="p-4 bg-gradient-to-r from-teal-500/10 to-transparent border border-teal-500/20 rounded-lg">
                  <h3 className="text-sm font-medium text-teal-400 mb-2">Content Pattern</h3>
                  <p className="text-white">{analysis.patterns.content_pattern}</p>
                </div>
              )}

              {analysis.patterns.cta_pattern && (
                <div className="p-4 bg-gradient-to-r from-violet-500/10 to-transparent border border-violet-500/20 rounded-lg">
                  <h3 className="text-sm font-medium text-violet-400 mb-2">CTA Pattern</h3>
                  <p className="text-white">{analysis.patterns.cta_pattern}</p>
                </div>
              )}

              {winner.patterns && (
                <div className="p-4 bg-zinc-800/50 rounded-lg">
                  <h3 className="text-sm font-medium text-zinc-400 mb-2">Quick Reference</h3>
                  <pre className="text-xs text-zinc-400 overflow-x-auto">
                    {JSON.stringify(winner.patterns, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* No Analysis State */}
          {activeTab === 'overview' && !analysis && (
            <div className="mt-6 p-4 bg-zinc-800/50 rounded-lg text-center">
              <Sparkles className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-400 mb-3">
                This winner hasn&apos;t been analyzed by AI yet.
              </p>
              <button
                onClick={handleReanalyze}
                disabled={isReanalyzing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isReanalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Analyze with AI
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Clock className="w-3.5 h-3.5" />
              Added {new Date(winner.created_at).toLocaleDateString()}
            </div>
            {onDelete && (
              <button
                onClick={async () => {
                  if (!confirm('Delete this winner? This cannot be undone.')) return;
                  setIsDeleting(true);
                  try {
                    const res = await fetch(`/api/winners/${winner.id}`, { method: 'DELETE' });
                    if (res.ok) {
                      onDelete(winner.id);
                      onClose();
                    }
                  } catch (err) {
                    console.error('Failed to delete winner:', err);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
                className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Delete winner"
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateSimilar}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <Wand2 className="w-4 h-4" />
              Generate Similar
            </button>

            {analysis && (
              <button
                onClick={handleReanalyze}
                disabled={isReanalyzing}
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Re-analyze"
              >
                <RefreshCw className={`w-4 h-4 ${isReanalyzing ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="p-3 bg-zinc-800/50 rounded-lg text-center">
      <Icon className="w-4 h-4 text-zinc-500 mx-auto mb-1" />
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

export default WinnerDetailModal;
