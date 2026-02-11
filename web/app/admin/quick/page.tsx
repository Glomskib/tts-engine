"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchJson, isApiError } from "@/lib/http/fetchJson";
import {
  Sparkles,
  Upload,
  BarChart,
  Sun,
  Bell,
  RefreshCw,
  Video,
  FileText,
  Check,
  Clock,
  Eye,
  Users,
  ChevronRight,
} from "lucide-react";

interface PipelineStatus {
  needs_script?: number;
  scripted?: number;
  assigned?: number;
  in_progress?: number;
  review?: number;
  approved?: number;
  posted?: number;
}

interface ScriptOfTheDay {
  id: string;
  hook: string;
  product_name: string;
  product_brand: string | null;
  status: string;
}

export default function QuickActionsPage() {
  const router = useRouter();
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [sotd, setSotd] = useState<ScriptOfTheDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);

    // Fetch pipeline counts
    const pipelineResp = await fetchJson<{ statusCounts?: PipelineStatus }>("/api/videos/admin?limit=1");
    if (!isApiError(pipelineResp) && pipelineResp.data) {
      const raw = pipelineResp.data;
      // Try to extract status counts from the response
      if (raw.statusCounts) {
        setPipeline(raw.statusCounts);
      }
    }

    // Fetch script of the day
    const sotdResp = await fetchJson<ScriptOfTheDay>("/api/script-of-the-day");
    if (!isApiError(sotdResp) && sotdResp.data) {
      setSotd(sotdResp.data);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pull-to-refresh via touch events
  const [touchStart, setTouchStart] = useState(0);
  const [pulling, setPulling] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setTouchStart(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart > 0) {
      const diff = e.touches[0].clientY - touchStart;
      if (diff > 80) setPulling(true);
    }
  };

  const handleTouchEnd = () => {
    if (pulling) {
      loadData();
      setPulling(false);
    }
    setTouchStart(0);
  };

  const pipelineTotal = pipeline
    ? Object.values(pipeline).reduce((a, b) => a + (b || 0), 0)
    : 0;

  const quickActions = [
    {
      icon: Sparkles,
      label: "Generate Script",
      description: "Open Content Studio",
      href: "/admin/content-studio",
      color: "from-blue-600 to-violet-600",
      iconColor: "text-blue-300",
    },
    {
      icon: Sun,
      label: "Today's Script",
      description: sotd ? `"${sotd.hook.slice(0, 40)}..."` : "Get your daily pick",
      href: "/admin/script-of-the-day",
      color: "from-amber-600 to-orange-600",
      iconColor: "text-amber-300",
    },
    {
      icon: Upload,
      label: "Import Winner",
      description: "Add a winning video",
      href: "/admin/winners/import",
      color: "from-emerald-600 to-teal-600",
      iconColor: "text-emerald-300",
    },
    {
      icon: Video,
      label: "Pipeline",
      description: pipelineTotal > 0 ? `${pipelineTotal} videos` : "View status",
      href: "/admin/pipeline",
      color: "from-pink-600 to-rose-600",
      iconColor: "text-pink-300",
    },
  ];

  const pipelineStatuses = [
    { key: "scripted", label: "Scripted", icon: FileText, color: "text-blue-400" },
    { key: "assigned", label: "Assigned", icon: Users, color: "text-purple-400" },
    { key: "in_progress", label: "In Progress", icon: Clock, color: "text-amber-400" },
    { key: "review", label: "Review", icon: Eye, color: "text-orange-400" },
    { key: "approved", label: "Approved", icon: Check, color: "text-green-400" },
    { key: "posted", label: "Posted", icon: Check, color: "text-teal-400" },
  ];

  return (
    <div
      className="min-h-screen bg-[#09090b] text-white p-4 pb-24 max-w-lg mx-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      {(pulling || refreshing) && (
        <div className="flex items-center justify-center py-4">
          <RefreshCw className={`w-5 h-5 text-teal-400 ${refreshing ? "animate-spin" : ""}`} />
          <span className="text-sm text-zinc-400 ml-2">
            {refreshing ? "Refreshing..." : "Release to refresh"}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">FlashFlow</h1>
          <p className="text-sm text-zinc-400">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={refreshing}
          className="p-2 bg-zinc-800 rounded-full"
        >
          <RefreshCw className={`w-5 h-5 text-zinc-400 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Quick Action Buttons — Big and thumb-friendly */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={`bg-gradient-to-br ${action.color} rounded-2xl p-5 flex flex-col items-start gap-3 active:scale-95 transition-transform min-h-[120px]`}
          >
            <action.icon className={`w-7 h-7 ${action.iconColor}`} />
            <div>
              <div className="font-semibold text-white text-base">{action.label}</div>
              <div className="text-white/60 text-xs mt-0.5 line-clamp-1">
                {action.description}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Script of the Day Card */}
      {sotd && (
        <Link
          href="/admin/script-of-the-day"
          className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4 active:bg-zinc-800 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Today&apos;s Script
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500" />
          </div>
          <p className="text-sm text-zinc-300 font-medium mb-1">
            {sotd.product_name}
          </p>
          <p className="text-xs text-zinc-500 line-clamp-2">
            &quot;{sotd.hook}&quot;
          </p>
          {sotd.status === "accepted" && (
            <span className="inline-flex items-center gap-1 mt-2 text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded">
              <Check className="w-3 h-3" /> In pipeline
            </span>
          )}
        </Link>
      )}

      {/* Pipeline Status */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart className="w-4 h-4 text-teal-400" />
            Pipeline Status
          </h3>
          <Link href="/admin/pipeline" className="text-xs text-teal-400">
            View All
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-4">
            <RefreshCw className="w-5 h-5 animate-spin text-zinc-600" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {pipelineStatuses.map((status) => {
              const count =
                pipeline?.[status.key as keyof PipelineStatus] || 0;
              return (
                <div
                  key={status.key}
                  className="bg-zinc-800 rounded-xl p-3 text-center"
                >
                  <div className={`text-xl font-bold ${status.color}`}>
                    {count}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {status.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="space-y-2">
        {[
          { href: "/admin/calendar", icon: Clock, label: "Content Calendar" },
          { href: "/admin/content-package", icon: FileText, label: "Content Package" },
          { href: "/admin/analytics", icon: BarChart, label: "Analytics" },
          { href: "/admin/guide", icon: Bell, label: "User Guide" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 active:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <link.icon className="w-5 h-5 text-zinc-400" />
              <span className="text-sm text-zinc-300">{link.label}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </Link>
        ))}
      </div>
    </div>
  );
}
