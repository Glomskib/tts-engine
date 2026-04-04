'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminButton, EmptyState, StatCard, SectionDivider } from '../components/AdminPageLayout';
import { SkeletonAuthCheck, SkeletonTable } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';

// ── Types ───────────────────────────────────────────────────────────

interface Alert {
  id: string;
  trend_cluster_id: string | null;
  product_name: string;
  alert_type: 'ACT_NOW' | 'VELOCITY_SPIKE' | 'COMMUNITY_MOMENTUM';
  recommendation: string | null;
  earlyness_score: number;
  saturation_score: number;
  velocity_score: number;
  community_wins: number;
  community_views: number;
  best_hook: string | null;
  reason_text: string;
  created_at: string;
  seen_at: string | null;
  dismissed_at: string | null;
}

interface Subscription {
  id: string;
  alert_type: string;
  delivery_method: string;
  destination: string | null;
  enabled: boolean;
  created_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TYPE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  ACT_NOW: { bg: 'bg-emerald-400/10', text: 'text-emerald-400', border: 'border-emerald-400/30', label: 'Act Now' },
  VELOCITY_SPIKE: { bg: 'bg-violet-400/10', text: 'text-violet-400', border: 'border-violet-400/30', label: 'Velocity Spike' },
  COMMUNITY_MOMENTUM: { bg: 'bg-orange-400/10', text: 'text-orange-400', border: 'border-orange-400/30', label: 'Community Momentum' },
};

const METHOD_LABELS: Record<string, string> = {
  in_app: 'In-App',
  email: 'Email',
  webhook: 'Webhook',
};

// ── Page ────────────────────────────────────────────────────────────

export default function AlertCenterPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<'alerts' | 'subscriptions'>('alerts');

  // Alert state
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const [filterType, setFilterType] = useState<string>('');
  const [filterView, setFilterView] = useState<'all' | 'unseen'>('all');

  // Subscription state
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [showAddSub, setShowAddSub] = useState(false);
  const [newSubType, setNewSubType] = useState('ALL');
  const [newSubMethod, setNewSubMethod] = useState('in_app');
  const [newSubDest, setNewSubDest] = useState('');
  const [addingSubLoading, setAddingSubLoading] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) { router.push('/login?redirect=/admin/alerts'); return; }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        if (roleData.role !== 'admin') { router.push('/admin/pipeline'); return; }
        setIsAdmin(true);
      } catch {
        router.push('/login?redirect=/admin/alerts');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterView === 'unseen') params.set('filter', 'unseen');
      if (filterType) params.set('type', filterType);
      const res = await fetch(`/api/admin/alerts?${params}`);
      const json = await res.json();
      if (json.ok) {
        setAlerts(json.data || []);
        setUnseenCount(json.unseen_count ?? 0);
      }
    } catch {
      showError('Failed to load alerts');
    } finally {
      setAlertsLoading(false);
    }
  }, [filterType, filterView, showError]);

  const fetchSubs = useCallback(async () => {
    setSubsLoading(true);
    try {
      const res = await fetch('/api/admin/alerts/subscriptions');
      const json = await res.json();
      if (json.ok) setSubs(json.data || []);
    } catch {
      showError('Failed to load subscriptions');
    } finally {
      setSubsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAlerts();
  }, [isAdmin, fetchAlerts]);

  useEffect(() => {
    if (!isAdmin || tab !== 'subscriptions') return;
    fetchSubs();
  }, [isAdmin, tab, fetchSubs]);

  const handleMarkAllSeen = async () => {
    try {
      const res = await fetch('/api/admin/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_seen' }),
      });
      const json = await res.json();
      if (json.ok) {
        setAlerts(prev => prev.map(a => ({ ...a, seen_at: a.seen_at || new Date().toISOString() })));
        setUnseenCount(0);
        showSuccess(`Marked ${json.marked} alerts as seen`);
      }
    } catch {
      showError('Failed to mark alerts');
    }
  };

  const handleDismiss = async (alertId: string) => {
    try {
      const res = await fetch('/api/admin/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', alert_id: alertId }),
      });
      const json = await res.json();
      if (json.ok) {
        setAlerts(prev => prev.filter(a => a.id !== alertId));
        showSuccess('Alert dismissed');
      }
    } catch {
      showError('Failed to dismiss');
    }
  };

  const handleAddSub = async () => {
    setAddingSubLoading(true);
    try {
      const res = await fetch('/api/admin/alerts/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_type: newSubType,
          delivery_method: newSubMethod,
          destination: newSubMethod !== 'in_app' ? newSubDest : null,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSubs(prev => [json.data, ...prev]);
        setShowAddSub(false);
        setNewSubDest('');
        showSuccess('Subscription created');
      } else {
        showError(json.error || 'Failed to create subscription');
      }
    } catch {
      showError('Failed to create subscription');
    } finally {
      setAddingSubLoading(false);
    }
  };

  const handleToggleSub = async (id: string, enabled: boolean) => {
    try {
      await fetch('/api/admin/alerts/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', id, enabled }),
      });
      setSubs(prev => prev.map(s => s.id === id ? { ...s, enabled } : s));
    } catch {
      showError('Failed to update subscription');
    }
  };

  const handleDeleteSub = async (id: string) => {
    try {
      await fetch('/api/admin/alerts/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      setSubs(prev => prev.filter(s => s.id !== id));
      showSuccess('Subscription removed');
    } catch {
      showError('Failed to delete subscription');
    }
  };

  if (authLoading) return <SkeletonAuthCheck />;
  if (!isAdmin) return null;

  return (
    <AdminPageLayout
      title="Alert Center"
      subtitle="Proactive opportunity alerts"
      stage="research"
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Opportunity Radar', href: '/admin/opportunity-radar' },
        { label: 'Alerts' },
      ]}
      headerActions={
        <div className="flex items-center gap-2">
          {unseenCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-500/20 text-red-400 px-2.5 py-0.5 text-xs font-semibold">
              {unseenCount} unseen
            </span>
          )}
          <Link href="/admin/opportunity-feed">
            <AdminButton variant="secondary" size="sm">Feed</AdminButton>
          </Link>
        </div>
      }
    >
      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('alerts')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'alerts' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Alerts {unseenCount > 0 && <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px]">{unseenCount}</span>}
        </button>
        <button
          onClick={() => setTab('subscriptions')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'subscriptions' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Subscriptions
        </button>
      </div>

      {tab === 'alerts' ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Unseen" value={alertsLoading ? '...' : unseenCount} variant="danger" />
            <StatCard label="Total Active" value={alertsLoading ? '...' : alerts.length} />
            <StatCard
              label="Types"
              value={alertsLoading ? '...' : [...new Set(alerts.map(a => a.alert_type))].length}
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <select
              value={filterView}
              onChange={e => setFilterView(e.target.value as 'all' | 'unseen')}
              className="bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-300"
            >
              <option value="all">All Active</option>
              <option value="unseen">Unseen Only</option>
            </select>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-300"
            >
              <option value="">All Types</option>
              <option value="ACT_NOW">Act Now</option>
              <option value="VELOCITY_SPIKE">Velocity Spike</option>
              <option value="COMMUNITY_MOMENTUM">Community Momentum</option>
            </select>
            {unseenCount > 0 && (
              <button
                onClick={handleMarkAllSeen}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Mark all seen
              </button>
            )}
          </div>

          {alertsLoading ? (
            <SkeletonTable rows={5} cols={4} />
          ) : alerts.length === 0 ? (
            <EmptyState
              title="No alerts yet"
              description="Alerts are generated automatically when opportunities hit key thresholds during trend rescoring."
              action={
                <Link href="/admin/opportunity-feed">
                  <AdminButton variant="primary" size="sm">View Opportunity Feed</AdminButton>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {alerts.map(alert => (
                <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Subscriptions Tab */}
          <SectionDivider label="Delivery Subscriptions" />

          <div className="flex items-center gap-2">
            <AdminButton variant="primary" size="sm" onClick={() => setShowAddSub(true)}>
              Add Subscription
            </AdminButton>
          </div>

          {showAddSub && (
            <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Alert Type</label>
                  <select
                    value={newSubType}
                    onChange={e => setNewSubType(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-300"
                  >
                    <option value="ALL">All Types</option>
                    <option value="ACT_NOW">Act Now</option>
                    <option value="VELOCITY_SPIKE">Velocity Spike</option>
                    <option value="COMMUNITY_MOMENTUM">Community Momentum</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Delivery Method</label>
                  <select
                    value={newSubMethod}
                    onChange={e => setNewSubMethod(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-300"
                  >
                    <option value="in_app">In-App</option>
                    <option value="email">Email</option>
                    <option value="webhook">Webhook</option>
                  </select>
                </div>
              </div>
              {newSubMethod !== 'in_app' && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    {newSubMethod === 'email' ? 'Email Address' : 'Webhook URL'}
                  </label>
                  <input
                    type={newSubMethod === 'email' ? 'email' : 'url'}
                    value={newSubDest}
                    onChange={e => setNewSubDest(e.target.value)}
                    placeholder={newSubMethod === 'email' ? 'you@example.com' : 'https://hooks.example.com/alerts'}
                    className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <AdminButton variant="primary" size="sm" onClick={handleAddSub} disabled={addingSubLoading}>
                  {addingSubLoading ? 'Creating...' : 'Create'}
                </AdminButton>
                <AdminButton variant="secondary" size="sm" onClick={() => setShowAddSub(false)}>
                  Cancel
                </AdminButton>
              </div>
            </div>
          )}

          {subsLoading ? (
            <SkeletonTable rows={3} cols={4} />
          ) : subs.length === 0 ? (
            <EmptyState
              title="No subscriptions"
              description="Add a subscription to get notified when opportunities are detected. Default: Telegram if configured."
            />
          ) : (
            <div className="space-y-2">
              {subs.map(sub => (
                <div key={sub.id} className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${sub.alert_type === 'ALL' ? 'bg-zinc-400/10 text-zinc-400 border border-zinc-400/30' : (TYPE_STYLES[sub.alert_type]?.bg || '') + ' ' + (TYPE_STYLES[sub.alert_type]?.text || '') + ' border ' + (TYPE_STYLES[sub.alert_type]?.border || '')}`}>
                      {sub.alert_type === 'ALL' ? 'All Types' : TYPE_STYLES[sub.alert_type]?.label || sub.alert_type}
                    </span>
                    <span className="text-xs text-zinc-400">{METHOD_LABELS[sub.delivery_method] || sub.delivery_method}</span>
                    {sub.destination && (
                      <span className="text-xs text-zinc-600 truncate max-w-[200px]">{sub.destination}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleSub(sub.id, !sub.enabled)}
                      className={`text-xs px-2 py-1 rounded ${sub.enabled ? 'text-emerald-400 bg-emerald-400/10' : 'text-zinc-500 bg-zinc-800'}`}
                    >
                      {sub.enabled ? 'Active' : 'Paused'}
                    </button>
                    <button
                      onClick={() => handleDeleteSub(sub.id)}
                      className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AdminPageLayout>
  );
}

// ── Alert Card ──────────────────────────────────────────────────────

function AlertCard({ alert, onDismiss }: { alert: Alert; onDismiss: (id: string) => void }) {
  const style = TYPE_STYLES[alert.alert_type] || TYPE_STYLES.ACT_NOW;
  const isUnseen = !alert.seen_at;

  return (
    <div className={`bg-zinc-900/50 rounded-xl border p-4 ${isUnseen ? 'border-white/[0.15]' : 'border-white/[0.06]'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isUnseen && (
              <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
            )}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${style.bg} ${style.text} border ${style.border}`}>
              {style.label}
            </span>
            <span className="text-sm font-semibold text-zinc-200 truncate">{alert.product_name}</span>
            <span className="text-[10px] text-zinc-600">{timeAgo(alert.created_at)}</span>
          </div>

          <p className="text-xs text-zinc-400 mb-2">{alert.reason_text}</p>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-zinc-500">Early <span className="text-emerald-400 font-medium">{alert.earlyness_score}</span></span>
            <span className="text-zinc-500">Sat <span className="text-blue-400 font-medium">{alert.saturation_score}</span></span>
            <span className="text-zinc-500">Vel <span className="text-violet-400 font-medium">{alert.velocity_score}</span></span>
            {alert.community_wins > 0 && (
              <span className="text-zinc-500">Wins <span className="text-orange-400 font-medium">{alert.community_wins}</span></span>
            )}
          </div>

          {alert.best_hook && (
            <div className="text-[11px] text-zinc-500 italic mt-1 truncate">
              &ldquo;{alert.best_hook}&rdquo;
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {alert.trend_cluster_id && (
            <Link href="/admin/opportunity-feed">
              <button className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors">
                View in Feed
              </button>
            </Link>
          )}
          <button
            onClick={() => onDismiss(alert.id)}
            className="px-2.5 py-1 text-[11px] rounded-lg bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
