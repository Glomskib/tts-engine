'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, ExternalLink, Film, Send, Download, Clock,
  AlertTriangle, MessageSquare, Copy, Check, FolderOpen, Video,
  ChevronDown, ChevronUp, Link2, Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { JobFeedback, JobEvent, JobStatus, DeliverableType } from '@/lib/marketplace/types';
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from '@/lib/marketplace/types';

const ACTIONABLE_STATUSES: JobStatus[] = ['claimed', 'in_progress', 'changes_requested'];

function slaBadge(dueAt: string | null): { text: string; color: string } | null {
  if (!dueAt) return null;
  const diff = new Date(dueAt).getTime() - Date.now();
  const hours = Math.abs(Math.round(diff / 3_600_000));
  if (diff > 0) return { text: `Due in ${hours}h`, color: hours < 6 ? 'text-amber-400' : 'text-zinc-400' };
  return { text: `Overdue by ${hours}h`, color: 'text-red-400' };
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function elapsedColor(minutes: number): string {
  if (minutes > 40) return 'text-red-400';
  if (minutes >= 20) return 'text-amber-400';
  return 'text-zinc-400';
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={handleCopy} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors">
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {label || (copied ? 'Copied' : 'Copy')}
    </button>
  );
}

export default function VaJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState('');
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableLabel, setDeliverableLabel] = useState('');
  const [deliverableType, setDeliverableType] = useState<DeliverableType>('main');
  const [urlError, setUrlError] = useState('');
  const [error, setError] = useState('');
  const [eventsOpen, setEventsOpen] = useState(false);
  const [elapsedMinutes, setElapsedMinutes] = useState<number | null>(null);
  const [idleDialogOpen, setIdleDialogOpen] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const submitSectionRef = useRef<HTMLDivElement>(null);

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

  // Step 2: Time-in-Job timer
  useEffect(() => {
    if (!job) return;
    const anchor = job.started_at || job.claimed_at;
    if (!anchor || !ACTIONABLE_STATUSES.includes(job.job_status)) {
      setElapsedMinutes(null);
      return;
    }
    const calcElapsed = () => Math.max(0, Math.floor((Date.now() - new Date(anchor).getTime()) / 60_000));
    setElapsedMinutes(calcElapsed());
    const interval = setInterval(() => setElapsedMinutes(calcElapsed()), 60_000);
    return () => clearInterval(interval);
  }, [job]);

  // Step 3: Idle protection
  useEffect(() => {
    if (!job || !ACTIONABLE_STATUSES.includes(job.job_status)) return;

    const resetActivity = () => { lastActivityRef.current = Date.now(); };
    const events = ['mousemove', 'keydown', 'click', 'scroll'] as const;
    events.forEach(evt => window.addEventListener(evt, resetActivity));

    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 15 * 60_000) {
        setIdleDialogOpen(true);
      }
    }, 30_000);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, resetActivity));
      clearInterval(interval);
    };
  }, [job]);

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
    await handleAction('submit', {
      deliverable_url: deliverableUrl,
      ...(deliverableLabel && { label: deliverableLabel }),
      deliverable_type: deliverableType,
    });
    setDeliverableUrl('');
    setDeliverableLabel('');
    setDeliverableType('main');
  }

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading...</div>;
  if (!job) return <div className="text-red-400 text-sm py-12 text-center">Job not found</div>;

  const canClaim = job.job_status === 'queued';
  const canStart = job.job_status === 'claimed' || job.job_status === 'changes_requested';
  const canSubmit = job.job_status === 'in_progress' || job.job_status === 'changes_requested';
  const isChangesRequested = job.job_status === 'changes_requested';
  const isActionable = ACTIONABLE_STATUSES.includes(job.job_status);
  const rawAssets = (job.assets || []).filter((a: any) => a.asset_type === 'raw_folder' || a.asset_type === 'raw_video');
  const refAssets = (job.assets || []).filter((a: any) => a.asset_type === 'reference');
  const sla = slaBadge(job.due_at);
  const events: JobEvent[] = (job.events || []).slice(-10).reverse();

  // Step 4: Sort deliverables by version descending
  const sortedDeliverables = [...(job.deliverables || [])].sort(
    (a: any, b: any) => (b.version ?? 0) - (a.version ?? 0)
  );
  const latestVersion = sortedDeliverables.length > 0 ? sortedDeliverables[0].version : null;

  return (
    <div className={`max-w-4xl mx-auto ${isActionable ? 'pb-20' : ''}`}>
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
            {elapsedMinutes !== null && (
              <span className={`flex items-center gap-1 text-xs ${elapsedColor(elapsedMinutes)}`}>
                <Timer className="w-3 h-3" />
                {formatElapsed(elapsedMinutes)}
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
        {/* Script with Copy button */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Script</CardTitle>
              {job.script?.script_text && (
                <CopyButton text={job.script.script_text} label="Copy Script" />
              )}
            </div>
          </CardHeader>
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

        {/* Raw Footage — larger buttons */}
        <Card>
          <CardHeader><CardTitle>Raw Footage</CardTitle></CardHeader>
          <CardContent>
            {rawAssets.length > 0 ? (
              <div className="space-y-2">
                {rawAssets.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3">
                    {a.asset_type === 'raw_folder' ? (
                      <FolderOpen className="w-5 h-5 text-blue-400 shrink-0" />
                    ) : (
                      <Video className="w-5 h-5 text-blue-400 shrink-0" />
                    )}
                    <span className="text-sm text-zinc-300">{a.label || (a.asset_type === 'raw_folder' ? 'Raw Folder' : 'Raw Video')}</span>
                    {a.url && (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-blue-900/30 text-blue-300 hover:bg-blue-900/50 transition-colors"
                      >
                        {a.asset_type === 'raw_folder' ? 'Open Folder' : 'Open Video'}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
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

        {/* B-roll Pack with signed URLs */}
        {(job.broll_links?.length > 0) && (
          <Card>
            <CardHeader><CardTitle>B-roll Pack</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {job.broll_links.map((bl: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/30">
                    <Film className="w-4 h-4 text-purple-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-zinc-300">{bl.notes || bl.recommended_for || 'B-roll clip'}</span>
                      {bl.asset?.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {bl.asset.tags.map((tag: string, ti: number) => (
                            <span key={ti} className="text-[10px] bg-purple-900/30 text-purple-300 px-1.5 py-0.5 rounded">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {bl.recommended_for && (
                      <span className="text-xs bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded shrink-0">{bl.recommended_for}</span>
                    )}
                    {bl.signed_url && (
                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={bl.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-purple-900/30 text-purple-300 hover:bg-purple-900/50 transition-colors"
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                        <CopyButton text={bl.signed_url} label="" />
                      </div>
                    )}
                    {!bl.signed_url && bl.asset?.source_type && (
                      <span className="text-xs text-zinc-600">{bl.asset.source_type}</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Deliverable */}
        {canSubmit && (
          <Card ref={submitSectionRef}>
            <CardHeader><CardTitle>{isChangesRequested ? 'Submit Revised Deliverable' : 'Submit Deliverable'}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-zinc-500 mb-3">Paste the Google Drive link to your finished edit. Each submission creates a new deliverable record.</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    placeholder="Paste HTTPS Drive link to final edit..."
                    value={deliverableUrl}
                    onChange={e => { setDeliverableUrl(e.target.value); setUrlError(''); }}
                    className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Label (optional, e.g. 'V2 with music')"
                    value={deliverableLabel}
                    onChange={e => setDeliverableLabel(e.target.value)}
                    className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <select
                    value={deliverableType}
                    onChange={e => setDeliverableType(e.target.value as DeliverableType)}
                    className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="main">Main</option>
                    <option value="variant">Variant</option>
                  </select>
                  <Button size="sm" onClick={handleSubmit} loading={acting} disabled={!deliverableUrl.trim()}>Submit Edit</Button>
                </div>
                {urlError && <p className="text-xs text-red-400">{urlError}</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submitted Deliverables — version-aware */}
        {sortedDeliverables.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Submitted Deliverables</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {sortedDeliverables.map((d: any) => {
                  const isLatest = d.version === latestVersion;
                  return (
                    <li
                      key={d.id}
                      className={`flex items-center gap-3 text-sm rounded-lg p-2 ${
                        isLatest
                          ? 'border border-green-800/40 bg-green-900/10'
                          : 'opacity-60'
                      }`}
                    >
                      <Download className={`w-4 h-4 ${isLatest ? 'text-green-400' : 'text-zinc-500'}`} />
                      <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                        v{d.version ?? '?'}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${d.deliverable_type === 'variant' ? 'bg-indigo-900/30 text-indigo-300' : 'bg-green-900/30 text-green-300'}`}>
                        {d.deliverable_type}
                      </span>
                      <span className="text-zinc-300">{d.label || d.deliverable_type}</span>
                      {isLatest && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-green-900/40 text-green-300">
                          Latest
                        </span>
                      )}
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 flex items-center gap-1 ml-auto">
                        Open <ExternalLink className="w-3 h-3" />
                      </a>
                      <span className="text-xs text-zinc-600">{new Date(d.created_at).toLocaleDateString()}</span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Feedback */}
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

        {/* Events Audit (collapsed) */}
        {events.length > 0 && (
          <Card>
            <CardHeader>
              <button
                onClick={() => setEventsOpen(v => !v)}
                className="flex items-center justify-between w-full text-left"
              >
                <CardTitle>Activity Log ({events.length})</CardTitle>
                {eventsOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
              </button>
            </CardHeader>
            {eventsOpen && (
              <CardContent>
                <div className="space-y-2">
                  {events.map((evt) => (
                    <div key={evt.id} className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-600 w-32 shrink-0">
                        {new Date(evt.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-medium">
                        {evt.event_type}
                      </span>
                      {evt.payload && Object.keys(evt.payload).length > 0 && (
                        <span className="text-zinc-500 truncate max-w-xs">{JSON.stringify(evt.payload)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}
      </div>

      {/* Fast Actions Bar */}
      {isActionable && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-900/95 border-t border-white/10 backdrop-blur">
          <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2">
              {job.job_status === 'claimed' && (
                <>
                  <Button size="sm" onClick={() => handleAction('start')} loading={acting}>Start Editing</Button>
                  {job.script?.script_text && (
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(job.script.script_text)}>
                      <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Script
                    </Button>
                  )}
                </>
              )}
              {job.job_status === 'in_progress' && (
                <>
                  <Button size="sm" onClick={() => submitSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}>Submit</Button>
                  {job.script?.script_text && (
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(job.script.script_text)}>
                      <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Script
                    </Button>
                  )}
                </>
              )}
              {job.job_status === 'changes_requested' && (
                <>
                  <Button size="sm" onClick={() => handleAction('start')} loading={acting}>Start Editing</Button>
                  {job.script?.script_text && (
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(job.script.script_text)}>
                      <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Script
                    </Button>
                  )}
                </>
              )}
            </div>
            {elapsedMinutes !== null && (
              <span className={`flex items-center gap-1 text-xs ${elapsedColor(elapsedMinutes)}`}>
                <Timer className="w-3 h-3" />
                {formatElapsed(elapsedMinutes)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Idle Protection Dialog */}
      <ConfirmDialog
        isOpen={idleDialogOpen}
        onClose={() => router.push('/va/jobs')}
        onConfirm={() => {
          setIdleDialogOpen(false);
          lastActivityRef.current = Date.now();
          fetchJob();
        }}
        title="Still working?"
        message="You've been idle for 15 minutes. Click below to stay on this job."
        confirmText="Keep Working"
        cancelText="Back to Board"
        variant="warning"
      />
    </div>
  );
}
