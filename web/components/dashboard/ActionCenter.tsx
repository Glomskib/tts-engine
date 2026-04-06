'use client';

import Link from 'next/link';
import {
  Video, Upload, Scissors, Send, AlertTriangle, Sparkles,
  Trophy, Mic, ArrowRight,
} from 'lucide-react';
import { getActionCardConfig } from '@/lib/videos/nextAction';

interface ActionItem {
  action: string;
  video: {
    id: string;
    title: string;
    product: string | null;
    status: string;
  };
}

const ACTION_ICONS: Record<string, typeof Video> = {
  record: Video,
  upload: Upload,
  edit: Scissors,
  review_edit: Scissors,
  post: Send,
  generate_post_package: Sparkles,
  fix_blockers: AlertTriangle,
};

const NEXT_STEP_OPTIONS = [
  {
    label: 'Generate a script',
    desc: 'Pick a product and persona. Done in 30 seconds.',
    href: '/admin/content-studio',
    icon: Sparkles,
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/20',
  },
  {
    label: 'Study a winning video',
    desc: 'Paste a TikTok URL. Get the hook breakdown instantly.',
    href: '/admin/transcribe',
    icon: Mic,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
  },
  {
    label: 'See what\'s converting',
    desc: 'Winners Bank shows the hooks driving real sales.',
    href: '/admin/intelligence/winners-bank',
    icon: Trophy,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
];

export function ActionCenter({ actions }: { actions: ActionItem[] }) {
  if (actions.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Where to start</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {NEXT_STEP_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Link
                key={opt.href}
                href={opt.href}
                className={`group flex flex-col gap-3 p-4 rounded-xl ${opt.bg} border ${opt.border} hover:scale-[1.02] transition-all active:scale-[0.98]`}
              >
                <Icon className={`w-5 h-5 ${opt.color}`} />
                <div>
                  <p className="text-sm font-semibold text-white">{opt.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
                <div className={`flex items-center gap-1 text-xs ${opt.color} mt-auto`}>
                  Start <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">Your next moves</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {actions.map((item) => {
          const config = getActionCardConfig(item.action);
          const Icon = ACTION_ICONS[item.action] || Sparkles;

          return (
            <Link
              key={item.video.id}
              href={`/admin/pipeline/${item.video.id}`}
              className={`group ${config.bgColor} border ${config.borderColor} rounded-xl p-4 hover:scale-[1.02] transition-all active:scale-[0.98] min-h-[80px]`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl ${config.bgColor} border ${config.borderColor} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-6 h-6 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${config.color}`}>
                    {config.title}
                  </p>
                  <p className="text-white text-sm mt-0.5 truncate">
                    {item.video.title}
                  </p>
                  {item.video.product && (
                    <p className="text-zinc-500 text-xs mt-0.5 truncate">
                      {item.video.product}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
