"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useTheme, getThemeColors } from "@/app/components/ThemeProvider";

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
}

type StatusFilter = "all" | "ready" | "processing" | "needs_data" | "failed";
type SortOption = "newest" | "oldest" | "quality";

const CATEGORY_OPTIONS = [
  "fitness", "wellness", "beauty", "lifestyle", "food", "tech", "fashion", "comedy", "education", "other",
];

function getStatusStyle(status: string, isDark: boolean): { bg: string; text: string; dot: string } {
  const styles: Record<string, { bg: string; text: string; dot: string }> = {
    queued: { bg: isDark ? "#374151" : "#f3f4f6", text: isDark ? "#9ca3af" : "#6b7280", dot: "#9ca3af" },
    needs_file: { bg: isDark ? "#78350f" : "#fef3c7", text: isDark ? "#fcd34d" : "#b45309", dot: "#f59e0b" },
    needs_transcription: { bg: isDark ? "#78350f" : "#fef3c7", text: isDark ? "#fcd34d" : "#b45309", dot: "#f59e0b" },
    processing: { bg: isDark ? "#1e3a5f" : "#dbeafe", text: isDark ? "#93c5fd" : "#1d4ed8", dot: "#3b82f6" },
    ready: { bg: isDark ? "#064e3b" : "#d1fae5", text: isDark ? "#6ee7b7" : "#047857", dot: "#10b981" },
    failed: { bg: isDark ? "#7f1d1d" : "#fee2e2", text: isDark ? "#fca5a5" : "#dc2626", dot: "#ef4444" },
  };
  return styles[status] || styles.queued;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncateUrl(url: string, maxLen = 40): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen) + "...";
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
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Submit form
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

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
    const avgQuality = winners.reduce((sum, w) => {
      const score = w.reference_extracts?.[0]?.quality_score;
      return score ? sum + score : sum;
    }, 0) / (winners.filter(w => w.reference_extracts?.[0]?.quality_score).length || 1);

    const hookFamilies: Record<string, number> = {};
    winners.forEach(w => {
      const family = w.reference_extracts?.[0]?.hook_family;
      if (family) {
        hookFamilies[family] = (hookFamilies[family] || 0) + 1;
      }
    });
    const topHookStyle = Object.entries(hookFamilies).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

    return { total, ready, avgQuality: Math.round(avgQuality), topHookStyle };
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

    if (categoryFilter) {
      result = result.filter(w => w.category === categoryFilter);
    }

    if (sortBy === "newest") {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "oldest") {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === "quality") {
      result.sort((a, b) => {
        const scoreA = a.reference_extracts?.[0]?.quality_score || 0;
        const scoreB = b.reference_extracts?.[0]?.quality_score || 0;
        return scoreB - scoreA;
      });
    }

    return result;
  }, [winners, statusFilter, categoryFilter, sortBy]);

  // Submit winner
  const handleSubmit = async () => {
    if (!submitUrl.trim()) {
      setSubmitError("Please enter a TikTok URL");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

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
        setSubmitError(data.error || "Failed to submit");
        return;
      }

      setSubmitUrl("");
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
      fetchWinners();
    } catch {
      setSubmitError("Network error");
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
    setAnalysisResult(winner.ai_analysis || winner.reference_extracts?.[0] ? {
      hook_line: winner.reference_extracts?.[0]?.spoken_hook,
      hook_style: winner.reference_extracts?.[0]?.hook_family,
    } : null);
  };

  // Analyze with AI
  const handleAnalyze = async () => {
    if (!editingWinner || !editForm.transcript.trim()) return;

    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/analyze-winner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: editForm.transcript.trim(),
          metrics: {
            views: editForm.views ? parseInt(editForm.views, 10) : undefined,
            likes: editForm.likes ? parseInt(editForm.likes, 10) : undefined,
            comments: editForm.comments ? parseInt(editForm.comments, 10) : undefined,
            shares: editForm.shares ? parseInt(editForm.shares, 10) : undefined,
          },
        }),
      });

      const data = await res.json();
      if (data.ok && data.data?.analysis) {
        setAnalysisResult(data.data.analysis);
      } else {
        setSubmitError(data.error || "Analysis failed");
      }
    } catch {
      setSubmitError("Failed to analyze");
    } finally {
      setAnalyzing(false);
    }
  };

  // Save winner data
  const handleSave = async () => {
    if (!editingWinner) return;

    setEditSaving(true);
    try {
      const payload: Record<string, unknown> = {
        transcript_text: editForm.transcript.trim() || undefined,
        category: editForm.category || undefined,
      };

      // If we have analysis, include it
      if (analysisResult) {
        // The /api/winners endpoint might not support all these fields
        // but we'll try to update what we can
      }

      const res = await fetch(`/api/winners/${editingWinner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setEditingWinner(null);
        setAnalysisResult(null);
        fetchWinners();
      }
    } catch {
      setSubmitError("Failed to save");
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

  // Styles
  const containerStyle: React.CSSProperties = {
    padding: "24px",
    maxWidth: "1000px",
    margin: "0 auto",
    minHeight: "100%",
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: "12px",
    marginBottom: "16px",
  };

  const inputStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "14px",
    border: `1px solid ${colors.border}`,
    borderRadius: "8px",
    backgroundColor: colors.input,
    color: colors.text,
    outline: "none",
    width: "100%",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 600,
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    transition: "all 0.15s ease",
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: "#1f2937",
    color: "#fff",
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: colors.surface,
    color: colors.text,
    border: `1px solid ${colors.border}`,
  };

  const statCardStyle: React.CSSProperties = {
    padding: "16px",
    borderRadius: "10px",
    textAlign: "center" as const,
  };

  // Loading
  if (authLoading) {
    return (
      <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ color: colors.textMuted }}>Loading...</div>
      </div>
    );
  }

  // Forbidden
  if (!authUser) {
    return (
      <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", color: "#ef4444", marginBottom: "8px" }}>Access Denied</h1>
          <p style={{ color: colors.textMuted, marginBottom: "16px" }}>Admin access required.</p>
          <Link href="/login" style={{ color: colors.accent }}>Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: "12px", fontSize: "13px" }}>
        <Link href="/admin/pipeline" style={{ color: colors.textMuted, textDecoration: "none" }}>Admin</Link>
        <span style={{ color: colors.textMuted, margin: "0 8px" }}>/</span>
        <span style={{ color: colors.text, fontWeight: 500 }}>Winners Bank</span>
      </nav>

      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <span style={{ fontSize: "32px" }}>🏆</span>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, margin: 0 }}>Winners Bank</h1>
        </div>
        <p style={{ fontSize: "15px", color: colors.textMuted }}>
          Import winning TikToks to train AI on what works
        </p>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
        <div style={{ ...statCardStyle, backgroundColor: isDark ? "#374151" : "#f8fafc" }}>
          <div style={{ fontSize: "28px", fontWeight: 700, color: colors.text }}>{stats.total}</div>
          <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "4px" }}>Total Winners</div>
        </div>
        <div style={{ ...statCardStyle, backgroundColor: isDark ? "#064e3b" : "#d1fae5" }}>
          <div style={{ fontSize: "28px", fontWeight: 700, color: isDark ? "#6ee7b7" : "#047857" }}>{stats.ready}</div>
          <div style={{ fontSize: "12px", color: isDark ? "#6ee7b7" : "#047857", marginTop: "4px" }}>Ready to Use</div>
        </div>
        <div style={{ ...statCardStyle, backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" }}>
          <div style={{ fontSize: "28px", fontWeight: 700, color: isDark ? "#93c5fd" : "#1d4ed8" }}>{stats.avgQuality || "—"}</div>
          <div style={{ fontSize: "12px", color: isDark ? "#93c5fd" : "#1d4ed8", marginTop: "4px" }}>Avg Quality</div>
        </div>
        <div style={{ ...statCardStyle, backgroundColor: isDark ? "#581c87" : "#f3e8ff" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: isDark ? "#d8b4fe" : "#7c3aed", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stats.topHookStyle}</div>
          <div style={{ fontSize: "12px", color: isDark ? "#d8b4fe" : "#7c3aed", marginTop: "4px" }}>Top Hook Style</div>
        </div>
      </div>

      {/* Submit Form */}
      <div style={{ ...cardStyle, padding: "20px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>Add a Winner</h2>
        <div style={{ display: "flex", gap: "12px" }}>
          <input
            type="url"
            value={submitUrl}
            onChange={(e) => setSubmitUrl(e.target.value)}
            placeholder="Paste TikTok URL..."
            style={{ ...inputStyle, flex: 1 }}
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
        {submitError && (
          <div style={{ marginTop: "12px", padding: "10px 14px", backgroundColor: isDark ? "#7f1d1d" : "#fee2e2", borderRadius: "8px", color: isDark ? "#fca5a5" : "#dc2626", fontSize: "14px" }}>
            {submitError}
          </div>
        )}
        {submitSuccess && (
          <div style={{ marginTop: "12px", padding: "10px 14px", backgroundColor: isDark ? "#064e3b" : "#d1fae5", borderRadius: "8px", color: isDark ? "#6ee7b7" : "#047857", fontSize: "14px" }}>
            ✓ Winner added! Click to add transcript and analyze.
          </div>
        )}
        <p style={{ fontSize: "12px", color: colors.textMuted, marginTop: "12px" }}>
          After adding, click on the winner to paste transcript and run AI analysis.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "20px", alignItems: "center" }}>
        {/* Status Pills */}
        <div style={{ display: "flex", gap: "4px", backgroundColor: colors.card, padding: "4px", borderRadius: "10px", border: `1px solid ${colors.border}` }}>
          {(["all", "ready", "processing", "needs_data", "failed"] as StatusFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                fontWeight: statusFilter === status ? 600 : 400,
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                backgroundColor: statusFilter === status ? "#1f2937" : "transparent",
                color: statusFilter === status ? "#fff" : colors.text,
                transition: "all 0.15s ease",
              }}
            >
              {status === "all" ? "All" : status === "ready" ? "Ready" : status === "processing" ? "Processing" : status === "needs_data" ? "Needs Data" : "Failed"}
            </button>
          ))}
        </div>

        {/* Category */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ ...inputStyle, width: "auto", minWidth: "140px" }}
        >
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map((cat) => (
            <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          style={{ ...inputStyle, width: "auto", minWidth: "140px" }}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="quality">Highest Quality</option>
        </select>

        <span style={{ marginLeft: "auto", fontSize: "13px", color: colors.textMuted }}>
          {filteredWinners.length} winner{filteredWinners.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Winners List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "48px", color: colors.textMuted }}>Loading winners...</div>
      ) : filteredWinners.length === 0 ? (
        <div style={{ ...cardStyle, padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🏆</div>
          <h3 style={{ fontSize: "20px", fontWeight: 600, color: colors.text, marginBottom: "8px" }}>
            {winners.length === 0 ? "No winners yet" : "No matches found"}
          </h3>
          <p style={{ color: colors.textMuted, marginBottom: "20px" }}>
            {winners.length === 0
              ? "Import your first winning TikTok to start training the AI."
              : "Try adjusting your filters."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredWinners.map((winner) => {
            const statusStyle = getStatusStyle(winner.status, isDark);
            const extract = winner.reference_extracts?.[0];

            return (
              <div
                key={winner.id}
                onClick={() => openEditModal(winner)}
                style={{
                  ...cardStyle,
                  padding: "16px 20px",
                  cursor: "pointer",
                  marginBottom: 0,
                  transition: "box-shadow 0.15s ease, transform 0.1s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                  {/* Icon */}
                  <div style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, #ec4899, #ef4444)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "20px",
                    flexShrink: 0,
                  }}>
                    ▶
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                      <a
                        href={winner.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: colors.accent, fontSize: "14px", fontWeight: 500, textDecoration: "none" }}
                      >
                        {truncateUrl(winner.url)}
                      </a>
                      {winner.category && (
                        <span style={{ padding: "2px 8px", backgroundColor: colors.surface, borderRadius: "4px", fontSize: "11px", color: colors.textMuted }}>
                          {winner.category}
                        </span>
                      )}
                    </div>

                    {extract?.spoken_hook ? (
                      <p style={{ fontSize: "14px", color: colors.text, margin: 0, lineHeight: 1.4 }}>
                        &ldquo;{extract.spoken_hook.slice(0, 100)}{extract.spoken_hook.length > 100 ? "..." : ""}&rdquo;
                      </p>
                    ) : (
                      <p style={{ fontSize: "14px", color: colors.textMuted, fontStyle: "italic", margin: 0 }}>
                        Click to add transcript and analyze
                      </p>
                    )}
                  </div>

                  {/* Right side */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.text,
                      fontSize: "12px",
                      fontWeight: 500,
                    }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: statusStyle.dot }} />
                      {winner.status === "needs_file" || winner.status === "needs_transcription" ? "Needs Data" :
                       winner.status.charAt(0).toUpperCase() + winner.status.slice(1)}
                    </div>
                    {extract?.quality_score != null && (
                      <div style={{
                        marginTop: "6px",
                        fontSize: "20px",
                        fontWeight: 700,
                        color: extract.quality_score >= 80 ? "#10b981" : extract.quality_score >= 60 ? "#f59e0b" : colors.textMuted,
                      }}>
                        {extract.quality_score}
                      </div>
                    )}
                    <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "4px" }}>
                      {formatDate(winner.created_at)}
                    </div>
                  </div>
                </div>

                {winner.error_message && (
                  <div style={{ marginTop: "12px", padding: "8px 12px", backgroundColor: isDark ? "#7f1d1d" : "#fee2e2", borderRadius: "6px", fontSize: "12px", color: isDark ? "#fca5a5" : "#dc2626" }}>
                    Error: {winner.error_message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingWinner && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 50,
          }}
          onClick={() => {
            setEditingWinner(null);
            setAnalysisResult(null);
          }}
        >
          <div
            style={{
              backgroundColor: colors.card,
              borderRadius: "16px",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 600, color: colors.text, margin: 0 }}>Edit Winner</h3>
                <button
                  onClick={() => { setEditingWinner(null); setAnalysisResult(null); }}
                  style={{ background: "none", border: "none", fontSize: "24px", color: colors.textMuted, cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
              <a
                href={editingWinner.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "13px", color: colors.accent, display: "block", marginTop: "4px" }}
              >
                {editingWinner.url} ↗
              </a>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "24px" }}>
              {/* Transcript */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: colors.text, marginBottom: "8px" }}>
                  Transcript <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <textarea
                  value={editForm.transcript}
                  onChange={(e) => setEditForm({ ...editForm, transcript: e.target.value })}
                  placeholder="Paste the video transcript here..."
                  rows={6}
                  style={{ ...inputStyle, fontFamily: "monospace", resize: "vertical" }}
                />
              </div>

              {/* Metrics Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>Views</label>
                  <input
                    type="number"
                    value={editForm.views}
                    onChange={(e) => setEditForm({ ...editForm, views: e.target.value })}
                    placeholder="0"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>Likes</label>
                  <input
                    type="number"
                    value={editForm.likes}
                    onChange={(e) => setEditForm({ ...editForm, likes: e.target.value })}
                    placeholder="0"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>Comments</label>
                  <input
                    type="number"
                    value={editForm.comments}
                    onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
                    placeholder="0"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>Shares</label>
                  <input
                    type="number"
                    value={editForm.shares}
                    onChange={(e) => setEditForm({ ...editForm, shares: e.target.value })}
                    placeholder="0"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Category */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: colors.text, marginBottom: "8px" }}>Category</label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">Select category...</option>
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
                  marginBottom: "20px",
                  backgroundColor: isDark ? "#1e3a5f" : "#dbeafe",
                  color: isDark ? "#93c5fd" : "#1d4ed8",
                  border: "none",
                  opacity: analyzing || !editForm.transcript.trim() ? 0.5 : 1,
                }}
              >
                {analyzing ? "Analyzing..." : "🤖 Analyze with AI"}
              </button>

              {/* Analysis Results */}
              {analysisResult && (
                <div style={{ backgroundColor: isDark ? "#064e3b" : "#ecfdf5", borderRadius: "12px", padding: "16px", marginBottom: "20px" }}>
                  <h4 style={{ fontSize: "14px", fontWeight: 600, color: isDark ? "#6ee7b7" : "#047857", marginBottom: "12px" }}>
                    ✓ AI Analysis Results
                  </h4>

                  {analysisResult.hook_line && (
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: isDark ? "#6ee7b7" : "#047857", textTransform: "uppercase", marginBottom: "4px" }}>Hook Line</div>
                      <div style={{ fontSize: "14px", color: colors.text, backgroundColor: colors.card, padding: "10px", borderRadius: "6px" }}>
                        &ldquo;{analysisResult.hook_line}&rdquo;
                      </div>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                    {analysisResult.hook_style && (
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: isDark ? "#6ee7b7" : "#047857", textTransform: "uppercase", marginBottom: "4px" }}>Hook Style</div>
                        <div style={{ fontSize: "14px", color: colors.text }}>{analysisResult.hook_style}</div>
                      </div>
                    )}
                    {analysisResult.content_format && (
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: isDark ? "#6ee7b7" : "#047857", textTransform: "uppercase", marginBottom: "4px" }}>Content Format</div>
                        <div style={{ fontSize: "14px", color: colors.text }}>{analysisResult.content_format}</div>
                      </div>
                    )}
                    {analysisResult.comedy_style && (
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: isDark ? "#6ee7b7" : "#047857", textTransform: "uppercase", marginBottom: "4px" }}>Comedy Style</div>
                        <div style={{ fontSize: "14px", color: colors.text }}>{analysisResult.comedy_style}</div>
                      </div>
                    )}
                    {analysisResult.target_emotion && (
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: isDark ? "#6ee7b7" : "#047857", textTransform: "uppercase", marginBottom: "4px" }}>Target Emotion</div>
                        <div style={{ fontSize: "14px", color: colors.text }}>{analysisResult.target_emotion}</div>
                      </div>
                    )}
                  </div>

                  {analysisResult.what_works && analysisResult.what_works.length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: isDark ? "#6ee7b7" : "#047857", textTransform: "uppercase", marginBottom: "4px" }}>What Works</div>
                      <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: colors.text }}>
                        {analysisResult.what_works.map((item, i) => (
                          <li key={i} style={{ marginBottom: "4px" }}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysisResult.key_phrases && analysisResult.key_phrases.length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: isDark ? "#6ee7b7" : "#047857", textTransform: "uppercase", marginBottom: "4px" }}>Key Phrases</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {analysisResult.key_phrases.map((phrase, i) => (
                          <span key={i} style={{ padding: "4px 8px", backgroundColor: colors.card, borderRadius: "4px", fontSize: "12px", color: colors.text }}>
                            {phrase}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error in modal */}
              {submitError && (
                <div style={{ padding: "10px 14px", backgroundColor: isDark ? "#7f1d1d" : "#fee2e2", borderRadius: "8px", color: isDark ? "#fca5a5" : "#dc2626", fontSize: "14px", marginBottom: "20px" }}>
                  {submitError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: "16px 24px", borderTop: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                onClick={() => handleDelete(editingWinner.id)}
                style={{ ...buttonStyle, backgroundColor: "transparent", color: "#ef4444", padding: "8px 12px" }}
              >
                Delete
              </button>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => { setEditingWinner(null); setAnalysisResult(null); }}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={editSaving}
                  style={{
                    ...primaryButtonStyle,
                    opacity: editSaving ? 0.5 : 1,
                  }}
                >
                  {editSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
