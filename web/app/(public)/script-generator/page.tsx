'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { PERSONAS } from '@/lib/personas';
import { Copy, Check, Sparkles, ArrowRight, ChevronDown, Loader2 } from 'lucide-react';

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

interface Beat {
  t: string;
  action: string;
  dialogue?: string;
  on_screen_text?: string;
}

interface SkitResult {
  hook_line: string;
  beats: Beat[];
  cta_line: string;
  cta_overlay: string;
  b_roll: string[];
  overlays: string[];
}

// ============================================================================
// FAQ Data
// ============================================================================

const FAQ_ITEMS = [
  {
    q: 'Is the TikTok script generator really free?',
    a: 'Yes! You can generate up to 3 scripts per day without signing up. Create a free account for 5 daily generations, or upgrade for unlimited access plus advanced features like audience personas and winner pattern analysis.',
  },
  {
    q: 'What makes these scripts optimized for TikTok?',
    a: 'Every script follows proven TikTok patterns: scroll-stopping hooks in the first 1-2 seconds, punchy 15-30 second pacing, natural product integration, and clear CTAs. Our AI is trained on viral TikTok formats and adapts to each persona\'s style.',
  },
  {
    q: 'Can I use these scripts for TikTok Shop videos?',
    a: 'Absolutely. All generated scripts are TikTok Shop compliant — no prohibited health claims, no fake urgency tactics, no celebrity imitation. The "Safe" tone mode is specifically designed for brand-safe TikTok Shop content.',
  },
  {
    q: 'How do the persona presets work?',
    a: 'Each persona has a distinct voice, humor style, and delivery approach. For example, the "Skeptical Reviewer" writes analytical, honest content while the "Gen-Z Trendsetter" uses current slang and pop culture references. The AI adapts its writing to match whichever persona you choose.',
  },
  {
    q: 'Can I edit the generated scripts?',
    a: 'The scripts are yours to use and modify however you like. Copy them, tweak the wording, combine beats from different generations — whatever works for your content. For advanced editing features like versioning and team collaboration, check out the full platform.',
  },
  {
    q: 'What types of products work best?',
    a: 'The generator works for any product you\'d promote on TikTok: beauty, supplements, gadgets, food, fashion, home goods, digital products, and more. Just describe what you\'re selling and the AI figures out the best angle.',
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

  // Generation state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SkitResult | null>(null);
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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.signup) {
          setShowSignup(true);
          setError(data.error);
        } else if (data.upgrade) {
          setError(data.error);
        } else {
          setError(data.error || 'Generation failed');
        }
        return;
      }

      setResult(data.skit);
      setScore(data.score);
      if (data.generationsRemaining !== undefined) {
        setRemaining(data.generationsRemaining);
      }

      // Scroll to result
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyScript = () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`HOOK: ${result.hook_line}`);
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
      ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
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
            Free TikTok Script Generator
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Generate viral TikTok scripts{' '}
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-blue-400 bg-clip-text text-transparent">
              in seconds
            </span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            AI-powered script generator built for TikTok Shop creators. Choose a persona, describe
            your product, and get a scroll-stopping script instantly.
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
              What are you selling?
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
              <Link href="/signup" className="text-violet-400 hover:text-violet-300">
                Sign up for 20 personas
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
                        ? 'border-blue-500/50 bg-blue-500/10 ring-1 ring-blue-500/30'
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
          className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold text-lg hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Generating your script...
            </>
          ) : (
            <>
              <Sparkles size={20} />
              Generate TikTok Script
            </>
          )}
        </button>

        {remaining !== null && remaining >= 0 && (
          <p className="text-center text-xs text-zinc-600 mt-2">
            {remaining} generation{remaining !== 1 ? 's' : ''} remaining today
          </p>
        )}

        {/* ================================================================ */}
        {/* Error / Signup Prompt */}
        {/* ================================================================ */}
        {error && (
          <div className="mt-6 p-4 rounded-xl border border-red-500/20 bg-red-500/5">
            <p className="text-red-400 text-sm">{error}</p>
            {showSignup && (
              <Link
                href="/signup"
                className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors"
              >
                Create free account for 5 daily generations
                <ArrowRight size={14} />
              </Link>
            )}
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
              <button
                type="button"
                onClick={copyScript}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {/* Script Card */}
            <div className="rounded-xl border border-white/10 bg-zinc-900/80 overflow-hidden">
              {/* Hook */}
              <div className="p-4 bg-gradient-to-r from-violet-500/10 to-blue-500/10 border-b border-white/10">
                <div className="text-xs font-medium text-violet-400 uppercase tracking-wider mb-1">
                  Hook
                </div>
                <p className="text-lg font-semibold text-zinc-100 leading-snug">
                  &ldquo;{result.hook_line}&rdquo;
                </p>
              </div>

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
                          <p className="text-xs text-blue-400 mt-1 font-medium">
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
            <div className="p-6 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-blue-500/5">
              <h3 className="text-base font-semibold text-zinc-200 mb-2">
                Want more scripts like this?
              </h3>
              <p className="text-sm text-zinc-400 mb-4">
                Unlock 20 persona presets, audience targeting, winner pattern analysis, AI video
                rendering, and unlimited generations.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-white text-zinc-900 font-medium text-sm hover:bg-zinc-100 transition-colors"
                >
                  Start Free Trial
                  <ArrowRight size={14} />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setScore(null);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-white/10 text-zinc-300 font-medium text-sm hover:bg-white/5 transition-colors"
                >
                  Generate Another
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
              Stop staring at a blank screen. Our AI script generator creates scroll-stopping
              TikTok content in seconds — complete with hooks, beat-by-beat dialogue, b-roll
              suggestions, and CTAs. Built specifically for TikTok Shop creators who need to
              produce content at scale.
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
                  desc: 'Enter your product name and optionally add key details. The AI adapts to any product category.',
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
                  title: '20 creator personas',
                  desc: 'From Gen-Z trendsetter to trusted expert advisor. Each persona writes with a distinct voice and style.',
                },
                {
                  title: 'Scroll-stopping hooks',
                  desc: 'The AI prioritizes the first 1-2 seconds. Every script opens with a pattern interrupt designed to stop the scroll.',
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
              Ready to scale your content?
            </h3>
            <p className="text-zinc-400 mb-6 max-w-lg mx-auto">
              Get unlimited scripts, 20 personas, audience intelligence, AI video rendering, and
              more. Start free — no credit card required.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-zinc-900 font-semibold text-lg hover:bg-zinc-100 transition-colors"
            >
              Start Free Trial
              <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
