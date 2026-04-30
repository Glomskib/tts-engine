'use client';

import {
  CalendarDays,
  ListTodo,
  Users,
  Megaphone,
  DollarSign,
  FileText,
  Search,
  Bot,
  Target,
  CheckSquare,
  Handshake,
  Gauge,
} from 'lucide-react';

const SECTIONS = [
  { id: 'next-actions', label: 'Next', icon: Target },
  { id: 'approvals', label: 'Approvals', icon: CheckSquare },
  { id: 'agent-actions', label: 'Trigger Miles', icon: Bot },
  { id: 'readiness', label: 'Readiness', icon: Gauge },
  { id: 'sponsors', label: 'Sponsors', icon: Handshake },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'social', label: 'Social', icon: Megaphone },
  { id: 'finance', label: 'Finance', icon: DollarSign },
  { id: 'meetings', label: 'Meetings', icon: FileText },
  { id: 'research', label: 'Research', icon: Search },
  { id: 'agent', label: 'Activity', icon: Bot },
];

export default function MmmSectionNav() {
  return (
    <div className="-mx-6 px-6 border-b border-zinc-800 mb-2 overflow-x-auto scrollbar-none">
      <nav className="flex gap-1 min-w-max" aria-label="MMM section navigation">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Icon className="w-4 h-4" />
              {s.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
