'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BRAND } from '@/lib/brand';
import { VideoShowcase } from '@/components/VideoShowcase';
import { VideoServiceContact } from '@/components/VideoServiceContact';

// ============================================================================
// FLASHFLOW AI — LANDING PAGE WITH PRICING
// ============================================================================

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 antialiased">
      {/* Subtle grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      
      {/* Gradient orb */}
      <div 
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/8 via-violet-500/5 to-transparent rounded-full blur-3xl pointer-events-none"
        style={{ transform: `translate(-50%, ${scrollY * 0.1}px)` }}
      />

      {/* Navigation */}
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
          <div className="flex items-center gap-6">
            <Link href="#features" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">Features</Link>
            <Link href="#how-it-works" className="text-sm text-zinc-400 hover:text-white transition-colors hidden md:block">How It Works</Link>
            <Link href="#pricing" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">Pricing</Link>
            <Link href="#video-services" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">Video Services</Link>
            <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Sign In</Link>
            <Link href="/signup" className="text-sm px-4 py-2 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors">
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-400 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Try free — no credit card required
          </div>
          
          {/* Main headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Ideas move{' '}
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-blue-400 bg-clip-text text-transparent">
              faster
            </span>
            {' '}here.
          </h1>
          
          {/* Subheadline */}
          <p className="text-xl sm:text-2xl text-zinc-400 max-w-2xl mx-auto mb-4 leading-relaxed">
            From concept to content — without breaking flow.
          </p>
          <p className="text-lg text-zinc-500 max-w-xl mx-auto mb-10">
            AI-powered script generation for creators, marketers, and teams. 
            Build momentum. Ship faster. Stay in flow.
          </p>
          
          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/signup"
              className="group px-8 py-4 rounded-xl bg-white text-zinc-900 font-semibold text-lg hover:bg-zinc-100 transition-all shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_24px_rgba(0,0,0,0.4)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.5)]"
            >
              Start Free Trial
              <svg className="inline-block ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link 
              href="#pricing"
              className="px-8 py-4 rounded-xl border border-white/10 text-zinc-300 font-medium text-lg hover:bg-white/5 hover:border-white/20 transition-all"
            >
              View Pricing
            </Link>
          </div>
          
          {/* Social proof */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 sm:gap-12 text-center">
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
              <div className="text-2xl font-bold text-white">20+</div>
              <div className="text-xs text-zinc-500 mt-1">Persona Archetypes</div>
            </div>
            <div className="w-px h-8 bg-zinc-800 hidden sm:block" />
            <div>
              <div className="text-2xl font-bold text-white">Free</div>
              <div className="text-xs text-zinc-500 mt-1">No Card Required</div>
            </div>
          </div>
        </div>

        {/* Hero visual */}
        <div className="relative max-w-5xl mx-auto mt-20">
          <div className="aspect-[16/9] rounded-2xl bg-gradient-to-b from-zinc-900 to-zinc-950 border border-white/10 overflow-hidden shadow-2xl shadow-black/50">
            <div className="absolute inset-0 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-zinc-700" />
                  <div className="w-3 h-3 rounded-full bg-zinc-700" />
                  <div className="w-3 h-3 rounded-full bg-zinc-700" />
                </div>
                <div className="flex-1 h-8 rounded-lg bg-zinc-800/50 max-w-md" />
              </div>
              <div className="grid grid-cols-3 gap-4 h-[calc(100%-4rem)]">
                <div className="col-span-1 space-y-3">
                  <div className="h-10 rounded-lg bg-zinc-800/50" />
                  <div className="h-32 rounded-lg bg-zinc-800/30" />
                  <div className="h-10 rounded-lg bg-zinc-800/50" />
                  <div className="h-20 rounded-lg bg-zinc-800/30" />
                </div>
                <div className="col-span-2 rounded-xl bg-zinc-800/20 border border-white/5 p-4">
                  <div className="space-y-3">
                    <div className="h-4 rounded bg-zinc-700/50 w-3/4" />
                    <div className="h-4 rounded bg-zinc-700/30 w-full" />
                    <div className="h-4 rounded bg-zinc-700/30 w-5/6" />
                    <div className="h-4 rounded bg-zinc-700/30 w-2/3" />
                    <div className="mt-6 h-24 rounded-lg bg-gradient-to-r from-blue-500/20 to-violet-500/20 border border-blue-500/20" />
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* The Problem Section */}
      <section className="relative py-24 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">The Problem</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
              Creative momentum is fragile.
            </h2>
          </div>
          
          <div className="grid sm:grid-cols-3 gap-8">
            <ProblemCard
              title="Tool Sprawl"
              description="Jumping between apps, tabs, and platforms. Every switch costs you focus. By the time you're back, the idea has faded."
            />
            <ProblemCard
              title="Decision Fatigue"
              description="Which hook? What tone? How long? Endless micro-decisions drain your energy before you've written a single line."
            />
            <ProblemCard
              title="Lost Momentum"
              description="Great ideas die in the gap between conception and execution. The workflow itself becomes the bottleneck."
            />
          </div>
        </div>
      </section>

      {/* The FlashFlow Difference */}
      <section className="relative py-24 px-6 border-t border-white/5 bg-gradient-to-b from-transparent via-zinc-900/50 to-transparent">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-medium text-blue-400 uppercase tracking-widest mb-4">The FlashFlow Difference</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
            A system, not a chatbot.
          </h2>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-12">
            FlashFlow AI isn't another prompt box. It's a structured creative engine with guardrails, 
            templates, and throttles — designed for continuous output, not one-off generations.
          </p>
          
          <div className="grid sm:grid-cols-3 gap-6 text-left">
            <DifferenceCard
              icon={<LightningIcon />}
              title="Creative Velocity"
              description="Move from idea to script in minutes. Structured inputs eliminate decision paralysis."
            />
            <DifferenceCard
              icon={<ShieldIcon />}
              title="Built-in Guardrails"
              description="Policy safety, tone control, and risk throttling. Ship confidently without compliance anxiety."
            />
            <DifferenceCard
              icon={<RepeatIcon />}
              title="Repeatable Patterns"
              description="Save winning structures. Reuse what works. Build a library of proven creative frameworks."
            />
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section id="features" className="relative py-24 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">Core Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need to stay in flow.
            </h2>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              title="AI Script Generation"
              description="Generate hooks, skits, and full scripts from structured inputs. Choose your angle, tone, and intensity — the system handles the rest."
            />
            <FeatureCard
              title="Character Presets"
              description="Pre-built personas with distinct voices. Select a character, and the AI adapts its writing style, humor level, and delivery automatically."
            />
            <FeatureCard
              title="Creative Throttles"
              description="Dial creativity up or down with precision controls. Balance wild ideation with brand-safe output depending on your needs."
            />
            <FeatureCard
              title="Product-Aware Generation"
              description="Connect your product catalog. The AI references real features, benefits, and positioning — no more generic filler copy."
            />
            <FeatureCard
              title="Policy Safety Layer"
              description="Built-in compliance checks flag risky content before it ships. Set your risk tolerance and let the system enforce it."
            />
            <FeatureCard
              title="Winning Pattern Library"
              description="Save scripts that perform. Tag, organize, and reuse proven structures. Turn one-time wins into repeatable frameworks."
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="relative py-24 px-6 border-t border-white/5 bg-gradient-to-b from-transparent via-zinc-900/50 to-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Start free. Scale as you grow.
            </h2>
            <p className="text-lg text-zinc-400 max-w-xl mx-auto">
              Every plan includes full access to the platform. Pay only for the AI generations you need.
            </p>
          </div>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-4 mb-12">
            <span className={`text-sm ${billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-500'}`}>Monthly</span>
            <button
              onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
              className="relative w-14 h-7 rounded-full bg-zinc-800 border border-white/10 transition-colors"
            >
              <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${billingPeriod === 'yearly' ? 'left-8' : 'left-1'}`} />
            </button>
            <span className={`text-sm ${billingPeriod === 'yearly' ? 'text-white' : 'text-zinc-500'}`}>
              Yearly <span className="text-emerald-500 font-medium">Save 20%</span>
            </span>
          </div>

          {/* Pricing cards */}
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Free Tier */}
            <PricingCard
              name="Free"
              description="Try the platform"
              price={0}
              period=""
              credits="5 generations"
              features={[
                'Access to script generator',
                'Basic character presets',
                '5 AI generations total',
                'Save up to 3 skits',
                'Community support',
              ]}
              cta="Get Started"
              ctaLink="/signup"
              highlight={false}
            />

            {/* Starter */}
            <PricingCard
              name="Starter"
              description="For individual creators"
              price={billingPeriod === 'monthly' ? 9 : 7}
              period={billingPeriod === 'monthly' ? '/month' : '/month, billed yearly'}
              credits="75 credits/mo"
              features={[
                'Everything in Free',
                'All character presets',
                '75 AI credits/month',
                'Unlimited saved skits',
                'Product catalog (5 products)',
                'Export to all formats',
                'Email support',
              ]}
              cta="Start Trial"
              ctaLink="/signup?plan=starter"
              highlight={false}
            />

            {/* Creator - Highlighted */}
            <PricingCard
              name="Creator"
              description="For power users"
              price={billingPeriod === 'monthly' ? 29 : 23}
              period={billingPeriod === 'monthly' ? '/month' : '/month, billed yearly'}
              credits="300 credits/mo"
              features={[
                'Everything in Starter',
                '300 AI credits/month',
                'Product catalog (unlimited)',
                'Audience Intelligence',
                'Winners Bank',
                'Pain Point Analysis',
                'Priority support',
              ]}
              cta="Start Trial"
              ctaLink="/signup?plan=creator"
              highlight={true}
              badge="Most Popular"
            />

            {/* Business */}
            <PricingCard
              name="Business"
              description="For teams & agencies"
              price={billingPeriod === 'monthly' ? 59 : 47}
              period={billingPeriod === 'monthly' ? '/month' : '/month, billed yearly'}
              credits="1,000 credits/mo"
              features={[
                'Everything in Creator',
                '1,000 AI credits/month',
                'Up to 5 team members',
                'Shared workspaces',
                'Usage analytics',
                'Dedicated support',
              ]}
              cta="Start Trial"
              ctaLink="/signup?plan=business"
              highlight={false}
            />
          </div>

          {/* Enterprise CTA */}
          <div className="mt-12 p-8 rounded-2xl bg-zinc-900/50 border border-white/5 text-center">
            <h3 className="text-xl font-semibold mb-2">Need More?</h3>
            <p className="text-zinc-400 mb-6 max-w-2xl mx-auto">
              Enterprise plans with custom limits, dedicated support, and white-label options available.
            </p>
            <button
              onClick={() => setContactOpen(true)}
              className="inline-flex items-center px-6 py-3 rounded-lg border border-white/10 text-zinc-300 font-medium hover:bg-white/5 hover:border-white/20 transition-all"
            >
              Contact Sales
              <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* Video Production Services Section */}
      <section id="video-services" className="relative py-24 px-6 border-t border-white/5 bg-gradient-to-b from-violet-950/20 via-zinc-900/50 to-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-400 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
              Done-For-You Service
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              We handle the production.
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              Don&apos;t have time to create videos yourself? Our team handles filming, editing,
              and optimization — you just approve and post.
            </p>
          </div>

          {/* Service Features */}
          <div className="grid sm:grid-cols-3 gap-6 mb-16">
            <div className="p-6 rounded-xl bg-zinc-900/50 border border-white/5 text-center">
              <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Full Production</h3>
              <p className="text-sm text-zinc-500">Filming, editing, graphics, captions — the complete package.</p>
            </div>
            <div className="p-6 rounded-xl bg-zinc-900/50 border border-white/5 text-center">
              <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Performance Tracking</h3>
              <p className="text-sm text-zinc-500">Analytics dashboard to see what&apos;s working and optimize.</p>
            </div>
            <div className="p-6 rounded-xl bg-zinc-900/50 border border-white/5 text-center">
              <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Consistent Output</h3>
              <p className="text-sm text-zinc-500">10-50+ videos per month, on brand, on schedule.</p>
            </div>
          </div>

          {/* Video Showcase */}
          <VideoShowcase
            limit={6}
            showTitle={true}
            onContactClick={() => setContactOpen(true)}
          />
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative py-24 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Four steps. Zero friction.
            </h2>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <StepCard number="01" title="Select Context" description="Choose your product, character preset, and creative parameters." />
            <StepCard number="02" title="Generate with Structure" description="The AI produces scripts following proven frameworks and your guardrails." />
            <StepCard number="03" title="Stay in Flow" description="Iterate, refine, and regenerate without leaving the system." />
            <StepCard number="04" title="Ship Faster" description="Export, save to library, or push directly to production." />
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className="relative py-24 px-6 border-t border-white/5 bg-gradient-to-b from-transparent via-zinc-900/50 to-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">Built For</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Teams that move fast.
            </h2>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <AudienceCard title="Content Creators" description="Produce more without burning out. Keep the ideas flowing and the camera rolling." />
            <AudienceCard title="Performance Marketers" description="Test more angles, faster. Find winners without the creative bottleneck." />
            <AudienceCard title="Agencies" description="Scale client output without scaling headcount. Maintain quality at volume." />
            <AudienceCard title="Brand Teams" description="Keep internal creative velocity high while maintaining brand consistency." />
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative py-24 px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Common questions
            </h2>
          </div>
          
          <div className="space-y-6">
            <FAQItem
              question="What counts as a generation?"
              answer="Each time you click 'Generate' to create a new script, that counts as one generation. Refining or editing an existing script doesn't use additional credits."
            />
            <FAQItem
              question="Do unused credits roll over?"
              answer="Credits reset each billing cycle. We recommend choosing a plan that matches your typical monthly usage."
            />
            <FAQItem
              question="Can I upgrade or downgrade anytime?"
              answer="Yes. Changes take effect on your next billing cycle. If you upgrade mid-cycle, you'll get immediate access to additional credits."
            />
            <FAQItem
              question="What's included in the free trial?"
              answer="You get 5 free generations to test the platform. No credit card required. You can upgrade to a paid plan whenever you're ready."
            />
            <FAQItem
              question="What are Video Production Services?"
              answer="Our managed service for brands that need end-to-end video production. We handle filming, editing, posting, and performance tracking. This is a separate retainer-based service — contact sales for custom pricing."
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-32 px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            Ready to move faster?
          </h2>
          <p className="text-xl text-zinc-400 mb-10">
            Start with 5 free generations. No credit card required. 
            Upgrade when you're ready to scale.
          </p>
          <Link 
            href="/signup"
            className="group inline-flex items-center px-10 py-5 rounded-xl bg-white text-zinc-900 font-semibold text-lg hover:bg-zinc-100 transition-all shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_24px_rgba(0,0,0,0.4)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.5)]"
          >
            Start Free Trial
            <svg className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
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
              <button onClick={() => setContactOpen(true)} className="hover:text-zinc-300 transition-colors">Contact</button>
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

function ProblemCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl bg-zinc-900/50 border border-white/5">
      <h3 className="text-lg font-semibold text-zinc-200 mb-3">{title}</h3>
      <p className="text-zinc-500 leading-relaxed">{description}</p>
    </div>
  );
}

function DifferenceCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl bg-zinc-900/50 border border-white/5">
      <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-zinc-200 mb-2">{title}</h3>
      <p className="text-zinc-500 leading-relaxed text-sm">{description}</p>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="group p-6 rounded-xl bg-zinc-900/30 border border-white/5 hover:border-white/10 hover:bg-zinc-900/50 transition-all">
      <h3 className="text-lg font-semibold text-zinc-200 mb-3 group-hover:text-white transition-colors">{title}</h3>
      <p className="text-zinc-500 leading-relaxed text-sm">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl font-bold text-zinc-800 mb-4">{number}</div>
      <h3 className="text-lg font-semibold text-zinc-200 mb-2">{title}</h3>
      <p className="text-zinc-500 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function AudienceCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
      <h3 className="text-lg font-semibold text-zinc-200 mb-2">{title}</h3>
      <p className="text-zinc-500 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

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
    <div className={`relative p-6 rounded-2xl border ${highlight ? 'bg-zinc-900/80 border-blue-500/50' : 'bg-zinc-900/30 border-white/5'} flex flex-col`}>
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-500 text-xs font-medium text-white">
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
      <p className="text-sm text-blue-400 mb-6">{credits}</p>
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

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/5 pb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="font-medium text-zinc-200">{question}</span>
        <svg
          className={`w-5 h-5 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <p className="mt-4 text-zinc-500 leading-relaxed">{answer}</p>}
    </div>
  );
}

// Icons
function LightningIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}
