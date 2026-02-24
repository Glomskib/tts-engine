'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Send, Clock, AlertTriangle } from 'lucide-react';
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

export default function JobReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  const fetchJob = useCallback(async () => {
    setLoading(true);
    try {
      // Try fetching as job ID first
      let res = await fetch(`/api/marketplace/jobs/${jobId}`);
      let data = await res.json();
      if (data.job) {
        setJob(data.job);
        return;
      }
      // Fallback: might be a script ID — find job via scripts endpoint
      res = await fetch(`/api/marketplace/scripts/${jobId}`);
      data = await res.json();
      if (data.job_id) {
        res = await fetch(`/api/marketplace/jobs/${data.job_id}`);
        data = await res.json();
        if (data.job) setJob(data.job);
      }
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  async function handleAction(action: string) {
    if (!job) return;
    setActing(true);
    setError('');
    try {
      const body: Record<string, string> = { action };
      if (action === 'request_changes') {
        if (!message.trim()) { setError('Please enter feedback before requesting changes.'); setActing(false); return; }
        body.message = message;
      }
      const res = await fetch(`/api/marketplace/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Action failed');
      }
      setMessage('');
      await fetchJob();
    } finally {
      setActing(false);
    }
  }

  async function handleSendFeedback() {
    if (!job || !message.trim()) return;
    setActing(true);
    try {
      await fetch(`/api/marketplace/jobs/${job.id}`, {
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

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading...</div>;
  if (!job) return <div className="text-zinc-500 text-sm py-12 text-center">No job found</div>;

  const canApprove = job.job_status === 'submitted';
  const canRequestChanges = job.job_status === 'submitted';
  const sla = slaBadge(job.due_at);

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => router.push('/app/pipeline')} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Pipeline
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{job.script?.title || 'Job'}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${JOB_STATUS_COLORS[job.job_status as JobStatus]}`}>
              {JOB_STATUS_LABELS[job.job_status as JobStatus]}
            </span>
            {sla && (
              <span className={`flex items-center gap-1 text-xs ${sla.color}`}>
                {sla.text.startsWith('Overdue') ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {sla.text}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canApprove && <Button size="sm" onClick={() => handleAction('approve')} loading={acting}>Approve</Button>}
          {canRequestChanges && (
            <Button size="sm" variant="danger" onClick={() => handleAction('request_changes')} loading={acting} disabled={!message.trim()}>
              Request Changes
            </Button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-sm text-red-300">{error}</div>}

      <div className="grid gap-6">
        <Card>
          <CardHeader><CardTitle>Deliverables</CardTitle></CardHeader>
          <CardContent>
            {job.deliverables?.length > 0 ? (
              <ul className="space-y-2">
                {job.deliverables.map((d: any) => (
                  <li key={d.id} className="flex items-center gap-3 text-sm">
                    <span className="text-zinc-300">{d.label || d.deliverable_type}</span>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 flex items-center gap-1">
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-xs text-zinc-600">{new Date(d.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-zinc-500 text-sm">No deliverables yet</p>}
          </CardContent>
        </Card>

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
              <input type="text" placeholder={canRequestChanges ? 'Enter feedback for changes...' : 'Add feedback...'} value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (canRequestChanges ? undefined : handleSendFeedback())}
                className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <Button size="sm" variant="secondary" onClick={handleSendFeedback} loading={acting}><Send className="w-4 h-4" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
