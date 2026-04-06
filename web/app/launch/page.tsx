'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BRAND } from '@/lib/brand';
import { Rocket, Zap, Users, Video, ArrowRight, Check, Loader2, Copy, Play, Star, ChevronDown, Package, DollarSign, TrendingUp, Sparkles } from 'lucide-react';

// ─── Live Demo ───────────────────────────────────────────────────────────────

function LiveDemo() {
  const [url, setUrl] = useState('');
  const [productName, setProductName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const handleGenerate = async () => {
    const input = url.trim() || productName.trim();
    if (!input) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/launch-sync/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const json = await res.json();
      if (json.ok) {
        setResult(json.data);
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const copyHook = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <section id="demo" className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-semibold mb-4">
            <Sparkles className="w-3 h-3" /> Try it free — no signup
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            Paste a product. Get TikTok hooks in 30 seconds.
          </h2>
          <p className="text-zinc-400 text-lg">Enter an Amazon URL or product name and watch the AI generate ready-to-film hooks and scripts.</p>
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={url}
              onChange={e => { setUrl(e.target.value); setProductName(''); }}
              placeholder="Paste Amazon URL (e.g. amazon.com/dp/B09...)"
              className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-sm"
            />
            <button
              onClick={handleGenerate}
              disabled={loading || (!url.trim() && !productName.trim())}
              className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {loading ? 'Generating...' : 'Generate Hooks'}
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-600">or type a product name</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <input
            type="text"
            value={productName}
            onChange={e => { setProductName(e.target.value); setUrl(''); }}
            placeholder="e.g. Ice Roller Face Massager, LED Light Therapy Mask..."
            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-sm"
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
          />
        </div>

        {/* Results */}
        {result && (
          <div ref={resultRef} className="mt-6 space-y-4">
            {/* Hooks */}
            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-zinc-200 mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-teal-400" /> Generated Hooks
              </h3>
              <div className="space-y-2">
                {(result.hooks || []).map((h: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-zinc-800/50 rounded-xl group">
                    <div className="flex-1">
                      <p className="text-sm text-zinc-100 font-medium mb-1">"{h.text}"</p>
                      <div className="flex gap-2">
                        <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{h.angle}</span>
                        <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{h.style}</span>
                      </div>
                    </div>
                    <button onClick={() => copyHook(h.text, i)} className="p-1.5 text-zinc-600 hover:text-teal-400 transition-colors">
                      {copied === i ? <Check className="w-4 h-4 text-teal-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* First script preview */}
            {result.scripts?.[0] && (
              <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
                  <Video className="w-4 h-4 text-violet-400" /> Script Preview
                </h3>
                <div className="p-4 bg-zinc-800/50 rounded-xl">
                  <p className="text-xs font-semibold text-teal-400 mb-1">Hook: {result.scripts[0].hook}</p>
                  <p className="text-xs text-zinc-400 mb-2">{result.scripts[0].body}</p>
                  <p className="text-xs font-semibold text-amber-400">CTA: {result.scripts[0].cta}</p>
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="bg-gradient-to-r from-teal-600/20 to-violet-600/20 border border-teal-500/30 rounded-2xl p-6 text-center">
              <p className="text-lg font-bold text-white mb-2">Want all 3 scripts + creator brief + affiliate tracking?</p>
              <p className="text-sm text-zinc-400 mb-4">Sign up free. Launch your first product on TikTok in under 5 minutes.</p>
              <Link
                href="/login?mode=signup&redirect=/admin/launch-sync/onboarding"
                className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl transition-colors"
              >
                <Rocket className="w-4 h-4" /> Start Launching Free
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── How It Works ────────────────────────────────────────────────────────────

const STEPS = [
  {
    num: '01',
    title: 'Paste Your Product',
    desc: 'Drop an Amazon link or product name. We pull the details automatically.',
    icon: Package,
    color: 'text-teal-400',
  },
  {
    num: '02',
    title: 'AI Generates Everything',
    desc: 'Hooks, scripts, content angles, and a creator brief — ready in 30 seconds.',
    icon: Sparkles,
    color: 'text-violet-400',
  },
  {
    num: '03',
    title: 'Launch & Track',
    desc: 'Post yourself or invite affiliates. Track every video from idea to viral.',
    icon: TrendingUp,
    color: 'text-amber-400',
  },
];

function HowItWorks() {
  return (
    <section className="py-20 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-white text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {STEPS.map(step => (
            <div key={step.num} className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-zinc-800 border border-white/10 flex items-center justify-center">
                <step.icon className={`w-6 h-6 ${step.color}`} />
              </div>
              <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">{step.num}</span>
              <h3 className="text-lg font-bold text-white mt-1 mb-2">{step.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Social Proof ────────────────────────────────────────────────────────────

function SocialProof() {
  const stats = [
    { value: '10K+', label: 'Hooks Generated', icon: Zap },
    { value: '2.5M+', label: 'Total Views Tracked', icon: TrendingUp },
    { value: '30s', label: 'Avg. Time to First Hook', icon: Sparkles },
  ];

  return (
    <section className="py-16 px-6 border-t border-white/5">
      <div className="max-w-4xl mx-auto grid grid-cols-3 gap-6">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <s.icon className="w-5 h-5 mx-auto mb-2 text-teal-400" />
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

function Pricing() {
  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      desc: 'Try it out with 1 product launch',
      features: ['1 active launch', '5 AI-generated hooks', '1 script per launch', 'Content tracker'],
      cta: 'Start Free',
      href: '/login?mode=signup&redirect=/admin/launch-sync/onboarding',
      highlight: false,
    },
    {
      name: 'Creator',
      price: '$29',
      period: '/mo',
      desc: 'For solo creators scaling on TikTok',
      features: ['Unlimited launches', 'Unlimited hooks & scripts', 'Creator briefs', 'Content tracker', 'Performance analytics'],
      cta: 'Start Creating',
      href: '/login?mode=signup&plan=creator&redirect=/admin/launch-sync/onboarding',
      highlight: true,
    },
    {
      name: 'Agency',
      price: '$79',
      period: '/mo',
      desc: 'For brands and agencies managing affiliates',
      features: ['Everything in Creator', 'Affiliate management', 'Invite codes & tracking', 'Multi-creator distribution', 'Revenue tracking', 'Priority support'],
      cta: 'Go Agency',
      href: '/login?mode=signup&plan=business&redirect=/admin/launch-sync/onboarding',
      highlight: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-3">Simple Pricing</h2>
          <p className="text-zinc-400">Start free. Upgrade when you need more launches.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`rounded-2xl p-6 ${
                plan.highlight
                  ? 'bg-gradient-to-b from-teal-600/20 to-zinc-900 border-2 border-teal-500/40 relative'
                  : 'bg-zinc-900 border border-white/10'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-teal-600 text-white text-xs font-bold rounded-full">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                <span className="text-sm text-zinc-500">{plan.period}</span>
              </div>
              <p className="text-sm text-zinc-400 mb-6">{plan.desc}</p>

              <ul className="space-y-2.5 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-zinc-300">
                    <Check className="w-4 h-4 text-teal-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`block text-center py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  plan.highlight
                    ? 'bg-teal-600 hover:bg-teal-500 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const FAQS = [
  { q: 'Do I need a TikTok Shop account?', a: 'No. LaunchSync helps you create content for any product. You can post to TikTok, Instagram, YouTube Shorts — wherever your audience is.' },
  { q: 'Can I use this for products that aren\'t on Amazon?', a: 'Yes. Just type the product name and we\'ll generate hooks and scripts. The Amazon URL auto-fill is a convenience, not a requirement.' },
  { q: 'How does affiliate tracking work?', a: 'In Agency mode, you add affiliates by name and TikTok handle. Each gets an invite code and access to scripts. You track which content they post and how it performs.' },
  { q: 'What makes the AI-generated scripts good?', a: 'Our AI is trained on what actually works on TikTok — pattern interrupts, curiosity gaps, relatable pain points. Not generic marketing copy.' },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="py-20 px-6 border-t border-white/5">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold text-white text-center mb-10">FAQ</h2>
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <span className="text-sm font-medium text-zinc-200">{faq.q}</span>
                <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && (
                <div className="px-4 pb-4 text-sm text-zinc-400 leading-relaxed">{faq.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function LaunchSyncLandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      {/* Nav */}
      <header className="border-b border-white/10 bg-[#09090b]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src={BRAND.logo} alt={BRAND.name} width={28} height={28} className="rounded-lg" />
            <span className="font-semibold text-zinc-100">{BRAND.name}</span>
            <span className="text-xs bg-teal-500/20 text-teal-400 px-2 py-0.5 rounded-full font-bold">LaunchSync</span>
          </Link>
          <nav className="flex items-center gap-4">
            <a href="#demo" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">Demo</a>
            <a href="#pricing" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">Pricing</a>
            <Link
              href="/login?mode=signup&redirect=/admin/launch-sync/onboarding"
              className="text-sm px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-medium transition-colors"
            >
              Get Started Free
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-20 pb-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 text-violet-400 text-xs font-semibold mb-6">
            <Rocket className="w-3 h-3" /> New from FlashFlow AI
          </span>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Take any Amazon product.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-violet-400">
              Launch it on TikTok in 5 minutes.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            AI generates your hooks, scripts, and creator briefs. You post or
            distribute to affiliates. Track everything from idea to viral.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#demo"
              className="px-8 py-3.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl transition-colors flex items-center gap-2 text-lg"
            >
              <Zap className="w-5 h-5" /> Try It Now — Free
            </a>
            <a
              href="#pricing"
              className="px-8 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl border border-white/10 transition-colors flex items-center gap-2"
            >
              See Pricing
            </a>
          </div>

          <p className="text-xs text-zinc-600 mt-4">No credit card required. Generate hooks in 30 seconds.</p>
        </div>
      </section>

      <SocialProof />
      <LiveDemo />
      <HowItWorks />
      <Pricing />
      <FAQ />

      {/* Final CTA */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to launch your first product?</h2>
          <p className="text-zinc-400 mb-6">Join creators who are using AI to go from Amazon find to TikTok viral.</p>
          <Link
            href="/login?mode=signup&redirect=/admin/launch-sync/onboarding"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl transition-colors text-lg"
          >
            <Rocket className="w-5 h-5" /> Start Launching Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <span>&copy; {new Date().getFullYear()} {BRAND.name}. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
            <Link href="/" className="hover:text-zinc-300 transition-colors">FlashFlow AI</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
