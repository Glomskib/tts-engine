'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AdminPageLayout, { AdminCard, AdminButton } from '../../components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import { Shield, Loader2, RefreshCw, Check, X, AlertTriangle, Database, Key, Bot, Zap, Server } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiagnosticCheck {
  name: string;
  status: 'green' | 'yellow' | 'red';
  message: string;
  fix?: string;
}

interface DiagnosticsData {
  checks: DiagnosticCheck[];
  health_score: number;
  total_checks: number;
  passed: number;
  warnings: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a category from the check name returned by the API. */
function categorize(check: DiagnosticCheck): 'environment' | 'database' | 'content' | 'integrations' {
  const n = check.name;
  if (n.startsWith('Env:')) return 'environment';
  if (n.startsWith('Table:') || n === 'Database Connection') return 'database';
  if (n === 'Products Exist' || n === 'Personas Exist') return 'content';
  // API Key, Content Generation, Telegram Bot
  return 'integrations';
}

const CATEGORY_META: Record<
  ReturnType<typeof categorize>,
  { label: string; icon: React.ReactNode }
> = {
  environment: { label: 'Environment', icon: <Server className="w-4 h-4" /> },
  database: { label: 'Database', icon: <Database className="w-4 h-4" /> },
  content: { label: 'Content', icon: <Zap className="w-4 h-4" /> },
  integrations: { label: 'Integrations', icon: <Key className="w-4 h-4" /> },
};

const CATEGORY_ORDER: ReturnType<typeof categorize>[] = [
  'environment',
  'database',
  'content',
  'integrations',
];

/** Map a check name to a "fix" link path when the API provides a fix string. */
function fixLink(check: DiagnosticCheck): string | null {
  const n = check.name;
  if (n.startsWith('Env:')) return '/admin/settings';
  if (n === 'Products Exist') return '/admin/products';
  if (n === 'Personas Exist') return '/admin/audience';
  if (n === 'API Key Configured') return '/admin/settings?tab=api-keys';
  if (n === 'Telegram Bot') return '/admin/settings/telegram';
  if (n === 'Content Generation') return '/admin/settings';
  return null;
}

// ---------------------------------------------------------------------------
// Status icon component
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: DiagnosticCheck['status'] }) {
  if (status === 'green') return <Check className="w-4 h-4 text-emerald-400" />;
  if (status === 'yellow') return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  return <X className="w-4 h-4 text-red-400" />;
}

// ---------------------------------------------------------------------------
// Health score circle
// ---------------------------------------------------------------------------

function HealthCircle({ score }: { score: number }) {
  const scoreColor =
    score >= 80
      ? 'text-emerald-400'
      : score >= 50
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="relative w-32 h-32">
      <svg className="w-32 h-32 transform -rotate-90">
        <circle
          cx="64"
          cy="64"
          r="56"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          className="text-zinc-800"
        />
        <circle
          cx="64"
          cy="64"
          r="56"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          className={scoreColor}
          strokeLinecap="round"
          strokeDasharray={`${score * 3.52} 352`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${scoreColor}`}>
        {score}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DiagnosticsPage() {
  const { showError } = useToast();
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/diagnostics');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Unexpected response');
      setData(json.data as DiagnosticsData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  // Auto-run on mount
  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  // Group checks by category
  const grouped = data
    ? CATEGORY_ORDER.map((cat) => ({
        key: cat,
        ...CATEGORY_META[cat],
        checks: data.checks.filter((c) => categorize(c) === cat),
      })).filter((g) => g.checks.length > 0)
    : [];

  return (
    <AdminPageLayout
      title="Production Diagnostics"
      subtitle="Verify your FlashFlow deployment is healthy and fully configured."
      headerActions={
        <AdminButton
          variant="secondary"
          onClick={runDiagnostics}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Run Diagnostics
        </AdminButton>
      }
    >
      {/* ---------- Loading state ---------- */}
      {loading && !data && (
        <AdminCard>
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-sm text-zinc-400">Running diagnostic checks...</p>
          </div>
        </AdminCard>
      )}

      {/* ---------- Error state ---------- */}
      {error && !data && (
        <AdminCard>
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <X className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-sm text-zinc-300">Failed to run diagnostics</p>
            <p className="text-xs text-zinc-500 max-w-md">{error}</p>
            <AdminButton variant="secondary" size="sm" onClick={runDiagnostics}>
              Retry
            </AdminButton>
          </div>
        </AdminCard>
      )}

      {/* ---------- Results ---------- */}
      {data && (
        <>
          {/* Health overview row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Health score */}
            <AdminCard>
              <div className="flex flex-col items-center justify-center py-4 gap-3">
                <HealthCircle score={data.health_score} />
                <p className="text-sm font-medium text-zinc-300">Health Score</p>
              </div>
            </AdminCard>

            {/* Summary stats */}
            <AdminCard>
              <div className="flex flex-col justify-center h-full gap-4 py-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Check className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-zinc-100">{data.passed}</p>
                    <p className="text-xs text-zinc-500">Passed</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-zinc-100">{data.warnings}</p>
                    <p className="text-xs text-zinc-500">Warnings</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                    <X className="w-4 h-4 text-red-400" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-zinc-100">{data.failed}</p>
                    <p className="text-xs text-zinc-500">Failed</p>
                  </div>
                </div>
              </div>
            </AdminCard>

            {/* Summary bar */}
            <AdminCard>
              <div className="flex flex-col justify-center h-full gap-4 py-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-violet-400" />
                  <span className="text-sm font-medium text-zinc-100">Summary</span>
                </div>
                <p className="text-sm text-zinc-400">
                  <span className="text-emerald-400 font-medium">{data.passed} passed</span>
                  {data.warnings > 0 && (
                    <>, <span className="text-amber-400 font-medium">{data.warnings} warning{data.warnings !== 1 ? 's' : ''}</span></>
                  )}
                  {data.failed > 0 && (
                    <>, <span className="text-red-400 font-medium">{data.failed} failed</span></>
                  )}
                </p>
                <p className="text-xs text-zinc-500">
                  {data.total_checks} total checks &middot;{' '}
                  {data.health_score >= 80
                    ? 'Your deployment looks great.'
                    : data.health_score >= 50
                      ? 'Some items need attention.'
                      : 'Critical issues detected.'}
                </p>
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Refreshing...
                  </div>
                )}
              </div>
            </AdminCard>
          </div>

          {/* Check categories */}
          <div className="space-y-6">
            {grouped.map((group) => (
              <AdminCard
                key={group.key}
                title={group.label}
                headerActions={
                  <span className="text-zinc-500">{group.icon}</span>
                }
              >
                <div className="divide-y divide-white/5 -mx-5 -my-5">
                  {group.checks.map((check, idx) => {
                    const link = check.fix ? fixLink(check) : null;
                    return (
                      <div
                        key={`${check.name}-${idx}`}
                        className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <StatusIcon status={check.status} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-200 truncate">
                              {check.name}
                            </p>
                            <p className="text-xs text-zinc-500 truncate">
                              {check.message}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {check.fix && link && (
                            <Link
                              href={link}
                              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-zinc-800 text-zinc-300 border border-white/10 hover:bg-zinc-700 transition-colors"
                            >
                              Fix
                            </Link>
                          )}
                          {check.fix && !link && (
                            <span
                              title={check.fix}
                              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-zinc-800/50 text-zinc-500 border border-white/5 cursor-help"
                            >
                              Info
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AdminCard>
            ))}
          </div>
        </>
      )}
    </AdminPageLayout>
  );
}
