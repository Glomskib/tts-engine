'use client';

import { Users, FileText, Video, CheckCircle } from 'lucide-react';
import Link from 'next/link';

interface TeamPanelProps {
  scriptsCount: number;
  personalQueue: {
    needsApproval: { id: string; video_code: string }[];
    needsEdits: { id: string; video_code: string }[];
    overdue: { id: string; video_code: string }[];
  } | null;
}

export function TeamPanel({ scriptsCount, personalQueue }: TeamPanelProps) {
  const assignedCount = personalQueue
    ? personalQueue.needsApproval.length + personalQueue.needsEdits.length
    : 0;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--text)] flex items-center gap-2">
        <Users className="w-5 h-5 text-teal-400" />
        My Work
      </h2>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-[var(--text)]">My Scripts</span>
          </div>
          <div className="text-3xl font-bold text-[var(--text)] tabular-nums">{scriptsCount}</div>
          <Link href="/admin/script-library" className="text-xs text-teal-400 hover:text-teal-300 mt-1 inline-block">
            View library &rarr;
          </Link>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Video className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-[var(--text)]">Assigned to Me</span>
          </div>
          <div className="text-3xl font-bold text-[var(--text)] tabular-nums">{assignedCount}</div>
          <Link href="/admin/pipeline" className="text-xs text-teal-400 hover:text-teal-300 mt-1 inline-block">
            View pipeline &rarr;
          </Link>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-[var(--text)]">My Approvals</span>
          </div>
          <div className="text-3xl font-bold text-[var(--text)] tabular-nums">
            {personalQueue?.needsApproval.length || 0}
          </div>
        </div>
      </div>
    </div>
  );
}
