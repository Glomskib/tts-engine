'use client';

import { useState, useEffect } from 'react';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const CONTENT_TYPES = [
  'UGC Testimonial',
  'Problem/Solution',
  'Educational',
  'Story/Testimonial',
  'Direct Response',
  'Hook Only',
];

export default function FreeGeneratorPage() {
  const [topic, setTopic] = useState('');
  const [contentType, setContentType] = useState('UGC Testimonial');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [usageCount, setUsageCount] = useState(0);
  const MAX_FREE_GENS = 3;

  useEffect(() => {
    const stored = localStorage.getItem('flashflow_free_gens');
    setUsageCount(stored ? parseInt(stored, 10) : 0);
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      alert('Please enter a topic or product name');
      return;
    }

    if (usageCount >= MAX_FREE_GENS) {
      alert('You have used all 3 free generations. Sign up to keep generating!');
      return;
    }

    setLoading(true);
    setResult('');

    try {
      const res = await fetch('/api/ai/generate-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, contentType }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }

      const data = await res.json();
      setResult(data.script || data.hook || 'No script generated');

      const newCount = usageCount + 1;
      setUsageCount(newCount);
      localStorage.setItem('flashflow_free_gens', newCount.toString());
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to generate script');
    } finally {
      setLoading(false);
    }
  };

  const remainingGens = MAX_FREE_GENS - usageCount;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">Free AI Script Generator</h1>
          <p className="text-xl text-gray-400 mb-6">
            Generate viral TikTok scripts instantly. No signup required — Try {MAX_FREE_GENS} for free.
          </p>
          <div className="inline-block px-4 py-2 bg-teal-500/20 text-teal-400 rounded-full text-sm font-medium">
            {remainingGens > 0 ? `${remainingGens} free generations left` : 'Sign up for unlimited generations'}
          </div>
        </div>

        {/* Generator Form */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-8 mb-8">
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Topic or Product</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Collagen supplement for skin health"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg focus:border-teal-500 focus:outline-none text-white"
              disabled={usageCount >= MAX_FREE_GENS}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Content Type</label>
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg focus:border-teal-500 focus:outline-none text-white"
              disabled={usageCount >= MAX_FREE_GENS}
            >
              {CONTENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || usageCount >= MAX_FREE_GENS}
            className="w-full py-4 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center gap-2 transition"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Script
              </>
            )}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-8 mb-8">
            <h3 className="text-xl font-bold mb-4">Your Generated Script</h3>
            <div className="bg-gray-900 p-6 rounded-lg whitespace-pre-wrap text-gray-300">
              {result}
            </div>
          </div>
        )}

        {/* CTA After Usage */}
        {usageCount >= MAX_FREE_GENS && (
          <div className="bg-gradient-to-r from-teal-500/20 to-emerald-500/20 border border-teal-500/30 rounded-xl p-8 text-center">
            <h3 className="text-2xl font-bold mb-4">Sign up to keep generating — No Credit Card Required</h3>
            <p className="text-gray-400 mb-6">
              Get unlimited script generation, access to the full content studio, and much more.
            </p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/login?mode=signup"
                className="px-6 py-3 bg-teal-500 text-white rounded-lg font-semibold hover:bg-teal-600 transition inline-flex items-center gap-2"
              >
                Sign Up Free
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/login"
                className="px-6 py-3 border border-gray-600 text-white rounded-lg font-semibold hover:bg-gray-800 transition"
              >
                Log In
              </Link>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-gray-500 text-sm">
          Powered by FlashFlow AI
        </div>
      </div>
    </div>
  );
}
