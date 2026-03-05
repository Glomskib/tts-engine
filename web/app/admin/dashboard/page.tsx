'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ActionCenter } from '@/components/dashboard/ActionCenter';
import { PipelineOverview } from '@/components/dashboard/PipelineOverview';
import { TodayAssignments } from '@/components/dashboard/TodayAssignments';
import { WinnersPanel } from '@/components/dashboard/WinnersPanel';
import { QuickTools } from '@/components/dashboard/QuickTools';

interface DashboardData {
  nextActions: Array<{
    action: string;
    video: { id: string; title: string; product: string | null; status: string };
  }>;
  pipelineCounts: {
    draft: number;
    needs_edit: number;
    ready_to_post: number;
    posted: number;
    failed: number;
    total: number;
    recording: { not_recorded: number; recorded: number; ai_rendering: number; edited: number };
    posted_this_week: number;
  };
  todayAssignments: Array<{
    id: string;
    title: string;
    product: string | null;
    brand: string | null;
    status: string;
    recording_status: string | null;
    nextAction: string;
  }>;
  winners: Array<{
    id: string;
    hook: string | null;
    view_count: number | null;
    content_format: string | null;
    product_category: string | null;
  }>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/dashboard');
        const json = await res.json();
        if (json.ok) {
          setData(json);
          setError(null);
        } else {
          setError(json.error || 'Failed to load dashboard');
        }
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const userName = user?.email?.split('@')[0] || '';

  if (loading) {
    return (
      <div className="pt-6 pb-24 lg:pb-8 max-w-5xl mx-auto px-4 space-y-6">
        <div>
          <div className="h-8 w-64 bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-4 w-48 bg-zinc-800/50 rounded mt-2 animate-pulse" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-zinc-900/50 border border-white/10 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-6 pb-24 lg:pb-8 max-w-5xl mx-auto px-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => { setLoading(true); setError(null); window.location.reload(); }}
            className="mt-3 px-4 py-2 min-h-[44px] bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="pt-6 pb-24 lg:pb-8 max-w-5xl mx-auto px-4 space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">
          {userName ? `What's next, ${userName}?` : "What's next?"}
        </h1>
        <p className="text-zinc-500 text-sm mt-1">Your content command center</p>
      </div>

      {/* 1. Action Center */}
      <ActionCenter actions={data.nextActions} />

      {/* 2. Production Pipeline */}
      <PipelineOverview counts={data.pipelineCounts} />

      {/* 3. Today's Assignments */}
      <TodayAssignments assignments={data.todayAssignments} />

      {/* 4. Winning Content */}
      <WinnersPanel winners={data.winners} />

      {/* 5. Quick Tools */}
      <QuickTools />
    </div>
  );
}
