'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PRICING_PLANS } from '@/lib/plans';

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleCheckout = async (planId: string, annual: boolean) => {
    setCheckoutError(null);
    setCheckoutLoading(planId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, annual }),
      });

      if (!res.ok) {
        setCheckoutError('Could not start checkout. Please try again or contact support.');
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      setCheckoutError('Something went wrong. Please check your connection and try again.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
        <p className="text-xl text-gray-300 mb-6">
          Built for TikTok &amp; Instagram creators. Works for YouTube, Facebook, and brand owners too. Start free.
        </p>
        <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> No credit card required</span>
          <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Cancel anytime</span>
          <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Free tools included</span>
        </div>
      </div>

      {/* Monthly/Annual Toggle */}
      <div className="max-w-6xl mx-auto px-4 mb-8 flex justify-center items-center gap-4">
        <span className={`text-sm font-medium ${!isAnnual ? 'text-white' : 'text-gray-400'}`}>
          Monthly
        </span>
        <button
          type="button"
          onClick={() => setIsAnnual(!isAnnual)}
          className={`relative w-14 h-7 rounded-full transition-colors ${isAnnual ? 'bg-emerald-600' : 'bg-gray-700'}`}
          aria-label="Toggle billing period"
        >
          <div
            className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
              isAnnual ? 'left-8' : 'left-1'
            }`}
          />
        </button>
        <span className={`text-sm font-medium ${isAnnual ? 'text-white' : 'text-gray-400'}`}>
          Annual{' '}
          <span className="inline-block px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full font-semibold">
            Save 20%
          </span>
        </span>
      </div>

      {/* Checkout Error Banner */}
      {checkoutError && (
        <div className="max-w-6xl mx-auto px-4 mb-4">
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <span>{checkoutError}</span>
            <button type="button" onClick={() => setCheckoutError(null)} className="text-red-400 hover:text-red-300 shrink-0">✕</button>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Free Plan */}
          <div className="rounded-xl p-6 border border-gray-700 bg-gray-800/30 hover:border-gray-600 transition-all flex flex-col">
            <h3 className="text-xl font-bold mb-1">{PRICING_PLANS.free.name}</h3>
            <p className="text-gray-400 text-sm mb-4">Try the tools, no strings attached</p>

            <div className="mb-1">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-gray-400 text-sm">/forever</span>
            </div>
            <p className="text-xs text-emerald-400 mb-6">No credit card required</p>

            <Link
              href="/login?mode=signup"
              className="block w-full py-3 px-4 rounded-lg font-semibold text-center mb-6 transition bg-gray-700 text-white hover:bg-gray-600"
            >
              Get Started Free
            </Link>

            <ul className="space-y-2.5 flex-1">
              {PRICING_PLANS.free.features.map((feature, idx) => (
                <li key={idx} className="flex items-start text-sm">
                  <span className="text-teal-500 mr-2 mt-0.5">✓</span>
                  <span className="text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Lite Plan */}
          <div className="rounded-xl p-6 border border-gray-700 bg-gray-800/30 hover:border-gray-600 transition-all flex flex-col">
            <h3 className="text-xl font-bold mb-1">{PRICING_PLANS.lite.name}</h3>
            <p className="text-gray-400 text-sm mb-4">For early-stage creators on TikTok &amp; Reels</p>

            <div className="mb-1">
              <span className="text-4xl font-bold">
                ${isAnnual && PRICING_PLANS.lite.annual ? Math.floor(PRICING_PLANS.lite.annual.price / 12) : PRICING_PLANS.lite.monthly?.price}
              </span>
              <span className="text-gray-400 text-sm">/month</span>
            </div>
            {isAnnual && PRICING_PLANS.lite.annual ? (
              <p className="text-xs text-emerald-400 mb-6">
                <span className="line-through text-gray-500 mr-1">${PRICING_PLANS.lite.monthly?.price}/mo</span>
                Save {PRICING_PLANS.lite.annual.savings}/yr
              </p>
            ) : (
              <p className="text-xs text-gray-500 mb-6">
                or {PRICING_PLANS.lite.annual?.monthlyEquiv}/mo billed annually
              </p>
            )}

            <button
              type="button"
              onClick={() => handleCheckout('lite', isAnnual)}
              disabled={checkoutLoading !== null}
              className="block w-full py-3 px-4 rounded-lg font-semibold text-center mb-6 transition bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkoutLoading === 'lite' ? 'Redirecting…' : 'Choose Lite'}
            </button>

            <ul className="space-y-2.5 flex-1">
              {PRICING_PLANS.lite.features.map((feature, idx) => (
                <li key={idx} className="flex items-start text-sm">
                  <span className="text-teal-500 mr-2 mt-0.5">✓</span>
                  <span className="text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro Plan (Most Popular) */}
          <div className="rounded-xl p-6 border-2 border-teal-500 bg-teal-500/5 shadow-lg shadow-teal-500/10 transition-all flex flex-col relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-teal-500 text-white text-xs rounded-full font-semibold whitespace-nowrap">
              {PRICING_PLANS.pro.badge}
            </div>
            <h3 className="text-xl font-bold mb-1 mt-2">{PRICING_PLANS.pro.name}</h3>
            <p className="text-gray-400 text-sm mb-4">For serious TikTok, Reels, and YouTube creators</p>

            <div className="mb-1">
              <span className="text-4xl font-bold">
                ${isAnnual && PRICING_PLANS.pro.annual ? Math.floor(PRICING_PLANS.pro.annual.price / 12) : PRICING_PLANS.pro.monthly?.price}
              </span>
              <span className="text-gray-400 text-sm">/month</span>
            </div>
            {isAnnual && PRICING_PLANS.pro.annual ? (
              <p className="text-xs text-emerald-400 mb-6">
                <span className="line-through text-gray-500 mr-1">${PRICING_PLANS.pro.monthly?.price}/mo</span>
                Save {PRICING_PLANS.pro.annual.savings}/yr
              </p>
            ) : (
              <p className="text-xs text-gray-500 mb-6">
                or {PRICING_PLANS.pro.annual?.monthlyEquiv}/mo billed annually
              </p>
            )}

            <button
              type="button"
              onClick={() => handleCheckout('pro', isAnnual)}
              disabled={checkoutLoading !== null}
              className="block w-full py-3 px-4 rounded-lg font-semibold text-center mb-6 transition bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkoutLoading === 'pro' ? 'Redirecting…' : 'Choose Creator Pro'}
            </button>

            <ul className="space-y-2.5 flex-1">
              {PRICING_PLANS.pro.features.map((feature, idx) => (
                <li key={idx} className="flex items-start text-sm">
                  <span className="text-teal-500 mr-2 mt-0.5">✓</span>
                  <span className="text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Business Plan */}
          <div className="rounded-xl p-6 border border-gray-700 bg-gray-800/30 hover:border-gray-600 transition-all flex flex-col">
            <h3 className="text-xl font-bold mb-1">{PRICING_PLANS.business.name}</h3>
            <p className="text-gray-400 text-sm mb-4">For multi-brand creators, agencies, and small business owners</p>

            <div className="mb-1">
              <span className="text-4xl font-bold">
                ${isAnnual && PRICING_PLANS.business.annual ? Math.floor(PRICING_PLANS.business.annual.price / 12) : PRICING_PLANS.business.monthly?.price}
              </span>
              <span className="text-gray-400 text-sm">/month</span>
            </div>
            {isAnnual && PRICING_PLANS.business.annual ? (
              <p className="text-xs text-emerald-400 mb-6">
                <span className="line-through text-gray-500 mr-1">${PRICING_PLANS.business.monthly?.price}/mo</span>
                Save {PRICING_PLANS.business.annual.savings}/yr
              </p>
            ) : (
              <p className="text-xs text-gray-500 mb-6">
                or {PRICING_PLANS.business.annual?.monthlyEquiv}/mo billed annually
              </p>
            )}

            <button
              type="button"
              onClick={() => handleCheckout('business', isAnnual)}
              disabled={checkoutLoading !== null}
              className="block w-full py-3 px-4 rounded-lg font-semibold text-center mb-6 transition bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkoutLoading === 'business' ? 'Redirecting…' : 'Choose Business'}
            </button>

            <ul className="space-y-2.5 flex-1">
              {PRICING_PLANS.business.features.map((feature, idx) => (
                <li key={idx} className="flex items-start text-sm">
                  <span className="text-teal-500 mr-2 mt-0.5">✓</span>
                  <span className="text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Enterprise Plans */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {['brand', 'agency'].map((planKey) => {
            const plan = PRICING_PLANS[planKey as keyof typeof PRICING_PLANS];
            if (!plan.contactUs) return null;

            return (
              <div key={planKey} className="rounded-xl p-6 border border-gray-700 bg-gray-800/30 hover:border-gray-600 transition-all">
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className="text-gray-400 text-sm mb-4">Custom pricing</p>

                <div className="mb-6">
                  <span className="text-2xl font-bold text-gray-400">Contact Us</span>
                </div>

                <a
                  href={`mailto:${plan.contactEmail}`}
                  className="block w-full py-3 px-4 rounded-lg font-semibold text-center mb-6 transition bg-gray-700 text-white hover:bg-gray-600"
                >
                  Contact Sales
                </a>

                <ul className="space-y-2.5">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start text-sm">
                      <span className="text-teal-500 mr-2 mt-0.5">✓</span>
                      <span className="text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Try Free Tools Banner */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="rounded-xl p-6 bg-teal-500/5 border border-teal-500/20 text-center">
          <p className="text-gray-300 mb-3">Not ready to commit? Try our free tools first — no signup required.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/script-generator" className="text-sm font-medium text-teal-400 hover:text-teal-300 transition">
              AI Script Generator →
            </Link>
            <span className="text-gray-600">|</span>
            <Link href="/transcribe" className="text-sm font-medium text-teal-400 hover:text-teal-300 transition">
              TikTok &amp; Reels Transcriber →
            </Link>
            <span className="text-gray-600">|</span>
            <Link href="/youtube-transcribe" className="text-sm font-medium text-teal-400 hover:text-teal-300 transition">
              YouTube Transcriber →
            </Link>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-4xl mx-auto px-4 py-16 border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-12 text-center">Frequently Asked Questions</h2>
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold mb-2">What&apos;s included in the free plan?</h3>
            <p className="text-gray-300">
              5 AI scripts per month for TikTok, Reels, or YouTube — your choice of platform per script. Unlimited transcriptions of TikToks, Reels, or YouTube videos with our free transcriber tools. 1 brand. You can try the script generator and transcriber without even creating an account.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">What happens when I run out of scripts?</h3>
            <p className="text-gray-300">
              Your existing scripts and transcriptions are always accessible. You just can&apos;t generate new scripts until your credits reset next month, or you upgrade. The free transcriber tools are always available regardless.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">What&apos;s the difference between the tiers?</h3>
            <p className="text-gray-300">
              Free is for testing across any platform. Lite ($9) gives you 50 scripts/mo (any combination of TikTok, Reels, or YouTube) + content calendar. Creator Pro ($29) is unlimited scripts on every platform + Winners Bank + analytics + video pipeline. Business ($59) adds priority support, unlimited brands, and is the right fit for agencies and business owners running multiple accounts.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">Can I switch plans anytime?</h3>
            <p className="text-gray-300">
              Yes. Upgrade or downgrade anytime. Changes take effect on your next billing cycle. No penalties.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">Can I cancel anytime?</h3>
            <p className="text-gray-300">
              Yes. Month-to-month, no contracts. Cancel anytime from your account settings — no questions asked. Annual plans can be cancelled too, with access through the end of the billing period.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">What payment methods do you accept?</h3>
            <p className="text-gray-300">
              All major credit cards (Visa, Mastercard, Amex) via Stripe. Your payment information is never stored on our servers.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-4">Start generating scripts in 30 seconds</h2>
        <p className="text-gray-300 mb-8">Free plan. No credit card. No commitment.</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/login?mode=signup"
            className="px-8 py-3 bg-teal-500 text-white rounded-lg font-semibold hover:bg-teal-600 transition"
          >
            Create Free Account
          </Link>
          <Link
            href="/script-generator"
            className="px-8 py-3 border border-gray-600 text-white rounded-lg font-semibold hover:bg-gray-800 transition"
          >
            Try Without Signing Up
          </Link>
        </div>
      </div>
    </div>
  );
}
