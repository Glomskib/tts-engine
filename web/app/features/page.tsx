import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Features | FlashFlow AI - TikTok Script Generator, Transcriber & More',
  description:
    'Free TikTok transcriber, AI script generator with 20+ personas, Winners Bank, production pipeline, and retainer tracking. Built for TikTok Shop affiliates.',
  openGraph: {
    title: 'Features | FlashFlow AI',
    description: 'Free transcriber, AI scripts with 20+ personas, Winners Bank, and full TikTok content pipeline.',
    type: 'website',
    images: [{ url: '/FFAI.png', width: 512, height: 512 }],
  },
};

export default function FeaturesPage() {
  const features = [
    {
      title: 'Free TikTok Transcriber',
      description: 'Paste any TikTok URL — get the full transcript, hook analysis, emotional triggers, and content breakdown in seconds. No signup required.',
      icon: '📝',
      link: '/transcribe',
      free: true,
    },
    {
      title: 'Free YouTube Transcriber',
      description: 'Paste one or more YouTube URLs. Get transcripts, combined AI summary, key points, and an interactive Q&A chat across all videos.',
      icon: '🎬',
      link: '/youtube-transcribe',
      free: true,
    },
    {
      title: 'AI Script Generator',
      description: 'Type any product name, pick a persona, get a full TikTok script. 20+ voice styles from Skeptic to Hype Man to Relatable Friend. Try it free — no signup.',
      icon: '✍️',
      link: '/script-generator',
      free: true,
    },
    {
      title: 'Winners Bank',
      description: 'Save viral TikToks. AI analyzes the hook, pacing, and emotional triggers that make them work — so you can replicate the pattern with your own products.',
      icon: '🏆',
      link: '/signup',
    },
    {
      title: 'Hook Strength Scoring',
      description: 'Every transcription gets a hook score (1-10) with reasoning. Understand why a hook stops the scroll. Learn from top performers and iterate.',
      icon: '⚡',
      link: '/transcribe',
      free: true,
    },
    {
      title: 'Emotional Trigger Detection',
      description: 'AI identifies emotional hooks in content: curiosity, FOMO, humor, aspiration, fear. Know what emotion will sell your product before you film.',
      icon: '❤️',
      link: '/transcribe',
      free: true,
    },
    {
      title: 'Production Board',
      description: 'Track every video from script to filmed to posted. Never lose a draft. See your full pipeline at a glance with drag-and-drop status management.',
      icon: '📊',
      link: '/signup',
    },
    {
      title: 'Content Calendar & Retainers',
      description: 'Plan your posting schedule by brand. Set retainer video goals, track bonus tiers, and see exactly where you stand on every brand deal.',
      icon: '📅',
      link: '/signup',
    },
    {
      title: 'Script Library',
      description: 'Every script you generate is saved and searchable. Rate your best performers, track which ones get filmed, and build a reusable content library.',
      icon: '📚',
      link: '/signup',
    },
    {
      title: 'Multi-Brand Management',
      description: 'Organize products, scripts, and retainers by brand. Switch between brands instantly. Track quota progress across all your partnerships.',
      icon: '🏢',
      link: '/signup',
    },
    {
      title: 'Competitor Tracking',
      description: 'Add TikTok creators in your niche. See what hooks, formats, and products are working for them. Study the competition, then outperform them.',
      icon: '👀',
      link: '/signup',
    },
    {
      title: 'Analytics & Performance',
      description: 'Track video views, engagement, and revenue. See which scripts convert best. Make data-driven decisions about what to create next.',
      icon: '📈',
      link: '/signup',
    },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm mb-6">
          5 free tools — no signup required
        </div>
        <h1 className="text-5xl font-bold mb-6">Built for TikTok Shop Affiliates</h1>
        <p className="text-xl text-gray-300 mb-8">
          Find winners, write scripts, track retainers, and scale content — all in one place. Start with our free tools.
        </p>
      </div>

      {/* Features Grid */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, idx) => (
            <Link
              key={idx}
              href={feature.link}
              className={`relative p-6 rounded-xl transition ${
                feature.free
                  ? 'bg-teal-500/5 border border-teal-500/30 hover:border-teal-400 hover:bg-teal-500/10'
                  : 'bg-gray-800/30 border border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'
              }`}
            >
              {feature.free && (
                <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-semibold bg-teal-500 text-white rounded-full">
                  Free
                </span>
              )}
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
              <p className="text-gray-300 text-sm">{feature.description}</p>
              <span className={`inline-block mt-3 text-sm font-medium ${feature.free ? 'text-teal-400' : 'text-gray-400'}`}>
                {feature.free ? 'Try free →' : 'Learn more →'}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Comparison Table */}
      <section className="max-w-6xl mx-auto px-4 py-16 border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-2 text-center">Compare Plans</h2>
        <p className="text-gray-400 text-center mb-8">Start free, upgrade when you need more.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-4 px-4 font-semibold">Feature</th>
                <th className="text-center py-4 px-4">Free</th>
                <th className="text-center py-4 px-4">Lite</th>
                <th className="text-center py-4 px-4 text-teal-400">Creator Pro</th>
                <th className="text-center py-4 px-4">Business</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">AI Scripts</td>
                <td className="text-center py-4 px-4">5</td>
                <td className="text-center py-4 px-4">50/mo</td>
                <td className="text-center py-4 px-4">Unlimited</td>
                <td className="text-center py-4 px-4">Unlimited</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">TikTok Transcriber</td>
                <td className="text-center py-4 px-4">Basic</td>
                <td className="text-center py-4 px-4">Full</td>
                <td className="text-center py-4 px-4">Full</td>
                <td className="text-center py-4 px-4">Full</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">Brands</td>
                <td className="text-center py-4 px-4">1</td>
                <td className="text-center py-4 px-4">3</td>
                <td className="text-center py-4 px-4">10</td>
                <td className="text-center py-4 px-4">Unlimited</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">Content Calendar</td>
                <td className="text-center py-4 px-4 text-gray-500">✗</td>
                <td className="text-center py-4 px-4 text-teal-400">✓</td>
                <td className="text-center py-4 px-4 text-teal-400">✓</td>
                <td className="text-center py-4 px-4 text-teal-400">✓</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">Video Pipeline</td>
                <td className="text-center py-4 px-4 text-gray-500">✗</td>
                <td className="text-center py-4 px-4 text-gray-500">✗</td>
                <td className="text-center py-4 px-4 text-teal-400">✓</td>
                <td className="text-center py-4 px-4 text-teal-400">✓</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">Winners Bank</td>
                <td className="text-center py-4 px-4 text-gray-500">✗</td>
                <td className="text-center py-4 px-4 text-gray-500">✗</td>
                <td className="text-center py-4 px-4 text-teal-400">✓</td>
                <td className="text-center py-4 px-4 text-teal-400">✓</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-4 px-4">Analytics</td>
                <td className="text-center py-4 px-4 text-gray-500">✗</td>
                <td className="text-center py-4 px-4 text-gray-500">✗</td>
                <td className="text-center py-4 px-4 text-teal-400">✓</td>
                <td className="text-center py-4 px-4 text-teal-400">✓</td>
              </tr>
              <tr>
                <td className="py-4 px-4">Priority Support</td>
                <td className="text-center py-4 px-4 text-gray-500">✗</td>
                <td className="text-center py-4 px-4 text-gray-500">✗</td>
                <td className="text-center py-4 px-4 text-gray-500">✗</td>
                <td className="text-center py-4 px-4 text-teal-400">✓</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="text-center mt-6">
          <Link
            href="/pricing"
            className="text-sm text-teal-400 hover:text-teal-300 font-medium transition"
          >
            See full pricing details →
          </Link>
        </div>
      </section>

      {/* CTA */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-4">Try it now — no signup needed</h2>
        <p className="text-gray-300 mb-8">Generate a script or transcribe a TikTok in under 30 seconds. Free.</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/script-generator"
            className="px-6 py-3 bg-teal-500 text-white rounded-lg font-semibold hover:bg-teal-600 transition"
          >
            Generate a Script
          </Link>
          <Link
            href="/transcribe"
            className="px-6 py-3 border border-gray-600 text-white rounded-lg font-semibold hover:bg-gray-800 transition"
          >
            Transcribe a TikTok
          </Link>
          <Link
            href="/pricing"
            className="px-6 py-3 border border-teal-500 text-teal-400 rounded-lg font-semibold hover:bg-teal-500/10 transition"
          >
            View Pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
