"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme, getThemeColors } from "@/app/components/ThemeProvider";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/contexts/AuthContext";
import { meetsMinPlan } from "@/lib/plans";
import { Film, Search, Lock, ExternalLink } from "lucide-react";
import Link from "next/link";

const PRODUCT_TYPES = [
  { value: "", label: "All Types" },
  { value: "anti-aging", label: "Anti-Aging" },
  { value: "energy", label: "Energy" },
  { value: "pump/performance", label: "Pump / Performance" },
  { value: "sleep", label: "Sleep" },
  { value: "cognition", label: "Cognition" },
  { value: "stress", label: "Stress" },
  { value: "metabolic", label: "Metabolic" },
];

interface ClipResult {
  id: string;
  title: string;
  creator_name: string;
  platform: string;
  ingredient: string;
  product_type: string;
  source_url: string;
  indexed_at: string;
  candidate?: {
    id: string;
    video_url?: string;
  };
  analysis?: {
    id: string;
    best_moments?: { timecode: string; label: string }[];
    risk_flags?: { level: string; label: string }[];
    ingredient_tags?: string[];
  };
}

export default function ClipIndexPage() {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { subscription, credits, isLoading: creditsLoading } = useCredits();
  const { isAdmin } = useAuth();

  const [query, setQuery] = useState("");
  const [productType, setProductType] = useState("");
  const [items, setItems] = useState<ClipResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);

  const planId = subscription?.planId || "free";
  const isUnlimited = credits?.isUnlimited === true || credits?.remaining === -1;
  const isPro = isAdmin || isUnlimited || meetsMinPlan(planId, "creator_pro");

  const fetchClips = useCallback(async () => {
    if (!isPro) {
      setLocked(true);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (productType) params.set("product_type", productType);
      params.set("limit", "20");

      const res = await fetch(`/api/clip-index/search?${params.toString()}`);
      const json = await res.json();

      if (json.locked) {
        setLocked(true);
        setItems([]);
        setTotal(0);
      } else {
        setLocked(false);
        setItems(json.data?.items || []);
        setTotal(json.data?.total || 0);
      }
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [isPro, query, productType]);

  // Debounced search
  useEffect(() => {
    if (creditsLoading) return;
    const timer = setTimeout(() => {
      fetchClips();
    }, 400);
    return () => clearTimeout(timer);
  }, [fetchClips, creditsLoading]);

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <Film size={28} style={{ color: colors.accent }} />
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: colors.text, margin: 0 }}>
            Clip Index
          </h1>
        </div>
        <p style={{ fontSize: "14px", color: colors.textMuted, margin: 0 }}>
          Index-only library of source clips and context. We don&apos;t host or download videos.
        </p>
      </div>

      {/* Search & Filters */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 300px" }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: colors.textMuted,
            }}
          />
          <input
            type="text"
            placeholder="Search by ingredient, creator, or title..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 36px",
              borderRadius: "8px",
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.text,
              fontSize: "14px",
              outline: "none",
            }}
          />
        </div>
        <select
          value={productType}
          onChange={(e) => setProductType(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: "8px",
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: "14px",
            outline: "none",
            minWidth: "0",
            width: "100%",
          }}
        >
          {PRODUCT_TYPES.map((pt) => (
            <option key={pt.value} value={pt.value}>
              {pt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      {isPro && !loading && (
        <p style={{ fontSize: "13px", color: colors.textMuted, marginBottom: "16px" }}>
          {total} clip{total !== 1 ? "s" : ""} found
        </p>
      )}

      {/* Locked state for non-Pro users */}
      {(!isPro && !creditsLoading) && (
        <div style={{ position: "relative" }}>
          {/* Skeleton placeholder cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: "16px",
              filter: "blur(4px)",
              opacity: 0.6,
              pointerEvents: "none",
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  padding: "20px",
                  borderRadius: "12px",
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div
                  style={{
                    height: "18px",
                    width: "70%",
                    backgroundColor: colors.border,
                    borderRadius: "4px",
                    marginBottom: "12px",
                  }}
                />
                <div
                  style={{
                    height: "14px",
                    width: "50%",
                    backgroundColor: colors.border,
                    borderRadius: "4px",
                    marginBottom: "16px",
                  }}
                />
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  {[1, 2, 3].map((j) => (
                    <div
                      key={j}
                      style={{
                        height: "24px",
                        width: "72px",
                        backgroundColor: colors.border,
                        borderRadius: "12px",
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    height: "14px",
                    width: "40%",
                    backgroundColor: colors.border,
                    borderRadius: "4px",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Lock overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)",
              borderRadius: "12px",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "rgba(139, 92, 246, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <Lock size={28} style={{ color: "#a855f7" }} />
            </div>
            <p
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: colors.text,
                marginBottom: "8px",
                textAlign: "center",
              }}
            >
              Upgrade to Creator Pro to browse the full clip library
            </p>
            <Link
              href="/upgrade"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 28px",
                background: "linear-gradient(135deg, #9333ea, #3b82f6)",
                borderRadius: "8px",
                color: "#fff",
                fontWeight: 600,
                fontSize: "14px",
                textDecoration: "none",
                marginTop: "8px",
              }}
            >
              Upgrade Now
            </Link>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isPro && loading && (
        <div style={{ textAlign: "center", padding: "48px 0", color: colors.textMuted }}>
          Searching clips...
        </div>
      )}

      {/* Pro results */}
      {isPro && !loading && items.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            backgroundColor: colors.surface,
            borderRadius: "12px",
            border: `1px solid ${colors.border}`,
          }}
        >
          <Film size={40} style={{ color: colors.textMuted, marginBottom: "16px" }} />
          <p style={{ fontSize: "16px", fontWeight: 500, color: colors.text, marginBottom: "8px" }}>
            No clips indexed yet
          </p>
          <p style={{ fontSize: "14px", color: colors.textMuted }}>
            The discovery pipeline runs automatically.
          </p>
        </div>
      )}

      {isPro && !loading && items.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: "16px",
          }}
        >
          {items.map((clip) => (
            <div
              key={clip.id}
              style={{
                padding: "20px",
                borderRadius: "12px",
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
              }}
            >
              {/* Title & creator */}
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: colors.text,
                  marginBottom: "4px",
                  margin: 0,
                }}
              >
                {clip.title}
              </h3>
              <p style={{ fontSize: "13px", color: colors.textMuted, margin: "4px 0 12px" }}>
                {clip.creator_name}
                {clip.platform && (
                  <span
                    style={{
                      display: "inline-block",
                      marginLeft: "8px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      fontWeight: 500,
                      borderRadius: "4px",
                      backgroundColor: isDark ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.1)",
                      color: "#ef4444",
                    }}
                  >
                    {clip.platform}
                  </span>
                )}
              </p>

              {/* Tags */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                {clip.ingredient && (
                  <span
                    style={{
                      padding: "3px 10px",
                      fontSize: "12px",
                      borderRadius: "12px",
                      backgroundColor: isDark ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.1)",
                      color: "#3b82f6",
                      fontWeight: 500,
                    }}
                  >
                    {clip.ingredient}
                  </span>
                )}
                {clip.product_type && (
                  <span
                    style={{
                      padding: "3px 10px",
                      fontSize: "12px",
                      borderRadius: "12px",
                      backgroundColor: isDark ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.1)",
                      color: "#10b981",
                      fontWeight: 500,
                    }}
                  >
                    {clip.product_type}
                  </span>
                )}
                {clip.analysis?.ingredient_tags?.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: "3px 10px",
                      fontSize: "12px",
                      borderRadius: "12px",
                      backgroundColor: isDark ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.1)",
                      color: "#8b5cf6",
                      fontWeight: 500,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Best moments */}
              {clip.analysis?.best_moments && clip.analysis.best_moments.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "12px", color: colors.textMuted, marginBottom: "4px" }}>
                    Best moments:
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {clip.analysis.best_moments.map((m, i) => (
                      <span
                        key={i}
                        title={m.label}
                        style={{
                          padding: "2px 8px",
                          fontSize: "12px",
                          fontFamily: "monospace",
                          borderRadius: "4px",
                          backgroundColor: colors.surface2 || colors.border,
                          color: colors.text,
                          cursor: "default",
                        }}
                      >
                        {m.timecode}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk flags */}
              {clip.analysis?.risk_flags && clip.analysis.risk_flags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                  {clip.analysis.risk_flags.map((f, i) => (
                    <span
                      key={i}
                      style={{
                        padding: "2px 8px",
                        fontSize: "11px",
                        borderRadius: "4px",
                        fontWeight: 500,
                        backgroundColor:
                          f.level === "red"
                            ? "rgba(239,68,68,0.15)"
                            : "rgba(234,179,8,0.15)",
                        color: f.level === "red" ? "#ef4444" : "#eab308",
                      }}
                    >
                      {f.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Open original */}
              {clip.source_url && (
                <a
                  href={clip.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: colors.accent,
                    textDecoration: "none",
                  }}
                >
                  Open Original <ExternalLink size={14} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
