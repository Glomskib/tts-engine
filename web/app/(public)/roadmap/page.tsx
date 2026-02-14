import type { Metadata } from 'next';
import Link from 'next/link';
import { RoadmapItems } from './RoadmapItems';

export const metadata: Metadata = {
  title: 'Roadmap — What\'s Coming Next',
  description:
    'See what we\'re building next at FlashFlow AI. Our public roadmap shows planned features, current work in progress, and recently shipped updates.',
  openGraph: {
    title: 'FlashFlow AI Roadmap — What\'s Coming Next',
    description:
      'See what we\'re building next at FlashFlow AI. Planned features, work in progress, and recently shipped updates.',
    type: 'website',
    images: [{ url: '/FFAI.png', width: 512, height: 512 }],
  },
};

export default function RoadmapPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16 sm:py-24">
      {/* Hero */}
      <div className="text-center mb-16">
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
          Product{' '}
          <span className="bg-gradient-to-r from-teal-400 to-violet-400 bg-clip-text text-transparent">
            Roadmap
          </span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
          FlashFlow AI is actively developed and improving every week. Here&apos;s
          what we&apos;re working on and what&apos;s coming next.
        </p>
      </div>

      {/* Roadmap content (client component for data fetching) */}
      <RoadmapItems />

      {/* CTA */}
      <div className="mt-16 text-center bg-gradient-to-r from-teal-500/10 to-violet-500/10 border border-teal-500/20 rounded-2xl p-8 sm:p-12">
        <h2 className="text-2xl font-bold text-white mb-3">
          Have a feature idea?
        </h2>
        <p className="text-zinc-400 mb-6 max-w-md mx-auto">
          We build what our users need. Submit a feature request and help shape
          the future of FlashFlow AI.
        </p>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-violet-500 hover:from-teal-600 hover:to-violet-600 text-white font-semibold rounded-xl transition-all"
        >
          Request a Feature
        </Link>
      </div>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'FlashFlow AI Roadmap',
            description:
              'Public product roadmap showing planned features, current work, and recently shipped updates.',
            url: 'https://flashflowai.com/roadmap',
          }),
        }}
      />
    </div>
  );
}
