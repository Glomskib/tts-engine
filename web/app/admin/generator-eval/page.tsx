'use client';

import { useState } from 'react';
import {
  Sparkles,
  Loader2,
  FileText,
  Zap,
  Star,
  ThumbsUp,
  Award,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';

// ── Types ─────────────────────────────────────────────────────────

interface HookData {
  visual_hook: string;
  text_on_screen: string;
  verbal_hook: string;
  why_this_works: string;
  category: string;
}

interface HookBatchResult {
  batchIndex: number;
  hooks: HookData[];
  meta: {
    categories: string[];
    hasVibe: boolean;
    hasIntelligence: boolean;
    punchedUp: boolean;
    generatedAt: string;
  };
}

interface ScriptResult {
  personaId: string;
  personaName: string;
  output: {
    hook: string;
    setup: string;
    body: string;
    cta: string;
    spokenScript: string;
    onScreenText: string[];
    filmingNotes: string;
  };
  meta: {
    salesApproach: string;
    structureUsed: string;
    punchedUp: boolean;
    hasVibe: boolean;
    estimatedLength: string;
    generatedAt: string;
  };
}

type Rating = 'strongest_hook' | 'most_human' | 'most_viral' | 'least_ai' | 'best_cta';

const RATING_OPTIONS: { id: Rating; label: string; icon: React.ReactNode }[] = [
  { id: 'strongest_hook', label: 'Strongest Hook', icon: <Zap className="w-3.5 h-3.5" /> },
  { id: 'most_human', label: 'Most Human', icon: <ThumbsUp className="w-3.5 h-3.5" /> },
  { id: 'most_viral', label: 'Most Viral', icon: <Star className="w-3.5 h-3.5" /> },
  { id: 'least_ai', label: 'Least AI', icon: <Award className="w-3.5 h-3.5" /> },
  { id: 'best_cta', label: 'Best CTA', icon: <FileText className="w-3.5 h-3.5" /> },
];

const PERSONAS = [
  { id: 'honest_reviewer', name: 'Honest Reviewer' },
  { id: 'skeptic_convert', name: 'Skeptic Convert' },
  { id: 'educator', name: 'Educator' },
  { id: 'storyteller', name: 'Storyteller' },
  { id: 'hype_man', name: 'Hype Man' },
  { id: 'relatable_friend', name: 'Relatable Friend' },
];

// ── Component ─────────────────────────────────────────────────────

export default function GeneratorEvalPage() {
  const { showSuccess, showError } = useToast();

  // Inputs
  const [mode, setMode] = useState<'hooks' | 'scripts'>('hooks');
  const [product, setProduct] = useState('');
  const [platform, setPlatform] = useState('tiktok');
  const [niche, setNiche] = useState('');
  const [tone, setTone] = useState('');
  const [audience, setAudience] = useState('');
  const [contentType, setContentType] = useState('');
  const [targetLength, setTargetLength] = useState('30_sec');
  const [hookBatches, setHookBatches] = useState(2);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([
    'honest_reviewer', 'skeptic_convert', 'hype_man',
  ]);
  const [enablePunchUp, setEnablePunchUp] = useState(true);

  // State
  const [loading, setLoading] = useState(false);
  const [hookResults, setHookResults] = useState<HookBatchResult[]>([]);
  const [scriptResults, setScriptResults] = useState<ScriptResult[]>([]);

  // Ratings — key is "{mode}:{index}", value is set of rating IDs
  const [ratings, setRatings] = useState<Record<string, Set<Rating>>>({});

  // Eval session log (session-only persistence)
  const [evalLog, setEvalLog] = useState<Array<{
    timestamp: string;
    mode: string;
    product: string;
    ratings: Record<string, string[]>;
    resultCount: number;
  }>>([]);
  const [showLog, setShowLog] = useState(false);
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  async function runEval() {
    if (!product.trim()) return;
    setLoading(true);
    setHookResults([]);
    setScriptResults([]);
    setRatings({});

    try {
      const res = await fetch('/api/admin/generator-eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode,
          product: product.trim(),
          platform,
          niche,
          tone,
          audience,
          contentType: contentType || undefined,
          targetLength,
          hookBatches,
          personaIds: selectedPersonas,
          enablePunchUp,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Generation failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.mode === 'hooks') {
        setHookResults(data.results || []);
        showSuccess(`${data.results?.length || 0} hook batches generated`);
      } else {
        setScriptResults(data.results || []);
        showSuccess(`${data.results?.length || 0} script variants generated`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setLoading(false);
    }
  }

  function toggleRating(key: string, rating: Rating) {
    setRatings(prev => {
      const current = new Set(prev[key] || []);
      if (current.has(rating)) {
        current.delete(rating);
      } else {
        current.add(rating);
      }
      return { ...prev, [key]: current };
    });
  }

  function saveEvalToLog() {
    const ratingsSerialized: Record<string, string[]> = {};
    for (const [key, ratingSet] of Object.entries(ratings)) {
      if (ratingSet.size > 0) {
        ratingsSerialized[key] = [...ratingSet];
      }
    }

    const entry = {
      timestamp: new Date().toISOString(),
      mode,
      product,
      ratings: ratingsSerialized,
      resultCount: mode === 'hooks' ? hookResults.length : scriptResults.length,
    };

    setEvalLog(prev => [entry, ...prev]);
    showSuccess('Eval saved to session log');
  }

  function togglePersona(id: string) {
    setSelectedPersonas(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  function copyScript(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedScript(key);
    setTimeout(() => setCopiedScript(null), 2000);
  }

  const inputClass = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <AdminPageLayout
      title="Generator Eval"
      subtitle="Compare hook and script generation quality across personas, structures, and vibe"
      stage="analytics"
      headerActions={
        evalLog.length > 0 ? (
          <button
            onClick={() => setShowLog(!showLog)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
          >
            {showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Session Log ({evalLog.length})
          </button>
        ) : undefined
      }
    >
      {/* Session Log (collapsible) */}
      {showLog && evalLog.length > 0 && (
        <AdminCard title="Session Eval Log" accent="violet">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {evalLog.map((entry, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 rounded-lg text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-500 text-xs">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${entry.mode === 'hooks' ? 'bg-teal-500/10 text-teal-400' : 'bg-violet-500/10 text-violet-400'}`}>
                    {entry.mode}
                  </span>
                  <span className="text-zinc-300">{entry.product}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-xs">{entry.resultCount} results</span>
                  <span className="text-zinc-500 text-xs">{Object.keys(entry.ratings).length} rated</span>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>
      )}

      {/* Input Controls */}
      <AdminCard title="Evaluation Setup">
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('hooks')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                mode === 'hooks'
                  ? 'bg-teal-500/15 border-2 border-teal-500/50 text-teal-400'
                  : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Zap className="w-4 h-4 inline mr-1.5" />
              Hooks
            </button>
            <button
              onClick={() => setMode('scripts')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                mode === 'scripts'
                  ? 'bg-violet-500/15 border-2 border-violet-500/50 text-violet-400'
                  : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-1.5" />
              Scripts
            </button>
          </div>

          {/* Product */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Product / Topic *</label>
            <input
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="e.g., Portable blender for protein shakes"
              className={inputClass}
              disabled={loading}
            />
          </div>

          {/* Platform + Niche */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputClass} disabled={loading}>
                <option value="tiktok">TikTok</option>
                <option value="youtube_shorts">YouTube Shorts</option>
                <option value="instagram_reels">Instagram Reels</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Niche</label>
              <select value={niche} onChange={(e) => setNiche(e.target.value)} className={inputClass} disabled={loading}>
                <option value="">All</option>
                <option value="fitness">Fitness</option>
                <option value="beauty">Beauty</option>
                <option value="tech">Tech</option>
                <option value="food">Food</option>
                <option value="finance">Finance</option>
                <option value="health">Health</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Tone</label>
              <select value={tone} onChange={(e) => setTone(e.target.value)} className={inputClass} disabled={loading}>
                <option value="">Auto</option>
                <option value="Funny">Funny</option>
                <option value="Aggressive">Aggressive</option>
                <option value="Clinical">Clinical</option>
                <option value="Sarcastic">Sarcastic</option>
                <option value="Hype">Hype</option>
              </select>
            </div>
          </div>

          {/* Audience */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Target Audience (optional)</label>
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g., Women 25-34, new moms, gym beginners"
              className={inputClass}
              disabled={loading}
            />
          </div>

          {/* Mode-specific controls */}
          {mode === 'hooks' ? (
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Batches to Compare</label>
              <div className="flex gap-2">
                {[2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setHookBatches(n)}
                    className={`px-4 py-1.5 text-xs rounded-lg border transition-colors ${
                      hookBatches === n
                        ? 'bg-teal-500/15 border-teal-500/40 text-teal-400'
                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {n} batches
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Personas to Compare</label>
                <div className="flex flex-wrap gap-2">
                  {PERSONAS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => togglePersona(p.id)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        selectedPersonas.includes(p.id)
                          ? 'bg-violet-500/15 border-violet-500/40 text-violet-400'
                          : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Content Type</label>
                  <select value={contentType} onChange={(e) => setContentType(e.target.value)} className={inputClass} disabled={loading}>
                    <option value="">Auto</option>
                    <option value="educational">Educational</option>
                    <option value="testimonial">Testimonial</option>
                    <option value="how-to">How-To</option>
                    <option value="comparison">Comparison</option>
                    <option value="unboxing">Unboxing</option>
                    <option value="transformation">Transformation</option>
                    <option value="comedy">Comedy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Target Length</label>
                  <select value={targetLength} onChange={(e) => setTargetLength(e.target.value)} className={inputClass} disabled={loading}>
                    <option value="15_sec">15 seconds</option>
                    <option value="30_sec">30 seconds</option>
                    <option value="45_sec">45 seconds</option>
                    <option value="60_sec">60 seconds</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enablePunchUp}
                  onChange={(e) => setEnablePunchUp(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-800 text-teal-500 focus:ring-teal-500"
                />
                Enable punch-up pass
              </label>
            </>
          )}

          {/* Generate button */}
          <button
            onClick={runEval}
            disabled={loading || !product.trim() || (mode === 'scripts' && selectedPersonas.length === 0)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-violet-500 hover:from-teal-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating {mode === 'hooks' ? `${hookBatches} batches` : `${selectedPersonas.length} variants`}...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Run Eval ({mode === 'hooks' ? `${hookBatches} batches` : `${selectedPersonas.length} personas`})</>
            )}
          </button>
        </div>
      </AdminCard>

      {/* ── Hook Results ───────────────────────────────────────── */}
      {hookResults.length > 0 && (
        <>
          <div className="flex items-center justify-between mt-6 mb-3">
            <h3 className="text-lg font-semibold text-zinc-100">
              {hookResults.length} Hook Batches — Side by Side
            </h3>
            <button
              onClick={saveEvalToLog}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
            >
              Save Eval
            </button>
          </div>

          {/* Grid: one column per batch */}
          <div className={`grid gap-4 ${hookResults.length === 2 ? 'grid-cols-1 lg:grid-cols-2' : hookResults.length === 3 ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-4'}`}>
            {hookResults.map((batch) => (
              <div key={batch.batchIndex} className="space-y-3">
                <AdminCard
                  title={`Batch ${batch.batchIndex + 1}`}
                  accent="teal"
                  headerActions={
                    <div className="flex gap-1.5 flex-wrap">
                      {batch.meta.punchedUp && (
                        <span className="px-2 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">punched up</span>
                      )}
                      {batch.meta.hasVibe && (
                        <span className="px-2 py-0.5 text-[10px] rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">vibe</span>
                      )}
                      {batch.meta.hasIntelligence && (
                        <span className="px-2 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">intel</span>
                      )}
                    </div>
                  }
                >
                  <div className="space-y-4">
                    {batch.hooks.map((hook, hi) => {
                      const key = `hooks:${batch.batchIndex}:${hi}`;
                      const currentRatings = ratings[key] || new Set<Rating>();
                      return (
                        <div key={hi} className="border-b border-white/5 pb-4 last:border-0 last:pb-0">
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-xs text-zinc-500 font-medium">
                              #{hi + 1} · {hook.category?.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-sm text-teal-300 mb-1">
                            <span className="text-zinc-500 text-xs">Verbal:</span> &ldquo;{hook.verbal_hook}&rdquo;
                          </p>
                          <p className="text-sm text-blue-300 mb-1">
                            <span className="text-zinc-500 text-xs">Screen:</span> {hook.text_on_screen}
                          </p>
                          <p className="text-xs text-zinc-500 mb-2">{hook.visual_hook}</p>
                          {/* Rating pills */}
                          <div className="flex flex-wrap gap-1">
                            {RATING_OPTIONS.map(opt => (
                              <button
                                key={opt.id}
                                onClick={() => toggleRating(key, opt.id)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                                  currentRatings.has(opt.id)
                                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
                                }`}
                              >
                                {opt.icon} {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AdminCard>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Script Results ──────────────────────────────────────── */}
      {scriptResults.length > 0 && (
        <>
          <div className="flex items-center justify-between mt-6 mb-3">
            <h3 className="text-lg font-semibold text-zinc-100">
              {scriptResults.length} Script Variants — Side by Side
            </h3>
            <button
              onClick={saveEvalToLog}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
            >
              Save Eval
            </button>
          </div>

          <div className={`grid gap-4 ${scriptResults.length <= 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'}`}>
            {scriptResults.map((result, si) => {
              const key = `scripts:${si}`;
              const currentRatings = ratings[key] || new Set<Rating>();
              return (
                <AdminCard
                  key={si}
                  title={result.personaName}
                  accent={si === 0 ? 'teal' : si === 1 ? 'violet' : si === 2 ? 'amber' : 'blue'}
                  headerActions={
                    <div className="flex gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 text-[10px] rounded bg-zinc-700 text-zinc-400">
                        {result.meta.structureUsed}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] rounded bg-zinc-700 text-zinc-400">
                        {result.meta.salesApproach}
                      </span>
                      {result.meta.punchedUp && (
                        <span className="px-2 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">punched up</span>
                      )}
                      {result.meta.hasVibe && (
                        <span className="px-2 py-0.5 text-[10px] rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">vibe</span>
                      )}
                    </div>
                  }
                >
                  <div className="space-y-3">
                    {/* Hook */}
                    <div>
                      <span className="text-[10px] font-semibold text-teal-400 uppercase tracking-wide">Hook</span>
                      <p className="text-sm text-zinc-200 mt-0.5">{result.output.hook}</p>
                    </div>

                    {/* Setup */}
                    {result.output.setup && (
                      <div>
                        <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Setup</span>
                        <p className="text-sm text-zinc-300 mt-0.5">{result.output.setup}</p>
                      </div>
                    )}

                    {/* Body */}
                    <div>
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Body</span>
                      <p className="text-sm text-zinc-300 mt-0.5 whitespace-pre-wrap">{result.output.body}</p>
                    </div>

                    {/* CTA */}
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">CTA</span>
                      <p className="text-sm text-zinc-200 mt-0.5">{result.output.cta}</p>
                    </div>

                    {/* On-screen text */}
                    {result.output.onScreenText.length > 0 && (
                      <div>
                        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">On-Screen Text</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {result.output.onScreenText.map((t, ti) => (
                            <span key={ti} className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Meta */}
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      <span className="text-xs text-zinc-500">{result.meta.estimatedLength}</span>
                      <button
                        onClick={() => copyScript(result.output.spokenScript, `script-${si}`)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded transition-colors"
                      >
                        {copiedScript === `script-${si}` ? (
                          <><Check className="w-3 h-3 text-teal-400" /> Copied</>
                        ) : (
                          <><Copy className="w-3 h-3" /> Copy Script</>
                        )}
                      </button>
                    </div>

                    {/* Ratings */}
                    <div className="pt-2 border-t border-white/5">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1.5">Rate This Variant</span>
                      <div className="flex flex-wrap gap-1">
                        {RATING_OPTIONS.map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => toggleRating(key, opt.id)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                              currentRatings.has(opt.id)
                                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                                : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
                            }`}
                          >
                            {opt.icon} {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </AdminCard>
              );
            })}
          </div>
        </>
      )}
    </AdminPageLayout>
  );
}
