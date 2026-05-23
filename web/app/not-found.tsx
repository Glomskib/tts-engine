// v11-branded-404
import Link from 'next/link';
import { Sparkles, ArrowRight, Wand2, Camera, CreditCard } from 'lucide-react';

export const metadata = {
  title: 'Page not found',
  description: 'Looks like that page moved. Try the AI Video Editor or pick a tool below.',
};

export default function NotFound() {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-5">
      <div className="max-w-xl w-full text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs mb-4">
          <Sparkles className="w-3 h-3" /> 404
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold mb-3">That page took a detour.</h1>
        <p className="text-zinc-400 mb-8">Pick a tool to keep moving:</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          <Link
            href="/create"
            className="p-4 rounded-2xl border border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10 transition group"
          >
            <Wand2 className="w-5 h-5 text-teal-300 mb-2" />
            <div className="font-semibold">AI Video Editor</div>
            <div className="text-xs text-zinc-400 mt-1">Drop footage, get a finished short</div>
            <div className="text-teal-300 text-xs mt-2 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
              Start <ArrowRight className="w-3 h-3" />
            </div>
          </Link>

          <Link
            href="/studio"
            className="p-4 rounded-2xl border border-white/10 bg-zinc-900/40 hover:bg-zinc-900/70 transition"
          >
            <Camera className="w-5 h-5 text-purple-300 mb-2" />
            <div className="font-semibold">Studio</div>
            <div className="text-xs text-zinc-400 mt-1">Record straight to the queue</div>
          </Link>

          <Link
            href="/pricing"
            className="p-4 rounded-2xl border border-white/10 bg-zinc-900/40 hover:bg-zinc-900/70 transition"
          >
            <CreditCard className="w-5 h-5 text-amber-300 mb-2" />
            <div className="font-semibold">Pricing</div>
            <div className="text-xs text-zinc-400 mt-1">Free, Lite, Creator, Pro, Fleet</div>
          </Link>
        </div>

        <div className="mt-8 text-xs text-zinc-500">
          Or head back to the <Link href="/" className="text-teal-300 hover:underline">homepage</Link>.
        </div>
      </div>
    </main>
  );
}
