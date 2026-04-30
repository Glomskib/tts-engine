import { CheckCircle2, Circle, AlertCircle, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MmmDashboardData } from '@/lib/command-center/mmm/types';
import { Card } from './Section';

type Status = 'connected' | 'demo' | 'empty' | 'partial';

interface ChecklistRow {
  label: string;
  status: Status;
  detail: string;
  command?: string;
}

const STATUS_META: Record<Status, { icon: LucideIcon; tone: string; label: string }> = {
  connected: { icon: CheckCircle2, tone: 'text-emerald-400', label: 'Connected' },
  demo: { icon: Circle, tone: 'text-amber-400', label: 'Demo data' },
  partial: { icon: Circle, tone: 'text-blue-400', label: 'Partial' },
  empty: { icon: AlertCircle, tone: 'text-rose-400', label: 'Empty' },
};

function classify(data: MmmDashboardData): ChecklistRow[] {
  const liveAgentActivity = data.agent_activity.filter((a) => !a.is_demo).length;
  const liveResearch = data.research.filter((r) => r.underlying_idea_id).length;
  const liveFinance = data.finance.filter((f) => !f.is_demo).length;

  const rows: ChecklistRow[] = [];

  rows.push({
    label: 'Seed data',
    status:
      data.task_total >= 15 ? 'connected' : data.task_total > 0 ? 'partial' : 'empty',
    detail: `${data.task_total} tasks across ${data.task_groups.length} owners. ${data.events.length} events registered.`,
    command:
      data.task_total < 15
        ? 'npx tsx scripts/seed-command-center.ts'
        : undefined,
  });

  rows.push({
    label: 'Social queue',
    status:
      data.social_posts.length >= 12
        ? 'connected'
        : data.social_posts.length > 0
          ? 'partial'
          : 'empty',
    detail: `${data.social_posts.length} marketing_posts rows for MMM hashtags/handles.`,
    command:
      data.social_posts.length < 12
        ? 'npx tsx scripts/marketing/publish-mmm-calendar.ts --file content/social/mmm_apr_may_2026_calendar.md --from 2026-04-26 --to 2026-05-31'
        : undefined,
  });

  rows.push({
    label: 'Finance data',
    status:
      liveFinance === data.finance.length && data.finance.length > 0
        ? 'connected'
        : liveFinance > 0
          ? 'partial'
          : 'demo',
    detail:
      liveFinance > 0
        ? `${liveFinance}/${data.finance.length} event(s) backed by live finance_transactions.`
        : 'All numbers are demo. Insert real rows into finance_transactions with the matching initiative_id to go live.',
  });

  rows.push({
    label: 'Meeting notes',
    status: data.meeting_notes.length > 0 ? 'connected' : 'empty',
    detail:
      data.meeting_notes.length > 0
        ? `${data.meeting_notes.length} markdown file(s) under content/meetings/mmm/.`
        : 'No notes yet — drop a markdown file in content/meetings/mmm/<YYYY-MM-DD>-<slug>.md',
  });

  rows.push({
    label: 'Bolt / Miles agent activity',
    status: liveAgentActivity > 0 ? 'partial' : 'demo',
    detail:
      liveAgentActivity > 0
        ? `${liveAgentActivity} live agent_runs row(s); the rest of the stream is demo until the AI loop is wired.`
        : 'All activity is demo. Wire a real loop into recordAgentRunStart/Finish (lib/command-center/agent-runs.ts).',
  });

  rows.push({
    label: 'Research queue',
    status: liveResearch > 0 ? 'connected' : 'demo',
    detail:
      liveResearch > 0
        ? `${liveResearch} idea(s) tagged mmm + bike-event-research backing the queue.`
        : 'All research items are demo. Tag ideas with mmm + bike-event-research to surface them here.',
  });

  return rows;
}

export function OperatorChecklist({ data }: { data: MmmDashboardData }) {
  const rows = classify(data);
  const commands = rows.filter((r) => r.command).map((r) => r.command!) as string[];

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-zinc-100">Operator checklist</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
          What&apos;s connected vs demo
        </span>
      </div>

      <div className="space-y-2 mb-3">
        {rows.map((r) => {
          const m = STATUS_META[r.status];
          const Icon = m.icon;
          return (
            <div key={r.label} className="flex items-start gap-2 text-xs">
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${m.tone}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-200">{r.label}</span>
                  <span className={`text-[10px] uppercase tracking-wider ${m.tone}`}>
                    {m.label}
                  </span>
                </div>
                <div className="text-zinc-500 mt-0.5">{r.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      {commands.length > 0 ? (
        <div className="border-t border-zinc-800 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center gap-1.5">
            <Terminal className="w-3 h-3" />
            Next setup commands
          </div>
          <div className="space-y-1">
            {commands.map((c, i) => (
              <code
                key={i}
                className="block text-[10px] text-teal-400 bg-zinc-950/60 border border-zinc-800 rounded px-2 py-1 font-mono break-all"
              >
                {c}
              </code>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
