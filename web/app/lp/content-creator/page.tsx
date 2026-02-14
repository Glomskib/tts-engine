import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AI Script Writer for Content Creators',
  description:
    'Stop staring at blank scripts. AI-powered TikTok script generator with 20 persona presets. Beat writer\'s block and post consistently. Free to try.',
  openGraph: {
    title: 'AI Script Writer for Content Creators | FlashFlow AI',
    description: 'Stop staring at blank scripts. Start going viral with AI-generated TikTok scripts.',
    type: 'website',
    url: 'https://flashflowai.com/lp/content-creator',
  },
};

export default function ContentCreatorLP() {
  return (
    <div className="max-w-4xl mx-auto px-6">
      {/* Hero */}
      <section className="pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-400 mb-6">
          Built for Content Creators
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-6">
          Stop Staring at Blank Scripts.{' '}
          <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
            Start Going Viral.
          </span>
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8 leading-relaxed">
          Writer&apos;s block kills momentum. FlashFlow generates scroll-stopping scripts with your
          unique voice in 60 seconds — so you can focus on filming, not writing.
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
        <h2 className="text-2xl font-bold text-center mb-8">Sound Familiar?</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              title: "Writer's block hits hard",
              desc: 'You know you need to post but the ideas aren\'t flowing. Hours disappear staring at a blank screen.',
            },
            {
              title: 'Consistency is exhausting',
              desc: 'Posting daily sounds great in theory. In practice, you burn out after two weeks.',
            },
            {
              title: 'Every script sounds the same',
              desc: 'You fall into the same patterns. Your audience notices. Engagement drops.',
            },
          ].map((item) => (
            <div key={item.title} className="p-5 rounded-xl bg-red-500/5 border border-red-500/10">
              <h3 className="text-base font-semibold text-zinc-200 mb-2">{item.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Persona Feature */}
      <section className="py-12">
        <div className="rounded-2xl bg-zinc-900/50 border border-white/5 p-8 sm:p-10">
          <div className="flex flex-col sm:flex-row gap-8 items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-violet-400 uppercase tracking-widest mb-3">Featured</p>
              <h2 className="text-2xl font-bold mb-4">20 Persona Presets — Your Voice, Amplified</h2>
              <p className="text-zinc-400 leading-relaxed mb-4">
                Each persona has a unique tone, humor style, and delivery. Pick the one that matches
                your brand — or try different voices to find what resonates.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Gen-Z Trendsetter',
                  'Skeptical Reviewer',
                  'Hype Machine',
                  'Dad Jokester',
                  'Trusted Expert',
                  'Chaotic Comedy',
                ].map((p) => (
                  <span key={p} className="px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-400">
                    {p}
                  </span>
                ))}
              </div>
            </div>
            <div className="w-full sm:w-72 aspect-square rounded-xl bg-zinc-800/50 border border-white/5 flex items-center justify-center shrink-0">
              <span className="text-xs text-zinc-600">Persona Selector Preview</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Plans That Grow With You</h2>
          <p className="text-zinc-400">Start free. Upgrade when you need more firepower.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Creator Lite */}
          <div className="p-6 rounded-2xl bg-zinc-900/30 border border-white/5">
            <h3 className="text-lg font-semibold text-white mb-1">Creator Lite</h3>
            <div className="mb-4">
              <span className="text-3xl font-bold text-white">$9</span>
              <span className="text-zinc-500 text-sm">/mo</span>
            </div>
            <ul className="space-y-2 mb-6">
              {['25 scripts/month', '5 personas', '10 products', 'Script of the Day'].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup?plan=creator_lite"
              className="block w-full py-3 rounded-lg bg-zinc-800 text-zinc-200 font-medium hover:bg-zinc-700 transition-all text-center"
            >
              Start Trial
            </Link>
          </div>

          {/* Creator Pro */}
          <div className="p-6 rounded-2xl bg-zinc-900/80 border border-teal-500/50 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-teal-500 text-xs font-medium text-white">
              Most Popular
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">Creator Pro</h3>
            <div className="mb-4">
              <span className="text-3xl font-bold text-white">$29</span>
              <span className="text-zinc-500 text-sm">/mo</span>
            </div>
            <ul className="space-y-2 mb-6">
              {['Unlimited scripts', 'All 20 personas', '50 products', 'Content Planner', '25 AI video edits'].map((f) => (
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
              Start Trial
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-12">
        <div className="max-w-xl mx-auto p-6 rounded-xl bg-zinc-900/50 border border-white/5">
          <p className="text-zinc-300 leading-relaxed mb-4">
            &ldquo;The persona presets are wild. I can match any brand voice in seconds. My clients
            think I have a writing team. FlashFlow cut my script time from 2 hours to 5 minutes.&rdquo;
          </p>
          <div>
            <p className="font-medium text-white text-sm">Dani K.</p>
            <p className="text-xs text-zinc-500">UGC Creator, 120K followers</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Your Next Viral Script is 60 Seconds Away
        </h2>
        <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
          3 free scripts. No signup. No credit card. Just type your product and hit generate.
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
