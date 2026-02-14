'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import TranscriberCore from '@/components/TranscriberCore';
import Link from 'next/link';

export default function TranscribePage() {
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
        <h1 className="text-4xl font-bold mb-4 text-white">Free TikTok Video Transcriber & Script Analyzer</h1>
        <p className="text-lg text-gray-300 mb-8">
          Paste any TikTok video link below to instantly get the full transcript, AI-powered hook analysis, and content recommendations. No signup required.
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
              <h3 className="text-lg font-semibold text-white mb-2">AI Analyzes the Video</h3>
              <p className="text-gray-300">Our AI transcribes the audio, analyzes the hook strength, identifies key phrases, and rates emotional triggers.</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-3xl font-bold text-teal-500 mb-2">3</div>
              <h3 className="text-lg font-semibold text-white mb-2">Get Insights & Scripts</h3>
              <p className="text-gray-300">Export the transcript, download the script structure, or feed it into our script generator to create your own videos.</p>
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
              <span><strong>Key Phrases:</strong> Critical words and phrases that drive engagement</span>
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
              <span><strong>Recommendations:</strong> Actionable tips to adapt for your own content</span>
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
          <h2 className="text-2xl font-bold mb-4 text-white">Ready to Scale Your Content?</h2>
          <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
            Get unlimited transcriptions and advanced AI features with FlashFlow Pro. Analyze competitor content and generate scripts powered by the data.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/pricing" className="px-6 py-3 bg-teal-500 text-white rounded-lg font-semibold hover:bg-teal-600 transition">
              View Pricing
            </Link>
            <Link href="/signup" className="px-6 py-3 border border-teal-500 text-teal-500 rounded-lg font-semibold hover:bg-teal-500/10 transition">
              Get Started Free
            </Link>
          </div>
        </section>

        {/* FAQ Schema is rendered via layout.tsx */}
      </div>
    </div>
  );
}
