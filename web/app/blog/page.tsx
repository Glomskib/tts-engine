import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Blog - TikTok Content Tips & Guides',
  description:
    'Learn how to transcribe TikTok videos, master viral hooks, and reverse-engineer winning content. Free guides for creators and TikTok Shop sellers.',
  openGraph: {
    title: 'Blog | FlashFlow AI',
    description: 'TikTok content creation guides, hook formulas, and strategy insights.',
    type: 'website',
    images: [{ url: '/FFAI.png', width: 512, height: 512 }],
  },
};

export default function BlogPage() {
  const articles = [
    {
      slug: 'ai-tools-tiktok-shop',
      title: '5 AI Tools Every TikTok Shop Seller Needs in 2026',
      excerpt: 'Complete AI toolkit for TikTok Shop sellers. FlashFlow + CapCut + Kalodata + ChatGPT + Adobe Firefly = unstoppable content machine.',
      date: 'Feb 14, 2026',
      readTime: '10 min read',
      category: 'Tools',
      image: '🤖',
    },
    {
      slug: 'getting-started',
      title: 'Getting Started with FlashFlow AI — Your First Script in 60 Seconds',
      excerpt: 'Step-by-step guide to generating your first TikTok script. Add a product, pick a persona, generate, save. No experience needed.',
      date: 'Feb 14, 2026',
      readTime: '5 min read',
      category: 'Tutorial',
      image: '🚀',
    },
    {
      slug: 'how-to-transcribe-tiktok-videos',
      title: 'How to Transcribe TikTok Videos for Free in 2026',
      excerpt: 'Step-by-step guide to transcribing any TikTok video, extracting hooks, and using transcripts to improve your own content strategy.',
      date: 'Feb 14, 2026',
      readTime: '8 min read',
      category: 'Tools',
      image: '📝',
    },
    {
      slug: '10-tiktok-hook-formulas',
      title: '10 TikTok Hook Formulas That Actually Go Viral',
      excerpt: 'Proven hook structures that stop the scroll. Data-backed patterns from 50,000+ viral TikTok videos analyzed.',
      date: 'Feb 14, 2026',
      readTime: '12 min read',
      category: 'Strategy',
      image: '🎯',
    },
    {
      slug: 'reverse-engineer-winning-tiktok-shop-videos',
      title: 'How to Reverse-Engineer Winning TikTok Shop Videos',
      excerpt: 'Analyze competitor TikTok Shop videos to find conversion patterns, product angles, and content structures that sell.',
      date: 'Feb 14, 2026',
      readTime: '10 min read',
      category: 'Selling',
      image: '🛍️',
    },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-5xl font-bold mb-6">Content Strategy Guides</h1>
        <p className="text-xl text-gray-300">
          Learn how to analyze, create, and scale viral TikTok content. Free guides for creators and TikTok Shop sellers.
        </p>
      </div>

      {/* Articles Grid */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/blog/${article.slug}`}
              className="group rounded-xl p-6 bg-gray-800/30 border border-gray-700 hover:border-teal-500 hover:bg-teal-500/5 transition"
            >
              <div className="text-5xl mb-4">{article.image}</div>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs bg-teal-500/20 text-teal-300 px-2 py-1 rounded">
                  {article.category}
                </span>
                <span className="text-xs text-gray-500">{article.readTime}</span>
              </div>
              <h3 className="text-lg font-bold mb-2 group-hover:text-teal-300 transition">
                {article.title}
              </h3>
              <p className="text-gray-400 text-sm mb-4">{article.excerpt}</p>
              <div className="text-xs text-gray-500">{article.date}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center border-t border-gray-700">
        <h2 className="text-2xl font-bold mb-4">Ready to level up your content?</h2>
        <p className="text-gray-300 mb-8">Start with our free TikTok transcriber to analyze winning videos.</p>
        <Link
          href="/transcribe"
          className="inline-block px-8 py-4 bg-teal-500 text-white rounded-lg font-semibold hover:bg-teal-600 transition"
        >
          Try Free Transcriber
        </Link>
      </div>
    </div>
  );
}
