'use client';

import { Send, Eye, Trophy, Calendar, FileText } from 'lucide-react';

interface PerformanceData {
  postsThisWeek: number;
  viewsThisWeek: number;
  topVideo: { id: string; video_code: string; views_total: number; posted_url?: string } | null;
  upcomingPosts: {
    readyToPost: { id: string; video_code: string }[];
    scheduled: { id: string; title: string; scheduled_for: string; platform: string }[];
  };
  scriptsCount: number;
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: typeof Send;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-sm text-[var(--text-muted)]">{label}</div>
          <div className="text-2xl font-bold text-[var(--text)] tabular-nums">{value}</div>
        </div>
      </div>
    </div>
  );
}

export function PerformanceSnapshot({ data, loading }: { data: PerformanceData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <div className="h-14 bg-[var(--surface2)] rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const upcomingCount = data.upcomingPosts.readyToPost.length + data.upcomingPosts.scheduled.length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={Send}
        label="Posts This Week"
        value={data.postsThisWeek}
        color="bg-teal-500/20 text-teal-400"
      />
      <StatCard
        icon={Eye}
        label="Views This Week"
        value={data.viewsThisWeek.toLocaleString()}
        color="bg-blue-500/20 text-blue-400"
      />
      <StatCard
        icon={Trophy}
        label="Top Video Views"
        value={data.topVideo?.views_total?.toLocaleString() || '—'}
        color="bg-amber-500/20 text-amber-400"
      />
      <StatCard
        icon={Calendar}
        label="Upcoming Posts"
        value={upcomingCount}
        color="bg-purple-500/20 text-purple-400"
      />
    </div>
  );
}
