import { Search, MapPin, CalendarDays } from 'lucide-react';
import type { MmmResearchItem } from '@/lib/command-center/mmm/types';
import { Card, StatusPill } from './Section';

const STATUS_TONE: Record<MmmResearchItem['status'], 'blue' | 'amber' | 'emerald' | 'zinc'> = {
  queued: 'blue',
  researching: 'amber',
  researched: 'emerald',
  archived: 'zinc',
};

export function ResearchQueue({ items }: { items: MmmResearchItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <div className="text-sm text-zinc-500">
          No research items yet. Add one as an idea tagged{' '}
          <code className="text-zinc-400">mmm</code> +{' '}
          <code className="text-zinc-400">bike-event-research</code> and it will appear here.
        </div>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {items.map((it) => (
        <ResearchCard key={it.id} item={it} />
      ))}
    </div>
  );
}

function ResearchCard({ item }: { item: MmmResearchItem }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Search className="w-4 h-4 text-zinc-300 flex-shrink-0" />
          <span className="text-sm font-semibold text-zinc-100 truncate">{item.title}</span>
        </div>
        <StatusPill label={item.status} tone={STATUS_TONE[item.status]} />
      </div>

      <div className="text-[11px] text-zinc-400 space-y-1 mb-2">
        {item.event_name ? <div>Event: {item.event_name}</div> : null}
        {item.location ? (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3" />
            {item.location}
          </div>
        ) : null}
        {item.date_or_season ? (
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-3 h-3" />
            {item.date_or_season}
          </div>
        ) : null}
        {item.registration_model ? <div>Model: {item.registration_model}</div> : null}
        {item.attendance_clue ? <div>Attendance: {item.attendance_clue}</div> : null}
      </div>

      {item.sponsor_ideas && item.sponsor_ideas.length > 0 ? (
        <div className="mb-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">
            Sponsor ideas
          </div>
          <div className="text-[11px] text-zinc-400">{item.sponsor_ideas.join(' · ')}</div>
        </div>
      ) : null}

      {item.takeaways && item.takeaways.length > 0 ? (
        <div className="mb-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">
            What MMM can learn
          </div>
          <ul className="text-[11px] text-zinc-300 list-disc list-inside space-y-0.5">
            {item.takeaways.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center gap-1 mt-2">
        {item.source === 'agent' ? <StatusPill label="agent-suggested" tone="violet" /> : null}
        {item.approval_state === 'pending' ? (
          <StatusPill label="needs approval" tone="amber" />
        ) : null}
        {item.tags.slice(0, 4).map((t) => (
          <span key={t} className="text-[10px] text-zinc-500">
            #{t}
          </span>
        ))}
      </div>
    </Card>
  );
}
