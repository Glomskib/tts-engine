"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { useTheme, getThemeColors } from "@/app/components/ThemeProvider";
import { useDebounce } from "@/hooks/useDebounce";
import { VideoCreationSheet } from "@/components/VideoCreationSheet";
import { MarkAsWinnerModal } from "@/components/MarkAsWinnerModal";
import { Toast } from "@/components/Toast";

// --- Types ---

interface SkitBeat {
  t: string;
  action: string;
  dialogue?: string;
  on_screen_text?: string;
}

interface SkitData {
  hook_line: string;
  beats: SkitBeat[];
  b_roll: string[];
  overlays: string[];
  cta_line: string;
  cta_overlay: string;
}

interface AIScore {
  hook_strength: number;
  humor_level: number;
  product_integration: number;
  virality_potential: number;
  clarity: number;
  production_feasibility: number;
  audience_language: number;
  overall_score: number;
  strengths: string[];
  improvements: string[];
}

interface PerformanceMetrics {
  view_count?: number;
  engagement_rate?: number;
  likes?: number;
  comments?: number;
  shares?: number;
}

interface SavedSkit {
  id: string;
  title: string;
  status: "draft" | "approved" | "produced" | "posted" | "archived";
  product_name: string | null;
  product_brand: string | null;
  user_rating: number | null;
  ai_score: AIScore | null;
  created_at: string;
  updated_at: string;
  skit_data?: SkitData;
  generation_config?: Record<string, unknown>;
  video_id?: string | null;
  is_winner?: boolean;
  performance_metrics?: PerformanceMetrics | null;
  posted_video_url?: string | null;
  marked_winner_at?: string | null;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const STATUSES = ["draft", "approved", "produced", "posted", "archived"] as const;
const ITEMS_PER_PAGE = 10;
const LIBRARY_PREFS_KEY = "skit-library-preferences";

type SortOption = "newest" | "oldest" | "highest_rated" | "highest_ai_score" | "title_az" | "title_za" | "recently_modified";

interface LibraryPreferences {
  sortBy: SortOption;
  showAdvancedFilters: boolean;
}

function getStatusStyle(status: string, isDark: boolean): React.CSSProperties {
  const styles: Record<string, React.CSSProperties> = {
    draft: { backgroundColor: isDark ? "#374151" : "#f3f4f6", color: isDark ? "#d1d5db" : "#4b5563" },
    approved: { backgroundColor: isDark ? "#065f46" : "#d1fae5", color: isDark ? "#6ee7b7" : "#047857" },
    produced: { backgroundColor: isDark ? "#1e40af" : "#dbeafe", color: isDark ? "#93c5fd" : "#1d4ed8" },
    posted: { backgroundColor: isDark ? "#6b21a8" : "#f3e8ff", color: isDark ? "#d8b4fe" : "#7c3aed" },
    archived: { backgroundColor: isDark ? "#7f1d1d" : "#fee2e2", color: isDark ? "#fca5a5" : "#dc2626" },
  };
  return styles[status] || styles.draft;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// --- Component ---

export default function SkitLibraryPage() {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skits, setSkits] = useState<SavedSkit[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300); // Debounce search by 300ms
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [currentPage, setCurrentPage] = useState(1);

  // Expanded skit
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSkit, setExpandedSkit] = useState<SavedSkit | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Status update
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // AI Scoring
  const [scoringId, setScoringId] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Advanced filters
  const [aiScoreMin, setAiScoreMin] = useState<string>("");
  const [aiScoreMax, setAiScoreMax] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Brand filter
  const [brandFilter, setBrandFilter] = useState<string>("");

  // Duplicate
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Video Creation Sheet
  const [videoSheetOpen, setVideoSheetOpen] = useState(false);
  const [videoSheetScript, setVideoSheetScript] = useState<{
    id: string;
    title: string;
    content: string;
    hook?: string;
    cta?: string;
  } | null>(null);

  // Winners
  const [winnerModalSkit, setWinnerModalSkit] = useState<SavedSkit | null>(null);
  const [showWinnersOnly, setShowWinnersOnly] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LIBRARY_PREFS_KEY);
      if (saved) {
        const prefs: LibraryPreferences = JSON.parse(saved);
        if (prefs.sortBy) setSortBy(prefs.sortBy);
        if (prefs.showAdvancedFilters !== undefined) setShowAdvancedFilters(prefs.showAdvancedFilters);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save preferences to localStorage when they change
  useEffect(() => {
    try {
      const prefs: LibraryPreferences = { sortBy, showAdvancedFilters };
      localStorage.setItem(LIBRARY_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore localStorage errors
    }
  }, [sortBy, showAdvancedFilters]);

  // Fetch skits
  const fetchSkits = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", String(ITEMS_PER_PAGE));
    params.set("offset", String((currentPage - 1) * ITEMS_PER_PAGE));
    if (statusFilter) params.set("status", statusFilter);
    if (debouncedSearchTerm.trim()) params.set("search", debouncedSearchTerm.trim());
    if (showWinnersOnly) params.set("winners_only", "true");

    try {
      const res = await fetch(`/api/skits?${params.toString()}`);
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.message || data.error || "Failed to fetch scripts");
      }

      let fetchedSkits = data.data || [];

      // Client-side sorting
      fetchedSkits = [...fetchedSkits].sort((a: SavedSkit, b: SavedSkit) => {
        switch (sortBy) {
          case "oldest":
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          case "highest_rated":
            return (b.user_rating || 0) - (a.user_rating || 0);
          case "highest_ai_score":
            return (b.ai_score?.overall_score || 0) - (a.ai_score?.overall_score || 0);
          case "title_az":
            return a.title.localeCompare(b.title);
          case "title_za":
            return b.title.localeCompare(a.title);
          case "recently_modified":
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          case "newest":
          default:
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
      });

      // Client-side AI score filtering
      if (aiScoreMin || aiScoreMax) {
        const min = aiScoreMin ? parseFloat(aiScoreMin) : 0;
        const max = aiScoreMax ? parseFloat(aiScoreMax) : 10;
        fetchedSkits = fetchedSkits.filter((s: SavedSkit) => {
          if (!s.ai_score) return !aiScoreMin; // Show unscored if no min
          return s.ai_score.overall_score >= min && s.ai_score.overall_score <= max;
        });
      }

      // Client-side brand filtering
      if (brandFilter) {
        fetchedSkits = fetchedSkits.filter((s: SavedSkit) =>
          s.product_brand?.toLowerCase() === brandFilter.toLowerCase()
        );
      }

      setSkits(fetchedSkits);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch scripts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, debouncedSearchTerm, sortBy, aiScoreMin, aiScoreMax, showWinnersOnly, brandFilter]);

  useEffect(() => {
    fetchSkits();
  }, [fetchSkits]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, debouncedSearchTerm, sortBy, aiScoreMin, aiScoreMax, showWinnersOnly]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, debouncedSearchTerm, sortBy, aiScoreMin, aiScoreMax, showWinnersOnly]);

  const handleExpand = async (skitId: string) => {
    if (expandedId === skitId) {
      setExpandedId(null);
      setExpandedSkit(null);
      return;
    }

    setExpandedId(skitId);
    setLoadingDetails(true);

    try {
      const res = await fetch(`/api/skits/${skitId}`);
      const data = await res.json();
      if (data.ok && data.data) {
        setExpandedSkit(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch script details:", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDelete = async (skitId: string) => {
    setDeletingId(skitId);
    try {
      const res = await fetch(`/api/skits/${skitId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setSkits((prev) => prev.filter((s) => s.id !== skitId));
        setDeleteConfirm(null);
        if (expandedId === skitId) {
          setExpandedId(null);
          setExpandedSkit(null);
        }
      } else {
        setError(data.error || "Failed to delete script");
      }
    } catch {
      setError("Failed to delete script");
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (skitId: string, newStatus: string) => {
    setUpdatingId(skitId);
    try {
      const res = await fetch(`/api/skits/${skitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.ok) {
        setSkits((prev) =>
          prev.map((s) =>
            s.id === skitId ? { ...s, status: newStatus as SavedSkit["status"] } : s
          )
        );

        // When approved, auto-create video in pipeline
        if (newStatus === "approved") {
          const skit = skits.find(s => s.id === skitId);
          if (skit && !skit.video_id) {
            try {
              const videoRes = await fetch('/api/videos/create-from-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  script_id: skitId,
                  title: skit.title,
                  product_name: skit.product_name,
                  product_brand: skit.product_brand,
                  hook_line: skit.skit_data?.hook_line,
                }),
              });
              const videoData = await videoRes.json();
              if (videoData.ok) {
                // Update local state with video_id
                setSkits(prev => prev.map(s =>
                  s.id === skitId ? { ...s, video_id: videoData.data.id } : s
                ));
                setToast({ message: "Script approved and added to pipeline!", type: "success" });
              } else {
                setToast({ message: "Script approved but failed to add to pipeline", type: "error" });
              }
            } catch {
              setToast({ message: "Script approved but failed to add to pipeline", type: "error" });
            }
          }
        }
      } else {
        setError(data.error || "Failed to update status");
      }
    } catch {
      setError("Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  // Bulk selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === skits.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(skits.map(s => s.id)));
    }
  };

  const toggleSelect = (skitId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(skitId)) {
      newSelected.delete(skitId);
    } else {
      newSelected.add(skitId);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const updates = Array.from(selectedIds).map(id =>
        fetch(`/api/skits/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        })
      );
      await Promise.all(updates);
      setSkits(prev =>
        prev.map(s =>
          selectedIds.has(s.id) ? { ...s, status: newStatus as SavedSkit["status"] } : s
        )
      );
      setSelectedIds(new Set());
    } catch {
      setError("Failed to update some scripts");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const deletes = Array.from(selectedIds).map(id =>
        fetch(`/api/skits/${id}`, { method: "DELETE" })
      );
      await Promise.all(deletes);
      setSkits(prev => prev.filter(s => !selectedIds.has(s.id)));
      if (expandedId && selectedIds.has(expandedId)) {
        setExpandedId(null);
        setExpandedSkit(null);
      }
      setSelectedIds(new Set());
    } catch {
      setError("Failed to delete some scripts");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleDuplicate = async (skitId: string) => {
    const skit = skits.find(s => s.id === skitId);
    if (!skit) return;

    setDuplicatingId(skitId);
    try {
      // Fetch full skit data if not expanded
      let fullSkit = expandedId === skitId ? expandedSkit : null;
      if (!fullSkit) {
        const res = await fetch(`/api/skits/${skitId}`);
        const data = await res.json();
        if (data.ok && data.data) {
          fullSkit = data.data;
        }
      }

      if (!fullSkit?.skit_data) {
        setError("Could not load script data for duplication");
        return;
      }

      // Create new skit with duplicated data
      const res = await fetch("/api/skits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${skit.title} (Copy)`,
          product_name: skit.product_name,
          product_brand: skit.product_brand,
          skit_data: fullSkit.skit_data,
          generation_config: fullSkit.generation_config,
          status: "draft",
        }),
      });
      const data = await res.json();

      if (data.ok && data.data) {
        // Add to list at top
        setSkits(prev => [data.data, ...prev]);
      } else {
        setError(data.error || "Failed to duplicate script");
      }
    } catch {
      setError("Failed to duplicate script");
    } finally {
      setDuplicatingId(null);
    }
  };

  // Open video creation sheet for a skit
  const handleOpenVideoSheet = (skitId: string) => {
    const skit = skits.find(s => s.id === skitId);
    if (!skit || skit.video_id) return;

    // Build content from skit data
    const skitData = skit.skit_data;
    let content = "";
    if (skitData) {
      content = `HOOK: ${skitData.hook_line}\n\n`;
      content += skitData.beats.map((beat, i) =>
        `${i + 1}. [${beat.t}] ${beat.action}${beat.dialogue ? `\n   "${beat.dialogue}"` : ""}`
      ).join("\n\n");
      content += `\n\nCTA: ${skitData.cta_line}`;
    }

    setVideoSheetScript({
      id: skit.id,
      title: skit.title || `${skit.product_name || "Untitled"} Script`,
      content: content || "Script content not available",
      hook: skitData?.hook_line,
      cta: skitData?.cta_line,
    });
    setVideoSheetOpen(true);
  };

  // Handle video creation success
  const handleVideoCreationSuccess = () => {
    // Refresh the list to show updated status
    fetchSkits();
  };

  // Open winner modal - uses new MarkAsWinnerModal component
  const openWinnerModal = (skitId: string) => {
    const skit = skits.find(s => s.id === skitId);
    if (skit) {
      setWinnerModalSkit(skit);
    }
  };

  // Called when MarkAsWinnerModal successfully adds to winners_bank
  const handleWinnerSuccess = () => {
    if (!winnerModalSkit) return;

    // Update local state to show winner badge
    setSkits(prev => prev.map(s =>
      s.id === winnerModalSkit.id ? { ...s, is_winner: true } : s
    ));
    if (expandedSkit && expandedSkit.id === winnerModalSkit.id) {
      setExpandedSkit({ ...expandedSkit, is_winner: true });
    }

    // Show success toast
    setToast({
      message: "Added to Winners Bank! AI is analyzing...",
      type: "success",
    });

    setWinnerModalSkit(null);
  };

  // Remove winner status (removes from winners_bank would need separate API call)
  const handleRemoveWinner = async (skitId: string) => {
    try {
      // Mark as not winner in skits table
      const res = await fetch(`/api/skits/${skitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_winner: false,
          performance_metrics: null,
          posted_video_url: null,
          marked_winner_at: null,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setSkits(prev => prev.map(s =>
          s.id === skitId ? { ...s, is_winner: false, performance_metrics: null, posted_video_url: null } : s
        ));
        if (expandedSkit && expandedSkit.id === skitId) {
          setExpandedSkit({ ...expandedSkit, is_winner: false, performance_metrics: null, posted_video_url: null });
        }
        setToast({ message: "Removed from winners", type: "info" });
      }
    } catch {
      setError("Failed to remove winner status");
    }
  };

  const handleScoreSkit = async (skitId: string) => {
    if (!expandedSkit?.skit_data) return;

    setScoringId(skitId);
    try {
      const res = await fetch('/api/ai/score-skit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skit_data: expandedSkit.skit_data,
          product_name: expandedSkit.product_name || 'Product',
          product_brand: expandedSkit.product_brand || undefined,
        }),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.message || 'Failed to score script');
        return;
      }

      const aiScore = data.data as AIScore;

      // Save the score to the skit
      const saveRes = await fetch(`/api/skits/${skitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_score: aiScore }),
      });
      const saveData = await saveRes.json();

      if (!saveData.ok) {
        setError('Score generated but failed to save');
        return;
      }

      // Update local state
      setSkits((prev) =>
        prev.map((s) => (s.id === skitId ? { ...s, ai_score: aiScore } : s))
      );
      setExpandedSkit((prev) => prev ? { ...prev, ai_score: aiScore } : null);
    } catch {
      setError('Failed to score script');
    } finally {
      setScoringId(null);
    }
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return <span style={{ color: colors.textMuted }}>—</span>;
    return (
      <span style={{ color: "#f59e0b", letterSpacing: "-1px" }}>
        {"★".repeat(rating)}
        <span style={{ color: colors.border }}>{"★".repeat(5 - rating)}</span>
      </span>
    );
  };

  const totalPages = pagination ? Math.ceil(pagination.total / ITEMS_PER_PAGE) : 1;
  const totalCount = pagination?.total || 0;

  // Unique brands for filter dropdown (computed from all fetched skits)
  const uniqueBrands = useMemo(() => {
    const brands = new Set<string>();
    skits.forEach(s => { if (s.product_brand) brands.add(s.product_brand); });
    return Array.from(brands).sort();
  }, [skits]);

  // Library stats calculations (memoized)
  const stats = useMemo(() => ({
    total: skits.length,
    byStatus: STATUSES.reduce((acc, status) => {
      acc[status] = skits.filter(s => s.status === status).length;
      return acc;
    }, {} as Record<string, number>),
    avgAiScore: (() => {
      const scored = skits.filter(s => s.ai_score?.overall_score);
      if (scored.length === 0) return null;
      return scored.reduce((sum, s) => sum + (s.ai_score?.overall_score || 0), 0) / scored.length;
    })(),
    avgUserRating: (() => {
      const rated = skits.filter(s => s.user_rating);
      if (rated.length === 0) return null;
      return rated.reduce((sum, s) => sum + (s.user_rating || 0), 0) / rated.length;
    })(),
    highScoreCount: skits.filter(s => (s.ai_score?.overall_score || 0) >= 7).length,
  }), [skits]);

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
    borderRadius: "8px",
    marginBottom: "16px",
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "14px",
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    backgroundColor: colors.input,
    color: colors.text,
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    transition: "background-color 0.15s ease, transform 0.1s ease, opacity 0.15s ease",
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

  return (
    <div style={containerStyle} className="pb-24 lg:pb-6">
      {/* Breadcrumb Navigation */}
      <nav style={{ marginBottom: "12px", fontSize: "13px" }}>
        <Link href="/admin/pipeline" style={{ color: colors.textMuted, textDecoration: "none" }}>
          Admin
        </Link>
        <span style={{ color: colors.textMuted, margin: "0 8px" }}>/</span>
        <span style={{ color: colors.text, fontWeight: 500 }}>Script Library</span>
      </nav>

      {/* Header */}
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 600, color: colors.text, margin: 0 }}>
            Script Library
            {!loading && (
              <span style={{ fontSize: "16px", fontWeight: 400, color: colors.textMuted, marginLeft: "8px" }}>
                ({totalCount} script{totalCount !== 1 ? "s" : ""})
              </span>
            )}
          </h1>
          <p style={{ fontSize: "14px", color: colors.textMuted, marginTop: "4px" }}>
            Browse, manage, and reuse your saved scripts
          </p>
        </div>
        {/* Quick Nav Links */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Link
            href="/admin/skit-generator"
            style={{
              padding: "8px 14px",
              backgroundColor: "#059669",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            Create New Script
          </Link>
          <Link
            href="/admin/pipeline"
            style={{
              padding: "8px 14px",
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              color: colors.text,
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13px",
            }}
          >
            Video Pipeline
          </Link>
        </div>
      </div>

      {/* Stats Dashboard */}
      {!loading && skits.length > 0 && (
        <div style={{ ...cardStyle, padding: "16px", marginBottom: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "16px" }}>
            {/* Status breakdown */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", marginBottom: "8px" }}>By Status</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {STATUSES.map(status => (
                  stats.byStatus[status] > 0 && (
                    <span
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      style={{
                        ...getStatusStyle(status, isDark),
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 500,
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {status}: {stats.byStatus[status]}
                    </span>
                  )
                ))}
              </div>
            </div>

            {/* Average AI Score */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", marginBottom: "8px" }}>Avg AI Score</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: stats.avgAiScore ? (stats.avgAiScore < 5 ? "#ef4444" : stats.avgAiScore < 7 ? "#f59e0b" : "#10b981") : colors.textMuted }}>
                {stats.avgAiScore ? stats.avgAiScore.toFixed(1) : "—"}
              </div>
            </div>

            {/* Average User Rating */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", marginBottom: "8px" }}>Avg Rating</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#f59e0b" }}>
                {stats.avgUserRating ? `${stats.avgUserRating.toFixed(1)}★` : "—"}
              </div>
            </div>

            {/* High Performers */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", marginBottom: "8px" }}>High Score (7+)</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#10b981" }}>
                {stats.highScoreCount}
                <span style={{ fontSize: "12px", fontWeight: 400, color: colors.textMuted, marginLeft: "4px" }}>
                  / {skits.filter(s => s.ai_score).length} scored
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ ...cardStyle, padding: "16px", marginBottom: "24px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search by title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 200px", minWidth: "200px" }}
            aria-label="Search scripts by title"
          />

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, minWidth: "140px" }}
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>

          {/* Brand Filter */}
          {uniqueBrands.length > 0 && (
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              style={{ ...inputStyle, minWidth: "140px" }}
              aria-label="Filter by brand"
            >
              <option value="">All Brands</option>
              {uniqueBrands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}

          {/* Winners Filter */}
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 12px",
            backgroundColor: showWinnersOnly ? "#fef3c7" : colors.surface,
            border: `1px solid ${showWinnersOnly ? "#f59e0b" : colors.border}`,
            borderRadius: "6px",
            fontSize: "13px",
            cursor: "pointer",
            color: showWinnersOnly ? "#b45309" : colors.text,
            fontWeight: showWinnersOnly ? 600 : 400,
          }}>
            <input
              type="checkbox"
              checked={showWinnersOnly}
              onChange={(e) => setShowWinnersOnly(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Winners Only
          </label>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            style={{ ...inputStyle, minWidth: "160px" }}
            aria-label="Sort scripts by"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="recently_modified">Recently Modified</option>
            <option value="highest_rated">Highest Rated</option>
            <option value="highest_ai_score">Highest AI Score</option>
            <option value="title_az">Title A-Z</option>
            <option value="title_za">Title Z-A</option>
          </select>

          {/* Advanced Filters Toggle */}
          <button type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            aria-expanded={showAdvancedFilters}
            aria-controls="advanced-filters-panel"
            style={{
              ...secondaryButtonStyle,
              backgroundColor: showAdvancedFilters ? colors.accent : colors.surface,
              color: showAdvancedFilters ? "#fff" : colors.text,
            }}
          >
            {showAdvancedFilters ? "▼" : "▶"} Filters
          </button>

          {/* New Script Button */}
          <Link href="/admin/skit-generator" style={primaryButtonStyle}>
            + New Script
          </Link>
        </div>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div id="advanced-filters-panel" role="region" aria-label="Advanced filters" style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${colors.border}`, display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
            <span id="ai-score-label" style={{ fontSize: "12px", color: colors.textMuted, fontWeight: 500 }}>AI Score:</span>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }} role="group" aria-labelledby="ai-score-label">
              <input
                type="number"
                placeholder="Min"
                min="0"
                max="10"
                step="0.1"
                value={aiScoreMin}
                onChange={(e) => setAiScoreMin(e.target.value)}
                style={{ ...inputStyle, width: "70px", padding: "4px 8px", fontSize: "12px" }}
                aria-label="Minimum AI score"
              />
              <span style={{ color: colors.textMuted }}>–</span>
              <input
                type="number"
                placeholder="Max"
                min="0"
                max="10"
                step="0.1"
                value={aiScoreMax}
                onChange={(e) => setAiScoreMax(e.target.value)}
                style={{ ...inputStyle, width: "70px", padding: "4px 8px", fontSize: "12px" }}
                aria-label="Maximum AI score"
              />
            </div>
            {(aiScoreMin || aiScoreMax) && (
              <button type="button"
                onClick={() => { setAiScoreMin(""); setAiScoreMax(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: colors.danger, fontSize: "11px" }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Active Filters */}
        {(searchTerm || statusFilter || aiScoreMin || aiScoreMax) && (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${colors.border}`, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: colors.textMuted }}>Filters:</span>
            {searchTerm && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", backgroundColor: colors.surface2, borderRadius: "4px", fontSize: "12px", color: colors.text }}>
                {searchTerm}
                <button type="button" onClick={() => setSearchTerm("")} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: "0 2px" }}>×</button>
              </span>
            )}
            {statusFilter && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", backgroundColor: colors.surface2, borderRadius: "4px", fontSize: "12px", color: colors.text, textTransform: "capitalize" }}>
                {statusFilter}
                <button type="button" onClick={() => setStatusFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: "0 2px" }}>×</button>
              </span>
            )}
            {(aiScoreMin || aiScoreMax) && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", backgroundColor: colors.surface2, borderRadius: "4px", fontSize: "12px", color: colors.text }}>
                AI: {aiScoreMin || "0"}-{aiScoreMax || "10"}
                <button type="button" onClick={() => { setAiScoreMin(""); setAiScoreMax(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: "0 2px" }}>×</button>
              </span>
            )}
            <button type="button" onClick={() => { setSearchTerm(""); setStatusFilter(""); setAiScoreMin(""); setAiScoreMax(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: colors.danger, fontSize: "12px" }}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ ...cardStyle, padding: "12px 16px", backgroundColor: isDark ? "#7f1d1d" : "#fee2e2", borderColor: isDark ? "#991b1b" : "#fecaca", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <span style={{ color: isDark ? "#fca5a5" : "#dc2626", fontSize: "14px" }}>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: isDark ? "#fca5a5" : "#dc2626", fontWeight: 500 }}>Dismiss</button>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {!loading && skits.length > 0 && (
        <div style={{ ...cardStyle, padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectedIds.size === skits.length && skits.length > 0}
              onChange={toggleSelectAll}
              style={{ width: "16px", height: "16px", cursor: "pointer" }}
            />
            <span style={{ fontSize: "13px", color: colors.text }}>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
            </span>
          </label>

          {selectedIds.size > 0 && (
            <>
              <div style={{ height: "20px", width: "1px", backgroundColor: colors.border }} />

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: colors.textMuted }}>Set status:</span>
                <select
                  onChange={(e) => { if (e.target.value) handleBulkStatusChange(e.target.value); e.target.value = ""; }}
                  disabled={bulkActionLoading}
                  style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px" }}
                  defaultValue=""
                >
                  <option value="" disabled>Choose...</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>

              <button type="button"
                onClick={handleBulkDelete}
                disabled={bulkActionLoading}
                style={{
                  ...buttonStyle,
                  padding: "4px 10px",
                  fontSize: "12px",
                  backgroundColor: colors.danger,
                  color: "#fff",
                  opacity: bulkActionLoading ? 0.6 : 1,
                }}
              >
                {bulkActionLoading ? "..." : `Delete (${selectedIds.size})`}
              </button>

              <button type="button"
                onClick={() => setSelectedIds(new Set())}
                style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, fontSize: "12px" }}
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div>
          {/* Skeleton loaders */}
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ ...cardStyle, padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ height: "16px", width: "60%", backgroundColor: colors.surface2, borderRadius: "4px", marginBottom: "8px", animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ height: "12px", width: "40%", backgroundColor: colors.surface2, borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite" }} />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{ height: "24px", width: "60px", backgroundColor: colors.surface2, borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ height: "24px", width: "60px", backgroundColor: colors.surface2, borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite" }} />
                </div>
              </div>
            </div>
          ))}
          <style>{`
            @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }
            input:focus, select:focus { border-color: ${colors.accent} !important; box-shadow: 0 0 0 2px ${colors.accent}20 !important; }
            button:hover:not(:disabled) { opacity: 0.9; }
            button:active:not(:disabled) { transform: scale(0.98); }

            /* Mobile Responsive */
            @media (max-width: 768px) {
              input, select { font-size: 16px !important; min-height: 44px; }
              button { min-height: 44px; }
              .skit-row-right { flex-wrap: wrap; gap: 8px !important; }
            }
          `}</style>
        </div>
      ) : skits.length === 0 ? (
        <div style={{ ...cardStyle, padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>📝</div>
          <h3 style={{ fontSize: "18px", fontWeight: 500, color: colors.text, marginBottom: "8px" }}>
            {totalCount === 0 ? "No scripts yet" : "No matches found"}
          </h3>
          <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "16px" }}>
            {totalCount === 0 ? "Generate your first script to see it here." : "Try adjusting your search or filters."}
          </p>
          {totalCount === 0 && (
            <Link href="/admin/skit-generator" style={primaryButtonStyle}>
              Create Your First Script
            </Link>
          )}
        </div>
      ) : (
        <div>
          {skits.map((skit) => (
            <div key={skit.id} style={cardStyle}>
              {/* Script Header */}
              <div
                onClick={() => handleExpand(skit.id)}
                style={{ padding: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedIds.has(skit.id)}
                  onChange={(e) => { e.stopPropagation(); toggleSelect(skit.id); }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: "16px", height: "16px", cursor: "pointer", flexShrink: 0 }}
                />

                {/* Left */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, color: colors.text, marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {skit.title}
                  </div>
                  <div style={{ fontSize: "13px", color: colors.textMuted, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {skit.product_name && (
                      <>
                        <span>{skit.product_brand ? `${skit.product_brand} / ` : ""}{skit.product_name}</span>
                        <span>•</span>
                      </>
                    )}
                    <span>{formatDate(skit.created_at)}</span>
                  </div>
                </div>

                {/* Right */}
                <div className="skit-row-right" style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                  {/* AI Score Badge */}
                  {skit.ai_score && (
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: skit.ai_score.overall_score < 5 ? (isDark ? '#7f1d1d' : '#fee2e2') :
                                       skit.ai_score.overall_score < 7 ? (isDark ? '#78350f' : '#fef3c7') :
                                       (isDark ? '#065f46' : '#d1fae5'),
                      color: skit.ai_score.overall_score < 5 ? (isDark ? '#fca5a5' : '#dc2626') :
                             skit.ai_score.overall_score < 7 ? (isDark ? '#fcd34d' : '#d97706') :
                             (isDark ? '#6ee7b7' : '#059669'),
                    }}>
                      AI: {skit.ai_score.overall_score.toFixed(1)}
                    </span>
                  )}
                  {/* Video Linked Badge */}
                  {skit.video_id && (
                    <Link
                      href={`/admin/pipeline/${skit.video_id}`}
                      onClick={(e) => e.stopPropagation()}
                      title="View linked video in pipeline"
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 500,
                        backgroundColor: isDark ? "#312e81" : "#eef2ff",
                        color: isDark ? "#a5b4fc" : "#4f46e5",
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span style={{ fontSize: "10px" }}>&#9658;</span>
                      Video
                    </Link>
                  )}
                  {/* Winner Badge with Performance Metrics */}
                  {skit.is_winner && (
                    <span
                      title={skit.performance_metrics?.view_count ? `${skit.performance_metrics.view_count.toLocaleString()} views` : "Top performer"}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: isDark ? "#854d0e" : "#fef3c7",
                        color: isDark ? "#fcd34d" : "#b45309",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Trophy size={12} />
                      Winner
                      {skit.performance_metrics?.view_count && (
                        <span style={{ fontWeight: 400, opacity: 0.8, marginLeft: "4px" }}>
                          ({skit.performance_metrics.view_count >= 1000000
                            ? `${(skit.performance_metrics.view_count / 1000000).toFixed(1)}M`
                            : skit.performance_metrics.view_count >= 1000
                            ? `${(skit.performance_metrics.view_count / 1000).toFixed(1)}K`
                            : skit.performance_metrics.view_count} views)
                        </span>
                      )}
                    </span>
                  )}
                  <span style={{ ...getStatusStyle(skit.status, isDark), padding: "4px 10px", borderRadius: "4px", fontSize: "12px", fontWeight: 500, textTransform: "capitalize" }}>
                    {skit.status}
                  </span>
                  <div style={{ width: "70px", textAlign: "right", fontSize: "14px" }}>
                    {renderStars(skit.user_rating)}
                  </div>
                  <span style={{ color: colors.textMuted, transition: "transform 0.2s", transform: expandedId === skit.id ? "rotate(180deg)" : "rotate(0)" }}>
                    ▼
                  </span>
                </div>
              </div>

              {/* Expanded */}
              {expandedId === skit.id && (
                <div style={{ borderTop: `1px solid ${colors.border}`, padding: "16px", backgroundColor: colors.surface2 }}>
                  {loadingDetails ? (
                    <div style={{ padding: "24px", textAlign: "center", color: colors.textMuted }}>Loading details...</div>
                  ) : expandedSkit?.skit_data ? (
                    <div>
                      {/* Hook & CTA */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", marginBottom: "6px" }}>Hook</div>
                          <div style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: "6px", padding: "12px", fontSize: "14px", color: colors.text }}>
                            {expandedSkit.skit_data.hook_line || "—"}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", marginBottom: "6px" }}>CTA</div>
                          <div style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: "6px", padding: "12px", fontSize: "14px", color: colors.text }}>
                            {expandedSkit.skit_data.cta_line || "—"}
                            {expandedSkit.skit_data.cta_overlay && (
                              <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "4px" }}>
                                Overlay: {expandedSkit.skit_data.cta_overlay}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Scenes */}
                      {expandedSkit.skit_data.beats?.length > 0 && (
                        <div style={{ marginBottom: "16px" }}>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", marginBottom: "6px" }}>
                            Scenes ({expandedSkit.skit_data.beats.length})
                          </div>
                          <div style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: "6px" }}>
                            {expandedSkit.skit_data.beats.map((beat, idx) => (
                              <div key={idx} style={{ padding: "12px", borderBottom: idx < expandedSkit.skit_data!.beats.length - 1 ? `1px solid ${colors.border}` : "none" }}>
                                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                                  <span style={{ fontSize: "11px", fontFamily: "monospace", color: colors.textMuted, backgroundColor: colors.surface2, padding: "2px 6px", borderRadius: "3px" }}>{beat.t}</span>
                                  <span style={{ fontSize: "14px", fontWeight: 500, color: colors.text }}>{beat.action}</span>
                                </div>
                                {beat.dialogue && <p style={{ marginTop: "6px", paddingLeft: "40px", fontSize: "14px", color: colors.textMuted, fontStyle: "italic" }}>&ldquo;{beat.dialogue}&rdquo;</p>}
                                {beat.on_screen_text && <p style={{ marginTop: "4px", paddingLeft: "40px", fontSize: "12px", color: colors.accent }}>Text: {beat.on_screen_text}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* B-Roll & Overlays */}
                      {(expandedSkit.skit_data.b_roll?.length > 0 || expandedSkit.skit_data.overlays?.length > 0) && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                          {expandedSkit.skit_data.b_roll?.length > 0 && (
                            <div>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", marginBottom: "6px" }}>B-Roll</div>
                              <ul style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: "6px", padding: "12px", margin: 0, paddingLeft: "28px", fontSize: "14px", color: colors.text }}>
                                {expandedSkit.skit_data.b_roll.map((item, idx) => <li key={idx} style={{ marginBottom: "4px" }}>{item}</li>)}
                              </ul>
                            </div>
                          )}
                          {expandedSkit.skit_data.overlays?.length > 0 && (
                            <div>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", marginBottom: "6px" }}>Overlays</div>
                              <ul style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: "6px", padding: "12px", margin: 0, paddingLeft: "28px", fontSize: "14px", color: colors.text }}>
                                {expandedSkit.skit_data.overlays.map((item, idx) => <li key={idx} style={{ marginBottom: "4px" }}>{item}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* AI Score Section */}
                      <div style={{ marginBottom: "16px", paddingTop: "12px", borderTop: `1px solid ${colors.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase" }}>AI Score</div>
                          {!expandedSkit.ai_score && (
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); handleScoreSkit(skit.id); }}
                              disabled={scoringId === skit.id}
                              style={{
                                padding: "6px 12px",
                                backgroundColor: scoringId === skit.id ? colors.surface2 : "#3b82f6",
                                color: scoringId === skit.id ? colors.textMuted : "#fff",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: 500,
                                cursor: scoringId === skit.id ? "not-allowed" : "pointer",
                              }}
                            >
                              {scoringId === skit.id ? "Scoring..." : "Get AI Score"}
                            </button>
                          )}
                        </div>

                        {expandedSkit.ai_score ? (
                          <div style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: "6px", padding: "12px" }}>
                            {/* Overall Score */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                              <span style={{ fontSize: "13px", fontWeight: 500, color: colors.text }}>Overall</span>
                              <span style={{
                                fontSize: "20px",
                                fontWeight: 700,
                                color: expandedSkit.ai_score.overall_score < 5 ? "#ef4444" :
                                       expandedSkit.ai_score.overall_score < 7 ? "#f59e0b" : "#10b981",
                              }}>
                                {expandedSkit.ai_score.overall_score.toFixed(1)}/10
                              </span>
                            </div>

                            {/* Individual Scores */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "12px" }}>
                              {[
                                { key: 'hook_strength', label: 'Hook' },
                                { key: 'humor_level', label: 'Humor' },
                                { key: 'product_integration', label: 'Product Fit' },
                                { key: 'virality_potential', label: 'Virality' },
                                { key: 'audience_language', label: 'Voice' },
                                { key: 'clarity', label: 'Clarity' },
                                { key: 'production_feasibility', label: 'Feasibility' },
                              ].map(({ key, label }) => {
                                const score = expandedSkit.ai_score![key as keyof AIScore] as number;
                                const barColor = score < 5 ? '#ef4444' : score < 7 ? '#f59e0b' : '#10b981';
                                return (
                                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '11px', color: colors.textMuted, width: '60px', flexShrink: 0 }}>{label}</span>
                                    <div style={{ flex: 1, height: '6px', backgroundColor: colors.surface2, borderRadius: '3px', overflow: 'hidden' }}>
                                      <div style={{ width: `${score * 10}%`, height: '100%', backgroundColor: barColor, borderRadius: '3px' }} />
                                    </div>
                                    <span style={{ fontSize: '10px', fontWeight: 600, color: barColor, width: '16px', textAlign: 'right' }}>{score}</span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Strengths & Improvements */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                              {expandedSkit.ai_score.strengths.length > 0 && (
                                <div>
                                  <div style={{ fontSize: "10px", fontWeight: 600, color: "#10b981", marginBottom: "4px" }}>Strengths</div>
                                  <ul style={{ margin: 0, paddingLeft: "14px", fontSize: "11px", color: colors.text }}>
                                    {expandedSkit.ai_score.strengths.map((s, i) => <li key={i} style={{ marginBottom: "2px" }}>{s}</li>)}
                                  </ul>
                                </div>
                              )}
                              {expandedSkit.ai_score.improvements.length > 0 && (
                                <div>
                                  <div style={{ fontSize: "10px", fontWeight: 600, color: "#f59e0b", marginBottom: "4px" }}>Suggestions</div>
                                  <ul style={{ margin: 0, paddingLeft: "14px", fontSize: "11px", color: colors.text }}>
                                    {expandedSkit.ai_score.improvements.map((s, i) => <li key={i} style={{ marginBottom: "2px" }}>{s}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {/* Re-score Button */}
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); handleScoreSkit(skit.id); }}
                              disabled={scoringId === skit.id}
                              style={{
                                marginTop: "10px",
                                padding: "4px 10px",
                                backgroundColor: "transparent",
                                border: `1px solid ${colors.border}`,
                                borderRadius: "4px",
                                fontSize: "11px",
                                cursor: scoringId === skit.id ? "not-allowed" : "pointer",
                                color: colors.textMuted,
                                opacity: scoringId === skit.id ? 0.6 : 1,
                              }}
                            >
                              {scoringId === skit.id ? "Scoring..." : "Re-score"}
                            </button>
                          </div>
                        ) : (
                          <div style={{ padding: "16px", textAlign: "center", color: colors.textMuted, fontSize: "13px", backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: "6px" }}>
                            {scoringId === skit.id ? "Getting AI score..." : "No AI score yet. Click 'Get AI Score' to analyze this script."}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingTop: "12px", borderTop: `1px solid ${colors.border}` }}>
                        <Link href={`/admin/skit-generator?load=${skit.id}`} onClick={(e) => e.stopPropagation()} style={secondaryButtonStyle}>
                          Edit in Generator
                        </Link>

                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); handleDuplicate(skit.id); }}
                          disabled={duplicatingId === skit.id}
                          style={{
                            ...secondaryButtonStyle,
                            opacity: duplicatingId === skit.id ? 0.6 : 1,
                            cursor: duplicatingId === skit.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {duplicatingId === skit.id ? "Duplicating..." : "Duplicate"}
                        </button>

                        {/* Create Video Button */}
                        {skit.video_id ? (
                          <Link
                            href={`/admin/pipeline/${skit.video_id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              ...secondaryButtonStyle,
                              backgroundColor: "#6366f1",
                              borderColor: "#6366f1",
                              color: "white",
                            }}
                          >
                            View Video
                          </Link>
                        ) : (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); handleOpenVideoSheet(skit.id); }}
                            disabled={!skit.product_name}
                            title={!skit.product_name ? "Script must have a product to create a video" : "Create video from this script"}
                            style={{
                              ...secondaryButtonStyle,
                              backgroundColor: "#059669",
                              borderColor: "#059669",
                              color: "white",
                              opacity: !skit.product_name ? 0.6 : 1,
                              cursor: !skit.product_name ? "not-allowed" : "pointer",
                            }}
                          >
                            Create Video
                          </button>
                        )}

                        {/* Mark as Winner Button */}
                        {skit.is_winner ? (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveWinner(skit.id); }}
                            style={{
                              ...secondaryButtonStyle,
                              backgroundColor: isDark ? "#854d0e" : "#fef3c7",
                              borderColor: isDark ? "#a16207" : "#fcd34d",
                              color: isDark ? "#fcd34d" : "#b45309",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <Trophy size={14} /> Winner
                          </button>
                        ) : (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); openWinnerModal(skit.id); }}
                            style={{
                              ...secondaryButtonStyle,
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <Trophy size={14} /> Mark Winner
                          </button>
                        )}

                        {/* Export Dropdown */}
                        <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                          <select
                            onChange={(e) => {
                              const format = e.target.value;
                              if (!format || !expandedSkit?.skit_data) return;

                              const skitData = expandedSkit.skit_data;
                              const productName = expandedSkit.product_name || "Product";
                              const productBrand = expandedSkit.product_brand ? `${expandedSkit.product_brand} ` : "";

                              if (format === "json") {
                                const exportData = {
                                  title: expandedSkit.title,
                                  product: { name: expandedSkit.product_name, brand: expandedSkit.product_brand },
                                  skit_data: skitData,
                                  ai_score: expandedSkit.ai_score,
                                  status: expandedSkit.status,
                                  created_at: expandedSkit.created_at,
                                };
                                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `skit-${skit.id.slice(0, 8)}.json`;
                                a.click();
                                URL.revokeObjectURL(url);
                              } else if (format === "markdown") {
                                const md = `# ${expandedSkit.title}\n\n` +
                                  `**Product:** ${productBrand}${productName}\n\n` +
                                  `## Hook\n> ${skitData.hook_line}\n\n` +
                                  `## Scenes\n${skitData.beats?.map((b, i) =>
                                    `### Scene ${i + 1} (${b.t})\n**Action:** ${b.action}${b.dialogue ? `\n\n*"${b.dialogue}"*` : ""}${b.on_screen_text ? `\n\n**On-screen:** ${b.on_screen_text}` : ""}`
                                  ).join("\n\n") || "No beats"}\n\n` +
                                  `## CTA\n**Spoken:** ${skitData.cta_line}\n\n**Overlay:** ${skitData.cta_overlay}\n\n` +
                                  `## B-Roll Suggestions\n${skitData.b_roll?.map((b, i) => `${i + 1}. ${b}`).join("\n") || "None"}\n\n` +
                                  `## Text Overlays\n${skitData.overlays?.map((o, i) => `${i + 1}. ${o}`).join("\n") || "None"}\n\n` +
                                  (expandedSkit.ai_score ? `## AI Score: ${expandedSkit.ai_score.overall_score.toFixed(1)}/10\n` : "");

                                const blob = new Blob([md], { type: "text/markdown" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `skit-${skit.id.slice(0, 8)}.md`;
                                a.click();
                                URL.revokeObjectURL(url);
                              } else if (format === "clipboard") {
                                const text = `HOOK: ${skitData.hook_line}\n\n` +
                                  `BEATS:\n${skitData.beats?.map(b => `[${b.t}] ${b.action}${b.dialogue ? `\nDialogue: "${b.dialogue}"` : ""}${b.on_screen_text ? `\nText: ${b.on_screen_text}` : ""}`).join("\n\n") || "No beats"}\n\n` +
                                  `CTA: ${skitData.cta_line}\nOverlay: ${skitData.cta_overlay}\n\n` +
                                  `B-ROLL:\n${skitData.b_roll?.map((b, i) => `${i + 1}. ${b}`).join("\n") || "None"}\n\n` +
                                  `OVERLAYS:\n${skitData.overlays?.map((o, i) => `${i + 1}. ${o}`).join("\n") || "None"}`;
                                navigator.clipboard.writeText(text);
                              }

                              e.target.value = "";
                            }}
                            style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px" }}
                            defaultValue=""
                          >
                            <option value="" disabled>Export...</option>
                            <option value="clipboard">Copy to Clipboard</option>
                            <option value="json">Download JSON</option>
                            <option value="markdown">Download Markdown</option>
                          </select>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
                          <span style={{ fontSize: "12px", color: colors.textMuted }}>Status:</span>
                          <select
                            value={skit.status}
                            onChange={(e) => handleStatusChange(skit.id, e.target.value)}
                            disabled={updatingId === skit.id}
                            style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px" }}
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        </div>

                        <div style={{ marginLeft: "auto" }} onClick={(e) => e.stopPropagation()}>
                          {deleteConfirm === skit.id ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "12px", color: colors.danger }}>Delete?</span>
                              <button type="button" onClick={() => handleDelete(skit.id)} disabled={deletingId === skit.id} style={{ ...buttonStyle, padding: "4px 10px", fontSize: "12px", backgroundColor: colors.danger, color: "#fff" }}>
                                {deletingId === skit.id ? "..." : "Yes"}
                              </button>
                              <button type="button" onClick={() => setDeleteConfirm(null)} style={{ ...buttonStyle, padding: "4px 10px", fontSize: "12px", backgroundColor: "transparent", color: colors.textMuted }}>
                                No
                              </button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setDeleteConfirm(skit.id)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.danger, fontSize: "12px" }}>
                              Delete
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Linked Video Section */}
                      {expandedSkit?.video_id && (
                        <div style={{
                          marginTop: "12px",
                          padding: "12px",
                          backgroundColor: colors.surface2,
                          borderRadius: "6px",
                          border: `1px solid ${colors.border}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ color: "#6366f1", fontSize: "14px" }}>&#9658;</span>
                              <span style={{ fontSize: "13px", fontWeight: 600, color: colors.text }}>
                                Linked Video
                              </span>
                            </div>
                            <Link
                              href={`/admin/pipeline/${expandedSkit.video_id}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                padding: "6px 12px",
                                backgroundColor: "#6366f1",
                                color: "white",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: 500,
                                textDecoration: "none",
                              }}
                            >
                              View in Pipeline
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: "24px", textAlign: "center", color: colors.textMuted }}>Could not load details</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total > ITEMS_PER_PAGE && (
        <div style={{ ...cardStyle, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "14px", color: colors.textMuted }}>
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, pagination.total)} of {pagination.total}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ ...secondaryButtonStyle, padding: "6px 12px", fontSize: "13px", opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? "not-allowed" : "pointer" }}
            >
              Previous
            </button>
            <span style={{ fontSize: "14px", color: colors.text, padding: "0 8px" }}>{currentPage} / {totalPages}</span>
            <button type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ ...secondaryButtonStyle, padding: "6px 12px", fontSize: "13px", opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Mark as Winner Modal - uses new comprehensive modal */}
      {winnerModalSkit && (
        <MarkAsWinnerModal
          isOpen={!!winnerModalSkit}
          onClose={() => setWinnerModalSkit(null)}
          onSuccess={handleWinnerSuccess}
          scriptId={winnerModalSkit.id}
          scriptTitle={winnerModalSkit.title}
          hookText={winnerModalSkit.skit_data?.hook_line}
          productName={winnerModalSkit.product_name || undefined}
        />
      )}

      {/* Video Creation Sheet */}
      <VideoCreationSheet
        isOpen={videoSheetOpen}
        onClose={() => setVideoSheetOpen(false)}
        script={videoSheetScript}
        onSuccess={handleVideoCreationSuccess}
      />

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
