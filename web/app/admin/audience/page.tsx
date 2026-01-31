"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import AppLayout from "@/app/components/AppLayout";
import { useTheme, getThemeColors } from "@/app/components/ThemeProvider";

// --- Types ---

interface PainPointItem {
  point: string;
  intensity?: "low" | "medium" | "high" | "extreme";
  triggers?: string[];
}

interface Persona {
  id: string;
  name: string;
  description?: string;
  age_range?: string;
  gender?: string;
  lifestyle?: string;
  pain_points?: PainPointItem[];
  phrases_they_use?: string[];
  phrases_to_avoid?: string[];
  tone?: string;
  humor_style?: string;
  common_objections?: string[];
  beliefs?: Record<string, string>;
  content_they_engage_with?: string[];
  platforms?: string[];
  product_categories?: string[];
  times_used?: number;
  created_at: string;
}

interface PainPoint {
  id: string;
  pain_point: string;
  category?: string;
  when_it_happens?: string;
  emotional_state?: string;
  intensity?: string;
  how_they_describe_it?: string[];
  related_searches?: string[];
  what_they_want?: string;
  objections_to_solutions?: string[];
  product_ids?: string[];
  times_used?: number;
  created_at: string;
}

type TabType = "personas" | "pain-points";

const TONE_OPTIONS = ["casual", "enthusiastic", "skeptical", "desperate", "hopeful", "frustrated", "sarcastic"];
const HUMOR_OPTIONS = ["self-deprecating", "sarcastic", "wholesome", "absurd", "dry", "none"];
const CATEGORY_OPTIONS = ["sleep", "energy", "stress", "weight", "skin", "digestion", "focus", "mood", "pain", "immunity", "aging", "fitness", "other"];
const INTENSITY_OPTIONS = ["low", "medium", "high", "extreme"];
const PLATFORM_OPTIONS = ["tiktok", "instagram", "youtube", "facebook", "twitter"];
const CONTENT_OPTIONS = ["relatable fails", "before/after", "day in the life", "POV", "storytime", "tutorial", "review", "unboxing", "trend"];

export default function AudiencePage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("personas");

  // Personas state
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personasLoading, setPersonasLoading] = useState(true);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [personaForm, setPersonaForm] = useState<Partial<Persona>>({});
  const [savingPersona, setSavingPersona] = useState(false);

  // Pain Points state
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [painPointsLoading, setPainPointsLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editingPainPoint, setEditingPainPoint] = useState<PainPoint | null>(null);
  const [painPointForm, setPainPointForm] = useState<Partial<PainPoint>>({});
  const [savingPainPoint, setSavingPainPoint] = useState(false);

  // Extract from text state
  const [extractText, setExtractText] = useState("");
  const [extractSourceUrl, setExtractSourceUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<{
    pain_points?: Array<{
      pain_point: string;
      how_they_describe_it: string[];
      emotional_state: string;
      intensity: "low" | "medium" | "high";
      frequency: number;
    }>;
    language_patterns?: {
      complaints: string[];
      desires: string[];
      phrases: string[];
    };
    objections?: string[];
    review_count_detected?: number;
  } | null>(null);
  const [addingPainPointIndex, setAddingPainPointIndex] = useState<number | null>(null);
  const [addingAllPainPoints, setAddingAllPainPoints] = useState(false);

  // Messages
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          router.push("/login?redirect=/admin/audience");
          return;
        }
        const roleRes = await fetch("/api/auth/me");
        const roleData = await roleRes.json();
        if (roleData.role !== "admin") {
          setIsAdmin(false);
          setAuthLoading(false);
          return;
        }
        setIsAdmin(true);
      } catch {
        router.push("/login");
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // Fetch personas
  const fetchPersonas = useCallback(async () => {
    setPersonasLoading(true);
    try {
      // Add cache buster to avoid stale data
      const res = await fetch(`/api/audience/personas?_=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      console.log("[Audience] Fetched personas:", data);
      if (data.ok) {
        setPersonas(data.data || []);
      } else {
        console.error("[Audience] Failed to fetch personas:", data.message || data.error);
        setMessage({ type: "error", text: data.message || data.error || "Failed to fetch personas" });
      }
    } catch (err) {
      console.error("[Audience] Failed to fetch personas:", err);
    } finally {
      setPersonasLoading(false);
    }
  }, []);

  // Fetch pain points
  const fetchPainPoints = useCallback(async () => {
    setPainPointsLoading(true);
    try {
      const url = categoryFilter === "all"
        ? `/api/audience/pain-points?_=${Date.now()}`
        : `/api/audience/pain-points?category=${categoryFilter}&_=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      console.log("[Audience] Fetched pain points:", data);
      if (data.ok) {
        setPainPoints(data.data || []);
      } else {
        console.error("[Audience] Failed to fetch pain points:", data.error);
      }
    } catch (err) {
      console.error("[Audience] Failed to fetch pain points:", err);
    } finally {
      setPainPointsLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    if (isAdmin) {
      fetchPersonas();
      fetchPainPoints();
    }
  }, [isAdmin, fetchPersonas, fetchPainPoints]);

  // --- Persona handlers ---

  const openPersonaModal = (persona?: Persona) => {
    if (persona) {
      setEditingPersona(persona);
      setPersonaForm({ ...persona });
    } else {
      setEditingPersona({ id: "new" } as Persona);
      setPersonaForm({
        name: "",
        description: "",
        pain_points: [],
        phrases_they_use: [],
        phrases_to_avoid: [],
        common_objections: [],
        content_they_engage_with: [],
        platforms: [],
        product_categories: [],
      });
    }
  };

  const savePersona = async () => {
    if (!personaForm.name?.trim()) {
      setMessage({ type: "error", text: "Name is required" });
      return;
    }

    setSavingPersona(true);
    setMessage(null);

    try {
      const isNew = editingPersona?.id === "new";
      const url = isNew ? "/api/audience/personas" : `/api/audience/personas/${editingPersona?.id}`;
      const method = isNew ? "POST" : "PATCH";

      // Clean up the form data - remove empty arrays and undefined values
      const cleanedForm: Record<string, unknown> = {
        name: personaForm.name?.trim(),
      };

      // Only include non-empty fields
      if (personaForm.description?.trim()) cleanedForm.description = personaForm.description.trim();
      if (personaForm.age_range?.trim()) cleanedForm.age_range = personaForm.age_range.trim();
      if (personaForm.gender?.trim()) cleanedForm.gender = personaForm.gender.trim();
      if (personaForm.lifestyle?.trim()) cleanedForm.lifestyle = personaForm.lifestyle.trim();
      if (personaForm.tone?.trim()) cleanedForm.tone = personaForm.tone.trim();
      if (personaForm.humor_style?.trim()) cleanedForm.humor_style = personaForm.humor_style.trim();

      // Arrays - only include if non-empty (send empty array to clear)
      const phrasesTheyUse = (personaForm.phrases_they_use || []).filter(Boolean);
      const phrasesToAvoid = (personaForm.phrases_to_avoid || []).filter(Boolean);
      const commonObjections = (personaForm.common_objections || []).filter(Boolean);

      if (phrasesTheyUse.length > 0) cleanedForm.phrases_they_use = phrasesTheyUse;
      if (phrasesToAvoid.length > 0) cleanedForm.phrases_to_avoid = phrasesToAvoid;
      if (commonObjections.length > 0) cleanedForm.common_objections = commonObjections;
      if (personaForm.content_they_engage_with && personaForm.content_they_engage_with.length > 0) {
        cleanedForm.content_they_engage_with = personaForm.content_they_engage_with;
      }
      if (personaForm.platforms && personaForm.platforms.length > 0) {
        cleanedForm.platforms = personaForm.platforms;
      }
      if (personaForm.pain_points && personaForm.pain_points.length > 0) {
        cleanedForm.pain_points = personaForm.pain_points;
      }

      console.log("[Audience] Saving persona:", { method, url, cleanedForm });

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanedForm),
      });

      console.log("[Audience] Response status:", res.status);
      const data = await res.json();
      console.log("[Audience] Save response:", data);

      if (!res.ok) {
        const errorMsg = data.error || data.message || `HTTP ${res.status}`;
        console.error("[Audience] Save failed:", errorMsg, data);
        setMessage({ type: "error", text: errorMsg });
        return;
      }

      if (!data.ok) {
        setMessage({ type: "error", text: data.message || data.error || "Failed to save" });
        return;
      }

      console.log("[Audience] Persona saved successfully:", data.data?.id);
      setMessage({ type: "success", text: isNew ? "Persona created!" : "Persona updated!" });
      setEditingPersona(null);

      // Immediately refresh the list
      await fetchPersonas();
    } catch (err) {
      console.error("[Audience] Save error:", err);
      setMessage({ type: "error", text: `Network error: ${err instanceof Error ? err.message : "Unknown"}` });
    } finally {
      setSavingPersona(false);
    }
  };

  const deletePersona = async (id: string) => {
    if (!confirm("Delete this persona?")) return;

    try {
      const res = await fetch(`/api/audience/personas/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchPersonas();
        if (editingPersona?.id === id) setEditingPersona(null);
      }
    } catch {
      setMessage({ type: "error", text: "Failed to delete" });
    }
  };

  // --- Pain Point handlers ---

  const openPainPointModal = (painPoint?: PainPoint) => {
    if (painPoint) {
      setEditingPainPoint(painPoint);
      setPainPointForm({ ...painPoint });
    } else {
      setEditingPainPoint({ id: "new" } as PainPoint);
      setPainPointForm({
        pain_point: "",
        category: "",
        how_they_describe_it: [],
        objections_to_solutions: [],
        related_searches: [],
      });
    }
  };

  const savePainPoint = async () => {
    if (!painPointForm.pain_point?.trim()) {
      setMessage({ type: "error", text: "Pain point is required" });
      return;
    }

    setSavingPainPoint(true);
    setMessage(null);

    try {
      const isNew = editingPainPoint?.id === "new";
      const url = isNew ? "/api/audience/pain-points" : `/api/audience/pain-points/${editingPainPoint?.id}`;
      const method = isNew ? "POST" : "PATCH";

      // Clean up the form data
      const cleanedForm: Record<string, unknown> = {
        pain_point: painPointForm.pain_point?.trim(),
      };

      if (painPointForm.category?.trim()) cleanedForm.category = painPointForm.category.trim();
      if (painPointForm.when_it_happens?.trim()) cleanedForm.when_it_happens = painPointForm.when_it_happens.trim();
      if (painPointForm.emotional_state?.trim()) cleanedForm.emotional_state = painPointForm.emotional_state.trim();
      if (painPointForm.intensity) cleanedForm.intensity = painPointForm.intensity;
      if (painPointForm.what_they_want?.trim()) cleanedForm.what_they_want = painPointForm.what_they_want.trim();

      if (painPointForm.how_they_describe_it && painPointForm.how_they_describe_it.length > 0) {
        cleanedForm.how_they_describe_it = painPointForm.how_they_describe_it.filter(Boolean);
      }
      if (painPointForm.objections_to_solutions && painPointForm.objections_to_solutions.length > 0) {
        cleanedForm.objections_to_solutions = painPointForm.objections_to_solutions.filter(Boolean);
      }

      console.log("[Audience] Saving pain point:", cleanedForm);

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanedForm),
      });

      const data = await res.json();
      console.log("[Audience] Save pain point response:", data);

      if (!data.ok) {
        setMessage({ type: "error", text: data.message || data.error || "Failed to save" });
        return;
      }

      setMessage({ type: "success", text: isNew ? "Pain point created!" : "Pain point updated!" });
      setEditingPainPoint(null);
      fetchPainPoints();
    } catch (err) {
      console.error("[Audience] Save pain point error:", err);
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setSavingPainPoint(false);
    }
  };

  const deletePainPoint = async (id: string) => {
    if (!confirm("Delete this pain point?")) return;

    try {
      const res = await fetch(`/api/audience/pain-points/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (data.ok) {
        setMessage({ type: "success", text: "Pain point deleted" });
        fetchPainPoints();
        if (editingPainPoint?.id === id) setEditingPainPoint(null);
      } else {
        setMessage({ type: "error", text: data.error || "Failed to delete" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to delete" });
    }
  };

  // --- Extract from text ---

  const extractFromText = async () => {
    if (!extractText.trim() || extractText.trim().length < 50) {
      setMessage({ type: "error", text: "Please paste at least 50 characters of review content" });
      return;
    }

    setExtracting(true);
    setExtractResult(null);
    setMessage(null);

    try {
      console.log("[Audience] Extracting from reviews, length:", extractText.length);
      const res = await fetch("/api/audience/extract-from-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: extractText,
          source_url: extractSourceUrl || undefined,
          source_type: extractSourceUrl?.includes("amazon") ? "amazon" :
            extractSourceUrl?.includes("tiktok") ? "tiktok" : "generic",
        }),
      });

      const data = await res.json();
      console.log("[Audience] Extract response:", data);

      if (data.ok && data.data?.extraction) {
        setExtractResult(data.data.extraction);
        setMessage({ type: "success", text: `Extracted ${data.data.extraction.pain_points?.length || 0} pain points from ~${data.data.extraction.review_count_detected || 0} reviews` });
      } else {
        setMessage({ type: "error", text: data.error || "Extraction failed" });
      }
    } catch (err) {
      console.error("[Audience] Extract error:", err);
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setExtracting(false);
    }
  };

  // --- Add extracted pain point to library ---

  const addExtractedPainPoint = async (painPoint: {
    pain_point: string;
    how_they_describe_it: string[];
    emotional_state: string;
    intensity: "low" | "medium" | "high";
  }, index: number) => {
    setAddingPainPointIndex(index);
    setMessage(null);

    try {
      const res = await fetch("/api/audience/pain-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pain_point: painPoint.pain_point,
          how_they_describe_it: painPoint.how_they_describe_it,
          emotional_state: painPoint.emotional_state,
          intensity: painPoint.intensity,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({ type: "success", text: `Added "${painPoint.pain_point}" to library` });
        fetchPainPoints();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to add pain point" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setAddingPainPointIndex(null);
    }
  };

  // --- Add all extracted pain points ---

  const addAllExtractedPainPoints = async () => {
    if (!extractResult?.pain_points?.length) return;

    setAddingAllPainPoints(true);
    setMessage(null);
    let added = 0;
    let failed = 0;

    for (const pp of extractResult.pain_points) {
      try {
        const res = await fetch("/api/audience/pain-points", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pain_point: pp.pain_point,
            how_they_describe_it: pp.how_they_describe_it,
            emotional_state: pp.emotional_state,
            intensity: pp.intensity,
          }),
        });

        const data = await res.json();
        if (data.ok) {
          added++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    setAddingAllPainPoints(false);
    fetchPainPoints();

    if (failed === 0) {
      setMessage({ type: "success", text: `Added ${added} pain points to library` });
    } else {
      setMessage({ type: "error", text: `Added ${added} pain points, ${failed} failed` });
    }
  };

  // --- Styles ---

  const inputStyle: React.CSSProperties = {
    padding: "10px 12px",
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: "13px",
    width: "100%",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  };

  const primaryButton: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: colors.accent,
    color: "#fff",
  };

  const secondaryButton: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: colors.surface,
    color: colors.text,
    border: `1px solid ${colors.border}`,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: "10px",
    padding: "16px",
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 20px",
    fontSize: "13px",
    fontWeight: 500,
    border: "none",
    borderBottom: active ? `2px solid ${colors.accent}` : "2px solid transparent",
    backgroundColor: "transparent",
    color: active ? colors.text : colors.textMuted,
    cursor: "pointer",
  });

  // Loading
  if (authLoading) {
    return (
      <AppLayout>
        <div style={{ padding: "40px", textAlign: "center", color: colors.textMuted }}>Loading...</div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ color: "#ef4444", fontSize: "18px" }}>Access Denied</div>
          <div style={{ color: colors.textMuted, marginTop: "8px" }}>Admin access required.</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: colors.text, margin: 0 }}>
            Audience Intelligence
          </h1>
          <p style={{ fontSize: "13px", color: colors.textMuted, marginTop: "4px" }}>
            Build personas and understand customer pain points for authentic content
          </p>
        </div>

        {/* Message */}
        {message && (
          <div style={{
            padding: "12px 16px",
            backgroundColor: message.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            border: `1px solid ${message.type === "success" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
            borderRadius: "6px",
            marginBottom: "16px",
            color: message.type === "success" ? "#10b981" : "#ef4444",
            fontSize: "13px",
          }}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${colors.border}`, marginBottom: "20px" }}>
          <button style={tabStyle(activeTab === "personas")} onClick={() => setActiveTab("personas")}>
            Personas ({personas.length})
          </button>
          <button style={tabStyle(activeTab === "pain-points")} onClick={() => setActiveTab("pain-points")}>
            Pain Points ({painPoints.length})
          </button>
        </div>

        {/* PERSONAS TAB */}
        {activeTab === "personas" && (
          <div>
            {/* Add Persona Button */}
            <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button style={primaryButton} onClick={() => openPersonaModal()}>
                + New Persona
              </button>
            </div>

            {/* Personas Grid */}
            {personasLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: colors.textMuted }}>Loading...</div>
            ) : personas.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: "center", padding: "40px" }}>
                <div style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "8px" }}>No personas yet</div>
                <div style={{ fontSize: "12px", color: colors.textMuted }}>Create your first audience persona to get started.</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
                {personas.map((persona) => (
                  <div
                    key={persona.id}
                    style={{ ...cardStyle, cursor: "pointer" }}
                    onClick={() => openPersonaModal(persona)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div style={{ fontSize: "15px", fontWeight: 600, color: colors.text }}>{persona.name}</div>
                      {persona.times_used != null && persona.times_used > 0 && (
                        <span style={{ fontSize: "11px", color: colors.textMuted }}>Used {persona.times_used}x</span>
                      )}
                    </div>
                    {persona.description && (
                      <div style={{ fontSize: "12px", color: colors.textMuted, marginBottom: "12px" }}>
                        {persona.description.slice(0, 100)}{persona.description.length > 100 ? "..." : ""}
                      </div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {persona.lifestyle && (
                        <span style={{ fontSize: "11px", padding: "3px 8px", backgroundColor: "rgba(59, 130, 246, 0.1)", color: "#3b82f6", borderRadius: "4px" }}>
                          {persona.lifestyle}
                        </span>
                      )}
                      {persona.tone && (
                        <span style={{ fontSize: "11px", padding: "3px 8px", backgroundColor: "rgba(16, 185, 129, 0.1)", color: "#10b981", borderRadius: "4px" }}>
                          {persona.tone}
                        </span>
                      )}
                      {persona.pain_points && persona.pain_points.length > 0 && (
                        <span style={{ fontSize: "11px", padding: "3px 8px", backgroundColor: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", borderRadius: "4px" }}>
                          {persona.pain_points.length} pain points
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PAIN POINTS TAB */}
        {activeTab === "pain-points" && (
          <div>
            {/* Filters and Add Button */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ ...inputStyle, width: "auto" }}
              >
                <option value="all">All Categories</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                ))}
              </select>
              <button style={primaryButton} onClick={() => openPainPointModal()}>
                + New Pain Point
              </button>
              <div style={{ marginLeft: "auto" }}>
                <span style={{ fontSize: "12px", color: colors.textMuted }}>{painPoints.length} pain points</span>
              </div>
            </div>

            {/* Extract from Text Panel */}
            <div style={{ ...cardStyle, marginBottom: "16px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: colors.text, marginBottom: "10px" }}>
                Extract Pain Points from Product Reviews
              </div>

              {/* Source URL Input */}
              <div style={{ marginBottom: "10px" }}>
                <input
                  value={extractSourceUrl}
                  onChange={(e) => setExtractSourceUrl(e.target.value)}
                  placeholder="Paste Amazon/product URL here (optional)..."
                  style={inputStyle}
                />
              </div>

              <div style={{ fontSize: "12px", color: colors.textMuted, textAlign: "center", margin: "8px 0" }}>
                -- OR --
              </div>

              {/* Reviews Text Input */}
              <textarea
                value={extractText}
                onChange={(e) => setExtractText(e.target.value)}
                placeholder="Paste reviews directly here...&#10;&#10;Copy reviews from Amazon, TikTok comments, or customer feedback and paste them here. The AI will extract pain points and authentic customer language."
                rows={5}
                style={{ ...inputStyle, resize: "vertical", marginBottom: "10px" }}
              />

              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={extractFromText}
                  disabled={extracting || extractText.trim().length < 50}
                  style={{ ...primaryButton, opacity: extracting || extractText.trim().length < 50 ? 0.5 : 1 }}
                >
                  {extracting ? "Extracting..." : "Extract Pain Points"}
                </button>
                {extractText.trim().length > 0 && extractText.trim().length < 50 && (
                  <span style={{ fontSize: "11px", color: colors.textMuted }}>
                    Need {50 - extractText.trim().length} more characters
                  </span>
                )}
              </div>

              {/* Extract Results */}
              {extractResult && (
                <div style={{ marginTop: "16px", padding: "16px", backgroundColor: colors.card, borderRadius: "8px", border: `1px solid ${colors.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: colors.text }}>
                      Extracted from ~{extractResult.review_count_detected || 0} reviews
                    </div>
                    {extractResult.pain_points && extractResult.pain_points.length > 0 && (
                      <button
                        onClick={addAllExtractedPainPoints}
                        disabled={addingAllPainPoints}
                        style={{ ...primaryButton, fontSize: "11px", padding: "6px 12px", opacity: addingAllPainPoints ? 0.5 : 1 }}
                      >
                        {addingAllPainPoints ? "Adding..." : `Add All ${extractResult.pain_points.length} to Library`}
                      </button>
                    )}
                  </div>

                  {/* Pain Points */}
                  {extractResult.pain_points && extractResult.pain_points.length > 0 && (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, marginBottom: "8px", textTransform: "uppercase" }}>
                        Pain Points ({extractResult.pain_points.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {extractResult.pain_points.map((pp, i) => (
                          <div
                            key={i}
                            style={{
                              padding: "12px",
                              backgroundColor: colors.surface,
                              borderRadius: "6px",
                              border: `1px solid ${colors.border}`,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "13px", fontWeight: 500, color: colors.text, marginBottom: "4px" }}>
                                  {pp.pain_point}
                                </div>
                                {pp.how_they_describe_it && pp.how_they_describe_it.length > 0 && (
                                  <div style={{ fontSize: "12px", color: colors.textMuted, fontStyle: "italic", marginBottom: "6px" }}>
                                    &quot;{pp.how_they_describe_it[0]}&quot;
                                    {pp.how_they_describe_it.length > 1 && (
                                      <span style={{ color: colors.textMuted }}> (+{pp.how_they_describe_it.length - 1} more)</span>
                                    )}
                                  </div>
                                )}
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                  <span style={{
                                    fontSize: "10px",
                                    padding: "2px 6px",
                                    borderRadius: "3px",
                                    backgroundColor: pp.intensity === "high" ? "rgba(239, 68, 68, 0.1)" :
                                      pp.intensity === "medium" ? "rgba(245, 158, 11, 0.1)" : "rgba(107, 114, 128, 0.1)",
                                    color: pp.intensity === "high" ? "#ef4444" :
                                      pp.intensity === "medium" ? "#f59e0b" : colors.textMuted,
                                  }}>
                                    {pp.intensity}
                                  </span>
                                  <span style={{
                                    fontSize: "10px",
                                    padding: "2px 6px",
                                    borderRadius: "3px",
                                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                                    color: "#3b82f6",
                                  }}>
                                    {pp.emotional_state}
                                  </span>
                                  {pp.frequency > 1 && (
                                    <span style={{
                                      fontSize: "10px",
                                      padding: "2px 6px",
                                      borderRadius: "3px",
                                      backgroundColor: "rgba(16, 185, 129, 0.1)",
                                      color: "#10b981",
                                    }}>
                                      {pp.frequency}x mentioned
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => addExtractedPainPoint(pp, i)}
                                disabled={addingPainPointIndex === i}
                                style={{
                                  ...secondaryButton,
                                  fontSize: "11px",
                                  padding: "4px 10px",
                                  opacity: addingPainPointIndex === i ? 0.5 : 1,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {addingPainPointIndex === i ? "Adding..." : "Add to Library"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Language Patterns */}
                  {extractResult.language_patterns && (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, marginBottom: "8px", textTransform: "uppercase" }}>
                        Language Patterns
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                        {extractResult.language_patterns.complaints && extractResult.language_patterns.complaints.length > 0 && (
                          <div style={{ padding: "10px", backgroundColor: "rgba(239, 68, 68, 0.05)", borderRadius: "6px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 600, color: "#ef4444", marginBottom: "6px" }}>COMPLAINTS</div>
                            {extractResult.language_patterns.complaints.slice(0, 5).map((c, i) => (
                              <div key={i} style={{ fontSize: "11px", color: colors.text, padding: "2px 0" }}>• {c}</div>
                            ))}
                          </div>
                        )}
                        {extractResult.language_patterns.desires && extractResult.language_patterns.desires.length > 0 && (
                          <div style={{ padding: "10px", backgroundColor: "rgba(16, 185, 129, 0.05)", borderRadius: "6px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 600, color: "#10b981", marginBottom: "6px" }}>DESIRES</div>
                            {extractResult.language_patterns.desires.slice(0, 5).map((d, i) => (
                              <div key={i} style={{ fontSize: "11px", color: colors.text, padding: "2px 0" }}>• {d}</div>
                            ))}
                          </div>
                        )}
                        {extractResult.language_patterns.phrases && extractResult.language_patterns.phrases.length > 0 && (
                          <div style={{ padding: "10px", backgroundColor: "rgba(59, 130, 246, 0.05)", borderRadius: "6px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 600, color: "#3b82f6", marginBottom: "6px" }}>NOTABLE PHRASES</div>
                            {extractResult.language_patterns.phrases.slice(0, 5).map((p, i) => (
                              <div key={i} style={{ fontSize: "11px", color: colors.text, padding: "2px 0" }}>• {p}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Objections */}
                  {extractResult.objections && extractResult.objections.length > 0 && (
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, marginBottom: "8px", textTransform: "uppercase" }}>
                        Objections ({extractResult.objections.length})
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {extractResult.objections.map((obj, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: "11px",
                              padding: "4px 8px",
                              backgroundColor: "rgba(245, 158, 11, 0.1)",
                              color: "#f59e0b",
                              borderRadius: "4px",
                            }}
                          >
                            {obj}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pain Points List */}
            {painPointsLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: colors.textMuted }}>Loading...</div>
            ) : painPoints.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: "center", padding: "40px" }}>
                <div style={{ fontSize: "14px", color: colors.textMuted }}>No pain points found</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {painPoints.map((pp) => (
                  <div
                    key={pp.id}
                    style={{ ...cardStyle, cursor: "pointer", display: "flex", alignItems: "flex-start", gap: "16px" }}
                    onClick={() => openPainPointModal(pp)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 500, color: colors.text }}>{pp.pain_point}</div>
                      {pp.how_they_describe_it && pp.how_they_describe_it.length > 0 && (
                        <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "4px", fontStyle: "italic" }}>
                          &quot;{pp.how_they_describe_it[0]}&quot;
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {pp.category && (
                        <span style={{ fontSize: "11px", padding: "3px 8px", backgroundColor: "rgba(107, 114, 128, 0.1)", color: colors.textMuted, borderRadius: "4px" }}>
                          {pp.category}
                        </span>
                      )}
                      {pp.intensity && (
                        <span style={{
                          fontSize: "11px",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          backgroundColor: pp.intensity === "extreme" ? "rgba(239, 68, 68, 0.1)" :
                            pp.intensity === "high" ? "rgba(245, 158, 11, 0.1)" : "rgba(107, 114, 128, 0.1)",
                          color: pp.intensity === "extreme" ? "#ef4444" :
                            pp.intensity === "high" ? "#f59e0b" : colors.textMuted,
                        }}>
                          {pp.intensity}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PERSONA EDIT MODAL */}
        {editingPersona && (
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
            onClick={() => setEditingPersona(null)}
          >
            <div
              style={{
                backgroundColor: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: "12px",
                maxWidth: "700px",
                width: "100%",
                maxHeight: "90vh",
                overflow: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: "16px", fontWeight: 600, color: colors.text }}>
                  {editingPersona.id === "new" ? "New Persona" : "Edit Persona"}
                </div>
                <button onClick={() => setEditingPersona(null)} style={{ background: "none", border: "none", fontSize: "20px", color: colors.textMuted, cursor: "pointer" }}>
                  ×
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Name */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    PERSONA NAME *
                  </label>
                  <input
                    value={personaForm.name || ""}
                    onChange={(e) => setPersonaForm({ ...personaForm, name: e.target.value })}
                    placeholder="e.g., Stressed Mom, Skeptical Buyer"
                    style={inputStyle}
                  />
                </div>

                {/* Description */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    DESCRIPTION
                  </label>
                  <textarea
                    value={personaForm.description || ""}
                    onChange={(e) => setPersonaForm({ ...personaForm, description: e.target.value })}
                    placeholder="Who is this person? What's their life like?"
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </div>

                {/* Demographics Row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>AGE RANGE</label>
                    <input
                      value={personaForm.age_range || ""}
                      onChange={(e) => setPersonaForm({ ...personaForm, age_range: e.target.value })}
                      placeholder="25-34"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>GENDER</label>
                    <input
                      value={personaForm.gender || ""}
                      onChange={(e) => setPersonaForm({ ...personaForm, gender: e.target.value })}
                      placeholder="Female, Male, Any"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>LIFESTYLE</label>
                    <input
                      value={personaForm.lifestyle || ""}
                      onChange={(e) => setPersonaForm({ ...personaForm, lifestyle: e.target.value })}
                      placeholder="busy professional"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Tone and Humor */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>TONE</label>
                    <select
                      value={personaForm.tone || ""}
                      onChange={(e) => setPersonaForm({ ...personaForm, tone: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">Select tone...</option>
                      {TONE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>HUMOR STYLE</label>
                    <select
                      value={personaForm.humor_style || ""}
                      onChange={(e) => setPersonaForm({ ...personaForm, humor_style: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">Select humor...</option>
                      {HUMOR_OPTIONS.map((h) => (
                        <option key={h} value={h}>{h.charAt(0).toUpperCase() + h.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Phrases They Use */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    PHRASES THEY USE (one per line)
                  </label>
                  <textarea
                    value={(personaForm.phrases_they_use || []).join("\n")}
                    onChange={(e) => setPersonaForm({ ...personaForm, phrases_they_use: e.target.value.split("\n").filter(Boolean) })}
                    placeholder="I'm so tired&#10;There's never enough time&#10;I've tried everything"
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: "12px" }}
                  />
                </div>

                {/* Phrases to Avoid */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    PHRASES TO AVOID (one per line)
                  </label>
                  <textarea
                    value={(personaForm.phrases_to_avoid || []).join("\n")}
                    onChange={(e) => setPersonaForm({ ...personaForm, phrases_to_avoid: e.target.value.split("\n").filter(Boolean) })}
                    placeholder="synergy&#10;optimize&#10;leverage"
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: "12px" }}
                  />
                </div>

                {/* Common Objections */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    COMMON OBJECTIONS (one per line)
                  </label>
                  <textarea
                    value={(personaForm.common_objections || []).join("\n")}
                    onChange={(e) => setPersonaForm({ ...personaForm, common_objections: e.target.value.split("\n").filter(Boolean) })}
                    placeholder="It's too expensive&#10;I've been burned before&#10;Does this actually work?"
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: "12px" }}
                  />
                </div>

                {/* Content They Engage With */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    CONTENT THEY ENGAGE WITH
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {CONTENT_OPTIONS.map((content) => {
                      const selected = (personaForm.content_they_engage_with || []).includes(content);
                      return (
                        <button
                          key={content}
                          type="button"
                          onClick={() => {
                            const current = personaForm.content_they_engage_with || [];
                            setPersonaForm({
                              ...personaForm,
                              content_they_engage_with: selected
                                ? current.filter((c) => c !== content)
                                : [...current, content],
                            });
                          }}
                          style={{
                            padding: "4px 10px",
                            fontSize: "11px",
                            border: `1px solid ${selected ? colors.accent : colors.border}`,
                            borderRadius: "4px",
                            backgroundColor: selected ? colors.accent : "transparent",
                            color: selected ? "#fff" : colors.text,
                            cursor: "pointer",
                          }}
                        >
                          {content}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Platforms */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    PLATFORMS
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {PLATFORM_OPTIONS.map((platform) => {
                      const selected = (personaForm.platforms || []).includes(platform);
                      return (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => {
                            const current = personaForm.platforms || [];
                            setPersonaForm({
                              ...personaForm,
                              platforms: selected
                                ? current.filter((p) => p !== platform)
                                : [...current, platform],
                            });
                          }}
                          style={{
                            padding: "4px 10px",
                            fontSize: "11px",
                            border: `1px solid ${selected ? colors.accent : colors.border}`,
                            borderRadius: "4px",
                            backgroundColor: selected ? colors.accent : "transparent",
                            color: selected ? "#fff" : colors.text,
                            cursor: "pointer",
                          }}
                        >
                          {platform}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{ padding: "14px 20px", borderTop: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between" }}>
                {editingPersona.id !== "new" ? (
                  <button onClick={() => deletePersona(editingPersona.id)} style={{ ...buttonStyle, color: "#ef4444", backgroundColor: "transparent" }}>
                    Delete
                  </button>
                ) : (
                  <div />
                )}
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => setEditingPersona(null)} style={secondaryButton}>Cancel</button>
                  <button onClick={savePersona} disabled={savingPersona} style={{ ...primaryButton, opacity: savingPersona ? 0.5 : 1 }}>
                    {savingPersona ? "Saving..." : "Save Persona"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAIN POINT EDIT MODAL */}
        {editingPainPoint && (
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
            onClick={() => setEditingPainPoint(null)}
          >
            <div
              style={{
                backgroundColor: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: "12px",
                maxWidth: "600px",
                width: "100%",
                maxHeight: "90vh",
                overflow: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: "16px", fontWeight: 600, color: colors.text }}>
                  {editingPainPoint.id === "new" ? "New Pain Point" : "Edit Pain Point"}
                </div>
                <button onClick={() => setEditingPainPoint(null)} style={{ background: "none", border: "none", fontSize: "20px", color: colors.textMuted, cursor: "pointer" }}>
                  ×
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Pain Point */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    PAIN POINT *
                  </label>
                  <input
                    value={painPointForm.pain_point || ""}
                    onChange={(e) => setPainPointForm({ ...painPointForm, pain_point: e.target.value })}
                    placeholder="e.g., Can't sleep through the night"
                    style={inputStyle}
                  />
                </div>

                {/* Category and Intensity */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>CATEGORY</label>
                    <select
                      value={painPointForm.category || ""}
                      onChange={(e) => setPainPointForm({ ...painPointForm, category: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">Select category...</option>
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>INTENSITY</label>
                    <select
                      value={painPointForm.intensity || ""}
                      onChange={(e) => setPainPointForm({ ...painPointForm, intensity: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">Select intensity...</option>
                      {INTENSITY_OPTIONS.map((i) => (
                        <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* When It Happens */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    WHEN IT HAPPENS
                  </label>
                  <input
                    value={painPointForm.when_it_happens || ""}
                    onChange={(e) => setPainPointForm({ ...painPointForm, when_it_happens: e.target.value })}
                    placeholder="e.g., 3am, mind racing about tomorrow"
                    style={inputStyle}
                  />
                </div>

                {/* Emotional State */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    EMOTIONAL STATE
                  </label>
                  <input
                    value={painPointForm.emotional_state || ""}
                    onChange={(e) => setPainPointForm({ ...painPointForm, emotional_state: e.target.value })}
                    placeholder="e.g., frustrated, desperate, hopeless"
                    style={inputStyle}
                  />
                </div>

                {/* How They Describe It */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    HOW THEY DESCRIBE IT (one per line)
                  </label>
                  <textarea
                    value={(painPointForm.how_they_describe_it || []).join("\n")}
                    onChange={(e) => setPainPointForm({ ...painPointForm, how_they_describe_it: e.target.value.split("\n").filter(Boolean) })}
                    placeholder="I'm exhausted but wired&#10;My brain won't shut off&#10;I just want to sleep"
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: "12px" }}
                  />
                </div>

                {/* What They Want */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    WHAT THEY WANT (the solution)
                  </label>
                  <input
                    value={painPointForm.what_they_want || ""}
                    onChange={(e) => setPainPointForm({ ...painPointForm, what_they_want: e.target.value })}
                    placeholder="e.g., Fall asleep naturally without grogginess"
                    style={inputStyle}
                  />
                </div>

                {/* Objections to Solutions */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                    OBJECTIONS TO SOLUTIONS (one per line)
                  </label>
                  <textarea
                    value={(painPointForm.objections_to_solutions || []).join("\n")}
                    onChange={(e) => setPainPointForm({ ...painPointForm, objections_to_solutions: e.target.value.split("\n").filter(Boolean) })}
                    placeholder="Melatonin gives me weird dreams&#10;I don't want to depend on pills"
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: "12px" }}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{ padding: "14px 20px", borderTop: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between" }}>
                {editingPainPoint.id !== "new" ? (
                  <button onClick={() => deletePainPoint(editingPainPoint.id)} style={{ ...buttonStyle, color: "#ef4444", backgroundColor: "transparent" }}>
                    Delete
                  </button>
                ) : (
                  <div />
                )}
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => setEditingPainPoint(null)} style={secondaryButton}>Cancel</button>
                  <button onClick={savePainPoint} disabled={savingPainPoint} style={{ ...primaryButton, opacity: savingPainPoint ? 0.5 : 1 }}>
                    {savingPainPoint ? "Saving..." : "Save Pain Point"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
