'use client';

/**
 * /studio/oneprompt — "describe it, we build it" page.
 * One textarea + avatar picker. Six progress dots. Final video plays inline.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Loader2, Check, AlertCircle, User, ChevronDown } from 'lucide-react';

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

interface AvatarLite {
  id: string;
  avatar_display_name?: string | null;
  name?: string;
  niche?: string | null;
  avatar_visual_reference_url?: string | null;
}

export default function OnePromptPage() {
  const sp = useSearchParams();
  const initialAvatar = sp.get('avatar') || '';
  const initialJobId = sp.get('job_id') || sp.get('job') || '';
  const [prompt, setPrompt] = useState('');
  const [avatarId, setAvatarId] = useState(initialAvatar);
  const [avatars, setAvatars] = useState<AvatarLite[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Load the user's avatars on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/avatars', { credentials: 'include' });
        const j = await r.json() as { ok?: boolean; avatars?: AvatarLite[] };
        if (!cancelled && j?.avatars) setAvatars(j.avatars);
      } finally {
        if (!cancelled) setAvatarsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2026-06-09: resume an in-progress (or finished) job from ?job_id= in the
  // URL. Without this, refreshing the tab during a Quick Video render dumps
  // the user back to the empty form even though their job is alive in the
  // DB. Single fetch on mount — the existing poll loop then takes over.
  useEffect(() => {
    if (!initialJobId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/studio/oneprompt?job_id=${initialJobId}`, { cache: 'no-store' });
        const j = await r.json() as { ok: boolean; job?: Job };
        if (!cancelled && j.ok && j.job) setJob(j.job);
      } catch { /* show form instead */ }
    })();
    return () => { cancelled = true; };
  }, [initialJobId]);

  // Poll once started.
  // 2026-06-05: also fire /api/worker/tick on each poll so the generation_jobs
  // pipeline ACTUALLY ADVANCES while this tab is open. Previously the page
  // only polled GET /api/studio/oneprompt?job_id= for status, which gave a
  // read-only view of a job that nothing was advancing. Result: every Quick
  // Video stuck at "Reading the prompt" forever. The Vercel cron now ticks
  // generation_jobs too (server-side advancement when no tab is open), and
  // this tick keeps things snappy when the user IS watching.
  useEffect(() => {
    if (!job?.id) return;
    const id = setInterval(async () => {
      // Fire-and-forget worker tick — advances any pending oneprompt /
      // ve_runs work for this user. Rate-limited server-side to 1/3s/user.
      void fetch('/api/worker/tick', { method: 'POST', credentials: 'include' }).catch(() => {});
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

  const selectedAvatar = avatars.find(a => a.id === avatarId);

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

            {/* Avatar picker */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Who&apos;s in the video?
              </label>
              {avatarsLoading ? (
                <div className="px-3 py-3 rounded-lg bg-zinc-900 border border-white/10 text-sm text-zinc-500">Loading your roster…</div>
              ) : avatars.length === 0 ? (
                <div className="px-3 py-3 rounded-lg bg-zinc-900 border border-white/10 text-sm text-zinc-400">
                  No avatars yet. <Link href="/avatars/new" className="text-teal-400 hover:underline">Add one →</Link>
                </div>
              ) : (
                <div>
                  {/* Horizontal scroll of avatar chips */}
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    <button
                      type="button"
                      onClick={() => setAvatarId('')}
                      className={`shrink-0 px-3 py-2 rounded-lg border text-sm whitespace-nowrap flex items-center gap-2 ${
                        !avatarId ? 'bg-purple-500/20 border-purple-400 text-white' : 'bg-zinc-900 border-white/10 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Pick for me
                    </button>
                    {avatars.map(a => {
                      const on = a.id === avatarId;
                      const displayName = a.avatar_display_name || a.name || 'Avatar';
                      return (
                        <button
                          key={a.id} type="button"
                          onClick={() => setAvatarId(a.id)}
                          className={`shrink-0 px-2 py-1.5 rounded-lg border text-sm flex items-center gap-2 whitespace-nowrap ${
                            on ? 'bg-purple-500/20 border-purple-400 text-white' : 'bg-zinc-900 border-white/10 text-zinc-300 hover:border-zinc-600'
                          }`}
                        >
                          {a.avatar_visual_reference_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.avatar_visual_reference_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                              <User className="w-3 h-3 text-zinc-500" />
                            </div>
                          )}
                          <span>{displayName}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedAvatar && (
                    <div className="text-[11px] text-zinc-500 mt-1">
                      Using <span className="text-zinc-300 font-medium">{selectedAvatar.avatar_display_name || selectedAvatar.name}</span>
                      {selectedAvatar.niche ? ` · ${selectedAvatar.niche}` : ''}
                    </div>
                  )}
                  {!avatarId && (
                    <div className="text-[11px] text-zinc-500 mt-1">We&apos;ll pick whichever avatar fits the prompt best.</div>
                  )}
                </div>
              )}
            </div>

            {/* Prompt */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1.5">What&apos;s the video?</label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. 30-second LinkedIn explainer of how our SaaS reduces ticket queue time. Founder-style hook. Direct CTA to book a demo."
                rows={5}
                className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none resize-none"
              />
              <div className="text-[11px] text-zinc-500 mt-1">Be specific about platform, length, and angle.</div>
            </div>

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
              {/* Failure banner — prominent, retry-able. Read error_message OR
                  output.error since the worker has historically written to
                  output.error and we now also write error_message. Fall back
                  to a generic message so users never see "stuck silently". */}
              {(job.status === 'failed' || job.step === 'failed') && (
                <div className="mt-4 p-4 rounded-lg bg-red-950/40 border border-red-700 text-sm text-red-200">
                  <div className="font-semibold mb-1 text-red-100">Something went wrong</div>
                  <div className="text-red-300/90 text-xs mb-3 whitespace-pre-wrap">
                    {job.error_message || (job.output as { error?: string } | null)?.error || 'Unknown error — try again, and contact support if it keeps happening.'}
                  </div>
                  <button
                    onClick={() => { setJob(null); setPrompt(''); }}
                    className="px-3 py-1.5 rounded-md bg-red-700/40 hover:bg-red-700/60 text-xs font-medium text-red-100"
                  >
                    Start over
                  </button>
                </div>
              )}
              {/* Non-fatal error_message while still running */}
              {job.error_message && job.status !== 'failed' && job.step !== 'failed' && (
                <div className="mt-4 p-3 rounded-lg bg-amber-900/30 border border-amber-500/30 text-sm text-amber-200">{job.error_message}</div>
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
