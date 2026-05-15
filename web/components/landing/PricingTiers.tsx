'use client';

// ============================================================
// PricingTiers — the 4-tier pricing grid with monthly/annual
// toggle. Only the toggle needs state, but the cards live here
// so the entire section is one cohesive client unit.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';

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
    <div
      className={`relative p-6 rounded-2xl border ${
        highlight ? 'bg-zinc-900/80 border-teal-500/50' : 'bg-zinc-900/30 border-white/5'
      } flex flex-col`}
    >
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
      {savings && <p className="text-xs text-emerald-400 mb-2">{savings}</p>}
      <p className="text-sm text-teal-400 mb-6">{credits}</p>
      <ul className="space-y-3 mb-8 flex-grow">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
            <svg
              className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
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

export default function PricingTiers() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

  return (
    <>
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-4 mb-12">
        <span className={`text-sm ${billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-500'}`}>
          Monthly
        </span>
        <button
          type="button"
          onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')}
          className="relative w-14 h-7 rounded-full bg-zinc-800 border border-white/10 transition-colors"
          aria-label="Toggle billing period"
        >
          <div
            className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
              billingPeriod === 'annual' ? 'left-8' : 'left-1'
            }`}
          />
        </button>
        <span className={`text-sm ${billingPeriod === 'annual' ? 'text-white' : 'text-zinc-500'}`}>
          Annual <span className="text-emerald-500 font-medium">Save 20%</span>
        </span>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <PricingCard
          name="Free"
          description="Try the platform"
          price={0}
          period=""
          credits="5 credits/month"
          features={['5 scripts per month', 'Built-in personas', '3 products', 'Free Transcriber']}
          cta="Get Started Free"
          ctaLink="/login?mode=signup"
          highlight={false}
        />

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
    </>
  );
}
