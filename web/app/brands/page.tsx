import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'FlashFlow AI for Brands — Better Affiliate Content at Scale',
  description: 'Your affiliates are wasting your commission budget. FlashFlow gives every creator product-specific scripts that actually convert. Upload your catalog once.',
  openGraph: {
    title: 'FlashFlow AI for Brands',
    description: 'Give every affiliate creator product-specific scripts that actually convert.',
    type: 'website',
  },
};

export default function BrandsPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-blue-500/10 via-indigo-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between max-w-6xl mx-auto px-6 py-6">
        <Link href="/" className="text-xl font-bold text-teal-400">FlashFlow AI</Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Login</Link>
          <Link href="/login?mode=signup" className="text-sm px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors font-medium">
            Try Free
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 pb-20">
        {/* Hero */}
        <section className="text-center pt-16 pb-20">
          <div className="inline-block px-4 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-sm text-blue-400 mb-6">
            For TikTok Shop Brands
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            Your affiliates are wasting<br />
            <span className="text-blue-400">your commission budget.</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
            FlashFlow gives every creator product-specific scripts that actually convert.
            Upload your catalog once &mdash; every affiliate gets AI-powered selling points.
          </p>
          <Link href="/login?mode=signup" className="inline-block px-8 py-4 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl text-lg transition-colors">
            Improve Your Affiliate Content
          </Link>
        </section>

        {/* The Problem */}
        <section className="py-16">
          <h2 className="text-3xl font-bold text-center mb-4">The problem with affiliate content</h2>
          <p className="text-zinc-400 text-center mb-12 max-w-lg mx-auto">
            You&apos;re paying commissions on content that doesn&apos;t convert.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: 'Generic scripts', desc: 'Creators use the same hooks for every product. "I was skeptical but..." doesn\'t move units.' },
              { title: 'Off-brand messaging', desc: 'Affiliates don\'t understand your product\'s unique selling points, objections, or target audience.' },
              { title: 'Low conversion', desc: 'Without product-specific scripts, your affiliate content converts at a fraction of what it should.' },
            ].map((p) => (
              <div key={p.title} className="bg-red-500/5 border border-red-500/10 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-zinc-100 mb-2">{p.title}</h3>
                <p className="text-sm text-zinc-400">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The Solution */}
        <section className="py-16">
          <h2 className="text-3xl font-bold text-center mb-4">The solution</h2>
          <p className="text-zinc-400 text-center mb-12 max-w-lg mx-auto">
            Upload your products. FlashFlow handles the rest.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: '1', title: 'Upload your catalog', desc: 'Paste TikTok Shop links or import manually. FlashFlow AI auto-extracts selling points, objections, and hook ideas from your product data.' },
              { step: '2', title: 'Invite your creators', desc: 'Send your affiliate creators an invite link. They get instant access to AI-powered scripts for YOUR products specifically.' },
              { step: '3', title: 'Scale on-brand content', desc: 'Every creator generates unique scripts that match your product\'s actual benefits. No more generic, off-brand content.' },
            ].map((s) => (
              <div key={s.step} className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
                <div className="w-10 h-10 mb-4 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold">
                  {s.step}
                </div>
                <h3 className="text-lg font-semibold text-zinc-100 mb-2">{s.title}</h3>
                <p className="text-sm text-zinc-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The Math */}
        <section className="py-16">
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-8 sm:p-12 text-center">
            <h2 className="text-3xl font-bold mb-8">The math</h2>
            <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto mb-8">
              <div className="bg-zinc-800/50 rounded-xl p-6">
                <div className="text-2xl font-bold text-zinc-200 mb-1">$20K/mo</div>
                <p className="text-sm text-zinc-500">In affiliate commissions</p>
              </div>
              <div className="bg-zinc-800/50 rounded-xl p-6">
                <div className="text-2xl font-bold text-teal-400 mb-1">15% improvement</div>
                <p className="text-sm text-zinc-500">Better scripts = better conversion</p>
              </div>
              <div className="bg-zinc-800/50 rounded-xl p-6">
                <div className="text-2xl font-bold text-emerald-400 mb-1">= $3K/mo</div>
                <p className="text-sm text-zinc-500">Additional revenue</p>
              </div>
            </div>
            <p className="text-zinc-400 mb-2">FlashFlow Business plan: <strong className="text-zinc-200">$59/mo</strong></p>
            <p className="text-sm text-zinc-500">50x ROI. And that&apos;s the conservative estimate.</p>
          </div>
        </section>

        {/* Brand Invite Links */}
        <section className="py-16">
          <h2 className="text-3xl font-bold text-center mb-4">Brand invite links</h2>
          <p className="text-zinc-400 text-center mb-12 max-w-lg mx-auto">
            Give your affiliates a direct link to your product catalog inside FlashFlow.
          </p>
          <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {[
              { title: 'One link, unlimited creators', desc: 'Generate a branded invite link. Share it with all your affiliates. They sign up and instantly see your products.' },
              { title: 'Track creator activity', desc: 'See which creators are generating scripts, what products they\'re scripting for, and how many scripts they\'ve produced.' },
              { title: 'Content approval', desc: 'Review scripts before creators film them. Ensure every piece of content matches your brand guidelines.' },
              { title: 'Product updates sync', desc: 'Update a product once and every creator sees the latest selling points, pricing, and talking points.' },
            ].map((f) => (
              <div key={f.title} className="flex gap-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-blue-400 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-zinc-200 mb-1">{f.title}</h3>
                  <p className="text-sm text-zinc-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 text-center">
          <h2 className="text-3xl font-bold mb-4">Better content. Better conversions. Better ROI.</h2>
          <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
            Start free. Upload your products and see the difference AI-powered scripts make.
          </p>
          <Link href="/login?mode=signup" className="inline-block px-8 py-4 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl text-lg transition-colors">
            Improve Your Affiliate Content
          </Link>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 py-8 text-center">
        <p className="text-xs text-zinc-600">
          &copy; 2026 FlashFlow AI by Making Miles Matter INC
        </p>
      </footer>
    </div>
  );
}
