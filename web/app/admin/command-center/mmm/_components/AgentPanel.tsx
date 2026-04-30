import { Bot, Lightbulb, FileText, Search, Megaphone, Calendar, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MmmAgent, MmmAgentActivity } from '@/lib/command-center/mmm/types';
import { Card, DemoBadge, StatusPill } from './Section';

const KIND_META: Record<MmmAgentActivity['kind'], { icon: LucideIcon; label: string; tone: 'violet' | 'amber' | 'blue' }> = {
  'suggested-task': { icon: Lightbulb, label: 'Suggested task', tone: 'amber' },
  'social-draft': { icon: Megaphone, label: 'Social draft', tone: 'violet' },
  'meeting-summary': { icon: FileText, label: 'Meeting summary', tone: 'blue' },
  'research-note': { icon: Search, label: 'Research note', tone: 'blue' },
  'weekly-report': { icon: Calendar, label: 'Weekly report', tone: 'violet' },
  recap: { icon: Sparkles, label: 'Event recap', tone: 'amber' },
};

export function AgentPanel({
  agents,
  activity,
}: {
  agents: MmmAgent[];
  activity: MmmAgentActivity[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        {agents.map((agent) => (
          <AgentIdentityCard key={agent.id} agent={agent} />
        ))}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
          Recent activity ({activity.length})
        </div>
        <div className="space-y-2">
          {activity.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </div>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/[0.03]">
        <div className="text-[11px] text-zinc-400">
          <strong className="text-amber-400">Wiring note:</strong> the activity stream above is
          rendered from a hardcoded demo set plus any live <code>agent_runs</code> rows where
          <code> agent_id = &apos;bolt-miles&apos;</code>. To go live, point a real Claude/OpenAI loop at the
          existing <code>recordAgentRunStart</code> / <code>recordAgentRunFinish</code> helpers in{' '}
          <code>lib/command-center/agent-runs.ts</code> and persist drafts/recaps either as
          <code> task_events</code> on synthesized tasks or as a new <code>agent_outputs</code> table.
        </div>
      </Card>
    </div>
  );
}

function AgentIdentityCard({ agent }: { agent: MmmAgent }) {
  return (
    <Card className="border-violet-500/20 bg-violet-500/[0.03]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-zinc-100">{agent.name}</span>
        </div>
        <StatusPill label="helper agent" tone="violet" />
      </div>
      <div className="text-[11px] text-zinc-500 mb-1.5">{agent.identity}</div>
      <p className="text-xs text-zinc-400 mb-2 leading-relaxed">{agent.description}</p>
      <div className="flex flex-wrap gap-1">
        {agent.capabilities.map((c) => (
          <span
            key={c}
            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700"
          >
            {c}
          </span>
        ))}
      </div>
    </Card>
  );
}

function ActivityRow({ item }: { item: MmmAgentActivity }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  return (
    <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-zinc-300 flex-shrink-0" />
          <span className="text-xs text-zinc-200 font-semibold truncate">{item.title}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <StatusPill label={meta.label} tone={meta.tone} />
          {item.is_demo ? <DemoBadge /> : null}
          {item.approval_state === 'pending' ? (
            <StatusPill label="needs approval" tone="amber" />
          ) : null}
          {item.approval_state === 'approved' ? (
            <StatusPill label="approved" tone="emerald" />
          ) : null}
        </div>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{item.summary}</p>
      <div className="text-[10px] text-zinc-600 mt-1">
        {new Date(item.created_at).toLocaleString()} · agent: {item.agent_id}
        {item.related_event_slug ? ` · event: ${item.related_event_slug}` : ''}
      </div>
    </div>
  );
}
