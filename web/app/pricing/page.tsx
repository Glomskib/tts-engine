'use client';

import { useState } from 'react';
import type { Metadata } from 'next';
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
        <h1 className="text-5xl font-bold mb-6">Pricing Built for TikTok Shop Affiliates</h1>
        <p className="text-xl text-gray-300 mb-8">
          Free forever tier. No setup fees. Cancel anytime.
        </p>
      </div>

      {/* Monthly/Annual Toggle */}
      <div className="max-w-6xl mx-auto px-4 mb-8 flex justify-center items-center gap-4">
        <span className={`text-sm font-medium ${!isAnnual ? 'text-white' : 'text-gray-400'}`}>
          Monthly
        </span>
        <button
          type="button"
          onClick={() => setIsAnnual(!isAnnual)}
          className="relative w-14 h-7 rounded-full bg-gray-700 transition-colors"
          aria-label="Toggle billing period"
        >
          <div
            className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
              isAnnual ? 'left-8' : 'left-1'
            }`}
          />
        </button>
        <span className={`text-sm font-medium ${isAnnual ? 'text-white' : 'text-gray-400'}`}>
          Annual <span className="text-emerald-500">Save 20%</span>
        </span>
      </div>

      {/* Checkout Error Banner */}
      {checkoutError && (
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <span>{checkoutError}</span>
            <button type="button" onClick={() => setCheckoutError(null)} className="text-red-400 hover:text-red-300 shrink-0">✕</button>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Free Plan */}
          <div className="rounded-xl p-8 border border-gray-700 bg-gray-800/30 hover:border-gray-600 transition-all">
            <h3 className="text-2xl font-bold mb-1">{PRICING_PLANS.free.name}</h3>
            <p className="text-gray-400 text-sm mb-6">Perfect for testing scripts</p>

            <div className="mb-2">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-gray-400">/month</span>
            </div>
            <p className="text-sm text-emerald-400 mb-6">Start free — No Credit Card Required</p>

            <Link
              href="/signup"
              className="block w-full py-3 px-4 rounded-lg font-semibold text-center mb-8 transition bg-gray-700 text-white hover:bg-gray-600"
            >
              Get Started
            </Link>

            <ul className="space-y-3">
              {PRICING_PLANS.free.features.map((feature, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-teal-500 mr-3 mt-1">✓</span>
                  <span className="text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Lite Plan */}
          <div className="rounded-xl p-8 border border-gray-700 bg-gray-800/30 hover:border-gray-600 transition-all">
            <h3 className="text-2xl font-bold mb-1">{PRICING_PLANS.lite.name}</h3>
            <p className="text-gray-400 text-sm mb-6">For early-stage affiliates</p>

            <div className="mb-2">
              <span className="text-4xl font-bold">
                ${isAnnual && PRICING_PLANS.lite.annual ? Math.floor(PRICING_PLANS.lite.annual.price / 12) : PRICING_PLANS.lite.monthly?.price}
              </span>
              <span className="text-gray-400">/month</span>
            </div>
            {isAnnual && PRICING_PLANS.lite.annual && (
              <div className="mb-4">
                <span className="text-sm text-emerald-400">
                  {PRICING_PLANS.lite.annual.monthlyEquiv}/mo • Save {PRICING_PLANS.lite.annual.savings}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleCheckout('lite', isAnnual)}
              disabled={checkoutLoading !== null}
              className="block w-full py-3 px-4 rounded-lg font-semibold text-center mb-8 transition bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkoutLoading === 'lite' ? 'Redirecting…' : 'Start Free Trial'}
            </button>

            <ul className="space-y-3">
              {PRICING_PLANS.lite.features.map((feature, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-teal-500 mr-3 mt-1">✓</span>
                  <span className="text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro Plan (Most Popular) */}
          <div className="rounded-xl p-8 border border-teal-500 bg-teal-500/10 transform lg:scale-105 shadow-lg shadow-teal-500/20 transition-all">
            <div className="mb-4 inline-block px-3 py-1 bg-emerald-500 text-white text-sm rounded-full font-semibold">
              {PRICING_PLANS.pro.badge}
            </div>
            <h3 className="text-2xl font-bold mb-1">{PRICING_PLANS.pro.name}</h3>
            <p className="text-gray-400 text-sm mb-6">For serious TikTok Shop affiliates</p>

            <div className="mb-2">
              <span className="text-4xl font-bold">
                ${isAnnual && PRICING_PLANS.pro.annual ? Math.floor(PRICING_PLANS.pro.annual.price / 12) : PRICING_PLANS.pro.monthly?.price}
              </span>
              <span className="text-gray-400">/month</span>
            </div>
            {isAnnual && PRICING_PLANS.pro.annual && (
              <div className="mb-4">
                <span className="text-sm text-emerald-400">
                  {PRICING_PLANS.pro.annual.monthlyEquiv}/mo • Save {PRICING_PLANS.pro.annual.savings}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleCheckout('pro', isAnnual)}
              disabled={checkoutLoading !== null}
              className="block w-full py-3 px-4 rounded-lg font-semibold text-center mb-8 transition bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkoutLoading === 'pro' ? 'Redirecting…' : 'Start Free Trial'}
            </button>

            <ul className="space-y-3">
              {PRICING_PLANS.pro.features.map((feature, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-teal-500 mr-3 mt-1">✓</span>
                  <span className="text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Business Plan */}
          <div className="rounded-xl p-8 border border-gray-700 bg-gray-800/30 hover:border-gray-600 transition-all">
            <h3 className="text-2xl font-bold mb-1">{PRICING_PLANS.business.name}</h3>
            <p className="text-gray-400 text-sm mb-6">For multi-brand affiliates</p>

            <div className="mb-2">
              <span className="text-4xl font-bold">
                ${isAnnual && PRICING_PLANS.business.annual ? Math.floor(PRICING_PLANS.business.annual.price / 12) : PRICING_PLANS.business.monthly?.price}
              </span>
              <span className="text-gray-400">/month</span>
            </div>
            {isAnnual && PRICING_PLANS.business.annual && (
              <div className="mb-4">
                <span className="text-sm text-emerald-400">
                  {PRICING_PLANS.business.annual.monthlyEquiv}/mo • Save {PRICING_PLANS.business.annual.savings}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleCheckout('business', isAnnual)}
              disabled={checkoutLoading !== null}
              className="block w-full py-3 px-4 rounded-lg font-semibold text-center mb-8 transition bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkoutLoading === 'business' ? 'Redirecting…' : 'Start Free Trial'}
            </button>

            <ul className="space-y-3">
              {PRICING_PLANS.business.features.map((feature, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-teal-500 mr-3 mt-1">✓</span>
                  <span className="text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Brand & Agency - Contact Us */}
          {['brand', 'agency'].map((planKey) => {
            const plan = PRICING_PLANS[planKey as keyof typeof PRICING_PLANS];
            if (!plan.contactUs) return null;

            return (
              <div key={planKey} className="rounded-xl p-8 border border-gray-700 bg-gray-800/30 hover:border-gray-600 transition-all">
                <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                <p className="text-gray-400 text-sm mb-6">Custom pricing</p>

                <div className="mb-6">
                  <span className="text-2xl font-bold text-gray-400">Contact Us</span>
                </div>

                <a
                  href={`mailto:${plan.contactEmail}`}
                  className="block w-full py-3 px-4 rounded-lg font-semibold text-center mb-8 transition bg-gray-700 text-white hover:bg-gray-600"
                >
                  Contact Sales
                </a>

                <ul className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-teal-500 mr-3 mt-1">✓</span>
                      <span className="text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-4xl mx-auto px-4 py-16 border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-12 text-center">Frequently Asked Questions</h2>
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold mb-2">What's the difference between the tiers?</h3>
            <p className="text-gray-300">
              Free is for testing. Lite ($9) is for 1-2 brands with retainers & bonuses. Pro ($29) is unlimited scripts + full Winners Bank + multi-brand tracking. Business ($59) adds priority support + custom integrations. Brand & Agency are custom enterprise plans.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">Can I switch plans anytime?</h3>
            <p className="text-gray-300">
              Yes. Upgrade or downgrade anytime. Changes take effect on your next billing cycle.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">How does the referral system work?</h3>
            <p className="text-gray-300">
              Share your referral link. When someone signs up, you both get 1 month of free credits. This is separate from affiliate commissions.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">What are affiliate commissions?</h3>
            <p className="text-gray-300">
              If you're a TikTok Shop affiliate selling products through FlashFlow, you earn 25% commission on every sale. Referrals are different — they're 1 month free credits for you and your friend.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">Can I cancel anytime?</h3>
            <p className="text-gray-300">
              Yes. Month-to-month, no contracts. Cancel anytime from your account settings — no questions asked.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">What payment methods do you accept?</h3>
            <p className="text-gray-300">
              All major credit cards (Visa, Mastercard, Amex) and PayPal.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-4">Ready to create viral content?</h2>
        <p className="text-gray-300 mb-8">Start with our free plan. No credit card required.</p>
        <Link
          href="/signup"
          className="inline-block px-8 py-4 bg-teal-500 text-white rounded-lg font-semibold hover:bg-teal-600 transition"
        >
          Get Started Free
        </Link>
      </div>
    </div>
  );
}
