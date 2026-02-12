import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'FlashFlow AI for Creators — AI TikTok Scripts in 30 Seconds',
  description: 'Stop staring at your phone. FlashFlow generates ready-to-film TikTok Shop scripts in 30 seconds. 7 creator personas. Unlimited variety. Zero creative burnout.',
  openGraph: {
    title: 'FlashFlow AI for Creators',
    description: 'AI-generated TikTok scripts in 30 seconds. 7 personas. Zero creative burnout.',
    type: 'website',
  },
};

const PERSONAS = [
  { name: 'Skeptic Convert', desc: 'I was doubtful... until I tried it.', color: 'from-amber-500/20 to-orange-500/20', best: 'Health & Wellness' },
  { name: 'Honest Reviewer', desc: 'Here\'s what they don\'t tell you.', color: 'from-blue-500/20 to-cyan-500/20', best: 'Tech & Gadgets' },
  { name: 'Excited Discovery', desc: 'OMG I just found the best thing!', color: 'from-pink-500/20 to-rose-500/20', best: 'Beauty & Trending' },
  { name: 'Storyteller', desc: 'Let me tell you what happened...', color: 'from-violet-500/20 to-purple-500/20', best: 'Lifestyle & Home' },
  { name: 'Authority Expert', desc: 'As someone who\'s done this for years...', color: 'from-emerald-500/20 to-green-500/20', best: 'Fitness & Professional' },
  { name: 'Relatable Friend', desc: 'Girl, you NEED this in your life.', color: 'from-teal-500/20 to-cyan-500/20', best: 'Kitchen & Everyday' },
  { name: 'Trend Spotter', desc: 'This is about to blow up on TikTok.', color: 'from-red-500/20 to-orange-500/20', best: 'Fashion & Viral' },
];

export default function CreatorsPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-teal-500/10 via-emerald-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

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
          <div className="inline-block px-4 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-full text-sm text-teal-400 mb-6">
            For Solo UGC Creators
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            Stop staring at your phone.<br />
            <span className="text-teal-400">Start filming.</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
            FlashFlow generates ready-to-film TikTok scripts in 30 seconds.
            7 creator personas. Unlimited variety. Zero creative burnout.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login?mode=signup" className="px-8 py-4 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl text-lg transition-colors">
              Generate Your First Script Free
            </Link>
            <Link href="/free-scripts" className="px-8 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl text-lg transition-colors border border-white/10">
              Download 50 Free Hooks
            </Link>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16">
          <h2 className="text-3xl font-bold text-center mb-4">Watch it work</h2>
          <p className="text-zinc-400 text-center mb-12 max-w-lg mx-auto">
            Three steps. Thirty seconds. A ready-to-film script.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: '1', title: 'Pick a product', desc: 'Paste a TikTok Shop link or add your product manually. FlashFlow auto-extracts selling points.' },
              { step: '2', title: 'Choose your voice', desc: 'Select from 7 creator personas. Each one writes differently so your content stays fresh.' },
              { step: '3', title: 'Film it', desc: 'Get a complete script with hook, setup, body, and CTA. Copy it, open your camera, and go.' },
            ].map((item) => (
              <div key={item.step} className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-400 font-bold text-xl">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-zinc-100 mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 7 Personas */}
        <section className="py-16">
          <h2 className="text-3xl font-bold text-center mb-4">7 voices, one tool</h2>
          <p className="text-zinc-400 text-center mb-12 max-w-lg mx-auto">
            Each persona writes differently. Your audience never hears the same formula twice.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {PERSONAS.map((p) => (
              <div key={p.name} className={`bg-gradient-to-br ${p.color} border border-white/10 rounded-xl p-5`}>
                <h3 className="font-semibold text-zinc-100 mb-1">{p.name}</h3>
                <p className="text-sm text-zinc-300 italic mb-3">&ldquo;{p.desc}&rdquo;</p>
                <span className="text-xs text-zinc-500">Best for: {p.best}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Not Just Scripts */}
        <section className="py-16">
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-8 sm:p-12">
            <h2 className="text-3xl font-bold mb-4">Not just scripts</h2>
            <p className="text-zinc-400 mb-8 max-w-2xl">
              FlashFlow is a complete content engine. Scripts are just the start.
            </p>
            <div className="grid sm:grid-cols-2 gap-6">
              {[
                { title: 'Content Packages', desc: 'Get 5 daily scripts tailored to your products. One bundle, one filming session, a week of content.' },
                { title: 'Winners Bank', desc: 'Save hooks that performed well. FlashFlow learns what works for your niche and products.' },
                { title: 'Script of the Day', desc: 'A trending, ready-to-film script drops in your dashboard every morning.' },
                { title: 'Video Editing', desc: 'Need editing help? Our team edits your raw footage into scroll-stopping content.' },
              ].map((f) => (
                <div key={f.title} className="flex gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-teal-400 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-zinc-200 mb-1">{f.title}</h3>
                    <p className="text-sm text-zinc-400">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to stop the creative block?</h2>
          <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
            5 free scripts. No credit card. Generate your first script in under 2 minutes.
          </p>
          <Link href="/login?mode=signup" className="inline-block px-8 py-4 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl text-lg transition-colors">
            Generate Your First Script Free
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
