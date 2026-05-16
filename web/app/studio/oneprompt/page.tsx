'use client';

/**
 * /studio/oneprompt — "describe it, we build it" page.
 * One textarea. One Generate. Six progress dots. Final video plays inline.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Loader2, Check, AlertCircle } from 'lucide-react';

const STEPS = [
  { key: 'parse_intent', label: 'Reading the prompt' },
  { key: 'resolve_avatar', label: 'Picking your avatar' },
  { key: 'generate_script', label: 'Writing the script' },
  { key: 'queue_render', label: 'Generating voice + video' },
  { key: 'compose', label: 'Adding captions + edit' },
  { key: 'final_publish', label: 'Saving to library' },
];

interface Job {
  id: string;
  step: string;
  status: string;
  progress: number;
  output?: { intent?: Record<string, unknown>; video_url?: string };
  error_message?: string;
  steps_done?: string[];
}

export default function OnePromptPage() {
  const sp = useSearchParams();
  const initialAvatar = sp.get('avatar') || '';
  const [prompt, setPrompt] = useState('');
  const [avatarId, setAvatarId] = useState(initialAvatar);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Poll once started
  useEffect(() => {
    if (!job?.id) return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/studio/oneprompt?job_id=${job.id}`, { cache: 'no-store' });
        const j = await r.json() as { ok: boolean; job?: Job };
        if (j.ok && j.job) {
          setJob(j.job);
          if (['completed','failed'].includes(j.job.status)) clearInterval(id);
        }
      } catch {}
    }, 3500);
    return () => clearInterval(id);
  }, [job?.id]);

  async function start() {
    if (!prompt.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/studio/oneprompt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), avatar_id: avatarId || undefined }),
      });
      const j = await r.json() as { ok: boolean; job_id?: string; error?: string };
      if (!j.ok || !j.job_id) throw new Error(j.error || 'failed to start');
      setJob({ id: j.job_id, step: 'parse_intent_done', status: 'running', progress: 10, steps_done: ['parse_intent'] });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'start failed');
    } finally { setBusy(false); }
  }

  const stepsDone = new Set(job?.steps_done || []);
  const currentStep = job?.step?.replace(/_done$/, '') || '';
  const videoUrl = job?.output?.video_url;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/avatars" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Avatars
        </Link>

        <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-purple-400" /> One-prompt video</h1>
        <p className="text-sm text-zinc-400 mt-1 mb-6">Describe what you want. We pick the avatar, write the script, generate the voice, render the video, edit it together, and drop the finished file in your library.</p>

        {!job && (
          <div className="space-y-4">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. 30-second LinkedIn explainer of how our SaaS reduces ticket queue time. Founder-style hook. Direct CTA to book a demo."
              rows={5}
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none resize-none"
            />
            <div className="text-[11px] text-zinc-500">Tip: be specific about platform, length, and angle. Leave the avatar blank and we'll pick the best match from your roster.</div>
            {err && <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-200 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5" />{err}</div>}
            <button onClick={start} disabled={busy || !prompt.trim()} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-teal-500 hover:opacity-90 disabled:opacity-50 font-bold flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Sparkles className="w-5 h-5" /> Generate</>}
            </button>
          </div>
        )}

        {job && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3">Progress</div>
              <div className="space-y-2">
                {STEPS.map((s, i) => {
                  const done = stepsDone.has(s.key);
                  const active = currentStep === s.key && !done;
                  return (
                    <div key={s.key} className="flex items-center gap-3 text-sm">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${done ? 'bg-emerald-500' : active ? 'bg-teal-500/30 border border-teal-500' : 'bg-zinc-800'}`}>
                        {done ? <Check className="w-3 h-3 text-white" /> : active ? <Loader2 className="w-3 h-3 animate-spin text-teal-300" /> : <span className="text-[9px] text-zinc-600">{i+1}</span>}
                      </div>
                      <span className={done ? 'text-emerald-300' : active ? 'text-white' : 'text-zinc-500'}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
              {job.error_message && (
                <div className="mt-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-200">{job.error_message}</div>
              )}
            </div>

            {videoUrl && (
              <div className="rounded-2xl border border-white/10 bg-zinc-900 p-3 space-y-2">
                <video src={videoUrl} controls autoPlay className="w-full max-w-sm mx-auto rounded-xl" />
                <Link href="/library" className="block text-center py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-sm font-semibold">Open in Library</Link>
              </div>
            )}

            {job.status === 'completed' && !videoUrl && (
              <div className="text-sm text-zinc-400 text-center">Finished — find it in your Library.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
