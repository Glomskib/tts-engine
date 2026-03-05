'use client';

import Link from 'next/link';
import { ChevronRight, Sparkles } from 'lucide-react';

interface Assignment {
  id: string;
  title: string;
  product: string | null;
  brand: string | null;
  status: string;
  recording_status: string | null;
  nextAction: string;
}

function getStatusPill(status: string) {
  switch (status) {
    case 'draft':
      return { label: 'Draft', classes: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' };
    case 'needs_edit':
      return { label: 'Editing', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/20' };
    case 'ready_to_post':
      return { label: 'Ready', classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' };
    case 'posted':
      return { label: 'Posted', classes: 'bg-purple-500/15 text-purple-400 border-purple-500/20' };
    default:
      return { label: status, classes: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' };
  }
}

export function TodayAssignments({ assignments }: { assignments: Assignment[] }) {
  if (assignments.length === 0) {
    return (
      <div className="bg-zinc-900/50 rounded-xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Up Next</h2>
        <div className="text-center py-6">
          <p className="text-zinc-500 text-sm">No videos in the queue.</p>
          <Link
            href="/admin/content-studio"
            className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 min-h-[48px] bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-xl text-sm font-medium hover:bg-teal-500/20 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate Content
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">Up Next</h2>
        <Link
          href="/admin/pipeline"
          className="text-xs text-teal-400 hover:text-teal-300 transition-colors min-h-[44px] flex items-center"
        >
          View all
        </Link>
      </div>
      <div className="space-y-2">
        {assignments.map((item) => {
          const pill = getStatusPill(item.status);
          return (
            <Link
              key={item.id}
              href={`/admin/pipeline/${item.id}`}
              className="flex items-center gap-3 bg-zinc-900/50 border border-white/10 rounded-xl p-4 hover:bg-zinc-800/50 transition-colors min-h-[64px] active:scale-[0.99]"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{item.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  {item.product && (
                    <span className="text-xs text-zinc-500 truncate">{item.product}</span>
                  )}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${pill.classes}`}>
                    {pill.label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-teal-400 font-medium hidden sm:inline">
                  {item.nextAction}
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
