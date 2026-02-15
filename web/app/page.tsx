'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BRAND } from '@/lib/brand';
import { PLANS } from '@/lib/plans';
import { VideoServiceContact } from '@/components/VideoServiceContact';

// ============================================================================
// FLASHFLOW AI — CONVERSION FUNNEL HOMEPAGE
// ============================================================================

const FAQ_ITEMS = [
  {
    q: 'How do I find products that actually convert?',
    a: 'Winners Bank shows you the highest-performing products with actual engagement metrics. See what angles work, what hooks land, and which products have the best commission potential. Build scripts from proven winners instead of guessing.',
  },
  {
    q: "How do I write scripts that don't sound AI-generated?",
    a: 'FlashFlow uses multiple creator personas (Skeptical Reviewer, Gen-Z Trendsetter, High-Energy, etc.) and tone customization. The output reads like a real creator — with natural pauses, humor, and authentic energy. You can always edit and tweak.',
  },
  {
    q: 'How do I hit my retainer video goals on time?',
    a: "Content Calendar tracks your monthly targets by brand. Set video goals, see what you've posted, and get reminders when you're behind. For retainer deals, FlashFlow helps you stay on pace and hit your payouts.",
  },
  {
    q: 'Can I manage multiple TikTok Shop brands?',
    a: 'Yes. FlashFlow is built for affiliates juggling 3-5 brands simultaneously. Track retainer progress, winners, and scripts per brand. Switch between brands instantly and see all your brand analytics in one dashboard.',
  },
  {
    q: 'What makes FlashFlow different from ChatGPT?',
    a: "FlashFlow is built specifically for TikTok Shop affiliates. It gives you script generation + Winners Bank (competitive intelligence) + Content Calendar + Retainer tracking. ChatGPT doesn't know about TikTok compliance, affiliate psychology, or your brand deals.",
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes! Free tier includes 5 scripts/month and access to 3 products in Winners Bank. Create an account instantly — no credit card needed.',
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

export default function LandingPage() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [contactOpen, setContactOpen] = useState(false);
  const [referralBanner, setReferralBanner] = useState(false);

  // Mini script generator state
  const [miniProduct, setMiniProduct] = useState('');
  const [miniLoading, setMiniLoading] = useState(false);
  const [miniResult, setMiniResult] = useState<SkitResult | null>(null);
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
            description: 'AI-powered TikTok script generator for creators, TikTok Shop sellers, and agencies.',
            offers: {
              '@type': 'AggregateOffer',
              lowPrice: '0',
              highPrice: '149',
              priceCurrency: 'USD',
              offerCount: 5,
            },
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: '4.8',
              ratingCount: '500',
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
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="font-semibold text-lg tracking-tight">{BRAND.name}</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/transcriber" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">
              Free Transcriber
            </Link>
            <Link href="#pricing" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">
              Pricing
            </Link>
            <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">
              Sign In
            </Link>
            <Link
              href="/script-generator"
              className="text-sm px-4 py-2 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors"
            >
              Try Script Generator Free
            </Link>
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
            Get Started — No CC Required
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Turn Winning TikTok Shop Content Into Your Own{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
              Money-Making Scripts
            </span>
          </h1>

          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            For TikTok Shop affiliates: Find winning products. Write scripts that don't sound AI. Hit your retainer goals. Track what works.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link
              href="/script-generator"
              className="group px-8 py-4 rounded-xl bg-white text-zinc-900 font-semibold text-lg hover:bg-zinc-100 transition-all shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_24px_rgba(0,0,0,0.4)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.5)]"
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
      {/* SECTION 2 — SOCIAL PROOF (TikTok embed placeholders) */}
      {/* ================================================================ */}
      <section className="relative py-16 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-sm font-medium text-zinc-500 uppercase tracking-widest mb-8">
            Real scripts. Real results.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {['Product Demo', 'UGC Testimonial', 'Trend Reaction'].map((label) => (
              <div
                key={label}
                className="aspect-[9/16] rounded-2xl bg-zinc-900 border border-white/5 flex flex-col items-center justify-center gap-3 overflow-hidden"
              >
                <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-zinc-500">{label}</span>
                <span className="text-xs text-zinc-700">Coming soon</span>
              </div>
            ))}
          </div>
        </div>
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
              FlashFlow solves all three — with Winners Bank, authentic personas, and retainer tracking.
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
                title: 'Paste your product',
                desc: 'Enter a product name and optional description. The AI learns what you\'re selling instantly.',
              },
              {
                step: '02',
                title: 'Pick a persona',
                desc: 'Choose from 20 creator voices — skeptical reviewer, Gen-Z trendsetter, hype machine, and more.',
              },
              {
                step: '03',
                title: 'Generate',
                desc: 'Get a ready-to-film script with scroll-stopping hook, beat-by-beat dialogue, and CTA in 60 seconds.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-teal-400">{item.step}</span>
                </div>
                <h3 className="text-lg font-semibold text-zinc-200 mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>

                {/* Screenshot placeholder */}
                <div className="mt-4 aspect-[4/3] rounded-xl bg-zinc-800/50 border border-white/5 flex items-center justify-center">
                  <span className="text-xs text-zinc-600">Screenshot: {item.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 5 — LIVE MINI SCRIPT GENERATOR */}
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
                placeholder="e.g. Matcha Energy Powder"
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
                {/* Hook */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-teal-500/10 border border-violet-500/20">
                  <div className="text-xs font-medium text-violet-400 uppercase tracking-wider mb-1">Hook</div>
                  <p className="text-lg font-semibold text-zinc-100">&ldquo;{miniResult.hook_line}&rdquo;</p>
                </div>

                {/* Beats preview (show first 3) */}
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

                {/* CTA */}
                <div className="p-3 rounded-lg bg-zinc-800/50">
                  <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">CTA: </span>
                  <span className="text-sm text-zinc-200">{miniResult.cta_line}</span>
                </div>

                {/* Conversion CTA */}
                <div className="pt-4 border-t border-white/5 text-center">
                  <p className="text-sm text-zinc-400 mb-3">
                    Like it? Get unlimited scripts with 20 persona presets.
                  </p>
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-all"
                  >
                    Start Free — No Credit Card
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
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
              onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
              className="relative w-14 h-7 rounded-full bg-zinc-800 border border-white/10 transition-colors"
            >
              <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${billingPeriod === 'yearly' ? 'left-8' : 'left-1'}`} />
            </button>
            <span className={`text-sm ${billingPeriod === 'yearly' ? 'text-white' : 'text-zinc-500'}`}>
              Yearly <span className="text-emerald-500 font-medium">Save 20%</span>
            </span>
          </div>

          {/* Pricing cards — 4 tiers: Free, Lite, Creator Pro (Most Popular), Business */}
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Free Trial */}
            <PricingCard
              name="Free Trial"
              description="Try the platform"
              price={0}
              period=""
              credits="5 credits"
              features={[
                '5 scripts per month',
                '3 personas',
                '3 products',
                'TikTok Shop import',
              ]}
              cta="Get Started Free"
              ctaLink="/signup"
              highlight={false}
            />

            {/* Lite — $9 */}
            <PricingCard
              name="Lite"
              description="For new creators"
              price={billingPeriod === 'monthly' ? 9 : yearlyPrice(9)}
              period={billingPeriod === 'monthly' ? '/mo' : '/mo, billed yearly'}
              credits="50 credits"
              features={[
                '50 scripts per month',
                '20 products',
                'Script Library',
                'Built-in personas',
                'Referral program',
              ]}
              cta="Start Trial"
              ctaLink="/signup?plan=creator_lite"
              highlight={false}
            />

            {/* Creator Pro — $29 (Most Popular) */}
            <PricingCard
              name="Creator Pro"
              description="For serious affiliates"
              price={billingPeriod === 'monthly' ? 29 : yearlyPrice(29)}
              period={billingPeriod === 'monthly' ? '/mo' : '/mo, billed yearly'}
              credits="Unlimited"
              features={[
                'Unlimited scripts',
                'All 20 personas',
                'Full Winners Bank',
                'Unlimited products',
                'Content Calendar',
                'Retainer tracking',
                'Advanced analytics',
              ]}
              cta="Start Trial"
              ctaLink="/signup?plan=creator_pro"
              highlight={true}
              badge="Most Popular"
            />

            {/* Business — $59 */}
            <PricingCard
              name="Business"
              description="For multi-brand affiliates"
              price={billingPeriod === 'monthly' ? 59 : yearlyPrice(59)}
              period={billingPeriod === 'monthly' ? '/mo' : '/mo, billed yearly'}
              credits="Unlimited"
              features={[
                'Everything in Creator Pro',
                'Content Packages',
                'Multi-brand tracking',
                'Team accounts (3 seats)',
                'Priority support',
              ]}
              cta="Start Trial"
              ctaLink="/signup?plan=brand"
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
              <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
              <button type="button" onClick={() => setContactOpen(true)} className="hover:text-zinc-300 transition-colors">Contact</button>
            </div>
          </div>
          <p className="text-center text-sm text-zinc-600 mt-8">
            {BRAND.tagline}
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
