'use client';

import Link from 'next/link';
import { Calendar, AlertTriangle, Clock, ChevronRight } from 'lucide-react';

interface VideoRequest {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  user_email?: string;
  priority: number;
}

interface DeadlineWidgetProps {
  requests: VideoRequest[];
}

export default function DeadlineWidget({ requests }: DeadlineWidgetProps) {
  // Filter to only show requests with deadlines, sorted by deadline
  const requestsWithDeadlines = requests
    .filter(r => r.due_date && !['completed', 'cancelled'].includes(r.status))
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());

  // Group into overdue, due today, due this week, upcoming
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const overdue: VideoRequest[] = [];
  const dueToday: VideoRequest[] = [];
  const dueThisWeek: VideoRequest[] = [];
  const upcoming: VideoRequest[] = [];

  requestsWithDeadlines.forEach(r => {
    const dueDate = new Date(r.due_date!);
    if (dueDate < today) {
      overdue.push(r);
    } else if (dueDate < tomorrow) {
      dueToday.push(r);
    } else if (dueDate < nextWeek) {
      dueThisWeek.push(r);
    } else {
      upcoming.push(r);
    }
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (requestsWithDeadlines.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4" />
          Upcoming Deadlines
        </h3>
        <p className="text-sm text-zinc-600 text-center py-4">
          No upcoming deadlines
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4" />
        Upcoming Deadlines
        {overdue.length > 0 && (
          <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-full">
            {overdue.length} overdue
          </span>
        )}
      </h3>

      <div className="space-y-4">
        {/* Overdue */}
        {overdue.length > 0 && (
          <DeadlineSection
            title="Overdue"
            requests={overdue}
            formatDate={formatDate}
            className="bg-red-900/20 border-red-500/30"
            textColor="text-red-400"
          />
        )}

        {/* Due Today */}
        {dueToday.length > 0 && (
          <DeadlineSection
            title="Due Today"
            requests={dueToday}
            formatDate={formatDate}
            className="bg-amber-900/20 border-amber-500/30"
            textColor="text-amber-400"
          />
        )}

        {/* Due This Week */}
        {dueThisWeek.length > 0 && (
          <DeadlineSection
            title="This Week"
            requests={dueThisWeek}
            formatDate={formatDate}
            className=""
            textColor="text-zinc-300"
          />
        )}

        {/* Upcoming (only show first 3) */}
        {upcoming.length > 0 && (
          <DeadlineSection
            title="Later"
            requests={upcoming.slice(0, 3)}
            formatDate={formatDate}
            className=""
            textColor="text-zinc-500"
            moreCount={upcoming.length > 3 ? upcoming.length - 3 : 0}
          />
        )}
      </div>
    </div>
  );
}

function DeadlineSection({
  title,
  requests,
  formatDate,
  className,
  textColor,
  moreCount = 0,
}: {
  title: string;
  requests: VideoRequest[];
  formatDate: (date: string) => string;
  className: string;
  textColor: string;
  moreCount?: number;
}) {
  return (
    <div className={`rounded-lg border p-2 ${className || 'border-zinc-800'}`}>
      <p className={`text-xs font-medium mb-2 ${textColor}`}>{title}</p>
      <div className="space-y-1">
        {requests.map(r => (
          <Link
            key={r.id}
            href={`/admin/video-editing/${r.id}`}
            className="flex items-center gap-2 p-2 rounded hover:bg-zinc-800/50 transition-colors group"
          >
            {r.priority === 2 && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
            {r.priority === 1 && <Clock className="w-3 h-3 text-amber-400 shrink-0" />}
            <span className="text-sm text-white truncate flex-1">{r.title}</span>
            <span className={`text-xs ${textColor}`}>{formatDate(r.due_date!)}</span>
            <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400" />
          </Link>
        ))}
        {moreCount > 0 && (
          <p className="text-xs text-zinc-600 text-center py-1">
            +{moreCount} more
          </p>
        )}
      </div>
    </div>
  );
}
