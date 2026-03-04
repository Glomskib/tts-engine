'use client';

import { Shield, AlertTriangle, XCircle, Send, BarChart3 } from 'lucide-react';
import Link from 'next/link';

interface PipelineData {
  statusCounts: Record<string, number> | null;
  stuckVideos: { items: { id: string; video_code: string; recording_status: string; last_status_changed_at: string }[]; total: number } | null;
  failures: { items: { id: string; video_id: string; event_type: string; details: Record<string, unknown>; created_at: string }[]; total: number } | null;
}

const STAGE_ORDER = [
  'NEEDS_SCRIPT', 'GENERATING_SCRIPT', 'NOT_RECORDED', 'RECORDED',
  'AI_RENDERING', 'EDITING', 'READY_FOR_REVIEW', 'APPROVED_NEEDS_EDITS',
  'EDITED', 'READY_TO_POST', 'POSTED',
];

const STAGE_COLORS: Record<string, string> = {
  NEEDS_SCRIPT: 'bg-zinc-500',
  GENERATING_SCRIPT: 'bg-yellow-500',
  NOT_RECORDED: 'bg-orange-500',
  RECORDED: 'bg-blue-500',
  AI_RENDERING: 'bg-purple-500',
  EDITING: 'bg-indigo-500',
  READY_FOR_REVIEW: 'bg-cyan-500',
  APPROVED_NEEDS_EDITS: 'bg-amber-500',
  EDITED: 'bg-teal-500',
  READY_TO_POST: 'bg-emerald-500',
  POSTED: 'bg-green-500',
};

function formatStageName(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(timestamp: string): string {
  const hours = Math.floor((Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function AdminPanel({ pipeline }: { pipeline: PipelineData | null }) {
  if (!pipeline) return null;

  const { statusCounts, stuckVideos, failures } = pipeline;
  const totalVideos = statusCounts ? Object.values(statusCounts).reduce((a, b) => a + b, 0) : 0;
  const readyToPublish = statusCounts?.READY_TO_POST || 0;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--text)] flex items-center gap-2">
        <Shield className="w-5 h-5 text-teal-400" />
        Pipeline Overview
      </h2>

      {/* Pipeline stage chart */}
      {statusCounts && totalVideos > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-sm font-medium text-[var(--text)]">Pipeline Stages</span>
            </div>
            <span className="text-xs text-[var(--text-muted)]">{totalVideos} total</span>
          </div>
          {/* Horizontal stacked bar */}
          <div className="h-4 rounded-full overflow-hidden flex mb-3">
            {STAGE_ORDER.filter(s => statusCounts[s]).map((stage) => (
              <div
                key={stage}
                className={`${STAGE_COLORS[stage] || 'bg-zinc-500'} transition-all`}
                style={{ width: `${(statusCounts[stage] / totalVideos) * 100}%` }}
                title={`${formatStageName(stage)}: ${statusCounts[stage]}`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {STAGE_ORDER.filter(s => statusCounts[s]).map((stage) => (
              <div key={stage} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${STAGE_COLORS[stage] || 'bg-zinc-500'}`} />
                <span className="text-xs text-[var(--text-muted)]">
                  {formatStageName(stage)} ({statusCounts[stage]})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {/* Stuck videos */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-[var(--text)]">Stuck &gt;24h</span>
            {(stuckVideos?.total || 0) > 0 && (
              <span className="text-xs px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded-full">
                {stuckVideos!.total}
              </span>
            )}
          </div>
          {!stuckVideos?.items.length ? (
            <p className="text-xs text-[var(--text-muted)]">None stuck</p>
          ) : (
            <div className="space-y-1.5">
              {stuckVideos.items.slice(0, 5).map((v) => (
                <Link key={v.id} href={`/admin/pipeline?video=${v.id}`} className="block text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                  <span className="font-mono text-xs">{v.video_code || v.id.slice(0, 8)}</span>
                  <span className="text-xs text-amber-400 ml-2">{timeAgo(v.last_status_changed_at)} in {formatStageName(v.recording_status)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Failures */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-[var(--text)]">Failures (7d)</span>
            {(failures?.total || 0) > 0 && (
              <span className="text-xs px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded-full">
                {failures!.total}
              </span>
            )}
          </div>
          {!failures?.items.length ? (
            <p className="text-xs text-[var(--text-muted)]">No failures</p>
          ) : (
            <div className="space-y-1.5">
              {failures.items.slice(0, 5).map((f) => (
                <div key={f.id} className="text-sm text-[var(--text-muted)]">
                  <span className="text-xs text-red-400">
                    {(f.details as Record<string, string>)?.message || 'Error'}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] ml-2">{timeAgo(f.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ready to publish */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Send className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-[var(--text)]">Ready to Publish</span>
          </div>
          <div className="text-3xl font-bold text-[var(--text)] tabular-nums">{readyToPublish}</div>
          {readyToPublish > 0 && (
            <Link href="/admin/posting-queue" className="text-xs text-teal-400 hover:text-teal-300 mt-1 inline-block">
              Go to posting queue &rarr;
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
