'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
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

// ============================================================================
// Page Component
// ============================================================================

export default function TranscribePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [addingWinner, setAddingWinner] = useState(false);
  const [winnerAdded, setWinnerAdded] = useState(false);
  const [winnerError, setWinnerError] = useState('');
  const [usageRemaining, setUsageRemaining] = useState<number | null>(null);
  const [usageLimit, setUsageLimit] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      setIsLoggedIn(!!data.user);
    });

    fetch('/api/transcribe/usage')
      .then((r) => r.json())
      .then((data) => {
        setUsageRemaining(data.remaining);
        setUsageLimit(data.limit);
        if (data.loggedIn) setIsLoggedIn(true);
      })
      .catch(() => {});
  }, []);

  async function handleTranscribe() {
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);
    setWinnerAdded(false);
    setWinnerError('');

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

      const rlRemaining = res.headers.get('X-RateLimit-Remaining');
      const rlLimit = res.headers.get('X-RateLimit-Limit');
      if (rlRemaining !== null) setUsageRemaining(parseInt(rlRemaining, 10));
      if (rlLimit !== null) setUsageLimit(parseInt(rlLimit, 10));

      setResult(data);

      // Scroll to results
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function copyTranscript() {
    if (!result) return;
    navigator.clipboard.writeText(result.transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
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

  return (
    <div className="relative">
      {/* Subtle grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      {/* Hero Section */}
      <section className="relative pt-16 pb-8 sm:pt-24 sm:pb-12">
        <div className="max-w-3xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
            <Zap size={14} />
            100% Free — No signup required
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
            Free TikTok Video{' '}
            <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
              Transcriber
            </span>
          </h1>

          <p className="text-lg text-zinc-400 mb-10 max-w-xl mx-auto">
            Paste any TikTok URL &mdash; get the full transcript, hook analysis, and content
            breakdown in seconds.
          </p>

          {/* Input Area */}
          <div className="max-w-2xl mx-auto">
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
          {usageRemaining !== null && usageLimit !== null && (
            <p className={`text-sm mt-4 ${usageRemaining === 0 ? 'text-red-400' : 'text-zinc-500'}`}>
              {usageRemaining} of {usageLimit} {isLoggedIn ? '' : 'free '}transcription{usageLimit === 1 ? '' : 's'} remaining today
              {!isLoggedIn && usageRemaining <= 3 && (
                <> &mdash; <Link href="/signup" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">sign up</Link> for {50} /day</>
              )}
            </p>
          )}

          {/* Social proof */}
          <p className="text-xs text-zinc-600 mt-4">
            Works with any public TikTok video. No watermarks, no downloads, no tracking.
          </p>
        </div>
      </section>

      {/* Results Section */}
      {result && (
        <section ref={resultRef} className="relative pb-16 sm:pb-24">
          <div className="max-w-4xl mx-auto px-6 space-y-6">
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
                <button
                  onClick={copyTranscript}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check size={14} className="text-green-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Clipboard size={14} />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{result.transcript}</p>
            </div>

            {/* Analysis Cards */}
            {result.analysis && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Hook Analysis */}
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                    <Target size={18} className="text-orange-400" />
                    Hook Analysis
                  </h3>
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
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                      <Zap size={18} className="text-yellow-400" />
                      Key Phrases
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {result.analysis.keyPhrases.map((phrase, i) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-sm border border-white/5"
                        >
                          {phrase}
                        </span>
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
            )}

            {/* Winners Bank + CTA */}
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
              </div>
            )}
          </div>
        </section>
      )}

      {/* How it works — shown when no results */}
      {!result && !loading && (
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
        <section className="relative py-16">
          <div className="max-w-md mx-auto px-6 text-center">
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
