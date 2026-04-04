'use client';

import { useRouter } from 'next/navigation';

interface PressureMetric {
  label: string;
  count: number;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
  href: string;
}

interface ProductionPressurePanelProps {
  scriptsNeeded: number;
  readyToRecord: number;
  editing: number;
  readyToPublish: number;
  overdue: number;
}

export function ProductionPressurePanel({
  scriptsNeeded,
  readyToRecord,
  editing,
  readyToPublish,
  overdue,
}: ProductionPressurePanelProps) {
  const router = useRouter();

  const metrics: PressureMetric[] = [
    {
      label: 'Scripts Needed',
      count: scriptsNeeded,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/5',
      borderColor: 'border-amber-500/20',
      dotColor: 'bg-amber-400',
      href: '/admin/pipeline?mode=scripts',
    },
    {
      label: 'Ready to Record',
      count: readyToRecord,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/5',
      borderColor: 'border-blue-500/20',
      dotColor: 'bg-blue-400',
      href: '/admin/pipeline?mode=record',
    },
    {
      label: 'Editing',
      count: editing,
      color: 'text-violet-400',
      bgColor: 'bg-violet-500/5',
      borderColor: 'border-violet-500/20',
      dotColor: 'bg-violet-400',
      href: '/admin/pipeline?mode=edit',
    },
    {
      label: 'Ready to Publish',
      count: readyToPublish,
      color: 'text-green-400',
      bgColor: 'bg-green-500/5',
      borderColor: 'border-green-500/20',
      dotColor: 'bg-green-400',
      href: '/admin/pipeline?mode=publish',
    },
  ];

  const total = scriptsNeeded + readyToRecord + editing + readyToPublish;

  // Find the bottleneck (highest count)
  const maxCount = Math.max(scriptsNeeded, readyToRecord, editing, readyToPublish);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Production Pressure</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Focus here to keep production moving</p>
        </div>
        {total > 0 && (
          <span className="text-xs text-zinc-500 tabular-nums">{total} total in progress</span>
        )}
      </div>

      <div className="space-y-2">
        {metrics.map((m) => {
          const isBottleneck = m.count === maxCount && m.count > 0;
          return (
            <button
              key={m.label}
              onClick={() => router.push(m.href)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left group ${m.bgColor} ${m.borderColor} hover:brightness-125`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${m.dotColor}`} />
              <span className="flex-1 text-sm text-zinc-300 group-hover:text-white transition-colors">
                {m.label}
              </span>
              <span className={`text-lg font-bold tabular-nums ${m.color}`}>
                {m.count}
              </span>
              {isBottleneck && m.count > 0 && (
                <span className="text-[10px] text-amber-500 font-medium uppercase tracking-wide">
                  bottleneck
                </span>
              )}
            </button>
          );
        })}

        {/* Overdue — separate with visual break */}
        {overdue > 0 && (
          <>
            <div className="border-t border-zinc-800 my-1" />
            <button
              onClick={() => router.push('/admin/pipeline')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-red-500/5 border-red-500/20 hover:brightness-125 transition-colors text-left group"
            >
              <span className="w-2 h-2 rounded-full shrink-0 bg-red-400" />
              <span className="flex-1 text-sm text-zinc-300 group-hover:text-white transition-colors">
                Overdue
              </span>
              <span className="text-lg font-bold tabular-nums text-red-400">
                {overdue}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
