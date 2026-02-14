import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Features - AI Script Generation Tools',
  description:
    'Discover all FlashFlow features: TikTok transcriber, AI script generation, avatar videos, Winners Bank, and TikTok Shop integration.',
  openGraph: {
    title: 'Features | FlashFlow AI',
    description: 'Complete AI toolkit for short-form video creation.',
    type: 'website',
    images: [{ url: '/FFAI.png', width: 512, height: 512 }],
  },
};

export default function FeaturesPage() {
  const features = [
    {
      title: 'Free TikTok Video Transcriber',
      description: 'Paste any TikTok URL and instantly get the full transcript, hook analysis, emotional triggers, and content breakdown. No signup required.',
      icon: '📝',
      link: '/transcribe',
    },
    {
      title: 'AI Script Generator',
      description: 'Generate personalized video scripts in seconds. Choose from 6 personas (persuasive, skeptical, educational, entertaining, aspirational, authoritative). Get multiple variations and pick the winner.',
      icon: '🎬',
      link: '/signup',
    },
    {
      title: 'AI Avatar Video Generation',
      description: 'Scripts automatically become videos. Choose from our AI avatars or upload your own. No filming, no editing. One-click rendering.',
      icon: '🤖',
      link: '/signup?plan=pro',
    },
    {
      title: 'Winners Bank',
      description: 'Database of viral TikTok patterns organized by product category. See what hooks convert, what emotions sell, what pacing works. Build data-driven content strategies.',
      icon: '🏆',
      link: '/signup?plan=pro',
    },
    {
      title: 'Hook Strength Scoring',
      description: 'Every script gets a hook score (1-10) with reasoning. Understand why a hook works. Learn from top performers. Iterate and improve.',
      icon: '⚡',
      link: '/transcribe',
    },
    {
      title: 'Emotional Trigger Detection',
      description: 'AI identifies emotional hooks in content: curiosity, FOMO, humor, aspiration, fear. Understand what emotion will sell your product.',
      icon: '❤️',
      link: '/signup?plan=lite',
    },
    {
      title: 'TikTok Shop Integration',
      description: 'Connect your TikTok Shop account. Generate product videos automatically. Direct posting to TikTok Shop. Track performance per video.',
      icon: '🛍️',
      link: '/signup?plan=brand',
    },
    {
      title: 'Batch Video Generation',
      description: 'Generate 10–100 video variations at once. Test different hooks on the same product. Find the winner. Scale it.',
      icon: '🚀',
      link: '/signup?plan=pro',
    },
    {
      title: 'Content Structure Breakdown',
      description: 'AI analyzes scene pacing, transitions, text overlays, music drops, and calls-to-action. Learn the anatomy of viral videos.',
      icon: '📊',
      link: '/transcribe',
    },
    {
      title: 'API Access',
      description: 'Build custom workflows. Integrate transcription, script generation, and video creation into your apps or tools.',
      icon: '🔌',
      link: '/signup?plan=brand',
    },
    {
      title: 'Team Collaboration',
      description: 'Add team members, assign roles (creator, editor, reviewer). Manage workflows. Track who did what.',
      icon: '👥',
      link: '/signup?plan=brand',
    },
    {
      title: 'White-Label Option',
      description: 'Agencies: White-label FlashFlow for your clients. Customize branding. Offer as your own tool.',
      icon: '🎨',
      link: '/signup?plan=agency',
    },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-5xl font-bold mb-6">Powerful Features for Viral Content</h1>
        <p className="text-xl text-gray-300 mb-8">
          Everything you need to create, analyze, and scale short-form video content.
        </p>
      </div>

      {/* Features Grid */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, idx) => (
            <Link
              key={idx}
              href={feature.link}
              className="p-6 bg-gray-800/30 border border-gray-700 rounded-xl hover:border-teal-500 hover:bg-teal-500/5 transition"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
              <p className="text-gray-300 text-sm">{feature.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Comparison Table */}
      <section className="max-w-6xl mx-auto px-4 py-16 border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-8 text-center">Feature Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-4 px-4 font-semibold">Feature</th>
                <th className="text-center py-4 px-4">Free</th>
                <th className="text-center py-4 px-4">Creator Lite</th>
                <th className="text-center py-4 px-4">Creator Pro</th>
                <th className="text-center py-4 px-4">Brand</th>
                <th className="text-center py-4 px-4">Agency</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">Transcriptions/day</td>
                <td className="text-center py-4 px-4">5</td>
                <td className="text-center py-4 px-4">Unlimited</td>
                <td className="text-center py-4 px-4">Unlimited</td>
                <td className="text-center py-4 px-4">Unlimited</td>
                <td className="text-center py-4 px-4">Unlimited</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">Scripts/month</td>
                <td className="text-center py-4 px-4">10</td>
                <td className="text-center py-4 px-4">100</td>
                <td className="text-center py-4 px-4">500</td>
                <td className="text-center py-4 px-4">1000</td>
                <td className="text-center py-4 px-4">Unlimited</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">AI Avatar Videos</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✓</td>
                <td className="text-center py-4 px-4">✓</td>
                <td className="text-center py-4 px-4">✓</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">Winners Bank</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✓</td>
                <td className="text-center py-4 px-4">✓</td>
                <td className="text-center py-4 px-4">✓</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">Batch Generation</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✓</td>
                <td className="text-center py-4 px-4">✓</td>
                <td className="text-center py-4 px-4">✓</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">TikTok Shop Integration</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✓</td>
                <td className="text-center py-4 px-4">✓</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">Team Collaboration</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✓</td>
                <td className="text-center py-4 px-4">✓</td>
              </tr>
              <tr>
                <td className="py-4 px-4">API Access</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✗</td>
                <td className="text-center py-4 px-4">✓</td>
                <td className="text-center py-4 px-4">✓</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* CTA */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-4">Start Creating Today</h2>
        <p className="text-gray-300 mb-8">Free tier includes 5 transcriptions/day. No credit card required.</p>
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
