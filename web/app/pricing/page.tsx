'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Check, X, Sparkles, Video, Zap, ArrowRight } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { PRICING } from '@/lib/pricing';

// SaaS Plans from centralized pricing
const SAAS_PLANS = Object.values(PRICING.saas);

// Video Editing Plans from centralized pricing
const VIDEO_PLANS = Object.values(PRICING.video);

// SaaS Features comparison
const SAAS_FEATURES = [
  { name: 'AI Credits/month', free: '5', starter: '75', creator: '300', business: '1,000' },
  { name: 'Skit Generator', free: true, starter: true, creator: true, business: true },
  { name: 'Character Presets', free: 'Basic', starter: 'All', creator: 'All', business: 'All' },
  { name: 'Save Scripts', free: '3', starter: 'Unlimited', creator: 'Unlimited', business: 'Unlimited' },
  { name: 'Product Catalog', free: false, starter: '5 products', creator: 'Unlimited', business: 'Unlimited' },
  { name: 'Audience Intelligence', free: false, starter: false, creator: true, business: true },
  { name: 'Winners Bank', free: false, starter: false, creator: true, business: true },
  { name: 'Pain Point Analysis', free: false, starter: false, creator: true, business: true },
  { name: 'Team Members', free: '1', starter: '1', creator: '1', business: '5' },
  { name: 'Support', free: 'Community', starter: 'Email', creator: 'Priority', business: 'Dedicated' },
];

// Video Features comparison
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
  {
    question: 'Is there a free trial?',
    answer: 'Yes! Start with our Free plan to explore the AI tools. You get 5 credits to try the Skit Generator and see how it works for your content.'
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Absolutely. There are no long-term contracts. Cancel anytime from your account settings, and you\'ll retain access until the end of your billing period.'
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

export default function PricingPage() {
  const [activeTab, setActiveTab] = useState<'saas' | 'video'>('saas');

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      {/* Background effects */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/10 via-violet-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Navigation */}
      <nav className="relative border-b border-white/10 bg-zinc-900/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src={BRAND.logo}
                alt={BRAND.name}
                width={32}
                height={32}
                className="rounded-lg"
              />
              <span className="text-xl font-bold text-zinc-100">{BRAND.name}</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/login?mode=signup"
                className="px-4 py-2 bg-white text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-100 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="relative py-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
              <Zap className="w-4 h-4" />
              Simple, transparent pricing
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Choose the plan that&apos;s right for you
            </h1>
            <p className="text-zinc-400 max-w-2xl mx-auto text-lg">
              Start free and scale as you grow. AI-powered content creation tools or professional video editing services.
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex justify-center mb-12">
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
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {SAAS_PLANS.map((plan) => {
                  const isPopular = 'popular' in plan && plan.popular;

                  return (
                    <div
                      key={plan.id}
                      className={`p-6 rounded-xl border-2 relative ${
                        isPopular
                          ? 'border-blue-500/50 bg-blue-500/5'
                          : 'border-white/10 bg-zinc-900/30'
                      }`}
                    >
                      {isPopular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-500 text-xs font-medium text-white">
                          Most Popular
                        </div>
                      )}

                      <div className="mb-4">
                        <h3 className="text-lg font-semibold">{plan.name}</h3>
                        <div className="text-3xl font-bold mt-2">
                          ${plan.price}
                          <span className="text-sm font-normal text-zinc-500">
                            {plan.id === 'free' ? '' : '/mo'}
                          </span>
                        </div>
                      </div>

                      <div className="text-sm text-blue-400 mb-6">
                        {plan.credits} credits{plan.id === 'free' ? ' (one-time)' : '/month'}
                      </div>

                      {/* Feature list */}
                      <ul className="space-y-2 mb-6">
                        {plan.features.slice(0, 5).map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            {feature.included ? (
                              <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            ) : (
                              <X className="w-4 h-4 text-zinc-600 mt-0.5 flex-shrink-0" />
                            )}
                            <span className={feature.included ? 'text-zinc-300' : 'text-zinc-600'}>
                              {feature.text}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {plan.id === 'free' ? (
                        <Link
                          href="/login?mode=signup"
                          className="block w-full text-center py-2.5 rounded-lg font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
                        >
                          Get Started Free
                        </Link>
                      ) : (
                        <Link
                          href={`/login?mode=signup&plan=${plan.id}`}
                          className={`block w-full text-center py-2.5 rounded-lg font-medium transition-colors ${
                            isPopular
                              ? 'bg-white text-zinc-900 hover:bg-zinc-100'
                              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                          }`}
                        >
                          Start Free Trial
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* SaaS Feature Comparison */}
              <div className="mb-16">
                <h2 className="text-2xl font-semibold text-center mb-8">Compare AI Tools Plans</h2>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-4 px-4 text-sm font-medium text-zinc-400">Feature</th>
                        <th className="text-center py-4 px-4 text-sm font-medium text-zinc-400">Free</th>
                        <th className="text-center py-4 px-4 text-sm font-medium text-zinc-400">Starter</th>
                        <th className="text-center py-4 px-4 text-sm font-medium text-blue-400">Creator</th>
                        <th className="text-center py-4 px-4 text-sm font-medium text-zinc-400">Business</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SAAS_FEATURES.map((feature, index) => (
                        <tr key={feature.name} className={index % 2 === 0 ? 'bg-zinc-900/30' : ''}>
                          <td className="py-3 px-4 text-sm text-zinc-300">{feature.name}</td>
                          <td className="py-3 px-4 text-center">{renderFeatureValue(feature.free)}</td>
                          <td className="py-3 px-4 text-center">{renderFeatureValue(feature.starter)}</td>
                          <td className="py-3 px-4 text-center bg-blue-500/5">{renderFeatureValue(feature.creator)}</td>
                          <td className="py-3 px-4 text-center">{renderFeatureValue(feature.business)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                    <Video className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Professional Video Editing</h2>
                    <p className="text-zinc-400">We edit. You post. It&apos;s that simple.</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
                  {VIDEO_PLANS.map((plan) => {
                    const isPopular = 'popular' in plan && plan.popular;

                    return (
                      <div
                        key={plan.id}
                        className={`relative bg-zinc-900/80 backdrop-blur border rounded-xl p-5 ${
                          isPopular
                            ? 'border-purple-500 ring-1 ring-purple-500/50'
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
                          <p className="text-purple-400 text-xs mt-1">{plan.perVideo}/video</p>
                        </div>

                        <p className="text-xs text-teal-400 mb-4">
                          {plan.aiIncluded} included FREE
                        </p>

                        <Link
                          href={`/login?mode=signup&plan=${plan.id}`}
                          className={`block w-full text-center py-2.5 rounded-lg font-medium transition-colors ${
                            isPopular
                              ? 'bg-purple-600 hover:bg-purple-700 text-white'
                              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                          }`}
                        >
                          Get Started
                        </Link>
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
              <div className="mb-16">
                <h2 className="text-2xl font-semibold text-center mb-8">Compare Video Editing Plans</h2>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-4 px-4 text-sm font-medium text-zinc-400">Feature</th>
                        <th className="text-center py-4 px-4 text-sm font-medium text-zinc-400">Starter</th>
                        <th className="text-center py-4 px-4 text-sm font-medium text-purple-400">Growth</th>
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
              </div>
            </>
          )}

          {/* FAQ Section */}
          <div className="mb-16">
            <h2 className="text-2xl font-semibold text-center mb-8">Frequently Asked Questions</h2>
            <div className="max-w-3xl mx-auto space-y-4">
              {faqs.map((faq, index) => (
                <FAQItem key={index} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center p-10 bg-gradient-to-br from-blue-500/10 to-violet-500/10 rounded-2xl border border-blue-500/20">
            <h2 className="text-2xl font-bold mb-3">Ready to create viral content?</h2>
            <p className="text-zinc-400 mb-6 max-w-lg mx-auto">
              Join thousands of creators using FlashFlow AI to generate engaging scripts and produce professional videos.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-zinc-900 font-medium rounded-lg hover:bg-zinc-100 transition-colors"
              >
                Start Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/contact?plan=enterprise"
                className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 text-white font-medium rounded-lg hover:bg-zinc-700 transition-colors"
              >
                Contact Sales
              </Link>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-16 pt-8 border-t border-white/10 text-center text-zinc-500 text-sm">
            <p>&copy; {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
