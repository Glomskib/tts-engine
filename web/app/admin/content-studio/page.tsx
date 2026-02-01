'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { postJson, isApiError, type ApiClientError } from '@/lib/http/fetchJson';
import ApiErrorPanel from '@/app/admin/components/ApiErrorPanel';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { useCredits } from '@/hooks/useCredits';
import { NoCreditsModal, useNoCreditsModal } from '@/components/FeatureGate';
import PersonaPreviewCard from '@/components/PersonaPreviewCard';

// --- Types ---

type ContentType = 'skit' | 'script' | 'hook';

interface ContentTypeOption {
  value: ContentType;
  label: string;
  icon: string;
  description: string;
}

const CONTENT_TYPE_OPTIONS: ContentTypeOption[] = [
  { value: 'skit', label: 'Skit / Dialogue', icon: '🎬', description: 'Multi-character comedy scenes with dialogue' },
  { value: 'script', label: 'Script / Copy', icon: '📝', description: 'Single voice, direct-to-camera content' },
  { value: 'hook', label: 'Hooks Only', icon: '🎯', description: 'Generate multiple hook variations' },
];

// Script format options
type ScriptFormat = 'story' | 'problem_solution' | 'listicle' | 'testimonial' | 'educational' | 'trend_react';

const SCRIPT_FORMAT_OPTIONS: { value: ScriptFormat; label: string; description: string }[] = [
  { value: 'story', label: 'Story/Narrative', description: '"I used to struggle with..." personal journey' },
  { value: 'problem_solution', label: 'Problem → Solution', description: '"Tired of X? Here\'s why Y works..."' },
  { value: 'listicle', label: 'Listicle', description: '"3 reasons why..." or "5 things you didn\'t know"' },
  { value: 'testimonial', label: 'Testimonial', description: 'Authentic review/reaction style' },
  { value: 'educational', label: 'Educational', description: 'How-to, explainer, tips format' },
  { value: 'trend_react', label: 'Trend Reaction', description: 'React to trend with product tie-in' },
];

// Hook type options
type HookType = 'question' | 'bold_statement' | 'controversy' | 'relatable' | 'curiosity_gap' | 'shock';

const HOOK_TYPE_OPTIONS: { value: HookType; label: string; description: string; example: string }[] = [
  { value: 'question', label: 'Question', description: 'Opens with engaging question', example: 'Ever wonder why...?' },
  { value: 'bold_statement', label: 'Bold Statement', description: 'Confident claim that demands attention', example: 'This changed everything' },
  { value: 'controversy', label: 'Controversy', description: 'Challenges common belief', example: 'Unpopular opinion: ...' },
  { value: 'relatable', label: 'Relatable', description: 'Shared experience moment', example: 'POV: you just...' },
  { value: 'curiosity_gap', label: 'Curiosity Gap', description: 'Teases without revealing', example: 'I can\'t believe this worked' },
  { value: 'shock', label: 'Shock/Surprise', description: 'Unexpected opener', example: 'Wait... what if I told you...' },
];

// --- Helper Functions ---

function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
}

function getActionableErrorMessage(error: ApiClientError): { message: string; action?: string } {
  const code = error.error_code;
  const msg = error.message;

  switch (code) {
    case 'VALIDATION_ERROR':
      return { message: msg || 'Please check your inputs', action: 'Review the highlighted fields and try again.' };
    case 'UNAUTHORIZED':
      return { message: 'Your session has expired', action: 'Please refresh the page and sign in again.' };
    case 'RATE_LIMITED':
      return { message: 'Too many requests', action: 'Please wait a moment before trying again.' };
    case 'AI_ERROR':
      return { message: msg || 'AI generation failed', action: 'Try adjusting your settings or regenerate.' };
    case 'PRODUCT_NOT_FOUND':
      return { message: 'Product not found', action: 'Select a different product or enter details manually.' };
    default:
      return { message: msg || 'Something went wrong', action: 'Please try again. If the problem persists, contact support.' };
  }
}

function estimateReadingTime(text: string, wpm: number = 150): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  return Math.ceil((words / wpm) * 60);
}

interface AuthUser {
  id: string;
  email: string | null;
}

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
}

interface AudiencePersona {
  id: string;
  name: string;
  description?: string;
  age_range?: string;
  gender?: string;
  income_level?: string;
  location_type?: string;
  life_stage?: string;
  lifestyle?: string;
  values?: string[];
  interests?: string[];
  personality_traits?: string[];
  tone?: string;
  tone_preference?: string;
  humor_style?: string;
  attention_span?: string;
  trust_builders?: string[];
  phrases_they_use?: string[];
  phrases_to_avoid?: string[];
  pain_points?: Array<{ point: string; intensity?: string }>;
  primary_pain_points?: string[];
  emotional_triggers?: string[];
  buying_objections?: string[];
  purchase_motivators?: string[];
  common_objections?: string[];
  content_they_engage_with?: string[];
  content_types_preferred?: string[];
  platforms?: string[];
  best_posting_times?: string;
  times_used?: number;
}

interface PainPoint {
  id: string;
  pain_point: string;
  category?: string;
  intensity?: string;
}

interface SkitPreset {
  id: string;
  name: string;
  description: string;
  energy_category: 'neutral' | 'high_energy' | 'deadpan' | 'chaotic' | 'wholesome';
}

type ActorType = 'human' | 'ai_avatar' | 'voiceover' | 'mixed';

const ACTOR_TYPE_OPTIONS: { value: ActorType; label: string; description: string }[] = [
  { value: 'human', label: 'Human Actor', description: 'On-camera performer with physical comedy' },
  { value: 'ai_avatar', label: 'AI Avatar', description: 'AI-generated character, visual gags & text-heavy' },
  { value: 'voiceover', label: 'Voiceover Only', description: 'Narration over B-roll, no on-camera talent' },
  { value: 'mixed', label: 'Mixed (Human + AI)', description: 'Combination of human and AI elements' },
];

type TargetDuration = 'quick' | 'standard' | 'extended' | 'long';

const DURATION_OPTIONS: { value: TargetDuration; label: string; description: string }[] = [
  { value: 'quick', label: 'Quick (15-20s)', description: '3-4 scenes, ultra-tight pacing' },
  { value: 'standard', label: 'Standard (30-45s)', description: '5-6 scenes, classic TikTok rhythm' },
  { value: 'extended', label: 'Extended (45-60s)', description: '7-8 scenes, room for development' },
  { value: 'long', label: 'Long Form (60-90s)', description: '9-12 scenes, full narrative arc' },
];

type ContentFormat = 'skit_dialogue' | 'scene_montage' | 'pov_story' | 'product_demo_parody' | 'reaction_commentary' | 'day_in_life';

const CONTENT_FORMAT_OPTIONS: { value: ContentFormat; label: string; description: string }[] = [
  { value: 'skit_dialogue', label: 'Skit/Dialogue', description: 'Person-to-person comedy scenes with dialogue' },
  { value: 'scene_montage', label: 'Scene Montage', description: 'Visual scenes with voiceover narration' },
  { value: 'pov_story', label: 'POV Story', description: 'First-person, natural slice-of-life feel' },
  { value: 'product_demo_parody', label: 'Product Demo Parody', description: 'Infomercial style with intentional comedy' },
  { value: 'reaction_commentary', label: 'Reaction/Commentary', description: 'Reacting to something with product tie-in' },
  { value: 'day_in_life', label: 'Day in the Life', description: 'Following a routine, product naturally integrated' },
];

interface SkitData {
  hook_line: string;
  beats: Array<{
    t: string;
    action: string;
    dialogue?: string;
    on_screen_text?: string;
  }>;
  cta_line: string;
  cta_overlay: string;
  b_roll: string[];
  overlays: string[];
}

interface ScriptData {
  hook: string;
  body: string[];
  cta: string;
  talking_points?: string[];
  visual_suggestions?: string[];
}

interface HookData {
  hooks: Array<{
    text: string;
    type: HookType;
    strength_score?: number;
  }>;
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

interface SkitVariation {
  skit: SkitData;
  ai_score: AIScore | null;
  risk_tier_applied: 'SAFE' | 'BALANCED' | 'SPICY';
  risk_score?: number;
  risk_flags?: string[];
}

interface GenerationResult {
  // Content type
  content_type: ContentType;
  // Skit data (for skit type)
  variations?: SkitVariation[];
  variation_count?: number;
  skit?: SkitData;
  // Script data (for script type)
  script?: ScriptData;
  // Hook data (for hook type)
  hooks?: HookData;
  // Common
  risk_tier_applied: 'SAFE' | 'BALANCED' | 'SPICY';
  ai_score?: AIScore | null;
  audience_metadata?: {
    persona_name?: string;
    pain_points_addressed?: string[];
  };
}

type Persona = 'NONE' | 'DR_PICKLE' | 'CASH_KING' | 'ABSURD_BUDDY' | 'DEADPAN_OFFICE' | 'INFOMERCIAL_CHAOS';
type RiskTier = 'SAFE' | 'BALANCED' | 'SPICY';
type SkitStatus = 'draft' | 'approved' | 'produced' | 'posted' | 'archived';

interface SavedSkit {
  id: string;
  title: string;
  status: SkitStatus;
  product_name: string | null;
  product_brand: string | null;
  user_rating: number | null;
  created_at: string;
  updated_at: string;
  skit_data?: SkitData;
  generation_config?: Record<string, unknown>;
  ai_score?: AIScore | null;
}

const SKIT_STATUS_OPTIONS: { value: SkitStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'produced', label: 'Produced' },
  { value: 'posted', label: 'Posted' },
  { value: 'archived', label: 'Archived' },
];

// localStorage keys
const SETTINGS_STORAGE_KEY = 'content-studio-settings';
const RECENT_PRODUCTS_KEY = 'content-studio-recent-products';

interface RecentProduct {
  id: string;
  name: string;
  brand: string;
  usedAt: number;
}

interface SavedSettings {
  contentType: ContentType;
  actorType: ActorType;
  targetDuration: TargetDuration;
  contentFormat: ContentFormat;
  scriptFormat: ScriptFormat;
  riskTier: RiskTier;
  chaosLevel: number;
  intensity: number;
  variationCount: number;
  hookCount: number;
  showAdvanced: boolean;
}

export default function ContentStudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  // Auth state
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Credits state
  const { credits, hasCredits, refetch: refetchCredits } = useCredits();
  const noCreditsModal = useNoCreditsModal();

  // Content type state
  const [contentType, setContentType] = useState<ContentType>('skit');

  // Data state
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [presets, setPresets] = useState<SkitPreset[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Audience Intelligence state
  const [audiencePersonas, setAudiencePersonas] = useState<AudiencePersona[]>([]);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
  const [selectedPainPointId, setSelectedPainPointId] = useState<string>('');
  const [selectedPersonaPainPoints, setSelectedPersonaPainPoints] = useState<string[]>([]);
  const [personaPreviewExpanded, setPersonaPreviewExpanded] = useState(true);
  const [useAudienceLanguage, setUseAudienceLanguage] = useState(true);

  // Form state
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [manualProductName, setManualProductName] = useState<string>('');
  const [manualBrandName, setManualBrandName] = useState<string>('');
  const [actorType, setActorType] = useState<ActorType>('human');
  const [selectedPreset, setSelectedPreset] = useState<string>('NONE');
  const [riskTier, setRiskTier] = useState<RiskTier>('BALANCED');
  const [persona, setPersona] = useState<Persona>('NONE');
  const [intensity, setIntensity] = useState<number>(50);
  const [chaosLevel, setChaosLevel] = useState<number>(50);
  const [creativeDirection, setCreativeDirection] = useState<string>('');
  const [targetDuration, setTargetDuration] = useState<TargetDuration>('standard');
  const [contentFormat, setContentFormat] = useState<ContentFormat>('skit_dialogue');
  const [productContext, setProductContext] = useState<string>('');
  const [variationCount, setVariationCount] = useState<number>(3);

  // Script-specific state
  const [scriptFormat, setScriptFormat] = useState<ScriptFormat>('story');
  const [scriptVoice, setScriptVoice] = useState<'first_person' | 'narrator' | 'expert'>('first_person');

  // Hook-specific state
  const [selectedHookTypes, setSelectedHookTypes] = useState<HookType[]>(['question', 'bold_statement', 'relatable']);
  const [hookCount, setHookCount] = useState<number>(10);

  // Result state
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Variation state (for skits)
  const [selectedVariationIndex, setSelectedVariationIndex] = useState(0);

  // AI Score state
  const [aiScore, setAiScore] = useState<AIScore | null>(null);
  const [scoringInProgress, setScoringInProgress] = useState(false);

  // Library state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<SkitStatus>('draft');
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [savedSkits, setSavedSkits] = useState<SavedSkit[]>([]);
  const [loadingSkits, setLoadingSkits] = useState(false);

  // UX state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recentProducts, setRecentProducts] = useState<RecentProduct[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Local editing state
  const [localSkit, setLocalSkit] = useState<SkitData | null>(null);
  const [isModified, setIsModified] = useState(false);

  // --- Effects ---

  // Auth check
  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.user) {
            setAuthUser({ id: data.user.id, email: data.user.email });
          }
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      } finally {
        setAuthLoading(false);
      }
    };
    fetchAuth();
  }, []);

  // Load data
  useEffect(() => {
    if (authLoading || !authUser) return;

    const loadData = async () => {
      setLoadingData(true);
      try {
        const [productsRes, presetsRes, personasRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/ai/skit-presets'),
          fetch('/api/audience-personas'),
        ]);

        if (productsRes.ok) {
          const data = await productsRes.json();
          setProducts(data.products || []);
          const uniqueBrands = [...new Set((data.products || []).map((p: Product) => p.brand).filter(Boolean))] as string[];
          setBrands(uniqueBrands.sort());
        }

        if (presetsRes.ok) {
          const data = await presetsRes.json();
          setPresets(data.presets || []);
        }

        if (personasRes.ok) {
          const data = await personasRes.json();
          setAudiencePersonas(data.personas || []);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoadingData(false);
      }
    };
    loadData();
  }, [authLoading, authUser]);

  // Load saved settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const settings: SavedSettings = JSON.parse(saved);
        if (settings.contentType) setContentType(settings.contentType);
        if (settings.actorType) setActorType(settings.actorType);
        if (settings.targetDuration) setTargetDuration(settings.targetDuration);
        if (settings.contentFormat) setContentFormat(settings.contentFormat);
        if (settings.scriptFormat) setScriptFormat(settings.scriptFormat);
        if (settings.riskTier) setRiskTier(settings.riskTier);
        if (typeof settings.chaosLevel === 'number') setChaosLevel(settings.chaosLevel);
        if (typeof settings.intensity === 'number') setIntensity(settings.intensity);
        if (typeof settings.variationCount === 'number') setVariationCount(settings.variationCount);
        if (typeof settings.hookCount === 'number') setHookCount(settings.hookCount);
        if (typeof settings.showAdvanced === 'boolean') setShowAdvanced(settings.showAdvanced);
      }

      const recentStr = localStorage.getItem(RECENT_PRODUCTS_KEY);
      if (recentStr) {
        setRecentProducts(JSON.parse(recentStr));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save settings on change
  useEffect(() => {
    const settings: SavedSettings = {
      contentType,
      actorType,
      targetDuration,
      contentFormat,
      scriptFormat,
      riskTier,
      chaosLevel,
      intensity,
      variationCount,
      hookCount,
      showAdvanced,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [contentType, actorType, targetDuration, contentFormat, scriptFormat, riskTier, chaosLevel, intensity, variationCount, hookCount, showAdvanced]);

  // URL param handling
  useEffect(() => {
    const productId = searchParams.get('product');
    if (productId) {
      setSelectedProductId(productId);
    }
  }, [searchParams]);

  // Filter products by brand
  const filteredProducts = useMemo(() => {
    if (!selectedBrand) return products;
    return products.filter(p => p.brand?.trim() === selectedBrand.trim());
  }, [products, selectedBrand]);

  // Get selected persona
  const selectedPersona = useMemo(() => {
    return audiencePersonas.find(p => p.id === selectedPersonaId) || null;
  }, [audiencePersonas, selectedPersonaId]);

  // --- Handlers ---

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const handleGenerate = async () => {
    if (!hasCredits) {
      noCreditsModal.open();
      return;
    }

    if (!selectedProductId && !manualProductName.trim()) {
      setError({
        ok: false,
        error_code: 'VALIDATION_ERROR',
        message: 'Please select a product or enter a product name',
        correlation_id: 'client_validation',
        httpStatus: 400,
      });
      return;
    }

    setGenerating(true);
    setError(null);
    setResult(null);
    setSelectedVariationIndex(0);

    const payload: Record<string, unknown> = {
      content_type: contentType,
      risk_tier: riskTier,
      persona: persona,
      intensity: intensity,
      chaos_level: chaosLevel,
      creative_direction: creativeDirection.trim() || undefined,
      actor_type: actorType,
      target_duration: targetDuration,
      product_context: productContext.trim() || undefined,
      audience_persona_id: selectedPersonaId || undefined,
      pain_point_focus: selectedPersonaPainPoints.length > 0 ? selectedPersonaPainPoints : undefined,
      use_audience_language: useAudienceLanguage,
    };

    // Content-type specific options
    if (contentType === 'skit') {
      payload.content_format = contentFormat;
      payload.variation_count = variationCount;
      if (selectedPreset && selectedPreset !== 'NONE') {
        payload.preset_id = selectedPreset;
      }
    } else if (contentType === 'script') {
      payload.script_format = scriptFormat;
      payload.script_voice = scriptVoice;
    } else if (contentType === 'hook') {
      payload.hook_types = selectedHookTypes;
      payload.hook_count = hookCount;
    }

    // Product
    if (selectedProductId) {
      payload.product_id = selectedProductId;
    } else {
      payload.product_name = manualProductName.trim();
      if (manualBrandName.trim()) {
        payload.brand_name = manualBrandName.trim();
      }
    }

    try {
      const response = await postJson<GenerationResult>('/api/ai/generate-content', payload);

      if (isApiError(response)) {
        if (response.httpStatus === 402) {
          refetchCredits();
          noCreditsModal.open();
          return;
        }
        setError(response);
      } else {
        setResult(response.data);
        // Update recent products
        if (selectedProductId) {
          const product = products.find(p => p.id === selectedProductId);
          if (product) {
            const updated = [
              { id: product.id, name: product.name, brand: product.brand, usedAt: Date.now() },
              ...recentProducts.filter(rp => rp.id !== product.id),
            ].slice(0, 5);
            setRecentProducts(updated);
            localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(updated));
          }
        }
      }
    } catch (err) {
      setError({
        ok: false,
        error_code: 'INTERNAL',
        message: 'Network error: Unable to reach the server',
        correlation_id: 'network_error',
        httpStatus: 0,
      });
    } finally {
      setGenerating(false);
    }
  };

  const openSaveModal = () => {
    const productName = selectedProductId
      ? products.find(p => p.id === selectedProductId)?.name || 'Unknown'
      : manualProductName || 'Manual Entry';
    setSaveTitle(`${productName} - ${new Date().toLocaleDateString()}`);
    setSaveModalOpen(true);
  };

  const handleSaveToLibrary = async () => {
    if (!result || !saveTitle.trim()) return;

    setSavingToLibrary(true);
    try {
      const response = await postJson('/api/saved-skits', {
        title: saveTitle.trim(),
        status: saveStatus,
        product_id: selectedProductId || null,
        product_name: selectedProductId ? products.find(p => p.id === selectedProductId)?.name : manualProductName,
        product_brand: selectedProductId ? products.find(p => p.id === selectedProductId)?.brand : manualBrandName,
        skit_data: contentType === 'skit' ? (result.variations?.[selectedVariationIndex]?.skit || result.skit) : result,
        generation_config: {
          content_type: contentType,
          risk_tier: riskTier,
          actor_type: actorType,
          target_duration: targetDuration,
          content_format: contentFormat,
          script_format: scriptFormat,
          intensity,
          chaos_level: chaosLevel,
        },
        ai_score: aiScore,
      });

      if (!isApiError(response)) {
        setSavedToLibrary(true);
        setSaveModalOpen(false);
        setTimeout(() => setSavedToLibrary(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSavingToLibrary(false);
    }
  };

  // --- Render helpers ---

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    color: colors.text,
    fontSize: '14px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    fontWeight: 500,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    minHeight: '48px',
  };

  // --- Loading state ---
  if (authLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
        Loading...
      </div>
    );
  }

  if (!authUser) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
        Please log in to access Content Studio.
      </div>
    );
  }

  // Get current skit for display
  const currentSkit = result?.variations?.[selectedVariationIndex]?.skit || result?.skit || null;

  return (
    <div ref={containerRef} style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* No Credits Modal */}
      <NoCreditsModal isOpen={noCreditsModal.isOpen} onClose={noCreditsModal.close} />

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, color: colors.text, fontSize: '28px', fontWeight: 700 }}>
              Content Studio
            </h1>
            <p style={{ margin: '4px 0 0 0', color: colors.textSecondary, fontSize: '14px' }}>
              Generate scripts, skits, and hooks for your products
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link
              href="/admin/skit-library"
              style={{
                padding: '10px 16px',
                backgroundColor: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                color: colors.text,
                textDecoration: 'none',
                fontSize: '14px',
              }}
            >
              View Library
            </Link>
          </div>
        </div>
      </div>

      {/* Content Type Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '4px',
        backgroundColor: colors.card,
        borderRadius: '12px',
        marginBottom: '24px',
        border: `1px solid ${colors.border}`,
      }}>
        {CONTENT_TYPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => {
              setContentType(option.value);
              setResult(null);
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '14px 20px',
              backgroundColor: contentType === option.value ? 'white' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: contentType === option.value ? '#18181b' : colors.textSecondary,
              fontSize: '14px',
              fontWeight: contentType === option.value ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow: contentType === option.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <span style={{ fontSize: '18px' }}>{option.icon}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>

      {/* Content type description */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: colors.card,
        borderRadius: '8px',
        marginBottom: '24px',
        border: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <span style={{ fontSize: '24px' }}>
          {CONTENT_TYPE_OPTIONS.find(o => o.value === contentType)?.icon}
        </span>
        <div>
          <div style={{ fontWeight: 600, color: colors.text }}>
            {CONTENT_TYPE_OPTIONS.find(o => o.value === contentType)?.label}
          </div>
          <div style={{ fontSize: '13px', color: colors.textSecondary }}>
            {CONTENT_TYPE_OPTIONS.find(o => o.value === contentType)?.description}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(380px, 1fr) minmax(500px, 1.5fr)', gap: '24px' }}>
        {/* Left Column: Configuration */}
        <div style={{
          backgroundColor: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          padding: '24px',
        }}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '16px', color: colors.text, fontWeight: 600 }}>
            Configuration
          </h2>

          {loadingData ? (
            <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
              Loading options...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Product Selection */}
              <div>
                <label style={labelStyle}>Product</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <select
                    value={selectedBrand}
                    onChange={(e) => {
                      setSelectedBrand(e.target.value);
                      setSelectedProductId('');
                    }}
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    <option value="">All Brands</option>
                    {brands.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    style={{ ...inputStyle, flex: 2 }}
                  >
                    <option value="">Select Product...</option>
                    {filteredProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '8px' }}>
                  Or enter manually:
                </div>
                <input
                  value={manualProductName}
                  onChange={(e) => {
                    setManualProductName(e.target.value);
                    if (e.target.value) setSelectedProductId('');
                  }}
                  placeholder="Product name"
                  style={inputStyle}
                />
              </div>

              {/* Persona Selection */}
              <div>
                <label style={labelStyle}>Target Persona (Optional)</label>
                <select
                  value={selectedPersonaId}
                  onChange={(e) => {
                    setSelectedPersonaId(e.target.value);
                    setSelectedPersonaPainPoints([]);
                  }}
                  style={inputStyle}
                >
                  <option value="">No specific persona</option>
                  {audiencePersonas.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Persona Preview Card */}
              {selectedPersona && (
                <PersonaPreviewCard
                  persona={selectedPersona}
                  selectedPainPoints={selectedPersonaPainPoints}
                  onPainPointsChange={setSelectedPersonaPainPoints}
                  expanded={personaPreviewExpanded}
                  onToggleExpand={() => setPersonaPreviewExpanded(!personaPreviewExpanded)}
                />
              )}

              {/* Content-Type Specific Options */}
              {contentType === 'skit' && (
                <>
                  <div>
                    <label style={labelStyle}>Content Format</label>
                    <select
                      value={contentFormat}
                      onChange={(e) => setContentFormat(e.target.value as ContentFormat)}
                      style={inputStyle}
                    >
                      {CONTENT_FORMAT_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: colors.textSecondary }}>
                      {CONTENT_FORMAT_OPTIONS.find(o => o.value === contentFormat)?.description}
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Duration</label>
                    <select
                      value={targetDuration}
                      onChange={(e) => setTargetDuration(e.target.value as TargetDuration)}
                      style={inputStyle}
                    >
                      {DURATION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Variations</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => setVariationCount(n)}
                          style={{
                            flex: 1,
                            padding: '10px',
                            backgroundColor: variationCount === n ? '#3b82f6' : colors.bg,
                            border: `1px solid ${variationCount === n ? '#3b82f6' : colors.border}`,
                            borderRadius: '6px',
                            color: variationCount === n ? 'white' : colors.text,
                            cursor: 'pointer',
                            fontWeight: variationCount === n ? 600 : 400,
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {contentType === 'script' && (
                <>
                  <div>
                    <label style={labelStyle}>Script Format</label>
                    <select
                      value={scriptFormat}
                      onChange={(e) => setScriptFormat(e.target.value as ScriptFormat)}
                      style={inputStyle}
                    >
                      {SCRIPT_FORMAT_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: colors.textSecondary }}>
                      {SCRIPT_FORMAT_OPTIONS.find(o => o.value === scriptFormat)?.description}
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Voice Style</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[
                        { value: 'first_person', label: 'First Person', desc: '"I discovered..."' },
                        { value: 'narrator', label: 'Narrator', desc: 'Third-person view' },
                        { value: 'expert', label: 'Expert', desc: 'Authority figure' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setScriptVoice(opt.value as typeof scriptVoice)}
                          style={{
                            flex: 1,
                            padding: '10px',
                            backgroundColor: scriptVoice === opt.value ? '#3b82f6' : colors.bg,
                            border: `1px solid ${scriptVoice === opt.value ? '#3b82f6' : colors.border}`,
                            borderRadius: '6px',
                            color: scriptVoice === opt.value ? 'white' : colors.text,
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Duration</label>
                    <select
                      value={targetDuration}
                      onChange={(e) => setTargetDuration(e.target.value as TargetDuration)}
                      style={inputStyle}
                    >
                      {DURATION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {contentType === 'hook' && (
                <>
                  <div>
                    <label style={labelStyle}>Hook Types to Generate</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {HOOK_TYPE_OPTIONS.map(opt => {
                        const selected = selectedHookTypes.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            onClick={() => {
                              if (selected) {
                                setSelectedHookTypes(selectedHookTypes.filter(h => h !== opt.value));
                              } else {
                                setSelectedHookTypes([...selectedHookTypes, opt.value]);
                              }
                            }}
                            title={opt.example}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: selected ? '#3b82f6' : colors.bg,
                              border: `1px solid ${selected ? '#3b82f6' : colors.border}`,
                              borderRadius: '6px',
                              color: selected ? 'white' : colors.text,
                              cursor: 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Number of Hooks</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[5, 10, 15, 20].map(n => (
                        <button
                          key={n}
                          onClick={() => setHookCount(n)}
                          style={{
                            flex: 1,
                            padding: '10px',
                            backgroundColor: hookCount === n ? '#3b82f6' : colors.bg,
                            border: `1px solid ${hookCount === n ? '#3b82f6' : colors.border}`,
                            borderRadius: '6px',
                            color: hookCount === n ? 'white' : colors.text,
                            cursor: 'pointer',
                            fontWeight: hookCount === n ? 600 : 400,
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Risk Tier - for skit and script */}
              {contentType !== 'hook' && (
                <div>
                  <label style={labelStyle}>Tone / Risk Level</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['SAFE', 'BALANCED', 'SPICY'] as RiskTier[]).map(tier => (
                      <button
                        key={tier}
                        onClick={() => setRiskTier(tier)}
                        style={{
                          flex: 1,
                          padding: '10px',
                          backgroundColor: riskTier === tier ? (tier === 'SAFE' ? '#10b981' : tier === 'BALANCED' ? '#f59e0b' : '#ef4444') : colors.bg,
                          border: `1px solid ${riskTier === tier ? 'transparent' : colors.border}`,
                          borderRadius: '6px',
                          color: riskTier === tier ? 'white' : colors.text,
                          cursor: 'pointer',
                          fontWeight: riskTier === tier ? 600 : 400,
                        }}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Creative Direction */}
              <div>
                <label style={labelStyle}>Creative Direction (Optional)</label>
                <textarea
                  value={creativeDirection}
                  onChange={(e) => setCreativeDirection(e.target.value)}
                  placeholder="Any specific angle, style, or direction..."
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={generating || (!selectedProductId && !manualProductName.trim())}
                style={{
                  ...buttonStyle,
                  opacity: generating || (!selectedProductId && !manualProductName.trim()) ? 0.5 : 1,
                  cursor: generating ? 'wait' : 'pointer',
                  width: '100%',
                  marginTop: '8px',
                }}
              >
                {generating ? (
                  <>
                    <span style={{ animation: 'spin 1s linear infinite' }}>⚡</span>
                    Generating...
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    Generate {contentType === 'skit' ? 'Skit' : contentType === 'script' ? 'Script' : 'Hooks'}
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Results */}
        <div style={{
          backgroundColor: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          padding: '24px',
          minHeight: '500px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', color: colors.text, fontWeight: 600 }}>
              Results
            </h2>
            {result && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={openSaveModal}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#7c3aed',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  💾 Save to Library
                </button>
              </div>
            )}
          </div>

          {error && (
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
            }}>
              <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: '4px' }}>
                {getActionableErrorMessage(error).message}
              </div>
              <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                {getActionableErrorMessage(error).action}
              </div>
            </div>
          )}

          {!result && !generating && !error && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '400px',
              color: colors.textSecondary,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>
                {CONTENT_TYPE_OPTIONS.find(o => o.value === contentType)?.icon}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>
                Ready to generate
              </div>
              <div style={{ fontSize: '14px', maxWidth: '300px' }}>
                Select a product and configure your options, then click Generate to create{' '}
                {contentType === 'skit' ? 'comedy skits' : contentType === 'script' ? 'marketing scripts' : 'hook variations'}.
              </div>
            </div>
          )}

          {generating && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '400px',
              color: colors.textSecondary,
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'pulse 1.5s infinite' }}>
                ⚡
              </div>
              <div style={{ fontSize: '16px', fontWeight: 500 }}>
                Generating {contentType === 'skit' ? 'skits' : contentType === 'script' ? 'script' : 'hooks'}...
              </div>
              <div style={{ fontSize: '14px', marginTop: '8px' }}>
                This may take a few moments
              </div>
            </div>
          )}

          {/* Skit Results */}
          {result && contentType === 'skit' && currentSkit && (
            <div>
              {/* Variation Tabs */}
              {result.variations && result.variations.length > 1 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {result.variations.map((v, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedVariationIndex(idx)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: selectedVariationIndex === idx ? '#3b82f6' : colors.bg,
                        border: `1px solid ${selectedVariationIndex === idx ? '#3b82f6' : colors.border}`,
                        borderRadius: '6px',
                        color: selectedVariationIndex === idx ? 'white' : colors.text,
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      Variation {idx + 1}
                      {v.ai_score && (
                        <span style={{ marginLeft: '8px', opacity: 0.8 }}>
                          ({v.ai_score.overall_score}/100)
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Hook */}
              <div style={{
                padding: '16px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '8px',
                marginBottom: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#3b82f6', marginBottom: '6px', textTransform: 'uppercase' }}>
                      🎣 Hook
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: colors.text }}>
                      {currentSkit.hook_line}
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(currentSkit.hook_line, 'hook')}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: copiedField === 'hook' ? '#10b981' : colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: copiedField === 'hook' ? 'white' : colors.textSecondary,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {copiedField === 'hook' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Beats */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '12px', textTransform: 'uppercase' }}>
                  📽️ Scenes
                </div>
                {currentSkit.beats.map((beat, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '8px',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {beat.t}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', color: colors.text, marginBottom: beat.dialogue ? '8px' : 0 }}>
                          {beat.action}
                        </div>
                        {beat.dialogue && (
                          <div style={{
                            fontSize: '14px',
                            color: colors.text,
                            fontStyle: 'italic',
                            padding: '8px 12px',
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            borderRadius: '6px',
                            borderLeft: '3px solid #8b5cf6',
                          }}>
                            &ldquo;{beat.dialogue}&rdquo;
                          </div>
                        )}
                        {beat.on_screen_text && (
                          <div style={{
                            marginTop: '8px',
                            fontSize: '12px',
                            color: '#f59e0b',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}>
                            <span>📝</span> {beat.on_screen_text}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div style={{
                padding: '16px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', marginBottom: '6px', textTransform: 'uppercase' }}>
                  🎯 Call to Action
                </div>
                <div style={{ fontSize: '15px', fontWeight: 500, color: colors.text, marginBottom: '8px' }}>
                  {currentSkit.cta_line}
                </div>
                {currentSkit.cta_overlay && (
                  <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                    Overlay: {currentSkit.cta_overlay}
                  </div>
                )}
              </div>

              {/* Copy Full Script Button */}
              <button
                onClick={() => {
                  const fullScript = [
                    `HOOK: ${currentSkit.hook_line}`,
                    '',
                    ...currentSkit.beats.map((b, i) => {
                      let beatText = `[${b.t}] ${b.action}`;
                      if (b.dialogue) beatText += `\n   "${b.dialogue}"`;
                      if (b.on_screen_text) beatText += `\n   [TEXT: ${b.on_screen_text}]`;
                      return beatText;
                    }),
                    '',
                    `CTA: ${currentSkit.cta_line}`,
                    currentSkit.cta_overlay ? `OVERLAY: ${currentSkit.cta_overlay}` : '',
                  ].filter(Boolean).join('\n');
                  copyToClipboard(fullScript, 'full');
                }}
                style={{
                  width: '100%',
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: copiedField === 'full' ? '#10b981' : colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  color: copiedField === 'full' ? 'white' : colors.text,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                {copiedField === 'full' ? '✓ Copied Full Script!' : '📋 Copy Full Script'}
              </button>
            </div>
          )}

          {/* Script Results */}
          {result && contentType === 'script' && result.script && (
            <div>
              <div style={{
                padding: '16px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '8px',
                marginBottom: '16px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#3b82f6', marginBottom: '6px', textTransform: 'uppercase' }}>
                  🎣 Hook
                </div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: colors.text }}>
                  {result.script.hook}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '12px', textTransform: 'uppercase' }}>
                  📝 Script Body
                </div>
                {result.script.body.map((paragraph, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '8px',
                      marginBottom: '8px',
                      fontSize: '14px',
                      color: colors.text,
                      lineHeight: 1.6,
                    }}
                  >
                    {paragraph}
                  </div>
                ))}
              </div>

              <div style={{
                padding: '16px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', marginBottom: '6px', textTransform: 'uppercase' }}>
                  🎯 Call to Action
                </div>
                <div style={{ fontSize: '15px', fontWeight: 500, color: colors.text }}>
                  {result.script.cta}
                </div>
              </div>

              <button
                onClick={() => {
                  const fullScript = [
                    result.script!.hook,
                    '',
                    ...result.script!.body,
                    '',
                    result.script!.cta,
                  ].join('\n\n');
                  copyToClipboard(fullScript, 'full');
                }}
                style={{
                  width: '100%',
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: copiedField === 'full' ? '#10b981' : colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  color: copiedField === 'full' ? 'white' : colors.text,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                {copiedField === 'full' ? '✓ Copied!' : '📋 Copy Full Script'}
              </button>
            </div>
          )}

          {/* Hook Results */}
          {result && contentType === 'hook' && result.hooks && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: colors.textSecondary, marginBottom: '16px' }}>
                  Generated {result.hooks.hooks.length} hook variations. Click to copy.
                </div>
                {result.hooks.hooks.map((hook, idx) => (
                  <button
                    key={idx}
                    onClick={() => copyToClipboard(hook.text, `hook-${idx}`)}
                    style={{
                      width: '100%',
                      padding: '16px',
                      backgroundColor: copiedField === `hook-${idx}` ? 'rgba(16, 185, 129, 0.1)' : colors.bg,
                      border: `1px solid ${copiedField === `hook-${idx}` ? '#10b981' : colors.border}`,
                      borderRadius: '8px',
                      marginBottom: '8px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', color: colors.text, marginBottom: '6px', lineHeight: 1.4 }}>
                          {hook.text}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            color: '#8b5cf6',
                            borderRadius: '4px',
                          }}>
                            {HOOK_TYPE_OPTIONS.find(h => h.value === hook.type)?.label || hook.type}
                          </span>
                          {hook.strength_score && (
                            <span style={{ fontSize: '12px', color: colors.textSecondary }}>
                              Score: {hook.strength_score}/10
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', color: copiedField === `hook-${idx}` ? '#10b981' : colors.textSecondary }}>
                        {copiedField === `hook-${idx}` ? '✓ Copied' : 'Click to copy'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  const allHooks = result.hooks!.hooks.map((h, i) => `${i + 1}. ${h.text}`).join('\n');
                  copyToClipboard(allHooks, 'all-hooks');
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: copiedField === 'all-hooks' ? '#10b981' : colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  color: copiedField === 'all-hooks' ? 'white' : colors.text,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                {copiedField === 'all-hooks' ? '✓ All Hooks Copied!' : '📋 Copy All Hooks'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Save Modal */}
      {saveModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: colors.card,
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '400px',
            border: `1px solid ${colors.border}`,
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: colors.text }}>Save to Library</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Title</label>
              <input
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Status</label>
              <select
                value={saveStatus}
                onChange={(e) => setSaveStatus(e.target.value as SkitStatus)}
                style={inputStyle}
              >
                {SKIT_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setSaveModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  color: colors.text,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToLibrary}
                disabled={savingToLibrary || !saveTitle.trim()}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#7c3aed',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer',
                  opacity: savingToLibrary || !saveTitle.trim() ? 0.5 : 1,
                }}
              >
                {savingToLibrary ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved toast */}
      {savedToLibrary && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#10b981',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '8px',
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
        }}>
          ✓ Saved to Library
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media (max-width: 900px) {
          div[style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
