'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Loader2, ArrowRight, ChevronDown, ChevronUp,
  BarChart, RefreshCw, AlertTriangle, Trophy, TrendingUp,
  FileText
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { PullToRefresh } from '@/components/ui/PullToRefresh';

interface ScoreResult {
  hook_strength: number;
  humor_level: number;
  product_integration: number;
  virality_potential: number;
  clarity: number;
  production_feasibility: number;
  audience_language: number;
  overall_score: number;
  strengths: string[];
  improvements: string[];
}

interface Script {
  id: string;
  title: string;
  skit_data: {
    hook_line?: string;
    beats?: Array<{ t: string; action: string; dialogue?: string; on_screen_text?: string }>;
    b_roll?: string[];
    overlays?: string[];
    cta_line?: string;
    cta_overlay?: string;
  };
  product?: { name: string; brand?: string };
  created_at: string;
}

const DIMENSIONS = [
  { key: 'hook_strength', label: 'Hook', color: '#3b82f6' },
  { key: 'humor_level', label: 'Humor', color: '#8b5cf6' },
  { key: 'product_integration', label: 'Product', color: '#10b981' },
  { key: 'virality_potential', label: 'Virality', color: '#f59e0b' },
  { key: 'clarity', label: 'Clarity', color: '#06b6d4' },
  { key: 'production_feasibility', label: 'Feasibility', color: '#ec4899' },
  { key: 'audience_language', label: 'Language', color: '#f97316' },
] as const;

function getScoreColor(score: number): string {
  if (score >= 8) return 'text-emerald-400';
  if (score >= 6) return 'text-teal-400';
  if (score >= 4) return 'text-amber-400';
  return 'text-red-400';
}

function getScoreBg(score: number): string {
  if (score >= 8) return 'bg-emerald-500';
  if (score >= 6) return 'bg-teal-500';
  if (score >= 4) return 'bg-amber-500';
  return 'bg-red-500';
}

// SVG Radar Chart component (no external dependency)
function RadarChart({ scores, compareScores, size = 280 }: {
  scores: ScoreResult;
  compareScores?: ScoreResult | null;
  size?: number;
}) {
  const center = size / 2;
  const radius = size / 2 - 40;
  const angleStep = (2 * Math.PI) / DIMENSIONS.length;

  const getPoint = (value: number, index: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (value / 10) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const gridLevels = [2, 4, 6, 8, 10];

  const mainPoints = DIMENSIONS.map((d, i) => getPoint((scores as unknown as Record<string, number>)[d.key] || 0, i));
  const mainPath = mainPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  let comparePath = '';
  if (compareScores) {
    const comparePoints = DIMENSIONS.map((d, i) => getPoint((compareScores as unknown as Record<string, number>)[d.key] || 0, i));
    comparePath = comparePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  }

  return (
    <svg width={size} height={size} className="mx-auto">
      {/* Grid circles */}
      {gridLevels.map((level) => {
        const points = DIMENSIONS.map((_, i) => getPoint(level, i));
        const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
        return (
          <path key={level} d={path} fill="none" stroke="rgb(63 63 70)" strokeWidth="1" opacity="0.5" />
        );
      })}

      {/* Axis lines */}
      {DIMENSIONS.map((_, i) => {
        const end = getPoint(10, i);
        return (
          <line key={i} x1={center} y1={center} x2={end.x} y2={end.y} stroke="rgb(63 63 70)" strokeWidth="1" opacity="0.3" />
        );
      })}

      {/* Compare area (if present) */}
      {comparePath && (
        <path d={comparePath} fill="rgb(239 68 68)" fillOpacity="0.1" stroke="rgb(239 68 68)" strokeWidth="1.5" strokeDasharray="4 2" />
      )}

      {/* Main score area */}
      <path d={mainPath} fill="rgb(20 184 166)" fillOpacity="0.2" stroke="rgb(20 184 166)" strokeWidth="2" />

      {/* Score dots */}
      {mainPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="rgb(20 184 166)" />
      ))}

      {/* Labels */}
      {DIMENSIONS.map((d, i) => {
        const labelPoint = getPoint(12, i);
        return (
          <text
            key={d.key}
            x={labelPoint.x}
            y={labelPoint.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-zinc-400 text-[11px]"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

export default function QualityPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [compareScript, setCompareScript] = useState<Script | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scores, setScores] = useState<ScoreResult | null>(null);
  const [compareScores, setCompareScores] = useState<ScoreResult | null>(null);
  const [expandedSection, setExpandedSection] = useState<'strengths' | 'improvements' | null>('strengths');
  const [showCompare, setShowCompare] = useState(false);

  const fetchScripts = useCallback(async () => {
    try {
      const res = await fetch('/api/skits?limit=50');
      if (res.ok) {
        const data = await res.json();
        setScripts((data.data || []).map((s: Record<string, unknown>) => ({
          id: s.id,
          title: s.title || 'Untitled',
          skit_data: {},
          product: { name: s.product_name as string || '', brand: s.product_brand as string || '' },
          created_at: s.created_at as string,
        })));
      }
    } catch (err) {
      console.error('Failed to fetch scripts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchScripts(); }, [fetchScripts]);

  const fetchFullScript = async (id: string): Promise<Script | null> => {
    try {
      const res = await fetch(`/api/skits/${id}`);
      if (res.ok) {
        const data = await res.json();
        const s = data.data;
        return {
          id: s.id,
          title: s.title || 'Untitled',
          skit_data: s.skit_data || {},
          product: { name: s.product_name || '', brand: s.product_brand || '' },
          created_at: s.created_at,
        };
      }
    } catch (err) {
      console.error('Failed to fetch script details:', err);
    }
    return null;
  };

  const scoreScript = async (script: Script, isCompare = false) => {
    // Fetch full skit_data if not loaded
    let fullScript = script;
    if (!script.skit_data?.hook_line) {
      const fetched = await fetchFullScript(script.id);
      if (!fetched?.skit_data?.hook_line) return;
      fullScript = fetched;
      if (!isCompare) setSelectedScript(fetched);
    }

    if (!fullScript.skit_data?.hook_line || !fullScript.skit_data?.beats) return;

    setScoring(true);
    try {
      const res = await fetch('/api/ai/score-skit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skit_data: fullScript.skit_data,
          product_name: fullScript.product?.name || 'Unknown Product',
          product_brand: fullScript.product?.brand,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (isCompare) {
          setCompareScores(data.data);
        } else {
          setScores(data.data);
        }
      }
    } catch (err) {
      console.error('Scoring failed:', err);
    } finally {
      setScoring(false);
    }
  };

  const handleSelectScript = async (script: Script) => {
    setSelectedScript(script);
    setScores(null);
    setCompareScores(null);
    setCompareScript(null);
    setShowCompare(false);
    // Pre-fetch full data
    const full = await fetchFullScript(script.id);
    if (full) setSelectedScript(full);
  };

  const handleSelectCompare = (script: Script) => {
    setCompareScript(script);
    setCompareScores(null);
  };

  return (
    <PullToRefresh onRefresh={fetchScripts}>
      <div className="px-4 py-6 pb-24 lg:pb-8 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Content Quality</h1>
          <p className="text-zinc-400 text-sm">AI-powered multi-dimension scoring for your scripts</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Script Selector (left column) */}
          <div className="lg:col-span-1">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-white mb-3">Select a Script</h2>

              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} height={48} width="100%" />
                  ))}
                </div>
              ) : scripts.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No scripts yet</p>
                  <p className="text-xs text-zinc-600 mt-1">Generate scripts in Content Studio first</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                  {scripts.map((script) => (
                    <button
                      key={script.id}
                      type="button"
                      onClick={() => handleSelectScript(script)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedScript?.id === script.id
                          ? 'bg-teal-500/15 border border-teal-500/30'
                          : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-800'
                      }`}
                    >
                      <p className="text-sm text-white truncate">{script.title || 'Untitled'}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {script.product?.name || 'No product'} &middot; {new Date(script.created_at).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Scoring Results (right columns) */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedScript ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <BarChart className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-zinc-300">Select a script to score</h3>
                <p className="text-sm text-zinc-500 mt-1">Choose a script from the left to analyze its quality across 7 dimensions</p>
              </div>
            ) : (
              <>
                {/* Selected Script Info + Score Button */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-white truncate">{selectedScript.title}</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Hook: &quot;{selectedScript.skit_data?.hook_line?.slice(0, 60)}...&quot;
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => scoreScript(selectedScript)}
                      disabled={scoring || !selectedScript.skit_data?.hook_line}
                      className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 text-sm font-medium disabled:opacity-50 ml-3"
                    >
                      {scoring ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Scoring...</>
                      ) : scores ? (
                        <><RefreshCw className="w-4 h-4" /> Re-score</>
                      ) : (
                        <><Sparkles className="w-4 h-4" /> Score Script</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Scores Display */}
                {scores && (
                  <>
                    {/* Overall + Radar */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Overall Score */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <div className="text-center mb-4">
                          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl ${
                            scores.overall_score >= 8 ? 'bg-emerald-500/20' :
                            scores.overall_score >= 6 ? 'bg-teal-500/20' :
                            scores.overall_score >= 4 ? 'bg-amber-500/20' : 'bg-red-500/20'
                          }`}>
                            <span className={`text-4xl font-bold ${getScoreColor(scores.overall_score)}`}>
                              {scores.overall_score}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-400 mt-2">Overall Quality</p>
                          <p className={`text-xs font-medium ${getScoreColor(scores.overall_score)}`}>
                            {scores.overall_score >= 8 ? 'Excellent' :
                             scores.overall_score >= 6 ? 'Good' :
                             scores.overall_score >= 4 ? 'Needs Work' : 'Weak'}
                          </p>
                        </div>

                        {/* Dimension bars */}
                        <div className="space-y-2">
                          {DIMENSIONS.map((d) => {
                            const val = (scores as unknown as Record<string, number>)[d.key] || 0;
                            return (
                              <div key={d.key} className="flex items-center gap-2">
                                <span className="text-[11px] text-zinc-500 w-16 shrink-0">{d.label}</span>
                                <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${getScoreBg(val)}`}
                                    style={{ width: `${val * 10}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-medium w-5 text-right ${getScoreColor(val)}`}>{val}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Radar Chart */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col items-center justify-center">
                        <RadarChart scores={scores} compareScores={compareScores} size={260} />
                        {compareScores && (
                          <div className="flex items-center gap-4 mt-2 text-xs">
                            <span className="flex items-center gap-1">
                              <div className="w-3 h-1 bg-teal-500 rounded" /> Selected
                            </span>
                            <span className="flex items-center gap-1">
                              <div className="w-3 h-1 bg-red-500 rounded border-dashed" /> Compare
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Strengths & Improvements */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      {/* Strengths */}
                      <button
                        type="button"
                        onClick={() => setExpandedSection(expandedSection === 'strengths' ? null : 'strengths')}
                        className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                          <Trophy className="w-4 h-4" /> Strengths
                        </span>
                        {expandedSection === 'strengths' ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                      </button>
                      {expandedSection === 'strengths' && (
                        <div className="px-4 pb-4 space-y-2">
                          {scores.strengths.map((s, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                              <span className="text-emerald-400 mt-0.5">+</span>
                              <span>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Improvements */}
                      <button
                        type="button"
                        onClick={() => setExpandedSection(expandedSection === 'improvements' ? null : 'improvements')}
                        className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors border-t border-zinc-800"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-amber-400">
                          <TrendingUp className="w-4 h-4" /> Improvements
                        </span>
                        {expandedSection === 'improvements' ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                      </button>
                      {expandedSection === 'improvements' && (
                        <div className="px-4 pb-4 space-y-2">
                          {scores.improvements.map((s, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                              <span>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Compare Section */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <button
                        type="button"
                        onClick={() => setShowCompare(!showCompare)}
                        className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
                      >
                        <ArrowRight className={`w-4 h-4 transition-transform ${showCompare ? 'rotate-90' : ''}`} />
                        Compare with another script
                      </button>

                      {showCompare && (
                        <div className="mt-3 space-y-2">
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {scripts.filter(s => s.id !== selectedScript.id).map((script) => (
                              <button
                                key={script.id}
                                type="button"
                                onClick={() => handleSelectCompare(script)}
                                className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                                  compareScript?.id === script.id
                                    ? 'bg-red-500/15 border border-red-500/30'
                                    : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-800'
                                }`}
                              >
                                <p className="text-zinc-200 truncate">{script.title || 'Untitled'}</p>
                              </button>
                            ))}
                          </div>
                          {compareScript && (
                            <button
                              type="button"
                              onClick={() => scoreScript(compareScript, true)}
                              disabled={scoring}
                              className="flex items-center gap-2 px-4 py-2 bg-red-600/80 text-white rounded-lg hover:bg-red-500 text-sm font-medium disabled:opacity-50"
                            >
                              {scoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                              Score for Comparison
                            </button>
                          )}

                          {compareScores && (
                            <div className="mt-3 p-3 rounded-lg bg-zinc-800/50">
                              <h4 className="text-xs font-medium text-zinc-400 mb-2">Score Comparison</h4>
                              <div className="space-y-1.5">
                                {DIMENSIONS.map((d) => {
                                  const mainVal = (scores as unknown as Record<string, number>)[d.key] || 0;
                                  const compVal = (compareScores as unknown as Record<string, number>)[d.key] || 0;
                                  const diff = mainVal - compVal;
                                  return (
                                    <div key={d.key} className="flex items-center gap-2 text-xs">
                                      <span className="text-zinc-500 w-16">{d.label}</span>
                                      <span className="text-teal-400 w-4 text-right">{mainVal}</span>
                                      <span className="text-zinc-600">vs</span>
                                      <span className="text-red-400 w-4">{compVal}</span>
                                      <span className={`font-medium ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                                        {diff > 0 ? `+${diff}` : diff === 0 ? '=' : diff}
                                      </span>
                                    </div>
                                  );
                                })}
                                <div className="flex items-center gap-2 text-xs pt-1 border-t border-zinc-700">
                                  <span className="text-zinc-400 w-16 font-medium">Overall</span>
                                  <span className="text-teal-400 w-4 text-right font-bold">{scores.overall_score}</span>
                                  <span className="text-zinc-600">vs</span>
                                  <span className="text-red-400 w-4 font-bold">{compareScores.overall_score}</span>
                                  <span className={`font-bold ${scores.overall_score > compareScores.overall_score ? 'text-emerald-400' : scores.overall_score < compareScores.overall_score ? 'text-red-400' : 'text-zinc-500'}`}>
                                    {scores.overall_score > compareScores.overall_score ? `+${scores.overall_score - compareScores.overall_score}` : scores.overall_score === compareScores.overall_score ? '=' : scores.overall_score - compareScores.overall_score}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}
