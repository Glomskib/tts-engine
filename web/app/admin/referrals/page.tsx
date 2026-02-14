"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Link2,
  Copy,
  Check,
  Users,
  TrendingUp,
  Gift,
  RefreshCw,
  Loader2,
  DollarSign,
} from "lucide-react";

interface ReferralStats {
  totalReferrals: number;
  creditsEarned: number;
  referralLink: string;
  referralCode: string;
}

interface ReferralRow {
  id: string;
  referred_email: string | null;
  reward_given: boolean;
  reward_details: {
    referrer_credits?: number;
    referred_credits?: number;
    referrer_plan?: string;
    referred_plan?: string;
  } | null;
  created_at: string;
}

// TODO: affiliate commission system (3rd party?)
// The affiliate program (25% recurring commission) will be handled separately.

export default function ReferralsPage() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [recent, setRecent] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/referrals");
      const data = await res.json();
      if (data.ok) {
        setStats(data.data.stats);
        setRecent(data.data.recent || []);
      }
    } catch (err) {
      console.error("Failed to load referral data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCopy = async () => {
    if (!stats?.referralLink) return;
    await navigator.clipboard.writeText(stats.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Referrals</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Share your link and you both get 1 month of free credits
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
            {stats?.referralLink || "Loading..."}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors shrink-0 min-h-[44px]"
          >
            {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy</>}
          </button>
        </div>
        {stats?.referralCode && (
          <p className="text-xs text-zinc-500 mt-2">
            Your code: <span className="font-mono text-zinc-400">{stats.referralCode}</span>
          </p>
        )}
      </div>

      {/* How It Works */}
      <div className="rounded-xl border border-teal-500/20 bg-gradient-to-br from-teal-500/5 to-violet-500/5 p-5">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">How It Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { step: "1", title: "Share your link", desc: "Send your referral link to friends" },
            { step: "2", title: "They sign up", desc: "Your friend creates a FlashFlow account" },
            { step: "3", title: "You both earn", desc: "Both of you get 1 month of plan credits" },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {item.step}
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-200">{item.title}</div>
                <div className="text-xs text-zinc-500">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { icon: Users, value: stats?.totalReferrals || 0, label: "Total Referrals", color: "text-blue-400" },
          { icon: Gift, value: stats?.creditsEarned || 0, label: "Credits Earned", color: "text-teal-400" },
          { icon: TrendingUp, value: recent.filter(r => r.reward_given).length, label: "Rewards Given", color: "text-emerald-400" },
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
          <h3 className="text-sm font-semibold text-zinc-200">People You Referred</h3>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-zinc-500">
            No referrals yet. Share your link to get started!
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {recent.map((ref) => (
              <div key={ref.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-sm text-zinc-300">{ref.referred_email || "Unknown"}</div>
                  {ref.reward_details && (
                    <div className="text-xs text-zinc-500 mt-0.5">
                      +{ref.reward_details.referrer_credits} credits earned
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {ref.reward_given ? (
                    <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400">
                      Rewarded
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400">
                      Pending
                    </span>
                  )}
                  <span className="text-xs text-zinc-600">
                    {new Date(ref.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Affiliate Teaser */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-5 h-5 text-zinc-600" />
          <h3 className="text-sm font-semibold text-zinc-400">Affiliate Program</h3>
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-500 uppercase tracking-wide">
            Coming Soon
          </span>
        </div>
        <p className="text-sm text-zinc-500">
          Earn 25% recurring commission on every paid subscriber you refer. Details coming soon.
        </p>
      </div>
    </div>
  );
}
