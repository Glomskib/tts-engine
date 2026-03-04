'use client';

import { ListTodo, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import Link from 'next/link';

interface QueueData {
  needsApproval: { id: string; video_code: string; recording_status: string; created_at: string }[];
  needsEdits: { id: string; video_code: string; recording_status: string; created_at: string; edit_notes?: string }[];
  overdue: { id: string; video_code: string; recording_status: string; created_at: string }[];
}

function QueueSection({ title, icon: Icon, items, color, emptyText }: {
  title: string;
  icon: typeof CheckCircle;
  items: { id: string; video_code: string; created_at: string }[];
  color: string;
  emptyText: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <h3 className="text-sm font-medium text-[var(--text)]">{title}</h3>
        {items.length > 0 && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${color} bg-current/10`}>
            {items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] ml-6">{emptyText}</p>
      ) : (
        <div className="space-y-1 ml-6">
          {items.slice(0, 3).map((item) => (
            <Link
              key={item.id}
              href={`/admin/pipeline?video=${item.id}`}
              className="block text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors truncate"
            >
              {item.video_code || item.id.slice(0, 8)}
            </Link>
          ))}
          {items.length > 3 && (
            <Link href="/admin/pipeline" className="text-xs text-teal-400 hover:text-teal-300">
              +{items.length - 3} more
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function PersonalQueue({ data, loading }: { data: QueueData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
          <ListTodo className="w-5 h-5 text-teal-400" />
          My Queue
        </h2>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-[var(--surface2)] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const totalItems = data.needsApproval.length + data.needsEdits.length + data.overdue.length;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--text)] flex items-center gap-2">
          <ListTodo className="w-5 h-5 text-teal-400" />
          My Queue
        </h2>
        {totalItems > 0 && (
          <span className="text-xs px-2 py-1 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20">
            {totalItems} item{totalItems !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {totalItems === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">All clear — nothing needs your attention right now.</p>
      ) : (
        <div className="space-y-4">
          <QueueSection
            title="Needs Approval"
            icon={CheckCircle}
            items={data.needsApproval}
            color="text-blue-400"
            emptyText="No approvals pending"
          />
          <QueueSection
            title="Needs Edits"
            icon={AlertTriangle}
            items={data.needsEdits}
            color="text-amber-400"
            emptyText="No edits needed"
          />
          <QueueSection
            title="Overdue"
            icon={Clock}
            items={data.overdue}
            color="text-red-400"
            emptyText="Nothing overdue"
          />
        </div>
      )}
    </div>
  );
}
