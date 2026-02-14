import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing - TikTok Shop Script Generator',
  description:
    'FlashFlow pricing for TikTok Shop affiliates. Free tier with 5 scripts/month. Pro plan at $29/month includes unlimited scripts and Winners Bank.',
  openGraph: {
    title: 'Pricing | FlashFlow AI',
    description: 'Transparent pricing built for TikTok Shop affiliates.',
    type: 'website',
    images: [{ url: '/FFAI.png', width: 512, height: 512 }],
  },
};

export default function PricingPage() {
  const plans = [
    {
      name: 'Free',
      tagline: 'Try FlashFlow',
      price: '0',
      description: 'Perfect for testing scripts',
      features: [
        '5 scripts/month',
        '3 products in Winners Bank',
        '1 persona',
        'Community support',
        'No credit card',
      ],
      cta: 'Get Started',
      href: '/signup',
      highlighted: false,
    },
    {
      name: 'Lite',
      tagline: 'Start Creating',
      price: '9',
      period: '/month',
      description: 'For early-stage affiliates',
      features: [
        '50 scripts/month',
        '20 products in Winners Bank',
        '5 personas',
        'Content Calendar',
        'Basic retainer tracking',
        'Email support',
      ],
      cta: 'Start Free Trial',
      href: '/signup?plan=lite',
      highlighted: false,
    },
    {
      name: 'Pro',
      tagline: 'Scale Your Content',
      price: '29',
      period: '/month',
      description: 'For serious TikTok Shop affiliates',
      features: [
        'Unlimited scripts',
        'All 20 personas',
        'Unlimited products',
        'Winners Bank (all data)',
        'Multi-brand Content Calendar',
        'Retainer goal tracking',
        'Advanced analytics',
        'Priority support',
      ],
      cta: 'Start Free Trial',
      href: '/signup?plan=pro',
      highlighted: true,
    },
    {
      name: 'Brand',
      tagline: 'Multi-Brand Power',
      price: '49',
      period: '/month',
      description: 'For creators managing multiple brands',
      features: [
        'Everything in Pro',
        'Team accounts (3 seats)',
        '50 AI video packages/month',
        'Brand-specific dashboards',
        'Retainer payment tracking',
        'API access',
        'Dedicated support',
      ],
      cta: 'Start Free Trial',
      href: '/signup?plan=brand',
      highlighted: false,
    },
    {
      name: 'Agency',
      tagline: 'Enterprise Scale',
      price: '149',
      period: '/month',
      description: 'For agencies & high-volume teams',
      features: [
        'Everything in Brand',
        'Unlimited team seats',
        'Unlimited video packages',
        'Client management portal',
        'Advanced API access',
        'Custom integrations',
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
        <h1 className="text-5xl font-bold mb-6">Pricing Built for TikTok Shop Affiliates</h1>
        <p className="text-xl text-gray-300 mb-8">
          Free forever tier. No setup fees. Cancel anytime.
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
                <div className="mb-4 inline-block px-3 py-1 bg-emerald-500 text-white text-sm rounded-full font-semibold">
                  Most Popular
                </div>
              )}
              <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
              {plan.tagline && (
                <p className="text-emerald-400 text-sm font-medium mb-3">{plan.tagline}</p>
              )}
              <p className="text-gray-400 text-sm mb-6">{plan.description}</p>

              <div className="mb-6">
                <span className="text-4xl font-bold">${plan.price}</span>
                {plan.period && <span className="text-gray-400">{plan.period}</span>}
              </div>

              <Link
                href={plan.href}
                className={`block w-full py-3 px-4 rounded-lg font-semibold text-center mb-8 transition ${
                  plan.highlighted
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
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
            <h3 className="text-lg font-bold mb-2">What's the difference between the tiers?</h3>
            <p className="text-gray-300">
              Free is for testing. Lite ($9) is for 1-2 brands with retainer tracking. Pro ($29) is unlimited scripts + full Winners Bank + multi-brand tracking. Brand ($49) adds team seats + API. Agency ($149) is for scaling teams.
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
