'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { CreatorStage } from '@/lib/creator-profile/stage';

interface StageConfig {
  message: string;
  cta: string;
  href: string;
  color: string;
  border: string;
}

const STAGE_CONFIG: Record<CreatorStage, StageConfig> = {
  Starter: {
    message: 'Find your first winning product.',
    cta: 'Browse Products',
    href: '/admin/products',
    color: 'text-zinc-300 bg-zinc-800/60 border-zinc-700/50',
    border: 'border-zinc-700/50',
  },
  Builder: {
    message: 'Increase your daily output.',
    cta: 'Content Studio',
    href: '/admin/content-studio',
    color: 'text-blue-300 bg-blue-900/30 border-blue-500/20',
    border: 'border-blue-500/20',
  },
  Scaling: {
    message: 'Automate your posting pipeline.',
    cta: 'Production Board',
    href: '/admin/pipeline',
    color: 'text-teal-300 bg-teal-900/30 border-teal-500/20',
    border: 'border-teal-500/20',
  },
  Advanced: {
    message: "Analyze what's converting.",
    cta: 'View Analytics',
    href: '/admin/analytics',
    color: 'text-violet-300 bg-violet-900/30 border-violet-500/20',
    border: 'border-violet-500/20',
  },
};

export function RecommendedNextStep({ stage }: { stage: CreatorStage }) {
  const config = STAGE_CONFIG[stage];

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${config.color}`}>
      <div className="flex items-center gap-2 text-sm font-medium min-w-0">
        <span className="opacity-60 flex-shrink-0">Recommended:</span>
        <span className="truncate">{config.message}</span>
      </div>
      <Link
        href={config.href}
        className="flex items-center gap-1.5 text-sm font-medium whitespace-nowrap opacity-80 hover:opacity-100 transition-opacity"
      >
        {config.cta}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
