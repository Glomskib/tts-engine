'use client';

import Link from 'next/link';
import { Zap, CheckCircle, AlertTriangle, Activity, ArrowRight, Shield, Eye } from 'lucide-react';
import { BRAND } from '@/lib/branding';

const PLANS = [
  {
    id: 'ops_starter',
    name: 'Starter',
    price: '$99',
    period: '/mo',
    features: [
      'System health verdict',
      'Up to 3 lanes',
      'Up to 5 agents',
      'Integration monitoring',
      'Daily ops brief',
      'Client dashboard',
    ],
  },
  {
    id: 'ops_pro',
    name: 'Pro',
    price: '$299',
    period: '/mo',
    badge: 'Most Popular',
    features: [
      'Everything in Starter',
      'Unlimited lanes & agents',
      'Intelligence insights',
      'Intervention queue',
      'Trust signals & proof tracking',
      'API access',
      'Slack/email alerts',
    ],
  },
  {
    id: 'ops_enterprise',
    name: 'Done For You',
    price: '$999',
    period: '+/mo',
    features: [
      'Everything in Pro',
      'We set up your entire system',
      'Custom integrations',
      'Agent configuration',
      'Daily monitoring by our team',
      'Dedicated onboarding call',
    ],
  },
];

export default function OpsLandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={`w-5 h-5 ${BRAND.accentClasses.text}`} />
            <span className="font-semibold">{BRAND.name}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/demo" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Live Demo
            </Link>
            <Link
              href="/ops/onboarding"
              className={`px-4 py-2 text-sm ${BRAND.accentClasses.primary} ${BRAND.accentClasses.hover} rounded-lg transition-colors font-medium`}
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-5">
          {BRAND.headline.split('.')[0]}.
          {BRAND.headline.split('.')[1] && (
            <><br /><span className={BRAND.accentClasses.text}>{BRAND.headline.split('.').slice(1).join('.').trim()}</span></>
          )}
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-8">
          {BRAND.tagline}
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/demo"
            className={`px-6 py-3 ${BRAND.accentClasses.primary} ${BRAND.accentClasses.hover} rounded-xl font-semibold transition-colors flex items-center gap-2`}
          >
            See Live Demo <ArrowRight className="w-4 h-4" />
          </Link>
          {BRAND.showPricing && (
            <Link
              href="#pricing"
              className="px-6 py-3 border border-zinc-700 hover:border-zinc-600 rounded-xl font-medium transition-colors text-zinc-300"
            >
              View Pricing
            </Link>
          )}
        </div>
      </section>

      {/* Problem */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <AlertTriangle className="w-6 h-6 text-amber-400 mb-3" />
            <h3 className="font-semibold mb-2">You don&apos;t know what&apos;s happening</h3>
            <p className="text-sm text-zinc-500">AI tools run, Slack pings fire, but you have no single view of what actually moved today.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <Activity className="w-6 h-6 text-red-400 mb-3" />
            <h3 className="font-semibold mb-2">Things feel busy but nothing moves</h3>
            <p className="text-sm text-zinc-500">Agents are &quot;running&quot; but tasks stall, nothing completes with proof, and revenue sits blocked.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <Eye className="w-6 h-6 text-zinc-400 mb-3" />
            <h3 className="font-semibold mb-2">AI tools don&apos;t connect or finish</h3>
            <p className="text-sm text-zinc-500">You bought 5 AI tools that each do one thing. None of them show you if your business actually ran.</p>
          </div>
        </div>
      </section>

      {/* Solution preview */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-10">What you see every morning</h2>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 text-center">
            <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-emerald-400">5</div>
            <div className="text-xs text-zinc-500 mt-1">Today&apos;s Wins</div>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-5 text-center">
            <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-amber-400">2</div>
            <div className="text-xs text-zinc-500 mt-1">Stale Tasks</div>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-5 text-center">
            <Shield className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-red-400">1</div>
            <div className="text-xs text-zinc-500 mt-1">Needs You</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-center">
            <Zap className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-emerald-400">Healthy</div>
            <div className="text-xs text-zinc-500 mt-1">System Status</div>
          </div>
        </div>
      </section>

      {/* Pricing — only shown when SHOW_PRICING is enabled */}
      {BRAND.showPricing && (
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-bold text-center mb-3">Simple pricing</h2>
        <p className="text-zinc-500 text-center mb-10">Start with Starter. Upgrade when you need more control.</p>
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map(plan => (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 relative ${
                plan.badge
                  ? 'border-blue-500/40 bg-blue-500/[0.04]'
                  : 'border-zinc-800 bg-zinc-900/50'
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-blue-600 text-white text-xs font-medium rounded-full">
                  {plan.badge}
                </span>
              )}
              <h3 className="text-lg font-semibold mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-5">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-zinc-500 text-sm">{plan.period}</span>
              </div>
              <ul className="space-y-2.5 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                    <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.id === 'ops_enterprise' ? `mailto:${BRAND.contactEmail}?subject=${encodeURIComponent(BRAND.name + ' — Done For You')}` : '/ops/onboarding'}
                className={`block w-full text-center py-2.5 rounded-lg font-medium text-sm transition-colors ${
                  plan.badge
                    ? `${BRAND.accentClasses.primary} ${BRAND.accentClasses.hover} text-white`
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                {plan.id === 'ops_enterprise' ? 'Book Setup Call' : 'Get Started'}
              </Link>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* Footer CTA */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center border-t border-zinc-800">
        <h2 className="text-2xl font-bold mb-3">Stop guessing. Start seeing.</h2>
        <p className="text-zinc-400 mb-6">Your business ran today. Do you know what happened?</p>
        <Link
          href="/demo"
          className={`inline-flex items-center gap-2 px-6 py-3 ${BRAND.accentClasses.primary} ${BRAND.accentClasses.hover} rounded-xl font-semibold transition-colors`}
        >
          See the Demo <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-600">
        {BRAND.name}
      </footer>
    </div>
  );
}
