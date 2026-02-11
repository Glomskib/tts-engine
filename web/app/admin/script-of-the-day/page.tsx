"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchJson, postJson, isApiError } from "@/lib/http/fetchJson";
import { useToast } from "@/contexts/ToastContext";
import {
  Sparkles,
  RefreshCw,
  Plus,
  ChevronRight,
  Check,
  Film,
  MapPin,
  Lightbulb,
  Clock,
  Trophy,
  Calendar,
  ArrowRight,
  Mic,
  CheckSquare,
  Square,
} from "lucide-react";

interface ScriptOfTheDay {
  id: string;
  script_date: string;
  product_id: string;
  product_name: string;
  product_brand: string | null;
  product_category: string | null;
  hook: string;
  full_script: string;
  filming_tips: string;
  selection_reasons: string;
  compound_score: number;
  ai_score: string | null;
  winner_remix_id: string | null;
  winner_remix_hook: string | null;
  suggested_account_id: string | null;
  suggested_account_name: string | null;
  status: string;
  created_at: string;
}

interface SkitData {
  hook_line?: string;
  beats?: Array<{
    t?: string;
    action?: string;
    dialogue?: string;
    on_screen_text?: string;
  }>;
  cta_line?: string;
  cta_overlay?: string;
  b_roll?: string[];
  overlays?: string[];
}

interface FilmingTips {
  props: string[];
  locations: string[];
  lighting: string;
  audio: string;
  duration_estimate: string;
  key_delivery_notes: string[];
  checklist: string[];
}

interface AIScore {
  hook_strength?: number;
  humor_level?: number;
  product_integration?: number;
  virality_potential?: number;
  clarity?: number;
  overall_score?: number;
  strengths?: string[];
  improvements?: string[];
}

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    return fallback;
  }
}

export default function ScriptOfTheDayPage() {
  const [todayScript, setTodayScript] = useState<ScriptOfTheDay | null>(null);
  const [history, setHistory] = useState<ScriptOfTheDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [addingToPipeline, setAddingToPipeline] = useState(false);
  const [pipelineAdded, setPipelineAdded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { showError, showSuccess } = useToast();

  const fetchToday = useCallback(async () => {
    setLoading(true);
    const resp = await fetchJson<ScriptOfTheDay>("/api/script-of-the-day");
    if (!isApiError(resp) && resp.data) {
      setTodayScript(resp.data);
    }
    setLoading(false);
  }, []);

  const fetchHistory = useCallback(async () => {
    const resp = await fetchJson<ScriptOfTheDay[]>("/api/script-of-the-day?history=true");
    if (!isApiError(resp) && resp.data) {
      setHistory(resp.data);
    }
  }, []);

  useEffect(() => {
    fetchToday();
    fetchHistory();
  }, [fetchToday, fetchHistory]);

  const handleGenerate = async () => {
    setGenerating(true);
    setPipelineAdded(false);
    setErrorMsg(null);
    try {
      const resp = await postJson<ScriptOfTheDay>("/api/script-of-the-day", {});
      if (isApiError(resp)) {
        const msg = resp.message || "Failed to generate script. Please try again.";
        setErrorMsg(msg);
        showError(msg);
      } else if (resp.data) {
        setTodayScript(resp.data);
        showSuccess("Script generated!");
        fetchHistory();
      } else {
        setErrorMsg("No script returned. Try again.");
        showError("No script returned. Try again.");
      }
    } catch {
      setErrorMsg("AI is busy, try again in a moment.");
      showError("AI is busy, try again in a moment.");
    }
    setGenerating(false);
  };

  const handleAddToPipeline = async () => {
    if (!todayScript) return;
    setAddingToPipeline(true);

    const skit: SkitData = safeParse(todayScript.full_script, {});
    const scriptBody = formatScriptText(skit);

    const resp = await postJson<{ id: string }>("/api/videos/create-from-product", {
      product_id: todayScript.product_id,
      title: `SOTD: ${todayScript.hook.slice(0, 60)}`,
      script: scriptBody,
      hook_line: todayScript.hook,
      posting_account_id: todayScript.suggested_account_id || undefined,
    });

    if (!isApiError(resp)) {
      setPipelineAdded(true);
      showSuccess("Added to pipeline!");
      // Update status in DB
      await postJson("/api/script-of-the-day", {
        action: "update_status",
        id: todayScript.id,
        status: "accepted",
      });
    } else {
      showError(resp.message || "Failed to add to pipeline. Try again.");
    }
    setAddingToPipeline(false);
  };

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const skit: SkitData = safeParse(todayScript?.full_script, {});
  const tips: FilmingTips = safeParse(todayScript?.filming_tips, {
    props: [],
    locations: [],
    lighting: "",
    audio: "",
    duration_estimate: "",
    key_delivery_notes: [],
    checklist: [],
  });
  const aiScore: AIScore = safeParse(todayScript?.ai_score, {});
  const reasons: string[] = safeParse(todayScript?.selection_reasons, []);

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
            Your AI-picked, best-odds script to film today
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
          {todayScript ? "Regenerate" : "Generate"}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-zinc-500" />
        </div>
      )}

      {/* Error banner */}
      {errorMsg && !generating && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-700/40 rounded-xl flex items-start gap-3">
          <span className="text-red-400 text-sm flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-300 text-xs">dismiss</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !todayScript && (
        <div className="border border-dashed border-zinc-700 rounded-xl p-12 text-center">
          <Sparkles className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No script generated yet</h2>
          <p className="text-zinc-400 mb-6">
            Click Generate to get your AI-recommended script for today.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-6 py-3 rounded-lg font-medium transition-colors inline-flex items-center gap-2"
          >
            {generating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Generate Script of the Day
              </>
            )}
          </button>
        </div>
      )}

      {/* Today's Script */}
      {!loading && todayScript && (
        <div className="space-y-6">
          {/* Product + Hook Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {/* Winner Remix Banner */}
            {todayScript.winner_remix_hook && (
              <div className="bg-amber-900/30 border-b border-amber-700/40 px-6 py-3 flex items-center gap-2 text-amber-300 text-sm">
                <Trophy className="w-4 h-4" />
                <span>
                  Based on winner: &quot;{todayScript.winner_remix_hook.slice(0, 80)}
                  {todayScript.winner_remix_hook.length > 80 ? "..." : ""}&quot;
                </span>
              </div>
            )}

            <div className="p-6">
              {/* Product info */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-xs uppercase tracking-wider text-teal-400 font-medium">
                    {todayScript.product_brand || "Product"}
                    {todayScript.product_category ? ` · ${todayScript.product_category}` : ""}
                  </span>
                  <h2 className="text-xl font-bold mt-1">{todayScript.product_name}</h2>
                </div>
                {aiScore.overall_score && (
                  <div className="text-right">
                    <div className="text-2xl font-bold text-teal-400">
                      {aiScore.overall_score}/10
                    </div>
                    <span className="text-xs text-zinc-500">AI Score</span>
                  </div>
                )}
              </div>

              {/* The Hook — big and prominent */}
              <div className="bg-zinc-800 rounded-lg p-5 mb-4">
                <span className="text-xs uppercase tracking-wider text-amber-400 font-medium mb-2 block">
                  Hook Line
                </span>
                <p className="text-lg md:text-xl font-semibold leading-relaxed">
                  &quot;{todayScript.hook}&quot;
                </p>
              </div>

              {/* Selection reasons */}
              {reasons.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-xs text-zinc-500 mr-1 self-center">Why this script:</span>
                  {reasons.map((r, i) => (
                    <span
                      key={i}
                      className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleAddToPipeline}
                  disabled={addingToPipeline || pipelineAdded}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors ${
                    pipelineAdded
                      ? "bg-green-800 text-green-200"
                      : "bg-teal-600 hover:bg-teal-500 disabled:opacity-50"
                  }`}
                >
                  {pipelineAdded ? (
                    <>
                      <Check className="w-4 h-4" /> Added to Pipeline
                    </>
                  ) : addingToPipeline ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> Accept &amp; Add to Pipeline
                    </>
                  )}
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-4 py-3 rounded-lg font-medium transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
                  Regenerate
                </button>
              </div>
            </div>
          </div>

          {/* Full Script */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Film className="w-5 h-5 text-teal-400" />
              Full Script
            </h3>
            <div className="space-y-3">
              {(skit.beats || []).map((beat, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-xs text-zinc-500 font-mono w-12 shrink-0 pt-1">
                    {beat.t || `${i + 1}.`}
                  </span>
                  <div className="flex-1">
                    {beat.action && (
                      <p className="text-zinc-400 text-sm italic">{beat.action}</p>
                    )}
                    {beat.dialogue && (
                      <p className="text-white mt-1 flex items-start gap-2">
                        <Mic className="w-3.5 h-3.5 mt-1 text-teal-400 shrink-0" />
                        {beat.dialogue}
                      </p>
                    )}
                    {beat.on_screen_text && (
                      <p className="text-amber-300 text-sm mt-1">
                        [Text: {beat.on_screen_text}]
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {skit.cta_line && (
                <div className="flex gap-3 pt-3 border-t border-zinc-800">
                  <span className="text-xs text-zinc-500 font-mono w-12 shrink-0 pt-1">
                    CTA
                  </span>
                  <div>
                    <p className="text-white font-medium">{skit.cta_line}</p>
                    {skit.cta_overlay && (
                      <p className="text-amber-300 text-sm">[Overlay: {skit.cta_overlay}]</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Filming Prep — Two columns */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: Tips & Location */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-400" />
                Filming Tips
              </h3>

              {tips.props.length > 0 && (
                <div>
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
                    Props Needed
                  </span>
                  <ul className="mt-2 space-y-1">
                    {tips.props.map((p, i) => (
                      <li key={i} className="text-sm flex items-center gap-2 text-zinc-300">
                        <ChevronRight className="w-3 h-3 text-teal-400" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {tips.locations.length > 0 && (
                <div>
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
                    Location
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tips.locations.map((l, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-sm"
                      >
                        <MapPin className="w-3 h-3" /> {l}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {tips.duration_estimate && (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Clock className="w-4 h-4" />
                  Estimated duration: {tips.duration_estimate}
                </div>
              )}

              {tips.key_delivery_notes.length > 0 && (
                <div>
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
                    Key Delivery Notes
                  </span>
                  <ul className="mt-2 space-y-1">
                    {tips.key_delivery_notes.map((n, i) => (
                      <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                        <ArrowRight className="w-3 h-3 mt-1 text-teal-400 shrink-0" />
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {todayScript.suggested_account_name && (
                <div className="pt-3 border-t border-zinc-800">
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
                    Post to Account
                  </span>
                  <p className="text-sm text-zinc-300 mt-1">
                    {todayScript.suggested_account_name}
                  </p>
                </div>
              )}
            </div>

            {/* Right: Filming Checklist */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
                <CheckSquare className="w-5 h-5 text-green-400" />
                Filming Checklist
              </h3>
              <div className="space-y-2">
                {tips.checklist.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => toggleCheck(i)}
                    className="w-full flex items-center gap-3 text-left py-2 px-3 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    {checkedItems.has(i) ? (
                      <CheckSquare className="w-5 h-5 text-green-400 shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-zinc-600 shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        checkedItems.has(i) ? "text-zinc-500 line-through" : "text-zinc-300"
                      }`}
                    >
                      {item}
                    </span>
                  </button>
                ))}
              </div>
              {checkedItems.size === tips.checklist.length && tips.checklist.length > 0 && (
                <div className="mt-4 bg-green-900/30 border border-green-700/40 rounded-lg p-3 text-center text-green-300 text-sm font-medium">
                  Ready to film!
                </div>
              )}
            </div>
          </div>

          {/* AI Score breakdown */}
          {aiScore.overall_score && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-4">AI Quality Score</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: "Hook", value: aiScore.hook_strength },
                  { label: "Humor", value: aiScore.humor_level },
                  { label: "Product Fit", value: aiScore.product_integration },
                  { label: "Virality", value: aiScore.virality_potential },
                  { label: "Clarity", value: aiScore.clarity },
                ].map(
                  (metric) =>
                    metric.value != null && (
                      <div key={metric.label} className="text-center">
                        <div className="text-2xl font-bold text-teal-400">
                          {metric.value}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">{metric.label}</div>
                      </div>
                    ),
                )}
              </div>
              {aiScore.strengths && aiScore.strengths.length > 0 && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">
                    Strengths
                  </span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {aiScore.strengths.map((s, i) => (
                      <span key={i} className="text-xs bg-teal-900/40 text-teal-300 px-2 py-1 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History toggle */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
          >
            <Calendar className="w-4 h-4" />
            {showHistory ? "Hide" : "Show"} Previous Days
            <ChevronRight
              className={`w-3 h-3 transition-transform ${showHistory ? "rotate-90" : ""}`}
            />
          </button>

          {/* History list */}
          {showHistory && (
            <div className="space-y-3">
              {history.length === 0 && (
                <p className="text-zinc-500 text-sm">No previous scripts yet.</p>
              )}
              {history
                .filter((h) => h.id !== todayScript?.id)
                .map((item) => {
                  const itemSkit: SkitData = safeParse(item.full_script, {});
                  return (
                    <div
                      key={item.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-start gap-4"
                    >
                      <div className="text-center shrink-0">
                        <div className="text-xs text-zinc-500">
                          {new Date(item.script_date).toLocaleDateString("en-US", {
                            weekday: "short",
                          })}
                        </div>
                        <div className="text-lg font-bold">
                          {new Date(item.script_date).getDate()}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-teal-400 font-medium">
                            {item.product_brand || "Product"}
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              item.status === "accepted"
                                ? "bg-green-900/40 text-green-400"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <p className="font-medium truncate">{item.product_name}</p>
                        <p className="text-sm text-zinc-400 truncate mt-1">
                          &quot;{itemSkit.hook_line || item.hook}&quot;
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatScriptText(skit: SkitData): string {
  const lines: string[] = [];
  if (skit.hook_line) lines.push(`HOOK: ${skit.hook_line}\n`);
  for (const beat of skit.beats || []) {
    if (beat.t) lines.push(`[${beat.t}]`);
    if (beat.action) lines.push(beat.action);
    if (beat.dialogue) lines.push(`  "${beat.dialogue}"`);
    if (beat.on_screen_text) lines.push(`  [TEXT: ${beat.on_screen_text}]`);
    lines.push("");
  }
  if (skit.cta_line) lines.push(`CTA: ${skit.cta_line}`);
  if (skit.cta_overlay) lines.push(`[OVERLAY: ${skit.cta_overlay}]`);
  return lines.join("\n");
}
