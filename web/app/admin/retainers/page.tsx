'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Target, Clock, TrendingUp, AlertTriangle, CheckCircle2, DollarSign, Video, FileText, Upload, Loader2, X, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui';

interface TierProgress {
  hit: boolean;
  target: number;
  payout: number;
  videos?: number;
  gmv?: number;
}

interface LinkedBrief {
  id: string;
  title: string;
  status: string;
  income_projections: unknown;
}

interface Retainer {
  brand_id: string;
  brand_name: string;
  retainer_type: string;
  period_start: string | null;
  period_end: string | null;
  days_remaining: number | null;
  video_goal: number;
  videos_posted: number;
  pipeline_posted: number;
  tiktok_posted: number;
  completion: number;
  base_payout: number;
  bonus_earned: number;
  total_bonus_potential: number;
  tier_progress: TierProgress[];
  next_bonus_amount: number;
  next_bonus_needed: number;
  daily_pace: number;
  projected_total: number;
  videos_needed: number;
  status: string;
  notes: string | null;
  linked_brief: LinkedBrief | null;
}

interface Summary {
  total_brands: number;
  total_base: number;
  total_potential: number;
  total_videos_needed: number;
  brands_on_track: number;
  brands_at_risk: number;
  brands_completed: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  on_track: { label: 'ON TRACK', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: TrendingUp },
  at_risk: { label: 'AT RISK', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: AlertTriangle },
  behind: { label: 'BEHIND', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: AlertTriangle },
  completed: { label: 'COMPLETED', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20', icon: CheckCircle2 },
  expired: { label: 'EXPIRED', color: 'text-zinc-400', bg: 'bg-zinc-500/10 border-zinc-500/20', icon: Clock },
};

const TYPE_LABELS: Record<string, string> = {
  retainer: 'Retainer',
  bonus: 'Bonus',
  challenge: 'Challenge',
  affiliate: 'Affiliate',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtMoney(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`;
}

interface BriefAnalysis {
  summary?: string;
  campaign_name?: string;
  campaign_start?: string;
  campaign_end?: string;
  min_videos?: number;
  commission_rate?: string;
  income_projections?: {
    conservative?: { total?: number; video_count?: number };
    target?: { total?: number; video_count?: number };
    stretch?: { total?: number; video_count?: number };
  };
  posting_bonuses?: Array<{ tier_label?: string; min_videos?: number; payout?: number }>;
  requirements?: { required_elements?: string[]; prohibited?: string[] };
  strategic_notes?: string[];
}

interface PastBrief {
  id: string;
  title: string;
  brief_type: string;
  brand_id: string | null;
  campaign_start: string | null;
  campaign_end: string | null;
  focus_product: string | null;
  status: string;
  income_projections: { target?: { total?: number } } | null;
  created_at: string;
}

export default function RetainersPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'briefs' ? 'briefs' : 'retainers';
  const [activeTab, setActiveTab] = useState<'retainers' | 'briefs'>(initialTab);

  const [data, setData] = useState<{ retainers: Retainer[]; summary: Summary } | null>(null);
  const [loading, setLoading] = useState(true);

  // Past briefs state
  const [pastBriefs, setPastBriefs] = useState<PastBrief[]>([]);
  const [loadingBriefs, setLoadingBriefs] = useState(true);

  // Brief upload state
  const [showBriefUpload, setShowBriefUpload] = useState(false);
  const [briefText, setBriefText] = useState('');
  const [briefBrandId, setBriefBrandId] = useState('');
  const [briefType, setBriefType] = useState('retainer');
  const [briefTitle, setBriefTitle] = useState('');
  const [analyzingBrief, setAnalyzingBrief] = useState(false);
  const [briefAnalysis, setBriefAnalysis] = useState<BriefAnalysis | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);

  const fetchPastBriefs = useCallback(async () => {
    setLoadingBriefs(true);
    try {
      const res = await fetch('/api/brand-briefs', { credentials: 'include' });
      const d = await res.json();
      setPastBriefs(d.briefs || []);
    } catch {
      // ignore
    } finally {
      setLoadingBriefs(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/admin/retainers', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    // Fetch brands for the brief dropdown
    fetch('/api/brands')
      .then(r => r.json())
      .then(d => setBrands(d.data || []))
      .catch(() => {});
    // Fetch past briefs
    fetchPastBriefs();
  }, [fetchPastBriefs]);

  const handleAnalyzeBrief = async () => {
    if (!briefText.trim() || briefText.trim().length < 50) {
      setBriefError('Brief text must be at least 50 characters');
      return;
    }
    setAnalyzingBrief(true);
    setBriefError(null);
    setBriefAnalysis(null);
    try {
      const res = await fetch('/api/brand-briefs/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief_text: briefText.trim(),
          brief_type: briefType,
          title: briefTitle.trim() || 'Untitled Brief',
          brand_id: briefBrandId || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setBriefAnalysis(json.analysis);
      } else {
        setBriefError(json.error || 'Failed to analyze brief');
      }
    } catch {
      setBriefError('Failed to analyze brief');
    } finally {
      setAnalyzingBrief(false);
    }
  };

  const handleApplyBrief = async (briefId?: string) => {
    if (!briefBrandId || !briefId) return;
    try {
      await fetch(`/api/brand-briefs/${briefId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_id: briefBrandId }),
      });
      // Refresh retainers data
      const res = await fetch('/api/admin/retainers', { credentials: 'include' });
      const d = await res.json();
      setData(d);
      setShowBriefUpload(false);
      setBriefAnalysis(null);
      setBriefText('');
    } catch {
      setBriefError('Failed to apply brief to brand');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Retainers & Bonuses</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-zinc-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 bg-zinc-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.retainers.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Retainers & Bonuses</h1>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Target className="w-16 h-16 text-zinc-600 mb-4" />
          <h2 className="text-xl font-semibold text-zinc-300 mb-2">No active retainers yet</h2>
          <p className="text-zinc-500 max-w-md mb-6">
            Add retainer details to your brands on the Brands page, or upload a brief below to auto-extract retainer info.
          </p>
          <div className="flex gap-3">
            <Link href="/admin/brands" className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors">
              Go to Brands
            </Link>
            <button onClick={() => setShowBriefUpload(true)} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload Brief
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { retainers, summary } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Retainers & Bonuses</h1>
        <button
          onClick={() => setShowBriefUpload(!showBriefUpload)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Upload className="w-4 h-4" />
          Upload Brief
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-800/50 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('retainers')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'retainers'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Active Retainers
        </button>
        <button
          onClick={() => setActiveTab('briefs')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'briefs'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Brief History
        </button>
      </div>

      {/* Brief Upload Panel */}
      {showBriefUpload && (
        <div className="bg-zinc-900 border border-violet-500/20 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <h3 className="text-base font-semibold text-white">AI Brief Analysis</h3>
            </div>
            <button onClick={() => { setShowBriefUpload(false); setBriefAnalysis(null); setBriefError(null); }} className="p-1.5 text-zinc-400 hover:text-white rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Brand (optional)</label>
              <select
                value={briefBrandId}
                onChange={(e) => setBriefBrandId(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
              >
                <option value="">Select brand...</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Brief Type</label>
              <select
                value={briefType}
                onChange={(e) => setBriefType(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
              >
                <option value="retainer">Retainer</option>
                <option value="contest">Contest</option>
                <option value="campaign">Campaign</option>
                <option value="launch">Launch</option>
                <option value="general">General</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Title</label>
              <input
                type="text"
                value={briefTitle}
                onChange={(e) => setBriefTitle(e.target.value)}
                placeholder="e.g. March 2026 Contest"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Brief Text (paste the full brief)</label>
            <textarea
              value={briefText}
              onChange={(e) => setBriefText(e.target.value)}
              rows={6}
              placeholder="Paste the brand brief or contest details here (min 50 characters)..."
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-zinc-500">{briefText.length} characters</span>
              <button
                onClick={handleAnalyzeBrief}
                disabled={analyzingBrief || briefText.trim().length < 50}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {analyzingBrief ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : <><Sparkles className="w-4 h-4" /> Analyze with AI</>}
              </button>
            </div>
          </div>

          {briefError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {briefError}
            </div>
          )}

          {/* Analysis Results */}
          {briefAnalysis && (
            <div className="space-y-4 border-t border-zinc-800 pt-4">
              <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">AI Analysis Results</h4>

              {briefAnalysis.campaign_name && (
                <div className="text-lg font-semibold text-white">{briefAnalysis.campaign_name}</div>
              )}
              {briefAnalysis.summary && (
                <p className="text-sm text-zinc-400">{briefAnalysis.summary}</p>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {briefAnalysis.min_videos && (
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Min Videos</div>
                    <div className="text-lg font-bold text-white">{briefAnalysis.min_videos}</div>
                  </div>
                )}
                {briefAnalysis.commission_rate && (
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Commission</div>
                    <div className="text-lg font-bold text-teal-400">{briefAnalysis.commission_rate}</div>
                  </div>
                )}
                {briefAnalysis.income_projections?.target?.total && (
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Target Income</div>
                    <div className="text-lg font-bold text-emerald-400">{formatCurrency(briefAnalysis.income_projections.target.total)}</div>
                  </div>
                )}
                {briefAnalysis.campaign_end && (
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="text-xs text-zinc-500">Deadline</div>
                    <div className="text-lg font-bold text-white">{formatDate(briefAnalysis.campaign_end)}</div>
                  </div>
                )}
              </div>

              {/* Bonus Tiers */}
              {briefAnalysis.posting_bonuses && briefAnalysis.posting_bonuses.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Bonus Tiers</div>
                  <div className="space-y-1">
                    {briefAnalysis.posting_bonuses.map((b, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-zinc-800/50 rounded-lg px-3 py-2">
                        <span className="text-zinc-300">{b.tier_label || `${b.min_videos} videos`}</span>
                        <span className="text-emerald-400 font-medium">{b.payout ? formatCurrency(b.payout) : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strategic Notes */}
              {briefAnalysis.strategic_notes && briefAnalysis.strategic_notes.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Strategic Notes</div>
                  <ul className="space-y-1 text-sm text-zinc-400">
                    {briefAnalysis.strategic_notes.map((note, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-teal-400 mt-0.5">-</span>
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Apply to Brand */}
              {briefBrandId && (
                <button
                  onClick={() => handleApplyBrief(briefAnalysis.campaign_name)}
                  className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-medium transition-colors"
                >
                  Apply to Brand & Create Retainer
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Active Retainers Tab */}
      {activeTab === 'retainers' && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <DollarSign className="w-4 h-4" />
                Total Monthly Base
              </div>
              <div className="text-2xl font-bold text-emerald-400">{formatCurrency(summary.total_base)}</div>
            </div>
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <TrendingUp className="w-4 h-4" />
                Total Bonus Potential
              </div>
              <div className="text-2xl font-bold text-amber-400">{formatCurrency(summary.total_potential - summary.total_base)}</div>
            </div>
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <Video className="w-4 h-4" />
                Videos Still Needed
              </div>
              <div className="text-2xl font-bold text-white">{summary.total_videos_needed}</div>
            </div>
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <AlertTriangle className="w-4 h-4" />
                Brands At Risk
              </div>
              <div className={`text-2xl font-bold ${summary.brands_at_risk > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {summary.brands_at_risk}
              </div>
            </div>
          </div>

          {/* Retainer Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {retainers.map((r) => {
              const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.on_track;
              const StatusIcon = statusCfg.icon;

              return (
                <div key={r.brand_id} className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{r.brand_name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 uppercase tracking-wider">
                        {TYPE_LABELS[r.retainer_type] || r.retainer_type}
                      </span>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusCfg.label}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-baseline justify-between text-sm mb-1.5">
                      <span className="text-zinc-400">
                        <span className="text-white font-semibold">{r.videos_posted}</span> of {r.video_goal} videos
                      </span>
                      <span className="text-zinc-300 font-medium">{r.completion}%</span>
                    </div>
                    <Progress
                      value={Math.min(1, r.completion / 100)}
                      showLabels={false}
                      size="lg"
                    />
                  </div>

                  {/* Stats Row */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-zinc-500">Base:</span>{' '}
                      <span className="text-emerald-400 font-medium">{formatCurrency(r.base_payout)}</span>
                    </div>
                    {r.days_remaining !== null && (
                      <div>
                        <span className="text-zinc-500">Days left:</span>{' '}
                        <span className={`font-medium ${r.days_remaining < 7 ? 'text-red-400' : r.days_remaining < 14 ? 'text-amber-400' : 'text-zinc-300'}`}>
                          {r.days_remaining}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-zinc-500">Period:</span>{' '}
                      <span className="text-zinc-300">{formatDate(r.period_start)} — {formatDate(r.period_end)}</span>
                    </div>
                  </div>

                  {/* Bonus Tiers */}
                  {r.tier_progress.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Bonus Tiers</div>
                      {r.tier_progress.map((tier, i) => (
                        <div
                          key={i}
                          className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-lg ${
                            tier.hit
                              ? 'bg-emerald-500/10 border border-emerald-500/20'
                              : r.next_bonus_needed > 0 && tier.target === r.videos_posted + r.next_bonus_needed
                                ? 'bg-amber-500/5 border border-amber-500/20'
                                : 'bg-zinc-800/50'
                          }`}
                        >
                          <span className="text-zinc-300">
                            {tier.target} videos
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={tier.hit ? 'text-emerald-400 font-medium' : 'text-zinc-400'}>
                              {formatCurrency(tier.payout)}
                            </span>
                            {tier.hit ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <span className="text-xs text-zinc-500">
                                {tier.target - r.videos_posted} more
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {r.bonus_earned > 0 && (
                        <div className="text-xs text-emerald-400 mt-1">
                          Bonus earned so far: {formatCurrency(r.bonus_earned)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pace Projection */}
                  {r.daily_pace > 0 && r.status !== 'completed' && r.status !== 'expired' && (
                    <div className="text-sm text-zinc-400 bg-zinc-800/30 rounded-lg px-3 py-2">
                      <TrendingUp className="w-3.5 h-3.5 inline mr-1.5 text-zinc-500" />
                      At your current pace ({r.daily_pace} videos/day), you&apos;ll hit{' '}
                      <span className="text-white font-medium">{r.projected_total} videos</span> by deadline
                      {r.projected_total >= r.video_goal ? (
                        <span className="text-emerald-400 ml-1">— on track</span>
                      ) : (
                        <span className="text-amber-400 ml-1">— {r.videos_needed} more needed</span>
                      )}
                    </div>
                  )}

                  {/* Linked Brief */}
                  {r.linked_brief && (
                    <button
                      onClick={() => setActiveTab('briefs')}
                      className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      View analyzed brief: {r.linked_brief.title}
                    </button>
                  )}

                  {/* Notes */}
                  {r.notes && (
                    <div className="text-sm text-zinc-500 italic border-t border-zinc-800 pt-3">
                      {r.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Brief History Tab */}
      {activeTab === 'briefs' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5">
            <h3 className="text-base font-semibold text-white mb-4">Past Briefs</h3>
            {loadingBriefs ? (
              <div className="py-8 text-center text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                Loading...
              </div>
            ) : pastBriefs.length === 0 ? (
              <div className="py-8 text-center">
                <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No briefs analyzed yet</p>
                <p className="text-xs text-zinc-600 mt-1">Use the &quot;Upload Brief&quot; button above to analyze your first brief</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pastBriefs.map(brief => {
                  const targetTotal = brief.income_projections?.target?.total;
                  return (
                    <Link
                      key={brief.id}
                      href={`/admin/briefs?id=${brief.id}`}
                      className="w-full text-left flex items-center justify-between px-4 py-3 rounded-lg border border-white/5 bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">{brief.title}</p>
                          <p className="text-xs text-zinc-500">
                            {brief.brief_type} · {brief.focus_product || 'No product'} · {new Date(brief.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {targetTotal && (
                          <span className="text-sm font-medium text-teal-400">{fmtMoney(targetTotal)}</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          brief.status === 'ready' ? 'bg-teal-500/20 text-teal-400' :
                          brief.status === 'applied' ? 'bg-emerald-500/20 text-emerald-400' :
                          brief.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                          'bg-zinc-700/50 text-zinc-400'
                        }`}>
                          {brief.status}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
