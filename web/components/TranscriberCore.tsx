'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clipboard,
  Check,
  Loader2,
  Zap,
  Target,
  MessageSquareText,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Clock,
  Globe,
  Trophy,
  FileText,
  ChevronDown,
  ChevronUp,
  Lock,
  RefreshCw,
  Lightbulb,
  Pen,
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// Types
// ============================================================================

interface HookAnalysis {
  line: string;
  style: string;
  strength: number;
}

interface ContentBreakdown {
  format: string;
  pacing: string;
  structure: string;
}

interface TranscribeResult {
  transcript: string;
  duration: number;
  language: string;
  segments: { start: number; end: number; text: string }[];
  analysis: {
    hook: HookAnalysis;
    content: ContentBreakdown;
    keyPhrases: string[];
    emotionalTriggers: string[];
    whatWorks: string[];
    targetEmotion: string;
  } | null;
}

interface ScriptConcept {
  title: string;
  angle: string;
  hook: string;
  outline: string;
}

interface AlternativeHook {
  hook: string;
  style: string;
  why_it_works: string;
}

interface ProductCategory {
  category: string;
  reasoning: string;
  example_product: string;
}

interface Recommendations {
  script_concepts: ScriptConcept[];
  alternative_hooks: AlternativeHook[];
  product_categories: ProductCategory[];
}

interface RewriteResult {
  rewritten_hook: string;
  rewritten_script: string;
  on_screen_text: string[];
  cta: string;
  persona_used: string;
  tone_used: string;
  tips: string[];
}

export interface TranscriberCoreProps {
  isPortal: boolean;
  isLoggedIn: boolean;
  planId?: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const CUSTOMER_ARCHETYPES = [
  { id: 'skeptic', name: 'The Skeptic' },
  { id: 'sober_curious', name: 'Sober Curious' },
  { id: 'chronic_warrior', name: 'Chronic Warrior' },
  { id: 'honest_reviewer', name: 'Honest Reviewer' },
  { id: 'educator', name: 'The Educator' },
  { id: 'storyteller', name: 'The Storyteller' },
  { id: 'hype_man', name: 'The Hype Man' },
  { id: 'relatable_friend', name: 'Relatable Friend' },
  { id: 'custom', name: 'Custom' },
] as const;

const VOICE_TONES = [
  { id: 'conversational', name: 'Conversational' },
  { id: 'authoritative', name: 'Authoritative' },
  { id: 'empathetic', name: 'Empathetic' },
  { id: 'high_energy', name: 'High Energy' },
  { id: 'educational', name: 'Educational' },
  { id: 'raw_authentic', name: 'Raw & Authentic' },
] as const;

// ============================================================================
// Inline copy helper
// ============================================================================

function useCopyState() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCopiedKey(key);
    timeoutRef.current = setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  return { copiedKey, copy };
}

function CopyButton({ text, copyKey, copiedKey, copy, size = 'sm', label }: {
  text: string;
  copyKey: string;
  copiedKey: string | null;
  copy: (text: string, key: string) => void;
  size?: 'sm' | 'xs';
  label?: string;
}) {
  const isCopied = copiedKey === copyKey;
  const sizeClasses = size === 'xs'
    ? 'px-2 py-1 text-xs gap-1'
    : 'px-3 py-1.5 text-sm gap-2';

  return (
    <button
      onClick={() => copy(text, copyKey)}
      className={`inline-flex items-center ${sizeClasses} rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors shrink-0`}
    >
      {isCopied ? (
        <>
          <Check size={size === 'xs' ? 12 : 14} className="text-green-400" />
          Copied!
        </>
      ) : (
        <>
          <Clipboard size={size === 'xs' ? 12 : 14} />
          {label || 'Copy'}
        </>
      )}
    </button>
  );
}

// ============================================================================
// Component
// ============================================================================

export default function TranscriberCore({ isPortal, isLoggedIn: initialLoggedIn, planId }: TranscriberCoreProps) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [error, setError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(initialLoggedIn);
  const [addingWinner, setAddingWinner] = useState(false);
  const [winnerAdded, setWinnerAdded] = useState(false);
  const [winnerError, setWinnerError] = useState('');
  const [usageRemaining, setUsageRemaining] = useState<number | null>(null);
  const [usageLimit, setUsageLimit] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Copy state
  const { copiedKey, copy } = useCopyState();

  // Recommendations state
  const [recsOpen, setRecsOpen] = useState(false);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [recsError, setRecsError] = useState('');

  // Rewrite state
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [rewriteError, setRewriteError] = useState('');
  const [selectedPersona, setSelectedPersona] = useState('skeptic');
  const [selectedTone, setSelectedTone] = useState('conversational');
  const [customPersona, setCustomPersona] = useState('');

  const isPaid = usageLimit === -1;
  const isRateLimited = usageRemaining !== null && usageRemaining <= 0 && !isPaid;

  useEffect(() => {
    if (!initialLoggedIn) {
      const supabase = createBrowserSupabaseClient();
      supabase.auth.getUser().then(({ data }) => {
        setIsLoggedIn(!!data.user);
      });
    }

    fetch('/api/transcribe/usage')
      .then((r) => r.json())
      .then((data) => {
        setUsageRemaining(data.remaining);
        setUsageLimit(data.limit);
        if (data.loggedIn) setIsLoggedIn(true);
      })
      .catch(() => {});
  }, [initialLoggedIn]);

  function updateRateLimits(res: Response) {
    const rlRemaining = res.headers.get('X-RateLimit-Remaining');
    const rlLimit = res.headers.get('X-RateLimit-Limit');
    if (rlRemaining !== null) setUsageRemaining(parseInt(rlRemaining, 10));
    if (rlLimit !== null) setUsageLimit(parseInt(rlLimit, 10));
  }

  async function handleTranscribe() {
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);
    setWinnerAdded(false);
    setWinnerError('');
    setRecommendations(null);
    setRewriteResult(null);
    setRecsOpen(false);
    setRewriteOpen(false);

    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        if (res.status === 429) setUsageRemaining(0);
        return;
      }

      updateRateLimits(res);
      setResult(data);

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  function buildAnalysisCopyText(): string {
    if (!result?.analysis) return '';
    const a = result.analysis;
    return [
      `Hook: "${a.hook.line}"`,
      `Style: ${a.hook.style}`,
      `Strength: ${a.hook.strength}/10`,
      `Format: ${a.content.format}`,
      `Pacing: ${a.content.pacing}`,
      `Structure: ${a.content.structure}`,
      `Key Phrases: ${a.keyPhrases.join(', ')}`,
      `What Works: ${a.whatWorks.join('; ')}`,
      `Emotional Triggers: ${a.emotionalTriggers.join(', ')}`,
      `Target Emotion: ${a.targetEmotion}`,
    ].join('\n');
  }

  async function handleAddToWinners() {
    if (!result) return;
    setAddingWinner(true);
    setWinnerError('');

    try {
      const res = await fetch('/api/winners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'external',
          video_url: url.trim(),
          full_script: result.transcript,
          hook: result.analysis?.hook.line,
          hook_type: result.analysis?.hook.style,
          content_format: result.analysis?.content.format,
        }),
      });

      if (res.status === 401) {
        setWinnerError('Sign in to save winners');
        setIsLoggedIn(false);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setWinnerError(data.error || 'Failed to save winner');
        return;
      }

      setWinnerAdded(true);
    } catch {
      setWinnerError('Network error. Please try again.');
    } finally {
      setAddingWinner(false);
    }
  }

  function handleGenerateScript() {
    if (!result) return;
    const inspiration = encodeURIComponent(result.transcript);
    router.push(`/admin/content-studio?inspiration=${inspiration}`);
  }

  // ---- AI Recommendations ----
  async function handleGetRecommendations() {
    if (!result || isRateLimited) return;
    setRecsLoading(true);
    setRecsError('');

    try {
      const res = await fetch('/api/transcribe/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: result.transcript,
          analysis: result.analysis,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRecsError(data.error || 'Failed to generate recommendations.');
        if (res.status === 429) setUsageRemaining(0);
        return;
      }

      updateRateLimits(res);
      setRecommendations(data.data);
    } catch {
      setRecsError('Network error. Please try again.');
    } finally {
      setRecsLoading(false);
    }
  }

  // ---- AI Rewrite ----
  async function handleRewrite() {
    if (!result || isRateLimited) return;
    if (selectedPersona === 'custom' && !customPersona.trim()) return;
    setRewriteLoading(true);
    setRewriteError('');

    try {
      const res = await fetch('/api/transcribe/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: result.transcript,
          analysis: result.analysis,
          persona: selectedPersona,
          tone: selectedTone,
          custom_persona: selectedPersona === 'custom' ? customPersona : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRewriteError(data.error || 'Failed to rewrite script.');
        if (res.status === 429) setUsageRemaining(0);
        return;
      }

      updateRateLimits(res);
      setRewriteResult(data.data);
    } catch {
      setRewriteError('Network error. Please try again.');
    } finally {
      setRewriteLoading(false);
    }
  }

  function handleSaveToContentStudio() {
    if (!rewriteResult) return;
    const script = encodeURIComponent(rewriteResult.rewritten_script);
    router.push(`/admin/content-studio?inspiration=${script}`);
  }

  return (
    <div className="relative">
      {/* Subtle grid background — public only */}
      {!isPortal && (
        <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      )}

      {/* Hero / Header Section */}
      <section className={`relative ${isPortal ? 'pb-6' : 'pt-16 pb-8 sm:pt-24 sm:pb-12'}`}>
        <div className={`${isPortal ? 'max-w-4xl' : 'max-w-3xl mx-auto px-6'} text-center`}>
          {/* Badge — public only */}
          {!isPortal && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
              <Zap size={14} />
              100% Free — No signup required
            </div>
          )}

          <h1 className={`font-bold text-white mb-4 leading-tight ${isPortal ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl'}`}>
            {isPortal ? (
              'Transcriber'
            ) : (
              <>
                Free TikTok Video{' '}
                <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
                  Transcriber
                </span>
              </>
            )}
          </h1>

          <p className={`text-zinc-400 mb-${isPortal ? '6' : '10'} ${isPortal ? 'text-base' : 'text-lg max-w-xl mx-auto'}`}>
            Paste any TikTok URL &mdash; get the full transcript, hook analysis, and content
            breakdown in seconds.
          </p>

          {/* Input Area */}
          <div className={isPortal ? 'max-w-3xl' : 'max-w-2xl mx-auto'}>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleTranscribe()}
                placeholder="https://www.tiktok.com/@user/video/..."
                className="flex-1 h-14 px-5 bg-zinc-900 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-base"
                disabled={loading}
              />
              <button
                onClick={handleTranscribe}
                disabled={loading || !url.trim()}
                className="h-14 px-8 bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[160px]"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Transcribing...
                  </>
                ) : (
                  <>
                    <MessageSquareText size={18} />
                    Transcribe
                  </>
                )}
              </button>
            </div>

            {/* Error message */}
            {error && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-left">
                <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Usage counter */}
          {usageRemaining !== null && usageLimit !== null && usageLimit !== -1 && (
            <p className={`text-sm mt-4 ${usageRemaining === 0 ? 'text-red-400' : 'text-zinc-500'}`}>
              {usageRemaining} of {usageLimit} {isLoggedIn ? '' : 'free '}AI use{usageLimit === 1 ? '' : 's'} remaining today
              {!isPortal && !isLoggedIn && usageRemaining <= 3 && (
                <> &mdash; <Link href="/signup" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">sign up</Link> for more /day</>
              )}
            </p>
          )}
          {usageLimit === -1 && (
            <p className="text-sm mt-4 text-zinc-500">Unlimited AI uses</p>
          )}

          {/* Social proof — public only */}
          {!isPortal && (
            <p className="text-xs text-zinc-600 mt-4">
              Works with any public TikTok video. No watermarks, no downloads, no tracking.
            </p>
          )}
        </div>
      </section>

      {/* Results Section */}
      {result && (
        <section ref={resultRef} className={`relative ${isPortal ? 'pb-8' : 'pb-16 sm:pb-24'}`}>
          <div className={`${isPortal ? 'max-w-4xl' : 'max-w-4xl mx-auto px-6'} space-y-6`}>
            {/* Video meta bar */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
              {result.duration > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock size={14} />
                  {formatDuration(result.duration)}
                </span>
              )}
              {result.language && (
                <span className="flex items-center gap-1.5">
                  <Globe size={14} />
                  {result.language.toUpperCase()}
                </span>
              )}
            </div>

            {/* Transcript Card */}
            <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <MessageSquareText size={18} className="text-blue-400" />
                  Full Transcript
                </h2>
                <CopyButton
                  text={result.transcript}
                  copyKey="transcript"
                  copiedKey={copiedKey}
                  copy={copy}
                />
              </div>
              <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{result.transcript}</p>
            </div>

            {/* Analysis Cards */}
            {result.analysis && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Hook Analysis */}
                  <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Target size={18} className="text-orange-400" />
                        Hook Analysis
                      </h3>
                      <CopyButton
                        text={result.analysis.hook.line}
                        copyKey="hook"
                        copiedKey={copiedKey}
                        copy={copy}
                        size="xs"
                        label="Copy Hook"
                      />
                    </div>
                    <div className="space-y-4">
                      <div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wide">Hook Line</span>
                        <p className="text-zinc-200 mt-1 font-medium">&ldquo;{result.analysis.hook.line}&rdquo;</p>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <span className="text-xs text-zinc-500 uppercase tracking-wide">Style</span>
                          <p className="mt-1">
                            <span className="inline-flex px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 text-sm capitalize">
                              {result.analysis.hook.style}
                            </span>
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-zinc-500 uppercase tracking-wide">Strength</span>
                          <p className="mt-1">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-sm font-semibold ${
                              result.analysis.hook.strength >= 8
                                ? 'bg-green-500/10 text-green-400'
                                : result.analysis.hook.strength >= 5
                                  ? 'bg-yellow-500/10 text-yellow-400'
                                  : 'bg-red-500/10 text-red-400'
                            }`}>
                              {result.analysis.hook.strength}/10
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Content Breakdown */}
                  <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                      <Sparkles size={18} className="text-violet-400" />
                      Content Breakdown
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wide">Format</span>
                        <p className="text-zinc-200 mt-1">{result.analysis.content.format}</p>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wide">Pacing</span>
                        <p className="text-zinc-200 mt-1">{result.analysis.content.pacing}</p>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wide">Structure</span>
                        <p className="text-zinc-200 mt-1">{result.analysis.content.structure}</p>
                      </div>
                    </div>
                  </div>

                  {/* Key Phrases */}
                  {result.analysis.keyPhrases.length > 0 && (
                    <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <Zap size={18} className="text-yellow-400" />
                          Key Phrases
                        </h3>
                        <CopyButton
                          text={result.analysis.keyPhrases.join(', ')}
                          copyKey="allPhrases"
                          copiedKey={copiedKey}
                          copy={copy}
                          size="xs"
                          label="Copy All"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {result.analysis.keyPhrases.map((phrase, i) => (
                          <button
                            key={i}
                            onClick={() => copy(phrase, `phrase-${i}`)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm border border-white/5 transition-colors cursor-pointer"
                            title="Click to copy"
                          >
                            {copiedKey === `phrase-${i}` ? (
                              <span className="text-green-400">Copied!</span>
                            ) : (
                              phrase
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* What Works + Emotion */}
                  <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                      <Sparkles size={18} className="text-green-400" />
                      What Works
                    </h3>
                    {result.analysis.targetEmotion && (
                      <div className="mb-4">
                        <span className="text-xs text-zinc-500 uppercase tracking-wide">Target Emotion</span>
                        <p className="mt-1">
                          <span className="inline-flex px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400 text-sm capitalize">
                            {result.analysis.targetEmotion}
                          </span>
                        </p>
                      </div>
                    )}
                    <ul className="space-y-2">
                      {result.analysis.whatWorks.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-zinc-300 text-sm">
                          <Check size={14} className="text-green-400 mt-0.5 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    {result.analysis.emotionalTriggers.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <span className="text-xs text-zinc-500 uppercase tracking-wide">Emotional Triggers</span>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {result.analysis.emotionalTriggers.map((trigger, i) => (
                            <span
                              key={i}
                              className="px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-400 text-sm"
                            >
                              {trigger}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Copy Analysis Button */}
                <div className="flex justify-center">
                  <CopyButton
                    text={buildAnalysisCopyText()}
                    copyKey="analysis"
                    copiedKey={copiedKey}
                    copy={copy}
                    label="Copy Full Analysis"
                  />
                </div>
              </>
            )}

            {/* ================================================================ */}
            {/* AI Recommendations Section */}
            {/* ================================================================ */}
            <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
              <button
                onClick={() => setRecsOpen(!recsOpen)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Lightbulb size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">AI Recommendations</h3>
                    <p className="text-sm text-zinc-400">Script concepts, alternative hooks, product categories</p>
                  </div>
                </div>
                {recsOpen ? <ChevronUp size={20} className="text-zinc-400" /> : <ChevronDown size={20} className="text-zinc-400" />}
              </button>

              {recsOpen && (
                <div className="px-6 pb-6 space-y-4">
                  {!recommendations && !recsLoading && (
                    <div className="text-center py-4">
                      {isRateLimited ? (
                        <div className="space-y-3">
                          <button
                            disabled
                            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 text-zinc-500 font-semibold rounded-xl cursor-not-allowed"
                          >
                            <Lock size={16} />
                            Get AI Recommendations
                          </button>
                          <p className="text-sm text-zinc-500">
                            Upgrade for unlimited AI recommendations.{' '}
                            <span className="text-amber-400 font-medium">Use code TRANSCRIBE20</span>
                          </p>
                        </div>
                      ) : (
                        <button
                          onClick={handleGetRecommendations}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-semibold rounded-xl transition-all"
                        >
                          <Lightbulb size={18} />
                          Get AI Recommendations
                          <span className="text-xs text-amber-400/60 ml-1">(1 AI use)</span>
                        </button>
                      )}
                    </div>
                  )}

                  {recsLoading && (
                    <div className="flex items-center justify-center gap-3 py-8">
                      <Loader2 size={20} className="animate-spin text-amber-400" />
                      <span className="text-zinc-400">Generating recommendations...</span>
                    </div>
                  )}

                  {recsError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                      <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="text-red-300 text-sm">{recsError}</p>
                    </div>
                  )}

                  {recommendations && (
                    <div className="space-y-6">
                      {/* Script Concepts */}
                      {recommendations.script_concepts?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Script Concepts</h4>
                          <div className="space-y-3">
                            {recommendations.script_concepts.map((concept, i) => (
                              <div key={i} className="bg-zinc-800/50 border border-white/5 rounded-lg p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <h5 className="font-medium text-white">{concept.title}</h5>
                                    <p className="text-sm text-zinc-400 mt-1">{concept.angle}</p>
                                    <p className="text-sm text-amber-400 mt-2 font-medium">&ldquo;{concept.hook}&rdquo;</p>
                                    <p className="text-sm text-zinc-400 mt-1">{concept.outline}</p>
                                  </div>
                                  <CopyButton
                                    text={`${concept.title}\n\nHook: "${concept.hook}"\n\nAngle: ${concept.angle}\n\n${concept.outline}`}
                                    copyKey={`concept-${i}`}
                                    copiedKey={copiedKey}
                                    copy={copy}
                                    size="xs"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Alternative Hooks */}
                      {recommendations.alternative_hooks?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Alternative Hooks</h4>
                          <div className="space-y-2">
                            {recommendations.alternative_hooks.map((h, i) => (
                              <div key={i} className="bg-zinc-800/50 border border-white/5 rounded-lg p-3 flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-zinc-200 font-medium">&ldquo;{h.hook}&rdquo;</p>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-xs capitalize">{h.style}</span>
                                    <span className="text-xs text-zinc-500">{h.why_it_works}</span>
                                  </div>
                                </div>
                                <CopyButton
                                  text={h.hook}
                                  copyKey={`hook-${i}`}
                                  copiedKey={copiedKey}
                                  copy={copy}
                                  size="xs"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Product Categories */}
                      {recommendations.product_categories?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Product Categories</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {recommendations.product_categories.map((cat, i) => (
                              <div key={i} className="bg-zinc-800/50 border border-white/5 rounded-lg p-3">
                                <p className="font-medium text-white text-sm">{cat.category}</p>
                                <p className="text-xs text-zinc-400 mt-1">{cat.reasoning}</p>
                                <p className="text-xs text-zinc-500 mt-1">e.g. {cat.example_product}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ================================================================ */}
            {/* AI Rewrite Section */}
            {/* ================================================================ */}
            <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
              <button
                onClick={() => setRewriteOpen(!rewriteOpen)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                    <Pen size={20} className="text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">AI Rewrite</h3>
                    <p className="text-sm text-zinc-400">Rewrite this script in a different voice and persona</p>
                  </div>
                </div>
                {rewriteOpen ? <ChevronUp size={20} className="text-zinc-400" /> : <ChevronDown size={20} className="text-zinc-400" />}
              </button>

              {rewriteOpen && (
                <div className="px-6 pb-6 space-y-4">
                  {isRateLimited ? (
                    <div className="text-center py-4 space-y-3">
                      <button
                        disabled
                        className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 text-zinc-500 font-semibold rounded-xl cursor-not-allowed"
                      >
                        <Lock size={16} />
                        Rewrite Script
                      </button>
                      <p className="text-sm text-zinc-500">
                        Upgrade for unlimited AI rewrites.{' '}
                        <span className="text-violet-400 font-medium">Use code TRANSCRIBE20</span>
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Dropdowns */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">Customer Archetype</label>
                          <select
                            value={selectedPersona}
                            onChange={(e) => setSelectedPersona(e.target.value)}
                            className="w-full h-11 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none appearance-none"
                          >
                            {CUSTOMER_ARCHETYPES.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">Voice & Tone</label>
                          <select
                            value={selectedTone}
                            onChange={(e) => setSelectedTone(e.target.value)}
                            className="w-full h-11 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none appearance-none"
                          >
                            {VOICE_TONES.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Custom persona input */}
                      {selectedPersona === 'custom' && (
                        <div>
                          <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">Describe Your Persona</label>
                          <textarea
                            value={customPersona}
                            onChange={(e) => setCustomPersona(e.target.value)}
                            placeholder="e.g. A health-conscious millennial mom who is skeptical of supplements but open to natural alternatives..."
                            rows={3}
                            className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm placeholder-zinc-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none"
                          />
                        </div>
                      )}

                      {/* Rewrite button */}
                      <div className="flex justify-center">
                        <button
                          onClick={handleRewrite}
                          disabled={rewriteLoading || (selectedPersona === 'custom' && !customPersona.trim())}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-400 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {rewriteLoading ? (
                            <>
                              <Loader2 size={18} className="animate-spin" />
                              Rewriting...
                            </>
                          ) : (
                            <>
                              <Pen size={18} />
                              {rewriteResult ? 'Regenerate' : 'Rewrite Script'}
                              <span className="text-xs text-violet-400/60 ml-1">(1 AI use)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}

                  {rewriteError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                      <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="text-red-300 text-sm">{rewriteError}</p>
                    </div>
                  )}

                  {/* Rewrite Result */}
                  {rewriteResult && (
                    <div className="space-y-4 pt-2">
                      {/* Persona + Tone badges */}
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400 text-xs font-medium">
                          {rewriteResult.persona_used}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium">
                          {rewriteResult.tone_used}
                        </span>
                      </div>

                      {/* Rewritten Hook */}
                      <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="text-xs text-violet-400 uppercase tracking-wide font-semibold">Hook</span>
                            <p className="text-white font-semibold mt-1 text-lg leading-snug">&ldquo;{rewriteResult.rewritten_hook}&rdquo;</p>
                          </div>
                          <CopyButton
                            text={rewriteResult.rewritten_hook}
                            copyKey="rewrite-hook"
                            copiedKey={copiedKey}
                            copy={copy}
                            size="xs"
                          />
                        </div>
                      </div>

                      {/* Full Script */}
                      <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Full Script</span>
                          <CopyButton
                            text={rewriteResult.rewritten_script}
                            copyKey="rewrite-script"
                            copiedKey={copiedKey}
                            copy={copy}
                            size="xs"
                          />
                        </div>
                        <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-sm">{rewriteResult.rewritten_script}</p>
                      </div>

                      {/* On-screen text */}
                      {rewriteResult.on_screen_text?.length > 0 && (
                        <div>
                          <span className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">On-Screen Text</span>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {rewriteResult.on_screen_text.map((text, i) => (
                              <button
                                key={i}
                                onClick={() => copy(text, `ost-${i}`)}
                                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm border border-white/5 transition-colors cursor-pointer"
                              >
                                {copiedKey === `ost-${i}` ? (
                                  <span className="text-green-400">Copied!</span>
                                ) : (
                                  text
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* CTA */}
                      {rewriteResult.cta && (
                        <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-3 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Call to Action</span>
                            <p className="text-zinc-200 mt-1 font-medium">{rewriteResult.cta}</p>
                          </div>
                          <CopyButton
                            text={rewriteResult.cta}
                            copyKey="rewrite-cta"
                            copiedKey={copiedKey}
                            copy={copy}
                            size="xs"
                          />
                        </div>
                      )}

                      {/* Tips */}
                      {rewriteResult.tips?.length > 0 && (
                        <div>
                          <span className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Delivery Tips</span>
                          <ul className="mt-2 space-y-1.5">
                            {rewriteResult.tips.map((tip, i) => (
                              <li key={i} className="flex items-start gap-2 text-zinc-400 text-sm">
                                <Sparkles size={12} className="text-violet-400 mt-1 shrink-0" />
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-3 pt-2">
                        <button
                          onClick={handleRewrite}
                          disabled={rewriteLoading}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={14} />
                          Regenerate
                        </button>
                        <CopyButton
                          text={`Hook: "${rewriteResult.rewritten_hook}"\n\n${rewriteResult.rewritten_script}\n\nCTA: ${rewriteResult.cta}\n\nOn-screen text:\n${rewriteResult.on_screen_text?.map((t, i) => `${i + 1}. ${t}`).join('\n') || 'None'}`}
                          copyKey="rewrite-all"
                          copiedKey={copiedKey}
                          copy={copy}
                          label="Copy All"
                        />
                        {isPortal && isLoggedIn && isPaid && (
                          <button
                            onClick={handleSaveToContentStudio}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-400 text-sm rounded-lg transition-colors"
                          >
                            <FileText size={14} />
                            Save to Content Studio
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons Section */}
            {winnerAdded ? (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center">
                <div className="flex items-center justify-center gap-2 text-green-400 mb-2">
                  <Check size={20} />
                  <span className="text-lg font-semibold">Added to Winners Bank</span>
                </div>
                <Link
                  href="/admin/winners"
                  className="text-green-400 hover:text-green-300 underline underline-offset-2 text-sm transition-colors"
                >
                  View in your Winners Bank &rarr;
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Portal action buttons */}
                {isPortal && isLoggedIn && (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={handleAddToWinners}
                      disabled={addingWinner}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingWinner ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Trophy size={18} />
                          Add to Winners Bank
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleGenerateScript}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-400 font-semibold rounded-xl transition-all"
                    >
                      <FileText size={18} />
                      Generate Script From This
                    </button>
                    {winnerError && (
                      <p className="text-red-400 text-sm w-full text-center">{winnerError}</p>
                    )}
                  </div>
                )}

                {/* Public page action buttons */}
                {!isPortal && (
                  <>
                    {isLoggedIn && (
                      <div className="text-center">
                        <button
                          onClick={handleAddToWinners}
                          disabled={addingWinner}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {addingWinner ? (
                            <>
                              <Loader2 size={18} className="animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Trophy size={18} />
                              Add to Winners Bank
                            </>
                          )}
                        </button>
                        {winnerError && (
                          <p className="text-red-400 text-sm mt-2">{winnerError}</p>
                        )}
                      </div>
                    )}

                    <div className="bg-gradient-to-r from-blue-500/10 to-violet-500/10 border border-blue-500/20 rounded-xl p-8 text-center">
                      <h3 className="text-xl font-bold text-white mb-2">
                        Want to write scripts like this?
                      </h3>
                      <p className="text-zinc-400 mb-6">
                        Generate your first AI-powered TikTok script in seconds. Free to start.
                      </p>
                      <Link
                        href="/signup"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white font-semibold rounded-xl transition-all"
                      >
                        Generate your first script free
                        <ArrowRight size={16} />
                      </Link>
                      {!isLoggedIn && (
                        <p className="mt-4 text-zinc-500 text-sm">
                          <Link href="/login" className="text-zinc-400 hover:text-zinc-300 underline underline-offset-2 transition-colors">
                            Sign in
                          </Link>
                          {' '}to save this to your Winners Bank
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* How it works — shown when no results, public only */}
      {!isPortal && !result && !loading && (
        <section className="relative py-16 sm:py-24">
          <div className="max-w-4xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-white text-center mb-12">How it works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  step: '1',
                  title: 'Paste the URL',
                  desc: 'Copy any public TikTok video link and paste it above.',
                  icon: Clipboard,
                },
                {
                  step: '2',
                  title: 'AI Transcribes',
                  desc: 'We extract the audio and use OpenAI Whisper for accurate transcription.',
                  icon: MessageSquareText,
                },
                {
                  step: '3',
                  title: 'Get Insights',
                  desc: 'AI analyzes the hook, structure, pacing, and emotional triggers.',
                  icon: Sparkles,
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="text-center p-6 rounded-xl bg-zinc-900/30 border border-white/5"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
                    <item.icon size={20} className="text-blue-400" />
                  </div>
                  <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-zinc-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Loading state overlay */}
      {loading && (
        <section className={`relative ${isPortal ? 'py-8' : 'py-16'}`}>
          <div className={`${isPortal ? 'max-w-md' : 'max-w-md mx-auto px-6'} text-center`}>
            <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-8">
              <Loader2 size={32} className="animate-spin text-blue-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Transcribing video...</h3>
              <p className="text-sm text-zinc-400">
                Downloading audio, running AI transcription, and analyzing content. This usually
                takes 10-30 seconds.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
