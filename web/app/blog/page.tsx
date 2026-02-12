import { Metadata } from 'next';
import Link from 'next/link';
import { blogPosts } from '@/content/blog/posts';
import { PublicLayout } from '@/components/PublicLayout';

export const metadata: Metadata = {
  title: 'Blog — TikTok Shop Script Tips & Strategies | FlashFlow AI',
  description: 'Learn how to create viral TikTok Shop content. Script templates, hook formulas, creator strategies, and more.',
  openGraph: {
    title: 'FlashFlow AI Blog',
    description: 'TikTok Shop script tips, hook formulas, and creator strategies.',
    type: 'website',
  },
};

export default function BlogIndexPage() {
  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-6 pb-20">
        <section className="pt-12 pb-8">
          <h1 className="text-4xl font-bold mb-3">Blog</h1>
          <p className="text-zinc-400">
            TikTok Shop script tips, hook formulas, and creator strategies.
          </p>
        </section>

        <div className="space-y-6">
          {blogPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block bg-zinc-900/60 border border-white/10 rounded-xl p-6 hover:border-teal-500/30 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-teal-500/10 text-teal-400">
                  {post.category}
                </span>
                <span className="text-xs text-zinc-500">{post.readingTime}</span>
                <span className="text-xs text-zinc-600">
                  {new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <h2 className="text-xl font-semibold text-zinc-100 group-hover:text-teal-400 transition-colors mb-2">
                {post.title}
              </h2>
              <p className="text-sm text-zinc-400 line-clamp-2">
                {post.description}
              </p>
              <div className="mt-4 text-sm text-teal-400 group-hover:text-teal-300 transition-colors">
                Read article &rarr;
              </div>
            </Link>
          ))}
        </div>

        {/* Lead Magnet CTA */}
        <div className="mt-12 bg-zinc-900/60 border border-teal-500/20 rounded-xl p-6 text-center">
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Want more?</h3>
          <p className="text-sm text-zinc-400 mb-4">
            Download the full UGC Script Vault &mdash; 50 proven hooks + 10 ready-to-film templates.
          </p>
          <Link href="/free-scripts" className="inline-block px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors">
            Download Free Script Vault
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
