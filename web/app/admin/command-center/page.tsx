'use client';

/**
 * Mission Control — Glance Dashboard
 *
 * The 2-second-glance landing. Three zones, top to bottom:
 *   1. Strip   — money in/out/net today, tasks shipped/in-flight/needs-you
 *   2. Agents  — one card per active agent, weekly ROI + sparkline
 *   3. Plate   — operator feed (Bolt-relayed emails/calendar/approvals/flags)
 *
 * The old dense operator console moved to /admin/command-center/deep.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Activity, Zap, Bot, AlertCircle,
  Mail, Calendar as CalendarIcon, Check, X, ChevronRight, RefreshCw,
  DollarSign, Package, Bell, Flag, Info, ArrowRight, Layers,
} from 'lucide-react';
import CCSubnav from './_components/CCSubnav';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StripZone {
  money_in_today_cents: number;
  money_out_today_cents: number;
  net_today_cents: number;
  tasks_shipped_today: number;
  tasks_in_flight: number;
  tasks_needing_you: number;
}

interface AgentCard {
  agent_id: string;
  current_task: string | null;
  current_task_id: string | null;
  status: 'producing' | 'idle' | 'stale' | 'failing' | 'offline';
  tasks_done_week: number;
  cost_week_usd: number;
  expected_value_week_usd: number | null;
  realized_value_week_usd: number | null;
  roi_week: number | null;
  cost_sparkline_7d: number[];
}

interface FeedItem {
  id: string;
  kind: 'email' | 'calendar' | 'approval' | 'flag' | 'fyi' | string;
  urgency: 'low' | 'normal' | 'high' | 'urgent' | string;
  title: string;
  one_line: string | null;
  action_url: string | null;
  action_label: string | null;
  lane: string | null;
  source_agent: string | null;
  created_at: string;
}

interface GlanceResponse {
  strip: StripZone;
  agents: AgentCard[];
  plate: FeedItem[];
  generated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(cents: number): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  const abs = Math.abs(dollars);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function usdExact(dollars: number): string {
  const sign = dollars < 0 ? '-' : '';
  const abs = Math.abs(dollars);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

function timeAgo(ts: string): string {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const KIND_META: Record<string, { icon: typeof Mail; accent: string }> = {
  email: { icon: Mail, accent: 'text-blue-400' },
  calendar: { icon: CalendarIcon, accent: 'text-violet-400' },
  approval: { icon: Check, accent: 'text-amber-400' },
  flag: { icon: Flag, accent: 'text-rose-400' },
  fyi: { icon: Info, accent: 'text-zinc-400' },
};

const URGENCY_BG: Record<string, string> = {
  urgent: 'border-rose-500/40 bg-rose-500/[0.06]',
  high: 'border-amber-500/40 bg-amber-500/[0.05]',
  normal: 'border-zinc-800 bg-zinc-900/50',
  low: 'border-zinc-800/60 bg-zinc-900/30',
};

// ── Sparkline (pure SVG, no deps) ─────────────────────────────────────────────

function Sparkline({ values }: { values: number[] }) {
  const w = 60;
  const h = 20;
  const max = Math.max(...values, 0.0001);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="text-zinc-500" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GlanceDashboard() {
  const [data, setData] = useState<GlanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/command-center/glance', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setError(false);
      } else if (res.status === 404) {
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
    const id = setInterval(fetchData, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, [fetchData]);

  async function handleFeedAction(id: string, action: 'dismiss' | 'acted') {
    setBusy(id);
    try {
      await fetch('/api/mc/operator-feed', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      await fetchData();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <CCSubnav />
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <Activity className="w-5 h-5 animate-spin mr-2" />
          Loading...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <CCSubnav />
        <div className="text-center py-20 text-zinc-500 space-y-2">
          <AlertCircle className="w-6 h-6 mx-auto" />
          <div>Glance is warming up. Apply the latest migration and refresh.</div>
        </div>
      </div>
    );
  }

  const { strip, agents, plate } = data;
  const netPositive = strip.net_today_cents >= 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      <CCSubnav />

      {/* ── Zone 1: The Strip ────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StripCell
          label="In today"
          value={usd(strip.money_in_today_cents)}
          accent="emerald"
          icon={TrendingUp}
        />
        <StripCell
          label="Out today"
          value={usd(strip.money_out_today_cents)}
          accent="rose"
          icon={TrendingDown}
        />
        <StripCell
          label="Net today"
          value={usd(strip.net_today_cents)}
          accent={netPositive ? 'emerald' : 'rose'}
          icon={DollarSign}
          emphasize
        />
        <StripCell
          label="Shipped"
          value={`${strip.tasks_shipped_today}`}
          accent="blue"
          icon={Package}
        />
        <StripCell
          label="In flight"
          value={`${strip.tasks_in_flight}`}
          accent="violet"
          icon={Activity}
        />
        <StripCell
          label="Needs you"
          value={`${strip.tasks_needing_you}`}
          accent={strip.tasks_needing_you > 0 ? 'amber' : 'zinc'}
          icon={Bell}
          emphasize={strip.tasks_needing_you > 0}
        />
      </section>

      {/* ── Zone 3: On Your Plate (rendered before agents so it's above the fold) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            On your plate
            <span className="text-xs text-zinc-600">({plate.length})</span>
          </h2>
          <button
            type="button"
            onClick={fetchData}
            className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {plate.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center">
            <Check className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
            <div className="text-sm text-zinc-400">Nothing on your plate. Go do something else.</div>
          </div>
        ) : (
          <div className="grid gap-2">
            {plate.map((item) => {
              const meta = KIND_META[item.kind] || KIND_META.fyi;
              const Icon = meta.icon;
              const isBusy = busy === item.id;
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3 flex items-start gap-3 ${URGENCY_BG[item.urgency] || URGENCY_BG.normal}`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${meta.accent}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-100 truncate">{item.title}</span>
                      {item.urgency !== 'normal' && (
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          item.urgency === 'urgent' ? 'bg-rose-500/20 text-rose-300' :
                          item.urgency === 'high' ? 'bg-amber-500/20 text-amber-300' :
                          'bg-zinc-800 text-zinc-500'
                        }`}>{item.urgency}</span>
                      )}
                      {item.lane && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">{item.lane}</span>
                      )}
                    </div>
                    {item.one_line && (
                      <div className="text-xs text-zinc-500 mt-0.5 truncate">{item.one_line}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-600">
                      {item.source_agent && <span>via {item.source_agent}</span>}
                      <span>· {timeAgo(item.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {item.action_url && (
                      <a
                        href={item.action_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300 hover:bg-blue-500/20 inline-flex items-center gap-1"
                        onClick={() => handleFeedAction(item.id, 'acted')}
                      >
                        {item.action_label || 'Open'} <ArrowRight className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleFeedAction(item.id, 'acted')}
                      disabled={isBusy}
                      className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
                      aria-label="Mark done"
                      title="Mark as handled"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFeedAction(item.id, 'dismiss')}
                      disabled={isBusy}
                      className="p-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
                      aria-label="Dismiss"
                      title="Dismiss (not relevant)"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Zone 2: Agent Scoreboard ────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Bot className="w-4 h-4 text-violet-400" />
            Agents · this week
            <span className="text-xs text-zinc-600">({agents.length})</span>
          </h2>
          <Link
            href="/admin/command-center/agents"
            className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
          >
            Full agent view <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {agents.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center text-sm text-zinc-500">
            No active agents this week.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map((a) => <AgentTile key={a.agent_id} agent={a} />)}
          </div>
        )}
      </section>

      {/* ── Footer: link to deep view ───────────────────────────────────── */}
      <div className="pt-4 border-t border-zinc-800/50 text-center">
        <Link
          href="/admin/command-center/deep"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
        >
          <Layers className="w-3 h-3" /> Deep operator view
        </Link>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

const ACCENT_CLASSES: Record<string, { text: string; border: string; bg: string }> = {
  emerald: { text: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/[0.04]' },
  rose:    { text: 'text-rose-400',    border: 'border-rose-500/20',    bg: 'bg-rose-500/[0.04]' },
  amber:   { text: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'bg-amber-500/[0.05]' },
  blue:    { text: 'text-blue-400',    border: 'border-blue-500/20',    bg: 'bg-blue-500/[0.04]' },
  violet:  { text: 'text-violet-400',  border: 'border-violet-500/20',  bg: 'bg-violet-500/[0.04]' },
  zinc:    { text: 'text-zinc-400',    border: 'border-zinc-800',       bg: 'bg-zinc-900/40' },
};

function StripCell({
  label,
  value,
  accent,
  icon: Icon,
  emphasize,
}: {
  label: string;
  value: string;
  accent: keyof typeof ACCENT_CLASSES;
  icon: typeof Mail;
  emphasize?: boolean;
}) {
  const c = ACCENT_CLASSES[accent];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-3`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{label}</span>
        <Icon className={`w-3.5 h-3.5 ${c.text}`} />
      </div>
      <div className={`font-bold ${emphasize ? 'text-2xl' : 'text-xl'} ${c.text}`}>{value}</div>
    </div>
  );
}

function AgentTile({ agent }: { agent: AgentCard }) {
  const statusStyles: Record<string, string> = {
    producing: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    idle:      'bg-zinc-800 text-zinc-500 border-zinc-700',
    stale:     'bg-amber-500/10 text-amber-400 border-amber-500/30',
    failing:   'bg-rose-500/10 text-rose-400 border-rose-500/30',
    offline:   'bg-zinc-900 text-zinc-600 border-zinc-800',
  };

  const hasRoi = agent.roi_week != null;
  const roiStr = hasRoi
    ? (agent.roi_week! >= 0 ? `${agent.roi_week!.toFixed(1)}x` : 'loss')
    : null;

  return (
    <Link
      href={`/admin/command-center/agents?agent=${encodeURIComponent(agent.agent_id)}`}
      className="block rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-zinc-700 hover:bg-zinc-900/70 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-zinc-200 truncate">{agent.agent_id}</span>
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusStyles[agent.status] || statusStyles.idle}`}>
          {agent.status}
        </span>
      </div>

      <div className="flex items-end justify-between mb-3">
        <div>
          {hasRoi ? (
            <>
              <div className={`text-2xl font-bold ${agent.roi_week! >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {roiStr}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">ROI · week</div>
            </>
          ) : (
            <>
              <div className="text-sm text-zinc-500 italic">ROI pending</div>
              <div className="text-[10px] text-zinc-600">Bolt hasn&apos;t set task values yet</div>
            </>
          )}
        </div>
        <Sparkline values={agent.cost_sparkline_7d} />
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-400 border-t border-zinc-800/50 pt-2">
        <span>{agent.tasks_done_week} done</span>
        <span>{usdExact(agent.cost_week_usd)} spent</span>
      </div>

      {agent.current_task && (
        <div className="text-[11px] text-zinc-500 mt-2 truncate">
          <Zap className="w-3 h-3 inline mr-1" />
          {agent.current_task}
        </div>
      )}
    </Link>
  );
}
