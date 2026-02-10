'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { postJson, isApiError, type ApiClientError } from '@/lib/http/fetchJson';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { useCredits } from '@/hooks/useCredits';
import { NoCreditsModal, useNoCreditsModal } from '@/components/FeatureGate';
import PersonaPreviewCard from '@/components/PersonaPreviewCard';
import {
  Megaphone,
  Search,
  ShoppingCart,
  Star,
  Theater,
  GraduationCap,
  BookOpen,
  User,
  Bot,
  Mic,
  Type,
  Smartphone,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
  Smile,
  Sparkles,
  Check,
  Copy,
  Loader2,
  Package,
  Users,
  Settings,
  Download,
  Zap,
  Target,
  Image as ImageIcon,
  Bookmark,
  Pencil,
  X,
  AlertTriangle,
  FlaskConical,
  RefreshCw,
  MessageCircle,
  Send,
} from 'lucide-react';

// Import from content-types.ts
import {
  CONTENT_TYPES,
  PRESENTATION_STYLES,
  TARGET_LENGTHS,
  HUMOR_LEVELS,
  getGenerationCreditCost,
} from '@/lib/content-types';

// Icon mapping for content types
const CONTENT_TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Megaphone,
  Search,
  ShoppingCart,
  Star,
  Theater,
  GraduationCap,
  BookOpen,
};

// Icon mapping for presentation styles
const PRESENTATION_STYLE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  User,
  Theater,
  Bot,
  Mic,
  Type,
  Smartphone,
  Layers,
};

// Funnel stage colors
const FUNNEL_STAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  awareness: { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
  consideration: { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
  conversion: { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
};

// Main content category tabs
const MAIN_TABS = [
  { id: 'all', label: 'All Types', icon: Sparkles, description: 'View all content types', contentTypes: [] as string[], funnelHint: '' },
  { id: 'skit', label: 'Skit / Comedy', icon: Theater, description: 'Dialogue-based comedy content', contentTypes: ['skit', 'tof'], funnelHint: 'Top of funnel: hooks and viral moments' },
  { id: 'ugc', label: 'UGC / Testimonial', icon: User, description: 'Authentic user-generated style', contentTypes: ['testimonial', 'mof'], funnelHint: 'Middle of funnel: demos, social proof' },
  { id: 'hook', label: 'Hook / Teaser', icon: Zap, description: 'Quick attention-grabbing content', contentTypes: ['tof'], funnelHint: 'Top of funnel: scroll-stopping openers' },
  { id: 'educational', label: 'Educational', icon: GraduationCap, description: 'Value-first teaching content', contentTypes: ['educational'], funnelHint: 'Mid-funnel: builds trust and authority' },
  { id: 'story', label: 'Story / Narrative', icon: BookOpen, description: 'Emotional storytelling', contentTypes: ['story', 'slideshow_story'], funnelHint: 'Full-funnel: emotional connection' },
  { id: 'direct', label: 'Direct Response', icon: Target, description: 'Conversion-focused content', contentTypes: ['bof'], funnelHint: 'Bottom of funnel: offers, urgency, direct CTA' },
];

// --- Types ---

interface AuthUser {
  id: string;
  email: string | null;
}

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  description?: string;
  notes?: string;
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

interface AIScore {
  hook_strength: number;
  humor_level: number;
  product_integration: number;
  virality_potential: number;
  clarity: number;
  production_feasibility: number;
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
  variations?: SkitVariation[];
  variation_count?: number;
  skit?: SkitData;
  risk_tier_applied: 'SAFE' | 'BALANCED' | 'SPICY';
  ai_score?: AIScore | null;
  audience_metadata?: {
    persona_name?: string;
    pain_points_addressed?: string[];
  };
  prompt_metadata?: {
    contentType: string;
    presentationStyle: string;
    funnelStage: string;
  };
  strategy_metadata?: {
    recommended_angle: string;
    tone_direction: string;
    risk_score: number;
    reasoning: string;
    suggested_hooks: string[];
    content_approach: string;
    avoid: string[];
  } | null;
  clawbot_active?: boolean;
  data_source?: 'product' | 'global';
  strategy_confidence?: {
    level: 'high' | 'medium' | 'low';
    reason: string;
  } | null;
}

type RiskTier = 'SAFE' | 'BALANCED' | 'SPICY';
type SkitStatus = 'draft' | 'approved' | 'produced' | 'posted' | 'archived';

const SKIT_STATUS_OPTIONS: { value: SkitStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'produced', label: 'Produced' },
  { value: 'posted', label: 'Posted' },
  { value: 'archived', label: 'Archived' },
];

// localStorage keys
const SETTINGS_STORAGE_KEY = 'content-studio-v2-settings';

interface SavedSettings {
  mainTabId: string;
  contentTypeId: string;
  subtypeId: string;
  presentationStyleId: string;
  targetLengthId: string;
  humorLevelId: string;
  riskTier: RiskTier;
  variationCount: number;
  showAdvanced: boolean;
}

// --- Helper Functions ---

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

export default function ContentStudioPage() {
  const searchParams = useSearchParams();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  // Auth state
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Credits state
  const { hasCredits, refetch: refetchCredits } = useCredits();
  const noCreditsModal = useNoCreditsModal();

  // Data state
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [audiencePersonas, setAudiencePersonas] = useState<AudiencePersona[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Main Tab (top-level category filter)
  const [selectedMainTabId, setSelectedMainTabId] = useState<string>('all');

  // STEP 1: Content Type
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<string>('tof');

  // STEP 2: Subtype
  const [selectedSubtypeId, setSelectedSubtypeId] = useState<string>('');

  // STEP 3: Product
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [manualProductName, setManualProductName] = useState<string>('');
  const [manualBrandName, setManualBrandName] = useState<string>('');
  const [productDescription] = useState<string>('');

  // STEP 4: Target Audience
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
  const [selectedPainPoints, setSelectedPainPoints] = useState<string[]>([]);
  const [personaExpanded, setPersonaExpanded] = useState(true);

  // Product pain points
  const [productPainPoints, setProductPainPoints] = useState<string[]>([]);
  const [generatingPainPoints, setGeneratingPainPoints] = useState(false);

  // STEP 5: Presentation Style
  const [selectedPresentationStyleId, setSelectedPresentationStyleId] = useState<string>('talking_head');

  // STEP 6: Length & Tone
  const [selectedLengthId, setSelectedLengthId] = useState<string>('short');
  const [selectedHumorId, setSelectedHumorId] = useState<string>('light');
  const [riskTier, setRiskTier] = useState<RiskTier>('BALANCED');

  // STEP 7: Advanced Options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [referenceScript, setReferenceScript] = useState<string>('');
  const [specificHooks, setSpecificHooks] = useState<string>('');
  const [thingsToAvoid, setThingsToAvoid] = useState<string>('');
  const [ctaPreference, setCtaPreference] = useState<string>('');
  const [customCta, setCustomCta] = useState<string>('');
  const [variationCount, setVariationCount] = useState<number>(3);

  // Result state
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState(0);

  // Save hook state
  const [savingHook, setSavingHook] = useState(false);
  const [hookSaved, setHookSaved] = useState(false);
  const [hookSaveError, setHookSaveError] = useState(false);

  // Save modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<SkitStatus>('draft');
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);

  // Approve & pipeline state
  const [approvingToPipeline, setApprovingToPipeline] = useState(false);
  const [approvedToPipeline, setApprovedToPipeline] = useState(false);

  // CTA editing state
  const [editingCTA, setEditingCTA] = useState(false);
  const [editedCTALine, setEditedCTALine] = useState('');
  const [editedCTAOverlay, setEditedCTAOverlay] = useState('');

  // Strategy reasoning toggle
  const [showStrategyReasoning, setShowStrategyReasoning] = useState(false);

  // A/B Test mode
  const [abTestMode, setAbTestMode] = useState(false);
  const [savingAbTest, setSavingAbTest] = useState(false);

  // Clawbot suppression patterns
  const [suppressedPatterns, setSuppressedPatterns] = useState<string[]>([]);

  // Clawbot recommendation
  const [recommendation, setRecommendation] = useState<{
    content_type: string;
    angle: string;
    reason: string;
  } | null>(null);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // --- Computed Values ---

  const selectedMainTab = useMemo(() => {
    return MAIN_TABS.find(t => t.id === selectedMainTabId);
  }, [selectedMainTabId]);

  const filteredContentTypes = useMemo(() => {
    if (selectedMainTabId === 'all' || !selectedMainTab?.contentTypes.length) {
      return CONTENT_TYPES;
    }
    return CONTENT_TYPES.filter(ct => selectedMainTab.contentTypes.includes(ct.id));
  }, [selectedMainTabId, selectedMainTab]);

  const selectedContentType = useMemo(() => {
    return CONTENT_TYPES.find(ct => ct.id === selectedContentTypeId);
  }, [selectedContentTypeId]);

  const selectedPresentationStyle = useMemo(() => {
    return PRESENTATION_STYLES.find(ps => ps.id === selectedPresentationStyleId);
  }, [selectedPresentationStyleId]);

  const selectedPersona = useMemo(() => {
    return audiencePersonas.find(p => p.id === selectedPersonaId) || null;
  }, [audiencePersonas, selectedPersonaId]);

  const filteredProducts = useMemo(() => {
    if (!selectedBrand) return products;
    return products.filter(p => p.brand?.trim() === selectedBrand.trim());
  }, [products, selectedBrand]);

  const creditCost = useMemo(() => {
    return getGenerationCreditCost(selectedContentTypeId, selectedLengthId);
  }, [selectedContentTypeId, selectedLengthId]);

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
        const [productsRes, personasRes, suppressionsRes] = await Promise.all([
          fetch('/api/products', { credentials: 'include' }),
          fetch('/api/audience/personas', { credentials: 'include' }),
          fetch('/api/clawbot/summaries/latest', { credentials: 'include' }).catch(() => null),
        ]);

        if (productsRes.ok) {
          const data = await productsRes.json();
          const productsList = data.data || [];
          setProducts(productsList);
          const uniqueBrands = [...new Set(productsList.map((p: Product) => p.brand).filter(Boolean))] as string[];
          setBrands(uniqueBrands.sort());
        } else {
          console.error('Failed to fetch products:', productsRes.status);
        }

        if (personasRes.ok) {
          const data = await personasRes.json();
          setAudiencePersonas(data.data || []);
        } else {
          console.error('Failed to fetch personas:', personasRes.status);
        }

        // Load Clawbot suppression patterns + recommendations
        if (suppressionsRes?.ok) {
          try {
            const sData = await suppressionsRes.json();
            if (sData.summary?.suppression_rules) {
              setSuppressedPatterns(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                sData.summary.suppression_rules.map((r: any) => r.pattern_id)
              );
            }
            // Extract recommendation
            if (sData.summary?.recommended_next?.[0]) {
              const rec = sData.summary.recommended_next[0];
              setRecommendation({
                content_type: rec.goal === 'sales' ? 'bof' : rec.goal === 'awareness' ? 'tof' : 'mof',
                angle: rec.angle,
                reason: rec.why,
              });
            } else if (sData.summary?.winning_patterns?.[0]) {
              const winner = sData.summary.winning_patterns[0];
              setRecommendation({
                content_type: 'mof',
                angle: winner.angle,
                reason: `Your "${winner.angle}" content is performing well (+${winner.winners} winners)`,
              });
            }
          } catch {
            // Ignore parse errors for non-critical data
          }
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
        if (settings.mainTabId) setSelectedMainTabId(settings.mainTabId);
        if (settings.contentTypeId) setSelectedContentTypeId(settings.contentTypeId);
        if (settings.subtypeId) setSelectedSubtypeId(settings.subtypeId);
        if (settings.presentationStyleId) setSelectedPresentationStyleId(settings.presentationStyleId);
        if (settings.targetLengthId) setSelectedLengthId(settings.targetLengthId);
        if (settings.humorLevelId) setSelectedHumorId(settings.humorLevelId);
        if (settings.riskTier) setRiskTier(settings.riskTier);
        if (typeof settings.variationCount === 'number') setVariationCount(settings.variationCount);
        if (typeof settings.showAdvanced === 'boolean') setShowAdvanced(settings.showAdvanced);
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save settings on change
  useEffect(() => {
    const settings: SavedSettings = {
      mainTabId: selectedMainTabId,
      contentTypeId: selectedContentTypeId,
      subtypeId: selectedSubtypeId,
      presentationStyleId: selectedPresentationStyleId,
      targetLengthId: selectedLengthId,
      humorLevelId: selectedHumorId,
      riskTier,
      variationCount,
      showAdvanced,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [selectedMainTabId, selectedContentTypeId, selectedSubtypeId, selectedPresentationStyleId, selectedLengthId, selectedHumorId, riskTier, variationCount, showAdvanced]);

  // URL param handling
  useEffect(() => {
    const productId = searchParams.get('product');
    if (productId) {
      setSelectedProductId(productId);
    }
    const typeParam = searchParams.get('type');
    if (typeParam) {
      // Set the content type
      const matchedType = CONTENT_TYPES.find(ct => ct.id === typeParam);
      if (matchedType) {
        setSelectedContentTypeId(typeParam);
        // Find matching main tab
        const matchingTab = MAIN_TABS.find(t => t.contentTypes.includes(typeParam));
        if (matchingTab) {
          setSelectedMainTabId(matchingTab.id);
        }
      }
    }
  }, [searchParams]);

  // Reset subtype when content type changes
  useEffect(() => {
    if (selectedContentType?.subtypes?.[0]) {
      setSelectedSubtypeId(selectedContentType.subtypes[0].id);
    }
  }, [selectedContentTypeId]);

  // When main tab changes, select the first content type in that category
  useEffect(() => {
    if (filteredContentTypes.length > 0 && !filteredContentTypes.find(ct => ct.id === selectedContentTypeId)) {
      setSelectedContentTypeId(filteredContentTypes[0].id);
    }
  }, [selectedMainTabId, filteredContentTypes]);

  // Reset product pain points when product changes
  useEffect(() => {
    setProductPainPoints([]);
  }, [selectedProductId]);

  // --- Handlers ---

  // Normalize pain points: objects {point, category, ...} → extract .point text; strings pass through
  const normalizePainPoints = (points: unknown[]): string[] => {
    return points.map(p => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object' && 'point' in p) return (p as { point: string }).point;
      return String(p);
    }).filter(Boolean);
  };

  const fetchOrGeneratePainPoints = async () => {
    if (!selectedProductId) return;
    setGeneratingPainPoints(true);
    try {
      // First try to GET existing pain points from product
      const getRes = await fetch(`/api/products/${selectedProductId}`, { credentials: 'include' });
      if (getRes.ok) {
        const data = await getRes.json();
        const existing = data.data?.pain_points;
        if (existing && Array.isArray(existing) && existing.length > 0) {
          setProductPainPoints(normalizePainPoints(existing));
          setGeneratingPainPoints(false);
          return;
        }
      }

      // No existing pain points — generate them (saves to product automatically)
      const selectedProduct = products.find(p => p.id === selectedProductId);
      const genRes = await fetch('/api/products/generate-pain-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProductId,
          product_name: selectedProduct?.name,
          product_description: selectedProduct?.notes || selectedProduct?.description,
        }),
        credentials: 'include',
      });
      if (!genRes.ok) {
        const errData = await genRes.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Pain points generation failed:', genRes.status, errData);
        setError({
          ok: false,
          error_code: errData.error_code || 'INTERNAL',
          message: errData.message || `Failed to generate pain points (${genRes.status})`,
          correlation_id: errData.correlation_id || '',
          httpStatus: genRes.status,
        });
        return;
      }
      const genData = await genRes.json();
      const points = genData.data?.pain_points || genData.pain_points || [];
      const normalized = normalizePainPoints(Array.isArray(points) ? points : []);
      if (normalized.length === 0) {
        setError({
          ok: false,
          error_code: 'INTERNAL',
          message: 'AI returned no pain points — try again',
          correlation_id: '',
          httpStatus: 0,
        });
        return;
      }
      setProductPainPoints(normalized);
    } catch (err) {
      console.error('Failed to fetch/generate pain points:', err);
      setError({
        ok: false,
        error_code: 'INTERNAL',
        message: 'Network error generating pain points',
        correlation_id: '',
        httpStatus: 0,
      });
    } finally {
      setGeneratingPainPoints(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const handleSaveHook = async (hookText: string) => {
    setSavingHook(true);
    setHookSaveError(false);
    try {
      const productName = selectedProductId
        ? products.find(p => p.id === selectedProductId)?.name
        : manualProductName.trim() || undefined;
      const brandName = selectedProductId
        ? products.find(p => p.id === selectedProductId)?.brand
        : manualBrandName.trim() || undefined;

      const res = await fetch('/api/saved-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hook_text: hookText,
          source: 'generated',
          content_type: selectedContentTypeId,
          content_format: selectedSubtypeId || undefined,
          product_id: selectedProductId || undefined,
          product_name: productName,
          brand_name: brandName,
        }),
      });

      if (res.ok) {
        setHookSaved(true);
        setTimeout(() => setHookSaved(false), 2000);
      } else {
        setHookSaveError(true);
        setTimeout(() => setHookSaveError(false), 3000);
      }
    } catch {
      setHookSaveError(true);
      setTimeout(() => setHookSaveError(false), 3000);
    } finally {
      setSavingHook(false);
    }
  };

  // Clawbot suppression check
  const isPatternSuppressed = (r: GenerationResult) => {
    const angle = r.strategy_metadata?.recommended_angle;
    return angle ? suppressedPatterns.some(p => angle.toLowerCase().includes(p.toLowerCase())) : false;
  };

  const handleRegenerateWithDifferentAngle = (avoidAngle: string | undefined) => {
    if (!avoidAngle) return;
    const avoidLine = `Avoid using the "${avoidAngle}" angle - try a different approach`;
    const current = thingsToAvoid.trim();
    setThingsToAvoid(current ? `${current}. ${avoidLine}` : avoidLine);
  };

  // AI Chat handler
  const handleChatSend = async (messageOverride?: string) => {
    const msg = (messageOverride || chatInput).trim();
    if (!msg || chatLoading) return;

    const userMessage = { role: 'user' as const, content: msg };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      // Build context from current script
      const currentSkit = result?.variations?.[selectedVariationIndex]?.skit || result?.skit;
      const selectedProduct = products.find(p => p.id === selectedProductId);
      const scriptText = currentSkit ? [
        `HOOK: ${currentSkit.hook_line}`,
        ...currentSkit.beats.map(b => `[${b.t}] ${b.action}${b.dialogue ? ` "${b.dialogue}"` : ''}`),
        `CTA: ${currentSkit.cta_line}`,
      ].join('\n') : undefined;

      const res = await postJson('/api/ai/chat', {
        message: msg,
        context: {
          brand: selectedProduct?.brand || manualBrandName || undefined,
          product: selectedProduct?.name || manualProductName || undefined,
          current_script: scriptText,
          spoken_hook: currentSkit?.hook_line,
          angle: result?.strategy_metadata?.recommended_angle,
        },
      });

      if (isApiError(res)) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Try again.' }]);
      } else {
        const data = res as unknown as { response: string };
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect. Try again.' }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
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

    // Map frontend fields to API schema
    // presentation_style → actor_type
    const actorTypeMap: Record<string, string> = {
      'talking_head': 'human',
      'human_actor': 'human',
      'ai_avatar': 'ai_avatar',
      'voiceover': 'voiceover',
      'text_overlay': 'voiceover',
      'ugc_style': 'human',
      'mixed': 'mixed',
    };

    // target_length → target_duration
    const durationMap: Record<string, string> = {
      'micro': 'quick',
      'short': 'quick',
      'medium': 'standard',
      'long': 'extended',
    };

    // humor_level → intensity (0-100)
    const intensityMap: Record<string, number> = {
      'none': 10,
      'light': 30,
      'moderate': 50,
      'heavy': 80,
    };

    // content_type + content_subtype → content_format
    const getContentFormat = (): string => {
      // Map based on content type and subtype
      if (selectedContentTypeId === 'skit') return 'skit_dialogue';
      if (selectedContentTypeId === 'bof') return 'pov_story'; // BOF: direct-to-camera urgency pitch
      if (selectedContentTypeId === 'slideshow_story') return 'scene_montage'; // Slideshow: visual scenes
      if (selectedSubtypeId === 'day_in_life' || selectedSubtypeId === 'day_in_life_story') return 'day_in_life';
      if (selectedSubtypeId === 'product_demo' || selectedSubtypeId === 'how_it_works') return 'product_demo_parody';
      if (selectedSubtypeId === 'relatable' || selectedSubtypeId === 'relatable_situation') return 'pov_story';
      if (selectedContentTypeId === 'testimonial') return 'reaction_commentary';
      if (selectedContentTypeId === 'story') return 'pov_story';
      // Default based on presentation style
      if (selectedPresentationStyleId === 'voiceover' || selectedPresentationStyleId === 'text_overlay') return 'scene_montage';
      return 'skit_dialogue';
    };

    // Build payload with correct API field names
    const payload: Record<string, unknown> = {
      // Product info
      product_id: selectedProductId || undefined,
      product_name: selectedProductId ? undefined : manualProductName.trim(),
      brand_name: selectedProductId ? undefined : manualBrandName.trim() || undefined,
      product_context: productDescription.trim() || undefined,

      // Audience info
      audience_persona_id: selectedPersonaId || undefined,
      pain_point_focus: selectedPainPoints.length > 0 ? selectedPainPoints : undefined,
      use_audience_language: true,

      // Content type identification (drives prompt framing)
      content_type_id: selectedContentTypeId,
      content_subtype_id: selectedSubtypeId || undefined,

      // Content format and presentation (mapped to API schema)
      content_format: getContentFormat(),
      actor_type: actorTypeMap[selectedPresentationStyleId] || 'human',
      target_duration: durationMap[selectedLengthId] || 'standard',
      intensity: intensityMap[selectedHumorId] || 50,
      chaos_level: intensityMap[selectedHumorId] || 50,

      // Required fields
      risk_tier: riskTier,
      persona: 'NONE', // Default persona - user can customize later

      // Variations (A/B mode forces 2)
      variation_count: abTestMode ? 2 : variationCount,

      // Creative direction from advanced options
      creative_direction: [
        referenceScript.trim() ? `Reference style: ${referenceScript.trim()}` : '',
        specificHooks.trim() ? `Include hooks: ${specificHooks.trim()}` : '',
        thingsToAvoid.trim() ? `Avoid: ${thingsToAvoid.trim()}` : '',
        (ctaPreference === 'custom' ? customCta.trim() : ctaPreference.trim()) ? `CTA style: ${ctaPreference === 'custom' ? customCta.trim() : ctaPreference.trim()}` : '',
      ].filter(Boolean).join('. ') || undefined,
    };

    try {
      const response = await postJson<GenerationResult>('/api/clawbot/generate-skit', payload);

      if (isApiError(response)) {
        if (response.httpStatus === 402) {
          refetchCredits();
          noCreditsModal.open();
          return;
        }
        setError(response);
      } else {
        setResult(response.data);
        setApprovedToPipeline(false);
      }
    } catch {
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
    setSaveTitle(`${productName} - ${selectedContentType?.name || 'Content'} - ${new Date().toLocaleDateString()}`);
    setSaveModalOpen(true);
  };

  const handleSaveToLibrary = async () => {
    if (!result || !saveTitle.trim()) return;

    setSavingToLibrary(true);
    try {
      const currentSkit = result.variations?.[selectedVariationIndex]?.skit || result.skit;
      const response = await postJson('/api/skits', {
        title: saveTitle.trim(),
        status: saveStatus,
        product_id: selectedProductId || null,
        product_name: selectedProductId ? products.find(p => p.id === selectedProductId)?.name : manualProductName,
        product_brand: selectedProductId ? products.find(p => p.id === selectedProductId)?.brand : manualBrandName,
        skit_data: currentSkit,
        generation_config: {
          content_type: selectedContentTypeId,
          content_subtype: selectedSubtypeId,
          presentation_style: selectedPresentationStyleId,
          target_length: selectedLengthId,
          humor_level: selectedHumorId,
          risk_tier: riskTier,
        },
        ai_score: result.variations?.[selectedVariationIndex]?.ai_score || result.ai_score,
        strategy_metadata: result.strategy_metadata || null,
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

  const handleSaveAsAbTest = async () => {
    if (!result || !result.variations || result.variations.length < 2) return;
    setSavingAbTest(true);
    try {
      const productName = selectedProductId
        ? products.find(p => p.id === selectedProductId)?.name || 'Unknown'
        : manualProductName || 'Manual Entry';
      const productBrand = selectedProductId
        ? products.find(p => p.id === selectedProductId)?.brand || ''
        : manualBrandName || '';

      // Save both variants to library first
      const saveVariant = async (index: number, label: string) => {
        const skit = result.variations![index]?.skit;
        if (!skit) return null;
        const res = await postJson<{ id: string }>('/api/skits', {
          title: `${productName} - ${label} - ${new Date().toLocaleDateString()}`,
          status: 'draft',
          product_id: selectedProductId || null,
          product_name: productName,
          product_brand: productBrand,
          skit_data: skit,
          generation_config: {
            content_type: selectedContentTypeId,
            presentation_style: selectedPresentationStyleId,
            risk_tier: riskTier,
          },
          ai_score: result.variations![index]?.ai_score || null,
        });
        if (isApiError(res)) return null;
        return res.data?.id || null;
      };

      const [variantAId, variantBId] = await Promise.all([
        saveVariant(0, 'Variant A'),
        saveVariant(1, 'Variant B'),
      ]);

      // Create the A/B test
      const testRes = await fetch('/api/ab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${productName} - A/B Test - ${new Date().toLocaleDateString()}`,
          product_id: selectedProductId || undefined,
          variant_a_id: variantAId,
          variant_b_id: variantBId,
          hypothesis: `Comparing two ${selectedContentType?.name || 'content'} variations for ${productName}`,
        }),
      });

      if (testRes.ok) {
        // Show success
        setAbTestMode(false);
        // Brief notification
        alert('A/B Test created! View it in the A/B Tests page.');
      }
    } catch (err) {
      console.error('Failed to save A/B test:', err);
    } finally {
      setSavingAbTest(false);
    }
  };

  const handleApproveAndSend = async () => {
    if (!result || approvedToPipeline) return;
    setApprovingToPipeline(true);
    try {
      const currentSkit = result.variations?.[selectedVariationIndex]?.skit || result.skit;
      if (!currentSkit) throw new Error('No script to approve');

      const productName = selectedProductId
        ? products.find(p => p.id === selectedProductId)?.name || 'Unknown'
        : manualProductName || 'Manual Entry';
      const productBrand = selectedProductId
        ? products.find(p => p.id === selectedProductId)?.brand || ''
        : manualBrandName || '';

      // 1. Save to library as approved
      const saveRes = await postJson<{ id: string }>('/api/skits', {
        title: `${productName} - ${selectedContentType?.name || 'Content'} - ${new Date().toLocaleDateString()}`,
        status: 'approved',
        product_id: selectedProductId || undefined,
        product_name: productName,
        product_brand: productBrand,
        skit_data: currentSkit,
        generation_config: {
          content_type: selectedContentTypeId,
          content_subtype: selectedSubtypeId,
          presentation_style: selectedPresentationStyleId,
          target_length: selectedLengthId,
          humor_level: selectedHumorId,
          risk_tier: riskTier,
        },
        ai_score: result.variations?.[selectedVariationIndex]?.ai_score || result.ai_score || undefined,
        strategy_metadata: result.strategy_metadata || null,
      });

      if (isApiError(saveRes)) {
        throw new Error(saveRes.message || 'Failed to save script');
      }

      const savedSkitId = saveRes.data?.id;
      if (!savedSkitId) throw new Error('No script ID returned');

      // 2. Send to pipeline
      if (selectedProductId) {
        // Product-based: use send-to-video (creates via createVideoFromProduct)
        const pipelineRes = await postJson(`/api/skits/${savedSkitId}/send-to-video`, {
          priority: 'normal',
        });
        if (isApiError(pipelineRes)) {
          console.error('Send to pipeline failed:', pipelineRes.message);
          // Script was saved, just pipeline link failed
        }
      } else {
        // Manual product: use lightweight create-from-script
        const pipelineRes = await postJson('/api/videos/create-from-script', {
          script_id: savedSkitId,
          title: currentSkit.hook_line?.substring(0, 50) || 'Untitled',
          product_name: productName,
          product_brand: productBrand,
          hook_line: currentSkit.hook_line,
        });
        if (isApiError(pipelineRes)) {
          console.error('Create video from script failed:', pipelineRes.message);
        }
      }

      setApprovedToPipeline(true);
    } catch (err) {
      console.error('Approve and send failed:', err);
      setError({
        ok: false,
        error_code: 'INTERNAL',
        message: err instanceof Error ? err.message : 'Failed to approve and send to pipeline',
        correlation_id: '',
        httpStatus: 0,
      });
    } finally {
      setApprovingToPipeline(false);
    }
  };

  // --- Styles ---

  const sectionStyle: React.CSSProperties = {
    marginBottom: '28px',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  const cardStyle = (selected: boolean): React.CSSProperties => ({
    padding: '16px',
    backgroundColor: selected ? 'rgba(59, 130, 246, 0.1)' : colors.bg,
    border: `1px solid ${selected ? '#3b82f6' : colors.border}`,
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left' as const,
  });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: '#18181b',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '16px',
    minHeight: '48px',
  };

  // --- Loading state ---
  if (authLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
        <Loader2 className="animate-spin" style={{ margin: '0 auto 12px' }} size={24} />
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
  const currentAiScore = result?.variations?.[selectedVariationIndex]?.ai_score || result?.ai_score || null;

  return (
    <div ref={containerRef} className="max-w-full lg:max-w-[1400px] mx-auto overflow-hidden">
      {/* No Credits Modal */}
      <NoCreditsModal isOpen={noCreditsModal.isOpen} onClose={noCreditsModal.close} />

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-3">
              <Sparkles className="w-7 h-7 text-blue-500" />
              Content Studio
            </h1>
            <p className="mt-1 text-base text-zinc-400">
              Generate viral short-form video scripts
            </p>
          </div>
          {/* Action buttons - horizontal scroll on mobile */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0">
            <Link
              href="/admin/skit-library"
              className="flex-shrink-0 px-4 py-2.5 bg-zinc-800 border border-white/10 rounded-xl text-white text-sm flex items-center gap-2 hover:bg-zinc-700 transition-colors whitespace-nowrap"
            >
              <BookOpen size={16} />
              Library
            </Link>
          </div>
        </div>
      </div>

      {/* Clawbot Recommendation Banner */}
      {recommendation && (
        <div className="mb-6 p-4 rounded-xl" style={{
          background: 'linear-gradient(to right, rgba(168, 85, 247, 0.1), rgba(59, 130, 246, 0.1))',
          border: '1px solid rgba(168, 85, 247, 0.3)',
        }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)' }}>
                <Sparkles size={18} className="text-purple-400" />
              </div>
              <div>
                <h3 className="text-white font-medium flex items-center gap-2 text-sm">
                  Clawbot Recommends
                  <span className="text-xs text-purple-400 px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)' }}>
                    Based on your data
                  </span>
                </h3>
                <p className="text-zinc-300 text-sm mt-1">
                  Try <span className="text-purple-300 font-medium">{recommendation.content_type.toUpperCase()}</span> content
                  {' '}with a <span className="text-purple-300 font-medium">{recommendation.angle}</span> angle
                </p>
                <p className="text-zinc-500 text-xs mt-1">{recommendation.reason}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedContentTypeId(recommendation.content_type);
                  setRecommendation(null);
                }}
                className="px-3 py-1.5 text-white rounded-lg text-sm flex items-center gap-2"
                style={{ backgroundColor: '#a855f7' }}
              >
                <Zap size={14} />
                Use This
              </button>
              <button
                type="button"
                onClick={() => setRecommendation(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Category Tabs - horizontal scroll on mobile */}
      <div className="mb-6 -mx-4 px-4 lg:mx-0 lg:px-0">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {MAIN_TABS.map((tab) => {
            const Icon = tab.icon;
            const isSelected = selectedMainTabId === tab.id;
            return (
              <button type="button"
                key={tab.id}
                onClick={() => setSelectedMainTabId(tab.id)}
                title={tab.description}
                className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium whitespace-nowrap flex items-center gap-2 transition-colors ${
                  isSelected
                    ? 'bg-blue-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        {/* Funnel stage hint for selected tab */}
        {selectedMainTab?.funnelHint && (
          <p className="mt-2 text-xs text-zinc-500 italic">{selectedMainTab.funnelHint}</p>
        )}
      </div>

      {/* Main Grid - stacks on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Configuration */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-4 lg:p-6">
          {loadingData ? (
            <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
              <Loader2 className="animate-spin" style={{ margin: '0 auto 12px' }} size={24} />
              Loading options...
            </div>
          ) : (
            <>
              {/* STEP 1: Content Type - Compact pills */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>
                  <span style={{ backgroundColor: '#3b82f6', color: 'white', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>1</span>
                  Content Type
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {filteredContentTypes.map((type) => {
                    const Icon = CONTENT_TYPE_ICONS[type.icon];
                    const isSelected = selectedContentTypeId === type.id;
                    const stageColor = FUNNEL_STAGE_COLORS[type.funnelStage];

                    return (
                      <button type="button"
                        key={type.id}
                        onClick={() => setSelectedContentTypeId(type.id)}
                        title={type.description}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 14px',
                          backgroundColor: isSelected ? '#3b82f6' : colors.bg,
                          border: `1px solid ${isSelected ? '#3b82f6' : colors.border}`,
                          borderRadius: '8px',
                          color: isSelected ? 'white' : colors.text,
                          fontSize: '13px',
                          fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {Icon && <Icon size={14} />}
                        {type.name}
                        {isSelected && <Check size={12} />}
                      </button>
                    );
                  })}
                </div>
                {selectedContentType && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: FUNNEL_STAGE_COLORS[selectedContentType.funnelStage]?.bg,
                      color: FUNNEL_STAGE_COLORS[selectedContentType.funnelStage]?.text,
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}>
                      {selectedContentType.funnelStage}
                    </span>
                    <span style={{ fontSize: '12px', color: colors.textSecondary }}>{selectedContentType.description}</span>
                  </div>
                )}
              </div>

              {/* STEP 2: Content Format */}
              {selectedContentType && (
                <div style={sectionStyle}>
                  <div style={sectionTitleStyle}>
                    <span style={{ backgroundColor: '#3b82f6', color: 'white', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>2</span>
                    Content Format
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedContentType.subtypes.map((sub) => {
                      const isSelected = selectedSubtypeId === sub.id;
                      return (
                        <button type="button"
                          key={sub.id}
                          onClick={() => setSelectedSubtypeId(sub.id)}
                          title={sub.description}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: isSelected ? '#3b82f6' : colors.bg,
                            border: `1px solid ${isSelected ? '#3b82f6' : colors.border}`,
                            borderRadius: '8px',
                            color: isSelected ? 'white' : colors.text,
                            fontSize: '13px',
                            fontWeight: isSelected ? 600 : 400,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {sub.name}
                        </button>
                      );
                    })}
                  </div>
                  {selectedSubtypeId && (
                    <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: colors.textSecondary }}>
                      {selectedContentType.subtypes.find(s => s.id === selectedSubtypeId)?.description}
                    </p>
                  )}
                </div>
              )}

              {/* STEP 3: Product */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>
                  <span style={{ backgroundColor: '#3b82f6', color: 'white', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>3</span>
                  Product
                </div>
                {products.length > 0 ? (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
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
                ) : (
                  <div style={{
                    padding: '16px',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    border: `1px dashed ${colors.border}`,
                    borderRadius: '10px',
                    marginBottom: '10px',
                    textAlign: 'center',
                  }}>
                    <Package size={24} style={{ margin: '0 auto 8px', opacity: 0.5, color: colors.textSecondary }} />
                    <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: colors.textSecondary }}>
                      No products yet
                    </p>
                    <Link
                      href="/admin/products"
                      style={{
                        color: '#3b82f6',
                        fontSize: '13px',
                        textDecoration: 'none',
                      }}
                    >
                      Create your first product →
                    </Link>
                  </div>
                )}
                <div style={{ fontSize: '11px', color: colors.textSecondary, marginBottom: '8px' }}>
                  Or enter manually:
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={manualProductName}
                    onChange={(e) => {
                      setManualProductName(e.target.value);
                      if (e.target.value) setSelectedProductId('');
                    }}
                    placeholder="Product name"
                    style={{ ...inputStyle, flex: 2 }}
                  />
                  <input
                    value={manualBrandName}
                    onChange={(e) => setManualBrandName(e.target.value)}
                    placeholder="Brand"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>

                {/* Pain Points - show when product is selected */}
                {selectedProductId && (
                  <div style={{ marginTop: '12px' }}>
                    {productPainPoints.length === 0 ? (
                      <button
                        type="button"
                        onClick={fetchOrGeneratePainPoints}
                        disabled={generatingPainPoints}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 14px',
                          backgroundColor: 'rgba(139, 92, 246, 0.1)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          borderRadius: '8px',
                          color: '#8b5cf6',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: generatingPainPoints ? 'not-allowed' : 'pointer',
                          opacity: generatingPainPoints ? 0.7 : 1,
                        }}
                      >
                        {generatingPainPoints ? (
                          <><Loader2 size={14} className="animate-spin" /> Generating pain points...</>
                        ) : (
                          <><Zap size={14} /> Generate Pain Points</>
                        )}
                      </button>
                    ) : (
                      <div>
                        <div style={{ fontSize: '11px', color: colors.textSecondary, marginBottom: '6px' }}>
                          Pain points (click to focus):
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {productPainPoints.map((point, idx) => {
                            const isSelected = selectedPainPoints.includes(point);
                            return (
                              <button
                                type="button"
                                key={idx}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedPainPoints(prev => prev.filter(p => p !== point));
                                  } else {
                                    setSelectedPainPoints(prev => [...prev, point]);
                                  }
                                }}
                                style={{
                                  padding: '4px 10px',
                                  backgroundColor: isSelected ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                                  border: `1px solid ${isSelected ? '#8b5cf6' : colors.border}`,
                                  borderRadius: '6px',
                                  color: isSelected ? '#8b5cf6' : colors.textSecondary,
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {isSelected && <Check size={10} style={{ marginRight: '4px', display: 'inline' }} />}
                                {point}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* STEP 4: Target Audience */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>
                  <span style={{ backgroundColor: '#3b82f6', color: 'white', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>4</span>
                  Target Audience
                  <span style={{ fontSize: '11px', fontWeight: 400, color: colors.textSecondary }}>(optional)</span>
                </div>
                {audiencePersonas.length > 0 ? (
                  <select
                    value={selectedPersonaId}
                    onChange={(e) => {
                      setSelectedPersonaId(e.target.value);
                      setSelectedPainPoints([]);
                    }}
                    style={inputStyle}
                  >
                    <option value="">No specific persona</option>
                    {audiencePersonas.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{
                    padding: '16px',
                    backgroundColor: 'rgba(139, 92, 246, 0.05)',
                    border: `1px dashed ${colors.border}`,
                    borderRadius: '10px',
                    textAlign: 'center',
                  }}>
                    <Users size={24} style={{ margin: '0 auto 8px', opacity: 0.5, color: colors.textSecondary }} />
                    <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: colors.textSecondary }}>
                      No audience personas yet
                    </p>
                    <Link
                      href="/admin/audience"
                      style={{
                        color: '#8b5cf6',
                        fontSize: '13px',
                        textDecoration: 'none',
                      }}
                    >
                      Create your first persona →
                    </Link>
                    <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: colors.textSecondary }}>
                      Personas help AI write content that resonates with your audience
                    </p>
                  </div>
                )}

                {/* Persona Preview */}
                {selectedPersona && (
                  <div style={{ marginTop: '12px' }}>
                    <PersonaPreviewCard
                      persona={selectedPersona}
                      selectedPainPoints={selectedPainPoints}
                      onPainPointsChange={setSelectedPainPoints}
                      expanded={personaExpanded}
                      onToggleExpand={() => setPersonaExpanded(!personaExpanded)}
                    />
                  </div>
                )}
              </div>

              {/* STEP 5: Presentation Style */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>
                  <span style={{ backgroundColor: '#3b82f6', color: 'white', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>5</span>
                  Presentation Style
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {PRESENTATION_STYLES.map((style) => {
                    const Icon = PRESENTATION_STYLE_ICONS[style.icon];
                    const isSelected = selectedPresentationStyleId === style.id;

                    return (
                      <button type="button"
                        key={style.id}
                        onClick={() => setSelectedPresentationStyleId(style.id)}
                        style={{
                          ...cardStyle(isSelected),
                          padding: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', color: isSelected ? '#3b82f6' : colors.textSecondary }}>
                          {Icon && <Icon size={18} />}
                          <span style={{ fontWeight: 600, color: colors.text, fontSize: '13px' }}>{style.name}</span>
                          {isSelected && <Check size={14} style={{ color: '#3b82f6', marginLeft: 'auto' }} />}
                        </div>
                        <p style={{ margin: 0, fontSize: '11px', color: colors.textSecondary, lineHeight: 1.4 }}>
                          {style.description}
                        </p>
                        {style.brollHeavy && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '8px',
                            padding: '2px 8px',
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            color: '#8b5cf6',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 500,
                          }}>
                            <ImageIcon size={10} /> B-Roll Heavy
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedPresentationStyle && (
                  <div style={{
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    borderRadius: '8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Sparkles size={12} style={{ color: '#f59e0b' }} />
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#f59e0b' }}>Pro Tip</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: colors.textSecondary }}>
                      {selectedPresentationStyle.tips}
                    </p>
                  </div>
                )}
              </div>

              {/* STEP 6: Length & Tone */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>
                  <span style={{ backgroundColor: '#3b82f6', color: 'white', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>6</span>
                  Length & Tone
                </div>

                {/* Target Length */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '8px' }}>
                    <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                    Target Length
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {TARGET_LENGTHS.map((length) => {
                      const isSelected = selectedLengthId === length.id;
                      return (
                        <button type="button"
                          key={length.id}
                          onClick={() => setSelectedLengthId(length.id)}
                          style={{
                            padding: '10px 8px',
                            backgroundColor: isSelected ? '#3b82f6' : colors.bg,
                            border: `1px solid ${isSelected ? '#3b82f6' : colors.border}`,
                            borderRadius: '8px',
                            color: isSelected ? 'white' : colors.text,
                            cursor: 'pointer',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '12px', fontWeight: 600 }}>{length.name}</div>
                          <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>{length.sceneCount}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Humor Level */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '8px' }}>
                    <Smile size={12} style={{ display: 'inline', marginRight: '4px' }} />
                    Humor Level
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {HUMOR_LEVELS.map((humor) => {
                      const isSelected = selectedHumorId === humor.id;
                      return (
                        <button type="button"
                          key={humor.id}
                          onClick={() => setSelectedHumorId(humor.id)}
                          title={humor.description}
                          style={{
                            padding: '10px 8px',
                            backgroundColor: isSelected ? '#8b5cf6' : colors.bg,
                            border: `1px solid ${isSelected ? '#8b5cf6' : colors.border}`,
                            borderRadius: '8px',
                            color: isSelected ? 'white' : colors.text,
                            cursor: 'pointer',
                            textAlign: 'center',
                            fontSize: '12px',
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          {humor.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Risk Tier */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '8px' }}>
                    Tone / Risk Level
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['SAFE', 'BALANCED', 'SPICY'] as RiskTier[]).map(tier => {
                      const isSelected = riskTier === tier;
                      const tierColors: Record<RiskTier, string> = {
                        SAFE: '#10b981',
                        BALANCED: '#f59e0b',
                        SPICY: '#ef4444',
                      };
                      return (
                        <button type="button"
                          key={tier}
                          onClick={() => setRiskTier(tier)}
                          style={{
                            flex: 1,
                            padding: '10px',
                            backgroundColor: isSelected ? tierColors[tier] : colors.bg,
                            border: `1px solid ${isSelected ? tierColors[tier] : colors.border}`,
                            borderRadius: '8px',
                            color: isSelected ? 'white' : colors.text,
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          {tier}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* STEP 7: Advanced Options */}
              <div style={sectionStyle}>
                <button type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    color: colors.textSecondary,
                    cursor: 'pointer',
                    padding: '8px 0',
                    fontSize: '13px',
                    fontWeight: 500,
                    width: '100%',
                  }}
                >
                  <Settings size={14} />
                  Advanced Options
                  {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showAdvanced && (
                  <div style={{ paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Variations */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '6px' }}>
                        Number of Variations
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <button type="button"
                            key={n}
                            onClick={() => setVariationCount(n)}
                            style={{
                              flex: 1,
                              padding: '8px',
                              backgroundColor: variationCount === n ? '#3b82f6' : colors.bg,
                              border: `1px solid ${variationCount === n ? '#3b82f6' : colors.border}`,
                              borderRadius: '6px',
                              color: variationCount === n ? 'white' : colors.text,
                              cursor: 'pointer',
                              fontSize: '13px',
                              fontWeight: variationCount === n ? 600 : 400,
                            }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reference Script */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '6px' }}>
                        Reference Script (inspiration)
                      </label>
                      <textarea
                        value={referenceScript}
                        onChange={(e) => setReferenceScript(e.target.value)}
                        placeholder="Paste a script you want to use as inspiration..."
                        rows={3}
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    </div>

                    {/* Specific Hooks */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '6px' }}>
                        Specific Hooks to Try (one per line)
                      </label>
                      <textarea
                        value={specificHooks}
                        onChange={(e) => setSpecificHooks(e.target.value)}
                        placeholder={"POV: You finally found the solution\nNobody talks about this but..."}
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                      />
                    </div>

                    {/* Things to Avoid */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '6px' }}>
                        Things to Avoid (one per line)
                      </label>
                      <textarea
                        value={thingsToAvoid}
                        onChange={(e) => setThingsToAvoid(e.target.value)}
                        placeholder={"Don't mention competitors\nAvoid technical jargon"}
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                      />
                    </div>

                    {/* CTA Preference */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '6px' }}>
                        CTA Preference
                      </label>
                      <select
                        value={ctaPreference}
                        onChange={(e) => setCtaPreference(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="">Auto-generate CTA</option>
                        <option value="Add to cart before they sell out">Add to cart before they sell out</option>
                        <option value="Tap the yellow basket NOW">Tap the yellow basket NOW</option>
                        <option value="Grab yours while it's in stock">Grab yours while it&apos;s in stock</option>
                        <option value="This deal ends tonight - add to cart">This deal ends tonight - add to cart</option>
                        <option value="Don't scroll past - tap add to cart">Don&apos;t scroll past - tap add to cart</option>
                        <option value="custom">Custom...</option>
                      </select>
                      {ctaPreference === 'custom' && (
                        <input
                          value={customCta}
                          onChange={(e) => setCustomCta(e.target.value)}
                          placeholder="Enter your custom CTA..."
                          style={{ ...inputStyle, marginTop: '8px' }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* A/B Test Mode Toggle */}
              <label className="flex items-center gap-3 mt-4 p-3 rounded-lg border border-white/5 bg-zinc-800/30 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                <input
                  type="checkbox"
                  checked={abTestMode}
                  onChange={(e) => setAbTestMode(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-600 text-teal-500 focus:ring-teal-500 focus:ring-offset-0 bg-zinc-700"
                />
                <div>
                  <span className="text-sm font-medium text-zinc-200 flex items-center gap-1.5">
                    <FlaskConical size={14} className="text-teal-400" />
                    A/B Test Mode
                  </span>
                  <span className="text-xs text-zinc-500 block">Generate 2 variations for side-by-side comparison</span>
                </div>
              </label>

              {/* Generate Button - Sticky on mobile */}
              <div className="sticky bottom-4 lg:static lg:bottom-auto mt-6">
                <button type="button"
                  onClick={handleGenerate}
                  disabled={generating || (!selectedProductId && !manualProductName.trim())}
                  className={`w-full h-14 rounded-xl text-white font-semibold text-base flex items-center justify-center gap-2 transition-all shadow-lg ${
                    generating
                      ? 'bg-zinc-700 cursor-wait'
                      : generating || (!selectedProductId && !manualProductName.trim())
                      ? 'bg-zinc-700 opacity-50'
                      : 'bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 shadow-blue-500/20'
                  }`}
                >
                  {generating ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Zap size={20} />
                      Generate ({creditCost} credit{creditCost !== 1 ? 's' : ''})
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right Column: Results */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-4 lg:p-6 min-h-[400px] lg:min-h-[600px]">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', color: colors.text, fontWeight: 600 }}>
              Generated Scripts
            </h2>
            {result && (
              <div style={{ display: 'flex', gap: '8px' }}>
                {abTestMode && result.variations && result.variations.length >= 2 && (
                  <button type="button"
                    onClick={handleSaveAsAbTest}
                    disabled={savingAbTest}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#0d9488',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '13px',
                      cursor: savingAbTest ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: savingAbTest ? 0.6 : 1,
                    }}
                  >
                    <FlaskConical size={14} />
                    {savingAbTest ? 'Saving...' : 'Save as A/B Test'}
                  </button>
                )}
                <button type="button"
                  onClick={openSaveModal}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#8b5cf6',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <BookOpen size={14} />
                  Save to Library
                </button>
              </div>
            )}
          </div>

          {error && (
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
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
              height: '450px',
              color: colors.textSecondary,
              textAlign: 'center',
            }}>
              <Sparkles size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
              <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>
                Ready to generate
              </div>
              <div style={{ fontSize: '14px', maxWidth: '300px' }}>
                Configure your content options and click Generate to create viral video scripts.
              </div>
            </div>
          )}

          {generating && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '450px',
              color: colors.textSecondary,
            }}>
              <Loader2 className="animate-spin" size={48} style={{ marginBottom: '16px', color: '#3b82f6' }} />
              <div style={{ fontSize: '16px', fontWeight: 500 }}>
                Generating scripts...
              </div>
              <div style={{ fontSize: '14px', marginTop: '8px' }}>
                Creating {variationCount} variation{variationCount > 1 ? 's' : ''} for you
              </div>
            </div>
          )}

          {/* Results Display */}
          {result && currentSkit && (
            <div>
              {/* Variation Tabs */}
              {result.variations && result.variations.length > 1 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {result.variations.map((v, idx) => (
                    <button type="button"
                      key={idx}
                      onClick={() => setSelectedVariationIndex(idx)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: selectedVariationIndex === idx ? '#3b82f6' : colors.bg,
                        border: `1px solid ${selectedVariationIndex === idx ? '#3b82f6' : colors.border}`,
                        borderRadius: '8px',
                        color: selectedVariationIndex === idx ? 'white' : colors.text,
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      V{idx + 1}
                      {v.ai_score && (
                        <span style={{ marginLeft: '8px', opacity: 0.8 }}>
                          ({v.ai_score.overall_score}/10)
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Clawbot Strategy Card */}
              {result.strategy_metadata && (
                <div style={{
                  padding: '14px 16px',
                  backgroundColor: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.25)',
                  borderRadius: '10px',
                  marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#a855f7', marginBottom: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={12} /> Clawbot Strategy
                  </div>

                  {/* Badges row */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {/* Angle badge */}
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#60a5fa',
                      fontWeight: 500,
                    }}>
                      {result.strategy_metadata.recommended_angle}
                    </span>

                    {/* Tone badge */}
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: 'rgba(168, 85, 247, 0.15)',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#c084fc',
                      fontWeight: 500,
                    }}>
                      {result.strategy_metadata.tone_direction}
                    </span>

                    {/* Risk score badge */}
                    {(() => {
                      const rs = result.strategy_metadata!.risk_score;
                      const riskColor = rs <= 3 ? '#22c55e' : rs <= 6 ? '#f59e0b' : '#ef4444';
                      const riskBg = rs <= 3 ? 'rgba(34, 197, 94, 0.15)' : rs <= 6 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)';
                      const riskBorder = rs <= 3 ? 'rgba(34, 197, 94, 0.3)' : rs <= 6 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)';
                      return (
                        <span style={{
                          padding: '4px 10px',
                          backgroundColor: riskBg,
                          border: `1px solid ${riskBorder}`,
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: riskColor,
                          fontWeight: 500,
                        }}>
                          Risk {rs}/10
                        </span>
                      );
                    })()}

                    {/* Confidence badge */}
                    {result.strategy_confidence && (() => {
                      const cl = result.strategy_confidence!.level;
                      const confColor = cl === 'high' ? '#22c55e' : cl === 'medium' ? '#f59e0b' : '#9ca3af';
                      const confBg = cl === 'high' ? 'rgba(34, 197, 94, 0.15)' : cl === 'medium' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(156, 163, 175, 0.15)';
                      const confBorder = cl === 'high' ? 'rgba(34, 197, 94, 0.3)' : cl === 'medium' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(156, 163, 175, 0.3)';
                      return (
                        <span title={result.strategy_confidence!.reason} style={{
                          padding: '4px 10px',
                          backgroundColor: confBg,
                          border: `1px solid ${confBorder}`,
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: confColor,
                          fontWeight: 500,
                          cursor: 'help',
                        }}>
                          {cl.charAt(0).toUpperCase() + cl.slice(1)} Confidence
                        </span>
                      );
                    })()}

                    {/* Data source badge */}
                    {result.data_source && (
                      <span style={{
                        padding: '4px 10px',
                        backgroundColor: result.data_source === 'product' ? 'rgba(14, 165, 233, 0.15)' : 'rgba(156, 163, 175, 0.1)',
                        border: `1px solid ${result.data_source === 'product' ? 'rgba(14, 165, 233, 0.3)' : 'rgba(156, 163, 175, 0.2)'}`,
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: result.data_source === 'product' ? '#38bdf8' : '#9ca3af',
                        fontWeight: 500,
                      }}>
                        {result.data_source === 'product' ? 'Product-level data' : 'Global patterns'}
                      </span>
                    )}
                  </div>

                  {/* Suggested hooks */}
                  {result.strategy_metadata.suggested_hooks && result.strategy_metadata.suggested_hooks.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      {result.strategy_metadata.suggested_hooks.map((hook, i) => (
                        <span key={i} style={{
                          padding: '3px 8px',
                          backgroundColor: 'rgba(20, 184, 166, 0.1)',
                          border: '1px solid rgba(20, 184, 166, 0.2)',
                          borderRadius: '12px',
                          fontSize: '11px',
                          color: '#5eead4',
                        }}>
                          {hook}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Collapsible reasoning */}
                  <button
                    type="button"
                    onClick={() => setShowStrategyReasoning(!showStrategyReasoning)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#9ca3af',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0,
                    }}
                  >
                    {showStrategyReasoning ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Strategy reasoning
                  </button>
                  {showStrategyReasoning && (
                    <div style={{
                      marginTop: '8px',
                      padding: '10px 12px',
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#d1d5db',
                      lineHeight: 1.5,
                    }}>
                      {result.strategy_metadata.reasoning}
                    </div>
                  )}
                </div>
              )}

              {/* Suppression Warning */}
              {isPatternSuppressed(result) && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px 14px',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}>
                  <AlertTriangle size={18} style={{ color: '#fbbf24', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#fcd34d', fontSize: '13px', fontWeight: 500, margin: 0 }}>
                      Pattern Underperforming
                    </p>
                    <p style={{ color: 'rgba(251, 191, 36, 0.7)', fontSize: '12px', marginTop: '4px', marginBottom: '8px', lineHeight: 1.4 }}>
                      The &ldquo;{result.strategy_metadata?.recommended_angle}&rdquo; angle has been flagged as underperforming recently.
                      Consider trying a different approach or regenerating with different settings.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRegenerateWithDifferentAngle(result.strategy_metadata?.recommended_angle)}
                      style={{
                        padding: '5px 12px',
                        backgroundColor: 'rgba(245, 158, 11, 0.2)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: '6px',
                        color: '#fcd34d',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Try Different Angle
                    </button>
                  </div>
                </div>
              )}

              {/* Hook */}
              <div style={{
                padding: '16px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '10px',
                marginBottom: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#3b82f6', marginBottom: '6px', textTransform: 'uppercase' }}>
                      🎣 Hook
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff' }}>
                      {currentSkit.hook_line}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button"
                      onClick={() => handleSaveHook(currentSkit.hook_line)}
                      disabled={savingHook}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: hookSaveError ? 'rgba(239, 68, 68, 0.2)' : hookSaved ? 'rgba(20, 184, 166, 0.2)' : 'rgba(20, 184, 166, 0.1)',
                        border: `1px solid ${hookSaveError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(20, 184, 166, 0.3)'}`,
                        borderRadius: '6px',
                        color: hookSaveError ? '#ef4444' : hookSaved ? '#14b8a6' : '#5eead4',
                        cursor: savingHook ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {hookSaveError ? (
                        <><X size={14} /> Failed</>
                      ) : hookSaved ? (
                        <><Check size={14} /> Saved!</>
                      ) : savingHook ? (
                        <><Loader2 size={14} className="animate-spin" /> Saving...</>
                      ) : (
                        <><Bookmark size={14} /> Save Hook</>
                      )}
                    </button>
                    <button type="button"
                      onClick={() => copyToClipboard(currentSkit.hook_line, 'hook')}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: copiedField === 'hook' ? '#10b981' : colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '6px',
                        color: copiedField === 'hook' ? 'white' : colors.textSecondary,
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {copiedField === 'hook' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Beats */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '12px', textTransform: 'uppercase' }}>
                  📽️ Scenes ({currentSkit.beats.length})
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {currentSkit.beats.map((beat, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '10px',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: '6px',
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
                              borderRadius: '8px',
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
                              <Type size={12} /> {beat.on_screen_text}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div style={{
                padding: '16px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '10px',
                marginBottom: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444', textTransform: 'uppercase' }}>
                    🎯 Call to Action
                  </div>
                  {!editingCTA && (
                    <button type="button" onClick={() => { setEditedCTALine(currentSkit.cta_line); setEditedCTAOverlay(currentSkit.cta_overlay || ''); setEditingCTA(true); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, padding: '2px' }}
                      aria-label="Edit CTA"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
                {editingCTA ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <textarea
                      value={editedCTALine}
                      onChange={(e) => setEditedCTALine(e.target.value)}
                      rows={2}
                      style={{ width: '100%', backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '14px', resize: 'vertical' }}
                      placeholder="CTA spoken line"
                    />
                    <input
                      value={editedCTAOverlay}
                      onChange={(e) => setEditedCTAOverlay(e.target.value)}
                      style={{ width: '100%', backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '13px' }}
                      placeholder="CTA overlay text (max 40 chars)"
                      maxLength={40}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => {
                        if (result) {
                          const variation = result.variations?.[selectedVariationIndex];
                          if (variation) {
                            variation.skit.cta_line = editedCTALine;
                            variation.skit.cta_overlay = editedCTAOverlay;
                          } else if (result.skit) {
                            result.skit.cta_line = editedCTALine;
                            result.skit.cta_overlay = editedCTAOverlay;
                          }
                          setResult({ ...result });
                        }
                        setEditingCTA(false);
                      }}
                        style={{ padding: '6px 16px', backgroundColor: '#14b8a6', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
                      >Save</button>
                      <button type="button" onClick={() => setEditingCTA(false)}
                        style={{ padding: '6px 16px', backgroundColor: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '6px', color: colors.text, cursor: 'pointer', fontSize: '13px' }}
                      >Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '15px', fontWeight: 500, color: '#ffffff', marginBottom: '4px' }}>
                      {currentSkit.cta_line}
                    </div>
                    {currentSkit.cta_overlay && (
                      <div style={{ fontSize: '13px', color: '#fca5a5' }}>
                        Overlay: {currentSkit.cta_overlay}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* B-Roll Suggestions */}
              {currentSkit.b_roll && currentSkit.b_roll.length > 0 && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: '10px',
                  marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#8b5cf6', marginBottom: '8px', textTransform: 'uppercase' }}>
                    <ImageIcon size={12} style={{ display: 'inline', marginRight: '4px' }} />
                    B-Roll Suggestions
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '16px', color: colors.textSecondary, fontSize: '13px' }}>
                    {currentSkit.b_roll.slice(0, 5).map((br, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>{br}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* AI Score */}
              {currentAiScore && (() => {
                const s = currentAiScore.overall_score;
                const scoreColor = s >= 8 ? '#22c55e' : s >= 6 ? '#eab308' : s >= 4 ? '#f97316' : '#ef4444';
                return (
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#1a1f2e',
                    border: '1px solid #2d3748',
                    borderRadius: '10px',
                    marginBottom: '16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                        AI Score
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: scoreColor }}>
                        {s}/10
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '12px' }}>
                      <div><span style={{ color: '#9CA3AF' }}>Hook </span><span style={{ color: '#E5E7EB', fontWeight: 600 }}>{currentAiScore.hook_strength}/10</span></div>
                      <div><span style={{ color: '#9CA3AF' }}>Humor </span><span style={{ color: '#E5E7EB', fontWeight: 600 }}>{currentAiScore.humor_level}/10</span></div>
                      <div><span style={{ color: '#9CA3AF' }}>Viral </span><span style={{ color: '#E5E7EB', fontWeight: 600 }}>{currentAiScore.virality_potential}/10</span></div>
                    </div>
                    {currentAiScore.strengths && currentAiScore.strengths.length > 0 && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #2d3748' }}>
                        <div style={{ fontSize: '11px', color: '#22c55e', marginBottom: '4px' }}>Strengths</div>
                        {currentAiScore.strengths.slice(0, 2).map((str, i) => (
                          <div key={i} style={{ fontSize: '12px', color: '#D1D5DB' }}>{str}</div>
                        ))}
                      </div>
                    )}
                    {currentAiScore.improvements && currentAiScore.improvements.length > 0 && (
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ fontSize: '11px', color: '#f97316', marginBottom: '4px' }}>Could improve</div>
                        {currentAiScore.improvements.slice(0, 2).map((str, i) => (
                          <div key={i} style={{ fontSize: '12px', color: '#D1D5DB' }}>{str}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Export & Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Regenerate Button */}
                <button type="button"
                  onClick={() => { handleGenerate(); }}
                  disabled={generating}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: generating ? '#374151' : '#6366f1',
                    border: 'none',
                    borderRadius: '10px',
                    color: 'white',
                    cursor: generating ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: generating ? 0.7 : 1,
                  }}
                >
                  {generating ? (
                    <><Loader2 size={16} className="animate-spin" /> Regenerating...</>
                  ) : (
                    <><RefreshCw size={16} /> Regenerate Script</>
                  )}
                </button>

                {/* Approve & Send to Pipeline */}
                <button type="button"
                  onClick={handleApproveAndSend}
                  disabled={approvingToPipeline}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: approvedToPipeline ? '#22c55e' : '#10b981',
                    border: 'none',
                    borderRadius: '10px',
                    color: 'white',
                    cursor: approvingToPipeline || approvedToPipeline ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: approvingToPipeline ? 0.7 : 1,
                  }}
                >
                  {approvedToPipeline ? (
                    <><Check size={16} /> Approved &amp; In Pipeline</>
                  ) : approvingToPipeline ? (
                    <><Loader2 size={16} className="animate-spin" /> Sending to Pipeline...</>
                  ) : (
                    <><Zap size={16} /> Approve &amp; Send to Pipeline</>
                  )}
                </button>

                {/* Copy Buttons Row */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button"
                    onClick={() => {
                      const fullScript = [
                        `HOOK: ${currentSkit.hook_line}`,
                        '',
                        ...currentSkit.beats.map((b) => {
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
                      flex: 1,
                      padding: '10px',
                      backgroundColor: copiedField === 'full' ? '#10b981' : '#374151',
                      border: `1px solid ${copiedField === 'full' ? '#10b981' : '#4B5563'}`,
                      borderRadius: '10px',
                      color: '#E5E7EB',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    {copiedField === 'full' ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Script</>}
                  </button>

                  <button type="button"
                    onClick={() => {
                      const withBroll = [
                        `HOOK: ${currentSkit.hook_line}`,
                        '',
                        ...currentSkit.beats.map((b) => {
                          let beatText = `[${b.t}] ${b.action}`;
                          if (b.dialogue) beatText += `\n   "${b.dialogue}"`;
                          if (b.on_screen_text) beatText += `\n   [TEXT: ${b.on_screen_text}]`;
                          return beatText;
                        }),
                        '',
                        `CTA: ${currentSkit.cta_line}`,
                        currentSkit.cta_overlay ? `OVERLAY: ${currentSkit.cta_overlay}` : '',
                        '',
                        currentSkit.b_roll?.length ? `B-ROLL:\n${currentSkit.b_roll.map((b, i) => `${i + 1}. ${b}`).join('\n')}` : '',
                        currentSkit.overlays?.length ? `OVERLAYS:\n${currentSkit.overlays.map((o, i) => `${i + 1}. ${o}`).join('\n')}` : '',
                      ].filter(Boolean).join('\n');
                      copyToClipboard(withBroll, 'broll');
                    }}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: copiedField === 'broll' ? '#10b981' : '#374151',
                      border: `1px solid ${copiedField === 'broll' ? '#10b981' : '#4B5563'}`,
                      borderRadius: '10px',
                      color: '#E5E7EB',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    {copiedField === 'broll' ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> + B-Roll</>}
                  </button>

                  <button type="button"
                    onClick={() => {
                      const content = [
                        `HOOK: ${currentSkit.hook_line}`,
                        '',
                        ...currentSkit.beats.map((b) => {
                          let beatText = `[${b.t}] ${b.action}`;
                          if (b.dialogue) beatText += `\n   "${b.dialogue}"`;
                          if (b.on_screen_text) beatText += `\n   [TEXT: ${b.on_screen_text}]`;
                          return beatText;
                        }),
                        '',
                        `CTA: ${currentSkit.cta_line}`,
                        currentSkit.cta_overlay ? `OVERLAY: ${currentSkit.cta_overlay}` : '',
                        '',
                        currentSkit.b_roll?.length ? `B-ROLL:\n${currentSkit.b_roll.map((b, i) => `${i + 1}. ${b}`).join('\n')}` : '',
                        '',
                        currentAiScore ? `AI SCORE: ${currentAiScore.overall_score}/10` : '',
                      ].filter(Boolean).join('\n');
                      const blob = new Blob([content], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `script-${currentSkit.hook_line.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-')}.txt`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    style={{
                      padding: '10px 14px',
                      backgroundColor: '#374151',
                      border: '1px solid #4B5563',
                      borderRadius: '10px',
                      color: '#E5E7EB',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Download size={14} /> .txt
                  </button>
                </div>
              </div>

              {/* AI Chat Section */}
              <div style={{
                marginTop: '16px',
                border: `1px solid ${chatOpen ? '#6366f1' : colors.border}`,
                borderRadius: '12px',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}>
                <button
                  type="button"
                  onClick={() => setChatOpen(!chatOpen)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: chatOpen ? 'rgba(99, 102, 241, 0.1)' : colors.card,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: colors.text,
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageCircle size={16} style={{ color: '#6366f1' }} />
                    AI Script Assistant
                  </span>
                  {chatOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {chatOpen && (
                  <div style={{ padding: '12px 16px', borderTop: `1px solid ${colors.border}` }}>
                    {/* Quick action nudges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                      {[
                        'Make the hook punchier',
                        'Add more urgency',
                        'Rewrite for younger audience',
                        'Shorten the first 2 seconds',
                        'Make CTA more compelling',
                        'Dial up the humor',
                      ].map((nudge) => (
                        <button
                          key={nudge}
                          type="button"
                          onClick={() => handleChatSend(nudge)}
                          disabled={chatLoading}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            borderRadius: '16px',
                            color: '#a5b4fc',
                            fontSize: '11px',
                            cursor: chatLoading ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {nudge}
                        </button>
                      ))}
                    </div>

                    {/* Chat messages */}
                    {chatMessages.length > 0 && (
                      <div style={{
                        maxHeight: '240px',
                        overflowY: 'auto',
                        marginBottom: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}>
                        {chatMessages.map((msg, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '10px',
                              backgroundColor: msg.role === 'user' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(55, 65, 81, 0.5)',
                              color: colors.text,
                              fontSize: '13px',
                              lineHeight: '1.5',
                              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                              maxWidth: '90%',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {msg.content}
                          </div>
                        ))}
                        {chatLoading && (
                          <div style={{
                            padding: '8px 12px',
                            borderRadius: '10px',
                            backgroundColor: 'rgba(55, 65, 81, 0.5)',
                            color: '#9CA3AF',
                            fontSize: '13px',
                            alignSelf: 'flex-start',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}>
                            <Loader2 size={14} className="animate-spin" /> Thinking...
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    )}

                    {/* Chat input */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                        placeholder="Ask AI to adjust the script..."
                        disabled={chatLoading}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '10px',
                          color: colors.text,
                          fontSize: '13px',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleChatSend()}
                        disabled={!chatInput.trim() || chatLoading}
                        style={{
                          padding: '10px 14px',
                          backgroundColor: chatInput.trim() && !chatLoading ? '#6366f1' : '#374151',
                          border: 'none',
                          borderRadius: '10px',
                          color: 'white',
                          cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '400px',
            border: `1px solid ${colors.border}`,
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: colors.text }}>Save to Library</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '6px' }}>Title</label>
              <input
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '6px' }}>Status</label>
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
              <button type="button"
                onClick={() => setSaveModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '10px',
                  color: colors.text,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button type="button"
                onClick={handleSaveToLibrary}
                disabled={savingToLibrary || !saveTitle.trim()}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#8b5cf6',
                  border: 'none',
                  borderRadius: '10px',
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
          borderRadius: '10px',
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <Check size={16} />
          Saved to Library
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
