'use client';

import Link from 'next/link';
import { Wand2, Camera, ArrowRight } from 'lucide-react';

export function ClipsEmptyState() {
  return (
    <div className="max-w-xl mx-auto py-16 px-5 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 mb-4">
        <Wand2 className="w-6 h-6 text-teal-300" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Your library is empty (for now).</h2>
      <p className="text-zinc-400 mb-6">
        Drop footage into the AI Video Editor, or open Studio and record. Your finished clips will land here automatically.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/create"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold text-sm"
        >
          <Wand2 className="w-4 h-4" /> Open AI Video Editor <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <Link
          href="/studio"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-sm"
        >
          <Camera className="w-4 h-4" /> Record in Studio
        </Link>
      </div>
    </div>
  );
}