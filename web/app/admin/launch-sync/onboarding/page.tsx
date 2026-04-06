'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminPageLayout, { AdminButton } from '../../components/AdminPageLayout';
import { Rocket, Zap, ArrowRight, Loader2, Package, Users, Sparkles, Check } from 'lucide-react';

const STEPS = ['product', 'mode', 'generate'] as const;
type Step = typeof STEPS[number];

export default function LaunchSyncOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('product');
  const [title, setTitle] = useState('');
  const [asin, setAsin] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [mode, setMode] = useState<'solo' | 'agency'>('solo');
  const [creating, setCreating] = useState(false);

  const inputClass = 'w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-sm';

  const handleLaunch = async () => {
    if (!title.trim()) return;
    setCreating(true);

    try {
      // Create the launch
      const res = await fetch('/api/launch-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          asin: asin.trim() || undefined,
          source_url: sourceUrl.trim() || undefined,
          mode,
          target_videos: mode === 'agency' ? 20 : 10,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      const launchId = json.data.id;

      // Auto-generate content
      await fetch(`/api/launch-sync/${launchId}/generate`, { method: 'POST' });

      // Navigate to the launch workspace
      router.push(`/admin/launch-sync/${launchId}`);
    } catch {
      setCreating(false);
    }
  };

  const stepIdx = STEPS.indexOf(step);

  return (
    <AdminPageLayout title="Launch Your First Product" subtitle="3 quick steps to your first TikTok launch" stage="production">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              i < stepIdx ? 'bg-teal-600 text-white' :
              i === stepIdx ? 'bg-teal-500/20 text-teal-400 border-2 border-teal-500' :
              'bg-zinc-800 text-zinc-600 border border-zinc-700'
            }`}>
              {i < stepIdx ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-12 h-0.5 ${i < stepIdx ? 'bg-teal-600' : 'bg-zinc-800'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Product */}
      {step === 'product' && (
        <div className="max-w-lg">
          <div className="mb-6">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 flex items-center justify-center mb-4">
              <Package className="w-6 h-6 text-teal-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">What product are you launching?</h2>
            <p className="text-sm text-zinc-400">Enter your product details. You can always edit these later.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Product Name *</label>
              <input
                className={inputClass}
                placeholder="e.g. Ice Roller Face Massager"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Amazon URL or ASIN (optional)</label>
              <input
                className={inputClass}
                placeholder="https://amazon.com/dp/... or B09XXXXX"
                value={sourceUrl || asin}
                onChange={e => {
                  const v = e.target.value;
                  if (v.startsWith('http')) { setSourceUrl(v); setAsin(''); }
                  else { setAsin(v); setSourceUrl(''); }
                }}
              />
              <p className="text-[11px] text-zinc-600 mt-1">Helps the AI generate better, more specific hooks.</p>
            </div>

            <AdminButton variant="primary" onClick={() => setStep('mode')} disabled={!title.trim()}>
              Next <ArrowRight className="w-4 h-4" />
            </AdminButton>
          </div>
        </div>
      )}

      {/* Step 2: Mode */}
      {step === 'mode' && (
        <div className="max-w-lg">
          <div className="mb-6">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">How are you launching?</h2>
            <p className="text-sm text-zinc-400">You can change this anytime.</p>
          </div>

          <div className="space-y-3 mb-6">
            <button
              onClick={() => setMode('solo')}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                mode === 'solo'
                  ? 'border-teal-500 bg-teal-500/10'
                  : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <Rocket className={`w-5 h-5 ${mode === 'solo' ? 'text-teal-400' : 'text-zinc-500'}`} />
                <div>
                  <p className="text-sm font-semibold text-zinc-100">Solo Creator</p>
                  <p className="text-xs text-zinc-500 mt-0.5">I'm creating the content myself</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode('agency')}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                mode === 'agency'
                  ? 'border-violet-500 bg-violet-500/10'
                  : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <Users className={`w-5 h-5 ${mode === 'agency' ? 'text-violet-400' : 'text-zinc-500'}`} />
                <div>
                  <p className="text-sm font-semibold text-zinc-100">Agency / Brand</p>
                  <p className="text-xs text-zinc-500 mt-0.5">I'm distributing to affiliates and creators</p>
                </div>
              </div>
            </button>
          </div>

          <div className="flex gap-2">
            <AdminButton variant="secondary" onClick={() => setStep('product')}>Back</AdminButton>
            <AdminButton variant="primary" onClick={() => setStep('generate')}>
              Next <ArrowRight className="w-4 h-4" />
            </AdminButton>
          </div>
        </div>
      )}

      {/* Step 3: Generate */}
      {step === 'generate' && (
        <div className="max-w-lg">
          <div className="mb-6">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Ready to launch!</h2>
            <p className="text-sm text-zinc-400">We'll create your launch and generate hooks, scripts, and a creator brief.</p>
          </div>

          {/* Summary */}
          <div className="bg-zinc-800/50 rounded-xl p-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Product</span>
              <span className="text-zinc-200 font-medium">{title}</span>
            </div>
            {(asin || sourceUrl) && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">{sourceUrl ? 'URL' : 'ASIN'}</span>
                <span className="text-zinc-400 text-xs truncate max-w-[200px]">{sourceUrl || asin}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Mode</span>
              <span className="text-zinc-200 font-medium">{mode === 'solo' ? 'Solo Creator' : 'Agency / Brand'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">AI will generate</span>
              <span className="text-teal-400 text-xs">5 hooks + 3 scripts + creator brief</span>
            </div>
          </div>

          <div className="flex gap-2">
            <AdminButton variant="secondary" onClick={() => setStep('mode')}>Back</AdminButton>
            <AdminButton variant="primary" onClick={handleLaunch} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating & generating...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  Launch & Generate Content
                </>
              )}
            </AdminButton>
          </div>

          {creating && (
            <p className="text-xs text-zinc-500 mt-3 animate-pulse">
              AI is generating your hooks, scripts, and creator brief. This takes about 30 seconds...
            </p>
          )}
        </div>
      )}
    </AdminPageLayout>
  );
}
