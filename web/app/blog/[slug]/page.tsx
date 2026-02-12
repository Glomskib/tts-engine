import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBlogPost, blogPosts } from '@/content/blog/posts';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: 'Not Found' };

  return {
    title: `${post.title} | FlashFlow AI Blog`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.publishedAt,
      authors: [post.author],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    notFound();
  }

  // Get related posts (other posts, max 2)
  const related = blogPosts.filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between max-w-4xl mx-auto px-6 py-6">
        <Link href="/" className="text-xl font-bold text-teal-400">FlashFlow AI</Link>
        <div className="flex items-center gap-4">
          <Link href="/blog" className="text-sm text-zinc-400 hover:text-white transition-colors">Blog</Link>
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Login</Link>
          <Link href="/login?mode=signup" className="text-sm px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors font-medium">
            Try Free
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-6 pb-20">
        {/* Article Header */}
        <article className="pt-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-teal-500/10 text-teal-400">
              {post.category}
            </span>
            <span className="text-xs text-zinc-500">{post.readingTime}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight">
            {post.title}
          </h1>

          <div className="flex items-center gap-3 text-sm text-zinc-500 mb-8 pb-8 border-b border-white/10">
            <span>{post.author}</span>
            <span>&middot;</span>
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </time>
          </div>

          {/* Article Content */}
          <div
            className="prose prose-invert prose-zinc max-w-none
              prose-headings:text-zinc-100 prose-headings:font-bold
              prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
              prose-p:text-zinc-300 prose-p:leading-relaxed prose-p:mb-4
              prose-a:text-teal-400 prose-a:no-underline hover:prose-a:text-teal-300
              prose-strong:text-zinc-100
              prose-blockquote:border-l-teal-500 prose-blockquote:bg-zinc-900/50 prose-blockquote:rounded-r-lg prose-blockquote:py-2 prose-blockquote:px-4
              prose-ol:text-zinc-300 prose-ul:text-zinc-300
              prose-li:mb-2
              prose-em:text-zinc-400"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </article>

        {/* Lead Magnet CTA */}
        <div className="mt-16 bg-zinc-900/60 border border-teal-500/20 rounded-xl p-8 text-center">
          <h3 className="text-xl font-semibold text-zinc-100 mb-2">Want the full Script Vault?</h3>
          <p className="text-zinc-400 mb-6">
            50 proven hooks + 10 ready-to-film templates. Free download.
          </p>
          <Link href="/free-scripts" className="inline-block px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors">
            Download Free Script Vault
          </Link>
        </div>

        {/* Related Posts */}
        {related.length > 0 && (
          <div className="mt-12">
            <h3 className="text-lg font-semibold text-zinc-200 mb-4">Related Articles</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/blog/${r.slug}`}
                  className="bg-zinc-900/60 border border-white/10 rounded-xl p-5 hover:border-teal-500/30 transition-colors group"
                >
                  <span className="text-xs text-teal-400">{r.category}</span>
                  <h4 className="text-sm font-semibold text-zinc-200 mt-1 group-hover:text-teal-400 transition-colors">
                    {r.title}
                  </h4>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 border-t border-white/5 py-8 text-center">
        <p className="text-xs text-zinc-600">
          &copy; 2026 FlashFlow AI by Making Miles Matter INC
        </p>
      </footer>
    </div>
  );
}
