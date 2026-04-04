import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'TikTok Shop Script Generator | FlashFlow AI',
  description:
    'Turn TikTok Shop products into viral content. AI-powered script generator with 20+ personas built for TikTok Shop sellers. Try free — no signup required.',
  openGraph: {
    title: 'TikTok Shop Script Generator | FlashFlow AI',
    description: 'Turn TikTok Shop products into viral content with AI-generated scripts. 20+ personas, free to try.',
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
        <p className="text-xs text-zinc-500 mt-3">No signup required. 5 free scripts included.</p>
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

      {/* How It Works */}
      <section className="py-12">
        <h2 className="text-2xl font-bold text-center mb-8">How It Works</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { step: '1', title: 'Enter your product', desc: 'Type the product name or paste a TikTok Shop URL. FlashFlow pulls the details automatically.' },
            { step: '2', title: 'Pick a persona', desc: 'Choose from 20+ voice styles — Skeptic, Hype Man, Relatable Friend, Educator, and more.' },
            { step: '3', title: 'Get your script', desc: 'AI generates a scroll-stopping script with hook, body, and CTA. Copy it and film.' },
          ].map((item) => (
            <div key={item.step} className="p-5 rounded-xl bg-zinc-900/50 border border-white/5 text-center">
              <div className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-400 text-sm font-bold flex items-center justify-center mx-auto mb-3">
                {item.step}
              </div>
              <h3 className="text-base font-semibold text-zinc-200 mb-2">{item.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Highlight */}
      <section className="py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">The Math is Simple</h2>
          <p className="text-zinc-400">One viral script pays for a year of FlashFlow.</p>
        </div>
        <div className="max-w-sm mx-auto p-6 rounded-2xl bg-zinc-900/80 border border-teal-500/50 text-center">
          <div className="px-3 py-1 rounded-full bg-teal-500 text-xs font-medium text-white inline-block mb-4">
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
              'All 20+ persona voices',
              'Winners Bank',
              'Video pipeline',
              'Analytics & performance tracking',
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
            href="/login?mode=signup&plan=creator_pro"
            className="block w-full py-3 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-100 transition-all text-center"
          >
            Get Started Free
          </Link>
          <p className="text-xs text-zinc-600 mt-2">Free plan also available</p>
        </div>
        <div className="text-center mt-4">
          <Link href="/pricing" className="text-sm text-teal-400 hover:text-teal-300 font-medium transition">
            Compare all plans →
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
          <p className="text-[10px] text-zinc-600 mt-3">Individual results vary. FlashFlow provides workflow tools, not guaranteed outcomes.</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Start Generating TikTok Shop Scripts Now
        </h2>
        <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
          5 free scripts. No signup. See for yourself why sellers are switching to FlashFlow.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/script-generator"
            className="group inline-flex items-center px-8 py-4 rounded-xl bg-white text-zinc-900 font-semibold text-lg hover:bg-zinc-100 transition-all"
          >
            Try the Script Generator Free
            <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link
            href="/transcribe"
            className="text-sm text-zinc-400 hover:text-zinc-300 transition"
          >
            or analyze a TikTok with Free Transcriber →
          </Link>
        </div>
        <div className="flex items-center justify-center gap-4 text-xs text-zinc-600 mt-6">
          <span>No credit card required</span>
          <span className="text-zinc-700">|</span>
          <span>Free forever plan</span>
          <span className="text-zinc-700">|</span>
          <span>Cancel anytime</span>
        </div>
        <p className="text-[10px] text-zinc-700 text-center mt-8">
          FlashFlow is an independent workflow platform. Not affiliated with or endorsed by TikTok or ByteDance.
        </p>
      </section>
    </div>
  );
}
