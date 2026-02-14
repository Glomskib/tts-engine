'use client';

import Link from 'next/link';
import { type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-white/5 flex items-center justify-center mb-6">
        <Icon size={28} className="text-zinc-500" />
      </div>

      <h3 className="text-lg font-semibold text-zinc-100 mb-2">{title}</h3>
      <p className="text-zinc-400 text-sm max-w-sm mb-6 leading-relaxed">{description}</p>

      <div className="flex items-center gap-3">
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-500 text-white font-medium text-sm hover:bg-teal-600 transition-colors"
          >
            {action.label}
          </Link>
        )}
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/10 text-zinc-300 font-medium text-sm hover:bg-white/5 transition-colors"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
