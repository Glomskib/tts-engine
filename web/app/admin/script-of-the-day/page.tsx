"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "@/contexts/ToastContext";
import Link from "next/link";
import { CONTENT_TYPES } from "@/lib/content-types";
import {
  Sparkles,
  RefreshCw,
  Plus,
  Check,
  Trophy,
  ArrowRight,
  Zap,
  Package,
  Star,
  ChevronRight,
  Loader2,
} from "lucide-react";

// --- Types ---

interface PackageItem {
  id: string;
  product_id: string;
  product_name: string;
  brand: string;
  content_type: string;
  hook: string;
  script_body: string;
  score: number;
  kept: boolean;
  added_to_pipeline: boolean;
}

interface ContentPackage {
  id: string;
  created_at: string;
  status: "generating" | "complete" | "failed";
  items: PackageItem[];
}

// --- Helpers ---

function getContentTypeName(id: string): string {
  const ct = CONTENT_TYPES.find((c) => c.id === id);
  return ct?.name || id;
}

function getScoreColor(score: number): string {
  if (score >= 8) return "text-amber-300";
  if (score >= 6) return "text-emerald-400";
  return "text-yellow-400";
}

function getScoreBg(score: number): string {
  if (score >= 8) return "bg-amber-400/15 border-amber-400/30";
  if (score >= 6) return "bg-emerald-400/15 border-emerald-400/30";
  return "bg-yellow-400/15 border-yellow-400/30";
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Component ---

export default function ScriptOfTheDayPage() {
  const { showError, showSuccess } = useToast();

  const [pkg, setPkg] = useState<ContentPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [addingToPipeline, setAddingToPipeline] = useState<Set<string>>(new Set());

  // Fetch today's content package
  const fetchPackage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/content-package/generate");
      const data = await res.json();
      if (data.ok && data.data && data.data.status === "complete") {
        setPkg(data.data);
      } else {
        setPkg(null);
      }
    } catch {
      setPkg(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackage();
  }, [fetchPackage]);

  // Generate new package
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/content-package/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 20 }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showError(data.error || "Failed to generate package");
      } else {
        setPkg(data.data);
        showSuccess("Package generated!");
      }
    } catch {
      showError("Network error generating package");
    } finally {
      setGenerating(false);
    }
  };

  // Poll while generating
  useEffect(() => {
    if (!pkg || pkg.status !== "generating") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/content-package/generate");
        const data = await res.json();
        if (data.ok && data.data) {
          setPkg(data.data);
          if (data.data.status !== "generating") {
            clearInterval(interval);
            if (data.data.status === "complete") {
              showSuccess(`Package ready with ${data.data.items?.length || 0} scripts`);
            }
          }
        }
      } catch { /* retry */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [pkg?.status, pkg?.id, showSuccess]);

  // Top pick per product (highest score per product)
  const topPicks = useMemo(() => {
    if (!pkg?.items?.length) return [];
    const sorted = [...pkg.items].sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const picks: PackageItem[] = [];
    for (const item of sorted) {
      if (!seen.has(item.product_name)) {
        seen.add(item.product_name);
        picks.push(item);
      }
    }
    return picks;
  }, [pkg?.items]);

  // Script of the Day = #1, runner-ups = #2 and #3
  const scriptOfTheDay = topPicks[0] || null;
  const runnerUps = topPicks.slice(1, 3);
  const otherPicks = topPicks.slice(3);

  // Add to pipeline
  const addToPipeline = async (item: PackageItem) => {
    setAddingToPipeline((prev) => new Set(prev).add(item.id));
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: item.product_name,
          brand: item.brand,
          content_type: item.content_type,
          hook_text: item.hook,
          score: item.score,
          source: "script_of_the_day",
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showSuccess(`"${item.product_name}" added to pipeline`);
        setPkg((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((i) =>
              i.id === item.id ? { ...i, added_to_pipeline: true } : i
            ),
          };
        });
      } else {
        showError(data.error || "Failed to add to pipeline");
      }
    } catch {
      showError("Network error");
    } finally {
      setAddingToPipeline((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-4 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-amber-400" />
            Script of the Day
          </h1>
          <p className="text-zinc-400 mt-1">
            Today&apos;s top-scored scripts from your Content Package
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pkg && (
            <button
              onClick={fetchPackage}
              disabled={loading}
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating || pkg?.status === "generating"}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
          >
            <Zap className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
            {pkg ? "Regenerate" : "Generate Package"}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
        </div>
      )}

      {/* Generating */}
      {!loading && pkg?.status === "generating" && (
        <div className="border border-dashed border-zinc-700 rounded-xl p-12 text-center">
          <Loader2 className="w-10 h-10 text-violet-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Generating Today&apos;s Package</h2>
          <p className="text-zinc-400">
            Analyzing products, hooks, and trends. Usually takes 30-60 seconds.
          </p>
        </div>
      )}

      {/* Empty — no package */}
      {!loading && !pkg && (
        <div className="border border-dashed border-zinc-700 rounded-xl p-12 text-center">
          <Package className="w-12 h-12 text-violet-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Content Package for Today</h2>
          <p className="text-zinc-400 mb-6 max-w-md mx-auto">
            Generate today&apos;s package to get AI-scored script ideas for every product.
            The best one becomes your Script of the Day.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-6 py-3 rounded-lg font-medium transition-colors inline-flex items-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" /> Generate Today&apos;s Package
              </>
            )}
          </button>
        </div>
      )}

      {/* Package ready — show featured picks */}
      {!loading && pkg?.status === "complete" && scriptOfTheDay && (
        <div className="space-y-6">
          {/* #1 Script of the Day */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {/* Featured badge */}
            <div className="bg-amber-900/30 border-b border-amber-700/40 px-6 py-3 flex items-center gap-2 text-amber-300 text-sm">
              <Trophy className="w-4 h-4" />
              <span className="font-semibold">Script of the Day</span>
              <span className="text-amber-400/60 mx-1">—</span>
              <span>Highest-scored script from today&apos;s package</span>
            </div>

            <div className="p-6">
              {/* Product + Score */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-xs uppercase tracking-wider text-teal-400 font-medium">
                    {scriptOfTheDay.brand || "Product"}
                  </span>
                  <h2 className="text-xl font-bold mt-1">{scriptOfTheDay.product_name}</h2>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300 border border-white/5">
                    {getContentTypeName(scriptOfTheDay.content_type)}
                  </span>
                </div>
                <div className={`px-3 py-2 rounded-xl border text-center ${getScoreBg(scriptOfTheDay.score)}`}>
                  {scriptOfTheDay.score >= 8 && <Star className="w-4 h-4 mx-auto mb-0.5 text-amber-300" />}
                  <div className={`text-2xl font-bold ${getScoreColor(scriptOfTheDay.score)}`}>
                    {scriptOfTheDay.score}
                  </div>
                  <span className="text-xs text-zinc-500">Score</span>
                </div>
              </div>

              {/* The Hook */}
              <div className="bg-zinc-800 rounded-lg p-5 mb-4">
                <span className="text-xs uppercase tracking-wider text-amber-400 font-medium mb-2 block">
                  Hook Line
                </span>
                <p className="text-lg md:text-xl font-semibold leading-relaxed">
                  &quot;{scriptOfTheDay.hook}&quot;
                </p>
              </div>

              {/* Script Direction */}
              {scriptOfTheDay.script_body && (
                <div className="bg-zinc-800/50 rounded-lg p-4 mb-4 text-sm text-zinc-300 whitespace-pre-line leading-relaxed">
                  {scriptOfTheDay.script_body}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => addToPipeline(scriptOfTheDay)}
                  disabled={addingToPipeline.has(scriptOfTheDay.id) || scriptOfTheDay.added_to_pipeline}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors ${
                    scriptOfTheDay.added_to_pipeline
                      ? "bg-green-800 text-green-200"
                      : "bg-teal-600 hover:bg-teal-500 disabled:opacity-50"
                  }`}
                >
                  {scriptOfTheDay.added_to_pipeline ? (
                    <><Check className="w-4 h-4" /> Added to Pipeline</>
                  ) : addingToPipeline.has(scriptOfTheDay.id) ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Film This — Add to Pipeline</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Runner-Ups */}
          {runnerUps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-zinc-500" />
                Runner-Ups
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                {runnerUps.map((item) => (
                  <div
                    key={item.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 pr-2">
                        <span className="text-xs text-teal-400 font-medium">
                          {item.brand || "Product"}
                        </span>
                        <h4 className="font-semibold truncate">{item.product_name}</h4>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-400 border border-white/5">
                          {getContentTypeName(item.content_type)}
                        </span>
                      </div>
                      <div className={`flex-shrink-0 px-2.5 py-1 rounded-lg border text-sm font-bold ${getScoreBg(item.score)} ${getScoreColor(item.score)}`}>
                        {item.score}
                      </div>
                    </div>

                    <div className="bg-zinc-800 rounded-lg p-3 mb-4">
                      <p className="text-sm font-medium leading-relaxed">
                        &quot;{item.hook}&quot;
                      </p>
                    </div>

                    <button
                      onClick={() => addToPipeline(item)}
                      disabled={addingToPipeline.has(item.id) || item.added_to_pipeline}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        item.added_to_pipeline
                          ? "bg-green-800/50 text-green-300"
                          : "bg-zinc-800 hover:bg-teal-600/20 hover:text-teal-300 border border-white/5 hover:border-teal-500/30"
                      }`}
                    >
                      {item.added_to_pipeline ? (
                        <><Check className="w-3.5 h-3.5" /> In Pipeline</>
                      ) : addingToPipeline.has(item.id) ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding...</>
                      ) : (
                        <><Plus className="w-3.5 h-3.5" /> Add to Pipeline</>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other Top Picks (one per remaining product) */}
          {otherPicks.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Other Product Picks
              </h3>
              <div className="space-y-2">
                {otherPicks.map((item) => (
                  <div
                    key={item.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center gap-4"
                  >
                    <div className={`flex-shrink-0 px-2 py-1 rounded-lg border text-xs font-bold ${getScoreBg(item.score)} ${getScoreColor(item.score)}`}>
                      {item.score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-teal-400 font-medium">{item.brand}</span>
                        <span className="text-xs text-zinc-600">·</span>
                        <span className="text-xs text-zinc-500">{getContentTypeName(item.content_type)}</span>
                      </div>
                      <p className="font-medium text-sm truncate">{item.product_name}</p>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">
                        &quot;{item.hook}&quot;
                      </p>
                    </div>
                    <button
                      onClick={() => addToPipeline(item)}
                      disabled={addingToPipeline.has(item.id) || item.added_to_pipeline}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        item.added_to_pipeline
                          ? "bg-green-800/50 text-green-300"
                          : "bg-zinc-800 hover:bg-teal-600/20 hover:text-teal-300 border border-white/5"
                      }`}
                    >
                      {item.added_to_pipeline ? (
                        <><Check className="w-3 h-3" /> Added</>
                      ) : (
                        <><Plus className="w-3 h-3" /> Pipeline</>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Link to full package */}
          <Link
            href="/admin/content-package"
            className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            Not feeling it? See all {pkg.items.length} scripts
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
