"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import AppLayout from "@/app/components/AppLayout";
import { useTheme, getThemeColors } from "@/app/components/ThemeProvider";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonWinnerCard } from "@/components/ui/Skeleton";

// --- Types ---

interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
}

interface ReferenceExtract {
  spoken_hook: string;
  hook_family: string;
  quality_score: number;
}

interface AIAnalysis {
  hook_line?: string;
  hook_style?: string;
  content_format?: string;
  comedy_style?: string;
  pacing?: string;
  key_phrases?: string[];
  what_works?: string[];
  product_integration?: string;
  target_emotion?: string;
  replicable_elements?: string[];
  estimated_production?: string;
}

interface ReferenceVideo {
  id: string;
  url: string;
  submitted_by: string;
  notes: string | null;
  category: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  reference_extracts: ReferenceExtract[];
  transcript_text?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  ai_analysis?: AIAnalysis;
  title?: string;
  creator_handle?: string;
  thumbnail_url?: string;
}

type StatusFilter = "all" | "ready" | "processing" | "needs_data" | "failed";

const CATEGORY_OPTIONS = [
  "fitness", "wellness", "beauty", "lifestyle", "food", "tech", "fashion", "comedy", "education", "other",
];

// Muted status badge colors matching Work Queue
function getStatusBadgeStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case "ready":
      return { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981" };
    case "processing":
      return { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6" };
    case "needs_file":
    case "needs_transcription":
      return { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b" };
    case "failed":
      return { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" };
    default:
      return { bg: "rgba(107, 114, 128, 0.15)", text: "#6b7280" };
  }
}

function getStatusLabel(status: string): string {
  if (status === "needs_file" || status === "needs_transcription") return "Needs Data";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// Get hook preview from multiple sources
function getHookPreview(winner: ReferenceVideo): string | null {
  // 1. Try AI analysis hook_line
  if (winner.ai_analysis?.hook_line) {
    return winner.ai_analysis.hook_line;
  }
  // 2. Try reference_extracts spoken_hook
  if (winner.reference_extracts?.[0]?.spoken_hook) {
    return winner.reference_extracts[0].spoken_hook;
  }
  // 3. Try first sentence of transcript
  if (winner.transcript_text) {
    const firstSentence = winner.transcript_text.split(/[.!?]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 5) {
      return firstSentence;
    }
  }
  return null;
}

// Calculate quality score from metrics or stored value
function getQualityScore(winner: ReferenceVideo): number | null {
  // 1. Try reference_extracts quality_score
  if (winner.reference_extracts?.[0]?.quality_score != null) {
    return winner.reference_extracts[0].quality_score;
  }
  // 2. Calculate from engagement metrics
  if (winner.views && winner.views > 0) {
    const engagement = (winner.likes || 0) + (winner.comments || 0) + (winner.shares || 0);
    const rate = (engagement / winner.views) * 100;
    // Cap at 100, round to integer
    return Math.min(100, Math.round(rate));
  }
  return null;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function truncateUrl(url: string, maxLen = 50): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path.length > maxLen - 15) {
      return parsed.hostname + path.slice(0, maxLen - 18) + "...";
    }
    return parsed.hostname + path;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen - 3) + "..." : url;
  }
}

export default function WinnersPage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data
  const [winners, setWinners] = useState<ReferenceVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Submit form
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit modal
  const [editingWinner, setEditingWinner] = useState<ReferenceVideo | null>(null);
  const [editForm, setEditForm] = useState({
    transcript: "",
    views: "",
    likes: "",
    comments: "",
    shares: "",
    category: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push("/login?redirect=/admin/winners");
          return;
        }

        const roleRes = await fetch("/api/auth/me");
        const roleData = await roleRes.json();

        if (roleData.role !== "admin") {
          setAuthUser(null);
          setAuthLoading(false);
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
          role: roleData.role,
        });
      } catch (err) {
        console.error("Auth error:", err);
        router.push("/login?redirect=/admin/winners");
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // Fetch winners
  const fetchWinners = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/winners?limit=200");
      const data = await res.json();
      if (data.ok) {
        setWinners(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch winners:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser) {
      fetchWinners();
    }
  }, [authUser, fetchWinners]);

  // Stats
  const stats = useMemo(() => {
    const total = winners.length;
    const ready = winners.filter(w => w.status === "ready").length;
    const pending = winners.filter(w => w.status === "needs_file" || w.status === "needs_transcription" || w.status === "processing").length;
    const failed = winners.filter(w => w.status === "failed").length;
    return { total, ready, pending, failed };
  }, [winners]);

  // Filtered winners
  const filteredWinners = useMemo(() => {
    let result = [...winners];

    if (statusFilter !== "all") {
      if (statusFilter === "needs_data") {
        result = result.filter(w => w.status === "needs_file" || w.status === "needs_transcription");
      } else {
        result = result.filter(w => w.status === statusFilter);
      }
    }

    // Sort by date descending
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return result;
  }, [winners, statusFilter]);

  // Submit winner
  const handleSubmit = async () => {
    if (!submitUrl.trim()) {
      setSubmitMessage({ type: "error", text: "Please enter a URL" });
      return;
    }

    setSubmitting(true);
    setSubmitMessage(null);

    try {
      const res = await fetch("/api/winners/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: submitUrl.trim(),
          submitted_by: authUser?.email || "admin",
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setSubmitMessage({ type: "error", text: data.error || "Failed to submit" });
        return;
      }

      setSubmitUrl("");
      const creatorInfo = data.data?.creator_handle ? ` (@${data.data.creator_handle})` : "";
      setSubmitMessage({
        type: "success",
        text: `Winner added${creatorInfo}! Click the row to add transcript and metrics.`
      });
      setTimeout(() => setSubmitMessage(null), 8000);
      fetchWinners();
    } catch {
      setSubmitMessage({ type: "error", text: "Network error" });
    } finally {
      setSubmitting(false);
    }
  };

  // Open edit modal
  const openEditModal = (winner: ReferenceVideo) => {
    setEditingWinner(winner);
    setEditForm({
      transcript: winner.transcript_text || "",
      views: winner.views?.toString() || "",
      likes: winner.likes?.toString() || "",
      comments: winner.comments?.toString() || "",
      shares: winner.shares?.toString() || "",
      category: winner.category || "",
    });
    setAnalysisResult(winner.ai_analysis || (winner.reference_extracts?.[0] ? {
      hook_line: winner.reference_extracts[0].spoken_hook,
      hook_style: winner.reference_extracts[0].hook_family,
    } : null));
    setAnalysisError(null);
    setSaveMessage(null);
  };

  // Analyze with AI
  const handleAnalyze = async () => {
    if (!editingWinner || !editForm.transcript.trim()) return;

    setAnalyzing(true);
    setAnalysisError(null);
    setSaveMessage(null);

    const payload = {
      transcript: editForm.transcript.trim(),
      metrics: {
        views: editForm.views ? parseInt(editForm.views, 10) : undefined,
        likes: editForm.likes ? parseInt(editForm.likes, 10) : undefined,
        comments: editForm.comments ? parseInt(editForm.comments, 10) : undefined,
        shares: editForm.shares ? parseInt(editForm.shares, 10) : undefined,
      },
    };

    try {
      const res = await fetch("/api/ai/analyze-winner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.ok && data.data?.analysis) {
        setAnalysisResult(data.data.analysis);
        setAnalysisError(null);
      } else {
        setAnalysisError(data.error || "Analysis failed - no data returned");
      }
    } catch (err) {
      console.error("[Winners] Analysis error:", err);
      setAnalysisError(err instanceof Error ? err.message : "Network error - check console");
    } finally {
      setAnalyzing(false);
    }
  };

  // Save winner data
  const handleSave = async () => {
    if (!editingWinner) return;

    setEditSaving(true);
    setSaveMessage(null);
    setAnalysisError(null);

    try {
      // Build payload with all fields
      const payload: Record<string, unknown> = {};

      // Transcript
      if (editForm.transcript.trim()) {
        payload.transcript_text = editForm.transcript.trim();
      }

      // Category
      if (editForm.category) {
        payload.category = editForm.category;
      }

      // Metrics (convert strings to numbers)
      if (editForm.views) {
        payload.views = parseInt(editForm.views, 10);
      }
      if (editForm.likes) {
        payload.likes = parseInt(editForm.likes, 10);
      }
      if (editForm.comments) {
        payload.comments = parseInt(editForm.comments, 10);
      }
      if (editForm.shares) {
        payload.shares = parseInt(editForm.shares, 10);
      }

      // AI Analysis (if we have one)
      if (analysisResult) {
        payload.ai_analysis = analysisResult;
      }

      const res = await fetch(`/api/winners/${editingWinner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setSaveMessage({ type: "error", text: data.error || "Failed to save" });
        return;
      }

      setSaveMessage({ type: "success", text: data.message || "Saved successfully" });

      // Close modal and refresh after brief delay
      setTimeout(() => {
        setEditingWinner(null);
        setAnalysisResult(null);
        setSaveMessage(null);
        fetchWinners();
      }, 1000);
    } catch (err) {
      console.error("[Winners] Save error:", err);
      setSaveMessage({ type: "error", text: err instanceof Error ? err.message : "Network error" });
    } finally {
      setEditSaving(false);
    }
  };

  // Delete winner
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this winner?")) return;

    try {
      const res = await fetch(`/api/winners/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (editingWinner?.id === id) {
          setEditingWinner(null);
        }
        fetchWinners();
      }
    } catch {
      console.error("Delete failed");
    }
  };

  // Styles matching Work Queue
  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    backgroundColor: colors.surface,
    borderRadius: "10px",
    overflow: "hidden",
  };

  const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    textAlign: "left",
    backgroundColor: colors.surface,
    color: colors.textMuted,
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    borderBottom: `1px solid ${colors.border}`,
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: `1px solid ${colors.border}`,
    color: colors.text,
    fontSize: "13px",
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: "13px",
    outline: "none",
    width: "100%",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "opacity 0.15s",
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: colors.accent,
    color: "#fff",
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: colors.surface,
    color: colors.text,
    border: `1px solid ${colors.border}`,
  };

  // Loading
  if (authLoading) {
    return (
      <AppLayout>
        <div style={{ padding: "40px", textAlign: "center", color: colors.textMuted }}>
          Loading...
        </div>
      </AppLayout>
    );
  }

  // Not authenticated
  if (!authUser) {
    return (
      <AppLayout>
        <div style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ color: "#ef4444", fontSize: "18px", marginBottom: "8px" }}>Sign In Required</div>
          <div style={{ color: colors.textMuted }}>Please sign in to access your Winners Bank.</div>
          <Link href="/login" style={{ color: colors.accent, marginTop: "16px", display: "inline-block" }}>Sign In</Link>
        </div>
      </AppLayout>
    );
  }

  const handleRefresh = async () => {
    await fetchWinners();
  };

  return (
    <AppLayout>
      <PullToRefresh onRefresh={handleRefresh} className="min-h-screen">
      <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }} className="max-w-full overflow-hidden pb-24 lg:pb-6">
        {/* Header - Hidden on mobile since admin layout provides header */}
        <div className="hidden lg:flex" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 600, color: colors.text, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              Winners Bank
            </h1>
            <p style={{ fontSize: "13px", color: colors.textMuted, marginTop: "4px" }}>
              Save and analyze your top-performing videos to learn what works
            </p>
          </div>
        </div>
        {/* Mobile page title */}
        <h1 className="lg:hidden text-lg font-semibold text-zinc-100 mb-4">Winners Bank</h1>

        {/* Stats Row */}
        <div
          style={{ gap: "12px", marginBottom: "20px" }}
          className="grid grid-cols-2 lg:grid-cols-4"
        >
          <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "14px" }}>
            <div style={{ fontSize: "22px", fontWeight: 600, color: colors.text }}>{stats.total}</div>
            <div style={{ fontSize: "11px", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" }}>Total</div>
          </div>
          <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "14px" }}>
            <div style={{ fontSize: "22px", fontWeight: 600, color: "#10b981" }}>{stats.ready}</div>
            <div style={{ fontSize: "11px", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" }}>Ready</div>
          </div>
          <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "14px" }}>
            <div style={{ fontSize: "22px", fontWeight: 600, color: "#f59e0b" }}>{stats.pending}</div>
            <div style={{ fontSize: "11px", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" }}>Pending</div>
          </div>
          <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "14px" }}>
            <div style={{ fontSize: "22px", fontWeight: 600, color: "#ef4444" }}>{stats.failed}</div>
            <div style={{ fontSize: "11px", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" }}>Failed</div>
          </div>
        </div>

        {/* Add Winner Form */}
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <input
              type="url"
              value={submitUrl}
              onChange={(e) => setSubmitUrl(e.target.value)}
              placeholder="Paste TikTok URL..."
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <button
              onClick={handleSubmit}
              disabled={submitting || !submitUrl.trim()}
              style={{
                ...primaryButtonStyle,
                opacity: submitting || !submitUrl.trim() ? 0.5 : 1,
                cursor: submitting || !submitUrl.trim() ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Adding..." : "Add Winner"}
            </button>
          </div>
          {submitMessage && (
            <div style={{
              marginTop: "10px",
              fontSize: "13px",
              color: submitMessage.type === "success" ? "#10b981" : "#ef4444",
            }}>
              {submitMessage.text}
            </div>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {(["all", "ready", "processing", "needs_data", "failed"] as StatusFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 500,
                border: `1px solid ${statusFilter === status ? colors.accent : colors.border}`,
                borderRadius: "6px",
                cursor: "pointer",
                backgroundColor: statusFilter === status ? colors.accent : colors.surface,
                color: statusFilter === status ? "#fff" : colors.text,
                transition: "all 0.15s",
              }}
            >
              {status === "all" ? "All" : status === "needs_data" ? "Needs Data" : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: "12px", color: colors.textMuted, alignSelf: "center" }}>
            {filteredWinners.length} winner{filteredWinners.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Winners Table/Cards */}
        {loading ? (
          <>
            {/* Mobile skeleton */}
            <div className="lg:hidden space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonWinnerCard key={i} />
              ))}
            </div>
            {/* Desktop skeleton */}
            <div className="hidden lg:block" style={{ textAlign: "center", padding: "48px", color: colors.textMuted }}>Loading...</div>
          </>
        ) : filteredWinners.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={winners.length === 0 ? "No winners yet" : "No matching winners"}
            description={winners.length === 0
              ? "Add your first TikTok URL above to start building your winners bank."
              : "Try adjusting your filters to find what you're looking for."
            }
          />
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3">
              {filteredWinners.map((winner) => {
                const badgeStyle = getStatusBadgeStyle(winner.status);
                const hookPreview = getHookPreview(winner);
                const qualityScore = getQualityScore(winner);

                return (
                  <div
                    key={winner.id}
                    onClick={() => openEditModal(winner)}
                    className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 cursor-pointer active:bg-zinc-800 transition-colors card-press"
                  >
                    {/* Top row: Status + Quality */}
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="px-2.5 py-1 rounded text-xs font-medium"
                        style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text }}
                      >
                        {getStatusLabel(winner.status)}
                      </span>
                      {qualityScore != null ? (
                        <span className={`text-sm font-semibold ${
                          qualityScore >= 10 ? 'text-emerald-400' : qualityScore >= 5 ? 'text-amber-400' : 'text-zinc-500'
                        }`}>
                          {qualityScore}% quality
                        </span>
                      ) : null}
                    </div>

                    {/* Creator handle */}
                    {winner.creator_handle && (
                      <p className="text-sm text-teal-400 mb-2">@{winner.creator_handle}</p>
                    )}

                    {/* Hook preview */}
                    {hookPreview ? (
                      <p className="text-sm text-zinc-200 mb-3 line-clamp-2">
                        &ldquo;{hookPreview.slice(0, 80)}{hookPreview.length > 80 ? "..." : ""}&rdquo;
                      </p>
                    ) : (
                      <p className="text-sm text-zinc-500 italic mb-3">Tap to add transcript</p>
                    )}

                    {/* Bottom row: Category + Date */}
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span className="capitalize">{winner.category || "Uncategorized"}</span>
                      <span>{formatDate(winner.created_at)}</span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                      <a
                        href={winner.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 h-11 rounded-lg bg-zinc-800 text-zinc-200 text-sm font-medium flex items-center justify-center hover:bg-zinc-700 transition-colors btn-press"
                      >
                        View TikTok
                      </a>
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditModal(winner); }}
                        className="flex-1 h-11 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors btn-press"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "10px", overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Video URL</th>
                  <th style={thStyle}>Hook Preview</th>
                  <th style={thStyle}>Category</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Quality</th>
                  <th style={thStyle}>Date</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWinners.map((winner) => {
                  const badgeStyle = getStatusBadgeStyle(winner.status);
                  const hookPreview = getHookPreview(winner);
                  const qualityScore = getQualityScore(winner);

                  return (
                    <tr
                      key={winner.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => openEditModal(winner)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <td style={tdStyle}>
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 500,
                          backgroundColor: badgeStyle.bg,
                          color: badgeStyle.text,
                        }}>
                          {getStatusLabel(winner.status)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div>
                          <a
                            href={winner.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: colors.accent, textDecoration: "none", fontSize: "12px", fontFamily: "monospace" }}
                          >
                            {truncateUrl(winner.url)}
                          </a>
                          {winner.creator_handle && (
                            <div style={{ fontSize: "11px", color: colors.textMuted, marginTop: "2px" }}>
                              @{winner.creator_handle}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: "250px" }}>
                        {hookPreview ? (
                          <span style={{ color: colors.text, fontSize: "12px" }} title={hookPreview}>
                            &ldquo;{hookPreview.slice(0, 60)}{hookPreview.length > 60 ? "..." : ""}&rdquo;
                          </span>
                        ) : (
                          <span style={{ color: colors.textMuted, fontSize: "12px", fontStyle: "italic" }}>
                            Click to add transcript
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: colors.textMuted, fontSize: "12px" }}>
                          {winner.category || "—"}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {qualityScore != null ? (
                          <span style={{
                            fontWeight: 600,
                            fontSize: "13px",
                            color: qualityScore >= 10 ? "#10b981" : qualityScore >= 5 ? "#f59e0b" : colors.textMuted,
                          }}>
                            {qualityScore}%
                          </span>
                        ) : (
                          <span style={{ color: colors.textMuted }}>—</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: colors.textMuted, fontSize: "12px" }}>
                          {formatDate(winner.created_at)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(winner.id); }}
                          style={{
                            background: "none",
                            border: "none",
                            color: colors.textMuted,
                            cursor: "pointer",
                            fontSize: "12px",
                            padding: "4px 8px",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = colors.textMuted; }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}

        {/* Edit Modal */}
        {editingWinner && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              zIndex: 50,
            }}
            onClick={() => { setEditingWinner(null); setAnalysisResult(null); setAnalysisError(null); setSaveMessage(null); }}
          >
            <div
              style={{
                backgroundColor: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: "12px",
                maxWidth: "600px",
                width: "100%",
                maxHeight: "85vh",
                overflow: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: colors.text }}>Edit Winner</div>
                  <a
                    href={editingWinner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "12px", color: colors.accent }}
                  >
                    Open in TikTok ↗
                  </a>
                </div>
                <button
                  onClick={() => { setEditingWinner(null); setAnalysisResult(null); setAnalysisError(null); setSaveMessage(null); }}
                  style={{ background: "none", border: "none", fontSize: "20px", color: colors.textMuted, cursor: "pointer", padding: "4px" }}
                >
                  ×
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: "20px" }}>
                {/* Helper Instructions (show if no transcript) */}
                {!editForm.transcript.trim() && (
                  <div style={{
                    padding: "14px",
                    backgroundColor: "rgba(59, 130, 246, 0.08)",
                    border: "1px solid rgba(59, 130, 246, 0.2)",
                    borderRadius: "8px",
                    marginBottom: "16px",
                  }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#3b82f6", marginBottom: "8px" }}>
                      How to get video data:
                    </div>
                    <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: colors.text, lineHeight: 1.6 }}>
                      <li>Open the TikTok video (link above)</li>
                      <li>Copy the caption/spoken text as the transcript</li>
                      <li>Note the views, likes, comments, shares from TikTok</li>
                      <li>Click &quot;Analyze with AI&quot; to extract hook patterns</li>
                    </ol>
                  </div>
                )}

                {/* Transcript */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Transcript
                  </label>
                  <textarea
                    value={editForm.transcript}
                    onChange={(e) => setEditForm({ ...editForm, transcript: e.target.value })}
                    placeholder="Paste the video transcript here..."
                    rows={5}
                    style={{ ...inputStyle, fontFamily: "monospace", fontSize: "12px", resize: "vertical" }}
                  />
                </div>

                {/* Metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
                  {[
                    { key: "views", label: "Views" },
                    { key: "likes", label: "Likes" },
                    { key: "comments", label: "Comments" },
                    { key: "shares", label: "Shares" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px", textTransform: "uppercase" }}>
                        {label}
                      </label>
                      <input
                        type="number"
                        value={editForm[key as keyof typeof editForm]}
                        onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                        placeholder="0"
                        style={{ ...inputStyle, fontSize: "12px" }}
                      />
                    </div>
                  ))}
                </div>

                {/* Category */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Category
                  </label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    style={{ ...inputStyle, fontSize: "12px" }}
                  >
                    <option value="">Select...</option>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                    ))}
                  </select>
                </div>

                {/* Analyze Button */}
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing || !editForm.transcript.trim()}
                  style={{
                    ...secondaryButtonStyle,
                    width: "100%",
                    justifyContent: "center",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "16px",
                    opacity: analyzing || !editForm.transcript.trim() ? 0.5 : 1,
                  }}
                >
                  {analyzing ? "Analyzing..." : "Analyze with AI"}
                </button>

                {/* Analysis Error */}
                {analysisError && (
                  <div style={{
                    padding: "12px",
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "6px",
                    marginBottom: "16px",
                  }}>
                    <div style={{ fontSize: "12px", fontWeight: 500, color: "#ef4444", marginBottom: "4px" }}>Analysis Error</div>
                    <div style={{ fontSize: "12px", color: "#ef4444" }}>{analysisError}</div>
                  </div>
                )}

                {/* Save Message */}
                {saveMessage && (
                  <div style={{
                    padding: "12px",
                    backgroundColor: saveMessage.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                    border: `1px solid ${saveMessage.type === "success" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                    borderRadius: "6px",
                    marginBottom: "16px",
                  }}>
                    <div style={{ fontSize: "12px", fontWeight: 500, color: saveMessage.type === "success" ? "#10b981" : "#ef4444" }}>
                      {saveMessage.text}
                    </div>
                  </div>
                )}

                {/* Analysis Results */}
                {analysisResult && (
                  <div style={{
                    padding: "14px",
                    backgroundColor: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    borderRadius: "8px",
                    marginBottom: "16px",
                  }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#10b981", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      AI Analysis
                    </div>

                    {analysisResult.hook_line && (
                      <div style={{ marginBottom: "12px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>HOOK LINE</div>
                        <div style={{ fontSize: "13px", color: colors.text, backgroundColor: colors.surface, padding: "10px", borderRadius: "6px" }}>
                          &ldquo;{analysisResult.hook_line}&rdquo;
                        </div>
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
                      {analysisResult.hook_style && (
                        <div>
                          <div style={{ fontSize: "10px", fontWeight: 500, color: colors.textMuted, marginBottom: "2px" }}>HOOK STYLE</div>
                          <div style={{ fontSize: "12px", color: colors.text }}>{analysisResult.hook_style}</div>
                        </div>
                      )}
                      {analysisResult.content_format && (
                        <div>
                          <div style={{ fontSize: "10px", fontWeight: 500, color: colors.textMuted, marginBottom: "2px" }}>FORMAT</div>
                          <div style={{ fontSize: "12px", color: colors.text }}>{analysisResult.content_format}</div>
                        </div>
                      )}
                      {analysisResult.comedy_style && (
                        <div>
                          <div style={{ fontSize: "10px", fontWeight: 500, color: colors.textMuted, marginBottom: "2px" }}>COMEDY</div>
                          <div style={{ fontSize: "12px", color: colors.text }}>{analysisResult.comedy_style}</div>
                        </div>
                      )}
                      {analysisResult.target_emotion && (
                        <div>
                          <div style={{ fontSize: "10px", fontWeight: 500, color: colors.textMuted, marginBottom: "2px" }}>EMOTION</div>
                          <div style={{ fontSize: "12px", color: colors.text }}>{analysisResult.target_emotion}</div>
                        </div>
                      )}
                    </div>

                    {analysisResult.what_works && analysisResult.what_works.length > 0 && (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>WHAT WORKS</div>
                        <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px", color: colors.text }}>
                          {analysisResult.what_works.map((item, i) => (
                            <li key={i} style={{ marginBottom: "2px" }}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{ padding: "14px 20px", borderTop: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between" }}>
                <button
                  onClick={() => handleDelete(editingWinner.id)}
                  style={{ ...buttonStyle, backgroundColor: "transparent", color: "#ef4444", padding: "8px 12px" }}
                >
                  Delete
                </button>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => { setEditingWinner(null); setAnalysisResult(null); setAnalysisError(null); setSaveMessage(null); }}
                    style={secondaryButtonStyle}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={editSaving}
                    style={{ ...primaryButtonStyle, opacity: editSaving ? 0.5 : 1 }}
                  >
                    {editSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </PullToRefresh>
    </AppLayout>
  );
}
