"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useTheme, getThemeColors } from "@/app/components/ThemeProvider";
import {
  TONE_OPTIONS,
  HUMOR_OPTIONS,
  LIFE_STAGE_OPTIONS,
  INCOME_OPTIONS,
  LOCATION_OPTIONS,
  ATTENTION_SPAN_OPTIONS,
  VALUES_OPTIONS,
  INTERESTS_OPTIONS,
  PERSONALITY_OPTIONS,
  TRUST_BUILDERS_OPTIONS,
  EMOTIONAL_TRIGGERS_OPTIONS,
  PURCHASE_MOTIVATORS_OPTIONS,
  CONTENT_OPTIONS,
  PLATFORM_OPTIONS,
} from "@/lib/persona-options";

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
  // Demographics
  age_range?: string;
  gender?: string;
  income_level?: string;
  location_type?: string;
  life_stage?: string;
  lifestyle?: string;
  // Psychographics
  values?: string[];
  interests?: string[];
  personality_traits?: string[];
  // Communication Style
  tone?: string;  // legacy - mapped to tone_preference
  tone_preference?: string;
  humor_style?: string;
  attention_span?: string;
  trust_builders?: string[];
  phrases_they_use?: string[];
  phrases_to_avoid?: string[];
  // Pain Points & Motivations
  pain_points?: PainPointItem[];  // legacy
  primary_pain_points?: string[];
  emotional_triggers?: string[];
  buying_objections?: string[];
  purchase_motivators?: string[];
  common_objections?: string[];  // legacy - mapped to buying_objections
  // Content Preferences
  content_they_engage_with?: string[];  // legacy - mapped to content_types_preferred
  content_types_preferred?: string[];
  platforms?: string[];
  best_posting_times?: string;
  // Meta
  avatar_type?: string;
  product_categories?: string[];  // deprecated
  beliefs?: Record<string, string>;
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

// Pain point category options (not in persona-options.ts as they're pain-point specific)
const CATEGORY_OPTIONS = ["sleep", "energy", "stress", "weight", "skin", "digestion", "focus", "mood", "pain", "immunity", "aging", "fitness", "other"];
const INTENSITY_OPTIONS = ["low", "medium", "high", "extreme"];

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

  // Auth check - all authenticated users can access personas
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          router.push("/login?redirect=/admin/audience");
          return;
        }
        // All authenticated users can access personas
        setIsAdmin(true); // Grant access to all authenticated users
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
      // Map legacy fields to new fields for editing
      setPersonaForm({
        ...persona,
        tone_preference: persona.tone_preference || persona.tone,
        primary_pain_points: persona.primary_pain_points || persona.pain_points?.map(p => p.point) || [],
        buying_objections: persona.buying_objections || persona.common_objections || [],
        content_types_preferred: persona.content_types_preferred || persona.content_they_engage_with || [],
      });
    } else {
      setEditingPersona({ id: "new" } as Persona);
      setPersonaForm({
        name: "",
        description: "",
        // Demographics
        age_range: "",
        gender: "",
        income_level: "",
        location_type: "",
        life_stage: "",
        lifestyle: "",
        // Psychographics
        values: [],
        interests: [],
        personality_traits: [],
        // Communication Style
        tone_preference: "",
        humor_style: "",
        attention_span: "",
        trust_builders: [],
        phrases_they_use: [],
        phrases_to_avoid: [],
        // Pain Points & Motivations
        primary_pain_points: [],
        emotional_triggers: [],
        buying_objections: [],
        purchase_motivators: [],
        // Content Preferences
        content_types_preferred: [],
        platforms: [],
        best_posting_times: "",
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

      // Core Identity
      if (personaForm.description?.trim()) cleanedForm.description = personaForm.description.trim();

      // Demographics
      if (personaForm.age_range?.trim()) cleanedForm.age_range = personaForm.age_range.trim();
      if (personaForm.gender?.trim()) cleanedForm.gender = personaForm.gender.trim();
      if (personaForm.income_level?.trim()) cleanedForm.income_level = personaForm.income_level.trim();
      if (personaForm.location_type?.trim()) cleanedForm.location_type = personaForm.location_type.trim();
      if (personaForm.life_stage?.trim()) cleanedForm.life_stage = personaForm.life_stage.trim();
      if (personaForm.lifestyle?.trim()) cleanedForm.lifestyle = personaForm.lifestyle.trim();

      // Psychographics arrays
      if (personaForm.values && personaForm.values.length > 0) {
        cleanedForm.values = personaForm.values;
      }
      if (personaForm.interests && personaForm.interests.length > 0) {
        cleanedForm.interests = personaForm.interests;
      }
      if (personaForm.personality_traits && personaForm.personality_traits.length > 0) {
        cleanedForm.personality_traits = personaForm.personality_traits;
      }

      // Communication Style
      if (personaForm.tone_preference?.trim()) {
        cleanedForm.tone_preference = personaForm.tone_preference.trim();
        cleanedForm.tone = personaForm.tone_preference.trim(); // also set legacy field
      }
      if (personaForm.humor_style?.trim()) cleanedForm.humor_style = personaForm.humor_style.trim();
      if (personaForm.attention_span?.trim()) cleanedForm.attention_span = personaForm.attention_span.trim();

      const trustBuilders = (personaForm.trust_builders || []).filter(Boolean);
      const phrasesTheyUse = (personaForm.phrases_they_use || []).filter(Boolean);
      const phrasesToAvoid = (personaForm.phrases_to_avoid || []).filter(Boolean);

      if (trustBuilders.length > 0) cleanedForm.trust_builders = trustBuilders;
      if (phrasesTheyUse.length > 0) cleanedForm.phrases_they_use = phrasesTheyUse;
      if (phrasesToAvoid.length > 0) cleanedForm.phrases_to_avoid = phrasesToAvoid;

      // Pain Points & Motivations
      const primaryPainPoints = (personaForm.primary_pain_points || []).filter(Boolean);
      const emotionalTriggers = (personaForm.emotional_triggers || []).filter(Boolean);
      const buyingObjections = (personaForm.buying_objections || []).filter(Boolean);
      const purchaseMotivators = (personaForm.purchase_motivators || []).filter(Boolean);

      if (primaryPainPoints.length > 0) cleanedForm.primary_pain_points = primaryPainPoints;
      if (emotionalTriggers.length > 0) cleanedForm.emotional_triggers = emotionalTriggers;
      if (buyingObjections.length > 0) {
        cleanedForm.buying_objections = buyingObjections;
        cleanedForm.common_objections = buyingObjections; // also set legacy field
      }
      if (purchaseMotivators.length > 0) cleanedForm.purchase_motivators = purchaseMotivators;

      // Content Preferences
      if (personaForm.content_types_preferred && personaForm.content_types_preferred.length > 0) {
        cleanedForm.content_types_preferred = personaForm.content_types_preferred;
        cleanedForm.content_they_engage_with = personaForm.content_types_preferred; // also set legacy field
      }
      if (personaForm.platforms && personaForm.platforms.length > 0) {
        cleanedForm.platforms = personaForm.platforms;
      }
      if (personaForm.best_posting_times?.trim()) cleanedForm.best_posting_times = personaForm.best_posting_times.trim();

      // Legacy - still save pain_points JSONB if we have primary_pain_points
      if (primaryPainPoints.length > 0) {
        cleanedForm.pain_points = primaryPainPoints.map(pp => ({ point: pp, intensity: "medium" }));
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanedForm),
      });

      const data = await res.json();

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

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanedForm),
      });

      const data = await res.json();

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

      if (data.ok && data.data?.extraction) {
        setExtractResult(data.data.extraction);
        setMessage({ type: "success", text: `Extracted ${data.data.extraction.pain_points?.length || 0} pain points from ~${data.data.extraction.review_count_detected || 0} reviews` });
      } else {
        setMessage({ type: "error", text: data.message || data.error || "Extraction failed" });
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
      <div style={{ padding: "40px", textAlign: "center", color: colors.textMuted }}>Loading...</div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div style={{ color: "#ef4444", fontSize: "18px" }}>Access Denied</div>
        <div style={{ color: colors.textMuted, marginTop: "8px" }}>Admin access required.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", paddingBottom: "6rem" }}>
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
                {personas.map((persona) => {
                  const painPointCount = persona.primary_pain_points?.length || persona.pain_points?.length || 0;
                  const displayTone = persona.tone_preference || persona.tone;
                  return (
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
                        {persona.life_stage && (
                          <span style={{ fontSize: "11px", padding: "3px 8px", backgroundColor: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6", borderRadius: "4px" }}>
                            {persona.life_stage}
                          </span>
                        )}
                        {persona.income_level && (
                          <span style={{ fontSize: "11px", padding: "3px 8px", backgroundColor: "rgba(16, 185, 129, 0.1)", color: "#10b981", borderRadius: "4px" }}>
                            {persona.income_level}
                          </span>
                        )}
                        {displayTone && (
                          <span style={{ fontSize: "11px", padding: "3px 8px", backgroundColor: "rgba(59, 130, 246, 0.1)", color: "#3b82f6", borderRadius: "4px" }}>
                            {displayTone}
                          </span>
                        )}
                        {painPointCount > 0 && (
                          <span style={{ fontSize: "11px", padding: "3px 8px", backgroundColor: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", borderRadius: "4px" }}>
                            {painPointCount} pain points
                          </span>
                        )}
                        {persona.values && persona.values.length > 0 && (
                          <span style={{ fontSize: "11px", padding: "3px 8px", backgroundColor: "rgba(236, 72, 153, 0.1)", color: "#ec4899", borderRadius: "4px" }}>
                            {persona.values.length} values
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
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
              <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* ===== CORE IDENTITY ===== */}
                <div style={{ padding: "16px", backgroundColor: colors.surface, borderRadius: "8px", border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: colors.accent, marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Core Identity
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                        DESCRIPTION
                      </label>
                      <textarea
                        value={personaForm.description || ""}
                        onChange={(e) => setPersonaForm({ ...personaForm, description: e.target.value })}
                        placeholder="Who is this person? What's their life like? What do they struggle with?"
                        rows={2}
                        style={{ ...inputStyle, resize: "vertical" }}
                      />
                    </div>
                  </div>
                </div>

                {/* ===== DEMOGRAPHICS ===== */}
                <div style={{ padding: "16px", backgroundColor: colors.surface, borderRadius: "8px", border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#3b82f6", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Demographics
                  </div>
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
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>INCOME LEVEL</label>
                      <select
                        value={personaForm.income_level || ""}
                        onChange={(e) => setPersonaForm({ ...personaForm, income_level: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="">Select...</option>
                        {INCOME_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} title={opt.description}>{opt.label}</option>
                        ))}
                      </select>
                      {personaForm.income_level && (
                        <div style={{ marginTop: "4px", fontSize: "10px", color: colors.textMuted, fontStyle: "italic" }}>
                          {INCOME_OPTIONS.find(o => o.value === personaForm.income_level)?.description}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>LOCATION TYPE</label>
                      <select
                        value={personaForm.location_type || ""}
                        onChange={(e) => setPersonaForm({ ...personaForm, location_type: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="">Select...</option>
                        {LOCATION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} title={opt.description}>{opt.label}</option>
                        ))}
                      </select>
                      {personaForm.location_type && (
                        <div style={{ marginTop: "4px", fontSize: "10px", color: colors.textMuted, fontStyle: "italic" }}>
                          {LOCATION_OPTIONS.find(o => o.value === personaForm.location_type)?.description}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>LIFE STAGE</label>
                      <select
                        value={personaForm.life_stage || ""}
                        onChange={(e) => setPersonaForm({ ...personaForm, life_stage: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="">Select...</option>
                        {LIFE_STAGE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} title={opt.description}>{opt.label}</option>
                        ))}
                      </select>
                      {personaForm.life_stage && (
                        <div style={{ marginTop: "4px", fontSize: "10px", color: colors.textMuted, fontStyle: "italic" }}>
                          {LIFE_STAGE_OPTIONS.find(o => o.value === personaForm.life_stage)?.description}
                        </div>
                      )}
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
                </div>

                {/* ===== PSYCHOGRAPHICS ===== */}
                <div style={{ padding: "16px", backgroundColor: colors.surface, borderRadius: "8px", border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#ec4899", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Psychographics
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>VALUES</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {VALUES_OPTIONS.map((opt) => {
                          const selected = (personaForm.values || []).includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              title={opt.description}
                              onClick={() => {
                                const current = personaForm.values || [];
                                setPersonaForm({
                                  ...personaForm,
                                  values: selected ? current.filter((v) => v !== opt.value) : [...current, opt.value],
                                });
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "11px",
                                border: `1px solid ${selected ? "#8b5cf6" : colors.border}`,
                                borderRadius: "4px",
                                backgroundColor: selected ? "rgba(139, 92, 246, 0.15)" : "transparent",
                                color: selected ? "#a78bfa" : colors.text,
                                cursor: "pointer",
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>INTERESTS</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {INTERESTS_OPTIONS.map((opt) => {
                          const selected = (personaForm.interests || []).includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              title={opt.description}
                              onClick={() => {
                                const current = personaForm.interests || [];
                                setPersonaForm({
                                  ...personaForm,
                                  interests: selected ? current.filter((i) => i !== opt.value) : [...current, opt.value],
                                });
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "11px",
                                border: `1px solid ${selected ? "#06b6d4" : colors.border}`,
                                borderRadius: "4px",
                                backgroundColor: selected ? "rgba(6, 182, 212, 0.15)" : "transparent",
                                color: selected ? "#22d3ee" : colors.text,
                                cursor: "pointer",
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>PERSONALITY TRAITS</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {PERSONALITY_OPTIONS.map((opt) => {
                          const selected = (personaForm.personality_traits || []).includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              title={opt.description}
                              onClick={() => {
                                const current = personaForm.personality_traits || [];
                                setPersonaForm({
                                  ...personaForm,
                                  personality_traits: selected ? current.filter((t) => t !== opt.value) : [...current, opt.value],
                                });
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "11px",
                                border: `1px solid ${selected ? "#ec4899" : colors.border}`,
                                borderRadius: "4px",
                                backgroundColor: selected ? "rgba(236, 72, 153, 0.15)" : "transparent",
                                color: selected ? "#f472b6" : colors.text,
                                cursor: "pointer",
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ===== COMMUNICATION STYLE ===== */}
                <div style={{ padding: "16px", backgroundColor: colors.surface, borderRadius: "8px", border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#10b981", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Communication Style
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>TONE PREFERENCE</label>
                        <select
                          value={personaForm.tone_preference || ""}
                          onChange={(e) => setPersonaForm({ ...personaForm, tone_preference: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="">Select tone...</option>
                          {TONE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} title={opt.description}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {personaForm.tone_preference && (
                          <div style={{ marginTop: "4px", fontSize: "10px", color: colors.textMuted, fontStyle: "italic" }}>
                            {TONE_OPTIONS.find(o => o.value === personaForm.tone_preference)?.description}
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>HUMOR STYLE</label>
                        <select
                          value={personaForm.humor_style || ""}
                          onChange={(e) => setPersonaForm({ ...personaForm, humor_style: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="">Select humor...</option>
                          {HUMOR_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} title={opt.description}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {personaForm.humor_style && (
                          <div style={{ marginTop: "4px", fontSize: "10px", color: colors.textMuted, fontStyle: "italic" }}>
                            {HUMOR_OPTIONS.find(o => o.value === personaForm.humor_style)?.description}
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "4px" }}>ATTENTION SPAN</label>
                        <select
                          value={personaForm.attention_span || ""}
                          onChange={(e) => setPersonaForm({ ...personaForm, attention_span: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="">Select...</option>
                          {ATTENTION_SPAN_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} title={opt.description}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>WHAT BUILDS TRUST</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {TRUST_BUILDERS_OPTIONS.map((opt) => {
                          const selected = (personaForm.trust_builders || []).includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              title={opt.description}
                              onClick={() => {
                                const current = personaForm.trust_builders || [];
                                setPersonaForm({
                                  ...personaForm,
                                  trust_builders: selected ? current.filter((t) => t !== opt.value) : [...current, opt.value],
                                });
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "11px",
                                border: `1px solid ${selected ? "#10b981" : colors.border}`,
                                borderRadius: "4px",
                                backgroundColor: selected ? "rgba(16, 185, 129, 0.15)" : "transparent",
                                color: selected ? "#34d399" : colors.text,
                                cursor: "pointer",
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                        PHRASES THEY USE (one per line)
                      </label>
                      <textarea
                        value={(personaForm.phrases_they_use || []).join("\n")}
                        onChange={(e) => setPersonaForm({ ...personaForm, phrases_they_use: e.target.value.split("\n").filter(Boolean) })}
                        placeholder="I'm so tired&#10;There's never enough time&#10;I've tried everything"
                        rows={2}
                        style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
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
                  </div>
                </div>

                {/* ===== PAIN POINTS & MOTIVATIONS ===== */}
                <div style={{ padding: "16px", backgroundColor: colors.surface, borderRadius: "8px", border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Pain Points & Motivations
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                        PRIMARY PAIN POINTS (one per line)
                      </label>
                      <textarea
                        value={(personaForm.primary_pain_points || []).join("\n")}
                        onChange={(e) => setPersonaForm({ ...personaForm, primary_pain_points: e.target.value.split("\n").filter(Boolean) })}
                        placeholder="Never enough time in the day&#10;Constant mental load&#10;Can't turn off mom brain at night"
                        rows={3}
                        style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>EMOTIONAL TRIGGERS</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {EMOTIONAL_TRIGGERS_OPTIONS.map((opt) => {
                          const selected = (personaForm.emotional_triggers || []).includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              title={opt.description}
                              onClick={() => {
                                const current = personaForm.emotional_triggers || [];
                                setPersonaForm({
                                  ...personaForm,
                                  emotional_triggers: selected ? current.filter((t) => t !== opt.value) : [...current, opt.value],
                                });
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "11px",
                                border: `1px solid ${selected ? "#f59e0b" : colors.border}`,
                                borderRadius: "4px",
                                backgroundColor: selected ? "rgba(245, 158, 11, 0.15)" : "transparent",
                                color: selected ? "#fbbf24" : colors.text,
                                cursor: "pointer",
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>
                        BUYING OBJECTIONS (one per line)
                      </label>
                      <textarea
                        value={(personaForm.buying_objections || []).join("\n")}
                        onChange={(e) => setPersonaForm({ ...personaForm, buying_objections: e.target.value.split("\n").filter(Boolean) })}
                        placeholder="It's too expensive&#10;I've been burned before&#10;Does this actually work?"
                        rows={2}
                        style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>PURCHASE MOTIVATORS</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {PURCHASE_MOTIVATORS_OPTIONS.map((opt) => {
                          const selected = (personaForm.purchase_motivators || []).includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              title={opt.description}
                              onClick={() => {
                                const current = personaForm.purchase_motivators || [];
                                setPersonaForm({
                                  ...personaForm,
                                  purchase_motivators: selected ? current.filter((m) => m !== opt.value) : [...current, opt.value],
                                });
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "11px",
                                border: `1px solid ${selected ? "#10b981" : colors.border}`,
                                borderRadius: "4px",
                                backgroundColor: selected ? "rgba(16, 185, 129, 0.15)" : "transparent",
                                color: selected ? "#34d399" : colors.text,
                                cursor: "pointer",
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ===== CONTENT PREFERENCES ===== */}
                <div style={{ padding: "16px", backgroundColor: colors.surface, borderRadius: "8px", border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#06b6d4", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Content Preferences
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>PLATFORMS</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {PLATFORM_OPTIONS.map((opt) => {
                          const selected = (personaForm.platforms || []).includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              title={opt.description}
                              onClick={() => {
                                const current = personaForm.platforms || [];
                                setPersonaForm({
                                  ...personaForm,
                                  platforms: selected ? current.filter((p) => p !== opt.value) : [...current, opt.value],
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
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>CONTENT TYPES THEY ENGAGE WITH</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {CONTENT_OPTIONS.map((opt) => {
                          const selected = (personaForm.content_types_preferred || []).includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              title={opt.description}
                              onClick={() => {
                                const current = personaForm.content_types_preferred || [];
                                setPersonaForm({
                                  ...personaForm,
                                  content_types_preferred: selected ? current.filter((c) => c !== opt.value) : [...current, opt.value],
                                });
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "11px",
                                border: `1px solid ${selected ? "#06b6d4" : colors.border}`,
                                borderRadius: "4px",
                                backgroundColor: selected ? "rgba(6, 182, 212, 0.15)" : "transparent",
                                color: selected ? "#22d3ee" : colors.text,
                                cursor: "pointer",
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: colors.textMuted, marginBottom: "6px" }}>BEST POSTING TIMES</label>
                      <input
                        value={personaForm.best_posting_times || ""}
                        onChange={(e) => setPersonaForm({ ...personaForm, best_posting_times: e.target.value })}
                        placeholder="e.g., Early morning (6-8am), Late evening after kids sleep"
                        style={inputStyle}
                      />
                    </div>
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
  );
}
