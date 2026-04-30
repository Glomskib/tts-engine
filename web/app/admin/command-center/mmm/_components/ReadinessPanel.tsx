import { CheckCircle2, AlertTriangle, Circle, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MmmReadinessSummary, MmmReadinessCategory } from '@/lib/command-center/mmm/types';
import { Card, StatusPill } from './Section';

const STATUS_META: Record<MmmReadinessCategory['status'], { icon: LucideIcon; tone: 'emerald' | 'amber' | 'blue' | 'zinc'; label: string }> = {
  done: { icon: CheckCircle2, tone: 'emerald', label: 'done' },
  'on-track': { icon: Clock, tone: 'blue', label: 'on track' },
  'needs-attention': { icon: AlertTriangle, tone: 'amber', label: 'needs attention' },
  'not-started': { icon: Circle, tone: 'zinc', label: 'not started' },
};

export function ReadinessPanel({ summary }: { summary: MmmReadinessSummary }) {
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-zinc-100 truncate">{summary.event_label}</span>
            <StatusPill
              label={summary.status_label}
              tone={
                summary.status_label === 'Ready'
                  ? 'emerald'
                  : summary.status_label === 'Needs attention' || summary.status_label === 'Behind'
                    ? 'amber'
                    : 'blue'
              }
            />
          </div>
          <span className="text-[11px] text-zinc-500">{summary.ready_pct}% ready</span>
        </div>
        <div className="h-1.5 rounded bg-zinc-800 overflow-hidden mb-3">
          <div
            className={`h-full ${summary.ready_pct >= 70 ? 'bg-emerald-500/70' : summary.ready_pct >= 30 ? 'bg-amber-500/70' : 'bg-rose-500/70'}`}
            style={{ width: `${summary.ready_pct}%` }}
          />
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
          <div>
            <div className="text-emerald-400 font-bold">{summary.done}</div>
            <div className="text-zinc-500">done</div>
          </div>
          <div>
            <div className="text-blue-400 font-bold">{summary.on_track}</div>
            <div className="text-zinc-500">on track</div>
          </div>
          <div>
            <div className="text-amber-400 font-bold">{summary.needs_attention}</div>
            <div className="text-zinc-500">attention</div>
          </div>
          <div>
            <div className="text-zinc-400 font-bold">{summary.not_started}</div>
            <div className="text-zinc-500">not started</div>
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {summary.categories.map((c) => (
          <CategoryCard key={c.key} category={c} />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: MmmReadinessCategory }) {
  const meta = STATUS_META[category.status];
  const Icon = meta.icon;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon
            className={`w-3.5 h-3.5 flex-shrink-0 ${
              meta.tone === 'emerald'
                ? 'text-emerald-400'
                : meta.tone === 'amber'
                  ? 'text-amber-400'
                  : meta.tone === 'blue'
                    ? 'text-blue-400'
                    : 'text-zinc-500'
            }`}
          />
          <span className="text-xs font-semibold text-zinc-100 truncate">{category.label}</span>
        </div>
        <StatusPill label={meta.label} tone={meta.tone} />
      </div>
      <div className="text-[10px] text-zinc-500 mb-1.5">
        {category.task_done}/{category.task_total} done
        {category.task_blocked > 0 ? ` · ${category.task_blocked} blocked` : ''}
        {category.owner_label ? ` · ${category.owner_label}` : ''}
        {category.due_label ? ` · due ${category.due_label}` : ''}
      </div>
      {category.next_action ? (
        <div className="text-[11px] text-zinc-300 line-clamp-2">{category.next_action}</div>
      ) : (
        <div className="text-[11px] text-zinc-600 italic">no current task</div>
      )}
      {category.blockers && category.blockers.length > 0 ? (
        <div className="text-[10px] text-rose-400 mt-1 line-clamp-2">
          Blockers: {category.blockers.join('; ')}
        </div>
      ) : null}
    </div>
  );
}
