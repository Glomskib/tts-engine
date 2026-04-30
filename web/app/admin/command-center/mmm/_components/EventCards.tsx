import { CalendarDays, MapPin, Clock, Trophy, Users, Handshake } from 'lucide-react';
import type { MmmEvent } from '@/lib/command-center/mmm/types';
import { Card, StatusPill } from './Section';

function daysUntil(dateIso: string): number {
  const target = new Date(dateIso + 'T00:00:00');
  const now = new Date();
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function eventTone(status: MmmEvent['status']): 'emerald' | 'amber' | 'blue' | 'zinc' {
  if (status === 'completed') return 'emerald';
  if (status === 'in-progress') return 'amber';
  if (status === 'upcoming') return 'blue';
  return 'zinc';
}

export function EventCards({ events }: { events: MmmEvent[] }) {
  if (events.length === 0) {
    return (
      <Card>
        <div className="text-sm text-zinc-500">No events registered for this group yet.</div>
      </Card>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {events.map((e) => (
        <EventCard key={e.slug} event={e} />
      ))}
    </div>
  );
}

function EventCard({ event }: { event: MmmEvent }) {
  const tone = eventTone(event.status);
  const days = daysUntil(event.date_iso);
  const isPast = days < 0;
  const isToday = days === 0;
  const countdown =
    event.status === 'completed'
      ? `Wrapped ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
      : isToday
        ? 'Today'
        : isPast
          ? `${Math.abs(days)} days ago`
          : `${days} days out`;

  return (
    <div
      className={`rounded-xl border p-4 ${
        event.status === 'completed'
          ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
          : 'border-blue-500/30 bg-blue-500/[0.04]'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-zinc-300" />
          <span className="text-sm font-semibold text-zinc-100">{event.name}</span>
        </div>
        <StatusPill label={event.status.replace('-', ' ')} tone={tone} />
      </div>

      <div className="text-xs text-zinc-400 space-y-1 mb-3">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3 h-3" />
          {event.display_date} · {countdown}
        </div>
        {event.start_time ? (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            {event.start_time}
          </div>
        ) : null}
        {event.location ? (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3" />
            {event.location}
          </div>
        ) : null}
      </div>

      {event.description ? (
        <p className="text-xs text-zinc-500 leading-relaxed mb-3">{event.description}</p>
      ) : null}

      {event.registration_goal !== undefined ? (
        <ProgressRow
          icon={Users}
          label="Registrations"
          current={event.registrations || 0}
          goal={event.registration_goal}
        />
      ) : null}
      {event.sponsor_goal !== undefined ? (
        <ProgressRow
          icon={Handshake}
          label="Sponsors"
          current={event.sponsors_secured || 0}
          goal={event.sponsor_goal}
        />
      ) : null}

      {event.highlights && event.highlights.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-zinc-400 list-disc list-inside">
          {event.highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ProgressRow({
  icon: Icon,
  label,
  current,
  goal,
}: {
  icon: typeof Trophy;
  label: string;
  current: number;
  goal: number;
}) {
  const pct = Math.min(100, Math.round((current / Math.max(1, goal)) * 100));
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
        <span className="flex items-center gap-1.5">
          <Icon className="w-3 h-3" />
          {label}
        </span>
        <span className="text-zinc-300">
          {current}/{goal} · {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-teal-500/70"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
