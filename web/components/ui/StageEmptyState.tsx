'use client';

import type { UIStage } from '@/lib/ui/stages';

const STAGE_EMPTY: Record<UIStage, { title: string; description: string }> = {
  needs_recording: {
    title: 'No videos to record',
    description: 'When a script is ready, videos will appear here for you to record.',
  },
  needs_editing: {
    title: 'No videos to edit',
    description: 'Once you record a video, it will show up here for editing.',
  },
  ready_to_post: {
    title: 'Nothing ready to post',
    description: 'After editing is approved, videos will be ready to post here.',
  },
  posted: {
    title: 'No posted videos yet',
    description: 'Videos you have posted will appear here so you can track their performance.',
  },
};

interface StageEmptyStateProps {
  stage: UIStage;
}

export function StageEmptyState({ stage }: StageEmptyStateProps) {
  const content = STAGE_EMPTY[stage];
  return (
    <div className="text-center py-16 px-6">
      <p className="text-base font-medium text-zinc-400 mb-2">{content.title}</p>
      <p className="text-sm text-zinc-600 max-w-xs mx-auto">{content.description}</p>
    </div>
  );
}
