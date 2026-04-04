'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import TranscriberCore from '@/components/TranscriberCore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TranscribePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        // Redirect logged-in users to admin transcriber
        router.push('/admin/transcribe');
      } else {
        setIsLoggedIn(false);
      }
    });
  }, [router]);

  return (
    <div className="w-full">
      {/* SEO Content Section */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs text-teal-400 mb-4">
          100% free — no signup required
        </div>
        <h1 className="text-4xl font-bold mb-4 text-white">Free TikTok Video Transcriber & Script Analyzer</h1>
        <p className="text-lg text-gray-300 mb-8">
          Paste any TikTok video link to get the full transcript, hook breakdown, and content notes. No signup required.
        </p>
      </div>

      {/* Tool */}
      <TranscriberCore isPortal={false} isLoggedIn={isLoggedIn} />

      {/* Post-Tool SEO Content */}
      <div className="max-w-4xl mx-auto px-4 py-12 mt-8">
        {/* How It Works */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-white">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-3xl font-bold text-teal-500 mb-2">1</div>
              <h3 className="text-lg font-semibold text-white mb-2">Paste a TikTok Link</h3>
              <p className="text-gray-300">Drop any public TikTok URL in the box above. Works with vm.tiktok.com and tiktok.com/@user/video/...</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-3xl font-bold text-teal-500 mb-2">2</div>
              <h3 className="text-lg font-semibold text-white mb-2">We Break It Down</h3>
              <p className="text-gray-300">The video gets transcribed, the hook gets scored, key phrases get pulled out, and emotional triggers get flagged.</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-3xl font-bold text-teal-500 mb-2">3</div>
              <h3 className="text-lg font-semibold text-white mb-2">Get Insights & Scripts</h3>
              <p className="text-gray-300">Copy the transcript, study the hook, or jump into the script writer to make your own version of what works.</p>
            </div>
          </div>
        </section>

        {/* What You Get */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-white">What You Get</h2>
          <ul className="space-y-3 text-gray-300">
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Full Transcript:</strong> Complete spoken text from the video</span>
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Hook Analysis:</strong> Hook strength score (1-10) and why it works</span>
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Key Phrases:</strong> The words and phrases doing the heavy lifting</span>
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Emotional Triggers:</strong> What emotions the video targets</span>
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Content Structure:</strong> Scene breakdown and pacing analysis</span>
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Recommendations:</strong> Specific notes on how to use this in your own content</span>
            </li>
          </ul>
        </section>

        {/* Who This Is For */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-white">Who This Is For</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-2">Content Creators</h3>
              <p className="text-gray-300">Reverse-engineer winning TikToks. Analyze competitor content and adapt top-performing hooks for your niche.</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-2">TikTok Shop Sellers</h3>
              <p className="text-gray-300">Find viral product video patterns. See what hooks convert, then use our script generator to create similar videos.</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-2">Marketing Agencies</h3>
              <p className="text-gray-300">Build content strategies on data. Analyze competitor campaigns and create data-backed scripts for clients.</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-2">UGC Creators</h3>
              <p className="text-gray-300">Master trending hooks. Understand what makes videos go viral and apply those patterns to your scripts.</p>
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
            <Link href="/youtube-transcribe" className="text-teal-400 hover:text-teal-300">YouTube Transcriber</Link>
            {' '}&mdash; same AI analysis for YouTube videos.
          </p>
        </section>

        {/* FAQ Schema is rendered via layout.tsx */}
      </div>
    </div>
  );
}
