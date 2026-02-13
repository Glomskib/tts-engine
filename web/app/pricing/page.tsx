'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, X, Zap, ArrowRight, Scissors } from 'lucide-react';
import { PublicLayout } from '@/components/PublicLayout';
import { PLANS_LIST, EDITING_ADDONS } from '@/lib/plans';

// Feature comparison table data (maps to the 5 tiers)
const COMPARISON_FEATURES = [
  { name: 'Scripts per month', values: ['5', '25', 'Unlimited', 'Unlimited', 'Unlimited'] },
  { name: 'AI video edits', values: ['0', '5', '25', '50', 'Unlimited'] },
  { name: 'Creator personas', values: ['3', '5', 'All 7+', 'All', 'All'] },
  { name: 'Products', values: ['3', '10', '50', 'Unlimited', 'Unlimited'] },
  { name: 'Brands', values: ['1', '1', '3', '5', 'Unlimited'] },
  { name: 'Content Planner', values: [false, false, true, true, true] },
  { name: 'Script of the Day', values: [false, true, true, true, true] },
  { name: 'Creator invite links', values: [false, false, false, true, true] },
  { name: 'Content approval', values: [false, false, false, true, true] },
  { name: 'Client portal', values: [false, false, false, false, true] },
  { name: 'API access', values: [false, false, false, false, true] },
  { name: 'Affiliate program', values: [false, true, true, true, true] },
  { name: 'Support', values: ['Community', 'Email', 'Priority', 'Priority', 'Dedicated'] },
];

const FAQS = [
  {
    question: 'What counts as a script?',
    answer: 'Every time you generate a new script using any creator persona, that counts as one script. Editing or tweaking an existing script does not use another script credit.',
  },
  {
    question: 'What are AI video edits?',
    answer: 'AI video edits use our editing tools to automatically cut, caption, and polish your raw footage into ready-to-post videos. Each edit processes one video.',
  },
  {
    question: 'Can I switch plans anytime?',
    answer: 'Yes! Upgrade instantly and get immediate access to new features. Downgrade at any time and changes take effect at your next billing date. No long-term contracts.',
  },
  {
    question: 'What is the Content Planner?',
    answer: 'The Content Planner bundles your daily scripts, hooks, captions, and hashtags into a single view. Great for batch-creating a week of content at once.',
  },
  {
    question: 'How does the affiliate program work?',
    answer: 'Share your referral link and earn 25% recurring commission on every paid subscriber you refer. Commissions are paid monthly via Stripe. Available on Creator Lite and above.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards (Visa, Mastercard, American Express) through Stripe. Cancel anytime from your account settings.',
  },
  {
    question: 'Is there a free trial?',
    answer: 'Yes! The Free plan gives you 5 scripts per month forever, no credit card required. Try the tool and upgrade when you are ready.',
  },
];

function renderValue(value: boolean | string) {
  if (value === true) return <Check className="w-5 h-5 text-emerald-500 mx-auto" />;
  if (value === false) return <X className="w-5 h-5 text-zinc-600 mx-auto" />;
  return <span className="text-zinc-300 text-sm">{value}</span>;
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-900/50 transition-colors"
      >
        <span className="text-sm font-medium text-zinc-200">{question}</span>
        <svg
          className={`w-5 h-5 text-zinc-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-zinc-400 leading-relaxed">{answer}</div>
      )}
    </div>
  );
}

export default function PricingPage() {
  return (
    <PublicLayout>
      <div className="relative py-16 px-4 overflow-x-hidden">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm mb-6">
              <Zap className="w-4 h-4" />
              Simple, transparent pricing
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Plans that grow with you
            </h1>
            <p className="text-zinc-400 max-w-2xl mx-auto text-lg">
              Start free. Scale to agency. Every plan includes AI-powered TikTok Shop scripts.
            </p>
          </div>

          {/* Trust signals */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 mb-12 text-center">
            <div>
              <div className="text-xl font-bold text-white">10,000+</div>
              <div className="text-xs text-zinc-500">Scripts Generated</div>
            </div>
            <div className="w-px h-8 bg-zinc-800 hidden sm:block" />
            <div>
              <div className="text-xl font-bold text-white">500+</div>
              <div className="text-xs text-zinc-500">Active Creators</div>
            </div>
            <div className="w-px h-8 bg-zinc-800 hidden sm:block" />
            <div>
              <div className="text-xl font-bold text-white">No card</div>
              <div className="text-xs text-zinc-500">Required to start</div>
            </div>
            <div className="w-px h-8 bg-zinc-800 hidden sm:block" />
            <div>
              <div className="text-xl font-bold text-white">Cancel</div>
              <div className="text-xs text-zinc-500">Anytime, no lock-in</div>
            </div>
          </div>

          {/* Plan Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-16">
            {PLANS_LIST.map((plan) => {
              const isPopular = plan.id === 'creator_pro';
              const isBestValue = plan.id === 'agency';

              return (
                <div
                  key={plan.id}
                  className={`relative p-6 rounded-xl border-2 flex flex-col ${
                    isPopular
                      ? 'border-teal-500/60 bg-teal-500/5 ring-1 ring-teal-500/20'
                      : isBestValue
                      ? 'border-violet-500/50 bg-violet-500/5'
                      : 'border-white/10 bg-zinc-900/30'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-teal-500 text-xs font-semibold text-white whitespace-nowrap">
                      Most Popular
                    </div>
                  )}
                  {isBestValue && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-violet-500 text-xs font-semibold text-white whitespace-nowrap">
                      Best for Teams
                    </div>
                  )}

                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-zinc-100">{plan.name}</h3>
                    <div className="text-3xl font-bold mt-2 text-zinc-100">
                      {plan.price === 0 ? 'Free' : `$${plan.price}`}
                      {plan.price > 0 && (
                        <span className="text-sm font-normal text-zinc-500">/mo</span>
                      )}
                    </div>
                  </div>

                  {/* Feature list */}
                  <ul className="space-y-2 mb-6 flex-1">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span className="text-zinc-300">{feat}</span>
                      </li>
                    ))}
                  </ul>

                  {plan.id === 'free' ? (
                    <Link
                      href="/login?mode=signup"
                      className="block w-full text-center py-2.5 rounded-lg font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
                    >
                      Start Free
                    </Link>
                  ) : (
                    <Link
                      href={`/login?mode=signup&plan=${plan.id}`}
                      className={`block w-full text-center py-2.5 rounded-lg font-medium transition-colors ${
                        isPopular
                          ? 'bg-teal-600 text-white hover:bg-teal-500'
                          : isBestValue
                          ? 'bg-violet-600 text-white hover:bg-violet-500'
                          : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                      }`}
                    >
                      Get Started
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {/* Editing Add-ons */}
          <div className="mb-16">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm mb-4">
                <Scissors className="w-4 h-4" />
                Video Editing Add-ons
              </div>
              <h2 className="text-2xl font-bold mb-2">Need more video edits?</h2>
              <p className="text-zinc-400 text-sm">Add editing capacity to any plan, or use standalone.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-5 max-w-3xl mx-auto">
              {Object.values(EDITING_ADDONS).map((addon) => (
                <div
                  key={addon.id}
                  className="p-5 rounded-xl border border-white/10 bg-zinc-900/30 text-center"
                >
                  <h3 className="font-semibold text-zinc-100">{addon.name}</h3>
                  <div className="text-2xl font-bold mt-2 text-zinc-100">
                    ${addon.price}
                    <span className="text-sm font-normal text-zinc-500">
                      {addon.id === 'per_video' ? '/video' : '/mo'}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 mt-2">
                    {addon.editsPerMonth} video edit{addon.editsPerMonth === 1 ? '' : 's'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Feature Comparison Table */}
          <div className="mb-16">
            <h2 className="text-2xl font-semibold text-center mb-8">Compare All Plans</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10 -mx-4 sm:mx-0">
              <table className="w-full border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-white/10 bg-zinc-900/50">
                    <th className="text-left py-4 px-4 text-sm font-medium text-zinc-400">Feature</th>
                    {PLANS_LIST.map((plan) => (
                      <th
                        key={plan.id}
                        className={`text-center py-4 px-3 text-sm font-medium ${
                          plan.id === 'creator_pro' ? 'text-teal-400' : 'text-zinc-400'
                        }`}
                      >
                        {plan.name}
                        <div className="text-xs font-normal text-zinc-500 mt-0.5">
                          {plan.price === 0 ? 'Free' : `$${plan.price}/mo`}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_FEATURES.map((feature, index) => (
                    <tr key={feature.name} className={index % 2 === 0 ? 'bg-zinc-900/20' : ''}>
                      <td className="py-3 px-4 text-sm text-zinc-300">{feature.name}</td>
                      {feature.values.map((val, i) => (
                        <td
                          key={i}
                          className={`py-3 px-3 text-center ${
                            PLANS_LIST[i].id === 'creator_pro' ? 'bg-teal-500/5' : ''
                          }`}
                        >
                          {renderValue(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* FAQ */}
          <div className="mb-16">
            <h2 className="text-2xl font-semibold text-center mb-8">Frequently Asked Questions</h2>
            <div className="max-w-3xl mx-auto space-y-4">
              {FAQS.map((faq, i) => (
                <FAQItem key={i} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="text-center p-10 bg-gradient-to-br from-teal-500/10 to-violet-500/10 rounded-2xl border border-teal-500/20">
            <h2 className="text-2xl font-bold mb-3">Ready to create viral content?</h2>
            <p className="text-zinc-400 mb-6 max-w-lg mx-auto">
              Join creators using FlashFlow AI to generate scripts that sell on TikTok Shop.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-500 transition-colors"
              >
                Start Free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
