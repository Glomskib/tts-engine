'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import {
  FileText,
  Loader2,
  Copy,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Calendar,
  Video,
  Hash,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Brand {
  id: string;
  name: string;
}

interface IncomeScenario {
  videos: number;
  estimated_gmv: number;
  posting_bonus: number;
  gmv_bonus: number;
  commission: number;
  total: number;
  description: string;
}

interface ScriptStarter {
  product: string;
  content_type: string;
  hook: string;
  body_outline: string;
  cta: string;
  on_screen_text: string;
  estimated_duration: string;
}

interface ScheduleItem {
  week: number;
  day: string;
  date: string;
  product: string;
  content_type: string;
  hook_idea: string;
  is_live: boolean;
}

interface Analysis {
  summary: string;
  brief_type: string;
  campaign_name: string;
  campaign_start: string | null;
  campaign_end: string | null;
  brand_name: string;
  focus_products: Array<{ name: string; url: string | null; sku?: string }>;
  commission_rate: number | null;
  registration_url: string | null;
  claim_deadline: string | null;
  posting_bonuses: Array<{ tier_label: string; min_videos: number; payout: number; stackable: boolean }>;
  gmv_bonuses: Array<{ tier_label: string; min_gmv: number; payout: number; stackable: boolean }>;
  live_bonuses: Array<{ type: string; payout: number; requirements: string }>;
  product_specific_bonuses: Array<{ product: string; bonus_type: string; value: number; details: string }>;
  requirements: {
    min_videos: number;
    required_hashtags: string[];
    required_elements: string[];
    prohibited: string[];
    must_register: boolean;
    unique_content_required: boolean;
    platforms: string[];
  };
  income_projections: {
    conservative: IncomeScenario;
    target: IncomeScenario;
    stretch: IncomeScenario;
  };
  posting_schedule: ScheduleItem[];
  script_starters: ScriptStarter[];
  strategic_notes: string[];
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
  income_projections: { target?: IncomeScenario } | null;
  created_at: string;
  ai_analysis: Analysis | null;
}

const BRIEF_TYPES = [
  { value: 'contest', label: 'Contest' },
  { value: 'retainer', label: 'Retainer' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'launch', label: 'Launch' },
  { value: 'general', label: 'General' },
];

export default function BriefsPage() {
  const { showSuccess, showError } = useToast();
  const router = useRouter();

  // Form state
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [briefType, setBriefType] = useState('contest');
  const [briefTitle, setBriefTitle] = useState('');
  const [briefText, setBriefText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [briefId, setBriefId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Past briefs
  const [pastBriefs, setPastBriefs] = useState<PastBrief[]>([]);
  const [loadingBriefs, setLoadingBriefs] = useState(true);

  // UI state
  const [applying, setApplying] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    schedule: false,
    scripts: true,
    bonuses: true,
  });

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setBrands(d.data || d.brands || []))
      .catch(() => {});

    fetchPastBriefs();
  }, []);

  const fetchPastBriefs = useCallback(async () => {
    setLoadingBriefs(true);
    try {
      const res = await fetch('/api/brand-briefs', { credentials: 'include' });
      const data = await res.json();
      setPastBriefs(data.briefs || []);
    } catch {
      // ignore
    } finally {
      setLoadingBriefs(false);
    }
  }, []);

  const analyzeBrief = async () => {
    setAnalyzing(true);
    setError('');
    setAnalysis(null);
    setBriefId(null);
    try {
      const res = await fetch('/api/brand-briefs/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          brief_text: briefText,
          brand_id: selectedBrandId || undefined,
          brief_type: briefType,
          title: briefTitle || undefined,
          source_url: sourceUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalysis(data.analysis);
      setBriefId(data.brief_id);
      showSuccess('Brief analyzed successfully!');
      fetchPastBriefs();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Analysis failed';
      setError(msg);
      showError(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const applyToBrand = async () => {
    if (!briefId || !selectedBrandId) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/brand-briefs/${briefId}/apply`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showSuccess('Brief applied to brand!');
      fetchPastBriefs();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard');
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const loadPastBrief = (brief: PastBrief) => {
    if (brief.ai_analysis) {
      setAnalysis(brief.ai_analysis);
      setBriefId(brief.id);
      setBriefTitle(brief.title);
      if (brief.brand_id) setSelectedBrandId(brief.brand_id);
    }
  };

  const fmtMoney = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`;

  return (
    <AdminPageLayout
      title="Brand Brief Analyzer"
      subtitle="Paste a brand brief and AI will extract bonuses, deadlines, and generate your action plan"
      maxWidth="2xl"
    >
      {/* Input Form */}
      <AdminCard title="Paste Your Brief">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Brand dropdown */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Brand (optional)</label>
              <select
                value={selectedBrandId}
                onChange={e => setSelectedBrandId(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">No brand linked</option>
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Brief type */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Brief Type</label>
              <select
                value={briefType}
                onChange={e => setBriefType(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {BRIEF_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Title (optional)</label>
              <input
                type="text"
                value={briefTitle}
                onChange={e => setBriefTitle(e.target.value)}
                placeholder="e.g. February Skincare Challenge"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Source URL */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Source URL (optional)</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Brief text */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Brief Text</label>
            <textarea
              value={briefText}
              onChange={e => setBriefText(e.target.value)}
              rows={10}
              placeholder="Paste the full brand brief here..."
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
            />
            <p className="text-xs text-zinc-500 mt-1">{briefText.length} characters (min 50)</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={analyzeBrief}
            disabled={analyzing || briefText.length < 50}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Analyze Brief
              </>
            )}
          </button>
        </div>
      </AdminCard>

      {/* Analysis Results */}
      {analysis && (
        <>
          {/* Summary */}
          <AdminCard title={analysis.campaign_name || 'Analysis Results'}>
            <div className="space-y-3">
              <p className="text-sm text-zinc-300 leading-relaxed">{analysis.summary}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                {analysis.campaign_start && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Calendar className="w-4 h-4 text-teal-400" />
                    <span>{analysis.campaign_start} — {analysis.campaign_end || '?'}</span>
                  </div>
                )}
                {analysis.requirements?.min_videos && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Video className="w-4 h-4 text-teal-400" />
                    <span>Min {analysis.requirements.min_videos} videos</span>
                  </div>
                )}
                {analysis.commission_rate && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <DollarSign className="w-4 h-4 text-teal-400" />
                    <span>{analysis.commission_rate}% commission</span>
                  </div>
                )}
                {analysis.requirements?.required_hashtags?.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Hash className="w-4 h-4 text-teal-400" />
                    <span>{analysis.requirements.required_hashtags.join(' ')}</span>
                  </div>
                )}
              </div>

              {analysis.registration_url && (
                <a
                  href={analysis.registration_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-teal-400 hover:underline mt-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Register for this campaign
                </a>
              )}

              {analysis.claim_deadline && (
                <div className="flex items-center gap-2 text-sm text-amber-400 mt-2">
                  <Clock className="w-4 h-4" />
                  Claim deadline: {analysis.claim_deadline}
                </div>
              )}
            </div>
          </AdminCard>

          {/* Income Projections */}
          {analysis.income_projections && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['conservative', 'target', 'stretch'] as const).map(tier => {
                const proj = analysis.income_projections[tier];
                if (!proj) return null;
                const colors = {
                  conservative: { border: 'border-zinc-600/50', bg: 'bg-zinc-800/30', label: 'text-zinc-400', total: 'text-zinc-100' },
                  target: { border: 'border-teal-500/30', bg: 'bg-teal-500/5', label: 'text-teal-400', total: 'text-teal-300' },
                  stretch: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', label: 'text-amber-400', total: 'text-amber-300' },
                };
                const c = colors[tier];
                return (
                  <div key={tier} className={`rounded-xl border ${c.border} ${c.bg} p-5`}>
                    <div className={`text-xs font-medium uppercase tracking-wide ${c.label} mb-1`}>
                      {tier}
                    </div>
                    <div className={`text-3xl font-bold ${c.total} mb-2`}>
                      {fmtMoney(proj.total)}
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">{proj.description}</p>
                    <div className="space-y-1 text-xs text-zinc-400">
                      <div className="flex justify-between">
                        <span>{proj.videos} videos</span>
                        <span>GMV ~{fmtMoney(proj.estimated_gmv)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Posting bonus</span>
                        <span>{fmtMoney(proj.posting_bonus)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GMV bonus</span>
                        <span>{fmtMoney(proj.gmv_bonus)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Commission</span>
                        <span>{fmtMoney(proj.commission)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bonus Breakdown */}
          {(analysis.posting_bonuses?.length > 0 || analysis.gmv_bonuses?.length > 0 || analysis.live_bonuses?.length > 0) && (
            <AdminCard
              title="Bonus Breakdown"
              headerActions={
                <button onClick={() => toggleSection('bonuses')} className="text-zinc-400 hover:text-zinc-200">
                  {expandedSections.bonuses ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              }
            >
              {expandedSections.bonuses && (
                <div className="space-y-4">
                  {analysis.posting_bonuses?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-zinc-300 mb-2">Posting Bonuses</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-zinc-500 text-xs uppercase">
                              <th className="text-left pb-2">Tier</th>
                              <th className="text-left pb-2">Min Videos</th>
                              <th className="text-left pb-2">Payout</th>
                              <th className="text-left pb-2">Stackable</th>
                            </tr>
                          </thead>
                          <tbody className="text-zinc-300">
                            {analysis.posting_bonuses.map((b, i) => (
                              <tr key={i} className="border-t border-white/5">
                                <td className="py-1.5">{b.tier_label}</td>
                                <td className="py-1.5">{b.min_videos}</td>
                                <td className="py-1.5 text-teal-400">${b.payout}</td>
                                <td className="py-1.5">{b.stackable ? 'Yes' : 'No'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {analysis.gmv_bonuses?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-zinc-300 mb-2">GMV Bonuses</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-zinc-500 text-xs uppercase">
                              <th className="text-left pb-2">Tier</th>
                              <th className="text-left pb-2">Min GMV</th>
                              <th className="text-left pb-2">Payout</th>
                              <th className="text-left pb-2">Stackable</th>
                            </tr>
                          </thead>
                          <tbody className="text-zinc-300">
                            {analysis.gmv_bonuses.map((b, i) => (
                              <tr key={i} className="border-t border-white/5">
                                <td className="py-1.5">{b.tier_label}</td>
                                <td className="py-1.5">{fmtMoney(b.min_gmv)}</td>
                                <td className="py-1.5 text-teal-400">${b.payout}</td>
                                <td className="py-1.5">{b.stackable ? 'Yes' : 'No'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {analysis.live_bonuses?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-zinc-300 mb-2">Live Bonuses</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-zinc-500 text-xs uppercase">
                              <th className="text-left pb-2">Type</th>
                              <th className="text-left pb-2">Payout</th>
                              <th className="text-left pb-2">Requirements</th>
                            </tr>
                          </thead>
                          <tbody className="text-zinc-300">
                            {analysis.live_bonuses.map((b, i) => (
                              <tr key={i} className="border-t border-white/5">
                                <td className="py-1.5">{b.type}</td>
                                <td className="py-1.5 text-teal-400">${b.payout}</td>
                                <td className="py-1.5 text-zinc-400">{b.requirements}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </AdminCard>
          )}

          {/* Requirements Checklist */}
          {analysis.requirements && (
            <AdminCard title="Requirements">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysis.requirements.required_elements?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-zinc-300 mb-2">Required Elements</h4>
                    <ul className="space-y-1">
                      {analysis.requirements.required_elements.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                          <CheckCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.requirements.prohibited?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-zinc-300 mb-2">Prohibited</h4>
                    <ul className="space-y-1">
                      {analysis.requirements.prohibited.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AdminCard>
          )}

          {/* Posting Schedule */}
          {analysis.posting_schedule?.length > 0 && (
            <AdminCard
              title={`Posting Schedule (${analysis.posting_schedule.length} posts)`}
              headerActions={
                <button onClick={() => toggleSection('schedule')} className="text-zinc-400 hover:text-zinc-200">
                  {expandedSections.schedule ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              }
            >
              {expandedSections.schedule && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-zinc-500 text-xs uppercase">
                        <th className="text-left pb-2">Week</th>
                        <th className="text-left pb-2">Day</th>
                        <th className="text-left pb-2">Product</th>
                        <th className="text-left pb-2">Type</th>
                        <th className="text-left pb-2">Hook Idea</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-300">
                      {analysis.posting_schedule.map((item, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-2">{item.week}</td>
                          <td className="py-2">{item.day}</td>
                          <td className="py-2 text-zinc-400">{item.product}</td>
                          <td className="py-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${item.is_live ? 'bg-red-500/20 text-red-400' : 'bg-zinc-700/50 text-zinc-300'}`}>
                              {item.is_live ? 'LIVE' : item.content_type}
                            </span>
                          </td>
                          <td className="py-2 text-zinc-400 max-w-xs truncate">{item.hook_idea}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminCard>
          )}

          {/* Script Starters */}
          {analysis.script_starters?.length > 0 && (
            <AdminCard
              title={`Script Starters (${analysis.script_starters.length})`}
              headerActions={
                <button onClick={() => toggleSection('scripts')} className="text-zinc-400 hover:text-zinc-200">
                  {expandedSections.scripts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              }
            >
              {expandedSections.scripts && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analysis.script_starters.map((script, i) => (
                    <div key={i} className="rounded-lg border border-white/5 bg-zinc-800/30 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-teal-400 uppercase">{script.content_type}</span>
                        <span className="text-xs text-zinc-500">{script.estimated_duration}</span>
                      </div>
                      <p className="text-sm font-medium text-zinc-100">&ldquo;{script.hook}&rdquo;</p>
                      <p className="text-xs text-zinc-400">{script.body_outline}</p>
                      <p className="text-xs text-zinc-500">CTA: {script.cta}</p>
                      {script.on_screen_text && (
                        <p className="text-xs text-zinc-500">On-screen: {script.on_screen_text}</p>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => copyToClipboard(`${script.hook}\n\n${script.body_outline}\n\nCTA: ${script.cta}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                          Copy
                        </button>
                        <button
                          onClick={() =>
                            router.push(
                              `/admin/content-studio?hook=${encodeURIComponent(script.hook)}&inspiration=${encodeURIComponent(script.body_outline)}`
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 rounded transition-colors"
                        >
                          Use in Studio
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
          )}

          {/* Strategic Notes */}
          {analysis.strategic_notes?.length > 0 && (
            <AdminCard title="Strategic Notes">
              <ul className="space-y-2">
                {analysis.strategic_notes.map((note, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <Sparkles className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    {note}
                  </li>
                ))}
              </ul>
            </AdminCard>
          )}

          {/* Apply to Brand */}
          {selectedBrandId && briefId && (
            <div className="flex justify-end">
              <button
                onClick={applyToBrand}
                disabled={applying}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {applying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Apply to Brand
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* Past Briefs */}
      <AdminCard title="Past Briefs">
        {loadingBriefs ? (
          <div className="py-8 text-center text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading...
          </div>
        ) : pastBriefs.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No briefs analyzed yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastBriefs.map(brief => {
              const targetTotal = brief.income_projections?.target?.total;
              return (
                <button
                  key={brief.id}
                  onClick={() => loadPastBrief(brief)}
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
                </button>
              );
            })}
          </div>
        )}
      </AdminCard>
    </AdminPageLayout>
  );
}
