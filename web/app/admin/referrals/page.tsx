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
};

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

  useEffect(() => {
    loadData();
  }, [loadData]);

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
            Share your link and earn free months for every friend who subscribes
          </p>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
        >
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
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" /> Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> Copy
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-zinc-500 mt-2">
          Share this link. When your friend subscribes to a paid plan, you both get a free month.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            icon: MousePointerClick,
            value: stats?.totalClicks || 0,
            label: "Clicks",
            color: "text-zinc-400",
          },
          {
            icon: Users,
            value: stats?.signedUp || 0,
            label: "Signups",
            color: "text-blue-400",
          },
          {
            icon: TrendingUp,
            value: stats?.converted || 0,
            label: "Converted",
            color: "text-emerald-400",
          },
          {
            icon: Gift,
            value: `${stats?.creditsAvailable || 0} mo`,
            label: "Earned",
            color: "text-teal-400",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-center"
          >
            <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color}`} />
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Referrals Table */}
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
                <div
                  key={ref.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="text-sm text-zinc-300">
                    {ref.referred_email || "Anonymous click"}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}
                    >
                      {style.label}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {new Date(date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {ref.status === "converted" && (
                      <Check className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
