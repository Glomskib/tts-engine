'use client';

import { useState } from 'react';
import { Copy, Sparkles, Loader2, Eye, MessageCircle, Mic, CheckCircle, Tag } from 'lucide-react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';

interface Hook {
  visual_hook: string;
  text_on_screen: string;
  verbal_hook: string;
  strategy_note: string;
  category?: string;
  why_this_works?: string;
}

export default function AdminHookGeneratorPage() {
  const { showSuccess, showError } = useToast();
  const [product, setProduct] = useState('');
  const [platform, setPlatform] = useState('tiktok');
  const [niche, setNiche] = useState('');
  const [tone, setTone] = useState('');
  const [audience, setAudience] = useState('');
  const [constraints, setConstraints] = useState('');
  const [loading, setLoading] = useState(false);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const generateHooks = async () => {
    if (!product.trim()) return;
    setLoading(true);
    setHooks([]);

    try {
      const res = await fetch('/api/hooks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ product, platform, niche, tone, audience, constraints }),
      });

      if (!res.ok) throw new Error('Failed to generate hooks');

      const data = await res.json();
      setHooks(data.hooks || []);
      showSuccess(`${(data.hooks || []).length} hooks generated`);
    } catch {
      showError('Failed to generate hooks');
    } finally {
      setLoading(false);
    }
  };

  const copyHook = async (hook: Hook, index: number) => {
    const whyText = hook.why_this_works || hook.strategy_note;
    const categoryLine = hook.category ? `CATEGORY: ${hook.category.replace(/_/g, ' ')}\n\n` : '';
    const text = `${categoryLine}VISUAL HOOK: ${hook.visual_hook}\n\nTEXT ON SCREEN: ${hook.text_on_screen}\n\nVERBAL HOOK: ${hook.verbal_hook}\n\nWHY IT WORKS: ${whyText}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      showSuccess('Copied to clipboard');
    } catch {
      showError('Failed to copy');
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <AdminPageLayout
      title="Hook Generator"
      subtitle="Generate 3-part scroll-stopping hooks for your short-form videos"
    >
      <AdminCard title="Generate Hooks">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Product or Topic *</label>
            <input
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="e.g., Portable blender for protein shakes"
              className={inputClass}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputClass} disabled={loading}>
                <option value="tiktok">TikTok</option>
                <option value="youtube_shorts">YouTube Shorts</option>
                <option value="instagram_reels">Instagram Reels</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Niche (optional)</label>
              <select value={niche} onChange={(e) => setNiche(e.target.value)} className={inputClass} disabled={loading}>
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

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Tone (optional)</label>
            <select value={tone} onChange={(e) => setTone(e.target.value)} className={inputClass} disabled={loading}>
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
            <label className="block text-sm text-zinc-400 mb-1">Target Audience (optional)</label>
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g., Women 25-34, new moms, gym beginners"
              className={inputClass}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Constraints (optional)</label>
            <input
              type="text"
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="e.g., No profanity, avoid medical claims"
              className={inputClass}
              disabled={loading}
            />
          </div>

          <button
            onClick={generateHooks}
            disabled={loading || !product.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate Hooks</>
            )}
          </button>
        </div>
      </AdminCard>

      {hooks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-zinc-100">{hooks.length} Hooks Generated</h3>
          </div>

          {hooks.map((hook, index) => (
            <AdminCard
              key={index}
              title={`Hook #${index + 1}`}
              headerActions={
                <div className="flex items-center gap-2">
                  {hook.category && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-md">
                      <Tag className="w-3 h-3" />
                      {hook.category.replace(/_/g, ' ')}
                    </span>
                  )}
                  <button
                    onClick={() => copyHook(hook, index)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
                  >
                    {copiedIndex === index ? (
                      <><CheckCircle className="w-3.5 h-3.5 text-teal-400" /> Copied</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" /> Copy</>
                    )}
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-500/10 flex items-center justify-center">
                    <Eye className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-teal-400 mb-1">Visual Hook</div>
                    <p className="text-sm text-zinc-200">{hook.visual_hook}</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <MessageCircle className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-blue-400 mb-1">Text on Screen</div>
                    <p className="text-sm text-zinc-200">{hook.text_on_screen}</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center">
                    <Mic className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-violet-400 mb-1">Verbal Hook</div>
                    <p className="text-sm text-zinc-200">{hook.verbal_hook}</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/5">
                  <div className="text-xs font-medium text-zinc-500 mb-1">Why This Works</div>
                  <p className="text-sm text-zinc-400">{hook.why_this_works || hook.strategy_note}</p>
                </div>
              </div>
            </AdminCard>
          ))}
        </div>
      )}
    </AdminPageLayout>
  );
}
