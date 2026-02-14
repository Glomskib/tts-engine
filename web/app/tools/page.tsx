import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Tools | FlashFlow AI - Free & Paid Tools',
  description:
    'Explore FlashFlow tools: Free TikTok transcriber, AI script generator, avatar video creation, and Winners Bank. Start free.',
  openGraph: {
    title: 'Tools | FlashFlow AI',
    description: 'Complete toolkit for TikTok content creation.',
    type: 'website',
    images: [{ url: '/FFAI.png', width: 512, height: 512 }],
  },
};

export default function ToolsPage() {
  const tools = [
    {
      name: 'Free TikTok Video Transcriber',
      description: 'Paste any public TikTok URL. Get the full transcript, hook analysis, emotional triggers, content breakdown, and recommendations.',
      features: [
        'No signup required',
        'Instant transcription',
        'Hook strength scoring (1-10)',
        'Emotional trigger detection',
        'Scene-by-scene breakdown',
        'Content recommendations',
      ],
      cta: 'Try Free Now',
      href: '/transcribe',
      free: true,
      icon: '📝',
    },
    {
      name: 'AI Script Generator',
      description: 'Input a product. Get 5–10 script variations in different personas. Choose the winner. Download or feed into avatar video creation.',
      features: [
        '6 unique personas',
        'Multiple variations per product',
        'Hook optimization',
        'CTA customization',
        'Export as text or markdown',
        'Use with avatar videos',
      ],
      cta: 'Start Free Trial',
      href: '/signup',
      free: false,
      icon: '🎬',
    },
    {
      name: 'AI Avatar Video Creator',
      description: 'Convert scripts into videos automatically. Choose AI avatars, set scene duration, add music and text overlays. One-click render.',
      features: [
        'Multiple AI avatars',
        'Auto scene generation',
        'Music and SFX library',
        'Text overlay automation',
        'Aspect ratio options',
        'Direct TikTok posting',
      ],
      cta: 'Get Started',
      href: '/signup?plan=pro',
      free: false,
      icon: '🤖',
    },
    {
      name: 'Winners Bank',
      description: 'Database of viral TikTok patterns. Analyze what hooks work for different products. See winning scripts, emotional angles, and pacing.',
      features: [
        'Product category filters',
        'Hook performance data',
        'Emotional angle breakdown',
        'Pacing analysis',
        'Creator insights',
        'Trend tracking',
      ],
      cta: 'Explore Winners',
      href: '/signup?plan=pro',
      free: false,
      icon: '🏆',
    },
    {
      name: 'TikTok Shop Integration',
      description: 'Connect your TikTok Shop. Automatically generate product videos, post directly, and track performance per video.',
      features: [
        'Shop account sync',
        'Batch video generation',
        'Auto-publish to Shop',
        'Performance tracking',
        'Revenue per video',
        'Competitor analysis',
      ],
      cta: 'Set Up Shop',
      href: '/signup?plan=brand',
      free: false,
      icon: '🛍️',
    },
    {
      name: 'Content Analytics Dashboard',
      description: 'Track video performance across TikTok and Shop. See views, engagement, revenue, and trends. Data-driven decisions.',
      features: [
        'Real-time metrics',
        'Engagement tracking',
        'Revenue attribution',
        'Trend insights',
        'A/B test results',
        'Custom reports',
      ],
      cta: 'View Dashboard',
      href: '/signup?plan=brand',
      free: false,
      icon: '📊',
    },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-5xl font-bold mb-6">All Tools in One Place</h1>
        <p className="text-xl text-gray-300 mb-8">
          Free tools and premium features. Start free, upgrade when you're ready.
        </p>
      </div>

      {/* Tools Grid */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="space-y-6">
          {tools.map((tool, idx) => (
            <div
              key={idx}
              className={`rounded-xl p-8 border transition-all ${
                tool.free
                  ? 'border-teal-500 bg-teal-500/5'
                  : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-4xl mb-3">{tool.icon}</div>
                  <h3 className="text-2xl font-bold mb-2">{tool.name}</h3>
                  <p className="text-gray-300 mb-4 max-w-2xl">{tool.description}</p>
                </div>
                {tool.free && (
                  <div className="px-3 py-1 bg-teal-500 text-white text-sm rounded-full font-semibold whitespace-nowrap">
                    Free
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {tool.features.map((feature, fidx) => (
                  <div key={fidx} className="flex items-start">
                    <span className="text-teal-500 mr-2 mt-1">✓</span>
                    <span className="text-sm text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>

              <Link
                href={tool.href}
                className={`inline-block px-6 py-3 rounded-lg font-semibold transition ${
                  tool.free
                    ? 'bg-teal-500 text-white hover:bg-teal-600'
                    : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
              >
                {tool.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Use Cases */}
      <section className="max-w-6xl mx-auto px-4 py-16 border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-12 text-center">Common Workflows</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-xl">
            <h3 className="text-lg font-bold mb-4">Content Creator Workflow</h3>
            <ol className="space-y-3 text-gray-300">
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">1</span>
                <span>Analyze winning TikToks with Free Transcriber</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">2</span>
                <span>Generate script variations with AI Script Generator</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">3</span>
                <span>Create videos with AI Avatar Creator</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">4</span>
                <span>Post to TikTok and track performance</span>
              </li>
            </ol>
          </div>

          <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-xl">
            <h3 className="text-lg font-bold mb-4">TikTok Shop Seller Workflow</h3>
            <ol className="space-y-3 text-gray-300">
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">1</span>
                <span>Connect TikTok Shop account</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">2</span>
                <span>Generate 10 product video variations</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">3</span>
                <span>Auto-publish to Shop</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">4</span>
                <span>Analyze which videos convert best, scale winners</span>
              </li>
            </ol>
          </div>

          <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-xl">
            <h3 className="text-lg font-bold mb-4">Agency Workflow</h3>
            <ol className="space-y-3 text-gray-300">
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">1</span>
                <span>Analyze competitor content with Transcriber</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">2</span>
                <span>Generate client-specific scripts</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">3</span>
                <span>Deliver videos and performance data</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">4</span>
                <span>White-label for your own brand</span>
              </li>
            </ol>
          </div>

          <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-xl">
            <h3 className="text-lg font-bold mb-4">UGC Creator Workflow</h3>
            <ol className="space-y-3 text-gray-300">
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">1</span>
                <span>Use Winners Bank to find trending hooks</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">2</span>
                <span>Generate personalized scripts for brands</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">3</span>
                <span>Create videos with AI avatars</span>
              </li>
              <li className="flex items-start">
                <span className="text-teal-500 mr-3 font-bold">4</span>
                <span>Deliver 50+ video variations per brand</span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
        <p className="text-gray-300 mb-8">Try our free TikTok transcriber right now. No signup required.</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/transcribe"
            className="px-6 py-3 bg-teal-500 text-white rounded-lg font-semibold hover:bg-teal-600 transition"
          >
            Try Free Tool
          </Link>
          <Link
            href="/pricing"
            className="px-6 py-3 border border-teal-500 text-teal-500 rounded-lg font-semibold hover:bg-teal-500/10 transition"
          >
            View Pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
