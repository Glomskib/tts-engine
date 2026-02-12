"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Link2,
  Copy,
  Check,
  Users,
  MousePointerClick,
  TrendingUp,
  Gift,
  RefreshCw,
  Loader2,
  DollarSign,
  CreditCard,
  Trophy,
  Lock,
  ExternalLink,
} from "lucide-react";

interface ReferralStats {
  totalClicks: number;
  signedUp: number;
  converted: number;
  creditsEarned: number;
  creditsAvailable: number;
  referralLink: string;
  referralCode: string;
}

interface AffiliateAccount {
  id: string;
  status: string;
  commission_rate: number;
  stripe_connect_onboarded: boolean;
  total_earned: number;
  total_paid: number;
  balance: number;
}

interface Commission {
  id: string;
  subscription_amount: number;
  commission_amount: number;
  status: string;
  created_at: string;
  referred_user_id: string;
}

interface Payout {
  id: string;
  amount: number;
  status: string;
  commission_count: number;
  paid_at: string | null;
  created_at: string;
}

interface Milestone {
  milestone_type: string;
  bonus_amount: number;
  paid: boolean;
}

interface ReferralRow {
  id: string;
  referred_email: string | null;
  status: string;
  signed_up_at: string | null;
  converted_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-amber-500/10", text: "text-amber-400", label: "Pending" },
  signed_up: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Signed Up" },
  converted: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Converted" },
  expired: { bg: "bg-zinc-500/10", text: "text-zinc-400", label: "Expired" },
  approved: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Approved" },
  paid: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Paid" },
  completed: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Completed" },
  processing: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Processing" },
  failed: { bg: "bg-red-500/10", text: "text-red-400", label: "Failed" },
};

const MILESTONE_INFO: Record<string, { label: string; threshold: number }> = {
  conversions_5: { label: "5 conversions — $50 bonus", threshold: 5 },
  conversions_15: { label: "15 conversions — $150 bonus + Featured", threshold: 15 },
  conversions_30: { label: "30 conversions — $300 bonus + Lifetime Pro", threshold: 30 },
};

export default function ReferralsPage() {
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [recent, setRecent] = useState<ReferralRow[]>([]);
  const [affiliate, setAffiliate] = useState<AffiliateAccount | null>(null);
  const [affiliateStats, setAffiliateStats] = useState<{
    totalReferred: number;
    activeSubscribers: number;
    totalEarned: number;
    totalPaid: number;
    pendingBalance: number;
    thisMonthEarned: number;
  } | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applyForm, setApplyForm] = useState({ platform: '', followerCount: '', note: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load referral stats
      const refRes = await fetch("/api/referrals");
      const refData = await refRes.json();
      if (refData.ok) {
        setReferralStats(refData.data.stats);
        setRecent(refData.data.recent || []);
      }

      // Load affiliate data
      const affRes = await fetch("/api/affiliates/status");
      const affData = await affRes.json();
      if (affData.ok && affData.data) {
        setAffiliate(affData.data.account);
        setAffiliateStats(affData.data.stats);
        setCommissions(affData.data.recentCommissions || []);
        setPayouts(affData.data.payoutHistory || []);
        setMilestones(affData.data.milestones || []);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCopy = async () => {
    if (!referralStats?.referralLink) return;
    await navigator.clipboard.writeText(referralStats.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await fetch("/api/affiliates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: applyForm.platform || undefined,
          followerCount: applyForm.followerCount ? parseInt(applyForm.followerCount) : undefined,
          note: applyForm.note || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowApplyForm(false);
        loadData();
      }
    } catch (err) {
      console.error("Apply failed:", err);
    } finally {
      setApplying(false);
    }
  };

  const handleStripeConnect = async () => {
    setConnectLoading(true);
    try {
      const res = await fetch("/api/affiliates/stripe-connect", { method: "POST" });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Stripe Connect error:", err);
    } finally {
      setConnectLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const isApprovedAffiliate = affiliate?.status === "approved";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Referrals & Affiliates</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {isApprovedAffiliate
              ? "Earn 25% recurring commission on every referred subscriber"
              : "Share your link and earn free months for every friend who subscribes"}
          </p>
        </div>
        <button onClick={loadData} className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors">
          <RefreshCw className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Referral Link Card */}
      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-5 h-5 text-teal-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Your Referral Link</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-zinc-300 font-mono truncate">
            {referralStats?.referralLink || "Loading..."}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy</>}
          </button>
        </div>
        {referralStats?.referralCode && (
          <p className="text-xs text-zinc-500 mt-2">
            Your code: <span className="font-mono text-zinc-400">{referralStats.referralCode}</span>
          </p>
        )}
      </div>

      {/* ── AFFILIATE DASHBOARD (approved affiliates only) ── */}
      {isApprovedAffiliate && affiliateStats && (
        <>
          {/* Earnings Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: DollarSign, value: `$${affiliateStats.totalEarned.toFixed(2)}`, label: "Total Earned", color: "text-teal-400" },
              { icon: CreditCard, value: `$${affiliateStats.totalPaid.toFixed(2)}`, label: "Total Paid", color: "text-emerald-400" },
              { icon: DollarSign, value: `$${affiliateStats.pendingBalance.toFixed(2)}`, label: "Balance", color: "text-blue-400" },
              { icon: TrendingUp, value: `$${affiliateStats.thisMonthEarned.toFixed(2)}`, label: "This Month", color: "text-violet-400" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-center">
                <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color}`} />
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Milestones */}
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-semibold text-zinc-200">Milestones</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(MILESTONE_INFO).map(([type, info]) => {
                const achieved = milestones.find(m => m.milestone_type === type);
                return (
                  <div key={type} className="flex items-center gap-3 text-sm">
                    {achieved ? (
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <Lock className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                    )}
                    <span className={achieved ? "text-zinc-300" : "text-zinc-500"}>
                      {info.label}
                    </span>
                    {achieved && <span className="text-xs text-emerald-400 ml-auto">Earned!</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Commissions */}
          {commissions.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <h3 className="text-sm font-semibold text-zinc-200">Recent Commissions</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-white/5 text-xs text-zinc-500">
                      <th className="text-left px-5 py-2">Date</th>
                      <th className="text-right px-3 py-2">Subscription</th>
                      <th className="text-right px-3 py-2">Commission</th>
                      <th className="text-center px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {commissions.map((c) => {
                      const style = STATUS_STYLES[c.status] || STATUS_STYLES.pending;
                      return (
                        <tr key={c.id}>
                          <td className="px-5 py-3 text-sm text-zinc-400">
                            {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                          <td className="text-right px-3 py-3 text-sm text-zinc-300">${c.subscription_amount.toFixed(2)}</td>
                          <td className="text-right px-3 py-3 text-sm font-medium text-teal-400">${c.commission_amount.toFixed(2)}</td>
                          <td className="text-center px-3 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                              {style.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payout History */}
          {payouts.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <h3 className="text-sm font-semibold text-zinc-200">Payout History</h3>
              </div>
              <div className="divide-y divide-white/5">
                {payouts.map((p) => {
                  const style = STATUS_STYLES[p.status] || STATUS_STYLES.pending;
                  return (
                    <div key={p.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <div className="text-sm text-zinc-300">${p.amount.toFixed(2)}</div>
                        <div className="text-xs text-zinc-500">{p.commission_count} commissions</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                        <span className="text-xs text-zinc-600">
                          {new Date(p.paid_at || p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment Settings */}
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Payment Settings</h3>
              </div>
              <button
                onClick={handleStripeConnect}
                disabled={connectLoading}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {connectLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                {affiliate.stripe_connect_onboarded ? "Manage Bank Info" : "Connect Bank Account"}
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              {affiliate.stripe_connect_onboarded
                ? "Your bank account is connected. Payouts are processed on the 1st of each month."
                : "Connect your bank account via Stripe to receive monthly payouts. Minimum payout: $50."}
            </p>
          </div>
        </>
      )}

      {/* ── BASIC REFERRAL STATS (always shown) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: MousePointerClick, value: referralStats?.totalClicks || 0, label: "Clicks", color: "text-zinc-400" },
          { icon: Users, value: referralStats?.signedUp || 0, label: "Signups", color: "text-blue-400" },
          { icon: TrendingUp, value: referralStats?.converted || 0, label: "Converted", color: "text-emerald-400" },
          { icon: Gift, value: `${referralStats?.creditsAvailable || 0} mo`, label: "Free Months", color: "text-teal-400" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-center">
            <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color}`} />
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Referrals */}
      <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-zinc-200">Recent Referrals</h3>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-zinc-500">
            No referrals yet. Share your link to get started!
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {recent.map((ref) => {
              const style = STATUS_STYLES[ref.status] || STATUS_STYLES.pending;
              const date = ref.signed_up_at || ref.created_at;
              return (
                <div key={ref.id} className="flex items-center justify-between px-5 py-3">
                  <div className="text-sm text-zinc-300">{ref.referred_email || "Anonymous click"}</div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── AFFILIATE APPLICATION (if not yet applied) ── */}
      {!affiliate && (
        <div className="rounded-xl border border-teal-500/20 bg-gradient-to-br from-teal-500/5 to-violet-500/5 p-6">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-teal-400" />
            <h3 className="text-sm font-semibold text-zinc-200">Become an Affiliate</h3>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            Earn 25% recurring commission on every paid subscriber you refer. Payouts monthly via Stripe.
          </p>
          {!showApplyForm ? (
            <button
              onClick={() => setShowApplyForm(true)}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Apply Now
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Platform</label>
                <select
                  value={applyForm.platform}
                  onChange={(e) => setApplyForm(p => ({ ...p, platform: e.target.value }))}
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-300"
                >
                  <option value="">Select...</option>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                  <option value="twitter">Twitter/X</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Follower Count</label>
                <input
                  type="number"
                  value={applyForm.followerCount}
                  onChange={(e) => setApplyForm(p => ({ ...p, followerCount: e.target.value }))}
                  placeholder="e.g. 10000"
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-300"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Why do you want to be an affiliate?</label>
                <textarea
                  value={applyForm.note}
                  onChange={(e) => setApplyForm(p => ({ ...p, note: e.target.value }))}
                  rows={2}
                  placeholder="Tell us about your audience..."
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-300"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {applying ? "Submitting..." : "Submit Application"}
                </button>
                <button
                  onClick={() => setShowApplyForm(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Application pending status */}
      {affiliate && affiliate.status === "pending" && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-400">Your affiliate application is under review. We'll notify you once approved.</span>
          </div>
        </div>
      )}

      {affiliate && affiliate.status === "rejected" && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <span className="text-sm text-red-400">Your affiliate application was not approved at this time.</span>
        </div>
      )}
    </div>
  );
}
