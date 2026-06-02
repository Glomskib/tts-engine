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
  Bookmark,
  Languages,
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import VibeAnalysisCard from './VibeAnalysisCard';
import WhileYouWait from './WhileYouWait';

// ============================================================================
// Types
// ============================================================================

interface HookAnalysis {
  line: string;
  style: string;
  strength: number;
  /** NEW (2026-05-08): why this hook works for this audience */
  why_strong?: string;
  /** NEW: 3-5 alternate hook phrasings the user can A/B test */
  alternatives?: string[];
}

interface IntentAnalysis {
  primary: string;
  explanation: string;
}

interface ContentBreakdown {
  format: string;
  pacing: string;
  structure: string;
  /** NEW: how the structure plays out across the video */
  structure_explained?: string;
}

/**
 * NEW shape (2026-05-08): keyPhrases is now an array of objects with WHY each
 * phrase works, not just bare strings. UI handles both shapes for backward
 * compat with older analysis records.
 */
type KeyPhrase = string | { phrase: string; why_it_works: string };

interface TranscribeResult {
  transcript: string;
  duration: number;
  language: string;
  segments: { start: number; end: number; text: string }[];
  analysis: {
    hook: HookAnalysis;
    intent?: IntentAnalysis;
    content: ContentBreakdown;
    keyPhrases: KeyPhrase[];
    viralPotential?: string[];
    emotionalTriggers: string[];
    whatWorks: string[];
    targetEmotion: string;
  } | null;
}

/**
 * Key phrase normalizer — accepts both old string[] and new {phrase, why_it_works}[].
 */
function normalizeKeyPhrase(p: KeyPhrase): { phrase: string; why_it_works?: string } {
  if (typeof p === 'string') return { phrase: p };
  return { phrase: p.phrase, why_it_works: p.why_it_works };
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

interface TranslateResult {
  translated_text: string;
  source_language: string;
  target_language: string;
  notes?: string;
}

export interface TranscriberCoreProps {
  isPortal: boolean;
  isLoggedIn: boolean;
  planId?: string | null;
  /** 'auto' detects the platform from the URL the user pastes (TikTok / YouTube / etc.) */
  platform?: 'tiktok' | 'youtube' | 'auto';
}

// Auto-detect platform from any pasted URL.
// Lets users paste anything from any field — backend dispatches correctly.
export function detectPlatform(url: string): 'youtube' | 'tiktok' | 'unknown' {
  if (!url) return 'unknown';
  const u = url.toLowerCase().trim();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com') || u.includes('vm.tiktok.com')) return 'tiktok';
  // Future: instagram.com/reel, twitch.tv, vimeo, dailymotion, podcasts (RSS)
  return 'unknown';
}

// ============================================================================
// Platform Config
// ============================================================================

interface PlatformConfig {
  apiEndpoint: string;
  name: string;
  placeholder: string;
  heroTitle: string;
  heroDescription: string;
  socialProof: string;
  howItWorksStep1: string;
  productSearchUrl: (query: string) => string;
  productSearchLabel: string;
}

const PLATFORM_CONFIG: Record<string, PlatformConfig> = {
  tiktok: {
    apiEndpoint: '/api/transcribe',
    name: 'TikTok',
    placeholder: 'https://www.tiktok.com/@user/video/...',
    heroTitle: 'Free TikTok Video',
    heroDescription: 'Paste any TikTok URL — break down why it works, analyze the hook, and build your own version.',
    socialProof: 'Works with any public TikTok video. No watermarks, no downloads, no tracking.',
    howItWorksStep1: 'Copy any public TikTok video link and paste it above.',
    productSearchUrl: (q: string) => `https://www.tiktok.com/shop/search?q=${encodeURIComponent(q)}`,
    productSearchLabel: 'Find Products',
  },
  youtube: {
    apiEndpoint: '/api/youtube-transcribe',
    name: 'YouTube',
    placeholder: 'https://www.youtube.com/watch?v=...',
    heroTitle: 'Free YouTube',
    heroDescription: 'Paste any YouTube link. Get a clean transcript in seconds — copy it and use it anywhere. Bonus: AI breakdown of the hook and structure, free.',
    socialProof: 'Works with any public YouTube video. Captions extracted instantly, with AI transcription fallback for accuracy.',
    howItWorksStep1: 'Copy any public YouTube video link and paste it above.',
    productSearchUrl: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    productSearchLabel: 'Search Products',
  },
  auto: {
    apiEndpoint: '/api/youtube-transcribe', // overridden at runtime based on detected platform
    name: 'Any video',
    placeholder: 'Paste any TikTok or YouTube URL — we figure out the rest...',
    heroTitle: 'Free Video',
    heroDescription: 'Paste any TikTok or YouTube link. We auto-detect the platform, extract the transcript, analyze the hook, and show you why it works.',
    socialProof: 'Works with TikTok, YouTube, YouTube Shorts, and youtu.be links. No signup, no watermarks, no tracking.',
    howItWorksStep1: 'Paste any video link from TikTok or YouTube.',
    productSearchUrl: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    productSearchLabel: 'Search Products',
  },
};

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

const TARGET_LANGUAGES = [
  { id: 'english', name: 'English' },
  { id: 'spanish', name: 'Spanish' },
  { id: 'french', name: 'French' },
  { id: 'portuguese', name: 'Portuguese' },
  { id: 'german', name: 'German' },
  { id: 'italian', name: 'Italian' },
  { id: 'dutch', name: 'Dutch' },
  { id: 'japanese', name: 'Japanese' },
  { id: 'korean', name: 'Korean' },
  { id: 'chinese', name: 'Chinese (Simplified)' },
  { id: 'arabic', name: 'Arabic' },
  { id: 'hindi', name: 'Hindi' },
  { id: 'russian', name: 'Russian' },
  { id: 'turkish', name: 'Turkish' },
  { id: 'vietnamese', name: 'Vietnamese' },
  { id: 'thai', name: 'Thai' },
  { id: 'custom', name: 'Custom...' },
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

export default function TranscriberCore({ isPortal, isLoggedIn: initialLoggedIn, planId, platform = 'tiktok' }: TranscriberCoreProps) {
  const config = PLATFORM_CONFIG[platform];
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [error, setError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(initialLoggedIn);
  const [addingWinner, setAddingWinner] = useState(false);
  const [winnerAdded, setWinnerAdded] = useState(false);
  const [winnerError, setWinnerError] = useState('');
  const [savingHook, setSavingHook] = useState(false);
  const [hookSaved, setHookSaved] = useState(false);
  const [hookSaveError, setHookSaveError] = useState('');
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

  // Translation state
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateResult, setTranslateResult] = useState<TranslateResult | null>(null);
  const [translateError, setTranslateError] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('spanish');
  const [customLanguage, setCustomLanguage] = useState('');

  // Save to Content Studio state
  const [savingToStudio, setSavingToStudio] = useState(false);
  const [savedConceptId, setSavedConceptId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  // Variation state
  const [variationLoading, setVariationLoading] = useState(false);
  const [variationError, setVariationError] = useState('');

  // GAP 2: Track saved alternative hooks
  const [savedHookIndexes, setSavedHookIndexes] = useState<Set<number>>(new Set());
  const [savingHookIndex, setSavingHookIndex] = useState<number | null>(null);

  // Track concepts saved to ideas
  const [savedIdeaIndexes, setSavedIdeaIndexes] = useState<Set<number>>(new Set());
  const [confirmingIdeaIndex, setConfirmingIdeaIndex] = useState<number | null>(null);

  // GAP 7: Rate limit state
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number>(-1);
  const [rateLimitTotal, setRateLimitTotal] = useState<number>(-1);

  // Lead-magnet popup state — fires after first successful transcript for logged-out users
  const [leadMagnetOpen, setLeadMagnetOpen] = useState(false);
  const [leadMagnetDismissed, setLeadMagnetDismissed] = useState(false);
  const [leadMagnetEmail, setLeadMagnetEmail] = useState('');
  const [leadMagnetSubmitting, setLeadMagnetSubmitting] = useState(false);
  const [leadMagnetSuccess, setLeadMagnetSuccess] = useState(false);
  const [leadMagnetError, setLeadMagnetError] = useState('');

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

  // Trigger lead-magnet popup 6 seconds after first successful transcript for logged-out users.
  // Doesn't re-fire if user dismissed it once or if they sign up.
  useEffect(() => {
    if (!result || isLoggedIn || leadMagnetDismissed || leadMagnetOpen) return;
    const t = setTimeout(() => setLeadMagnetOpen(true), 6000);
    return () => clearTimeout(t);
  }, [result, isLoggedIn, leadMagnetDismissed, leadMagnetOpen]);

  async function handleLeadMagnetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadMagnetEmail.trim() || leadMagnetSubmitting) return;
    setLeadMagnetSubmitting(true);
    setLeadMagnetError('');
    try {
      const res = await fetch('/api/lead-magnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: leadMagnetEmail.trim(),
          name: leadMagnetEmail.trim().split('@')[0],
        }),
      });
      // 404 is acceptable (route not yet deployed); 429 = rate-limited; others surface.
      if (!res.ok && res.status !== 404 && res.status !== 429) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || j?.error || 'Could not save email');
      }
      setLeadMagnetSuccess(true);
      // Send to signup with email pre-filled after 1.5s
      setTimeout(() => {
        const signupUrl = `/login?mode=signup&email=${encodeURIComponent(leadMagnetEmail.trim())}&from=transcriber-popup`;
        window.location.href = signupUrl;
      }, 1500);
    } catch (err) {
      setLeadMagnetError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLeadMagnetSubmitting(false);
    }
  }

  function updateRateLimits(res: Response) {
    const rlRemaining = res.headers.get('X-RateLimit-Remaining');
    const rlLimit = res.headers.get('X-RateLimit-Limit');
    if (rlRemaining !== null) {
      const remaining = parseInt(rlRemaining, 10);
      setUsageRemaining(remaining);
      // GAP 7: Update rate limit state
      if (remaining >= 0) setRateLimitRemaining(remaining);
    }
    if (rlLimit !== null) {
      const limit = parseInt(rlLimit, 10);
      setUsageLimit(limit);
      // GAP 7: Update rate limit total
      if (limit > 0) setRateLimitTotal(limit);
    }
  }

  async function handleTranscribe() {
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);
    setWinnerAdded(false);
    setWinnerError('');
    setHookSaved(false);
    setHookSaveError('');
    setRecommendations(null);
    setRewriteResult(null);
    setTranslateResult(null);
    setRecsOpen(false);
    setRewriteOpen(false);
    setTranslateOpen(false);
    setSavedConceptId(null);
    setSaveError('');

    try {
      // When platform is 'auto', dispatch to the right API based on the URL.
      // Lets a single field accept anything — TikTok, YouTube, youtu.be, Shorts.
      let endpoint = config.apiEndpoint;
      if (platform === 'auto') {
        const detected = detectPlatform(url);
        if (detected === 'youtube') endpoint = '/api/youtube-transcribe';
        else if (detected === 'tiktok') endpoint = '/api/transcribe';
        else {
          setError("That doesn't look like a TikTok or YouTube URL. Paste a full link starting with https://");
          setLoading(false);
          return;
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        // GAP 7: Handle 429 rate limit response
        if (res.status === 429) {
          setError(data.error || 'Rate limit reached');
          setUsageRemaining(0);
          setRateLimitRemaining(0);
          return;
        }
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      updateRateLimits(res);
      setResult(data);

      // Dispatch event for workspace panels to pick up transcript context
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('transcriber:result', {
          detail: {
            transcript: data.transcript,
            analysis: data.analysis,
            sourceUrl: url.trim(),
          },
        }));
      }

      // Smart default: if transcript is not English, default translate target to English
      if (data.language && data.language !== 'en') {
        setSelectedLanguage('english');
      } else {
        setSelectedLanguage('spanish');
      }

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
      a.hook.why_strong ? `Why hook works: ${a.hook.why_strong}` : '',
      a.hook.alternatives?.length ? `Alt hooks:\n${a.hook.alternatives.map((x) => `  - ${x}`).join('\n')}` : '',
      a.intent ? `Intent: ${a.intent.primary} — ${a.intent.explanation}` : '',
      `Format: ${a.content.format}`,
      `Pacing: ${a.content.pacing}`,
      `Structure: ${a.content.structure}`,
      a.content.structure_explained ? `Structure detail: ${a.content.structure_explained}` : '',
      `Key Phrases:\n${a.keyPhrases.map((p) => {
        const n = normalizeKeyPhrase(p);
        return `  - ${n.phrase}${n.why_it_works ? ` — ${n.why_it_works}` : ''}`;
      }).join('\n')}`,
      a.viralPotential?.length ? `Viral mechanics:\n${a.viralPotential.map((x) => `  - ${x}`).join('\n')}` : '',
      `What Works:\n${a.whatWorks.map((x) => `  - ${x}`).join('\n')}`,
      `Emotional Triggers: ${a.emotionalTriggers.join(', ')}`,
      `Target Emotion: ${a.targetEmotion}`,
    ].filter(Boolean).join('\n');
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

  async function handleSaveHook() {
    if (!result?.analysis?.hook.line) return;
    setSavingHook(true);
    setHookSaveError('');

    try {
      const res = await fetch('/api/winners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'generated',
          winner_type: 'hook',
          hook: result.analysis.hook.line,
          content_format: result.analysis.content.format,
        }),
      });

      if (res.status === 401) {
        setHookSaveError('Sign in to save hooks');
        setIsLoggedIn(false);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setHookSaveError(data.error || 'Failed to save hook');
        return;
      }

      setHookSaved(true);
    } catch {
      setHookSaveError('Network error. Please try again.');
    } finally {
      setSavingHook(false);
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
        // GAP 7: Handle 429 for recommendations
        if (res.status === 429) {
          setRecsError(data.error || 'Rate limit reached');
          setUsageRemaining(0);
          setRateLimitRemaining(0);
          return;
        }
        setRecsError(data.error || 'Recommendations failed — try again');
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
      // When regenerating (rewriteResult exists), pass the previous rewrite
      // so the API produces a variant of the same talk track
      const payload: Record<string, unknown> = {
        transcript: result.transcript,
        analysis: result.analysis,
        persona: selectedPersona,
        tone: selectedTone,
        custom_persona: selectedPersona === 'custom' ? customPersona : undefined,
      };

      if (rewriteResult) {
        payload.previous_rewrite = {
          rewritten_hook: rewriteResult.rewritten_hook,
          rewritten_script: rewriteResult.rewritten_script,
          cta: rewriteResult.cta,
        };
      }

      const res = await fetch('/api/transcribe/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        // GAP 7: Handle 429 for rewrite
        if (res.status === 429) {
          setRewriteError(data.error || 'Rate limit reached');
          setUsageRemaining(0);
          setRateLimitRemaining(0);
          return;
        }
        setRewriteError(data.error || 'Failed to rewrite script.');
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

  // ---- AI Translation ----
  async function handleTranslate() {
    if (!result || isRateLimited) return;
    const targetLang = selectedLanguage === 'custom' ? customLanguage.trim() : TARGET_LANGUAGES.find(l => l.id === selectedLanguage)?.name || selectedLanguage;
    if (!targetLang) return;
    setTranslateLoading(true);
    setTranslateError('');

    try {
      const res = await fetch('/api/transcribe/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: result.transcript,
          targetLanguage: targetLang,
          sourceLanguage: result.language || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setTranslateError(data.error || 'Rate limit reached');
          setUsageRemaining(0);
          setRateLimitRemaining(0);
          return;
        }
        setTranslateError(data.error || 'Failed to translate transcript.');
        return;
      }

      updateRateLimits(res);
      setTranslateResult(data.data);
    } catch {
      setTranslateError('Network error. Please try again.');
    } finally {
      setTranslateLoading(false);
    }
  }

  async function handleSaveToContentStudio() {
    if (!rewriteResult) return;
    setSavingToStudio(true);
    setSaveError('');

    try {
      const res = await fetch('/api/transcribe/save-to-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewritten_hook: rewriteResult.rewritten_hook,
          rewritten_script: rewriteResult.rewritten_script,
          on_screen_text: rewriteResult.on_screen_text,
          cta: rewriteResult.cta,
          persona_used: rewriteResult.persona_used,
          tone_used: rewriteResult.tone_used,
          source_url: url.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveError(data.error || 'Failed to save to Content Studio');
        return;
      }

      setSavedConceptId(data.concept_id);
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSavingToStudio(false);
    }
  }

  async function handleMakeVariation() {
    if (!rewriteResult || !result || variationLoading) return;
    setVariationLoading(true);
    setVariationError('');

    try {
      const res = await fetch('/api/transcribe/variation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: result.transcript,
          analysis: result.analysis,
          persona: selectedPersona,
          tone: selectedTone,
          custom_persona: selectedPersona === 'custom' ? customPersona : undefined,
          previous_rewrite: {
            rewritten_hook: rewriteResult.rewritten_hook,
            rewritten_script: rewriteResult.rewritten_script,
            on_screen_text: rewriteResult.on_screen_text,
            cta: rewriteResult.cta,
            persona_used: rewriteResult.persona_used,
            tone_used: rewriteResult.tone_used,
          },
          original_concept_id: savedConceptId || undefined,
          source_url: url.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setVariationError(data.error || 'Rate limit reached');
          setUsageRemaining(0);
          setRateLimitRemaining(0);
          return;
        }
        if (res.status === 401) {
          setVariationError('Sign in to create variations');
          setIsLoggedIn(false);
          return;
        }
        setVariationError(data.error || 'Failed to create variation.');
        return;
      }

      updateRateLimits(res);
      setRewriteResult(data.data);
      if (data.concept_id) setSavedConceptId(data.concept_id);
    } catch {
      setVariationError('Network error. Please try again.');
    } finally {
      setVariationLoading(false);
    }
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
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm mb-6">
              <Zap size={14} />
              100% Free — No signup required
            </div>
          )}

          {/*
            Visual hero heading. The wrapper page already renders the canonical
            <h1> ("Free YouTube Transcriber"), so this is a <h2> to avoid
            dual-H1 SEO penalty. Public-facing copy reframed 2026-05-11 from
            "Breakdown" → "Transcriber" per Brandon: people search for a
            transcriber, the breakdown is bonus.
          */}
          <h2 className={`font-bold text-white mb-4 leading-tight ${isPortal ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl'}`}>
            {isPortal ? (
              'Free AI Transcriber'
            ) : (
              <>
                {config.heroTitle}{' '}
                <span className="bg-gradient-to-r from-teal-400 to-violet-400 bg-clip-text text-transparent">
                  Transcriber
                </span>
              </>
            )}
          </h2>

          <p className={`text-zinc-400 mb-${isPortal ? '6' : '10'} ${isPortal ? 'text-base' : 'text-lg max-w-xl mx-auto'}`}>
            {config.heroDescription}
          </p>

          {/* Input Area */}
          <div className={isPortal ? 'max-w-3xl' : 'max-w-2xl mx-auto'}>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleTranscribe()}
                placeholder={config.placeholder}
                className="flex-1 h-14 px-5 bg-zinc-900 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none text-base"
                disabled={loading}
              />
              <button
                onClick={handleTranscribe}
                disabled={loading || !url.trim() || rateLimitRemaining === 0}
                className={`h-14 px-8 bg-gradient-to-r from-teal-500 to-violet-500 hover:from-teal-600 hover:to-violet-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[160px] ${
                  rateLimitRemaining === 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <MessageSquareText size={18} />
                    Transcribe Video
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

            {/* GAP 7: Rate limit UI */}
            {rateLimitTotal > 0 && (
              <div className="text-xs text-zinc-500 mt-2">
                {rateLimitRemaining > 0
                  ? `${rateLimitRemaining} of ${rateLimitTotal} uses remaining today`
                  : <span className="text-amber-400">Daily limit reached — resets tomorrow</span>
                }
              </div>
            )}
          </div>

          {/* Usage counter */}
          {usageRemaining !== null && usageLimit !== null && usageLimit !== -1 && (
            <p className={`text-sm mt-4 ${usageRemaining === 0 ? 'text-red-400' : 'text-zinc-500'}`}>
              {usageRemaining} of {usageLimit} {isLoggedIn ? '' : 'free '}AI use{usageLimit === 1 ? '' : 's'} remaining today
              {!isPortal && !isLoggedIn && usageRemaining <= 3 && (
                <> &mdash; <Link href="/login?mode=signup" className="text-teal-400 hover:text-teal-300 underline underline-offset-2">sign up</Link> for more /day</>
              )}
            </p>
          )}
          {usageLimit === -1 && (
            <p className="text-sm mt-4 text-zinc-500">Unlimited AI uses</p>
          )}

          {/* Social proof — public only */}
          {!isPortal && (
            <p className="text-xs text-zinc-600 mt-4">
              {config.socialProof}
            </p>
          )}

          {/* Cross-link to the YouTube version. Public TikTok page only —
              long-form videos are a different mental model and users coming
              from ads sometimes paste YouTube URLs into the TikTok field by
              mistake. Reciprocal link added by Agent B on the YouTube page. */}
          {!isPortal && platform === 'tiktok' && (
            <p className="text-xs text-zinc-500 mt-3">
              Got a YouTube link?{' '}
              <Link
                href="/youtube-transcribe"
                className="text-teal-400 hover:text-teal-300 underline underline-offset-2 transition-colors"
              >
                Use the long-form transcriber →
              </Link>
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

            {/* Transcript Card — the primary result. Brandon 2026-05-11:
                visitors want the transcript first, breakdown is bonus. Copy
                button + Send-to-ChatGPT are the two main actions. */}
            <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
              <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <MessageSquareText size={18} className="text-teal-400" />
                  Transcript
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <CopyButton
                    text={result.transcript}
                    copyKey="transcript"
                    copiedKey={copiedKey}
                    copy={copy}
                  />
                  {/* Was a "Send to ChatGPT" button that copied + opened
                      chat.openai.com. Removed: it sends visitors AWAY from
                      FlashFlow with no return path. Goal is to keep them on
                      our site (the AI Breakdown + Clip upsell below are the
                      retention surfaces). Re-introduce as an affiliate
                      partnership only if we monetize the outbound. */}
                </div>
              </div>
              <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{result.transcript}</p>
              <p className="text-xs text-zinc-500 mt-3">
                Tip: copy this anywhere you need it. The AI breakdown below is a free bonus.
              </p>
            </div>

            {/* Upsell: turn this video into clips */}
            <Link
              href={`/admin/youtube-transcribe?url=${encodeURIComponent(url)}`}
              className="block cursor-pointer bg-gradient-to-r from-teal-500/10 via-teal-500/5 to-transparent border border-teal-500/30 rounded-xl p-5 hover:border-teal-400 hover:bg-teal-500/10 transition-colors group"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-teal-300 mb-0.5">
                    Want clips from this video?
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Turn this transcript into 10–30 short, viral clips ready for TikTok, Reels, and Shorts.
                  </p>
                </div>
                <span className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white group-hover:bg-teal-400 transition-colors whitespace-nowrap">
                  Make clips
                  <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                </span>
              </div>
            </Link>

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
                      <div className="flex items-center gap-2">
                        <CopyButton
                          text={result.analysis.hook.line}
                          copyKey="hook"
                          copiedKey={copiedKey}
                          copy={copy}
                          size="xs"
                          label="Copy Hook"
                        />
                        {isLoggedIn && (
                          <button
                            onClick={handleSaveHook}
                            disabled={savingHook || hookSaved}
                            className={`inline-flex items-center px-2 py-1 text-xs gap-1 rounded-lg transition-colors shrink-0 ${
                              hookSaved
                                ? 'bg-green-500/10 text-green-400'
                                : hookSaveError
                                  ? 'bg-red-500/10 text-red-400'
                                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {savingHook ? (
                              <><Loader2 size={12} className="animate-spin" /> Saving...</>
                            ) : hookSaved ? (
                              <><Check size={12} /> Saved!</>
                            ) : hookSaveError ? (
                              <><AlertCircle size={12} /> Failed</>
                            ) : (
                              <><Bookmark size={12} /> Save Hook</>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wide">Full Hook</span>
                        <p className="text-zinc-200 mt-1 font-medium leading-relaxed">&ldquo;{result.analysis.hook.line}&rdquo;</p>
                      </div>
                      <div className="flex gap-4 flex-wrap">
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
                        {result.analysis.intent && (
                          <div>
                            <span className="text-xs text-zinc-500 uppercase tracking-wide">Intent</span>
                            <p className="mt-1">
                              <span className="inline-flex px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 text-sm capitalize">
                                {result.analysis.intent.primary.replace(/-/g, ' ')}
                              </span>
                            </p>
                          </div>
                        )}
                      </div>

                      {/* NEW: Why this hook works */}
                      {result.analysis.hook.why_strong && (
                        <div className="rounded-lg bg-zinc-800/40 border border-orange-500/20 p-3">
                          <div className="text-xs text-orange-400 uppercase tracking-wide mb-1">Why this hook works</div>
                          <p className="text-zinc-300 text-sm leading-relaxed">{result.analysis.hook.why_strong}</p>
                        </div>
                      )}

                      {/* NEW: Intent explanation */}
                      {result.analysis.intent?.explanation && (
                        <div className="rounded-lg bg-zinc-800/40 border border-blue-500/20 p-3">
                          <div className="text-xs text-blue-400 uppercase tracking-wide mb-1">What this video wants</div>
                          <p className="text-zinc-300 text-sm leading-relaxed">{result.analysis.intent.explanation}</p>
                        </div>
                      )}

                      {/* NEW: Hook alternatives — actual rewritten lines, A/B-testable */}
                      {result.analysis.hook.alternatives && result.analysis.hook.alternatives.length > 0 && (
                        <div className="rounded-lg bg-zinc-800/40 border border-teal-500/20 p-3">
                          <div className="text-xs text-teal-400 uppercase tracking-wide mb-2">Try these alt hooks (A/B test)</div>
                          <ul className="space-y-1.5">
                            {result.analysis.hook.alternatives.map((alt, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                                <button
                                  type="button"
                                  onClick={() => copy(alt, `alt-hook-${i}`)}
                                  className="text-left hover:text-teal-300 transition-colors flex-1"
                                  title="Click to copy"
                                >
                                  <span className="text-teal-500 mr-1">→</span>
                                  {copiedKey === `alt-hook-${i}` ? <span className="text-green-400">Copied!</span> : <span>&ldquo;{alt}&rdquo;</span>}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content Breakdown */}
                  <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                      <Sparkles size={18} className="text-violet-400" />
                      Format Breakdown
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

                  {/* Key Phrases — now with WHY each works */}
                  {result.analysis.keyPhrases.length > 0 && (
                    <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <Zap size={18} className="text-yellow-400" />
                          Key Phrases
                        </h3>
                        <CopyButton
                          text={result.analysis.keyPhrases.map((p) => normalizeKeyPhrase(p).phrase).join(', ')}
                          copyKey="allPhrases"
                          copiedKey={copiedKey}
                          copy={copy}
                          size="xs"
                          label="Copy All"
                        />
                      </div>
                      <div className="space-y-2">
                        {result.analysis.keyPhrases.map((rawPhrase, i) => {
                          const np = normalizeKeyPhrase(rawPhrase);
                          return (
                            <div
                              key={i}
                              className="rounded-lg bg-zinc-800/40 border border-white/5 p-3 hover:border-yellow-500/30 transition-colors"
                            >
                              <button
                                onClick={() => copy(np.phrase, `phrase-${i}`)}
                                className="text-zinc-200 text-sm font-medium text-left w-full"
                                title="Click to copy"
                              >
                                {copiedKey === `phrase-${i}` ? (
                                  <span className="text-green-400">Copied!</span>
                                ) : (
                                  <span>&ldquo;{np.phrase}&rdquo;</span>
                                )}
                              </button>
                              {np.why_it_works && (
                                <div className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                                  <span className="text-zinc-500">why it works:</span> {np.why_it_works}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* What Works + Emotion */}
                  <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                      <Sparkles size={18} className="text-green-400" />
                      Why This Works
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
            {/* FlashFlow Features Grid — sell what FF does that others don't */}
            {/* ================================================================ */}
            {result && (
              <div className="mt-2">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-white mb-2">
                    Now do something with it →
                  </h3>
                  <p className="text-zinc-400 text-sm">
                    {isLoggedIn
                      ? 'You unlocked everything. Pick a tool and start.'
                      : 'Free transcripts forever. Sign up to unlock the full toolkit.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Make Clips. Use Next.js <Link> not bare <a> — bare <a>
                      was the dead-link culprit when nested next to <button>s
                      with onClick handlers in the same grid (some browsers
                      drop the click when stacking-context siblings differ). */}
                  <Link
                    href={isLoggedIn ? `/admin/youtube-transcribe?url=${encodeURIComponent(url)}` : `/login?mode=signup&from=clip-cta`}
                    className="group block cursor-pointer p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-teal-500 hover:bg-teal-500/5 transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center">
                        <Zap size={18} className="text-teal-400" />
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 font-semibold">FREE</span>
                    </div>
                    <div className="text-white font-semibold mb-1">Make 10–30 Clips</div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Long video → short clips ready for TikTok, Reels, Shorts. AI picks the best 30s moments.
                    </p>
                    <div className="mt-3 text-xs text-teal-400 font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                      {isLoggedIn ? 'Clip this video' : 'Sign up to clip'} <ArrowRight size={12} />
                    </div>
                  </Link>

                  {/* Generate Your Own Version */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isLoggedIn) {
                        window.location.href = '/login?mode=signup&from=rewrite-cta';
                        return;
                      }
                      setRewriteOpen(true);
                      // Scroll into rewrite section. Target id="rewrite-section"
                      // is set on the accordion wrapper further down — required
                      // or this onClick set state silently and the user saw
                      // nothing happen ("dead click" symptom).
                      setTimeout(() => {
                        document.getElementById('rewrite-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }}
                    className="group p-5 cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-orange-500 hover:bg-orange-500/5 transition-all text-left"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                        <Pen size={18} className="text-orange-400" />
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-semibold">FREE</span>
                    </div>
                    <div className="text-white font-semibold mb-1">Rewrite In Your Voice</div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Same hook, your style. Pick a persona and tone — get a script you can record today.
                    </p>
                    <div className="mt-3 text-xs text-orange-400 font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                      {isLoggedIn ? 'Rewrite it' : 'Sign up to rewrite'} <ArrowRight size={12} />
                    </div>
                  </button>

                  {/* Translate */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isLoggedIn) {
                        window.location.href = '/login?mode=signup&from=translate-cta';
                        return;
                      }
                      setTranslateOpen(true);
                      // Scroll the just-opened accordion into view — without
                      // this, the state flip happens 1500px below the card
                      // the user just clicked, and it feels "dead".
                      setTimeout(() => {
                        document.getElementById('translate-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }}
                    className="group p-5 cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-blue-500 hover:bg-blue-500/5 transition-all text-left"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Languages size={18} className="text-blue-400" />
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold">FREE</span>
                    </div>
                    <div className="text-white font-semibold mb-1">Translate To Any Language</div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Reach a global audience. Spanish, Portuguese, French, Hindi, Japanese, more.
                    </p>
                    <div className="mt-3 text-xs text-blue-400 font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                      {isLoggedIn ? 'Translate' : 'Sign up to translate'} <ArrowRight size={12} />
                    </div>
                  </button>

                  {/* Get Recommendations */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isLoggedIn) {
                        window.location.href = '/login?mode=signup&from=recs-cta';
                        return;
                      }
                      setRecsOpen(true);
                      // Scroll the accordion into view so the user sees the
                      // panel they just opened (otherwise dead-click feel).
                      setTimeout(() => {
                        document.getElementById('recs-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }}
                    className="group p-5 cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-violet-500 hover:bg-violet-500/5 transition-all text-left"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                        <Lightbulb size={18} className="text-violet-400" />
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-semibold">FREE</span>
                    </div>
                    <div className="text-white font-semibold mb-1">Get 10 Spinoff Ideas</div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      AI gives you 10 fresh angles + new hook lines based on what made this video work.
                    </p>
                    <div className="mt-3 text-xs text-violet-400 font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                      {isLoggedIn ? 'Get ideas' : 'Sign up for ideas'} <ArrowRight size={12} />
                    </div>
                  </button>

                  {/* Save to library — internal route is still /admin/winners-bank,
                      but logged-out viewers see sign-up oriented copy and
                      logged-in viewers see plain "my library" wording. */}
                  <Link
                    href={isLoggedIn ? '/admin/winners-bank' : '/login?mode=signup&from=library-cta'}
                    className="group block cursor-pointer p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-pink-500 hover:bg-pink-500/5 transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-pink-500/10 flex items-center justify-center">
                        <Bookmark size={18} className="text-pink-400" />
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 font-semibold">FREE</span>
                    </div>
                    <div className="text-white font-semibold mb-1">
                      {isLoggedIn ? 'Open my library' : 'Save this transcript →'}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {isLoggedIn
                        ? 'Your saved hooks, scripts, and angles in one place. Build a swipe file of proven viral content.'
                        : 'Free account — we keep every transcript and viral breakdown in your library so you can come back to it anytime.'}
                    </p>
                    <div className="mt-3 text-xs text-pink-400 font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                      {isLoggedIn ? 'Open library' : 'Sign up to save'} <ArrowRight size={12} />
                    </div>
                  </Link>

                  {/* Generate Original Video — /create is the canonical AI clip tool */}
                  <Link
                    href={isLoggedIn ? '/create?from=transcribe' : '/login?mode=signup&from=video-cta'}
                    className="group block cursor-pointer p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-yellow-500 hover:bg-yellow-500/5 transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                        <Sparkles size={18} className="text-yellow-400" />
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 font-semibold">FREE</span>
                    </div>
                    <div className="text-white font-semibold mb-1">AI Clip Tool</div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Upload your own raw footage — AI picks the best moments, fixes pacing, adds karaoke captions.
                    </p>
                    <div className="mt-3 text-xs text-yellow-400 font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                      {isLoggedIn ? 'Open clip tool' : 'Sign up to edit'} <ArrowRight size={12} />
                    </div>
                  </Link>
                </div>

                {!isLoggedIn && (
                  <div className="mt-6 text-center text-sm text-zinc-400">
                    Everything above is <span className="text-teal-400 font-semibold">100% free</span> when you sign up. No credit card.
                  </div>
                )}
              </div>
            )}

            {/* ================================================================ */}
            {/* Video Vibe Analysis */}
            {/* ================================================================ */}
            {/* The "Generate In This Style" event only has a listener inside
                TranscriberWorkspace (admin/transcribe). On the public
                /transcribe page nothing handles it, so the action row would
                be a dead button. Only wire onGenerateInStyle when we're in
                the portal wrapper. */}
            {result && result.segments && result.segments.length > 0 && (
              <VibeAnalysisCard
                transcript={result.transcript}
                segments={result.segments}
                duration={result.duration}
                analysis={result.analysis as Record<string, unknown> | null}
                onGenerateInStyle={isPortal ? (vibe) => {
                  window.dispatchEvent(new CustomEvent('transcriber:generate-in-style', { detail: vibe }));
                } : undefined}
              />
            )}

            {/* ================================================================ */}
            {/* AI Recommendations Section */}
            {/* ================================================================ */}
            <div id="recs-section" className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden scroll-mt-20">
              <button
                onClick={() => setRecsOpen(!recsOpen)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Lightbulb size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Build From This Video</h3>
                    <p className="text-sm text-zinc-400">Script angles, alternative hooks, product ideas</p>
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
                            Get Script Ideas
                          </button>
                          <p className="text-sm text-zinc-500">
                            Upgrade for unlimited script ideas.{' '}
                            <span className="text-amber-400 font-medium">Use code TRANSCRIBE20</span>
                          </p>
                        </div>
                      ) : !isLoggedIn ? (
                        // The recommendations endpoint requires auth (aiRouteGuard).
                        // Avoid showing a button that 401s — funnel anon users to signup.
                        <Link
                          href="/login?mode=signup&from=recs-cta"
                          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-semibold rounded-xl transition-all"
                        >
                          <Lightbulb size={18} />
                          Sign up free for AI recommendations
                          <ArrowRight size={14} />
                        </Link>
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
                          <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Script Angles</h4>
                          <div className="space-y-3">
                            {recommendations.script_concepts.map((concept, i) => (
                              <div key={i} className="bg-zinc-800/50 border border-white/5 rounded-lg p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <h5 className="font-medium text-white">{concept.title}</h5>
                                    <p className="text-sm text-zinc-400 mt-1">{concept.angle}</p>
                                    <p className="text-sm text-amber-400 mt-2 font-medium">&ldquo;{concept.hook}&rdquo;</p>
                                    <p className="text-sm text-zinc-400 mt-1">{concept.outline}</p>
                                    {/* Action buttons: Use in Studio + Save to Ideas */}
                                    {isLoggedIn && (
                                      <div className="flex flex-wrap gap-2 mt-3">
                                        <button
                                          onClick={() => {
                                            const params = new URLSearchParams({
                                              hook: concept.hook || '',
                                              inspiration: concept.outline || concept.angle || '',
                                            });
                                            window.location.href = `/admin/content-studio?${params.toString()}`;
                                          }}
                                          className="text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2.5 font-medium transition-colors min-h-[44px]"
                                        >
                                          Use in Studio →
                                        </button>
                                        {savedIdeaIndexes.has(i) ? (
                                          <span className="text-sm text-green-400 font-medium px-4 py-2.5 min-h-[44px] flex items-center">✓ Saved</span>
                                        ) : confirmingIdeaIndex === i ? (
                                          <button
                                            onClick={() => {
                                              try {
                                                const raw = localStorage.getItem('flashflow_saved_ideas');
                                                const existing: unknown[] = raw ? JSON.parse(raw) : [];
                                                const newIdea = {
                                                  id: `transcriber_${Date.now()}_${i}`,
                                                  title: concept.title,
                                                  hook: concept.hook,
                                                  content_type: 'script_concept',
                                                  format_notes: concept.outline,
                                                  target_product: null,
                                                  target_brand: null,
                                                  why_it_works: concept.angle,
                                                  effort: 'medium' as const,
                                                  priority: 5,
                                                  estimated_duration: '30-60s',
                                                  hashtags: [],
                                                  on_screen_text: '',
                                                };
                                                existing.push(newIdea);
                                                localStorage.setItem('flashflow_saved_ideas', JSON.stringify(existing));
                                                setSavedIdeaIndexes(prev => new Set([...prev, i]));
                                                setConfirmingIdeaIndex(null);
                                              } catch (e) {
                                                console.error('Failed to save idea:', e);
                                              }
                                            }}
                                            onBlur={() => setTimeout(() => setConfirmingIdeaIndex(null), 200)}
                                            className="text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-4 py-2.5 font-medium transition-colors min-h-[44px] animate-pulse"
                                          >
                                            Confirm Save?
                                          </button>
                                        ) : (
                                          <button
                                            onClick={() => setConfirmingIdeaIndex(i)}
                                            className="text-sm bg-zinc-700 hover:bg-zinc-600 text-amber-400 rounded-lg px-4 py-2.5 font-medium transition-colors min-h-[44px]"
                                          >
                                            Save to Ideas
                                          </button>
                                        )}
                                      </div>
                                    )}
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
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isLoggedIn && (
                                    savedHookIndexes.has(i) ? (
                                      <span className="text-sm text-green-400 font-medium px-3 py-2">✓ Saved</span>
                                    ) : (
                                      <button
                                        onClick={async () => {
                                          setSavingHookIndex(i);
                                          try {
                                            // /api/admin/winners-bank only exposes GET. POST goes to /api/winners.
                                            // 'source_type' must be 'generated' or 'external' (zod-enforced).
                                            const res = await fetch('/api/winners', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              credentials: 'include',
                                              body: JSON.stringify({
                                                source_type: 'generated',
                                                winner_type: 'hook',
                                                hook: h.hook,
                                                hook_type: h.style,
                                                notes: h.why_it_works,
                                              }),
                                            });
                                            if (res.ok) {
                                              setSavedHookIndexes(prev => new Set([...prev, i]));
                                            } else {
                                              console.error('Failed to save hook:', await res.text());
                                            }
                                          } catch (e) {
                                            console.error('Failed to save hook:', e);
                                          } finally {
                                            setSavingHookIndex(null);
                                          }
                                        }}
                                        disabled={savingHookIndex === i}
                                        className="text-sm bg-zinc-700 hover:bg-zinc-600 text-teal-400 rounded-lg px-3 py-2 font-medium transition-colors disabled:opacity-50 min-h-[44px]"
                                      >
                                        {savingHookIndex === i ? '...' : 'Save Hook'}
                                      </button>
                                    )
                                  )}
                                  <CopyButton
                                    text={h.hook}
                                    copyKey={`hook-${i}`}
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

                      {/* Product Categories */}
                      {recommendations.product_categories?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Products That Fit This Format</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {recommendations.product_categories.map((cat, i) => (
                              <div key={i} className="bg-zinc-800/50 border border-white/5 rounded-lg p-3">
                                <p className="font-medium text-white text-sm">{cat.category}</p>
                                <p className="text-xs text-zinc-400 mt-1">{cat.reasoning}</p>
                                <p className="text-xs text-zinc-500 mt-1">e.g. {cat.example_product}</p>
                                <div className="flex gap-2 mt-1">
                                  <button
                                    onClick={() => copy(`${cat.category}: ${cat.reasoning}`, `cat-${i}`)}
                                    className="text-xs text-zinc-400 hover:text-white transition-colors"
                                  >
                                    {copiedKey === `cat-${i}` ? <span className="text-green-400">Copied!</span> : '📋 Copy'}
                                  </button>
                                  <a
                                    href={config.productSearchUrl(cat.category)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
                                  >
                                    🔍 {config.productSearchLabel} →
                                  </a>
                                </div>
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
            {/* AI Translation Section */}
            {/* ================================================================ */}
            <div id="translate-section" className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden scroll-mt-20">
              <button
                onClick={() => setTranslateOpen(!translateOpen)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                    <Languages size={20} className="text-sky-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Translate</h3>
                    <p className="text-sm text-zinc-400">Translate the transcript to or from any language</p>
                  </div>
                </div>
                {translateOpen ? <ChevronUp size={20} className="text-zinc-400" /> : <ChevronDown size={20} className="text-zinc-400" />}
              </button>

              {translateOpen && (
                <div className="px-6 pb-6 space-y-4">
                  {isRateLimited ? (
                    <div className="text-center py-4 space-y-3">
                      <button
                        disabled
                        className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 text-zinc-500 font-semibold rounded-xl cursor-not-allowed"
                      >
                        <Lock size={16} />
                        Translate Transcript
                      </button>
                      <p className="text-sm text-zinc-500">
                        Upgrade for unlimited translations.{' '}
                        <span className="text-sky-400 font-medium">Use code TRANSCRIBE20</span>
                      </p>
                    </div>
                  ) : !isLoggedIn ? (
                    // Translation endpoint requires auth (aiRouteGuard). Surface signup, not a 401.
                    <div className="text-center py-4">
                      <Link
                        href="/login?mode=signup&from=translate-cta"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 font-semibold rounded-xl transition-all"
                      >
                        <Languages size={18} />
                        Sign up free to translate
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  ) : (
                    <>
                      {/* Language selector — filter out the transcript's own language */}
                      <div>
                        <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">Translate to</label>
                        <select
                          value={selectedLanguage}
                          onChange={(e) => setSelectedLanguage(e.target.value)}
                          className="w-full h-11 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none appearance-none"
                        >
                          {TARGET_LANGUAGES
                            .filter((lang) => {
                              if (lang.id === 'custom') return true;
                              const srcLang = (result?.language || '').toLowerCase();
                              // Hide English target for English transcripts, etc.
                              if (srcLang === 'en' && lang.id === 'english') return false;
                              if (srcLang === 'es' && lang.id === 'spanish') return false;
                              if (srcLang === 'fr' && lang.id === 'french') return false;
                              if (srcLang === 'pt' && lang.id === 'portuguese') return false;
                              if (srcLang === 'de' && lang.id === 'german') return false;
                              if (srcLang === 'it' && lang.id === 'italian') return false;
                              if (srcLang === 'ja' && lang.id === 'japanese') return false;
                              if (srcLang === 'ko' && lang.id === 'korean') return false;
                              if (srcLang === 'zh' && lang.id === 'chinese') return false;
                              if (srcLang === 'ar' && lang.id === 'arabic') return false;
                              if (srcLang === 'hi' && lang.id === 'hindi') return false;
                              if (srcLang === 'ru' && lang.id === 'russian') return false;
                              if (srcLang === 'tr' && lang.id === 'turkish') return false;
                              if (srcLang === 'vi' && lang.id === 'vietnamese') return false;
                              if (srcLang === 'th' && lang.id === 'thai') return false;
                              if (srcLang === 'nl' && lang.id === 'dutch') return false;
                              return true;
                            })
                            .map((lang) => (
                              <option key={lang.id} value={lang.id}>{lang.name}</option>
                            ))}
                        </select>
                      </div>

                      {/* Custom language input */}
                      {selectedLanguage === 'custom' && (
                        <div>
                          <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">Enter Language</label>
                          <input
                            type="text"
                            value={customLanguage}
                            onChange={(e) => setCustomLanguage(e.target.value)}
                            placeholder="e.g. Tagalog, Swahili, Urdu..."
                            className="w-full h-11 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm placeholder-zinc-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                          />
                        </div>
                      )}

                      {/* Translate button */}
                      <div className="flex justify-center">
                        <button
                          onClick={handleTranslate}
                          disabled={translateLoading || (selectedLanguage === 'custom' && !customLanguage.trim())}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {translateLoading ? (
                            <>
                              <Loader2 size={18} className="animate-spin" />
                              Translating...
                            </>
                          ) : (
                            <>
                              <Languages size={18} />
                              {translateResult ? 'Translate Again' : 'Translate Transcript'}
                              <span className="text-xs text-sky-400/60 ml-1">(1 AI use)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}

                  {translateError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                      <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="text-red-300 text-sm">{translateError}</p>
                    </div>
                  )}

                  {/* Translation Result */}
                  {translateResult && (
                    <div className="space-y-4 pt-2">
                      {/* Language badges */}
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2.5 py-1 rounded-full bg-zinc-700/50 text-zinc-300 text-xs font-medium">
                          {translateResult.source_language}
                        </span>
                        <span className="text-zinc-500 text-xs flex items-center">→</span>
                        <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 text-xs font-medium">
                          {translateResult.target_language}
                        </span>
                      </div>

                      {/* Translated text */}
                      <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Translated Transcript</span>
                          <CopyButton
                            text={translateResult.translated_text}
                            copyKey="translate-text"
                            copiedKey={copiedKey}
                            copy={copy}
                            size="xs"
                          />
                        </div>
                        <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-sm">{translateResult.translated_text}</p>
                      </div>

                      {/* Translation notes */}
                      {translateResult.notes && (
                        <div className="bg-sky-500/5 border border-sky-500/20 rounded-lg p-3">
                          <span className="text-xs text-sky-400 uppercase tracking-wide font-semibold">Translation Notes</span>
                          <p className="text-zinc-400 text-sm mt-1">{translateResult.notes}</p>
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
            <div id="rewrite-section" className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden scroll-mt-20">
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
                  ) : !isLoggedIn ? (
                    // Rewrite endpoint requires auth (aiRouteGuard). Surface signup, not a 401.
                    <div className="text-center py-4">
                      <Link
                        href="/login?mode=signup&from=rewrite-cta"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-400 font-semibold rounded-xl transition-all"
                      >
                        <Pen size={18} />
                        Sign up free to rewrite
                        <ArrowRight size={14} />
                      </Link>
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
                              {rewriteResult ? 'Regenerate (same talk track)' : 'Rewrite Script'}
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
                        <span className="px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-medium">
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
                          disabled={rewriteLoading || variationLoading}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={14} />
                          Regenerate (same talk track)
                        </button>
                        {isLoggedIn && isPaid && (
                          <button
                            onClick={handleMakeVariation}
                            disabled={variationLoading || rewriteLoading}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {variationLoading ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                Creating variation...
                              </>
                            ) : (
                              <>
                                <Sparkles size={14} />
                                Make a Variation
                              </>
                            )}
                          </button>
                        )}
                        <CopyButton
                          text={`Hook: "${rewriteResult.rewritten_hook}"\n\n${rewriteResult.rewritten_script}\n\nCTA: ${rewriteResult.cta}\n\nOn-screen text:\n${rewriteResult.on_screen_text?.map((t, i) => `${i + 1}. ${t}`).join('\n') || 'None'}`}
                          copyKey="rewrite-all"
                          copiedKey={copiedKey}
                          copy={copy}
                          label="Copy All"
                        />
                        {isLoggedIn && isPaid && (
                          savedConceptId ? (
                            <Link
                              href={`/admin/content-studio?concept=${savedConceptId}`}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg transition-colors hover:bg-green-500/20"
                            >
                              <Check size={14} />
                              Saved! View in Content Studio
                              <ArrowRight size={14} />
                            </Link>
                          ) : (
                            <button
                              onClick={handleSaveToContentStudio}
                              disabled={savingToStudio}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-400 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {savingToStudio ? (
                                <>
                                  <Loader2 size={14} className="animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <FileText size={14} />
                                  Save to Content Studio
                                </>
                              )}
                            </button>
                          )
                        )}
                        {saveError && (
                          <p className="text-red-400 text-sm w-full">{saveError}</p>
                        )}
                        {variationError && (
                          <p className="text-red-400 text-sm w-full">{variationError}</p>
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
                  <span className="text-lg font-semibold">Saved to my library</span>
                </div>
                <Link
                  href="/admin/winners-bank"
                  className="text-green-400 hover:text-green-300 underline underline-offset-2 text-sm transition-colors"
                >
                  View in my library &rarr;
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Portal action buttons */}
                {/* GAP 3: Fixed permission gate - changed from isPortal && isLoggedIn to just isLoggedIn */}
                {isLoggedIn && (
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
                          Save to my library
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleGenerateScript}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-400 font-semibold rounded-xl transition-all"
                    >
                      <FileText size={18} />
                      Write Script From This
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
                              Save to my library
                            </>
                          )}
                        </button>
                        {winnerError && (
                          <p className="text-red-400 text-sm mt-2">{winnerError}</p>
                        )}
                      </div>
                    )}

                    <div className="bg-gradient-to-r from-teal-500/10 to-violet-500/10 border border-teal-500/20 rounded-xl p-8 text-center">
                      <h3 className="text-xl font-bold text-white mb-2">
                        Want to write scripts like this?
                      </h3>
                      <p className="text-zinc-400 mb-6">
                        Turn this analysis into your own TikTok script. 20+ persona voices, free to try.
                      </p>
                      <Link
                        href="/script-generator"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-violet-500 hover:from-teal-600 hover:to-violet-600 text-white font-semibold rounded-xl transition-all"
                      >
                        Try the Script Generator Free
                        <ArrowRight size={16} />
                      </Link>
                      {!isLoggedIn && (
                        <p className="mt-4 text-zinc-500 text-sm">
                          <Link href="/login?mode=signup&next=/transcribe" className="text-zinc-400 hover:text-zinc-300 underline underline-offset-2 transition-colors">
                            Create a free account
                          </Link>
                          {' '}to save this transcript to your library
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

      {/* How it works — shown when no results, portal users get compact version */}
      {isPortal && !result && !loading && (
        <section className="pb-6">
          <div className="max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { icon: Clipboard, title: 'Paste a URL', desc: 'Any public TikTok or YouTube video' },
                { icon: Target, title: 'AI analyzes it', desc: 'Hook, pacing, triggers & structure' },
                { icon: Sparkles, title: 'Get insights', desc: 'Rewrite it in any persona or tone' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/30 border border-white/5">
                  <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
                    <item.icon size={14} className="text-teal-400" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-zinc-200">{item.title}</div>
                    <div className="text-[11px] text-zinc-500">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      {!isPortal && !result && !loading && (
        <section className="relative py-16 sm:py-24">
          <div className="max-w-4xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-white text-center mb-12">How it works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  step: '1',
                  title: 'Paste the URL',
                  desc: config.howItWorksStep1,
                  icon: Clipboard,
                },
                {
                  step: '2',
                  title: 'AI Transcribes',
                  desc: 'We pull the audio and run it through our AI transcription engine for fast, accurate text.',
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
                  <div className="w-12 h-12 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto mb-4">
                    <item.icon size={20} className="text-teal-400" />
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
              <Loader2 size={32} className="animate-spin text-teal-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Transcribing video...</h3>
              <p className="text-sm text-zinc-400">
                Downloading audio, running AI transcription, and analyzing content. This usually
                takes 10-30 seconds.
              </p>
            </div>

            {/* While-you-wait marketing surface — public funnel only.
                Whisper takes 20-90s; dead air would be wasted real estate.
                Hidden on /admin/transcribe (isPortal === true) since that's
                already-logged-in admins — wrong audience for the upsell. */}
            {!isPortal && <WhileYouWait isLoggedIn={isLoggedIn} />}
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* Lead-magnet popup — fires 6s after first transcript for guests */}
      {/* ================================================================ */}
      {leadMagnetOpen && !isLoggedIn && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => {
            setLeadMagnetOpen(false);
            setLeadMagnetDismissed(true);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-gradient-to-br from-zinc-900 via-zinc-900 to-teal-950/30 border border-teal-500/30 rounded-2xl shadow-2xl shadow-teal-500/10 p-6 sm:p-8 animate-in slide-in-from-bottom-4 duration-300"
          >
            <button
              type="button"
              onClick={() => {
                setLeadMagnetOpen(false);
                setLeadMagnetDismissed(true);
              }}
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/5 transition-colors text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>

            {!leadMagnetSuccess ? (
              <>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-xs text-teal-400 font-semibold mb-3">
                  <Sparkles size={12} /> Limited time
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 leading-tight">
                  Unlimited free transcriptions, forever
                </h2>
                <p className="text-zinc-400 text-sm mb-5 leading-relaxed">
                  First 1,000 signups lock in unlimited transcripts + the full toolkit (clips, rewrites, translations, library) at zero cost.{' '}
                  <span className="text-teal-300 font-semibold">No credit card. No trial.</span>
                </p>

                <form onSubmit={handleLeadMagnetSubmit} className="space-y-3">
                  <input
                    type="email"
                    required
                    autoFocus
                    placeholder="you@email.com"
                    value={leadMagnetEmail}
                    onChange={(e) => setLeadMagnetEmail(e.target.value)}
                    disabled={leadMagnetSubmitting}
                    className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50 transition"
                  />
                  {leadMagnetError && (
                    <p className="text-sm text-red-400 flex items-center gap-1.5">
                      <AlertCircle size={14} /> {leadMagnetError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={leadMagnetSubmitting || !leadMagnetEmail.trim()}
                    className="w-full px-6 py-3 bg-teal-500 text-zinc-900 font-bold rounded-lg hover:bg-teal-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {leadMagnetSubmitting ? (
                      <><Loader2 size={16} className="animate-spin" /> Saving your spot...</>
                    ) : (
                      <>Claim my free spot <ArrowRight size={16} /></>
                    )}
                  </button>
                </form>

                <div className="mt-4 pt-4 border-t border-zinc-800 text-xs text-zinc-500 leading-relaxed">
                  <span className="text-zinc-400">What you get free:</span> unlimited transcripts ·
                  hook + format + emotion analysis · clip detection · script rewriter · translator ·
                  swipe library
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setLeadMagnetOpen(false);
                    setLeadMagnetDismissed(true);
                  }}
                  className="mt-3 w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  No thanks, I&apos;ll keep paying for TurboScribe
                </button>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
                  <Check size={28} className="text-teal-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">You&apos;re in!</h2>
                <p className="text-zinc-400 text-sm">
                  Sending you to signup to finish setup...
                </p>
                <Loader2 size={20} className="animate-spin text-teal-400 mx-auto mt-4" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
