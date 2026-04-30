import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function Section({
  id,
  title,
  icon: Icon,
  count,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  icon?: LucideIcon;
  count?: number | string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="w-4 h-4 text-teal-400" /> : null}
          <h2 className="text-sm font-semibold text-zinc-300">{title}</h2>
          {count !== undefined ? (
            <span className="text-xs text-zinc-600">({count})</span>
          ) : null}
        </div>
        {action}
      </div>
      {description ? <p className="text-xs text-zinc-500 max-w-3xl">{description}</p> : null}
      {children}
    </section>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 ${className}`}>
      {children}
    </div>
  );
}

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'emerald' | 'rose' | 'amber' | 'blue' | 'violet' | 'zinc';
}) {
  const map: Record<typeof tone, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    zinc: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${map[tone]}`}
    >
      {label}
    </span>
  );
}

export function DemoBadge() {
  return <StatusPill label="Demo" tone="zinc" />;
}
