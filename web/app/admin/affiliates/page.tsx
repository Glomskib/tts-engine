'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  Users,
  Check,
  X,
  DollarSign,
  RefreshCw,
  Loader2,
  Zap,
  Link2,
  CreditCard,
} from 'lucide-react';

interface AffiliateRow {
  id: string;
  user_id: string;
  status: string;
  commission_rate: number;
  stripe_connect_id: string | null;
  stripe_connect_onboarded: boolean;
  payout_email: string | null;
  total_earned: number;
  total_paid: number;
  balance: number;
  platform: string | null;
  follower_count: number | null;
  application_note: string | null;
  created_at: string;
  approved_at: string | null;
  email?: string;
}

interface AttributionRow {
  id: string;
  affiliate_user_id: string;
  referred_user_id: string;
  signup_ts: string;
  plan: string;
  status: string;
  attribution_method: string;
  affiliate_email: string | null;
  referred_email: string | null;
}

interface PayoutRow {
  id: string;
  affiliate_id: string;
  amount: number;
  status: string;
  stripe_transfer_id: string | null;
  commission_count: number;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  notes: string | null;
  affiliate_email: string | null;
  month: string | null;
}

type TabId = 'affiliates' | 'attributions' | 'payouts';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  approved: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  rejected: { bg: 'bg-red-500/10', text: 'text-red-400' },
  suspended: { bg: 'bg-zinc-500/10', text: 'text-zinc-400' },
  signed_up: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  active_free: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  active_paid: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  churned: { bg: 'bg-red-500/10', text: 'text-red-400' },
  processing: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  failed: { bg: 'bg-red-500/10', text: 'text-red-400' },
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'affiliates', label: 'Affiliates' },
  { id: 'attributions', label: 'Attributions' },
  { id: 'payouts', label: 'Payouts' },
];

export default function AdminAffiliatesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('affiliates');
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [attributions, setAttributions] = useState<AttributionRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [payoutResult, setPayoutResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.role !== 'admin') { router.push('/admin/pipeline'); return; }
      setIsAdmin(true);
    };
    checkAuth();
  }, [router]);

  const loadAffiliates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/affiliates');
      const data = await res.json();
      if (data.ok) {
        setAffiliates(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load affiliates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAttributions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/affiliates/attributions?limit=100');
      const data = await res.json();
      if (data.ok) {
        setAttributions(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load attributions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/affiliates/payouts?limit=100');
      const data = await res.json();
      if (data.ok) {
        setPayouts(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load payouts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'affiliates') loadAffiliates();
    else if (activeTab === 'attributions') loadAttributions();
    else if (activeTab === 'payouts') loadPayouts();
  }, [isAdmin, activeTab, loadAffiliates, loadAttributions, loadPayouts]);

  const handleAction = async (affiliateId: string, action: 'approve' | 'reject' | 'suspend') => {
    setActionLoading(affiliateId);
    try {
      const res = await fetch('/api/admin/affiliates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ affiliateId, action }),
      });
      const data = await res.json();
      if (data.ok) {
        loadAffiliates();
      }
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleProcessPayouts = async () => {
    setProcessing(true);
    setPayoutResult(null);
    try {
      const res = await fetch('/api/cron/process-payouts');
      const data = await res.json();
      if (data.ok) {
        setPayoutResult(`Processed ${data.processed} payouts, total $${data.totalPaid?.toFixed(2) || '0.00'}`);
        loadAffiliates();
      } else {
        setPayoutResult(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch {
      setPayoutResult('Network error');
    } finally {
      setProcessing(false);
    }
  };

  const handleRefresh = () => {
    if (activeTab === 'affiliates') loadAffiliates();
    else if (activeTab === 'attributions') loadAttributions();
    else if (activeTab === 'payouts') loadPayouts();
  };

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>;
  }

  const pending = affiliates.filter(a => a.status === 'pending');
  const active = affiliates.filter(a => a.status === 'approved');
  const other = affiliates.filter(a => !['pending', 'approved'].includes(a.status));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Affiliate Management</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage affiliate applications, commissions, and payouts</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'affiliates' && (
            <button
              onClick={handleProcessPayouts}
              disabled={processing}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Process Payouts Now
            </button>
          )}
          <button onClick={handleRefresh} className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors">
            <RefreshCw className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
      </div>

      {payoutResult && (
        <div className="px-4 py-3 rounded-lg bg-teal-500/10 border border-teal-500/20 text-sm text-teal-400">
          {payoutResult}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-white/10 pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary Cards (affiliates tab only) */}
      {activeTab === 'affiliates' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Pending', value: pending.length, color: 'text-amber-400' },
            { label: 'Active', value: active.length, color: 'text-emerald-400' },
            { label: 'Total Earned', value: `$${affiliates.reduce((s, a) => s + (a.total_earned || 0), 0).toFixed(0)}`, color: 'text-teal-400' },
            { label: 'Total Paid', value: `$${affiliates.reduce((s, a) => s + (a.total_paid || 0), 0).toFixed(0)}`, color: 'text-teal-400' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-center">
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : (
        <>
          {/* ==================== AFFILIATES TAB ==================== */}
          {activeTab === 'affiliates' && (
            <>
              {/* Pending Applications */}
              {pending.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-zinc-200">Pending Applications ({pending.length})</h3>
                  </div>
                  <div className="divide-y divide-white/5">
                    {pending.map((a) => (
                      <div key={a.id} className="flex items-center justify-between px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-300 truncate">{a.payout_email || a.user_id.slice(0, 8)}</div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            {a.platform && <span className="capitalize">{a.platform}</span>}
                            {a.follower_count && <span> &middot; {a.follower_count.toLocaleString()} followers</span>}
                            {a.application_note && <span> &middot; &quot;{a.application_note.slice(0, 60)}...&quot;</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => handleAction(a.id, 'approve')}
                            disabled={actionLoading === a.id}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            <Check className="w-3 h-3" /> Approve
                          </button>
                          <button
                            onClick={() => handleAction(a.id, 'reject')}
                            disabled={actionLoading === a.id}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            <X className="w-3 h-3" /> Deny
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Affiliates */}
              <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">Active Affiliates ({active.length})</h3>
                </div>
                {active.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-zinc-500">
                    No active affiliates yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px]">
                      <thead>
                        <tr className="border-b border-white/5 text-xs text-zinc-500 uppercase">
                          <th className="text-left px-5 py-2">Affiliate</th>
                          <th className="text-right px-3 py-2">Referred</th>
                          <th className="text-right px-3 py-2">Earned</th>
                          <th className="text-right px-3 py-2">Balance</th>
                          <th className="text-center px-3 py-2">Stripe</th>
                          <th className="text-right px-3 py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {active.map((a) => (
                          <tr key={a.id} className="hover:bg-white/5">
                            <td className="px-5 py-3">
                              <div className="text-sm text-zinc-300">{a.payout_email || a.user_id.slice(0, 12)}</div>
                              <div className="text-xs text-zinc-500">{a.platform || 'N/A'}</div>
                            </td>
                            <td className="text-right px-3 py-3 text-sm text-zinc-300">{a.follower_count || '-'}</td>
                            <td className="text-right px-3 py-3 text-sm font-medium text-teal-400">${(a.total_earned || 0).toFixed(2)}</td>
                            <td className="text-right px-3 py-3 text-sm text-zinc-300">${(a.balance || 0).toFixed(2)}</td>
                            <td className="text-center px-3 py-3">
                              {a.stripe_connect_onboarded ? (
                                <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400">Connected</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400">Pending</span>
                              )}
                            </td>
                            <td className="text-right px-3 py-3">
                              <button
                                onClick={() => handleAction(a.id, 'suspend')}
                                disabled={actionLoading === a.id}
                                className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                              >
                                Suspend
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Other (rejected/suspended) */}
              {other.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/10">
                    <h3 className="text-sm font-semibold text-zinc-200">Rejected / Suspended ({other.length})</h3>
                  </div>
                  <div className="divide-y divide-white/5">
                    {other.map((a) => {
                      const style = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
                      return (
                        <div key={a.id} className="flex items-center justify-between px-5 py-3">
                          <div className="text-sm text-zinc-400">{a.payout_email || a.user_id.slice(0, 12)}</div>
                          <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text} capitalize`}>
                            {a.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ==================== ATTRIBUTIONS TAB ==================== */}
          {activeTab === 'attributions' && (
            <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Attributions ({attributions.length})</h3>
              </div>
              {attributions.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-zinc-500">
                  No attributions recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead>
                      <tr className="border-b border-white/5 text-xs text-zinc-500 uppercase">
                        <th className="text-left px-5 py-2">Affiliate</th>
                        <th className="text-left px-3 py-2">Referred User</th>
                        <th className="text-left px-3 py-2">Signup Date</th>
                        <th className="text-center px-3 py-2">Plan</th>
                        <th className="text-center px-3 py-2">Status</th>
                        <th className="text-center px-3 py-2">Method</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {attributions.map((a) => {
                        const style = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
                        return (
                          <tr key={a.id} className="hover:bg-white/5">
                            <td className="px-5 py-3 text-sm text-zinc-300">{a.affiliate_email || a.affiliate_user_id.slice(0, 8)}</td>
                            <td className="px-3 py-3 text-sm text-zinc-300">{a.referred_email || a.referred_user_id.slice(0, 8)}</td>
                            <td className="px-3 py-3 text-sm text-zinc-400">{new Date(a.signup_ts).toLocaleDateString()}</td>
                            <td className="text-center px-3 py-3">
                              <span className="px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-300 capitalize">{a.plan}</span>
                            </td>
                            <td className="text-center px-3 py-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                                {a.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="text-center px-3 py-3 text-xs text-zinc-500">{a.attribution_method}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ==================== PAYOUTS TAB ==================== */}
          {activeTab === 'payouts' && (
            <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Payouts ({payouts.length})</h3>
              </div>
              {payouts.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-zinc-500">
                  No payouts yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead>
                      <tr className="border-b border-white/5 text-xs text-zinc-500 uppercase">
                        <th className="text-left px-5 py-2">Month</th>
                        <th className="text-left px-3 py-2">Affiliate</th>
                        <th className="text-right px-3 py-2">Amount</th>
                        <th className="text-right px-3 py-2">Commissions</th>
                        <th className="text-center px-3 py-2">Status</th>
                        <th className="text-left px-3 py-2">Paid At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {payouts.map((p) => {
                        const style = STATUS_STYLES[p.status] || STATUS_STYLES.pending;
                        return (
                          <tr key={p.id} className="hover:bg-white/5">
                            <td className="px-5 py-3 text-sm text-zinc-300">{p.month || '-'}</td>
                            <td className="px-3 py-3 text-sm text-zinc-300">{p.affiliate_email || p.affiliate_id.slice(0, 8)}</td>
                            <td className="text-right px-3 py-3 text-sm font-medium text-teal-400">${Number(p.amount || 0).toFixed(2)}</td>
                            <td className="text-right px-3 py-3 text-sm text-zinc-300">{p.commission_count}</td>
                            <td className="text-center px-3 py-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text} capitalize`}>
                                {p.status}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-sm text-zinc-400">
                              {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
