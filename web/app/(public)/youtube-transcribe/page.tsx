'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import TranscriberCore from '@/components/TranscriberCore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function YouTubeTranscribePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.push('/admin/youtube-transcribe');
      } else {
        setIsLoggedIn(false);
      }
    });
  }, [router]);

  return (
    <div className="w-full">
      {/* SEO Content Section */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-xs text-red-400 mb-4">
          100% free — no signup required
        </div>
        <h1 className="text-4xl font-bold mb-4 text-white">Free YouTube Video Transcriber & Script Analyzer</h1>
        <p className="text-lg text-gray-300 mb-8">
          Paste any YouTube video link below to instantly get the full transcript, AI-powered hook analysis, and content recommendations. No signup required.
        </p>
      </div>

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
              <h3 className="text-lg font-semibold text-white mb-2">AI Analyzes the Video</h3>
              <p className="text-gray-300">Our AI extracts captions or transcribes audio, analyzes hook strength, identifies key phrases, and rates emotional triggers.</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-3xl font-bold text-red-500 mb-2">3</div>
              <h3 className="text-lg font-semibold text-white mb-2">Get Insights & Scripts</h3>
              <p className="text-gray-300">Export the transcript, study the hook structure, or use our script generator to create your own videos based on what works.</p>
            </div>
          </div>
        </section>

        {/* What You Get */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-white">What You Get</h2>
          <ul className="space-y-3 text-gray-300">
            <li className="flex items-start">
              <span className="text-teal-500 mr-3">✓</span>
              <span><strong>Full Transcript:</strong> Complete spoken text from the video, extracted from captions or AI-transcribed audio</span>
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
            Found a winning hook? Generate your own script based on it. FlashFlow&apos;s AI script generator uses 20+ persona voices to create scroll-stopping content.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/script-generator" className="px-6 py-3 bg-teal-500 text-white rounded-lg font-semibold hover:bg-teal-600 transition">
              Generate a Script Free
            </Link>
            <Link href="/signup" className="px-6 py-3 border border-gray-600 text-white rounded-lg font-semibold hover:bg-gray-800 transition">
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
