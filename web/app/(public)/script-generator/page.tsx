'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { PERSONAS } from '@/lib/personas';
import { Copy, Check, Sparkles, ArrowRight, ChevronDown, Loader2, Bookmark, Zap } from 'lucide-react';

// ============================================================================
// SEO Metadata (exported from a separate metadata file since this is 'use client')
// ============================================================================

// Subset of personas to show (popular/diverse selection)
const FEATURED_PERSONAS = [
  'sarah',       // Trend-Aware Lifestyle
  'mike',        // Skeptical Reviewer
  'jessica',     // Gen-Z Trendsetter
  'marcus',      // High-Energy Hype
  'lisa',        // Trusted Expert
  'tyler',       // Chaotic Comedy
  'priya-sharma', // Ingredient Researcher
  'nina-thompson', // Overwhelmed Supermom
];

const TONE_OPTIONS = [
  { id: 'SAFE', label: 'Safe', description: 'Wholesome & family-friendly', color: 'emerald' },
  { id: 'BALANCED', label: 'Balanced', description: 'Sharp but brand-safe', color: 'blue' },
  { id: 'SPICY', label: 'Spicy', description: 'Bold comedy & parody', color: 'orange' },
] as const;

// Platform-aware script generation. The selected platform is sent to the API
// where it modifies the prompt (hook length, pacing, captions style, CTAs, etc.).
// Each platform here maps to a different optimization profile in
// `app/api/public/generate-script/route.ts → PLATFORM_PROMPTS`.
const PLATFORM_OPTIONS = [
  { id: 'tiktok', label: 'TikTok', description: '9:16 · 15–60s · trend-aware' },
  { id: 'reels', label: 'Instagram Reels', description: '9:16 · aesthetic · saves' },
  { id: 'youtube_shorts', label: 'YouTube Shorts', description: '9:16 · 30–60s · subscribe' },
  { id: 'youtube_long', label: 'YouTube (long-form)', description: '16:9 · chapters · retention' },
  { id: 'facebook_reels', label: 'Facebook Reels', description: '9:16 · narrative · share' },
] as const;
type PlatformId = typeof PLATFORM_OPTIONS[number]['id'];

interface Beat {
  t: string;
  action: string;
  dialogue?: string;
  on_screen_text?: string;
}

interface HookVariant {
  tier: 'SAFE' | 'BALANCED' | 'SPICY';
  spoken: string;
  visual: string;
  on_screen: string;
}

interface SkitResult {
  hook_line: string;
  hook_variants?: HookVariant[];
  beats: Beat[];
  cta_line: string;
  cta_overlay: string;
  b_roll: string[];
  overlays: string[];
}

const TIER_META: Record<HookVariant['tier'], {
  label: string;
  emoji: string;
  badgeFeatured: string;
  badgeAlt: string;
}> = {
  SAFE: {
    label: 'Safe',
    emoji: '🌱',
    badgeFeatured: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    badgeAlt: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  },
  BALANCED: {
    label: 'Balanced',
    emoji: '⚖️',
    badgeFeatured: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
    badgeAlt: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  },
  SPICY: {
    label: 'Spicy',
    emoji: '🔥',
    badgeFeatured: 'bg-orange-500/15 text-orange-300 border border-orange-500/30',
    badgeAlt: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  },
};

// ============================================================================
// FAQ Data
// ============================================================================

const FAQ_ITEMS = [
  {
    q: 'Is the script generator really free?',
    a: 'Yes. You get 3 scripts per day without signing up. Create a free account for 5 daily scripts, or upgrade for unlimited access plus audience personas, winner pattern analysis, and all 5 platform profiles.',
  },
  {
    q: 'Does it work for TikTok and Instagram Reels?',
    a: 'Yes. Pick the platform from the platform selector and the AI optimizes hook length, pacing, captions, and CTAs for that platform. TikTok hooks land in the first 1–2 seconds and ride trends; Reels hooks lean into a tighter aesthetic and saves; YouTube Shorts skews slightly longer with subscribe-driven CTAs.',
  },
  {
    q: 'Does it support YouTube too?',
    a: 'Yes — YouTube Shorts (9:16) and long-form YouTube (16:9). The long-form profile generates an intro hook, chapter sections, B-roll cues, and a subscribe + bell CTA structure. Pick the right profile for the format you are filming.',
  },
  {
    q: 'Can I use these for TikTok Shop and Amazon UGC videos?',
    a: 'Absolutely. Scripts are TikTok Shop and Amazon UGC compliant by default — no prohibited health claims, no fake urgency, no celebrity impersonation. The "Safe" tone mode adds an extra layer of brand-safety.',
  },
  {
    q: 'How do the persona presets work?',
    a: 'Each persona has its own voice, humor style, and delivery. The "Skeptical Reviewer" writes honest, analytical content. The "Gen-Z Trendsetter" uses current slang and pop culture. Pick whoever fits your brand on the platform you are creating for.',
  },
  {
    q: 'Can I edit the generated scripts?',
    a: 'The scripts are yours to use and modify however you like. Copy them, tweak the wording, combine beats from different generations — whatever works for your content. For advanced editing like versioning and team collaboration, sign up for the full platform.',
  },
  {
    q: 'What types of products work best?',
    a: "The generator works for any product or topic you'd publish about: beauty, supplements, gadgets, food, fashion, home goods, digital products, services, business owners showcasing their work, and more. Just describe what you're talking about and the AI figures out the best angle for your chosen platform.",
  },
];

// ============================================================================
// Component
// ============================================================================

export default function ScriptGeneratorPage() {
  // Form state
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState('BALANCED');
  // Default to TikTok since that's our largest user segment, but visitors
  // can switch in 1 tap. The API uses this to swap the generation prompt.
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>('tiktok');

  // Generation state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [result, setResult] = useState<SkitResult | null>(null);
  const [featuredTier, setFeaturedTier] = useState<HookVariant['tier']>('BALANCED');
  const [score, setScore] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);

  const personas = PERSONAS.filter((p) => FEATURED_PERSONAS.includes(p.id));

  const handleGenerate = async () => {
    if (!productName.trim()) return;

    setLoading(true);
    setError('');
    setErrorDetails('');
    setResult(null);
    setScore(null);
    setShowSignup(false);

    try {
      const res = await fetch('/api/public/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName.trim(),
          product_description: productDescription.trim() || undefined,
          persona_id: selectedPersona || undefined,
          risk_tier: selectedTone,
          platform: selectedPlatform,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.signup) {
          setShowSignup(true);
          setError(data.error);
          setErrorDetails('');
        } else if (data.upgrade) {
          setError(data.error);
          setErrorDetails('');
        } else {
          // Determine error details based on error type
          const errorMessage = data.error || 'Generation failed';
          setError(errorMessage);

          let details = 'An unexpected error occurred. If this persists, please contact support.';

          if (errorMessage.toLowerCase().includes('timeout')) {
            details = 'The AI took too long to respond. This usually means high server load. Please try again in a moment.';
          } else if (errorMessage.toLowerCase().includes('incomplete') || errorMessage.toLowerCase().includes('validation')) {
            details = 'The AI generated an incomplete response. Try adjusting your product description or using a different tone.';
          } else if (res.status === 429) {
            details = 'Too many requests detected. Please wait a moment before trying again.';
          } else if (errorMessage.toLowerCase().includes('failed to generate any skit variations')) {
            details = 'The script generation service encountered an error. This is usually temporary - please try again.';
          } else if (res.status >= 500) {
            details = 'The script generation service encountered an error. This is usually temporary - please try again.';
          }

          setErrorDetails(details);
        }
        return;
      }

      setResult(data.skit);
      setFeaturedTier((selectedTone as HookVariant['tier']) || 'BALANCED');
      setScore(data.score);
      if (data.generationsRemaining !== undefined) {
        setRemaining(data.generationsRemaining);
      }

      // Scroll to result
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
      setErrorDetails('Unable to reach the server. Check your internet connection and firewall settings.');
    } finally {
      setLoading(false);
    }
  };

  const copyScript = () => {
    if (!result) return;
    const featured = result.hook_variants?.find((v) => v.tier === featuredTier)
      || result.hook_variants?.[0];
    const lines: string[] = [];
    if (featured) {
      lines.push(`HOOK (${featured.tier})`);
      lines.push(`  SAY: "${featured.spoken}"`);
      if (featured.visual) lines.push(`  DO: ${featured.visual}`);
      if (featured.on_screen) lines.push(`  ON SCREEN: ${featured.on_screen}`);
    } else {
      lines.push(`HOOK: ${result.hook_line}`);
    }
    lines.push('');
    for (const beat of result.beats) {
      lines.push(`[${beat.t}] ${beat.action}`);
      if (beat.dialogue) lines.push(`  "${beat.dialogue}"`);
      if (beat.on_screen_text) lines.push(`  ON SCREEN: ${beat.on_screen_text}`);
      lines.push('');
    }
    lines.push(`CTA: ${result.cta_line}`);
    if (result.cta_overlay) lines.push(`CTA OVERLAY: ${result.cta_overlay}`);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scoreColor =
    score && score >= 8
      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : score && score >= 6
      ? 'text-teal-400 border-teal-500/30 bg-teal-500/10'
      : score && score >= 4
      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      : 'text-zinc-400 border-white/10 bg-white/5';

  return (
    <>
      {/* JSON-LD FAQ Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ_ITEMS.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.a,
              },
            })),
          }),
        }}
      />

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-400 mb-6">
            <Sparkles size={12} />
            Free Script Generator · TikTok · Reels · YouTube
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Write short-form scripts{' '}
            <span className="bg-gradient-to-r from-teal-400 via-violet-400 to-teal-400 bg-clip-text text-transparent">
              that actually convert
            </span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            Pick a platform, pick a creator persona, describe what you&apos;re talking about,
            and get a ready-to-film script optimized for the platform you&apos;re posting on.
          </p>
        </div>

        {/* ================================================================ */}
        {/* PLATFORM PICKER — sits above the numbered steps because it changes
             the entire generation strategy (hook length, captions, CTA). */}
        {/* ================================================================ */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-300 mb-3">
            I&apos;m posting on…
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {PLATFORM_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlatform(p.id)}
                aria-pressed={selectedPlatform === p.id}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedPlatform === p.id
                    ? 'border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30'
                    : 'border-white/10 bg-zinc-900/50 hover:border-white/20'
                }`}
              >
                <div className="text-sm font-medium text-zinc-200">{p.label}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{p.description}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            The AI changes hook length, pacing, captions, and CTA style for the platform you pick.
          </p>
        </div>

        {/* ================================================================ */}
        {/* STEP 1: Product Input */}
        {/* ================================================================ */}
        <div className="space-y-8 mb-8">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold mr-2">
                1
              </span>
              What are you talking about?
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Matcha Energy Powder, LED Face Mask, Magnetic Phone Mount..."
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-base"
              maxLength={100}
            />
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('product-desc');
                  if (el) el.classList.toggle('hidden');
                }}
                className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors flex items-center gap-1"
              >
                <ChevronDown size={12} />
                Add description (optional)
              </button>
              <textarea
                id="product-desc"
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="Key features, benefits, target audience... helps the AI write a better script"
                className="hidden w-full mt-2 px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-sm resize-none"
                rows={3}
                maxLength={500}
              />
            </div>
          </div>

          {/* ================================================================ */}
          {/* STEP 2: Persona Selection */}
          {/* ================================================================ */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold mr-2">
                2
              </span>
              Pick a creator persona
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {personas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPersona(selectedPersona === p.id ? null : p.id)}
                  className={`relative p-3 rounded-xl border text-left transition-all ${
                    selectedPersona === p.id
                      ? 'border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30'
                      : 'border-white/10 bg-zinc-900/50 hover:border-white/20 hover:bg-zinc-900'
                  }`}
                >
                  <div className="text-sm font-medium text-zinc-200 mb-1 leading-tight">
                    {p.name}
                  </div>
                  <div className="text-xs text-zinc-500 line-clamp-2">{p.description}</div>
                  {selectedPersona === p.id && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-violet-500" />
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              Optional — skip to use a generic narrator voice.{' '}
              <Link href="/login?mode=signup" className="text-violet-400 hover:text-violet-300">
                Sign up free for all 20+ personas
              </Link>
            </p>
          </div>

          {/* ================================================================ */}
          {/* STEP 3: Tone Selection */}
          {/* ================================================================ */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold mr-2">
                3
              </span>
              Choose your tone
            </label>
            <div className="flex gap-3">
              {TONE_OPTIONS.map((tone) => (
                <button
                  key={tone.id}
                  type="button"
                  onClick={() => setSelectedTone(tone.id)}
                  className={`flex-1 p-3 rounded-xl border text-center transition-all ${
                    selectedTone === tone.id
                      ? tone.color === 'emerald'
                        ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                        : tone.color === 'blue'
                        ? 'border-teal-500/50 bg-teal-500/10 ring-1 ring-teal-500/30'
                        : 'border-orange-500/50 bg-orange-500/10 ring-1 ring-orange-500/30'
                      : 'border-white/10 bg-zinc-900/50 hover:border-white/20'
                  }`}
                >
                  <div className="text-sm font-medium text-zinc-200">{tone.label}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{tone.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* Generate Button */}
        {/* ================================================================ */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !productName.trim()}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-teal-600 text-white font-semibold text-lg hover:from-violet-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Writing your script...
            </>
          ) : (
            <>
              <Sparkles size={20} />
              Write My Script
            </>
          )}
        </button>

        {remaining !== null && remaining >= 0 && (
          <p className={`text-center text-xs mt-2 ${
            remaining === 0 ? 'text-red-400' : remaining <= 1 ? 'text-amber-400' : 'text-zinc-500'
          }`}>
            {remaining === 0 ? (
              <>
                Daily limit reached.{' '}
                <Link href="/login?mode=signup" className="underline hover:text-amber-300 font-medium">
                  Sign up free for 5 daily generations
                </Link>
              </>
            ) : (
              <>
                {remaining} generation{remaining !== 1 ? 's' : ''} remaining today
                {remaining <= 1 && (
                  <>
                    {' '}&mdash;{' '}
                    <Link href="/login?mode=signup" className="underline hover:text-amber-300 font-medium">
                      Sign up for more
                    </Link>
                  </>
                )}
              </>
            )}
          </p>
        )}

        {/* ================================================================ */}
        {/* Error / Signup Prompt */}
        {/* ================================================================ */}
        {error && (
          <div className="mt-6 p-4 rounded-xl border border-red-500/20 bg-red-500/5">
            <p className="text-red-400 text-sm font-medium">{error}</p>
            {errorDetails && (
              <p className="text-zinc-400 text-sm mt-2">{errorDetails}</p>
            )}
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              {!showSignup && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading || !productName.trim()}
                  className="bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Try Again
                </button>
              )}
              {showSignup && (
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center gap-1 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Create free account for 5 daily generations
                  <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* Result Display */}
        {/* ================================================================ */}
        {result && (
          <div ref={resultRef} className="mt-8 space-y-4">
            {/* Header with score + copy */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-zinc-200">Your Script</h2>
                {score !== null && (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium ${scoreColor}`}
                  >
                    {score}/10
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/login?mode=signup"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-sm text-violet-400 hover:bg-violet-500/20 transition-colors"
                >
                  <Bookmark size={14} />
                  Save
                </Link>
                <button
                  type="button"
                  onClick={copyScript}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Script Card */}
            <div className="rounded-xl border border-white/10 bg-zinc-900/80 overflow-hidden">
              {/* Hook — featured variant */}
              {(() => {
                const variants = result.hook_variants && result.hook_variants.length > 0
                  ? result.hook_variants
                  : [{ tier: 'BALANCED' as const, spoken: result.hook_line, visual: '', on_screen: '' }];
                const featured = variants.find((v) => v.tier === featuredTier) || variants[0];
                const alternates = variants.filter((v) => v.tier !== featured.tier);
                const meta = TIER_META[featured.tier];
                return (
                  <>
                    <div className="p-5 bg-gradient-to-r from-violet-500/15 to-teal-500/15 border-b border-white/10">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">
                            Hook
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${meta.badgeFeatured}`}>
                            {meta.emoji} {meta.label}
                          </span>
                        </div>
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-white leading-snug mb-3">
                        &ldquo;{featured.spoken}&rdquo;
                      </p>
                      {featured.visual && (
                        <div className="text-xs text-zinc-400 mb-1">
                          <span className="text-violet-400 font-semibold uppercase tracking-wider">Visual:</span>{' '}
                          {featured.visual}
                        </div>
                      )}
                      {featured.on_screen && (
                        <div className="text-xs text-teal-300 font-medium">
                          <span className="text-teal-400 uppercase tracking-wider">On screen:</span>{' '}
                          {featured.on_screen}
                        </div>
                      )}
                    </div>

                    {/* Alternative hooks */}
                    {alternates.length > 0 && (
                      <div className="px-4 py-3 bg-zinc-950/60 border-b border-white/5">
                        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                          Alternative hooks — click to swap in
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {alternates.map((v) => {
                            const m = TIER_META[v.tier];
                            return (
                              <button
                                key={v.tier}
                                type="button"
                                onClick={() => setFeaturedTier(v.tier)}
                                className="text-left p-3 rounded-lg border border-white/10 bg-zinc-900/60 hover:border-white/30 hover:bg-zinc-900 transition-colors group"
                              >
                                <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider mb-1.5 ${m.badgeAlt}`}>
                                  {m.emoji} {m.label}
                                </div>
                                <p className="text-sm text-zinc-200 font-medium leading-snug group-hover:text-white">
                                  &ldquo;{v.spoken}&rdquo;
                                </p>
                                {v.on_screen && (
                                  <p className="text-[10px] text-zinc-500 mt-1 line-clamp-1">
                                    On screen: {v.on_screen}
                                  </p>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Beats */}
              <div className="divide-y divide-white/5">
                {result.beats.map((beat, i) => (
                  <div key={i} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded bg-zinc-800 text-xs font-mono text-zinc-500">
                        {beat.t}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-400 mb-1">{beat.action}</p>
                        {beat.dialogue && (
                          <p className="text-sm text-zinc-200">
                            &ldquo;{beat.dialogue}&rdquo;
                          </p>
                        )}
                        {beat.on_screen_text && (
                          <p className="text-xs text-teal-400 mt-1 font-medium">
                            ON SCREEN: {beat.on_screen_text}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="p-4 bg-zinc-800/50 border-t border-white/10">
                <div className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-1">
                  Call to Action
                </div>
                <p className="text-sm text-zinc-200">&ldquo;{result.cta_line}&rdquo;</p>
                {result.cta_overlay && (
                  <p className="text-xs text-zinc-500 mt-1">Overlay: {result.cta_overlay}</p>
                )}
              </div>
            </div>

            {/* B-Roll Suggestions */}
            {result.b_roll?.length > 0 && (
              <div className="p-4 rounded-xl border border-white/5 bg-zinc-900/30">
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                  B-Roll Suggestions
                </div>
                <ul className="space-y-1">
                  {result.b_roll.map((shot, i) => (
                    <li key={i} className="text-sm text-zinc-400 flex items-start gap-2">
                      <span className="text-zinc-600 shrink-0">-</span>
                      {shot}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Conversion CTA */}
            <div className="rounded-2xl border border-teal-500/20 bg-gradient-to-br from-teal-500/8 to-emerald-500/5 p-6">
              <h3 className="text-base font-bold text-white mb-1">
                This is the free version. The full platform is different.
              </h3>
              <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
                Free account unlocks: <span className="text-zinc-200">5 scripts/day</span> · <span className="text-zinc-200">20+ creator personas</span> · <span className="text-zinc-200">Winners Bank</span> (see which hooks are converting right now) · <span className="text-zinc-200">production pipeline</span> to track every video from script to posted.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold text-sm hover:from-teal-400 hover:to-emerald-400 transition-all shadow-lg shadow-teal-500/20"
                >
                  Start Free — No Card Needed
                  <ArrowRight size={14} />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setScore(null);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl border border-white/10 text-zinc-300 font-medium text-sm hover:bg-white/5 transition-colors"
                >
                  Write Another
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SEO Content Section */}
        {/* ================================================================ */}
        <section className="mt-24 space-y-16">
          {/* What is this tool */}
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              The fastest way to write TikTok scripts
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              Stop staring at a blank screen. Get a full TikTok script in seconds — hook,
              dialogue, b-roll notes, and CTA included. Built for TikTok Shop creators
              who need to post consistently.
            </p>
          </div>

          {/* How it works */}
          <div>
            <h3 className="text-xl font-semibold text-zinc-200 mb-6 text-center">
              How it works
            </h3>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                {
                  step: '1',
                  title: 'Describe your product',
                  desc: 'Enter your product name and optionally add key details. Works for any product category.',
                },
                {
                  step: '2',
                  title: 'Choose your style',
                  desc: 'Pick a creator persona and tone. Each persona has a unique voice — from skeptical reviewer to chaotic comedy.',
                },
                {
                  step: '3',
                  title: 'Get your script',
                  desc: 'Receive a ready-to-film script with hook, beats, dialogue, and CTA. Copy it and start recording.',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="p-5 rounded-xl border border-white/5 bg-zinc-900/30"
                >
                  <div className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-400 text-sm font-bold flex items-center justify-center mb-3">
                    {item.step}
                  </div>
                  <h4 className="text-sm font-semibold text-zinc-200 mb-1">{item.title}</h4>
                  <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Benefits grid */}
          <div>
            <h3 className="text-xl font-semibold text-zinc-200 mb-6 text-center">
              Why creators use FlashFlow
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                {
                  title: 'TikTok Shop compliant',
                  desc: 'Every script avoids prohibited claims. No health promises, no fake urgency. Safe for monetized content.',
                },
                {
                  title: '20+ creator personas',
                  desc: 'From Gen-Z trendsetter to trusted expert advisor. Each persona writes with a distinct voice and style.',
                },
                {
                  title: 'Hooks that actually stop the scroll',
                  desc: 'Every script leads with a strong opener in the first 1-2 seconds — the part that decides if someone keeps watching.',
                },
                {
                  title: 'Beat-by-beat structure',
                  desc: 'Not just dialogue — you get timing, visual directions, on-screen text, and b-roll suggestions.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-5 rounded-xl border border-white/5 bg-zinc-900/30"
                >
                  <h4 className="text-sm font-semibold text-zinc-200 mb-1">{item.title}</h4>
                  <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div>
            <h3 className="text-xl font-semibold text-zinc-200 mb-6 text-center">
              Frequently asked questions
            </h3>
            <div className="max-w-2xl mx-auto space-y-3">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="border-b border-white/5 pb-3">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between text-left py-2"
                  >
                    <span className="text-sm font-medium text-zinc-300">{item.q}</span>
                    <ChevronDown
                      size={16}
                      className={`shrink-0 ml-2 text-zinc-500 transition-transform ${
                        openFaq === i ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaq === i && (
                    <p className="text-sm text-zinc-500 leading-relaxed pb-2">{item.a}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Final CTA */}
          <div className="text-center py-8">
            <h3 className="text-2xl font-bold text-zinc-200 mb-3">
              Stop writing scripts from scratch
            </h3>
            <p className="text-zinc-400 mb-6 max-w-lg mx-auto">
              FlashFlow creators generate 10x more content. Free plan includes 5 scripts/day,
              20+ persona voices, and a script library. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-zinc-900 font-semibold text-lg hover:bg-zinc-100 transition-colors"
              >
                Create Free Account
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-white/10 text-zinc-300 font-medium text-base hover:bg-white/5 transition-colors"
              >
                View Pricing
              </Link>
            </div>
            <p className="text-xs text-zinc-600 mt-4">
              Also try our{' '}
              <Link href="/transcribe" className="text-teal-400 hover:text-teal-300">Free TikTok Transcriber</Link>
              {' '}and{' '}
              <Link href="/youtube-transcribe" className="text-teal-400 hover:text-teal-300">YouTube Transcriber</Link>
              {' '}&mdash; no signup needed.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
