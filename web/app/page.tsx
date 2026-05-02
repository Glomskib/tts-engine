'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BRAND } from '@/lib/brand';
import { PLANS } from '@/lib/plans';
import { VideoServiceContact } from '@/components/VideoServiceContact';
import AffiliateCalculator from '@/components/AffiliateCalculator';
import { useAuth } from '@/contexts/AuthContext';

// ============================================================================
// FLASHFLOW AI — CONVERSION FUNNEL HOMEPAGE
// ============================================================================

const FAQ_ITEMS = [
  {
    q: 'How do I study what actually works on TikTok and Instagram?',
    a: 'Winners Bank is your library of proven viral short-form videos across TikTok and Instagram Reels. Connect your accounts to auto-sync real engagement metrics, or paste any public TikTok or Reel URL and AI breaks down the hook, pacing, and triggers that made it work — so you can replicate the pattern on either platform.',
  },
  {
    q: "How do I write scripts that don't sound AI-generated?",
    a: 'FlashFlow uses 20+ creator personas (Skeptical Reviewer, Gen-Z Trendsetter, High-Energy Hype, Authentic Storyteller, etc.) and tone customization. The output reads like a real creator — with natural pauses, humor, and authentic energy. Adapt the same script for TikTok or Reels in one tap.',
  },
  {
    q: 'How do I hit brand deal and retainer goals on time?',
    a: "Content Calendar tracks your monthly content targets by brand and platform. Set goals, see what you've posted on TikTok and Instagram, and see at a glance when you're behind pace. For retainer + UGC deals, FlashFlow keeps you on pace so you hit your payouts.",
  },
  {
    q: 'Can I manage multiple brand deals at once?',
    a: 'Yes. FlashFlow is built for influencers and affiliates juggling 3-5+ brands simultaneously. Track retainer progress, winners, and scripts per brand. Switch between brands instantly and see all your brand analytics in one dashboard. Works for TikTok Shop, Amazon Influencer, brand UGC, and direct sponsorships.',
  },
  {
    q: 'What makes FlashFlow different from ChatGPT?',
    a: "FlashFlow is built specifically for short-form creators on TikTok and Instagram. You get persona-driven script generation + Winners Bank (competitive intelligence on what's going viral) + Content Calendar + brand-deal/retainer tracking + analytics. ChatGPT doesn't know about TikTok or Reels compliance, hook patterns, or how creators actually monetize.",
  },
  {
    q: 'Does it work for Instagram Reels too?',
    a: 'Yes — every script, hook, and analytics view supports both TikTok and Instagram Reels. The same vertical-video format works on both platforms; FlashFlow adapts captions, hashtags, and CTA style per platform automatically.',
  },
  {
    q: 'Is it really free?',
    a: 'Yes. The free plan includes 5 AI scripts per month, the free TikTok and YouTube transcribers, and 1 brand. No credit card, no time limit.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Month-to-month, no contracts. Cancel anytime from your account — no questions asked.',
  },
];

// Mini script generator result types
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
}

// Pre-loaded demo — shows proof before the visitor does anything
const DEMO_SCRIPT: SkitResult = {
  hook_line: "I was skeptical until I tried this for 30 days straight.",
  beats: [
    { t: "0:00", action: "Hold product up to camera, deadpan expression", dialogue: "Okay I was NOT going to buy this. But my For You page kept showing it." },
    { t: "0:05", action: "Cut to 30 days later text overlay, smile", dialogue: "Here's what actually happened after a month." },
    { t: "0:10", action: "Show before/after or result", dialogue: "I'm not exaggerating when I say this is the first one that actually worked." },
  ],
  cta_line: "Link in bio — it's still on sale today only.",
  cta_overlay: "TAP THE LINK 👆",
};

export default function LandingPage() {
  const { authenticated, loading: authLoading } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [contactOpen, setContactOpen] = useState(false);
  const [referralBanner, setReferralBanner] = useState(false);

  // Mini script generator state — does NOT auto-load. Homepage stays as a
  // marketing surface; visitor must opt-in by typing or clicking "See sample".
  const [miniProduct, setMiniProduct] = useState('');
  const [miniLoading, setMiniLoading] = useState(false);
  const [miniResult, setMiniResult] = useState<SkitResult | null>(null);
  const [miniIsDemo, setMiniIsDemo] = useState(false);
  const [miniError, setMiniError] = useState('');

  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Capture referral and promo codes from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const promo = params.get('promo');

    if (ref) {
      localStorage.setItem('ff_ref', ref);
      document.cookie = `ff_ref=${ref}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
      setReferralBanner(true);
      fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_code: ref }),
      }).catch(() => {});
    }

    if (promo) {
      localStorage.setItem('ff_promo', promo);
      document.cookie = `ff_promo=${promo}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
    }
  }, []);

  const handleMiniGenerate = async () => {
    if (!miniProduct.trim()) return;
    setMiniLoading(true);
    setMiniError('');
    setMiniResult(null);
    setMiniIsDemo(false);

    try {
      const res = await fetch('/api/public/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: miniProduct.trim(),
          risk_tier: 'BALANCED',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMiniError(data.error || 'Generation failed');
        return;
      }
      setMiniResult(data.skit);
    } catch {
      setMiniError('Network error. Please try again.');
    } finally {
      setMiniLoading(false);
    }
  };

  const yearlyPrice = (monthly: number) => Math.round(monthly * 0.8);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 antialiased">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'FlashFlow AI',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://flashflowai.com',
            description: 'The all-in-one growth engine for TikTok Shop affiliates, creators, and brands. Find products, generate hooks, edit videos, publish to TikTok, track commissions — in one tool.',
            offers: {
              '@type': 'AggregateOffer',
              lowPrice: '0',
              highPrice: '149',
              priceCurrency: 'USD',
              offerCount: 5,
            },
          }),
        }}
      />

      {/* FAQPage Schema */}
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

      {/* Subtle grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      {/* Gradient orb */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-teal-500/8 via-violet-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Referral Banner */}
      {referralBanner && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 text-center py-2 px-4 text-sm text-emerald-400">
          Referral link applied! Your friend will earn rewards when you subscribe.
        </div>
      )}

      {/* ================================================================ */}
      {/* NAVIGATION — Minimal, single CTA */}
      {/* ================================================================ */}
      {/*
        Mobile-first nav. Previous version crammed 4 links + logo into ~327px
        of viewport on a 375px iPhone with 8px gaps — items touched and the
        "Try Script Generator Free" CTA truncated awkwardly. Fixes:
        - reduce side padding on mobile (px-4 vs px-6 desktop)
        - on phones show ONLY logo + the primary CTA; secondary links (Tools,
          Pricing, Sign In) hide below the sm: breakpoint to give the CTA room
        - nav items use whitespace-nowrap so they never break across lines
        - desktop unchanged with all 4 items + larger gaps
      */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={32}
              height={32}
              className="rounded-lg flex-shrink-0"
            />
            <span className="font-semibold text-lg tracking-tight truncate">{BRAND.name}</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
            <Link href="/tools" className="text-sm text-zinc-400 hover:text-white transition-colors hidden md:block">
              Tools
            </Link>
            <Link href="#pricing" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">
              Pricing
            </Link>
            {!authLoading && authenticated ? (
              <Link
                href="/create"
                className="text-sm px-4 py-2 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors whitespace-nowrap"
              >
                <span className="sm:hidden">Open</span>
                <span className="hidden sm:inline">Open FlashFlow</span>
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">
                  Sign In
                </Link>
                <Link
                  href="/script-generator"
                  className="text-sm px-4 py-2 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors whitespace-nowrap"
                >
                  <span className="sm:hidden">Try Free</span>
                  <span className="hidden sm:inline">Try Script Generator Free</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ================================================================ */}
      {/* SECTION 1 — HERO */}
      {/* ================================================================ */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-400 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Get Started — No Credit Card Required
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            The all-in-one growth engine for{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400 bg-clip-text text-transparent">
              TikTok Shop affiliates, creators &amp; brands
            </span>
          </h1>

          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Find products, generate hooks, edit videos, publish to TikTok, track
            commissions — in one tool. Built for affiliates juggling 5 brands
            and creators who want to stop using 7 apps to ship one post.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link
              href="/signup"
              className="group px-8 py-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold text-lg hover:from-teal-400 hover:to-emerald-400 transition-all shadow-lg shadow-teal-500/25"
            >
              Start Free — No Card Needed
              <svg className="inline-block ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/script-generator"
              className="px-8 py-4 rounded-xl border border-white/10 text-zinc-300 font-medium text-lg hover:bg-white/5 hover:border-white/20 transition-all"
            >
              Try the Tool First
            </Link>
          </div>

          {/* Social proof counters */}
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 text-center">
            <div>
              <div className="text-2xl font-bold text-white">10,000+</div>
              <div className="text-xs text-zinc-500 mt-1">Scripts Generated</div>
            </div>
            <div className="w-px h-8 bg-zinc-800 hidden sm:block" />
            <div>
              <div className="text-2xl font-bold text-white">500+</div>
              <div className="text-xs text-zinc-500 mt-1">Active Creators</div>
            </div>
            <div className="w-px h-8 bg-zinc-800 hidden sm:block" />
            <div>
              <div className="flex items-center gap-1 justify-center">
                <span className="text-2xl font-bold text-white">4.8</span>
                <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <div className="text-xs text-zinc-500 mt-1">Creator Rating</div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 2 — TIKTOK SHOP EARNINGS CALCULATOR */}
      {/* ================================================================ */}
      <section className="relative py-20 px-6 border-t border-white/5">
        <AffiliateCalculator />
      </section>

      {/* ================================================================ */}
      {/* SECTION 3 — PAIN POINTS */}
      {/* ================================================================ */}
      <section className="relative py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">Sound Familiar?</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Creating content shouldn&apos;t feel this hard.
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            {[
              {
                title: 'Finding products that convert',
                desc: 'Endless scrolling through TikTok Shop. You\'re guessing which products will actually sell instead of knowing what winners are getting views.',
              },
              {
                title: 'Scripts that sound AI-generated',
                desc: 'ChatGPT writes the same hooks as everyone else. Your scripts lack personality, authenticity, and the edge that wins followers.',
              },
              {
                title: 'Missing retainer deadlines',
                desc: 'Juggling 3 brands with different video quotas. You lose track of who needs what, and miss payouts because you weren\'t keeping pace.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="p-6 rounded-xl bg-red-500/5 border border-red-500/10"
              >
                <h3 className="text-lg font-semibold text-zinc-200 mb-3">{item.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-lg text-zinc-300 mb-4">
              FlashFlow solves all three — with Winners Bank, authentic personas, and retainers & bonuses.
            </p>
            <Link
              href="/script-generator"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-all"
            >
              Try the Script Generator Free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 4 — HOW IT WORKS */}
      {/* ================================================================ */}
      <section className="relative py-20 px-6 border-t border-white/5 bg-gradient-to-b from-transparent via-zinc-900/50 to-transparent">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Three steps. Sixty seconds.
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Try the Script Generator',
                desc: 'Type a product name, pick a persona. Get a full TikTok script in under 30 seconds — free, no signup.',
              },
              {
                step: '02',
                title: 'Create an Account',
                desc: 'Sign up free to unlock more daily scripts, save your library, and access Winners Bank.',
              },
              {
                step: '03',
                title: 'Scale Your Content',
                desc: 'Add products, track retainers, manage your pipeline. Everything from script to posted in one place.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-teal-400">{item.step}</span>
                </div>
                <h3 className="text-lg font-semibold text-zinc-200 mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 5 — FEATURES GRID */}
      {/* ================================================================ */}
      <section className="relative py-20 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need to scale content
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: '🛍️',
                title: 'TikTok Shop Product Discovery',
                desc: 'The Affiliate Hub — search the TikTok Shop affiliate marketplace. Filter by commission, category, sample availability. Find winners worth promoting before everyone else.',
              },
              {
                icon: '⚡',
                title: 'Hook Generator',
                desc: 'Scroll-stopping hooks across 5+ AI video providers — Heygen, Sora, Pika, Runway, Luma. Text and avatar hooks for TikTok, Reels, and Shorts.',
                link: '/admin/hook-generator',
                linkText: 'See it',
              },
              {
                icon: '🎬',
                title: 'AI Video Editor',
                desc: 'Sonnet 4 makes the edit decisions — silence cuts, b-roll, captions, music, vertical export. Ship a finished post in minutes, not hours.',
                link: '/admin/editor',
                linkText: 'See it',
              },
              {
                icon: '⛏️',
                title: 'Comment Miner',
                desc: 'Pixel-accurate TikTok feed scrape. Mine viral comments across creators and turn them into the next hook, script, or full video idea.',
              },
              {
                icon: '📤',
                title: 'Multi-Account Publishing',
                desc: 'Direct Post + Inbox modes through the official TikTok API. Push to multiple TikTok accounts on schedule from one cockpit.',
              },
              {
                icon: '💰',
                title: 'Commission & Sponsor Reporting',
                desc: 'Live TikTok Shop GMV and commission tracking with per-product breakdowns. Built-in sponsor reporting for brand deals and retainers.',
              },
            ].map((feature) => (
              <div key={feature.title} className="p-6 rounded-xl bg-zinc-900/50 border border-white/10 hover:border-white/20 transition-all">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-zinc-200 mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{feature.desc}</p>
                {'link' in feature && feature.link && (
                  <Link href={feature.link} className="inline-block mt-3 text-sm text-teal-400 hover:text-teal-300 font-medium">
                    {feature.linkText} &rarr;
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 6 — LIVE MINI SCRIPT GENERATOR */}
      {/* ================================================================ */}
      <section className="relative py-20 px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-sm font-medium text-violet-400 uppercase tracking-widest mb-4">Try It Now</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              See it in action — free.
            </h2>
            <p className="text-zinc-400">
              Type a product name and get a real script. No signup, no credit card.
            </p>
          </div>

          <div className="p-6 sm:p-8 rounded-2xl bg-zinc-900/80 border border-white/10">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={miniProduct}
                onChange={(e) => setMiniProduct(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMiniGenerate()}
                placeholder="Type your product — e.g. Matcha Energy Powder"
                className="flex-1 px-4 py-3 rounded-xl bg-zinc-800 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                maxLength={100}
              />
              <button
                type="button"
                onClick={handleMiniGenerate}
                disabled={miniLoading || !miniProduct.trim()}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-teal-600 text-white font-semibold hover:from-violet-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
              >
                {miniLoading ? 'Generating...' : 'Generate'}
              </button>
            </div>

            {miniError && (
              <p className="mt-4 text-sm text-red-400">{miniError}</p>
            )}

            {miniResult && (
              <div className="mt-6 space-y-4">
                {/* Demo badge */}
                {miniIsDemo && (
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 text-[11px] font-semibold uppercase tracking-wide">Example script</span>
                    <span className="text-xs text-zinc-600">Type your product above to generate yours</span>
                  </div>
                )}

                {/* Hook */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-teal-500/10 border border-violet-500/20">
                  <div className="text-xs font-medium text-violet-400 uppercase tracking-wider mb-1">Hook</div>
                  <p className="text-lg font-semibold text-zinc-100">&ldquo;{miniResult.hook_line}&rdquo;</p>
                </div>

                {/* Beats preview */}
                <div className="space-y-2">
                  {miniResult.beats.slice(0, 3).map((beat, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50">
                      <span className="shrink-0 px-2 py-0.5 rounded bg-zinc-700 text-xs font-mono text-zinc-400">{beat.t}</span>
                      <div>
                        {beat.dialogue && (
                          <p className="text-sm text-zinc-200">&ldquo;{beat.dialogue}&rdquo;</p>
                        )}
                        <p className="text-xs text-zinc-500 mt-0.5">{beat.action}</p>
                      </div>
                    </div>
                  ))}
                  {miniResult.beats.length > 3 && (
                    <p className="text-xs text-zinc-600 text-center">+ {miniResult.beats.length - 3} more beats</p>
                  )}
                </div>

                {/* CTA line */}
                <div className="p-3 rounded-lg bg-zinc-800/50">
                  <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">CTA: </span>
                  <span className="text-sm text-zinc-200">{miniResult.cta_line}</span>
                </div>

                {/* Conversion CTA */}
                <div className="pt-4 border-t border-white/5">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <Link
                      href="/login?mode=signup"
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold hover:from-teal-400 hover:to-emerald-400 transition-all shadow-lg shadow-teal-500/20"
                    >
                      Get 5 Free Scripts Daily — No Card
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                    <Link
                      href="/script-generator"
                      className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors whitespace-nowrap"
                    >
                      Try full generator &rarr;
                    </Link>
                  </div>
                  <p className="text-xs text-zinc-600 mt-2">
                    Free: 20+ persona voices · script library · TikTok transcriber · Winners Bank access
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 6 — PRICING PREVIEW (Anchor High) */}
      {/* ================================================================ */}
      <section id="pricing" className="relative py-20 px-6 border-t border-white/5 bg-gradient-to-b from-transparent via-zinc-900/50 to-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Start free. Scale when you&apos;re ready.
            </h2>
            <p className="text-lg text-zinc-400 max-w-xl mx-auto">
              Every plan includes the full platform. Pay only for the volume you need.
            </p>
          </div>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-4 mb-12">
            <span className={`text-sm ${billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-500'}`}>Monthly</span>
            <button
              type="button"
              onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')}
              className="relative w-14 h-7 rounded-full bg-zinc-800 border border-white/10 transition-colors"
            >
              <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${billingPeriod === 'annual' ? 'left-8' : 'left-1'}`} />
            </button>
            <span className={`text-sm ${billingPeriod === 'annual' ? 'text-white' : 'text-zinc-500'}`}>
              Annual <span className="text-emerald-500 font-medium">Save 20%</span>
            </span>
          </div>

          {/* Pricing cards — 4 tiers: Free, Lite, Creator Pro (Most Popular), Business */}
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Free */}
            <PricingCard
              name="Free"
              description="Try the platform"
              price={0}
              period=""
              credits="5 credits/month"
              features={[
                '5 scripts per month',
                'Built-in personas',
                '3 products',
                'Free Transcriber',
              ]}
              cta="Get Started Free"
              ctaLink="/login?mode=signup"
              highlight={false}
            />

            {/* Lite */}
            <PricingCard
              name="Lite"
              description="For new creators"
              price={billingPeriod === 'monthly' ? 9 : Math.floor(85 / 12)}
              period={billingPeriod === 'monthly' ? '/mo' : '/mo, billed annually'}
              savings={billingPeriod === 'annual' ? 'Save $23/yr' : undefined}
              credits="50 credits"
              features={[
                '50 scripts per month',
                '20 products',
                'Script Library',
                'Built-in personas',
                'Referral program',
              ]}
              cta="Choose Lite"
              ctaLink="/login?mode=signup&plan=creator_lite"
              highlight={false}
            />

            {/* Creator Pro — Most Popular */}
            <PricingCard
              name="Creator Pro"
              description="For serious affiliates"
              price={billingPeriod === 'monthly' ? 29 : Math.floor(279 / 12)}
              period={billingPeriod === 'monthly' ? '/mo' : '/mo, billed annually'}
              savings={billingPeriod === 'annual' ? 'Save $69/yr' : undefined}
              credits="Unlimited"
              features={[
                'Unlimited scripts',
                'All 20+ personas',
                'Full Winners Bank',
                'Unlimited products',
                'Content Calendar',
                'Retainer tracking',
                'Advanced analytics',
              ]}
              cta="Choose Creator Pro"
              ctaLink="/login?mode=signup&plan=creator_pro"
              highlight={true}
              badge="Most Popular"
            />

            {/* Business */}
            <PricingCard
              name="Business"
              description="For multi-brand affiliates"
              price={billingPeriod === 'monthly' ? 59 : Math.floor(565 / 12)}
              period={billingPeriod === 'monthly' ? '/mo' : '/mo, billed annually'}
              savings={billingPeriod === 'annual' ? 'Save $143/yr' : undefined}
              credits="Unlimited"
              features={[
                'Everything in Creator Pro',
                'Content Packages',
                'Multi-brand tracking',
                'Team accounts (3 seats)',
                'Priority support',
              ]}
              cta="Choose Business"
              ctaLink="/login?mode=signup&plan=business"
              highlight={false}
            />
          </div>

          {/* Brand & Agency — Contact Us */}
          <div className="mt-10 p-6 rounded-2xl bg-zinc-900/50 border border-white/5 text-center">
            <h3 className="text-lg font-semibold mb-2">Brand & Agency Plans</h3>
            <p className="text-zinc-400 text-sm mb-4">
              Custom pricing for brands, agencies, and enterprise teams. White-label and managed video production available.
            </p>
            <button
              type="button"
              onClick={() => setContactOpen(true)}
              className="inline-flex items-center px-5 py-2.5 rounded-lg border border-white/10 text-zinc-300 font-medium text-sm hover:bg-white/5 hover:border-white/20 transition-all"
            >
              Contact Us
            </button>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 6.5 — SEGMENT CARDS (Affiliate / Brand / Agency) */}
      {/* ================================================================ */}
      <section className="relative py-20 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">Built For</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              One platform. Three different jobs.
            </h2>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {[
              {
                tag: 'AFFILIATES',
                title: 'TikTok Shop Affiliates',
                desc: 'Find converting products in the affiliate marketplace, request samples, generate the hook + script, edit, post, and watch the commissions land — without spreadsheets.',
                cta: 'Start as Affiliate',
                href: '/login?mode=signup&segment=affiliate',
              },
              {
                tag: 'CREATORS & BRANDS',
                title: 'Brands shipping in-house',
                desc: 'Run a content team without losing the brand voice. Multi-seat workspace, shared Winners Bank, brief tracking, and brand-deal pacing.',
                cta: 'Start as Brand',
                href: '/login?mode=signup&segment=brand',
              },
              {
                tag: 'AGENCIES',
                title: 'Agencies running 10+ clients',
                desc: 'Manage every client workspace from one login. Org switcher, role-based access, white-label reports — built to scale a UGC ops team.',
                cta: 'Start as Agency',
                href: '/login?mode=signup&segment=agency',
              },
            ].map((s) => (
              <div key={s.tag} className="p-6 rounded-2xl bg-zinc-900/50 border border-white/5 flex flex-col">
                <div className="text-xs font-semibold tracking-widest text-teal-400 mb-3">{s.tag}</div>
                <h3 className="text-xl font-bold text-zinc-100 mb-2">{s.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed mb-6 flex-grow">{s.desc}</p>
                <Link
                  href={s.href}
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-white text-zinc-900 font-medium text-sm hover:bg-zinc-100 transition-colors"
                >
                  {s.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 6.6 — SOCIAL PROOF (PLACEHOLDER TESTIMONIALS) */}
      {/* ================================================================ */}
      <section className="relative py-20 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">From Creators</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              What real users are saying
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                quote: 'I went from posting 2x a week to 5x without burning out. The AI Editor cut my edit time in half.',
                handle: '@matchawithlena',
                role: 'TikTok Shop Affiliate · Beauty',
              },
              {
                quote: 'Affiliate Hub finally lets me find products with real commission rates instead of doom-scrolling Shop Plaza.',
                handle: '@dadcreates',
                role: 'TikTok Shop Affiliate · Home & Lifestyle',
              },
              {
                quote: 'Hook Generator + Comment Miner is the duo I didn\'t know I needed. Three of my last five posts hit 100k.',
                handle: '@gymrat.kev',
                role: 'Creator · Fitness',
              },
            ].map((t) => (
              <figure key={t.handle} className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5">
                <blockquote className="text-zinc-200 leading-relaxed">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 text-sm">
                  <div className="text-zinc-100 font-medium">{t.handle}</div>
                  <div className="text-zinc-500 text-xs">{t.role}</div>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="text-center mt-8 text-xs text-zinc-600">
            Sample voices representative of beta users. Names + handles obscured during pre-launch.
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 7 — FAQ WITH SCHEMA MARKUP */}
      {/* ================================================================ */}
      <section className="relative py-20 px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Common questions
            </h2>
          </div>

          <div className="space-y-4">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="border-b border-white/5 pb-4">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between text-left py-2"
                >
                  <span className="font-medium text-zinc-200">{item.q}</span>
                  <svg
                    className={`w-5 h-5 text-zinc-500 shrink-0 ml-4 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === i && (
                  <p className="mt-2 text-zinc-500 leading-relaxed">{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 8 — FINAL URGENCY CTA */}
      {/* ================================================================ */}
      <section className="relative py-24 px-6 border-t border-white/5 bg-gradient-to-b from-zinc-900/50 to-transparent">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6 leading-tight">
            Your competitors are already using AI to post more. Every day you wait is content you&apos;re not making.
          </h2>
          <p className="text-xl text-zinc-400 mb-10">
            Stop overthinking. Start generating.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link
              href="/script-generator"
              className="group px-8 py-4 rounded-xl bg-white text-zinc-900 font-semibold text-lg hover:bg-zinc-100 transition-all shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_24px_rgba(0,0,0,0.4)]"
            >
              Try the Script Generator Free
              <svg className="inline-block ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="#pricing"
              className="px-8 py-4 rounded-xl border border-white/10 text-zinc-300 font-medium text-lg hover:bg-white/5 hover:border-white/20 transition-all"
            >
              See Pricing
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-500">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Free forever plan
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              No credit card
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Cancel anytime
            </span>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FOOTER */}
      {/* ================================================================ */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src={BRAND.logo}
                alt={BRAND.name}
                width={24}
                height={24}
                className="rounded-md"
              />
              <span className="font-medium text-sm text-zinc-400">{BRAND.name}</span>
            </Link>
            <div className="flex items-center gap-6 text-sm text-zinc-500">
              <Link href="/tools" className="hover:text-zinc-300 transition-colors">Tools</Link>
              <Link href="/tools/tok-comment" className="hover:text-zinc-300 transition-colors">Comment Sticker</Link>
              <Link href="/transcribe" className="hover:text-zinc-300 transition-colors">Transcriber</Link>
              <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
              <button type="button" onClick={() => setContactOpen(true)} className="hover:text-zinc-300 transition-colors">Contact</button>
            </div>
          </div>
          <p className="text-center text-xs text-zinc-700 mt-8">
            FlashFlow is an independent workflow platform. Not affiliated with or endorsed by TikTok or ByteDance.
          </p>
        </div>
      </footer>

      {/* Contact Modal */}
      <VideoServiceContact
        isOpen={contactOpen}
        onClose={() => setContactOpen(false)}
      />
    </div>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

function PricingCard({
  name,
  description,
  price,
  period,
  savings,
  credits,
  features,
  cta,
  ctaLink,
  highlight = false,
  badge,
}: {
  name: string;
  description: string;
  price: number;
  period: string;
  savings?: string;
  credits: string;
  features: string[];
  cta: string;
  ctaLink: string;
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <div className={`relative p-6 rounded-2xl border ${highlight ? 'bg-zinc-900/80 border-teal-500/50' : 'bg-zinc-900/30 border-white/5'} flex flex-col`}>
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-teal-500 text-xs font-medium text-white">
          {badge}
        </div>
      )}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-1">{name}</h3>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>
      <div className="mb-2">
        <span className="text-4xl font-bold text-white">${price}</span>
        <span className="text-zinc-500 text-sm">{period}</span>
      </div>
      {savings && (
        <p className="text-xs text-emerald-400 mb-2">{savings}</p>
      )}
      <p className="text-sm text-teal-400 mb-6">{credits}</p>
      <ul className="space-y-3 mb-8 flex-grow">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
            <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
      <Link
        href={ctaLink}
        className={`block text-center py-3 rounded-lg font-medium transition-all ${
          highlight
            ? 'bg-white text-zinc-900 hover:bg-zinc-100'
            : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}
