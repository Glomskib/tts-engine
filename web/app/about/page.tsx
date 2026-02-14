import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About - TikTok Video Creator Platform',
  description:
    'FlashFlow AI empowers TikTok Shop sellers and content creators to generate viral scripts and videos at scale. Learn how we help creators succeed.',
  openGraph: {
    title: 'About FlashFlow AI',
    description: 'AI-powered TikTok content creation for creators and brands.',
    type: 'website',
    images: [{ url: '/FFAI.png', width: 512, height: 512 }],
  },
};

export default function AboutPage() {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FlashFlow AI',
    url: 'https://flashflowai.com',
    logo: 'https://flashflowai.com/FFAI.png',
    description: 'AI-powered TikTok Shop video content creation platform',
    foundingDate: '2024',
    knowsAbout: ['TikTok Content', 'AI Video Generation', 'Script Writing', 'Content Marketing'],
    sameAs: ['https://twitter.com/flashflowai'],
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h1 className="text-5xl font-bold mb-6">About FlashFlow AI</h1>
        <p className="text-xl text-gray-300 mb-8">
          We empower content creators, TikTok Shop sellers, and marketing agencies to generate viral scripts and videos at scale using artificial intelligence.
        </p>
      </div>

      {/* Mission */}
      <section className="max-w-4xl mx-auto px-4 py-12 border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-6">Our Mission</h2>
        <p className="text-lg text-gray-300 mb-6">
          Democratize short-form video creation. Before FlashFlow, creating viral TikTok Shop videos required expensive videographers, copywriters, and months of testing. Now, creators can:
        </p>
        <ul className="space-y-4 text-gray-300">
          <li className="flex items-start">
            <span className="text-teal-500 mr-3 mt-1">✓</span>
            <span><strong>Analyze any viral TikTok</strong> to extract the winning formula (hook, emotional triggers, pacing)</span>
          </li>
          <li className="flex items-start">
            <span className="text-teal-500 mr-3 mt-1">✓</span>
            <span><strong>Generate personalized scripts</strong> in seconds that match their product and target audience</span>
          </li>
          <li className="flex items-start">
            <span className="text-teal-500 mr-3 mt-1">✓</span>
            <span><strong>Create AI avatar videos</strong> automatically — no camera, no editing software needed</span>
          </li>
          <li className="flex items-start">
            <span className="text-teal-500 mr-3 mt-1">✓</span>
            <span><strong>Test multiple variations</strong> and scale winners — data-driven content strategy</span>
          </li>
        </ul>
      </section>

      {/* How It Started */}
      <section className="max-w-4xl mx-auto px-4 py-12 border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-6">How It Started</h2>
        <p className="text-lg text-gray-300 mb-6">
          FlashFlow was built because content creators were struggling. TikTok Shop sellers had products that could sell, but couldn't create the videos. Video agencies charged $500–$5,000 per video. Freelance UGC creators were overwhelmed with requests.
        </p>
        <p className="text-lg text-gray-300 mb-6">
          We realized: if you can analyze what makes a TikTok viral, you can generate a script. If you can generate a script, an AI avatar can perform it. If an AI avatar can perform it, you can test 10 versions of the same product and keep the winner.
        </p>
        <p className="text-lg text-gray-300">
          FlashFlow AI was born to automate that entire workflow.
        </p>
      </section>

      {/* What We Do Now */}
      <section className="max-w-4xl mx-auto px-4 py-12 border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-6">What We Do Now</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-xl font-bold mb-3 text-teal-500">Free TikTok Video Transcriber</h3>
            <p className="text-gray-300">
              Paste any TikTok link. Get the transcript, hook analysis, emotional triggers, and content breakdown. No signup required.
            </p>
            <Link href="/transcribe" className="text-teal-500 hover:text-teal-400 font-semibold mt-4 inline-block">
              Try it free →
            </Link>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-3 text-teal-500">AI Script Generator</h3>
            <p className="text-gray-300">
              Feed it a product. Get 5–10 script variations in different personas (skeptic, aspirational, educational). Pick the winner, generate a video.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-3 text-teal-500">AI Avatar Video Creation</h3>
            <p className="text-gray-300">
              Scripts → automatic video generation with AI avatars. No filming, no editing. One-click TikTok Shop posting.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-3 text-teal-500">Winners Bank</h3>
            <p className="text-gray-300">
              Database of viral TikTok patterns. See what hooks convert for each product category. Data-driven content strategy.
            </p>
          </div>
        </div>
      </section>

      {/* Who We Help */}
      <section className="max-w-4xl mx-auto px-4 py-12 border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-6">Who We Help</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-gray-800/50 rounded-lg">
            <h3 className="text-lg font-bold mb-2">TikTok Shop Sellers</h3>
            <p className="text-gray-300">
              Create product demo videos in minutes. Test variations. Scale winners. Track revenue per video. No videographer needed.
            </p>
          </div>
          <div className="p-6 bg-gray-800/50 rounded-lg">
            <h3 className="text-lg font-bold mb-2">Content Creators</h3>
            <p className="text-gray-300">
              Analyze competitor content. Reverse-engineer viral hooks. Generate scripts that match your brand. Grow faster.
            </p>
          </div>
          <div className="p-6 bg-gray-800/50 rounded-lg">
            <h3 className="text-lg font-bold mb-2">Marketing Agencies</h3>
            <p className="text-gray-300">
              Create data-backed content strategies for clients. Generate UGC-style videos at scale. Automate the boring stuff.
            </p>
          </div>
          <div className="p-6 bg-gray-800/50 rounded-lg">
            <h3 className="text-lg font-bold mb-2">UGC Creators</h3>
            <p className="text-gray-300">
              Master trending hooks and emotional triggers. Generate script templates. Manage client requests efficiently.
            </p>
          </div>
        </div>
      </section>

      {/* The Team (Optional) */}
      <section className="max-w-4xl mx-auto px-4 py-12 border-t border-gray-700">
        <h2 className="text-3xl font-bold mb-6">Our Approach</h2>
        <ul className="space-y-4 text-gray-300">
          <li className="flex items-start">
            <span className="text-teal-500 mr-3 mt-1">→</span>
            <span><strong>Data-Driven:</strong> Every recommendation is backed by viral content analysis</span>
          </li>
          <li className="flex items-start">
            <span className="text-teal-500 mr-3 mt-1">→</span>
            <span><strong>Fast Iteration:</strong> Test 10 video variations in hours, not weeks</span>
          </li>
          <li className="flex items-start">
            <span className="text-teal-500 mr-3 mt-1">→</span>
            <span><strong>No Creative Block:</strong> AI generates endless script variations. Pick the best one</span>
          </li>
          <li className="flex items-start">
            <span className="text-teal-500 mr-3 mt-1">→</span>
            <span><strong>TikTok-Native:</strong> Built by creators, for creators. Works natively with TikTok Shop</span>
          </li>
          <li className="flex items-start">
            <span className="text-teal-500 mr-3 mt-1">→</span>
            <span><strong>Transparent Pricing:</strong> Free tier is genuinely free. No hidden fees</span>
          </li>
        </ul>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 border-t border-gray-700 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Create Viral Content?</h2>
        <p className="text-lg text-gray-300 mb-8">
          Start with our free TikTok transcriber. No signup required.
        </p>
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
          <Link
            href="/signup"
            className="px-6 py-3 bg-gray-800 text-white rounded-lg font-semibold hover:bg-gray-700 transition"
          >
            Sign Up
          </Link>
        </div>
      </section>
    </div>
  );
}
