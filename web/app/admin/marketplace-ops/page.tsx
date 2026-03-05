"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Clock,
  Users,
  CheckCircle,
  TrendingUp,
  DollarSign,
  RotateCcw,
  Unlock,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

interface QueueHealth {
  queued: number;
  claimed: number;
  in_progress: number;
  submitted: number;
  stalled: number;
  overdue: number;
}

interface EditorStats {
  editor_id: string;
  display_name: string;
  completed_7d: number;
  completed_30d: number;
  avg_turnaround_hours: number | null;
}

interface Throughput {
  avg_claim_time_hours: number | null;
  avg_submit_time_hours: number | null;
  completed_7d: number;
  completed_30d: number;
  jobs_per_editor: EditorStats[];
}

interface TierRow {
  tier: string;
  label: string;
  active_count: number;
  price_usd: number;
  monthly_revenue: number;
}

interface TierRevenue {
  tiers: TierRow[];
  total_mrr: number;
}

interface StalledJob {
  id: string;
  script_id: string;
  client_code: string;
  script_title: string;
  claimed_by: string | null;
  due_at: string | null;
  last_heartbeat_at: string | null;
  stalled_minutes: number | null;
}

interface OpsData {
  ok: boolean;
  queue_health: QueueHealth;
  throughput: Throughput;
  tier_revenue: TierRevenue;
  stalled_jobs: StalledJob[];
  total_stalled: number;
  total_active_jobs: number;
  total_overdue: number;
}

// ── Page ───────────────────────────────────────────────────

export default function MarketplaceOpsPage() {
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);

  // Force unclaim form state
  const [forceJobId, setForceJobId] = useState("");
  const [forceReason, setForceReason] = useState("");

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/marketplace/ops", {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.ok) setData(json as OpsData);
      setLastRefresh(new Date());
    } catch {
      // network error — keep stale data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  async function executeAction(
    action: "force_unclaim" | "requeue_stalled",
    jobId: string,
    reason: string,
  ) {
    if (
      !confirm(
        `Are you sure you want to ${action.replace("_", " ")} job ${jobId.slice(0, 8)}...?`,
      )
    )
      return;

    setActionPending(jobId);
    try {
      const res = await fetch("/api/admin/marketplace/ops/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, job_id: jobId, reason }),
      });
      const json = await res.json();
      if (!json.ok) {
        alert(`Action failed: ${json.message || json.error}`);
      }
      await fetchData();
    } catch {
      alert("Network error — check console");
    } finally {
      setActionPending(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-zinc-500">
        Failed to load ops data
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-teal-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Marketplace Ops</h1>
            <p className="text-xs text-zinc-500">
              {lastRefresh
                ? `Last check: ${lastRefresh.toLocaleTimeString()}`
                : "Loading..."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-zinc-700"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg text-xs hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Section 1 — Queue Health */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Queue Health
        </h2>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Queued"
            value={data.queue_health.queued}
            color="text-blue-400"
            border="border-blue-500/20"
          />
          <StatCard
            label="Claimed"
            value={data.queue_health.claimed}
            color="text-cyan-400"
            border="border-cyan-500/20"
          />
          <StatCard
            label="In Progress"
            value={data.queue_health.in_progress}
            color="text-teal-400"
            border="border-teal-500/20"
          />
          <StatCard
            label="Submitted"
            value={data.queue_health.submitted}
            color="text-green-400"
            border="border-green-500/20"
          />
          <StatCard
            label="Stalled"
            value={data.queue_health.stalled}
            color={
              data.queue_health.stalled > 0 ? "text-red-400" : "text-zinc-500"
            }
            border={
              data.queue_health.stalled > 0
                ? "border-red-500/20"
                : "border-zinc-800"
            }
          />
          <StatCard
            label="Overdue"
            value={data.queue_health.overdue}
            color={
              data.queue_health.overdue > 0
                ? "text-yellow-400"
                : "text-zinc-500"
            }
            border={
              data.queue_health.overdue > 0
                ? "border-yellow-500/20"
                : "border-zinc-800"
            }
          />
        </div>
      </div>

      {/* Section 2 — Throughput Metrics */}
      <div className="mb-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Throughput
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase">
              Avg Claim Time
            </div>
            <div className="text-2xl font-bold text-white">
              {data.throughput.avg_claim_time_hours != null
                ? `${data.throughput.avg_claim_time_hours}h`
                : "N/A"}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase">
              Avg Edit Time
            </div>
            <div className="text-2xl font-bold text-white">
              {data.throughput.avg_submit_time_hours != null
                ? `${data.throughput.avg_submit_time_hours}h`
                : "N/A"}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase">
              Completed (7d)
            </div>
            <div className="text-2xl font-bold text-green-400">
              {data.throughput.completed_7d}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase">
              Completed (30d)
            </div>
            <div className="text-2xl font-bold text-zinc-300">
              {data.throughput.completed_30d}
            </div>
          </div>
        </div>

        {/* Editor leaderboard */}
        {data.throughput.jobs_per_editor.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-zinc-500 mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Editor Leaderboard
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800">
                    <th className="text-left py-2 pr-4 font-medium">Editor</th>
                    <th className="text-right py-2 px-3 font-medium">
                      7d
                    </th>
                    <th className="text-right py-2 px-3 font-medium">
                      30d
                    </th>
                    <th className="text-right py-2 pl-3 font-medium">
                      Avg Turnaround
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.throughput.jobs_per_editor.map((e) => (
                    <tr
                      key={e.editor_id}
                      className="border-b border-zinc-800/50"
                    >
                      <td className="py-2 pr-4 text-zinc-300">
                        {e.display_name}
                      </td>
                      <td className="py-2 px-3 text-right text-white font-medium">
                        {e.completed_7d}
                      </td>
                      <td className="py-2 px-3 text-right text-zinc-400">
                        {e.completed_30d}
                      </td>
                      <td className="py-2 pl-3 text-right text-zinc-400">
                        {e.avg_turnaround_hours != null
                          ? `${e.avg_turnaround_hours}h`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Section 3 — Tier Revenue */}
      <div className="mb-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Tier Revenue
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-2 pr-4 font-medium">Tier</th>
                <th className="text-right py-2 px-3 font-medium">Active</th>
                <th className="text-right py-2 px-3 font-medium">
                  Price (USD)
                </th>
                <th className="text-right py-2 pl-3 font-medium">MRR</th>
              </tr>
            </thead>
            <tbody>
              {data.tier_revenue.tiers.map((t) => (
                <tr key={t.tier} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 text-zinc-300">{t.label}</td>
                  <td className="py-2 px-3 text-right text-white font-medium">
                    {t.active_count}
                  </td>
                  <td className="py-2 px-3 text-right text-zinc-400">
                    ${t.price_usd.toLocaleString()}
                  </td>
                  <td className="py-2 pl-3 text-right text-zinc-400">
                    ${t.monthly_revenue.toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-zinc-700">
                <td
                  colSpan={3}
                  className="py-2 pr-4 text-right text-zinc-300 font-semibold"
                >
                  Total MRR
                </td>
                <td className="py-2 pl-3 text-right text-teal-400 font-bold">
                  ${data.tier_revenue.total_mrr.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4 — Stalled Jobs + Actions */}
      <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          Stalled Jobs ({data.total_stalled})
        </h2>

        {data.stalled_jobs.length > 0 ? (
          <div className="space-y-2 mb-6">
            {data.stalled_jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 bg-red-500/5 border border-red-500/20 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-300 font-mono truncate">
                      {job.script_title || job.id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">
                      {job.client_code}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {job.stalled_minutes != null
                      ? `${job.stalled_minutes}m stalled`
                      : "Unknown"}{" "}
                    {job.claimed_by
                      ? `· Editor: ${job.claimed_by.slice(0, 8)}`
                      : ""}
                  </div>
                </div>
                <button
                  onClick={() =>
                    executeAction(
                      "requeue_stalled",
                      job.id,
                      "Stalled job requeued via admin dashboard",
                    )
                  }
                  disabled={actionPending === job.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors disabled:opacity-50 ml-3 shrink-0"
                >
                  {actionPending === job.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  Requeue
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-green-400 mb-6">
            <CheckCircle className="w-4 h-4" />
            No stalled jobs
          </div>
        )}

        {/* Force Unclaim */}
        <div className="border-t border-zinc-800 pt-4">
          <h3 className="text-xs font-medium text-zinc-500 mb-2 flex items-center gap-1.5">
            <Unlock className="w-3.5 h-3.5" />
            Force Unclaim Job
          </h3>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-0">
              <label className="text-[10px] text-zinc-600 block mb-1">
                Job ID
              </label>
              <input
                type="text"
                value={forceJobId}
                onChange={(e) => setForceJobId(e.target.value)}
                placeholder="paste job UUID"
                className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/50"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-[10px] text-zinc-600 block mb-1">
                Reason
              </label>
              <input
                type="text"
                value={forceReason}
                onChange={(e) => setForceReason(e.target.value)}
                placeholder="why are you unclaiming?"
                className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500/50"
              />
            </div>
            <button
              onClick={() => {
                if (!forceJobId.trim() || !forceReason.trim()) {
                  alert("Job ID and reason are required");
                  return;
                }
                executeAction(
                  "force_unclaim",
                  forceJobId.trim(),
                  forceReason.trim(),
                );
                setForceJobId("");
                setForceReason("");
              }}
              disabled={!!actionPending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-yellow-500/10 text-yellow-400 rounded-lg text-xs hover:bg-yellow-500/20 transition-colors disabled:opacity-50 shrink-0"
            >
              <Unlock className="w-3.5 h-3.5" />
              Force Unclaim
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  border,
}: {
  label: string;
  value: number;
  color: string;
  border: string;
}) {
  return (
    <div className={`p-4 bg-zinc-900/50 border rounded-xl ${border}`}>
      <div className="text-[10px] text-zinc-500 uppercase">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
