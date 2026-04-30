'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Clock, Bot, Loader2 } from 'lucide-react';
import type { ApprovalItem, ApprovalKind } from '@/lib/command-center/mmm/approvals';
import { Card, StatusPill } from './Section';

const KIND_LABEL: Record<ApprovalKind, string> = {
  social_post: 'Social post',
  weekly_digest: 'Weekly digest',
  task: 'Task',
  research: 'Research note',
  meeting_summary: 'Meeting summary',
};

const KIND_TONE: Record<ApprovalKind, 'violet' | 'blue' | 'amber' | 'emerald' | 'rose'> = {
  social_post: 'violet',
  weekly_digest: 'blue',
  task: 'amber',
  research: 'emerald',
  meeting_summary: 'rose',
};

function timeAgo(ts: string): string {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ApprovalQueue({ items }: { items: ApprovalItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          Nothing pending. When Bolt/Miles drafts a social post, task, research note, weekly
          digest, or meeting summary, it&apos;ll land here for one-click approval.
        </div>
      </Card>
    );
  }

  const grouped = new Map<ApprovalKind, ApprovalItem[]>();
  for (const it of items) {
    if (!grouped.has(it.kind)) grouped.set(it.kind, []);
    grouped.get(it.kind)!.push(it);
  }

  return (
    <div className="space-y-3">
      {[...grouped.entries()].map(([kind, list]) => (
        <Card key={kind}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-zinc-100">
              {KIND_LABEL[kind]}{' '}
              <span className="text-zinc-500 text-xs">({list.length})</span>
            </span>
            <StatusPill label="needs approval" tone={KIND_TONE[kind]} />
          </div>
          <div className="space-y-2">
            {list.map((item) => (
              <ApprovalRow key={`${item.source_table}:${item.id}`} item={item} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ApprovalRow({ item }: { item: ApprovalItem }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null);
  const router = useRouter();

  async function decide(decision: 'approve' | 'reject', payload: Record<string, unknown>) {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(`/api/admin/mmm/approvals/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.kind, id: item.id, ...payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.message || `${decision} failed (${res.status})`);
        return;
      }
      setDone(decision === 'approve' ? 'approved' : 'rejected');
      // refresh server data so the row drops off the next render
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div
        className={`border rounded-lg p-3 text-xs ${
          done === 'approved'
            ? 'border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-300'
            : 'border-rose-500/30 bg-rose-500/[0.05] text-rose-300'
        }`}
      >
        {done === 'approved' ? '✓ Approved' : '✗ Rejected'} — {item.title}
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-4 h-4 text-violet-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-zinc-100 truncate">{item.title}</span>
        </div>
        <span className="flex items-center gap-1 text-[10px] text-zinc-500">
          <Clock className="w-3 h-3" />
          {timeAgo(item.created_at)}
        </span>
      </div>

      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3 whitespace-pre-line">
        {item.preview || <em className="text-zinc-600">no preview</em>}
      </p>

      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span>by {item.agent_id}</span>
        {item.related_event_slug ? <span>· {item.related_event_slug}</span> : null}
        <span>· {item.source_table}</span>
      </div>

      {showReject ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why reject? (required)"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
          />
          <button
            type="button"
            onClick={() => decide('reject', { reason: reason.trim() || 'No reason provided' })}
            disabled={busy === 'reject' || pending || !reason.trim()}
            className="px-2 py-1 rounded bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 hover:bg-rose-500/25 disabled:opacity-40"
          >
            {busy === 'reject' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowReject(false);
              setReason('');
            }}
            className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => decide('approve', {})}
            disabled={!!busy || pending}
            className="flex-1 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 inline-flex items-center justify-center gap-1"
          >
            {busy === 'approve' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3" /> Approve
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowReject(true)}
            disabled={!!busy || pending}
            className="flex-1 px-2 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 inline-flex items-center justify-center gap-1"
          >
            <XCircle className="w-3 h-3" /> Reject
          </button>
        </div>
      )}

      {error ? <div className="text-[11px] text-rose-400">{error}</div> : null}
    </div>
  );
}
