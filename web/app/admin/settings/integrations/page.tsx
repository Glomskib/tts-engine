'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminPageLayout, { AdminCard } from '../../components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import {
  Check,
  X,
  Loader2,
  ExternalLink,
  Activity,
  RefreshCw,
  ShoppingBag,
  Video,
  CreditCard,
  Send,
  Mic,
  Clapperboard,
  Film,
  Scissors,
  Brain,
  Database,
  Zap,
} from 'lucide-react';

interface ServiceInfo {
  name: string;
  key: string;
  status: 'connected' | 'api_key_set' | 'error' | 'not_configured';
  latency?: number;
  message?: string;
  details?: string;
  manageUrl?: string;
}

const SERVICE_META: Record<string, { icon: typeof Check; category: 'platform' | 'ai' | 'infra' }> = {
  tiktok_shop: { icon: ShoppingBag, category: 'platform' },
  tiktok_content: { icon: Video, category: 'platform' },
  stripe: { icon: CreditCard, category: 'platform' },
  telegram: { icon: Send, category: 'platform' },
  elevenlabs: { icon: Mic, category: 'ai' },
  heygen: { icon: Clapperboard, category: 'ai' },
  runway: { icon: Film, category: 'ai' },
  shotstack: { icon: Scissors, category: 'ai' },
  openai: { icon: Zap, category: 'ai' },
  anthropic: { icon: Brain, category: 'ai' },
  supabase: { icon: Database, category: 'infra' },
};

function StatusBadge({ status }: { status: ServiceInfo['status'] }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
        <Check className="w-3 h-3" />
        Connected
      </span>
    );
  }
  if (status === 'api_key_set') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
        <Check className="w-3 h-3" />
        API Key Set
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
        <X className="w-3 h-3" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 bg-zinc-800 border border-zinc-700 px-2.5 py-1 rounded-full">
      <X className="w-3 h-3" />
      Not Configured
    </span>
  );
}

function ServiceRow({
  service,
  onTest,
  testing,
  testResult,
}: {
  service: ServiceInfo;
  onTest: () => void;
  testing: boolean;
  testResult: ServiceInfo | null;
}) {
  const meta = SERVICE_META[service.key] || { icon: Activity, category: 'infra' };
  const Icon = meta.icon;

  const displayResult = testResult || service;
  const hasManageUrl = service.manageUrl;
  const isConfigured = service.status === 'connected' || service.status === 'api_key_set';

  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors">
      {/* Icon */}
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          isConfigured
            ? 'bg-violet-500/10 border border-violet-500/20'
            : 'bg-zinc-800/80 border border-zinc-700'
        }`}
      >
        <Icon className={`w-5 h-5 ${isConfigured ? 'text-violet-400' : 'text-zinc-500'}`} />
      </div>

      {/* Name + details */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-zinc-100">{service.name}</div>
        {displayResult.details && (
          <div className="text-xs text-zinc-500 mt-0.5">{displayResult.details}</div>
        )}
        {displayResult.message && displayResult.status === 'error' && (
          <div className="text-xs text-red-400/80 mt-0.5">{displayResult.message}</div>
        )}
      </div>

      {/* Status badge */}
      <StatusBadge status={displayResult.status} />

      {/* Latency */}
      <div className="w-16 text-right shrink-0">
        {displayResult.latency != null ? (
          <span className="text-xs font-mono text-zinc-500">{displayResult.latency}ms</span>
        ) : (
          <span className="text-xs text-zinc-700">--</span>
        )}
      </div>

      {/* Action button */}
      <div className="w-20 shrink-0 text-right">
        {hasManageUrl ? (
          <a
            href={service.manageUrl}
            className="inline-flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-violet-500/10"
          >
            Manage
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <button
            onClick={onTest}
            disabled={testing || service.status === 'not_configured'}
            className="inline-flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-violet-500/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            {testing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : service.key === 'supabase' ? (
              'Health'
            ) : (
              'Test'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const { showSuccess, showError } = useToast();
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingService, setTestingService] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ServiceInfo>>({});
  const [testingAll, setTestingAll] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/integrations/test');
      const json = await res.json();
      if (json.ok) {
        setServices(json.services);
      } else {
        showError('Failed to load integrations');
      }
    } catch {
      showError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  async function testSingle(key: string) {
    setTestingService(key);
    try {
      const res = await fetch('/api/admin/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: key }),
      });
      const json = await res.json();
      if (json.ok && json.result) {
        setTestResults((prev) => ({ ...prev, [key]: json.result }));
        if (json.result.status === 'connected') {
          showSuccess(`${json.result.name}: ${json.result.latency}ms`);
        } else if (json.result.status === 'error') {
          showError(`${json.result.name}: ${json.result.message || 'Test failed'}`);
        }
      }
    } catch {
      showError('Network error testing service');
    } finally {
      setTestingService(null);
    }
  }

  async function testAll() {
    setTestingAll(true);
    setTestResults({});
    const testable = services.filter(
      (s) => (s.status === 'connected' || s.status === 'api_key_set') && !s.manageUrl
    );

    for (const svc of testable) {
      setTestingService(svc.key);
      try {
        const res = await fetch('/api/admin/integrations/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service: svc.key }),
        });
        const json = await res.json();
        if (json.ok && json.result) {
          setTestResults((prev) => ({ ...prev, [svc.key]: json.result }));
        }
      } catch { /* continue */ }
    }

    setTestingService(null);
    setTestingAll(false);
    showSuccess('All tests complete');
  }

  const configured = services.filter(
    (s) => s.status === 'connected' || s.status === 'api_key_set'
  ).length;

  const platformServices = services.filter(
    (s) => SERVICE_META[s.key]?.category === 'platform'
  );
  const aiServices = services.filter(
    (s) => SERVICE_META[s.key]?.category === 'ai'
  );
  const infraServices = services.filter(
    (s) => SERVICE_META[s.key]?.category === 'infra'
  );

  if (loading) {
    return (
      <AdminPageLayout title="Integrations" subtitle="Connected services and API keys">
        <AdminCard>
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            <span className="ml-3 text-zinc-500">Loading integrations...</span>
          </div>
        </AdminCard>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Integrations"
      subtitle="Connected services and API keys"
      headerActions={
        <button
          onClick={testAll}
          disabled={testingAll}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testingAll ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Test All
            </>
          )}
        </button>
      }
    >
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/50">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
            Total Services
          </div>
          <div className="text-xl font-semibold text-zinc-100">{services.length}</div>
        </div>
        <div className="px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
            Configured
          </div>
          <div className="text-xl font-semibold text-emerald-400">{configured}</div>
        </div>
        <div className="px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/50">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
            Missing
          </div>
          <div className="text-xl font-semibold text-zinc-100">
            {services.length - configured}
          </div>
        </div>
      </div>

      {/* Platform Integrations */}
      <AdminCard title="Platform Integrations" subtitle="OAuth connections and external services">
        <div className="-mx-5 divide-y divide-white/5">
          {platformServices.map((svc) => (
            <ServiceRow
              key={svc.key}
              service={svc}
              onTest={() => testSingle(svc.key)}
              testing={testingService === svc.key}
              testResult={testResults[svc.key] || null}
            />
          ))}
        </div>
      </AdminCard>

      {/* AI Services */}
      <AdminCard title="AI Services" subtitle="Content generation and media processing APIs">
        <div className="-mx-5 divide-y divide-white/5">
          {aiServices.map((svc) => (
            <ServiceRow
              key={svc.key}
              service={svc}
              onTest={() => testSingle(svc.key)}
              testing={testingService === svc.key}
              testResult={testResults[svc.key] || null}
            />
          ))}
        </div>
      </AdminCard>

      {/* Infrastructure */}
      <AdminCard title="Infrastructure" subtitle="Database and core services">
        <div className="-mx-5 divide-y divide-white/5">
          {infraServices.map((svc) => (
            <ServiceRow
              key={svc.key}
              service={svc}
              onTest={() => testSingle(svc.key)}
              testing={testingService === svc.key}
              testResult={testResults[svc.key] || null}
            />
          ))}
        </div>
      </AdminCard>
    </AdminPageLayout>
  );
}
