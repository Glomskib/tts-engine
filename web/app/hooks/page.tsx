'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { Copy, Sparkles, Loader2, Eye, MessageCircle, Mic, Lock, CheckCircle } from 'lucide-react';

interface Hook {
  visual_hook: string;
  text_on_screen: string;
  verbal_hook: string;
  strategy_note: string;
}

export default function HookDoctorPage() {
  const [product, setProduct] = useState('');
  const [platform, setPlatform] = useState('tiktok');
  const [niche, setNiche] = useState('');
  const [tone, setTone] = useState('');
  const [audience, setAudience] = useState('');
  const [hookStyle, setHookStyle] = useState('');
  const [constraints, setConstraints] = useState('');
  const [loading, setLoading] = useState(false);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [usageCount, setUsageCount] = useState(0);
  const [showGate, setShowGate] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    const count = parseInt(localStorage.getItem('hookDoctorUsage') || '0');
    setUsageCount(count);
    if (count >= 3) {
      setShowGate(true);
    }
  }, []);

  const generateHooks = async () => {
    if (!product.trim()) return;
    
    if (usageCount >= 3) {
      setShowGate(true);
      return;
    }

    setLoading(true);
    setHooks([]);

    try {
      const res = await fetch('/api/hooks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, platform, niche, tone, audience, hookStyle, constraints }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate hooks');
      }

      const data = await res.json();
      setHooks(data.hooks || []);
      
      const newCount = usageCount + 1;
      setUsageCount(newCount);
      localStorage.setItem('hookDoctorUsage', newCount.toString());
      
      if (newCount >= 3) {
        setShowGate(true);
      }
    } catch (error) {
      console.error('Error generating hooks:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyHook = async (hook: Hook, index: number) => {
    const text = `🎬 VISUAL HOOK: ${hook.visual_hook}\n\n📝 TEXT ON SCREEN: ${hook.text_on_screen}\n\n🗣️ VERBAL HOOK: ${hook.verbal_hook}\n\n💡 WHY IT WORKS: ${hook.strategy_note}`;
    
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <>
      <Head>
        <title>Free AI Hook Generator for TikTok, YouTube Shorts & Reels | FlashFlow</title>
        <meta name="description" content="Generate scroll-stopping 3-part hooks for your short-form videos. AI-powered visual hooks, text overlays, and verbal openers that stop thumbs and keep viewers watching." />
        <meta name="keywords" content="hook generator, tiktok hook ideas, youtube shorts hooks, instagram reels hooks, video hooks, scroll stopping hooks, ai hook generator" />
        <meta property="og:title" content="Hook Doctor - Free AI Hook Generator" />
        <meta property="og:description" content="Generate 3-part scroll-stopping hooks for TikTok, YouTube Shorts, and Instagram Reels" />
        <meta property="og:type" content="website" />
      </Head>
      <div className="min-h-screen bg-gray-900 text-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-emerald-900/20 to-gray-900 py-12 md:py-20 px-4">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-emerald-400 font-medium">Free AI-Powered Tool</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-white via-emerald-200 to-white bg-clip-text text-transparent">
            Hook Doctor
          </h1>
          <p className="text-lg md:text-xl text-gray-300 mb-8">
            Generate 3-part scroll-stopping hooks that stop thumbs and keep viewers watching
          </p>
          <p className="hidden md:block text-sm text-gray-400 max-w-2xl mx-auto">
            Every great video starts with a great hook. Our AI analyzes top-performing content across TikTok, YouTube Shorts, and Instagram Reels to generate hooks that combine visual pattern interrupts, curiosity-driving text overlays, and compelling verbal openers.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Input Form */}
        <div className="bg-gray-800/50 rounded-2xl p-4 md:p-8 border border-gray-700/50 backdrop-blur-sm mb-12">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Product or Topic *
              </label>
              <input
                type="text"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g., Portable blender for protein shakes"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                disabled={loading || showGate}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Platform
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={loading || showGate}
                >
                  <option value="tiktok">TikTok</option>
                  <option value="youtube_shorts">YouTube Shorts</option>
                  <option value="instagram_reels">Instagram Reels</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Niche / Category (optional)
                </label>
                <select
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={loading || showGate}
                >
                  <option value="">All Niches</option>
                  <option value="fitness">Fitness</option>
                  <option value="beauty">Beauty</option>
                  <option value="tech">Tech</option>
                  <option value="food">Food</option>
                  <option value="finance">Finance</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Tone (optional)
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={loading || showGate}
                >
                  <option value="">Auto</option>
                  <option value="Funny">Funny</option>
                  <option value="Aggressive">Aggressive</option>
                  <option value="Clinical">Clinical</option>
                  <option value="Luxury">Luxury</option>
                  <option value="Sarcastic">Sarcastic</option>
                  <option value="Hype">Hype</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Hook Style (optional)
                </label>
                <select
                  value={hookStyle}
                  onChange={(e) => setHookStyle(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={loading || showGate}
                >
                  <option value="">Mix</option>
                  <option value="Shock/Stat">Shock / Stat</option>
                  <option value="Story">Story</option>
                  <option value="Contrarian">Contrarian</option>
                  <option value="Problem-Solution">Problem-Solution</option>
                  <option value="Before/After">Before / After</option>
                  <option value="POV">POV</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Target Audience (optional)
              </label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g., Women 25-34, new moms, gym beginners"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                disabled={loading || showGate}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Constraints (optional)
              </label>
              <input
                type="text"
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder="e.g., No profanity, avoid medical claims"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                disabled={loading || showGate}
              />
            </div>

            <button
              onClick={generateHooks}
              disabled={loading || !product.trim() || showGate}
              className="w-full px-6 py-4 mb-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Hooks...
                </>
              ) : showGate ? (
                <>
                  <Lock className="w-5 h-5" />
                  Sign Up for Unlimited Access
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Hooks ({3 - usageCount} free uses left)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Usage Gate */}
        {showGate && (
          <div className="bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-2xl p-8 mb-12 text-center">
            <Lock className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-3">You've used your free hooks!</h3>
            <p className="text-gray-300 mb-6">
              Sign up for unlimited hook generation plus full script writing, AI video creation, and more.
            </p>
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-all"
            >
              Sign Up for Free
            </Link>
          </div>
        )}

        {/* Generated Hooks */}
        {hooks.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Your Scroll-Stopping Hooks</h2>
              <span className="text-sm text-gray-400">
                {hooks.length} hooks generated
              </span>
            </div>

            {hooks.map((hook, index) => (
              <div
                key={index}
                className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50 hover:border-emerald-500/30 transition-all"
              >
                <div className="flex items-start justify-between mb-6">
                  <span className="text-lg font-bold text-emerald-400">Hook #{index + 1}</span>
                  <button
                    onClick={() => copyHook(hook, index)}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 hover:bg-emerald-500/10 border border-gray-600 hover:border-emerald-500/30 rounded-lg transition-all text-sm"
                  >
                    {copiedIndex === index ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Hook</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <Eye className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-emerald-400 mb-1">🎬 Visual Hook</div>
                      <p className="text-gray-200">{hook.visual_hook}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-blue-400 mb-1">📝 Text on Screen</div>
                      <p className="text-gray-200">{hook.text_on_screen}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                      <Mic className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-purple-400 mb-1">🗣️ Verbal Hook</div>
                      <p className="text-gray-200">{hook.verbal_hook}</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-700/50">
                    <div className="text-xs font-medium text-gray-400 mb-2">💡 Why This Works</div>
                    <p className="text-sm text-gray-300">{hook.strategy_note}</p>
                  </div>
                </div>

                {!showGate && (
                  <div className="mt-4 pt-4 border-t border-gray-700/50">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Lock className="w-4 h-4" />
                      <span>Sign up to save this hook to your library</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CTA Banner */}
        <div className="mt-12 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-2xl p-8">
          <h3 className="text-2xl font-bold mb-3">Hooks are just the beginning.</h3>
          <p className="text-gray-300 mb-6">
            Generate full scripts with pain points, CTAs, scene directions, and AI video generation. Join FlashFlow to unlock the complete content creation pipeline.
          </p>
          <Link
            href="/auth/sign-up"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-all"
          >
            Try FlashFlow Free →
          </Link>
        </div>
      </div>

      {/* Footer Links */}
      <div className="max-w-4xl mx-auto px-4 py-8 border-t border-gray-800">
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-400">
          <Link href="/" className="hover:text-emerald-400 transition-colors">
            Home
          </Link>
          <Link href="/about" className="hover:text-emerald-400 transition-colors">
            About
          </Link>
          <Link href="/auth/sign-up" className="hover:text-emerald-400 transition-colors">
            Sign Up
          </Link>
        </div>
      </div>
      </div>
    </>
  );
}
