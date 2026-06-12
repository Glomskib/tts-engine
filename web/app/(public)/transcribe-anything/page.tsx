'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import TranscriberCore from '@/components/TranscriberCore';
import TranscriberHeader from '@/components/TranscriberHeader';
import Link from 'next/link';

/**
 * Universal transcriber — paste ANY video URL (TikTok, YouTube, Shorts,
 * youtu.be, Facebook, fb.watch, Instagram). Backend auto-detects platform
 * and routes to the right API. Instagram is best-effort beta — Meta blocks
 * anonymous downloads sometimes, so copy hedges with "(beta)".
 *
 * Lead-magnet positioning: this is the entry point. Once the user sees the
 * analysis quality, the post-result CTAs sell them up to clipper / scripts.
 */

export default function TranscribeAnythingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      setIsLoggedIn(!!data.user);
    });
  }, []);

  return (
    <div className="w-full">
      {/* SEO Content Section */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs text-teal-400 mb-4">
          100% free — paste any TikTok, YouTube, Facebook, or Instagram URL
        </div>
        <h1 className="text-4xl font-bold mb-4 text-white">Free Universal Video Transcriber</h1>
        <p className="text-lg text-gray-300 mb-8">
          Paste any TikTok, YouTube, Facebook, or Instagram link. We auto-detect the platform, extract the transcript, analyze the hook, and show you why it works. Works with Shorts, youtu.be, vm.tiktok.com, fb.watch, and Instagram Reels (beta).
        </p>
      </div>

      {/* Shared header — lets the user see they're on the universal page
          and switch to a platform-specific transcriber if they prefer. */}
      <TranscriberHeader active="any" />

      {/* Tool — TranscriberCore in 'auto' mode */}
      <TranscriberCore isPortal={false} isLoggedIn={isLoggedIn} platform="auto" />

      {/* Post-tool — comparison + lead magnet */}
      <div className="max-w-4xl mx-auto px-4 py-12 mt-8">
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-white text-center">Why use FlashFlow over the others?</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {[
              { name: 'TurboScribe', price: '$20/mo', missing: 'No hook analysis' },
              { name: 'Otter', price: '$17/mo', missing: 'No clip detection' },
              { name: 'Submagic', price: '$19/mo', missing: 'No script ideas' },
              { name: 'FlashFlow', price: 'FREE', missing: 'Has it all', highlight: true },
            ].map((tool) => (
              <div key={tool.name} className={`p-4 rounded-xl border ${tool.highlight ? 'border-teal-500 bg-teal-500/5' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <div className={`text-sm font-semibold ${tool.highlight ? 'text-teal-400' : 'text-zinc-200'}`}>{tool.name}</div>
                <div className={`text-2xl font-bold mt-1 ${tool.highlight ? 'text-white' : 'text-zinc-300'}`}>{tool.price}</div>
                <div className="text-xs text-zinc-500 mt-1">{tool.missing}</div>
              </div>
            ))}
          </div>
        </section>

        {!isLoggedIn && (
          <section className="mb-12 p-6 rounded-2xl bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border border-teal-500/30">
            <h2 className="text-2xl font-bold text-white mb-2">Get unlimited free transcriptions</h2>
            <p className="text-zinc-300 mb-4">
              First 1,000 signups get unlimited transcripts forever — no credit card. Sign up to unlock the analysis library + clip making.
            </p>
            <Link
              href="/login?mode=signup&from=transcribe-anything"
              className="inline-flex items-center gap-2 px-6 py-3 bg-teal-500 text-zinc-900 rounded-lg font-bold hover:bg-teal-400 transition"
            >
              Claim free unlimited →
            </Link>
          </section>
        )}

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-white">What you get for every video</h2>
          <ul className="space-y-3 text-gray-300">
            <li className="flex items-start"><span className="text-teal-500 mr-3">✓</span> <span><strong>Full transcript</strong> — captions extracted (TikTok) or pulled from YouTube directly</span></li>
            <li className="flex items-start"><span className="text-teal-500 mr-3">✓</span> <span><strong>Hook analysis</strong> — strength score 1–10 + why it works</span></li>
            <li className="flex items-start"><span className="text-teal-500 mr-3">✓</span> <span><strong>Format breakdown</strong> — pacing, structure, target emotion</span></li>
            <li className="flex items-start"><span className="text-teal-500 mr-3">✓</span> <span><strong>Key phrases</strong> — the words doing the heavy lifting</span></li>
            <li className="flex items-start"><span className="text-teal-500 mr-3">✓</span> <span><strong>Why it works</strong> — bullet points you can apply to your own content</span></li>
            <li className="flex items-start"><span className="text-teal-500 mr-3">✓</span> <span><strong>One-click upgrades</strong> — generate your own version, clip the long one, save to library</span></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
