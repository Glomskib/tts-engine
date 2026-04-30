import { Calendar, Megaphone } from 'lucide-react';
import type { MmmSocialPost } from '@/lib/command-center/mmm/types';
import { Card, StatusPill } from './Section';

export function SocialQueue({ posts }: { posts: MmmSocialPost[] }) {
  if (posts.length === 0) {
    return (
      <Card>
        <div className="text-sm text-zinc-500 mb-2">
          No MMM social posts queued in <code className="text-zinc-400">marketing_posts</code> yet.
        </div>
        <div className="text-xs text-zinc-500">
          Add posts via{' '}
          <code className="text-teal-400">
            npx tsx scripts/marketing/publish-mmm-calendar.ts --file content/social/mmm_apr_may_2026_calendar.md
          </code>
          {' '}or by inserting rows directly. The April/May calendar is checked into the repo.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {posts.slice(0, 12).map((p) => (
        <PostRow key={p.id} post={p} />
      ))}
      {posts.length > 12 ? (
        <div className="text-[11px] text-zinc-600 italic">
          +{posts.length - 12} more — see the marketing tools for the full queue
        </div>
      ) : null}
    </div>
  );
}

function PostRow({ post }: { post: MmmSocialPost }) {
  const date = post.scheduled_for ? new Date(post.scheduled_for) : null;
  return (
    <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-2 text-xs text-zinc-400 min-w-0">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          {date ? <span>{date.toLocaleString()}</span> : <span>Unscheduled</span>}
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:flex items-center gap-1">
            <Megaphone className="w-3 h-3" />
            {post.platforms.join(', ') || '—'}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <StatusPill
            label={post.status}
            tone={post.status === 'published' ? 'emerald' : post.status === 'failed' ? 'rose' : 'blue'}
          />
          {post.source === 'agent' ? <StatusPill label="agent-draft" tone="violet" /> : null}
          {post.approval_state === 'pending' ? (
            <StatusPill label="needs approval" tone="amber" />
          ) : null}
        </div>
      </div>
      <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3 whitespace-pre-line">
        {post.content}
      </p>
      {post.tags.length > 0 ? (
        <div className="text-[10px] text-zinc-500 mt-1.5">
          {post.tags.map((t) => `#${t}`).join(' ')}
        </div>
      ) : null}
    </div>
  );
}
