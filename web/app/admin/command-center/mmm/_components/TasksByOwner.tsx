import { User, Bot, ListTodo } from 'lucide-react';
import type { MmmTaskOwnerGroup, MmmTaskRow } from '@/lib/command-center/mmm/types';
import { Card, StatusPill } from './Section';

const STATUS_TONE: Record<string, 'emerald' | 'amber' | 'rose' | 'blue' | 'violet' | 'zinc'> = {
  done: 'emerald',
  active: 'violet',
  queued: 'blue',
  blocked: 'amber',
  killed: 'rose',
};

const RISK_TONE: Record<string, 'emerald' | 'amber' | 'rose' | 'zinc'> = {
  low: 'zinc',
  medium: 'amber',
  high: 'rose',
};

export function TasksByOwner({
  groups,
  total,
}: {
  groups: MmmTaskOwnerGroup[];
  total: number;
}) {
  if (groups.length === 0) {
    return (
      <Card>
        <div className="text-sm text-zinc-500">
          No MMM tasks in the database yet. Run the seed script to populate FFF + HHH tasks.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-500">
        {total} task{total === 1 ? '' : 's'} across {groups.length} owner{groups.length === 1 ? '' : 's'}
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        {groups.map((g) => (
          <OwnerColumn key={g.owner_id} group={g} />
        ))}
      </div>
    </div>
  );
}

function OwnerColumn({ group }: { group: MmmTaskOwnerGroup }) {
  const isAgent = !!group.agent;
  const Icon = isAgent ? Bot : group.owner_id === 'unassigned' ? ListTodo : User;
  const subtitle = group.team_member?.role
    ? group.team_member.role.replace('-', ' ')
    : group.agent
      ? group.agent.identity
      : group.owner_id === 'unassigned'
        ? 'No owner yet'
        : '—';

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${isAgent ? 'text-violet-400' : 'text-zinc-300'}`} />
          <span className="text-sm font-semibold text-zinc-100">{group.owner_label}</span>
          <span className="text-[11px] text-zinc-500">· {subtitle}</span>
        </div>
        <span className="text-[10px] text-zinc-500">{group.tasks.length} open</span>
      </div>
      <div className="space-y-2">
        {group.tasks.slice(0, 8).map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        {group.tasks.length > 8 ? (
          <div className="text-[11px] text-zinc-600 italic">
            +{group.tasks.length - 8} more — open the Campaigns tab for the full list
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function TaskRow({ task }: { task: MmmTaskRow }) {
  const statusTone = STATUS_TONE[task.status] || 'zinc';
  const riskTone = RISK_TONE[task.risk_tier] || 'zinc';

  return (
    <div className="border border-zinc-800 rounded-lg p-2.5 bg-zinc-950/40">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-zinc-200 font-medium truncate">{task.title}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <StatusPill label={task.status} tone={statusTone} />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[10px] text-zinc-500">
        {task.initiative_slug ? <span>{task.initiative_slug}</span> : null}
        {task.project_name ? <span>· {task.project_name}</span> : null}
        <span>· P{task.priority}</span>
        <StatusPill label={`risk: ${task.risk_tier}`} tone={riskTone} />
        {task.source === 'agent' ? (
          <StatusPill label="agent-suggested" tone="violet" />
        ) : null}
        {task.approval_state === 'pending' ? (
          <StatusPill label="needs approval" tone="amber" />
        ) : null}
      </div>
    </div>
  );
}
