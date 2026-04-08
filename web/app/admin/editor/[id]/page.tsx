'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import AdminPageLayout from '../../components/AdminPageLayout';
import { ArrowLeft, Download, RefreshCw, AlertCircle, Share2, Sparkles, Plus, Send, Gift, Copy } from 'lucide-react';

interface JobAsset { kind: string; path: string; name: string }
interface Transcript { text?: string }
interface Job {
  id: string;
  title: string;
  mode: string;
  status: string;
  error: string | null;
  output_url: string | null;
  preview_url: string | null;
  assets: JobAsset[];
  transcript: Transcript | null;
  created_at: string;
  updated_at: string;
}

const TERMINAL = new Set(['completed', 'failed']);
const STAGES = ['draft', 'uploading', 'transcribing', 'building_timeline', 'rendering', 'completed'];

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-zinc-800 text-zinc-300',
  uploading: 'bg-blue-900/60 text-blue-200',
  transcribing: 'bg-purple-900/60 text-purple-200',
  building_timeline: 'bg-indigo-900/60 text-indigo-200',
  rendering: 'bg-amber-900/60 text-amber-200',
  completed: 'bg-green-900/60 text-green-200',
  failed: 'bg-red-900/60 text-red-200',
};

export default function EditJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [variationsLoading, setVariationsLoading] = useState(false);
  const [tiktokLoading, setTiktokLoading] = useState(false);
  const [plan, setPlan] = useState<string>('free');
  const [referral, setReferral] = useState<{ code: string; link: string } | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);

  // Load the user's plan once so we can gate the upgrade triggers client-side.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me/entitlements')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.plan) setPlan(String(d.plan).toLowerCase()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const isFreePlan = plan === 'free' || plan === 'unknown';

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function handlePostToTikTok() {
    setTiktokLoading(true);
    try {
      const res = await fetch(`/api/editor/jobs/${id}/post-to-tiktok`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to prepare TikTok post');
        return;
      }
      if (data.fallback && data.mp4_url) {
        const copied = await copyToClipboard(data.mp4_url);
        window.open(data.tiktok_upload_url || 'https://www.tiktok.com/upload', '_blank', 'noopener');
        showToast(copied ? 'MP4 link copied — paste into TikTok upload' : 'Opened TikTok upload (copy MP4 link from the player)');
      } else {
        showToast('Scheduled to TikTok');
      }
    } finally {
      setTiktokLoading(false);
    }
  }

  async function handleVariations() {
    // Trigger B: free user clicking "Make 3 Variations" — if they've already
    // used today's 1 free variation, show the upgrade modal client-side and
    // never hit the API. (The API also enforces — defense in depth.)
    if (isFreePlan) {
      try {
        const res = await fetch('/api/usage/daily', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const used = data?.usage?.variations ?? 0;
          if (used >= 1) {
            window.dispatchEvent(new CustomEvent('flashflow:upgrade', {
              detail: {
                headline: 'Variations are how creators scale.',
                subtext: 'Unlock unlimited variations on Creator ($29/mo).',
                feature: 'variations',
              },
            }));
            return;
          }
        }
      } catch {
        // fall through to the server — defense in depth will still block
      }
    }
    setVariationsLoading(true);
    try {
      const res = await fetch(`/api/editor/jobs/${id}/variations`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data.upgrade) {
          showToast(`Daily variation limit reached (${data.used}/${data.limit}) — upgrade for more`);
        } else {
          showToast(data.error || 'Failed to create variations');
        }
        return;
      }
      showToast(`Created ${data.count} variation${data.count === 1 ? '' : 's'} — check your jobs list`);
    } finally {
      setVariationsLoading(false);
    }
  }

  async function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const ok = await copyToClipboard(url);
    showToast(ok ? 'Link copied' : 'Could not copy link');
  }

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/editor/jobs/${id}`, { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        setJob(j.job);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) return;
    const t = setInterval(fetchJob, 3000);
    return () => clearInterval(t);
  }, [job, fetchJob]);

  // Trigger A: 1.5s after a successful edit, celebrate + upsell. Once-per-user.
  // Also lazy-load the user's referral code for the invite card.
  useEffect(() => {
    if (!job || job.status !== 'completed') return;

    // Load referral code once the video is ready.
    if (!referral) {
      fetch('/api/referrals', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const s = d?.data?.stats;
          if (s?.referralCode) setReferral({ code: s.referralCode, link: s.referralLink });
        })
        .catch(() => {});
    }

    if (!isFreePlan) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('flashflow_first_edit_celebrated') === '1') return;

    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('flashflow:upgrade', {
        detail: {
          headline: 'You just made your first video 🎉',
          subtext: 'Want 10 more today? Unlock Creator for $29/mo.',
          feature: 'first_edit',
        },
      }));
      localStorage.setItem('flashflow_first_edit_celebrated', '1');
    }, 1500);
    return () => clearTimeout(t);
  }, [job, isFreePlan, referral]);

  async function handleCopyReferral() {
    if (!referral) return;
    const ok = await copyToClipboard(referral.link);
    if (ok) {
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2500);
      showToast('Invite link copied');
    }
  }

  async function retry() {
    setRetrying(true);
    await fetch(`/api/editor/jobs/${id}/retry`, { method: 'POST' });
    setRetrying(false);
    fetchJob();
  }

  if (loading && !job) {
    return <AdminPageLayout title="Edit Job"><div className="text-sm text-zinc-500">Loading…</div></AdminPageLayout>;
  }
  if (!job) {
    return <AdminPageLayout title="Not found"><div className="text-sm text-zinc-500">Job not found.</div></AdminPageLayout>;
  }

  const stageIdx = STAGES.indexOf(job.status);

  return (
    <AdminPageLayout title={job.title} subtitle={`Mode: ${job.mode}`}>
      <div className="mb-4 flex items-center gap-2">
        <Link href="/admin/editor" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <button
          onClick={fetchJob}
          className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <span className={`text-[11px] px-2 py-1 rounded-full uppercase tracking-wide ${STATUS_STYLES[job.status] ?? 'bg-zinc-800 text-zinc-300'}`}>
            {job.status.replace(/_/g, ' ')}
          </span>
          <span className="text-xs text-zinc-500">Updated {new Date(job.updated_at).toLocaleString()}</span>
        </div>

        {/* State machine progress */}
        <div className="flex items-center gap-2 flex-wrap">
          {STAGES.slice(0, -1).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${i <= stageIdx && job.status !== 'failed' ? 'bg-teal-600 text-white' : job.status === 'failed' && i < stageIdx ? 'bg-red-700 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                {i + 1}
              </div>
              <span className="text-xs text-zinc-400 capitalize">{s.replace(/_/g, ' ')}</span>
              {i < STAGES.length - 2 && <span className="text-zinc-700">→</span>}
            </div>
          ))}
        </div>

        {job.error && (
          <div className="mt-4 rounded-lg bg-red-950/40 border border-red-900 p-3 text-sm text-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">Job failed</div>
              <div className="text-xs break-words">{job.error}</div>
              <button
                onClick={retry}
                disabled={retrying}
                className="mt-2 inline-flex items-center gap-1 rounded bg-red-800 hover:bg-red-700 px-3 py-1 text-xs text-white"
              >
                <RefreshCw className="w-3 h-3" /> {retrying ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          </div>
        )}
      </div>

      {job.status === 'completed' && job.output_url && (
        <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 border border-teal-900/40 rounded-2xl p-6 mb-5 shadow-lg shadow-teal-950/20">
          <video
            key={job.output_url}
            src={job.output_url}
            autoPlay
            muted
            loop
            playsInline
            controls
            className="w-full rounded-xl bg-black mb-5"
            style={{ maxHeight: '70vh' }}
          />
          <h2 className="text-2xl font-bold text-center text-zinc-50 mb-5">
            <span role="img" aria-label="party">🎉</span> Your video is ready
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href={job.output_url}
              download
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition"
            >
              <Download className="w-4 h-4" /> Download MP4
            </a>
            <button
              onClick={handlePostToTikTok}
              disabled={tiktokLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 px-4 py-3 text-sm font-medium text-white transition"
            >
              <Send className="w-4 h-4" /> {tiktokLoading ? 'Preparing…' : 'Post to TikTok'}
            </button>
            <Link
              href="/admin/editor/new"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 py-3 text-sm font-medium text-white transition"
            >
              <Plus className="w-4 h-4" /> Create Another
            </Link>
            <button
              onClick={handleVariations}
              disabled={variationsLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-60 px-4 py-3 text-sm font-semibold text-white transition"
            >
              <Sparkles className="w-4 h-4" /> {variationsLoading ? 'Starting…' : 'Make 3 Variations'}
            </button>
          </div>
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <Share2 className="w-3.5 h-3.5" /> Share preview
            </button>
          </div>

          {/* Referral growth loop — invite a friend for +3 free edits/day */}
          {referral && (
            <div className="mt-5 rounded-xl border border-violet-900/40 bg-violet-950/20 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/30 flex items-center justify-center shrink-0">
                  <Gift className="w-4 h-4 text-violet-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-100">
                    Want 3 more free videos? Invite a friend.
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5 mb-2">
                    Each friend who signs up with your code gives you +3 edits/day.
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-black/40 border border-zinc-800 rounded px-2 py-1.5 text-zinc-300 truncate">
                      {referral.link}
                    </code>
                    <button
                      onClick={handleCopyReferral}
                      className="inline-flex items-center gap-1 rounded-md bg-violet-600 hover:bg-violet-500 px-2.5 py-1.5 text-xs font-semibold text-white transition"
                    >
                      <Copy className="w-3 h-3" />
                      {referralCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-2">
                    Your code: <span className="text-zinc-400 font-mono">{referral.code}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm px-4 py-2 rounded-lg shadow-xl">
          {toast}
        </div>
      )}

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 mb-5">
        <div className="font-medium text-zinc-100 mb-3">Assets ({job.assets?.length ?? 0})</div>
        {(!job.assets || job.assets.length === 0) ? (
          <div className="text-sm text-zinc-500">No assets attached.</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {job.assets.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-zinc-300">
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{a.kind}</span>
                <span className="truncate">{a.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {job.transcript?.text && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <div className="font-medium text-zinc-100 mb-2">Transcript</div>
          <div className="text-sm text-zinc-400 whitespace-pre-wrap max-h-64 overflow-auto">
            {job.transcript.text}
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}
