'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Zap,
  Copy,
  Check,
  Play,
  Sparkles,
  Eye,
  Film,
  FileText,
  ArrowRight,
  Package,
  RefreshCw,
  ExternalLink,
  Share2,
  Clock,
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { events } from '@/lib/tracking';

// ── Types ──

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

interface TranscribeAnalysis {
  hook: HookAnalysis;
  content: ContentBreakdown;
  keyPhrases: string[];
  emotionalTriggers: string[];
  whatWorks: string[];
  targetEmotion: string;
}

interface VibeData {
  delivery_style?: string;
  pacing_style?: string;
  hook_energy?: string;
  visual_style?: string;
  visual_rhythm?: string;
  cta_tone?: string;
  reveal_timing?: string;
  recreate_guidance?: string[];
  timing_arc?: {
    hook_ends_at: number;
    explanation_ends_at: number;
    proof_reveal_at: number;
    cta_starts_at: number;
  };
}

interface RemixScript {
  hook: string;
  setup: string;
  body: string;
  cta: string;
  full_script: string;
  on_screen_text: string[];
  filming_notes: string;
  estimated_length: string;
  remix_notes: string;
}

interface PackHook {
  visual_hook: string;
  text_on_screen: string;
  verbal_hook: string;
  why_this_works: string;
  category: string;
}

interface PackVisualHook {
  action: string;
  shot_type: string;
  setup: string;
  pairs_with?: string;
  energy: string;
  why_it_works: string;
  strength?: number;
}

interface RemixResult {
  script: RemixScript | null;
  hooks: PackHook[];
  visual_hooks: PackVisualHook[];
  why_it_works: string[];
  status: {
    script: 'ok' | 'failed';
    hooks: 'ok' | 'failed';
    visual_hooks: 'ok' | 'failed';
  };
}

interface RemixHistoryItem {
  id: string;
  source_url: string;
  platform: string;
  original_hook: string;
  created_at: string;
}

// ── Helpers ──

function detectPlatform(url: string): 'tiktok' | 'youtube' | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      host.includes('tiktok.com') ||
      host === 'vm.tiktok.com' ||
      host === 'vt.tiktok.com'
    )
      return 'tiktok';
    if (
      host.includes('youtube.com') ||
      host === 'youtu.be' ||
      host.includes('youtube-nocookie.com')
    )
      return 'youtube';
    return null;
  } catch {
    return null;
  }
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
      {label || (copied ? 'Copied' : 'Copy')}
    </button>
  );
}

// ── Progress Steps ──

type Step = 'idle' | 'transcribing' | 'analyzing' | 'generating' | 'done';

const STEP_LABELS: Record<Step, string> = {
  idle: '',
  transcribing: 'Transcribing video...',
  analyzing: 'Analyzing style and structure...',
  generating: 'Generating your remix...',
  done: 'Remix ready!',
};

// ── Cookie-based anonymous usage tracking ──

function getAnonRemixCount(): number {
  if (typeof document === 'undefined') return 0;
  const match = document.cookie.match(/ff_remix_count=(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function incrementAnonRemixCount() {
  if (typeof document === 'undefined') return;
  const newCount = getAnonRemixCount() + 1;
  const expires = new Date();
  expires.setHours(23, 59, 59, 999);
  document.cookie = `ff_remix_count=${newCount};path=/;expires=${expires.toUTCString()};samesite=lax`;
}

// ── Main Component ──

export default function RemixPage() {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Transcribe result
  const [analysis, setAnalysis] = useState<TranscribeAnalysis | null>(null);
  const [transcript, setTranscript] = useState('');
  const [duration, setDuration] = useState(0);
  const [platform, setPlatform] = useState<'tiktok' | 'youtube'>('tiktok');
  const [vibe, setVibe] = useState<VibeData | null>(null);

  // Remix result
  const [remixResult, setRemixResult] = useState<RemixResult | null>(null);
  const [remixSessionId, setRemixSessionId] = useState<string | null>(null);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);

  // History
  const [history, setHistory] = useState<RemixHistoryItem[]>([]);

  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      const loggedIn = !!data.user;
      setIsLoggedIn(loggedIn);
      setAuthChecked(true);
      if (loggedIn) {
        fetch('/api/remix/history')
          .then(r => r.ok ? r.json() : null)
          .then(json => { if (json?.data) setHistory(json.data); })
          .catch(() => {});
      }
    });
  }, []);

  // Check if anonymous user has already used their free remix
  const anonLimitReached = !isLoggedIn && authChecked && getAnonRemixCount() >= 1;

  async function handleRemix() {
    if (!url.trim()) return;

    const detected = detectPlatform(url.trim());
    if (!detected) {
      setError('Please paste a valid TikTok or YouTube URL.');
      return;
    }

    if (anonLimitReached) {
      setShowSignupPrompt(true);
      return;
    }

    setError('');
    setStep('transcribing');
    setPlatform(detected);
    setRemixResult(null);
    setAnalysis(null);
    setShowSignupPrompt(false);

    try {
      // Step 1: Transcribe
      const transcribeEndpoint =
        detected === 'youtube' ? '/api/youtube-transcribe' : '/api/transcribe';

      const transcribeRes = await fetch(transcribeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!transcribeRes.ok) {
        const errData = await transcribeRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to transcribe video.');
      }

      const transcribeData = await transcribeRes.json();
      const transcriptText: string = transcribeData.transcript || '';
      const analysisData: TranscribeAnalysis | null = transcribeData.analysis || null;
      const durationSec: number = transcribeData.duration || 0;
      const segments = transcribeData.segments || [];

      if (!transcriptText || !analysisData) {
        throw new Error('Could not analyze this video. Try a different link.');
      }

      setTranscript(transcriptText);
      setAnalysis(analysisData);
      setDuration(durationSec);

      // Step 2: Vibe analysis (non-fatal)
      setStep('analyzing');
      let vibeData: VibeData | null = null;
      try {
        const vibeRes = await fetch('/api/transcribe/vibe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: transcriptText, segments, duration: durationSec }),
        });
        if (vibeRes.ok) {
          const vibeJson = await vibeRes.json();
          vibeData = vibeJson.vibe || vibeJson;
        }
      } catch {
        // Non-fatal
      }
      setVibe(vibeData);

      // Step 3: Generate remix
      setStep('generating');

      const remixContext = {
        source_url: url.trim(),
        platform: detected,
        transcript: transcriptText,
        duration: durationSec,
        original_hook: analysisData.hook,
        content: analysisData.content,
        key_phrases: analysisData.keyPhrases || [],
        emotional_triggers: analysisData.emotionalTriggers || [],
        what_works: analysisData.whatWorks || [],
        target_emotion: analysisData.targetEmotion || '',
        vibe: vibeData?.delivery_style ? vibeData : undefined,
      };

      const remixRes = await fetch('/api/remix/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remix_context: remixContext }),
      });

      if (!remixRes.ok) {
        throw new Error('Failed to generate remix. Please try again.');
      }

      const remixJson = await remixRes.json();
      setRemixResult(remixJson.data);
      setRemixSessionId(remixJson.remix_session_id || null);
      setStep('done');

      // Track remix_created client-side
      events.remixCreated({
        remixSessionId: remixJson.remix_session_id || undefined,
        platform: detectPlatform(url) || 'unknown',
        sourceUrl: url,
      });

      // Track anonymous usage + set attribution cookie
      if (!isLoggedIn) {
        incrementAnonRemixCount();
        setShowSignupPrompt(true);
        // Set remix attribution cookie so signup flow can attribute the conversion
        if (remixJson.remix_session_id) {
          document.cookie = `ff_remix_id=${remixJson.remix_session_id}; path=/; max-age=86400; SameSite=Lax`;
        }
      }

      // Scroll to results
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStep('idle');
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Hero Section */}
      <section className="relative pt-16 pb-8 sm:pt-24 sm:pb-12">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm mb-6">
            <Sparkles size={14} />
            Turn any viral video into your version
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
            Remix Any Viral Video
          </h1>
          <p className="text-lg text-zinc-400 mb-10 max-w-xl mx-auto">
            Paste a TikTok or YouTube link. We&apos;ll break down why it works and generate a
            creator-ready version you can film today.
          </p>

          {/* Input */}
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && step === 'idle' && handleRemix()}
                placeholder="Paste TikTok or YouTube link..."
                className="flex-1 h-14 px-5 bg-zinc-900 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none text-base"
                disabled={step !== 'idle' && step !== 'done'}
              />
              <button
                onClick={handleRemix}
                disabled={(step !== 'idle' && step !== 'done') || !url.trim()}
                className="h-14 px-8 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[180px]"
              >
                {step !== 'idle' && step !== 'done' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Working...
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    Remix This Video
                  </>
                )}
              </button>
            </div>

            {error && (
              <p className="text-red-400 text-sm mt-3">{error}</p>
            )}

            {/* Progress indicator */}
            {step !== 'idle' && step !== 'done' && (
              <div className="mt-6 p-4 bg-zinc-900/50 border border-white/5 rounded-xl">
                <div className="flex items-center gap-3">
                  <Loader2 size={20} className="animate-spin text-violet-400" />
                  <span className="text-zinc-300">{STEP_LABELS[step]}</span>
                </div>
                <div className="flex gap-1 mt-3">
                  {(['transcribing', 'analyzing', 'generating'] as const).map((s) => (
                    <div
                      key={s}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        step === s
                          ? 'bg-violet-500 animate-pulse'
                          : (['transcribing', 'analyzing', 'generating'].indexOf(step) >
                              ['transcribing', 'analyzing', 'generating'].indexOf(s))
                            ? 'bg-violet-500'
                            : 'bg-zinc-800'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Results Section */}
      {remixResult && analysis && (
        <section ref={resultRef} className="pb-16 sm:pb-24">
          <div className="max-w-4xl mx-auto px-6 space-y-8">

            {/* Hook Comparison Card */}
            {remixResult.script && (
              <div className="bg-zinc-900/50 border border-violet-500/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Hook Comparison</h2>
                  {remixSessionId && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/remix/result/${remixSessionId}`);
                        events.remixShared(remixSessionId!);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                    >
                      <Share2 size={14} />
                      Share
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">Original Hook</span>
                    <p className="text-zinc-300 mt-2">&ldquo;{analysis.hook.line}&rdquo;</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-zinc-500">{analysis.hook.style}</span>
                      <span className="text-xs text-zinc-500">{analysis.hook.strength}/10</span>
                    </div>
                  </div>
                  <div className="md:border-l md:border-white/5 md:pl-6">
                    <span className="text-xs text-violet-400 uppercase tracking-wider font-medium">Your Hook</span>
                    <p className="text-white font-medium mt-2">&ldquo;{remixResult.script.hook}&rdquo;</p>
                  </div>
                </div>
                {remixResult.script.remix_notes && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <span className="text-xs text-zinc-500">How the remix changes the structure</span>
                    <p className="text-zinc-400 text-sm mt-1 italic">{remixResult.script.remix_notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Original Video */}
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Play size={18} className="text-violet-400" />
                <h2 className="text-lg font-semibold text-white">Original Video</h2>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-xs text-zinc-500">Format</span>
                    <p className="text-sm text-zinc-300">{analysis.content.format}</p>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500">Pacing</span>
                    <p className="text-sm text-zinc-300">{analysis.content.pacing}</p>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500">Structure</span>
                    <p className="text-sm text-zinc-300">{analysis.content.structure}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  {duration > 0 && <span className="text-xs text-zinc-400">{Math.round(duration)}s</span>}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300"
                  >
                    <ExternalLink size={14} />
                    Watch original
                  </a>
                </div>
              </div>
            </div>

            {/* Why It Works */}
            {remixResult.why_it_works.length > 0 && (
              <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Eye size={18} className="text-amber-400" />
                  <h2 className="text-lg font-semibold text-white">Why It Works</h2>
                </div>
                <ul className="space-y-2">
                  {remixResult.why_it_works.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Zap size={14} className="text-amber-400 mt-0.5 shrink-0" />
                      <span className="text-zinc-300 text-sm">{reason}</span>
                    </li>
                  ))}
                </ul>
                {analysis.emotionalTriggers.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <span className="text-xs text-zinc-500">Emotional triggers: </span>
                    <span className="text-xs text-zinc-400">{analysis.emotionalTriggers.join(', ')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Your Version (Remix Script) */}
            {remixResult.script && (
              <div className="bg-zinc-900/50 border border-violet-500/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-violet-400" />
                    <h2 className="text-lg font-semibold text-white">Your Version</h2>
                  </div>
                  <div className="flex gap-2">
                    <CopyButton text={remixResult.script.full_script} label="Copy Script" />
                    {isLoggedIn && (
                      <Link
                        href={`/admin/content-studio?topic=${encodeURIComponent(analysis.content.format)}&hook=${encodeURIComponent(remixResult.script.hook)}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
                      >
                        <ArrowRight size={14} />
                        Open in Studio
                      </Link>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {remixResult.script.setup && (
                    <div>
                      <span className="text-xs text-zinc-500 uppercase tracking-wider">Setup</span>
                      <p className="text-zinc-300 text-sm mt-1">{remixResult.script.setup}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">Body</span>
                    <p className="text-zinc-300 text-sm mt-1">{remixResult.script.body}</p>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">CTA</span>
                    <p className="text-zinc-300 text-sm mt-1">{remixResult.script.cta}</p>
                  </div>

                  {remixResult.script.on_screen_text.length > 0 && (
                    <div className="pt-2 border-t border-white/5">
                      <span className="text-xs text-zinc-500 uppercase tracking-wider">On-Screen Text</span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {remixResult.script.on_screen_text.map((t, i) => (
                          <span key={i} className="px-2 py-1 text-xs bg-zinc-800 text-zinc-300 rounded">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {remixResult.script.filming_notes && (
                    <div className="pt-2 border-t border-white/5">
                      <span className="text-xs text-zinc-500 uppercase tracking-wider">Filming Notes</span>
                      <p className="text-zinc-400 text-sm mt-1">{remixResult.script.filming_notes}</p>
                    </div>
                  )}

                  {remixResult.script.estimated_length && (
                    <span className="text-xs text-zinc-600">Est. {remixResult.script.estimated_length}</span>
                  )}
                </div>
              </div>
            )}

            {/* Hooks You Can Try */}
            {remixResult.hooks.length > 0 && (
              <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Zap size={18} className="text-teal-400" />
                  <h2 className="text-lg font-semibold text-white">Hooks You Can Try</h2>
                </div>
                <div className="space-y-4">
                  {remixResult.hooks.map((hook, i) => (
                    <div key={i} className="p-4 bg-zinc-800/50 rounded-lg">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <div>
                            <span className="text-xs text-teal-400 font-medium">Verbal Hook</span>
                            <p className="text-white text-sm mt-0.5">&ldquo;{hook.verbal_hook}&rdquo;</p>
                          </div>
                          <div>
                            <span className="text-xs text-zinc-500">Visual</span>
                            <p className="text-zinc-400 text-sm mt-0.5">{hook.visual_hook}</p>
                          </div>
                          <div>
                            <span className="text-xs text-zinc-500">Text on Screen</span>
                            <p className="text-zinc-400 text-sm mt-0.5">{hook.text_on_screen}</p>
                          </div>
                          {hook.why_this_works && (
                            <p className="text-xs text-zinc-500 italic mt-1">{hook.why_this_works}</p>
                          )}
                        </div>
                        <CopyButton text={hook.verbal_hook} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Visual Ideas */}
            {remixResult.visual_hooks.length > 0 && (
              <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Film size={18} className="text-fuchsia-400" />
                  <h2 className="text-lg font-semibold text-white">Visual Ideas</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {remixResult.visual_hooks.map((vh, i) => (
                    <div key={i} className="p-4 bg-zinc-800/50 rounded-lg space-y-2">
                      <p className="text-white text-sm font-medium">{vh.action}</p>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>{vh.shot_type}</span>
                        <span>&middot;</span>
                        <span>{vh.energy}</span>
                      </div>
                      {vh.setup && <p className="text-zinc-400 text-xs">Setup: {vh.setup}</p>}
                      {vh.why_it_works && <p className="text-zinc-500 text-xs italic">{vh.why_it_works}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Build Full Content Pack CTA */}
            {isLoggedIn && (
              <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Package size={18} className="text-violet-400" />
                  <h2 className="text-lg font-semibold text-white">Want the Full Package?</h2>
                </div>
                <p className="text-zinc-400 text-sm mb-4">
                  Generate a complete Content Pack with more hooks, a full production script, and visual direction.
                </p>
                <Link
                  href={`/admin/content-packs?topic=${encodeURIComponent(analysis.content.format + ' — ' + (analysis.keyPhrases?.[0] || ''))}&seed_hook=${encodeURIComponent(remixResult.script?.hook || analysis.hook.line)}&source=remix`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white font-semibold rounded-xl transition-all"
                >
                  <Package size={16} />
                  Build Content Pack
                </Link>
              </div>
            )}

            {/* Signup Prompt (anonymous users) */}
            {showSignupPrompt && !isLoggedIn && (
              <div className="bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 rounded-xl p-6 text-center">
                <h3 className="text-lg font-semibold text-white mb-2">
                  Save this remix and generate more versions
                </h3>
                <p className="text-zinc-400 text-sm mb-4">
                  Create a free account to save your remixes, build content packs, and get unlimited access.
                </p>
                <Link
                  href="/login?mode=signup&from=remix"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white font-semibold rounded-xl transition-all"
                >
                  Create Free Account
                  <ArrowRight size={16} />
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Recent Remixes (logged-in users) */}
      {isLoggedIn && history.length > 0 && step === 'idle' && !remixResult && (
        <section className="pb-8">
          <div className="max-w-4xl mx-auto px-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-zinc-400" />
              <h2 className="text-lg font-semibold text-white">Recent Remixes</h2>
            </div>
            <div className="space-y-3">
              {history.map((item) => (
                <Link
                  key={item.id}
                  href={`/remix/result/${item.id}`}
                  className="block p-4 bg-zinc-900/50 border border-white/5 rounded-xl hover:border-violet-500/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">&ldquo;{item.original_hook}&rdquo;</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-zinc-500 capitalize">{item.platform}</span>
                        <span className="text-xs text-zinc-600">&middot;</span>
                        <span className="text-xs text-zinc-500">{new Date(item.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-zinc-500 shrink-0 mt-1" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SEO Content — shown when no results */}
      {!remixResult && step === 'idle' && (
        <section className="pb-16 sm:pb-24">
          <div className="max-w-4xl mx-auto px-6">
            {/* How It Works */}
            <h2 className="text-2xl font-bold text-white text-center mb-8">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
              <div className="p-5 bg-zinc-900/50 border border-white/5 rounded-xl">
                <div className="text-3xl font-bold text-violet-500 mb-2">1</div>
                <h3 className="text-lg font-semibold text-white mb-2">Paste a Link</h3>
                <p className="text-zinc-400 text-sm">
                  Drop any TikTok or YouTube Shorts URL. We&apos;ll download and analyze the video automatically.
                </p>
              </div>
              <div className="p-5 bg-zinc-900/50 border border-white/5 rounded-xl">
                <div className="text-3xl font-bold text-violet-500 mb-2">2</div>
                <h3 className="text-lg font-semibold text-white mb-2">We Break It Down</h3>
                <p className="text-zinc-400 text-sm">
                  Hook analysis, structure mapping, vibe detection, and emotional trigger identification — all in seconds.
                </p>
              </div>
              <div className="p-5 bg-zinc-900/50 border border-white/5 rounded-xl">
                <div className="text-3xl font-bold text-violet-500 mb-2">3</div>
                <h3 className="text-lg font-semibold text-white mb-2">Get Your Version</h3>
                <p className="text-zinc-400 text-sm">
                  A complete remix script, alternative hooks, and visual ideas — ready to film as your own content.
                </p>
              </div>
            </div>

            {/* SEO FAQ */}
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold text-white text-center mb-8">Frequently Asked Questions</h2>
              <div className="space-y-4">
                <details className="group bg-zinc-900/50 border border-white/5 rounded-xl">
                  <summary className="p-4 cursor-pointer text-white font-medium flex items-center justify-between">
                    How do I remake a viral TikTok video?
                    <ArrowRight size={16} className="text-zinc-500 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="px-4 pb-4 text-zinc-400 text-sm">
                    Paste the TikTok link into FlashFlow&apos;s Remix tool. We&apos;ll analyze the hook, structure, pacing, and emotional triggers, then generate a completely new script that uses the same psychological patterns but with original wording. You keep the structure that works — just make it yours.
                  </div>
                </details>
                <details className="group bg-zinc-900/50 border border-white/5 rounded-xl">
                  <summary className="p-4 cursor-pointer text-white font-medium flex items-center justify-between">
                    Can I recreate a YouTube Short as a TikTok?
                    <ArrowRight size={16} className="text-zinc-500 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="px-4 pb-4 text-zinc-400 text-sm">
                    Yes. Paste any YouTube Shorts URL and we&apos;ll break it down the same way. The remix script adapts the format for TikTok-native delivery while keeping what made the original work.
                  </div>
                </details>
                <details className="group bg-zinc-900/50 border border-white/5 rounded-xl">
                  <summary className="p-4 cursor-pointer text-white font-medium flex items-center justify-between">
                    Is this free?
                    <ArrowRight size={16} className="text-zinc-500 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="px-4 pb-4 text-zinc-400 text-sm">
                    You get one free remix without signing up. Create a free account for unlimited remixes, content packs, and the full FlashFlow toolkit.
                  </div>
                </details>
                <details className="group bg-zinc-900/50 border border-white/5 rounded-xl">
                  <summary className="p-4 cursor-pointer text-white font-medium flex items-center justify-between">
                    What&apos;s a video breakdown?
                    <ArrowRight size={16} className="text-zinc-500 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="px-4 pb-4 text-zinc-400 text-sm">
                    A video breakdown analyzes a short-form video to identify its hook type, content structure, pacing rhythm, emotional triggers, and key phrases. FlashFlow uses this analysis to understand why a video performs well and generate content that uses the same winning patterns.
                  </div>
                </details>
                <details className="group bg-zinc-900/50 border border-white/5 rounded-xl">
                  <summary className="p-4 cursor-pointer text-white font-medium flex items-center justify-between">
                    Will my version copy the original?
                    <ArrowRight size={16} className="text-zinc-500 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="px-4 pb-4 text-zinc-400 text-sm">
                    No. The remix keeps the structure and psychological triggers but rewrites everything in fresh language. No phrases are copied. The script is designed to feel like your own content, not a duplicate.
                  </div>
                </details>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
