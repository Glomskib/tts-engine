'use client';

import type { RunStatus } from '@/lib/video-engine/types';

const COLORS: Record<RunStatus, { bg: string; text: string; label: string }> = {
  created:      { bg: 'bg-zinc-800',  text: 'text-zinc-200', label: 'Queued' },
  transcribing: { bg: 'bg-amber-900/60', text: 'text-amber-200', label: 'Transcribing' },
  analyzing:    { bg: 'bg-amber-900/60', text: 'text-amber-200', label: 'Analyzing' },
  assembling:   { bg: 'bg-amber-900/60', text: 'text-amber-200', label: 'Assembling' },
  rendering:    { bg: 'bg-blue-900/60',  text: 'text-blue-200',  label: 'Rendering' },
  complete:     { bg: 'bg-emerald-900/60', text: 'text-emerald-200', label: 'Complete' },
  failed:       { bg: 'bg-red-900/60',  text: 'text-red-200',   label: 'Failed' },
};

export default function StatusPill({ status }: { status: RunStatus }) {
  const c = COLORS[status] ?? COLORS.created;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {c.label}
    </span>
  );
}
