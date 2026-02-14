import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing - AI Script Generator',
  description:
    'Choose the right plan for your content creation needs. Free tier includes 5 transcriptions/day. Premium plans from $9/month.',
  openGraph: {
    title: 'Pricing | FlashFlow AI',
    description: 'Transparent pricing for creators, brands, and agencies.',
    type: 'website',
    images: [{ url: '/FFAI.png', width: 512, height: 512 }],
  },
};

export default function PricingPage() {
  const plans = [
    {
      name: 'Free',
      price: '0',
      description: 'Perfect for trying FlashFlow',
      features: [
        '5 transcriptions/day',
        '10 scripts/month',
        'Basic hook analysis',
        'Standard support',
        'Free TikTok transcriber',
      ],
      cta: 'Get Started',
      href: '/signup',
      highlighted: false,
    },
    {
      name: 'Creator Lite',
      price: '9',
      period: '/month',
      description: 'For growing creators',
      features: [
        'Unlimited transcriptions',
        '100 scripts/month',
        'Advanced hook analysis',
        'Emotion trigger detection',
        'Email support',
        'Content recommendations',
      ],
      cta: 'Start Free Trial',
      href: '/signup?plan=lite',
      highlighted: false,
    },
    {
      name: 'Creator Pro',
      price: '29',
      period: '/month',
      description: 'For serious TikTok creators',
      features: [
        'Everything in Lite',
        'AI avatar video generation',
        'Batch script generation',
        '500 scripts/month',
        'Priority support',
        'Winners Bank access',
        'Custom personas',
      ],
      cta: 'Start Free Trial',
      href: '/signup?plan=pro',
      highlighted: true,
    },
    {
      name: 'Brand',
      price: '49',
      period: '/month',
      description: 'For brands and TikTok Shop sellers',
      features: [
        'Everything in Pro',
        'Team accounts (3 seats)',
        'Advanced analytics',
        'TikTok Shop integration',
        'API access',
        'Custom branding',
        'Dedicated support',
      ],
      cta: 'Contact Sales',
      href: '/contact',
      highlighted: false,
    },
    {
      name: 'Agency',
      price: '149',
      period: '/month',
      description: 'For marketing agencies',
      features: [
        'Everything in Brand',
        'Unlimited team seats',
        'White-label option',
        'Client management',
        'Advanced API access',
        'Priority onboarding',
        '24/7 phone support',
      ],
      cta: 'Contact Sales',
      href: '/contact',
      highlighted: false,
    },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-5xl font-bold mb-6">Simple, Transparent Pricing</h1>
        <p className="text-xl text-gray-300 mb-8">
          Start free. Upgrade when you're ready. No hidden fees.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`rounded-xl p-8 border transition-all ${
                plan.highlighted
                  ? 'border-teal-500 bg-teal-500/10 transform lg:scale-105 shadow-lg shadow-teal-500/20'
                  : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
              }`}
            >
              {plan.highlighted && (
                <div className="mb-4 inline-block px-3 py-1 bg-teal-500 text-white text-sm rounded-full font-semibold">
                  Most Popular
                </div>
              )}
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <p className="text-gray-400 text-sm mb-6">{plan.description}</p>

              <div className="mb-6">
                <span className="text-4xl font-bold">${plan.price}</span>
                {plan.period && <span className="text-gray-400">{plan.period}</span>}
              </div>

              <Link
                href={plan.href}
                className={`block w-full py-3 px-4 rounded-lg font-semibold text-center mb-8 transition ${
                  plan.highlighted
                    ? 'bg-teal-500 text-white hover:bg-teal-600'
                    : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
              >
                {plan.cta}
              </Link>

              <ul className="space-y-3">
                {plan.features.map((feature, fidx) => (
                  <li key={fidx} className="flex items-start">
                    <span className="text-teal-500 mr-3 mt-1">✓</span>
                    <span className="text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-4xl mx-auto px-4 py-16 border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-12 text-center">Frequently Asked Questions</h2>
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold mb-2">Can I cancel anytime?</h3>
            <p className="text-gray-300">
              Yes. No contracts, no commitments. Cancel your subscription anytime from your account settings.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">Do you offer discounts for annual billing?</h3>
            <p className="text-gray-300">
              Yes! Pay yearly and save 20% on all plans. Contact sales for bulk discounts.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">What payment methods do you accept?</h3>
            <p className="text-gray-300">
              We accept all major credit cards (Visa, Mastercard, American Express) and PayPal.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">Is there a free trial?</h3>
            <p className="text-gray-300">
              Yes! Free tier gives you 5 transcriptions/day and 10 scripts/month forever. Paid plans include 7-day free trial.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">Do you offer custom plans?</h3>
            <p className="text-gray-300">
              Yes. Contact our sales team for custom pricing based on your usage needs.
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
