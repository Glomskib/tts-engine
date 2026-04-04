'use client';

import { useCallback, useMemo } from 'react';
import { FileText, Mic, Scissors, Send } from 'lucide-react';

export type WorkMode = 'all' | 'scripts' | 'record' | 'edit' | 'publish';

/** Maps each work mode to the recording statuses it covers */
export const WORK_MODE_STATUSES: Record<Exclude<WorkMode, 'all'>, string[]> = {
  scripts: ['NEEDS_SCRIPT', 'GENERATING_SCRIPT'],
  record:  ['NOT_RECORDED', 'AI_RENDERING'],
  edit:    ['RECORDED', 'READY_FOR_REVIEW', 'EDITED', 'APPROVED_NEEDS_EDITS'],
  publish: ['READY_TO_POST', 'POSTED'],
};

const MODE_CONFIG: { value: WorkMode; label: string; shortLabel: string; icon: typeof FileText; color: string; activeClass: string }[] = [
  { value: 'all',     label: 'All',      shortLabel: 'All',     icon: FileText,  color: 'text-zinc-400',    activeClass: 'bg-zinc-700/50 text-white ring-1 ring-zinc-600' },
  { value: 'scripts', label: 'Scripts',   shortLabel: 'Scripts', icon: FileText,  color: 'text-red-400',     activeClass: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/40' },
  { value: 'record',  label: 'Record',    shortLabel: 'Record',  icon: Mic,       color: 'text-blue-400',    activeClass: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/40' },
  { value: 'edit',    label: 'Edit',      shortLabel: 'Edit',    icon: Scissors,  color: 'text-amber-400',   activeClass: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/40' },
  { value: 'publish', label: 'Publish',   shortLabel: 'Publish', icon: Send,      color: 'text-teal-400',    activeClass: 'bg-teal-500/15 text-teal-400 ring-1 ring-teal-500/40' },
];

interface ModeCounts {
  scripts: number;
  record: number;
  edit: number;
  publish: number;
}

interface PipelineWorkModeSwitcherProps {
  value: WorkMode;
  onChange: (mode: WorkMode) => void;
  counts: ModeCounts;
}

export function getWorkModeForStatus(status: string | null | undefined): Exclude<WorkMode, 'all'> {
  if (!status) return 'scripts';
  for (const [mode, statuses] of Object.entries(WORK_MODE_STATUSES)) {
    if (statuses.includes(status)) return mode as Exclude<WorkMode, 'all'>;
  }
  return 'scripts';
}

export function filterVideosByWorkMode<T extends { recording_status: string | null }>(
  videos: T[],
  mode: WorkMode,
): T[] {
  if (mode === 'all') return videos;
  const statuses = WORK_MODE_STATUSES[mode];
  return videos.filter(v => statuses.includes(v.recording_status || ''));
}

export function computeModeCounts<T extends { recording_status: string | null }>(
  videos: T[],
): ModeCounts {
  const counts: ModeCounts = { scripts: 0, record: 0, edit: 0, publish: 0 };
  for (const v of videos) {
    const mode = getWorkModeForStatus(v.recording_status);
    counts[mode]++;
  }
  return counts;
}

export function PipelineWorkModeSwitcher({ value, onChange, counts }: PipelineWorkModeSwitcherProps) {
  return (
    <div className="flex items-center bg-zinc-800/80 rounded-xl border border-zinc-700/60 p-1 gap-0.5">
      {MODE_CONFIG.map(({ value: mode, label, icon: Icon, activeClass }) => {
        const active = mode === value;
        const count = mode === 'all'
          ? counts.scripts + counts.record + counts.edit + counts.publish
          : counts[mode as keyof ModeCounts];

        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all min-h-[36px] ${
              active ? activeClass : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
            <span className={`text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 ${
              active ? 'bg-white/10' : 'bg-zinc-700/60 text-zinc-500'
            }`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Summary text for the active work mode */
export function getWorkModeSummary(mode: WorkMode, counts: ModeCounts): string {
  switch (mode) {
    case 'scripts': return `${counts.scripts} video${counts.scripts !== 1 ? 's' : ''} need scripts`;
    case 'record':  return `${counts.record} video${counts.record !== 1 ? 's' : ''} ready to record`;
    case 'edit':    return `${counts.edit} video${counts.edit !== 1 ? 's' : ''} in editing`;
    case 'publish': return `${counts.publish} video${counts.publish !== 1 ? 's' : ''} to publish`;
    default:        return '';
  }
}
