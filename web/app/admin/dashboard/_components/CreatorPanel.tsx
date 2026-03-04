'use client';

import { Sparkles, FileText, Upload, Eye } from 'lucide-react';
import Link from 'next/link';

interface CreatorPanelProps {
  scriptsCount: number;
  viewsThisWeek: number;
  postsThisWeek: number;
}

export function CreatorPanel({ scriptsCount, viewsThisWeek, postsThisWeek }: CreatorPanelProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--text)] flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-teal-400" />
        Creator Hub
      </h2>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-[var(--text)]">My Scripts</span>
          </div>
          <div className="text-3xl font-bold text-[var(--text)] tabular-nums">{scriptsCount}</div>
          <Link href="/admin/content-studio" className="text-xs text-teal-400 hover:text-teal-300 mt-1 inline-block">
            Create new &rarr;
          </Link>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-[var(--text)]">Views This Week</span>
          </div>
          <div className="text-3xl font-bold text-[var(--text)] tabular-nums">{viewsThisWeek.toLocaleString()}</div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-[var(--text)]">Posts This Week</span>
          </div>
          <div className="text-3xl font-bold text-[var(--text)] tabular-nums">{postsThisWeek}</div>
          <Link href="/admin/posting-queue" className="text-xs text-teal-400 hover:text-teal-300 mt-1 inline-block">
            View queue &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
