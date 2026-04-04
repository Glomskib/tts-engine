'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, CheckCircle, AlertTriangle, XCircle, Circle,
  Rocket, Server, Clock, CreditCard, HardDrive, Video,
  Bot, BarChart3, Radar, Zap, LogIn, FileText,
  FolderOpen, Clapperboard,
} from 'lucide-react';

// ── Types (subset of system-status response) ────────────────────────

type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'not_configured';
type Severity = 'healthy' | 'degraded' | 'critical' | 'unknown';

interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latency?: number;
  message?: string;
  details?: string;
}

interface CronFreshness {
  job: string;
  label: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  recentFailures: number;
  severity: Severity;
  message: string;
}

interface JobQueueHealth {
  pending: number;
  running: number;
  failed24h: number;
  oldestPendingAge: string | null;
  severity: Severity;
  message: string;
}

interface WorkflowHealthReport {
  overallSeverity: Severity;
  cronFreshness: CronFreshness[];
  jobQueue: JobQueueHealth;
  warnings: string[];
}

interface MetricsSystemHealth {
  lastSnapshot: string | null;
  totalSnapshots: number;
  postsWithMetrics: number;
  postsWithoutMetrics: number;
}

interface EnvBootStatus {
  env_ok: boolean;
  required_present: number;
  required_total: number;
  integrations: { system: string; configured: boolean; missing: string[] }[];
}

interface SystemStatusData {
  ok: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  envBoot?: EnvBootStatus;
  services: ServiceCheck[];
  pipeline: { stuckRendering: number; stuckReview: number; failedLast24h: number };
  usage: { totalUsers: number; activeThisWeek: number; creditsConsumedToday: number };
  metricsSystem?: MetricsSystemHealth;
  workflowHealth?: WorkflowHealthReport;
  totalLatency: number;
  timestamp: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function statusIcon(s: ServiceStatus | Severity | 'pass' | 'fail' | 'pending') {
  switch (s) {
    case 'healthy':
    case 'pass':
      return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />;
    case 'degraded':
      return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
    case 'unhealthy':
    case 'critical':
    case 'fail':
      return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
    case 'not_configured':
    case 'unknown':
    case 'pending':
      return <Circle className="h-4 w-4 text-zinc-400 shrink-0" />;
  }
}

function overallBadge(status: string) {
  const map: Record<string, string> = {
    healthy: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    degraded: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    unhealthy: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  return map[status] || 'bg-zinc-100 text-zinc-600';
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

// ── Section card ─────────────────────────────────────────────────────

function Section({
  title,
  icon,
  status,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  status: ServiceStatus | Severity;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-700">
        {icon}
        <h3 className="font-medium text-sm">{title}</h3>
        <span className="ml-auto">{statusIcon(status)}</span>
      </div>
      <div className="px-4 py-3 text-sm space-y-1">{children}</div>
    </div>
  );
}

// ── Smoke test checklist ─────────────────────────────────────────────

interface SmokeTest {
  id: string;
  label: string;
  icon: React.ReactNode;
  steps: string;
}

const SMOKE_TESTS: SmokeTest[] = [
  {
    id: 'signup',
    label: 'Signup / Login',
    icon: <LogIn className="h-4 w-4" />,
    steps: 'Create account with test email, verify redirect to onboarding, check Supabase auth row',
  },
  {
    id: 'script',
    label: 'Script Generation',
    icon: <FileText className="h-4 w-4" />,
    steps: 'Select product, pick persona, generate skit, confirm skit renders in UI and deducts credit',
  },
  {
    id: 'stripe',
    label: 'Stripe Checkout',
    icon: <CreditCard className="h-4 w-4" />,
    steps: 'Click upgrade, complete test checkout (4242…), verify webhook fires and plan activates',
  },
  {
    id: 'drive',
    label: 'Drive Connect + Poll',
    icon: <FolderOpen className="h-4 w-4" />,
    steps: 'Connect Google Drive, select folder, upload test video, wait for next poll, confirm intake event',
  },
  {
    id: 'tiktok',
    label: 'TikTok Draft Export',
    icon: <Clapperboard className="h-4 w-4" />,
    steps: 'From a completed video, hit "Send to TikTok", verify draft appears in TikTok inbox',
  },
];

// ── Main page ────────────────────────────────────────────────────────

export default function LaunchCheckPage() {
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [smokeResults, setSmokeResults] = useState<Record<string, 'pass' | 'fail' | 'pending'>>(() =>
    Object.fromEntries(SMOKE_TESTS.map((t) => [t.id, 'pending' as const])),
  );

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/system-status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Helper to find a service by name
  const svc = (name: string): ServiceCheck | undefined =>
    data?.services.find((s) => s.name === name);

  // Cron freshness lookup
  const cronStatus = (job: string): CronFreshness | undefined =>
    data?.workflowHealth?.cronFreshness.find((c) => c.job === job);

  // Derive section statuses
  const envStatus: ServiceStatus = data?.envBoot?.env_ok ? 'healthy' : 'unhealthy';
  const stripeStatus = svc('Stripe')?.status ?? 'not_configured';
  const driveIntegration = data?.envBoot?.integrations.find((i) => i.system === 'Google Drive');
  const driveStatus: ServiceStatus = driveIntegration?.configured ? 'healthy' : 'not_configured';
  const tiktokStatus = svc('TikTok Content')?.status ?? 'not_configured';
  const openclawStatus = svc('OpenClaw')?.status ?? 'not_configured';
  const queueHealth = data?.workflowHealth?.jobQueue;
  const queueStatus: Severity = queueHealth?.severity ?? 'unknown';

  // Cron health: aggregate from key crons
  const keyCrons = [
    'process-jobs', 'check-renders', 'metrics-sync', 'radar-scan',
    'rescore-trends', 'drive-intake-poll', 'process-emails',
  ];
  const cronStatuses = keyCrons.map((c) => cronStatus(c)).filter(Boolean) as CronFreshness[];
  const cronOverall: Severity =
    cronStatuses.some((c) => c.severity === 'critical')
      ? 'critical'
      : cronStatuses.some((c) => c.severity === 'degraded')
        ? 'degraded'
        : cronStatuses.length > 0
          ? 'healthy'
          : 'unknown';

  // Metrics freshness
  const metricsAge = data?.metricsSystem?.lastSnapshot
    ? Date.now() - new Date(data.metricsSystem.lastSnapshot).getTime()
    : null;
  const metricsStatus: Severity =
    metricsAge === null
      ? 'unknown'
      : metricsAge < 3_600_000
        ? 'healthy'
        : metricsAge < 86_400_000
          ? 'degraded'
          : 'critical';

  // Radar: use rescore-trends cron as proxy
  const radarCron = cronStatus('rescore-trends');
  const radarStatus: Severity = radarCron?.severity ?? 'unknown';

  // Count pass/fail/pending
  const smokePass = Object.values(smokeResults).filter((v) => v === 'pass').length;
  const smokeFail = Object.values(smokeResults).filter((v) => v === 'fail').length;
  const smokePending = Object.values(smokeResults).filter((v) => v === 'pending').length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Rocket className="h-6 w-6 text-indigo-500" />
          <div>
            <h1 className="text-xl font-bold">Launch Readiness Check</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Pre-launch verification for operators
            </p>
          </div>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Overall status banner */}
      {data && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${overallBadge(data.status)}`}
        >
          {statusIcon(data.status as ServiceStatus)}
          <span>
            System is <strong>{data.status}</strong>
          </span>
          <span className="ml-auto text-xs font-normal opacity-75">
            {data.totalLatency}ms &middot; {new Date(data.timestamp).toLocaleTimeString()}
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          <XCircle className="h-4 w-4" />
          Failed to load system status: {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* ── Automated checks grid ─────────────────────────────────── */}
      {data && (
        <>
          <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Automated Checks
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Env boot */}
            <Section title="Env Boot" icon={<Server className="h-4 w-4 text-zinc-500" />} status={envStatus}>
              <Row label="Required vars" value={`${data.envBoot?.required_present ?? '?'}/${data.envBoot?.required_total ?? '?'}`} ok={data.envBoot?.env_ok} />
              {data.envBoot?.integrations
                .filter((i) => !i.configured)
                .slice(0, 4)
                .map((i) => (
                  <Row key={i.system} label={i.system} value={`missing: ${i.missing.join(', ')}`} ok={false} />
                ))}
              {data.envBoot?.integrations.filter((i) => !i.configured).length === 0 && (
                <Row label="All integrations" value="configured" ok />
              )}
            </Section>

            {/* 2. Cron health */}
            <Section title="Cron Health" icon={<Clock className="h-4 w-4 text-zinc-500" />} status={cronOverall}>
              {cronStatuses.length === 0 && <p className="text-zinc-400">No cron data</p>}
              {cronStatuses.map((c) => (
                <Row key={c.job} label={c.job} value={timeAgo(c.lastRunAt)} ok={c.severity === 'healthy'} />
              ))}
            </Section>

            {/* 3. Stripe */}
            <Section title="Stripe" icon={<CreditCard className="h-4 w-4 text-zinc-500" />} status={stripeStatus}>
              <Row label="API" value={svc('Stripe')?.message ?? 'Connected'} ok={stripeStatus === 'healthy'} />
              {svc('Stripe')?.latency != null && (
                <Row label="Latency" value={`${svc('Stripe')!.latency}ms`} ok />
              )}
            </Section>

            {/* 4. Google Drive */}
            <Section title="Google Drive" icon={<HardDrive className="h-4 w-4 text-zinc-500" />} status={driveStatus}>
              <Row label="Config" value={driveIntegration?.configured ? 'Ready' : `Missing: ${driveIntegration?.missing.join(', ')}`} ok={driveIntegration?.configured} />
              {(() => {
                const driveCron = cronStatus('drive-intake-poll');
                return driveCron ? (
                  <Row label="Last poll" value={timeAgo(driveCron.lastRunAt)} ok={driveCron.severity === 'healthy'} />
                ) : null;
              })()}
            </Section>

            {/* 5. TikTok */}
            <Section title="TikTok" icon={<Video className="h-4 w-4 text-zinc-500" />} status={tiktokStatus}>
              <Row label="Connections" value={svc('TikTok Content')?.details ?? svc('TikTok Content')?.message ?? '—'} ok={tiktokStatus === 'healthy'} />
              {svc('TikTok Content')?.latency != null && (
                <Row label="Latency" value={`${svc('TikTok Content')!.latency}ms`} ok />
              )}
            </Section>

            {/* 6. OpenClaw */}
            <Section title="OpenClaw" icon={<Bot className="h-4 w-4 text-zinc-500" />} status={openclawStatus}>
              <Row label="Status" value={svc('OpenClaw')?.message ?? 'Connected'} ok={openclawStatus === 'healthy'} />
            </Section>

            {/* 7. Queue health */}
            <Section title="Queue Health" icon={<Zap className="h-4 w-4 text-zinc-500" />} status={queueStatus}>
              {queueHealth ? (
                <>
                  <Row label="Pending" value={String(queueHealth.pending)} ok={queueHealth.pending < 50} />
                  <Row label="Running" value={String(queueHealth.running)} ok />
                  <Row label="Failed 24h" value={String(queueHealth.failed24h)} ok={queueHealth.failed24h === 0} />
                </>
              ) : (
                <p className="text-zinc-400">No queue data</p>
              )}
            </Section>

            {/* 8. Metrics freshness */}
            <Section title="Metrics Freshness" icon={<BarChart3 className="h-4 w-4 text-zinc-500" />} status={metricsStatus}>
              <Row
                label="Last snapshot"
                value={timeAgo(data.metricsSystem?.lastSnapshot ?? null)}
                ok={metricsStatus === 'healthy'}
              />
              <Row
                label="Posts with metrics"
                value={`${data.metricsSystem?.postsWithMetrics ?? 0}/${(data.metricsSystem?.postsWithMetrics ?? 0) + (data.metricsSystem?.postsWithoutMetrics ?? 0)}`}
                ok
              />
            </Section>

            {/* 9. Radar freshness */}
            <Section title="Radar Freshness" icon={<Radar className="h-4 w-4 text-zinc-500" />} status={radarStatus}>
              <Row label="rescore-trends" value={timeAgo(radarCron?.lastRunAt ?? null)} ok={radarStatus === 'healthy'} />
              {(() => {
                const scanCron = cronStatus('radar-scan');
                return scanCron ? (
                  <Row label="radar-scan" value={timeAgo(scanCron.lastRunAt)} ok={scanCron.severity === 'healthy'} />
                ) : null;
              })()}
            </Section>
          </div>

          {/* Pipeline summary */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 px-4 py-3">
            <h3 className="text-sm font-medium mb-2">Pipeline</h3>
            <div className="flex gap-6 text-sm">
              <span className="flex items-center gap-1.5">
                {statusIcon(data.pipeline.stuckRendering === 0 ? 'healthy' : 'unhealthy')}
                Stuck rendering: {data.pipeline.stuckRendering}
              </span>
              <span className="flex items-center gap-1.5">
                {statusIcon(data.pipeline.stuckReview <= 5 ? 'healthy' : 'degraded')}
                Stuck review: {data.pipeline.stuckReview}
              </span>
              <span className="flex items-center gap-1.5">
                {statusIcon(data.pipeline.failedLast24h === 0 ? 'healthy' : 'degraded')}
                Failed 24h: {data.pipeline.failedLast24h}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Manual smoke test checklist ───────────────────────────── */}
      <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pt-2">
        Manual Smoke Tests
      </h2>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-700">
        {SMOKE_TESTS.map((test) => {
          const result = smokeResults[test.id];
          return (
            <div key={test.id} className="flex items-start gap-3 px-4 py-3">
              <span className="pt-0.5">{statusIcon(result)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {test.icon}
                  <span className="font-medium text-sm">{test.label}</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{test.steps}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setSmokeResults((p) => ({ ...p, [test.id]: 'pass' }))}
                  className={`px-2 py-1 text-xs rounded border ${
                    result === 'pass'
                      ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400'
                      : 'border-zinc-200 dark:border-zinc-600 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  Pass
                </button>
                <button
                  onClick={() => setSmokeResults((p) => ({ ...p, [test.id]: 'fail' }))}
                  className={`px-2 py-1 text-xs rounded border ${
                    result === 'fail'
                      ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400'
                      : 'border-zinc-200 dark:border-zinc-600 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  Fail
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Smoke test summary */}
      <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1">
          <CheckCircle className="h-3.5 w-3.5 text-green-500" /> {smokePass} passed
        </span>
        <span className="flex items-center gap-1">
          <XCircle className="h-3.5 w-3.5 text-red-500" /> {smokeFail} failed
        </span>
        <span className="flex items-center gap-1">
          <Circle className="h-3.5 w-3.5 text-zinc-400" /> {smokePending} pending
        </span>
      </div>

      {/* Footer */}
      <p className="text-xs text-zinc-400 dark:text-zinc-500 pt-4 border-t border-zinc-100 dark:border-zinc-800">
        Data sourced from <code>/api/admin/system-status</code>. Automated checks refresh on load.
        Manual smoke tests are session-only (not persisted).
      </p>
    </div>
  );
}

// ── Row helper ───────────────────────────────────────────────────────

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok != null && (
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      )}
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="ml-auto text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}
