import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AI Content Platform for Agencies | FlashFlow AI',
  description:
    'Scale client content without scaling headcount. Multi-brand management, team seats, and unlimited AI script generation for agencies. Try free.',
  openGraph: {
    title: 'AI Content Platform for Agencies | FlashFlow AI',
    description: 'Scale client content without scaling headcount. AI-powered content generation for agencies.',
    type: 'website',
    url: 'https://flashflowai.com/lp/agency',
  },
};

export default function AgencyLP() {
  return (
    <div className="max-w-4xl mx-auto px-6">
      {/* Hero */}
      <section className="pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs text-teal-400 mb-6">
          Built for Agencies
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-6">
          Scale Client Content{' '}
          <span className="bg-gradient-to-r from-teal-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
            Without Scaling Headcount
          </span>
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8 leading-relaxed">
          Manage 10+ brands with the output of a 50-person content team. FlashFlow gives your agency
          unlimited AI scripts, multi-brand management, and team seats — all in one platform.
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
        <p className="text-xs text-zinc-500 mt-3">No signup required. See the quality for yourself.</p>
      </section>

      {/* Pain Points */}
      <section className="py-12">
        <h2 className="text-2xl font-bold text-center mb-8">Agency Growing Pains</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              title: 'More clients, same team',
              desc: 'Every new client means more scripts, more reviews, more revisions. Your writers are maxed out.',
            },
            {
              title: 'Brand voice whiplash',
              desc: 'Switching between client voices all day? Tone bleeds across accounts. Quality drops.',
            },
            {
              title: 'Content bottleneck',
              desc: 'Clients want 5 scripts a week. Your team delivers 2. The gap is growing.',
            },
          ].map((item) => (
            <div key={item.title} className="p-5 rounded-xl bg-red-500/5 border border-red-500/10">
              <h3 className="text-base font-semibold text-zinc-200 mb-2">{item.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agency Features */}
      <section className="py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Built for Multi-Client Workflows</h2>
          <p className="text-zinc-400">Everything your team needs to manage content at scale.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          {[
            {
              title: 'Unlimited Brands',
              desc: 'Each client gets their own brand space with separate products, personas, and content libraries. No cross-contamination.',
            },
            {
              title: 'Team Seats',
              desc: 'Invite your writers, strategists, and editors. Everyone works from the same platform with role-based access.',
            },
            {
              title: 'Multi-Brand Management',
              desc: 'Switch between client brands instantly. Track quotas, content calendars, and script libraries per brand.',
            },
            {
              title: 'Unlimited Scripts',
              desc: 'No per-script limits. Generate as many scripts as your clients need across all brands, every month.',
            },
            {
              title: 'Winners Bank',
              desc: 'Save and analyze top-performing TikToks across all client niches. Replicate winning patterns.',
            },
            {
              title: 'Analytics & Performance',
              desc: 'Track which scripts convert best per brand. Make data-driven content decisions for every client.',
            },
          ].map((item) => (
            <div key={item.title} className="p-5 rounded-xl bg-zinc-900/50 border border-white/5">
              <h3 className="text-base font-semibold text-zinc-200 mb-2">{item.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing — Start with Business, upgrade to Agency */}
      <section className="py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Start with Business, Scale to Agency</h2>
          <p className="text-zinc-400">Most agencies start on Business ($59/mo) and upgrade when they need custom features.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Business */}
          <div className="p-6 rounded-2xl bg-zinc-900/80 border border-teal-500/50 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-teal-500 text-xs font-medium text-white">
              Start Here
            </div>
            <h3 className="text-lg font-semibold text-white mb-1 mt-1">Business</h3>
            <div className="mb-4">
              <span className="text-3xl font-bold text-white">$59</span>
              <span className="text-zinc-500 text-sm">/mo</span>
            </div>
            <ul className="space-y-2 mb-6">
              {[
                'Unlimited scripts',
                'Unlimited brands',
                'Priority support',
                'Custom integrations',
                'All 20+ personas',
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
              href="/login?mode=signup&plan=business"
              className="block w-full py-3 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-100 transition-all text-center"
            >
              Choose Business
            </Link>
          </div>

          {/* Agency */}
          <div className="p-6 rounded-2xl bg-zinc-900/30 border border-white/5">
            <h3 className="text-lg font-semibold text-white mb-1">Agency</h3>
            <div className="mb-4">
              <span className="text-2xl font-bold text-zinc-400">Custom Pricing</span>
            </div>
            <ul className="space-y-2 mb-6">
              {[
                'Everything in Business',
                'Multi-brand management',
                'Team seats',
                'Dedicated support',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                  <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="mailto:brandon@flashflowai.com"
              className="block w-full py-3 rounded-lg bg-zinc-800 text-zinc-200 font-medium hover:bg-zinc-700 transition-all text-center"
            >
              Contact Sales
            </a>
          </div>
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
            &ldquo;Our agency manages 12 creator accounts. FlashFlow cut our script turnaround
            from 2 days to 20 minutes. The brand separation is clean — no voice bleeding between
            clients. It&apos;s like adding 3 writers to the team.&rdquo;
          </p>
          <div>
            <p className="font-medium text-white text-sm">Mark R.</p>
            <p className="text-xs text-zinc-500">Agency Founder, 12 active clients</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">
          See How FlashFlow Handles Your Content Workflow
        </h2>
        <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
          Try the script generator. Then imagine it running across every client account, every day.
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
      </section>
    </div>
  );
}
