/**
 * Video Hook Generator — pick a provider, write a prompt, debit credits, render.
 *
 * Phase 1.2 SCAFFOLDING: the providers (Heygen / Sora / Pika / Runway / Luma)
 * are stubs that throw "integration pending — set <PROVIDER>_API_KEY" until
 * Brandon adds the env vars in Vercel. The UI handles that error state and
 * shows a "coming soon" hint per provider so the surface is shippable today.
 *
 * When a provider is configured (env var present), the flow is:
 *   1. UI POSTs to /api/hooks/video/generate { providerId, prompt, ... }
 *   2. API debits credits via credit_apply() and calls provider.generate()
 *   3. UI polls /api/hooks/video/status?jobId=... until completed/failed
 *   4. Completed video URL is shown + saved to hooks library
 */
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Loader2, Sparkles, Wallet, AlertCircle, Wand2, ArrowLeft } from 'lucide-react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';

type AspectRatio = '9:16' | '1:1' | '16:9';

interface ProviderInfo {
  id: 'heygen' | 'sora' | 'pika' | 'runway' | 'luma';
  name: string;
  costCredits: number;
  supportedAspectRatios: AspectRatio[];
  supportedDurations: number[];
  description: string;
  configured: boolean;
}

interface PollResult {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
  progress?: number;
}

// Mirror of registry.ts. The /api/hooks/video/providers endpoint can return
// this list with `configured` flags, but we ship a static fallback for the UI.
const STATIC_PROVIDERS: ProviderInfo[] = [
  {
    id: 'heygen',
    name: 'Heygen Avatar',
    costCredits: 50,
    supportedAspectRatios: ['9:16', '1:1', '16:9'],
    supportedDurations: [5, 10, 15],
    description: 'Photorealistic AI avatar reads your hook script. Best for talking-head openings.',
    configured: false,
  },
  {
    id: 'pika',
    name: 'Pika',
    costCredits: 30,
    supportedAspectRatios: ['9:16', '1:1', '16:9'],
    supportedDurations: [3, 4],
    description: 'Fast, stylized 3–4s clips. Great for energetic hooks and B-roll punches.',
    configured: false,
  },
  {
    id: 'luma',
    name: 'Luma Dream Machine',
    costCredits: 60,
    supportedAspectRatios: ['9:16', '1:1', '16:9'],
    supportedDurations: [5],
    description: 'Smooth motion and dreamy transitions. Solid middle-ground.',
    configured: false,
  },
  {
    id: 'runway',
    name: 'Runway Gen-3',
    costCredits: 75,
    supportedAspectRatios: ['9:16', '16:9'],
    supportedDurations: [5, 10],
    description: 'Cinematic motion and detailed scenes from a prompt or image.',
    configured: false,
  },
  {
    id: 'sora',
    name: 'Sora',
    costCredits: 100,
    supportedAspectRatios: ['9:16', '1:1', '16:9'],
    supportedDurations: [5, 10],
    description: 'OpenAI Sora — highest quality for cinematic, realistic hook footage.',
    configured: false,
  },
];

export default function VideoHookGeneratorPage() {
  const { showError, showSuccess } = useToast();
  const [providerId, setProviderId] = useState<ProviderInfo['id']>('heygen');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [duration, setDuration] = useState<number>(5);
  const [submitting, setSubmitting] = useState(false);
  const [poll, setPoll] = useState<PollResult | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const provider = useMemo(
    () => STATIC_PROVIDERS.find((p) => p.id === providerId) ?? STATIC_PROVIDERS[0],
    [providerId],
  );

  const onProviderChange = (id: ProviderInfo['id']) => {
    setProviderId(id);
    const next = STATIC_PROVIDERS.find((p) => p.id === id)!;
    if (!next.supportedAspectRatios.includes(aspectRatio)) {
      setAspectRatio(next.supportedAspectRatios[0]);
    }
    if (!next.supportedDurations.includes(duration)) {
      setDuration(next.supportedDurations[0]);
    }
    setPendingError(null);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showError('Add a prompt first');
      return;
    }
    setSubmitting(true);
    setPoll(null);
    setPendingError(null);

    try {
      const res = await fetch('/api/hooks/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          providerId: provider.id,
          prompt: prompt.trim(),
          aspectRatio,
          durationSec: duration,
        }),
      });

      if (res.status === 404) {
        // Backend route not built yet — surface "scaffolding" message.
        setPendingError(
          `Backend endpoint /api/hooks/video/generate is not deployed yet. Provider stubs are in place — connect them to a job runner + add ${provider.id.toUpperCase()}_API_KEY in Vercel to ship this provider.`,
        );
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof data?.error === 'string' && /integration pending/i.test(data.error)) {
          setPendingError(data.error);
          return;
        }
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      // Poll for status
      const jobId: string | undefined = data?.jobId;
      if (!jobId) throw new Error('No jobId returned');
      showSuccess('Generating — this can take 30–90s');
      pollUntilDone(jobId);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const pollUntilDone = async (jobId: string) => {
    let tries = 0;
    const maxTries = 120; // ~6 min @ 3s
    const tick = async () => {
      tries++;
      try {
        const res = await fetch(`/api/hooks/video/status?jobId=${encodeURIComponent(jobId)}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PollResult;
        setPoll(data);
        if (data.status === 'completed' || data.status === 'failed') return;
      } catch {
        // swallow transient poll errors
      }
      if (tries < maxTries) setTimeout(tick, 3000);
    };
    tick();
  };

  const inputClass =
    'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <AdminPageLayout
      title="Video Hook Generator"
      subtitle="Pick a provider, write a prompt, get a ready-to-cut hook video"
      stage="create"
    >
      <div className="flex items-center gap-4 mb-2 text-sm">
        <Link
          href="/admin/hook-generator"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to text hooks
        </Link>
      </div>

      {/* Provider picker */}
      <AdminCard title="Choose a provider">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {STATIC_PROVIDERS.map((p) => {
            const isActive = p.id === provider.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onProviderChange(p.id)}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  isActive
                    ? 'border-teal-500/60 bg-teal-500/10'
                    : 'border-white/10 bg-zinc-900/40 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-semibold text-white">{p.name}</div>
                  <span className="inline-flex items-center gap-1 text-xs text-teal-400">
                    <Wallet size={12} />
                    {p.costCredits} cr
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed mb-2">{p.description}</p>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
                  {p.supportedAspectRatios.join(' · ')} · {p.supportedDurations.join('/')}s
                </div>
                {!p.configured && (
                  <div className="mt-2 text-[10px] text-amber-400/90">
                    Coming soon — needs {p.id.toUpperCase()}_API_KEY
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </AdminCard>

      {/* Prompt + options */}
      <AdminCard title="Describe the hook">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Prompt *</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A close-up of a woman gasping in disbelief at her phone, cinematic lighting, tight framing, vertical 9:16"
              className={`${inputClass} min-h-[110px] resize-y`}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Aspect ratio</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                className={inputClass}
                disabled={submitting}
              >
                {provider.supportedAspectRatios.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Duration</label>
              <select
                value={String(duration)}
                onChange={(e) => setDuration(Number(e.target.value))}
                className={inputClass}
                disabled={submitting}
              >
                {provider.supportedDurations.map((d) => (
                  <option key={d} value={d}>
                    {d}s
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cost preview */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-white/5 text-sm">
            <span className="text-zinc-400">
              Cost: <span className="text-teal-400 font-mono">{provider.costCredits}</span> credits
              {' '}<span className="text-zinc-600">(~${(provider.costCredits * 0.1).toFixed(2)})</span>
            </span>
            <button
              onClick={handleGenerate}
              disabled={submitting || !prompt.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>

          {pendingError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Provider not connected yet</div>
                <div className="text-xs text-amber-300/90 mt-1">{pendingError}</div>
              </div>
            </div>
          )}
        </div>
      </AdminCard>

      {/* Status display */}
      {poll && (
        <AdminCard title="Status">
          {poll.status === 'completed' && poll.videoUrl ? (
            <div className="space-y-2">
              <div className="text-sm text-teal-400 inline-flex items-center gap-2">
                <Sparkles size={14} /> Done.
              </div>
              <video
                src={poll.videoUrl}
                controls
                className="w-full max-w-sm rounded-lg border border-white/10"
              />
              <a
                href={poll.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-zinc-400 hover:text-zinc-200 underline"
              >
                Open in new tab
              </a>
            </div>
          ) : poll.status === 'failed' ? (
            <div className="text-sm text-rose-400">
              Failed: {poll.errorMessage || 'unknown error'}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              {poll.status === 'queued' ? 'Queued' : 'Rendering'}
              {typeof poll.progress === 'number' && ` · ${Math.round(poll.progress * 100)}%`}
            </div>
          )}
        </AdminCard>
      )}
    </AdminPageLayout>
  );
}
