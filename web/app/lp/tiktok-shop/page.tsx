import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'TikTok Shop Script Generator | FlashFlow AI',
  description:
    'Turn TikTok Shop products into viral content. AI-powered script generator built for TikTok Shop sellers. Generate compliant, scroll-stopping scripts in seconds.',
  openGraph: {
    title: 'TikTok Shop Script Generator | FlashFlow AI',
    description: 'Turn TikTok Shop products into viral content with AI-generated scripts.',
    type: 'website',
    url: 'https://flashflowai.com/lp/tiktok-shop',
  },
};

export default function TikTokShopLP() {
  return (
    <div className="max-w-4xl mx-auto px-6">
      {/* Hero */}
      <section className="pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 mb-6">
          Built for TikTok Shop Sellers
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-6">
          Turn TikTok Shop Products Into{' '}
          <span className="bg-gradient-to-r from-rose-400 via-pink-400 to-rose-400 bg-clip-text text-transparent">
            Viral Content
          </span>
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8 leading-relaxed">
          Stop losing commissions to creators with better scripts. Generate scroll-stopping,
          TikTok-Shop-compliant content for any product in 60 seconds.
        </p>
        <Link
          href="/script-generator"
          className="group inline-flex items-center px-8 py-4 rounded-xl bg-white text-zinc-900 font-semibold text-lg hover:bg-zinc-100 transition-all shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_24px_rgba(0,0,0,0.4)]"
        >
          Try the Script Generator Free
          <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </section>

      {/* Pain Points */}
      <section className="py-12">
        <h2 className="text-2xl font-bold text-center mb-8">The TikTok Shop Struggle is Real</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              title: 'Commission splits are tight',
              desc: 'You need volume to make real money. But writing 5+ scripts a day? Not sustainable.',
            },
            {
              title: 'Competition is exploding',
              desc: 'Every seller is fighting for the same products. The ones posting the most, win the most.',
            },
            {
              title: 'Compliance kills creativity',
              desc: 'One wrong health claim and your video gets pulled. Writing safe AND viral is a juggling act.',
            },
          ].map((item) => (
            <div key={item.title} className="p-5 rounded-xl bg-red-500/5 border border-red-500/10">
              <h3 className="text-base font-semibold text-zinc-200 mb-2">{item.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product Import Feature */}
      <section className="py-12">
        <div className="rounded-2xl bg-zinc-900/50 border border-white/5 p-8 sm:p-10">
          <div className="flex flex-col sm:flex-row gap-8 items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-violet-400 uppercase tracking-widest mb-3">Featured</p>
              <h2 className="text-2xl font-bold mb-4">One-Click Product Import</h2>
              <p className="text-zinc-400 leading-relaxed mb-4">
                Paste your TikTok Shop product URL. FlashFlow pulls the product name, description,
                and images — then generates scripts using your actual product data.
              </p>
              <ul className="space-y-2">
                {[
                  'Auto-imports product details from TikTok Shop',
                  'Scripts reference real features & benefits',
                  'All content is TikTok Shop compliant',
                  'Batch generate for your entire catalog',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="w-full sm:w-72 aspect-square rounded-xl bg-zinc-800/50 border border-white/5 flex items-center justify-center shrink-0">
              <span className="text-xs text-zinc-600">Product Import Demo</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Highlight */}
      <section className="py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">The Math is Simple</h2>
          <p className="text-zinc-400">One viral script pays for a year of FlashFlow.</p>
        </div>
        <div className="max-w-sm mx-auto p-6 rounded-2xl bg-zinc-900/80 border border-blue-500/50 text-center">
          <div className="px-3 py-1 rounded-full bg-blue-500 text-xs font-medium text-white inline-block mb-4">
            Most Popular for TikTok Shop
          </div>
          <h3 className="text-xl font-semibold text-white mb-1">Creator Pro</h3>
          <div className="mb-4">
            <span className="text-4xl font-bold text-white">$29</span>
            <span className="text-zinc-500 text-sm">/mo</span>
          </div>
          <ul className="space-y-2 mb-6 text-left">
            {[
              'Unlimited scripts',
              'All 20 creator personas',
              '50 products',
              'TikTok Shop import',
              'Content Planner',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
          <Link
            href="/signup?plan=creator_pro"
            className="block w-full py-3 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-100 transition-all text-center"
          >
            Start Free Trial
          </Link>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-12">
        <div className="max-w-xl mx-auto p-6 rounded-xl bg-zinc-900/50 border border-white/5">
          <p className="text-zinc-300 leading-relaxed mb-4">
            &ldquo;I went from 1 video a week to posting daily. My TikTok Shop commissions
            tripled in the first month. The scripts nail the hooks and the product integration
            feels natural, not salesy.&rdquo;
          </p>
          <div>
            <p className="font-medium text-white text-sm">Jenna M.</p>
            <p className="text-xs text-zinc-500">TikTok Shop Creator, 50K followers</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Start Generating TikTok Shop Scripts Now
        </h2>
        <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
          3 free scripts. No signup. See for yourself why sellers are switching to FlashFlow.
        </p>
        <Link
          href="/script-generator"
          className="group inline-flex items-center px-8 py-4 rounded-xl bg-white text-zinc-900 font-semibold text-lg hover:bg-zinc-100 transition-all"
        >
          Try the Script Generator Free
          <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
        <p className="text-xs text-zinc-600 mt-4">Free forever plan available. No credit card required.</p>
      </section>
    </div>
  );
}
