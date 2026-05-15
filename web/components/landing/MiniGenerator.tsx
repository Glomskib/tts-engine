'use client';

// ============================================================
// MiniGenerator — inline "Try it now" script generator.
// Calls /api/public/generate-script. Visitor must opt-in by
// typing. No auto-load (keeps the page light + lets bots see
// the section's static framing).
// ============================================================

import { useState } from 'react';
import Link from 'next/link';

interface Beat {
  t: string;
  action: string;
  dialogue?: string;
  on_screen_text?: string;
}

interface SkitResult {
  hook_line: string;
  beats: Beat[];
  cta_line: string;
  cta_overlay: string;
}

export default function MiniGenerator() {
  const [product, setProduct] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SkitResult | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!product.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setIsDemo(false);

    try {
      const res = await fetch('/api/public/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: product.trim(),
          risk_tier: 'BALANCED',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed');
        return;
      }
      setResult(data.skit);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 rounded-2xl bg-zinc-900/80 border border-white/10">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          placeholder="Type your product — e.g. Matcha Energy Powder"
          className="flex-1 px-4 py-3 rounded-xl bg-zinc-800 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          maxLength={100}
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !product.trim()}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-teal-600 text-white font-semibold hover:from-violet-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
        >
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {result && (
        <div className="mt-6 space-y-4">
          {isDemo && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 text-[11px] font-semibold uppercase tracking-wide">
                Example script
              </span>
              <span className="text-xs text-zinc-600">Type your product above to generate yours</span>
            </div>
          )}

          <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-teal-500/10 border border-violet-500/20">
            <div className="text-xs font-medium text-violet-400 uppercase tracking-wider mb-1">Hook</div>
            <p className="text-lg font-semibold text-zinc-100">&ldquo;{result.hook_line}&rdquo;</p>
          </div>

          <div className="space-y-2">
            {result.beats.slice(0, 3).map((beat, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50">
                <span className="shrink-0 px-2 py-0.5 rounded bg-zinc-700 text-xs font-mono text-zinc-400">
                  {beat.t}
                </span>
                <div>
                  {beat.dialogue && (
                    <p className="text-sm text-zinc-200">&ldquo;{beat.dialogue}&rdquo;</p>
                  )}
                  <p className="text-xs text-zinc-500 mt-0.5">{beat.action}</p>
                </div>
              </div>
            ))}
            {result.beats.length > 3 && (
              <p className="text-xs text-zinc-600 text-center">+ {result.beats.length - 3} more beats</p>
            )}
          </div>

          <div className="p-3 rounded-lg bg-zinc-800/50">
            <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">CTA: </span>
            <span className="text-sm text-zinc-200">{result.cta_line}</span>
          </div>

          <div className="pt-4 border-t border-white/5">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Link
                href="/login?mode=signup"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold hover:from-teal-400 hover:to-emerald-400 transition-all shadow-lg shadow-teal-500/20"
              >
                Get 5 Free Scripts Daily — No Card
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/script-generator"
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors whitespace-nowrap"
              >
                Try full generator &rarr;
              </Link>
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              Free: 20+ persona voices · script library · TikTok transcriber · Winners Bank access
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
