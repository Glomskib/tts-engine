'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle, AlertTriangle, Activity, Zap, ArrowRight } from 'lucide-react';
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

interface DemoData {
  system_status: 'working' | 'needs_attention';
  completed_today: number;
  failed_today: number;
  todays_wins: Win[];
  simple_lane_summary: LaneSummary[];
  active_issue?: { lane: string; message: string };
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export default function DemoPage() {
  const [data, setData] = useState<DemoData | null>(null);
  const [visibleWins, setVisibleWins] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/api/public/demo');
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setData(json.data);
      } catch {
        // Silent — auto-refresh will retry
      }
    };
    tick();
    const interval = setInterval(tick, 5_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Animate wins appearing one by one
  useEffect(() => {
    if (!data) return;
    const total = data.todays_wins.length;
    if (visibleWins >= total) return;
    const timer = setTimeout(() => setVisibleWins(v => v + 1), 600);
    return () => clearTimeout(timer);
  }, [data, visibleWins]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={`w-5 h-5 ${BRAND.accentClasses.text}`} />
            <span className="font-semibold text-sm">{BRAND.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 ${BRAND.accentClasses.bg} ${BRAND.accentClasses.text} rounded-full border ${BRAND.accentClasses.border}`}>LIVE DEMO</span>
          </div>
          <Link
            href="/ops"
            className={`flex items-center gap-1.5 px-4 py-2 text-sm ${BRAND.accentClasses.primary} ${BRAND.accentClasses.hover} rounded-lg transition-colors font-medium`}
          >
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* System Status */}
        {data && (
          <div className="text-center space-y-3">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
              data.system_status === 'working'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}>
              <span className={`w-2 h-2 rounded-full ${data.system_status === 'working' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
              {data.system_status === 'working' ? 'System is running' : 'Needs attention'}
            </div>
            <h1 className="text-3xl font-bold text-white">Your business ran today.</h1>
            <p className="text-zinc-400 text-lg">Here&apos;s what happened while you weren&apos;t looking.</p>
          </div>
        )}

        {/* KPI strip */}
        {data && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-center">
              <div className="text-3xl font-bold text-emerald-400">{data.completed_today}</div>
              <div className="text-xs text-zinc-500 mt-1">Completed Today</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-center">
              <div className={`text-3xl font-bold ${BRAND.accentClasses.text}`}>{data.simple_lane_summary.filter(l => l.active > 0).length}</div>
              <div className="text-xs text-zinc-500 mt-1">Active Lanes</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-center">
              <div className="text-3xl font-bold text-zinc-300">{data.simple_lane_summary.reduce((s, l) => s + l.issues, 0)}</div>
              <div className="text-xs text-zinc-500 mt-1">Issues</div>
            </div>
          </div>
        )}

        {/* Today's Wins */}
        {data && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Today&apos;s Wins</h2>
              <span className="text-xs px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full">{data.todays_wins.length}</span>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {data.todays_wins.slice(0, visibleWins).map((win, i) => (
                <div
                  key={i}
                  className="px-5 py-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 font-medium">{win.title}</div>
                    {win.proof_summary && (
                      <div className="text-xs text-zinc-500 mt-1">{win.proof_summary}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">{win.lane}</span>
                      <span className="text-[10px] text-zinc-600">{timeAgo(win.completed_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Issue */}
        {data?.active_issue && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-5 py-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm text-amber-300 font-medium">{data.active_issue.lane}</div>
              <div className="text-xs text-amber-400/70 mt-0.5">{data.active_issue.message}</div>
            </div>
          </div>
        )}

        {/* Lane Summary */}
        {data && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
              <Activity className={`w-4 h-4 ${BRAND.accentClasses.text}`} />
              <h2 className="text-sm font-semibold text-white">Lane Summary</h2>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {data.simple_lane_summary.map(lane => (
                <div key={lane.lane} className="px-5 py-3 flex items-center gap-4">
                  <span className="text-sm text-zinc-300 flex-1">{lane.lane}</span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-emerald-400">{lane.completed_today} done</span>
                    {lane.active > 0 && <span className={BRAND.accentClasses.text}>{lane.active} active</span>}
                    {lane.issues > 0 && <span className="text-amber-400">{lane.issues} issue{lane.issues > 1 ? 's' : ''}</span>}
                    {lane.issues === 0 && lane.active === 0 && lane.completed_today === 0 && (
                      <span className="text-zinc-600">idle</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="text-center space-y-4 py-6">
          <p className="text-zinc-400">This is what your business looks like when it runs itself.</p>
          <Link
            href="/ops"
            className={`inline-flex items-center gap-2 px-6 py-3 ${BRAND.accentClasses.primary} ${BRAND.accentClasses.hover} text-white font-semibold rounded-xl transition-colors text-sm`}
          >
            Get Your System Set Up <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Loading */}
      {!data && (
        <div className="max-w-3xl mx-auto px-6 py-20 text-center text-zinc-500">
          <Activity className="w-6 h-6 animate-spin mx-auto mb-3" />
          <div className="text-sm">Loading demo...</div>
        </div>
      )}
    </div>
  );
}
