'use client';

import Link from 'next/link';
import {
  Video, Upload, Scissors, Send, AlertTriangle, Sparkles,
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

export function ActionCenter({ actions }: { actions: ActionItem[] }) {
  if (actions.length === 0) {
    return (
      <div className="bg-zinc-900/50 rounded-xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Action Center</h2>
        <div className="text-center py-8">
          <Sparkles className="w-10 h-10 text-teal-400 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">All caught up! No pending actions.</p>
          <Link
            href="/admin/content-studio"
            className="inline-block mt-4 px-5 py-3 min-h-[48px] bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-600 transition-colors"
          >
            Create New Content
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">Action Center</h2>
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
