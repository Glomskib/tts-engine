'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Film, Send, Download, Clock, AlertTriangle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { JobFeedback, JobStatus } from '@/lib/marketplace/types';
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from '@/lib/marketplace/types';

function slaBadge(dueAt: string | null): { text: string; color: string } | null {
  if (!dueAt) return null;
  const diff = new Date(dueAt).getTime() - Date.now();
  const hours = Math.abs(Math.round(diff / 3_600_000));
  if (diff > 0) return { text: `Due in ${hours}h`, color: hours < 6 ? 'text-amber-400' : 'text-zinc-400' };
  return { text: `Overdue by ${hours}h`, color: 'text-red-400' };
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function VaJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState('');
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [error, setError] = useState('');

  const fetchJob = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/jobs/${id}`);
      const data = await res.json();
      setJob(data.job || null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  async function handleAction(action: string, extra?: Record<string, string>) {
    setActing(true);
    setError('');
    try {
      const body: Record<string, string> = { action, ...extra };
      const res = await fetch(`/api/marketplace/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Action failed. The job may have been claimed by another editor.');
      }
      await fetchJob();
    } finally {
      setActing(false);
    }
  }

  async function handleSendFeedback() {
    if (!message.trim()) return;
    setActing(true);
    try {
      await fetch(`/api/marketplace/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_feedback', message }),
      });
      setMessage('');
      await fetchJob();
    } finally {
      setActing(false);
    }
  }

  async function handleSubmit() {
    if (!deliverableUrl.trim()) return;
    if (!isValidUrl(deliverableUrl)) {
      setUrlError('Please enter a valid HTTPS link');
      return;
    }
    setUrlError('');
    await handleAction('submit', { deliverable_url: deliverableUrl });
    setDeliverableUrl('');
  }

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading...</div>;
  if (!job) return <div className="text-red-400 text-sm py-12 text-center">Job not found</div>;

  const canClaim = job.job_status === 'queued';
  const canStart = job.job_status === 'claimed';
  const canSubmit = job.job_status === 'in_progress' || job.job_status === 'changes_requested';
  const isChangesRequested = job.job_status === 'changes_requested';
  const rawAssets = (job.assets || []).filter((a: any) => a.asset_type === 'raw_folder' || a.asset_type === 'raw_video');
  const refAssets = (job.assets || []).filter((a: any) => a.asset_type === 'reference');
  const sla = slaBadge(job.due_at);

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => router.push('/va/jobs')} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Job Board
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{job.script?.title || 'Untitled'}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${JOB_STATUS_COLORS[job.job_status as JobStatus]}`}>
              {JOB_STATUS_LABELS[job.job_status as JobStatus]}
            </span>
            <span className="text-xs text-zinc-500 font-mono">{job.client_code}</span>
            {sla && (
              <span className={`flex items-center gap-1 text-xs ${sla.color}`}>
                {sla.text.startsWith('Overdue') ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {sla.text}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canClaim && <Button size="sm" onClick={() => handleAction('claim')} loading={acting}>Claim Job</Button>}
          {canStart && <Button size="sm" onClick={() => handleAction('start')} loading={acting}>Start Editing</Button>}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-sm text-red-300">{error}</div>}

      {isChangesRequested && (
        <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-800/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium text-yellow-300">Changes Requested</span>
          </div>
          <p className="text-sm text-yellow-200/80">
            The client has requested revisions. Review the feedback below, make the changes, then submit a new deliverable link.
          </p>
        </div>
      )}

      <div className="grid gap-6">
        {/* Script */}
        <Card>
          <CardHeader><CardTitle>Script</CardTitle></CardHeader>
          <CardContent>
            {job.script?.script_text ? (
              <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-mono leading-relaxed bg-zinc-800/50 rounded-lg p-4">
                {job.script.script_text.split('\n').map((line: string, i: number) => (
                  <div key={i}><span className="text-zinc-600 select-none mr-4">{String(i + 1).padStart(3)}</span>{line}</div>
                ))}
              </pre>
            ) : <p className="text-zinc-500 text-sm italic">No script text</p>}
          </CardContent>
        </Card>

        {job.script?.keep_verbatim && (
          <Card>
            <CardHeader><CardTitle>Keep Verbatim</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-amber-300 bg-amber-900/20 rounded-lg p-3">{job.script.keep_verbatim}</p></CardContent>
          </Card>
        )}

        {job.script?.notes && (
          <Card>
            <CardHeader><CardTitle>Editor Notes</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-zinc-300">{job.script.notes}</p></CardContent>
          </Card>
        )}

        {job.script?.broll_suggestions && (
          <Card>
            <CardHeader><CardTitle>B-roll Suggestions</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-zinc-300 whitespace-pre-wrap">{job.script.broll_suggestions}</p></CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Raw Footage</CardTitle></CardHeader>
          <CardContent>
            {rawAssets.length > 0 ? (
              <ul className="space-y-2">
                {rawAssets.map((a: any) => (
                  <li key={a.id} className="flex items-center gap-3 text-sm">
                    <Film className="w-4 h-4 text-zinc-500" />
                    <span className="text-zinc-400">{a.label || a.asset_type}</span>
                    {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 flex items-center gap-1">Open <ExternalLink className="w-3 h-3" /></a>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-zinc-500 text-sm">No raw footage provided</p>}
          </CardContent>
        </Card>

        {refAssets.length > 0 && (
          <Card>
            <CardHeader><CardTitle>References</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {refAssets.map((a: any) => (
                  <li key={a.id} className="flex items-center gap-3 text-sm">
                    <span className="text-zinc-400">{a.label || 'Reference'}</span>
                    {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 flex items-center gap-1">Open <ExternalLink className="w-3 h-3" /></a>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {(job.broll_links?.length > 0) && (
          <Card>
            <CardHeader><CardTitle>Suggested B-roll Pack</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {job.broll_links.map((bl: any, i: number) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <Film className="w-4 h-4 text-purple-400" />
                    <span className="text-zinc-400">{bl.notes || bl.recommended_for || 'B-roll clip'}</span>
                    <span className="text-xs text-zinc-600">{bl.asset?.source_type}</span>
                    {bl.recommended_for && <span className="text-xs bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded">{bl.recommended_for}</span>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {canSubmit && (
          <Card>
            <CardHeader><CardTitle>{isChangesRequested ? 'Submit Revised Deliverable' : 'Submit Deliverable'}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-zinc-500 mb-2">Paste the Google Drive link to your finished edit. Each submission creates a new deliverable record.</p>
              <div className="flex items-center gap-2">
                <input type="url" placeholder="Paste HTTPS Drive link to final edit..." value={deliverableUrl}
                  onChange={e => { setDeliverableUrl(e.target.value); setUrlError(''); }}
                  className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                <Button size="sm" onClick={handleSubmit} loading={acting} disabled={!deliverableUrl.trim()}>Submit Edit</Button>
              </div>
              {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
            </CardContent>
          </Card>
        )}

        {(job.deliverables?.length > 0) && (
          <Card>
            <CardHeader><CardTitle>Submitted Deliverables</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {job.deliverables.map((d: any) => (
                  <li key={d.id} className="flex items-center gap-3 text-sm">
                    <Download className="w-4 h-4 text-green-400" />
                    <span className="text-zinc-300">{d.label || d.deliverable_type}</span>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 flex items-center gap-1">Open <ExternalLink className="w-3 h-3" /></a>
                    <span className="text-xs text-zinc-600">{new Date(d.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Feedback</CardTitle></CardHeader>
          <CardContent>
            {job.feedback?.length > 0 && (
              <div className="space-y-3 mb-4">
                {job.feedback.map((f: JobFeedback) => (
                  <div key={f.id} className={`rounded-lg p-3 text-sm ${
                    f.author_role === 'client' ? 'bg-blue-900/20 border border-blue-800/30' :
                    f.author_role === 'va' ? 'bg-purple-900/20 border border-purple-800/30' :
                    'bg-zinc-800/50 border border-white/5'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-zinc-400 uppercase">{f.author_role}</span>
                      <span className="text-xs text-zinc-600">{new Date(f.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-zinc-300">{f.message}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input type="text" placeholder="Send a message..." value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendFeedback()}
                className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <Button size="sm" variant="secondary" onClick={handleSendFeedback} loading={acting}><Send className="w-4 h-4" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
