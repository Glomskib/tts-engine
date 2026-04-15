'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertTriangle, Activity, Zap } from 'lucide-react';
import { BRAND } from '@/lib/branding';

interface Win {
  title: string;
  completed_at: string;
  proof_summary: string | null;
  lane: string;
}

interface LaneSummary {
  lane: string;
  completed_today: number;
  active: number;
  issues: number;
}

interface ClientData {
  system_status: 'working' | 'needs_attention';
  completed_today: number;
  failed_today: number;
  todays_wins: Win[];
  simple_lane_summary: LaneSummary[];
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ClientDashboard() {
  const [data, setData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/client/summary');
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
        setError(false);
      } else if (res.status === 401) {
        window.location.href = '/login';
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center text-zinc-500">
          <Activity className="w-6 h-6 animate-spin mx-auto mb-3" />
          <div className="text-sm">Loading your dashboard...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center text-zinc-500 space-y-2">
          <Zap className="w-6 h-6 mx-auto" />
          <div className="text-sm">Your system is getting set up</div>
          <div className="text-xs text-zinc-600">Check back soon — we&apos;re configuring your operations.</div>
        </div>
      </div>
    );
  }

  const isEmpty = data.completed_today === 0 && data.todays_wins.length === 0 &&
    data.simple_lane_summary.every(l => l.active === 0 && l.completed_today === 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className={`w-5 h-5 ${BRAND.accentClasses.text}`} />
            <h1 className="text-lg font-semibold">Your Dashboard</h1>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            data.system_status === 'working'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${data.system_status === 'working' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
            {data.system_status === 'working' ? 'System running' : 'Needs attention'}
          </div>
        </div>

        {/* Empty state */}
        {isEmpty && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-10 text-center">
            <Zap className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-zinc-300 mb-1">Your system is getting set up</h2>
            <p className="text-sm text-zinc-600">We&apos;re configuring your operations. Results will appear here as work gets done.</p>
          </div>
        )}

        {/* KPIs */}
        {!isEmpty && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-center">
              <div className="text-3xl font-bold text-emerald-400">{data.completed_today}</div>
              <div className="text-xs text-zinc-500 mt-1">Completed Today</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-center">
              <div className={`text-3xl font-bold ${BRAND.accentClasses.text}`}>
                {data.simple_lane_summary.filter(l => l.active > 0).length}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Active Lanes</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-center">
              <div className="text-3xl font-bold text-zinc-300">
                {data.simple_lane_summary.reduce((s, l) => s + l.issues, 0)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Issues</div>
            </div>
          </div>
        )}

        {/* Today's Wins */}
        {data.todays_wins.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold">Today&apos;s Wins</h2>
              <span className="text-xs px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full">
                {data.todays_wins.length}
              </span>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {data.todays_wins.map((win, i) => (
                <div key={i} className="px-5 py-4 flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 font-medium">{win.title}</div>
                    {win.proof_summary && (
                      <div className="text-xs text-zinc-500 mt-1">{win.proof_summary}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {win.lane && <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">{win.lane}</span>}
                      <span className="text-[10px] text-zinc-600">{timeAgo(win.completed_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lane Summary */}
        {data.simple_lane_summary.some(l => l.completed_today > 0 || l.active > 0 || l.issues > 0) && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
              <Activity className={`w-4 h-4 ${BRAND.accentClasses.text}`} />
              <h2 className="text-sm font-semibold">Operations</h2>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {data.simple_lane_summary.filter(l => l.completed_today > 0 || l.active > 0 || l.issues > 0).map(lane => (
                <div key={lane.lane} className={`px-5 py-3.5 flex items-center gap-4 ${lane.issues > 0 ? 'bg-amber-500/[0.03]' : ''}`}>
                  <span className="text-sm text-zinc-300 flex-1">{lane.lane}</span>
                  <div className="flex items-center gap-4 text-xs">
                    {lane.completed_today > 0 && <span className="text-emerald-400">{lane.completed_today} done</span>}
                    {lane.active > 0 && <span className={BRAND.accentClasses.text}>{lane.active} active</span>}
                    {lane.issues > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <AlertTriangle className="w-3 h-3" />
                        {lane.issues}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-xs text-zinc-600 text-center">
          Auto-refreshes every 30s
        </div>
      </div>
    </div>
  );
}
