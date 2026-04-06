'use client';

import { useState, useEffect } from 'react';
import { Loader2, Rocket, Clock, CheckCircle2, Sparkles } from 'lucide-react';

interface RoadmapItem {
  id: string;
  type: string;
  title: string;
  status: 'planned' | 'in_progress' | 'done';
  updated_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  feature: 'Feature',
  improvement: 'Improvement',
  bug: 'Bug Fix',
  other: 'Update',
};

const TYPE_COLORS: Record<string, string> = {
  feature: 'bg-teal-500/10 text-teal-400',
  improvement: 'bg-violet-500/10 text-violet-400',
  bug: 'bg-amber-500/10 text-amber-400',
  other: 'bg-zinc-700 text-zinc-400',
};

// Displayed when database table is empty — keep accurate and up to date
const SEED_ITEMS: RoadmapItem[] = [
  { id: 's1', type: 'feature', title: 'TikTok draft export — push finished videos directly to your drafts', status: 'done', updated_at: new Date().toISOString() },
  { id: 's2', type: 'feature', title: 'Winners Bank — track which hooks beat your benchmarks', status: 'done', updated_at: new Date().toISOString() },
  { id: 's3', type: 'feature', title: '4-stage production pipeline with mobile-first UI', status: 'done', updated_at: new Date().toISOString() },
  { id: 's4', type: 'improvement', title: 'AI video rendering via Remotion — auto-edit raw footage', status: 'in_progress', updated_at: '' },
  { id: 's5', type: 'feature', title: 'TikTok Shop sales sync — see which videos drive revenue', status: 'in_progress', updated_at: '' },
  { id: 's6', type: 'feature', title: 'Hook performance scoring — auto-rank scripts by predicted CTR', status: 'planned', updated_at: '' },
  { id: 's7', type: 'feature', title: 'Multi-brand content calendar with posting schedule', status: 'planned', updated_at: '' },
  { id: 's8', type: 'improvement', title: 'YouTube transcribe → script remix in one click', status: 'planned', updated_at: '' },
];

export function RoadmapItems() {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/feedback/roadmap')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.data.length > 0) {
          setItems(data.data);
        } else {
          // Use seed data when feedback table is empty
          setItems(SEED_ITEMS);
        }
      })
      .catch(() => {
        setItems(SEED_ITEMS);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
      </div>
    );
  }

  const inProgress = items.filter((i) => i.status === 'in_progress');
  const planned = items.filter((i) => i.status === 'planned');
  const done = items.filter((i) => i.status === 'done');

  return (
    <div className="space-y-10">
      {/* In Progress */}
      {inProgress.length > 0 && (
        <Section
          icon={<Rocket className="w-5 h-5 text-teal-400" />}
          title="In Progress"
          description="Currently being built"
          color="blue"
          items={inProgress}
        />
      )}

      {/* Planned */}
      {planned.length > 0 && (
        <Section
          icon={<Clock className="w-5 h-5 text-violet-400" />}
          title="Planned"
          description="On the roadmap"
          color="violet"
          items={planned}
        />
      )}

      {/* Recently Completed */}
      {done.length > 0 && (
        <Section
          icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}
          title="Recently Completed"
          description="Shipped in the last 30 days"
          color="green"
          items={done}
        />
      )}

      {items.length === 0 && (
        <div className="text-center py-12 bg-zinc-900/50 border border-white/10 rounded-xl">
          <Sparkles className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400">Roadmap items coming soon.</p>
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  color,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'blue' | 'violet' | 'green';
  items: RoadmapItem[];
}) {
  const borderColor =
    color === 'blue'
      ? 'border-teal-500/20'
      : color === 'violet'
        ? 'border-violet-500/20'
        : 'border-green-500/20';

  const dotColor =
    color === 'blue'
      ? 'bg-teal-400'
      : color === 'violet'
        ? 'bg-violet-400'
        : 'bg-green-400';

  return (
    <div className={`bg-zinc-900/50 border ${borderColor} rounded-xl overflow-hidden`}>
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
        {icon}
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-sm text-zinc-500">{description}</p>
        </div>
        <span className="ml-auto text-sm text-zinc-600">{items.length}</span>
      </div>
      <ul className="divide-y divide-white/5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-6 py-3.5">
            <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
            <span className="text-sm text-zinc-200 flex-1">{item.title}</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                TYPE_COLORS[item.type] || TYPE_COLORS.other
              }`}
            >
              {TYPE_LABELS[item.type] || 'Update'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
