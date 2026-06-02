'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import TranscriberCore from '@/components/TranscriberCore';
import TranscriberHeader from '@/components/TranscriberHeader';
import Link from 'next/link';

export default function YouTubeTranscribePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Don't auto-redirect signed-in users to /admin/youtube-transcribe.
  // That route is the CLIPPER (needs full video download via Cobalt — fragile,
  // breaks every time the tunnel dies). The transcriber here uses
  // /api/youtube-transcribe which pulls captions directly — works for any
  // YouTube video with captions (95%+ of content) without any download.
  // Just detect logged-in state to optionally show a different upsell.
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
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-xs text-red-400 mb-4">
          100% free — no signup required
        </div>
        <h1 className="text-4xl font-bold mb-4 text-white">Free YouTube Transcriber</h1>
        <p className="text-lg text-gray-300 mb-8">
          Paste any YouTube link. Get a clean transcript in seconds. Plus an AI breakdown of hooks, structure, and what works &mdash; bonus, free.
        </p>
      </div>

      {/* Shared header — lets the user see they're on the YouTube page
          and switch to TikTok/any-URL without guessing. */}
      <TranscriberHeader active="youtube" />

      {/* Tool */}
      <TranscriberCore isPortal={false} isLoggedIn={isLoggedIn} platform="youtube" />

      {/* Post-Tool SEO Content */}
      <div className="max-w-4xl mx-auto px-4 py-12 mt-8">
        {/* How It Works */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-white">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-3xl font-bold text-red-500 mb-2">1</div>
              <h3 className="text-lg font-semibold text-white mb-2">Paste a YouTube Link</h3>
              <p className="text-gray-300">Drop any public YouTube URL in the box above. Works with youtube.com/watch, youtu.be short links, and Shorts.</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-3xl font-bold text-red-500 mb-2">2</div>
              <h3 className="text-lg font-semibold text-white mb-2">Get the Transcript</h3>
              <p className="text-gray-300">Captions get pulled directly (or audio AI-transcribed if there are none). Clean text, ready to copy &mdash; paste it into ChatGPT, Notion, or anywhere else.</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-3xl font-bold text-red-500 mb-2">3</div>
              <h3 className="text-lg font-semibold text-white mb-2">Bonus: AI Breakdown</h3>
              <p className="text-gray-300">As a free extra, we also analyze the hook, key phrases, pacing, and structure &mdash; so you can see what makes the video work.</p>
            </div>
          </div>
        </section>

        {/* What You Get */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-white">What You Get</h2>
          <p className="text-gray-400 text-sm mb-4">The transcript is the main thing. Everything else is a free bonus.</p>
          <ul className="space-y-3 text-gray-300">
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Full Transcript (the main event):</strong> Clean, complete text from any YouTube video. One click to copy &mdash; paste it into ChatGPT, Notion, Docs, or wherever you need it.</span>
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Works for Shorts &amp; long videos:</strong> youtube.com/watch, youtu.be short links, and YouTube Shorts.</span>
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>No signup, no watermark, no upload:</strong> just paste the URL.</span>
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Bonus &mdash; AI Hook Analysis:</strong> Hook strength score (1-10) plus why it works.</span>
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Bonus &mdash; Structure &amp; Pacing:</strong> Scene breakdown and pacing notes.</span>
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Bonus &mdash; Key Phrases &amp; Emotional Triggers:</strong> The words doing the heavy lifting.</span>
            </li>
          </ul>
        </section>

        {/* Who This Is For */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-white">Who This Is For</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-2">YouTubers</h3>
              <p className="text-gray-300">Reverse-engineer top-performing videos. Analyze competitor content and adapt winning hooks and structures for your channel.</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-2">Content Repurposers</h3>
              <p className="text-gray-300">Turn long-form YouTube videos into short-form scripts for TikTok, Reels, and Shorts with AI analysis.</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-2">Marketing Agencies</h3>
              <p className="text-gray-300">Build content strategies on data. Analyze competitor YouTube campaigns and create data-backed scripts for clients.</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-2">Researchers & Students</h3>
              <p className="text-gray-300">Quickly transcribe lectures, interviews, and educational content. Get searchable text from any YouTube video.</p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center py-12 border-t border-gray-700">
          <h2 className="text-2xl font-bold mb-4 text-white">Turn Analysis Into Action</h2>
          <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
            Found a winning hook? Write your own script based on it. FlashFlow has 20+ creator personas to match your style.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/script-generator" className="px-6 py-3 bg-teal-500 text-white rounded-lg font-semibold hover:bg-teal-600 transition">
              Write a Script Free
            </Link>
            <Link href="/login?mode=signup" className="px-6 py-3 border border-gray-600 text-white rounded-lg font-semibold hover:bg-gray-800 transition">
              Create Free Account
            </Link>
            <Link href="/pricing" className="px-6 py-3 border border-teal-500 text-teal-400 rounded-lg font-semibold hover:bg-teal-500/10 transition">
              View Pricing
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Also try our{' '}
            <Link href="/transcribe" className="text-teal-400 hover:text-teal-300">TikTok Transcriber</Link>
            {' '}&mdash; same AI analysis for TikTok videos.
          </p>
        </section>
      </div>
    </div>
  );
}
