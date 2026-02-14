'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useCredits } from '@/hooks/useCredits';
import { useSubscription } from '@/hooks/useFeatureAccess';
import { Check, X, Sparkles, Video } from 'lucide-react';
import { PRICING, PLAN_DETAILS, migrateOldPlanId, type PlanName } from '@/lib/subscriptions';

interface AuthUser {
  id: string;
  email: string | null;
}

// SaaS Plans from centralized pricing
const SAAS_PLANS = Object.values(PRICING.saas);

// Video Editing Plans from centralized pricing
const VIDEO_PLANS = Object.values(PRICING.video);

// SaaS Features — 5-tier model
const SAAS_FEATURES = [
  { name: 'Scripts/month', values: ['5', '25', 'Unlimited', 'Unlimited', 'Unlimited'] },
  { name: 'AI Credits/month', values: ['5', '75', '300', '1,000', 'Unlimited'] },
  { name: 'AI Video Edits', values: ['0', '5', '25', '50', 'Unlimited'] },
  { name: 'Creator Personas', values: ['3', '5', 'All 7+', 'All', 'All'] },
  { name: 'Products', values: ['3', '10', '50', 'Unlimited', 'Unlimited'] },
  { name: 'Brands', values: ['1', '1', '3', '5', 'Unlimited'] },
  { name: 'Content Planner', values: [false, false, true, true, true] },
  { name: 'Script of the Day', values: [false, true, true, true, true] },
  { name: 'Creator Invite Links', values: [false, false, false, true, true] },
  { name: 'Content Approval', values: [false, false, false, true, true] },
  { name: 'Affiliate Program', values: [false, true, true, true, true] },
  { name: 'Support', values: ['Community', 'Email', 'Priority', 'Priority', 'Dedicated'] },
];

// Video Features - Updated with final pricing
const VIDEO_FEATURES = [
  { name: 'Videos/month', starter: '45', growth: '120', scale: '350', agency: '1,000' },
  { name: 'Per-Video Cost', starter: '$1.98', growth: '$1.66', scale: '$1.43', agency: '$1.15' },
  { name: 'AI Credits', starter: '300', growth: '1,000', scale: 'Unlimited', agency: 'Unlimited' },
  { name: 'Full AI Suite', starter: true, growth: true, scale: true, agency: true },
  { name: 'Turnaround', starter: '24-48 hours', growth: '24 hours', scale: 'Same day', agency: 'Priority' },
  { name: 'Revisions', starter: 'Unlimited', growth: 'Unlimited', scale: 'Unlimited', agency: 'Unlimited' },
  { name: 'Team Members', starter: '5', growth: '10', scale: '10', agency: '25' },
  { name: 'Dedicated Editor', starter: false, growth: true, scale: true, agency: true },
];

// FAQ data
const faqs = [
  {
    question: 'What counts as one AI credit?',
    answer: 'Credits are used for AI-powered actions: Script generation (3 credits), Script refinement (1 credit), Winner analysis (2 credits), Pain point analysis (1 credit).'
  },
  {
    question: 'Do unused credits roll over?',
    answer: 'Credits reset at the start of each billing cycle. We recommend using all your credits each month to get the most value from your plan.'
  },
  {
    question: 'What\'s included in the video editing plans?',
    answer: 'Video editing plans include professional video editing by our team, plus full access to all AI tools. Simply upload your footage, and we\'ll deliver polished, ready-to-post videos.'
  },
  {
    question: 'Can I upgrade or downgrade anytime?',
    answer: 'Yes! You can change your plan at any time. When upgrading, you\'ll get immediate access. When downgrading, changes take effect at your next billing date.'
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards (Visa, Mastercard, American Express) through our secure payment processor Stripe.'
  },
];

function renderFeatureValue(value: boolean | string) {
  if (value === true) return <Check className="w-5 h-5 text-emerald-500 mx-auto" />;
  if (value === false) return <X className="w-5 h-5 text-zinc-600 mx-auto" />;
  return <span className="text-zinc-300 text-sm">{value}</span>;
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-900/50 transition-colors"
      >
        <span className="text-sm font-medium text-zinc-200">{question}</span>
        <svg
          className={`w-5 h-5 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-5 pb-4 text-sm text-zinc-400 leading-relaxed">{answer}</div>
      )}
    </div>
  );
}

export default function UpgradePage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'saas' | 'video'>('saas');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const { credits, isLoading: creditsLoading } = useCredits();
  const { planId, subscriptionType, loading: subLoading } = useSubscription();

  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/upgrade');
          return;
        }

        setAuthUser({ id: user.id, email: user.email || null });
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/upgrade');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  const handleSubscribe = async (selectedPlanId: PlanName) => {
    if (selectedPlanId === 'free') return;

    setCheckoutLoading(selectedPlanId);
    setCheckoutError(null);

    try {
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlanId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Checkout failed');
      }

      if (!data.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      if (!data.url) {
        throw new Error('No checkout URL received');
      }

      // Validate URL before redirecting
      try {
        new URL(data.url);
      } catch {
        throw new Error(`Invalid checkout URL received`);
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
      setCheckoutError(err instanceof Error ? err.message : 'Failed to start checkout. Please try again.');
      setCheckoutLoading(null);
    }
  };

  if (authLoading || creditsLoading || subLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-zinc-500">Redirecting to login...</div>
      </div>
    );
  }

  const isUnlimited = credits?.remaining === -1 || (credits as { isUnlimited?: boolean })?.isUnlimited;
  const currentPlan = migrateOldPlanId(planId || 'free');
  const creditsRemaining = isUnlimited ? 'Unlimited' : (credits?.remaining ?? 5);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 py-10 px-4 overflow-x-hidden">
      <div className="max-w-6xl mx-auto">
        {/* Back Link */}
        <div className="mb-6">
          <Link
            href="/admin/content-studio"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            ← Back to Content Studio
          </Link>
        </div>

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3">Choose Your Plan</h1>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Scale your content creation with AI-powered tools or let our team handle video editing for you.
          </p>
        </div>

        {/* Current Plan Banner */}
        <div className={`mb-8 p-6 rounded-xl border ${
          isUnlimited ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-zinc-900/50 border-white/10'
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-sm text-zinc-400 mb-1">Current Plan</div>
              <div className="text-2xl font-bold">{PLAN_DETAILS[currentPlan as PlanName]?.name || 'Free'}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-zinc-400 mb-1">Credits Remaining</div>
              <div className={`text-2xl font-bold ${isUnlimited ? 'text-emerald-400' : ''}`}>
                {creditsRemaining}
              </div>
            </div>
          </div>
        </div>

        {/* Checkout Error Display */}
        {checkoutError && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/50 bg-red-500/10">
            <div className="flex items-start gap-3">
              <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">Checkout Failed</p>
                <p className="text-red-300/80 text-sm mt-1">{checkoutError}</p>
                <button type="button"
                  onClick={() => setCheckoutError(null)}
                  className="text-xs text-red-400 hover:text-red-300 mt-2 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-zinc-900/50 p-1 rounded-xl border border-white/10">
            <button type="button"
              onClick={() => setActiveTab('saas')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === 'saas'
                  ? 'bg-white text-zinc-900'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              AI Tools
            </button>
            <button type="button"
              onClick={() => setActiveTab('video')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === 'video'
                  ? 'bg-white text-zinc-900'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Video className="w-4 h-4" />
              Video Editing
            </button>
          </div>
        </div>

        {/* SaaS Plans */}
        {activeTab === 'saas' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-10">
              {SAAS_PLANS.map((plan) => {
                const isCurrentPlan = currentPlan === plan.id;
                const isPopular = 'popular' in plan && plan.popular;

                return (
                  <div
                    key={plan.id}
                    className={`p-6 rounded-xl border-2 relative ${
                      isPopular
                        ? 'border-teal-500/50 bg-teal-500/5'
                        : isCurrentPlan
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-white/10 bg-zinc-900/30'
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-teal-500 text-xs font-medium text-white">
                        Most Popular
                      </div>
                    )}

                    <div className="mb-4">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      <div className="text-3xl font-bold mt-2">
                        ${plan.price}<span className="text-sm font-normal text-zinc-500">{plan.id === 'free' ? '' : '/mo'}</span>
                      </div>
                    </div>

                    <div className="text-sm text-teal-400 mb-4">{plan.credits === -1 ? 'Unlimited' : plan.credits} credits{plan.id === 'free' ? ' (one-time)' : '/month'}</div>

                    {isCurrentPlan ? (
                      <div className="text-center text-sm text-emerald-400 py-2.5 font-medium border border-emerald-500/30 rounded-lg bg-emerald-500/10">
                        Current Plan
                      </div>
                    ) : plan.id === 'free' ? (
                      <div className="text-center text-sm text-zinc-500 py-2.5">Free Forever</div>
                    ) : (
                      <button type="button"
                        onClick={() => handleSubscribe(plan.id as PlanName)}
                        disabled={checkoutLoading === plan.id}
                        className={`w-full py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                          isPopular
                            ? 'bg-white text-zinc-900 hover:bg-zinc-100'
                            : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                        }`}
                      >
                        {checkoutLoading === plan.id ? 'Loading...' : 'Subscribe'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* SaaS Feature Comparison */}
            <div className="overflow-x-auto mb-10 -mx-4 sm:mx-0">
              <table className="w-full border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-4 px-4 text-sm font-medium text-zinc-400">Feature</th>
                    {SAAS_PLANS.map((plan) => (
                      <th key={plan.id} className={`text-center py-4 px-3 text-sm font-medium ${
                        plan.id === 'creator_pro' ? 'text-teal-400' : 'text-zinc-400'
                      }`}>
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SAAS_FEATURES.map((feature, index) => (
                    <tr key={feature.name} className={index % 2 === 0 ? 'bg-zinc-900/30' : ''}>
                      <td className="py-3 px-4 text-sm text-zinc-300">{feature.name}</td>
                      {feature.values.map((val, i) => (
                        <td key={i} className={`py-3 px-3 text-center ${
                          SAAS_PLANS[i]?.id === 'creator_pro' ? 'bg-teal-500/5' : ''
                        }`}>
                          {renderFeatureValue(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Video Editing Plans */}
        {activeTab === 'video' && (
          <>
            {/* Video Editing Header */}
            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-8 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/30 flex items-center justify-center">
                  <Video className="w-6 h-6 text-teal-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Hire Our Video Editor Team</h2>
                  <p className="text-zinc-400">We edit. You post. It&apos;s that simple.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
                {VIDEO_PLANS.map((plan) => {
                  const isCurrentPlan = currentPlan === plan.id;
                  const isPopular = 'popular' in plan && plan.popular;

                  return (
                    <div
                      key={plan.id}
                      className={`relative bg-zinc-900/80 backdrop-blur border rounded-xl p-5 ${
                        isPopular
                          ? 'border-purple-500 ring-1 ring-purple-500/50'
                          : isCurrentPlan
                          ? 'border-emerald-500'
                          : 'border-zinc-700'
                      }`}
                    >
                      {isPopular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-purple-500 text-white text-xs font-medium rounded-full">
                          Most Popular
                        </div>
                      )}

                      <h3 className="font-semibold text-white">{plan.name}</h3>
                      <p className="text-3xl font-bold text-white mt-2">{plan.videos}</p>
                      <p className="text-zinc-400 text-sm">videos/month</p>
                      <p className="text-xs text-zinc-500 mt-1">{plan.tagline}</p>

                      <div className="my-4 pt-4 border-t border-zinc-700">
                        <p className="text-2xl font-bold text-white">${plan.price}</p>
                        <p className="text-zinc-500 text-sm">/month</p>
                        <p className="text-teal-400 text-xs mt-1">{plan.perVideo}/video</p>
                      </div>

                      <p className="text-xs text-teal-400 mb-4">
                        ✓ {plan.aiIncluded} included FREE
                      </p>

                      {isCurrentPlan ? (
                        <div className="w-full text-center text-sm text-emerald-400 py-2.5 font-medium border border-emerald-500/30 rounded-lg bg-emerald-500/10">
                          Current Plan
                        </div>
                      ) : (
                        <button type="button"
                          onClick={() => handleSubscribe(plan.id as PlanName)}
                          disabled={checkoutLoading === plan.id}
                          className={`w-full py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                            isPopular
                              ? 'bg-teal-600 hover:bg-purple-700 text-white'
                              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                          }`}
                        >
                          {checkoutLoading === plan.id ? 'Loading...' : 'Get Started'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 text-center">
                <p className="text-zinc-400 text-sm">
                  All packages include professional editing, unlimited revisions, and 24-48hr turnaround.
                </p>
                <p className="text-zinc-500 text-xs mt-2">
                  After payment, we&apos;ll schedule an onboarding call to understand your brand and style.
                </p>
              </div>
            </div>

            {/* Video Feature Comparison */}
            <div className="overflow-x-auto mb-10 -mx-4 sm:mx-0">
              <table className="w-full border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-4 px-4 text-sm font-medium text-zinc-400">Feature</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-zinc-400">Starter</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-teal-400">Growth</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-zinc-400">Scale</th>
                    <th className="text-center py-4 px-4 text-sm font-medium text-zinc-400">Agency</th>
                  </tr>
                </thead>
                <tbody>
                  {VIDEO_FEATURES.map((feature, index) => (
                    <tr key={feature.name} className={index % 2 === 0 ? 'bg-zinc-900/30' : ''}>
                      <td className="py-3 px-4 text-sm text-zinc-300">{feature.name}</td>
                      <td className="py-3 px-4 text-center">{renderFeatureValue(feature.starter)}</td>
                      <td className="py-3 px-4 text-center bg-purple-500/5">{renderFeatureValue(feature.growth)}</td>
                      <td className="py-3 px-4 text-center">{renderFeatureValue(feature.scale)}</td>
                      <td className="py-3 px-4 text-center">{renderFeatureValue(feature.agency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* FAQ Section */}
        <div className="mb-10">
          <h2 className="text-xl font-semibold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <FAQItem key={index} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </div>

        {/* Contact Sales */}
        <div className="text-center p-6 bg-zinc-900/50 rounded-xl border border-white/10">
          <h3 className="text-lg font-semibold mb-2">Need a custom plan?</h3>
          <p className="text-zinc-400 text-sm mb-4">
            Contact our sales team for enterprise pricing and custom solutions.
          </p>
          <Link
            href="/contact?plan=enterprise"
            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Contact Sales
          </Link>
        </div>

        {/* Debug Info */}
        <div className="mt-6 p-4 bg-zinc-900/30 rounded-lg border border-white/5">
          <div className="text-xs text-zinc-600 space-y-1">
            <div>User: {authUser.email || authUser.id}</div>
            <div>Plan: {currentPlan}</div>
            <div>Type: {subscriptionType || 'saas'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
