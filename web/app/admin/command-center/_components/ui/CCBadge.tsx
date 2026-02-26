const PRESET: Record<string, string> = {
  // Status
  completed: 'bg-emerald-500/20 text-emerald-400',
  ok: 'bg-emerald-500/20 text-emerald-400',
  done: 'bg-emerald-500/20 text-emerald-400',
  hired: 'bg-teal-500/20 text-teal-400',
  delivered: 'bg-emerald-500/20 text-emerald-400',
  running: 'bg-blue-500/20 text-blue-400',
  active: 'bg-blue-500/20 text-blue-400',
  in_progress: 'bg-amber-500/20 text-amber-400',
  interviewing: 'bg-purple-500/20 text-purple-400',
  queued: 'bg-zinc-500/20 text-zinc-400',
  lead: 'bg-zinc-500/20 text-zinc-400',
  pending: 'bg-zinc-500/20 text-zinc-400',
  applied: 'bg-blue-500/20 text-blue-400',
  failed: 'bg-red-500/20 text-red-400',
  error: 'bg-red-500/20 text-red-400',
  blocked: 'bg-red-500/20 text-red-400',
  closed: 'bg-zinc-500/20 text-zinc-500',
  // Types
  bug: 'bg-red-500/20 text-red-400',
  feature: 'bg-purple-500/20 text-purple-400',
  support: 'bg-amber-500/20 text-amber-400',
  new: 'bg-blue-500/20 text-blue-400',
};

interface CCBadgeProps {
  variant?: string;
  color?: string;
  children: React.ReactNode;
  className?: string;
}

export default function CCBadge({ variant, color, children, className = '' }: CCBadgeProps) {
  const resolved = color || (variant ? PRESET[variant] : undefined) || 'bg-zinc-700 text-zinc-400';
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${resolved} ${className}`}>
      {children}
    </span>
  );
}
