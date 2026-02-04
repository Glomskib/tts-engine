'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { postJson, isApiError, type ApiClientError } from '@/lib/http/fetchJson';
import ApiErrorPanel from '@/app/admin/components/ApiErrorPanel';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import { Trophy } from 'lucide-react';
import jsPDF from 'jspdf';
import { useCredits } from '@/hooks/useCredits';
import { NoCreditsModal, useNoCreditsModal } from '@/components/FeatureGate';
import PersonaPreviewCard from '@/components/PersonaPreviewCard';
import { PersonaSelector } from '@/components/PersonaSelector';
import { CreatorPersonaSelector } from '@/components/CreatorPersonaSelector';
import { WinnersIntelligencePanel } from '@/components/WinnersIntelligencePanel';
import {
  CONTENT_EDGE_OPTIONS,
  UNPREDICTABILITY_OPTIONS,
  HUMOR_LEVEL_OPTIONS,
  PACING_OPTIONS,
  HOOK_STRENGTH_OPTIONS,
  AUTHENTICITY_OPTIONS,
  PRESENTATION_STYLES,
  unpredictabilityToChaos,
  humorLevelToIntensity,
  chaosToUnpredictability,
  intensityToHumorLevel,
  type ContentEdge,
  type Pacing,
  type HookStrength,
  type Authenticity,
} from '@/lib/creative-controls';

// --- Helper Functions ---

/** Truncate text with ellipsis, full text available on hover */
function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
}

/** Get user-friendly error message with actionable next steps */
function getActionableErrorMessage(error: ApiClientError): { message: string; action?: string } {
  const code = error.error_code;
  const msg = error.message;

  switch (code) {
    case 'VALIDATION_ERROR':
      return {
        message: msg || 'Please check your inputs',
        action: 'Review the highlighted fields and try again.',
      };
    case 'UNAUTHORIZED':
      return {
        message: 'Your session has expired',
        action: 'Please refresh the page and sign in again.',
      };
    case 'RATE_LIMITED':
      return {
        message: 'Too many requests',
        action: 'Please wait a moment before trying again.',
      };
    case 'AI_ERROR':
      return {
        message: msg || 'AI generation failed',
        action: 'Try adjusting your settings or regenerate.',
      };
    case 'PRODUCT_NOT_FOUND':
      return {
        message: 'Product not found',
        action: 'Select a different product or enter details manually.',
      };
    default:
      return {
        message: msg || 'Something went wrong',
        action: 'Please try again. If the problem persists, contact support.',
      };
  }
}

/** Estimate reading time for text (words per minute) */
function estimateReadingTime(text: string, wpm: number = 150): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  return Math.ceil((words / wpm) * 60); // seconds
}

/** Get character count warning for overlay text */
function getOverlayCharWarning(text: string, limit: number = 40): string | null {
  if (!text) return null;
  if (text.length > limit) {
    return `${text.length}/${limit} chars - may be truncated on screen`;
  }
  return null;
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
  tone?: string;
  tone_preference?: string;
  humor_style?: string;
  attention_span?: string;
  trust_builders?: string[];
  phrases_they_use?: string[];
  phrases_to_avoid?: string[];
  // Pain Points & Motivations
  pain_points?: Array<{ point: string; intensity?: string }>;
  primary_pain_points?: string[];
  emotional_triggers?: string[];
  buying_objections?: string[];
  purchase_motivators?: string[];
  common_objections?: string[];
  // Content Preferences
  content_they_engage_with?: string[];
  content_types_preferred?: string[];
  platforms?: string[];
  best_posting_times?: string;
  // Meta
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

const ENERGY_CATEGORY_LABELS: Record<string, string> = {
  neutral: 'Neutral',
  high_energy: 'High Energy',
  deadpan: 'Deadpan',
  chaotic: 'Chaotic',
  wholesome: 'Wholesome',
};

type TargetDuration = 'quick' | 'standard' | 'extended' | 'long';

const DURATION_OPTIONS: { value: TargetDuration; label: string; description: string }[] = [
  { value: 'quick', label: 'Quick (15-20s)', description: '3-4 scenes, ultra-tight pacing' },
  { value: 'standard', label: 'Standard (30-45s)', description: '5-6 scenes, classic TikTok rhythm' },
  { value: 'extended', label: 'Extended (45-60s)', description: '7-8 scenes, room for development' },
  { value: 'long', label: 'Long Form (60-90s)', description: '9-12 scenes, full narrative arc' },
];

type ContentFormat = 'skit_dialogue' | 'scene_montage' | 'pov_story' | 'product_demo_parody' | 'reaction_commentary' | 'day_in_life';

const CONTENT_FORMAT_OPTIONS: { value: ContentFormat; label: string; description: string }[] = [
  { value: 'skit_dialogue', label: 'Comedy Skit (Multi-Person)', description: 'Person-to-person comedy scenes with dialogue' },
  { value: 'scene_montage', label: 'Scene Montage', description: 'Visual scenes with voiceover narration' },
  { value: 'pov_story', label: 'POV Story', description: 'First-person, natural slice-of-life feel' },
  { value: 'product_demo_parody', label: 'Product Demo Parody', description: 'Infomercial style with intentional comedy' },
  { value: 'reaction_commentary', label: 'Reaction/Commentary', description: 'Reacting to something with product tie-in' },
  { value: 'day_in_life', label: 'Day in the Life', description: 'Following a routine, product naturally integrated' },
];

const QUICK_ACTIONS = [
  { id: 'punch_hook', label: 'Punch Up Hook', instruction: 'Make the hook more aggressive and attention-grabbing. It should stop the scroll immediately.' },
  { id: 'plot_twist', label: 'Add Plot Twist', instruction: 'Add an unexpected plot twist or reversal somewhere in the middle of the skit.' },
  { id: 'funnier', label: 'Make Funnier', instruction: 'Punch up the comedy throughout. Add more jokes, better punchlines, and funnier moments.' },
  { id: 'product_focus', label: 'More Product Focus', instruction: 'Make the product integration more prominent and the benefits clearer, while keeping it organic.' },
];

interface SkitVersion {
  id: number;
  result: SkitResult;
  refinement?: string;
  timestamp: Date;
}

interface SkitTemplate {
  id: string;
  name: string;
  description: string;
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

interface SkitVariation {
  skit: SkitData;
  ai_score: AIScore | null;
  risk_tier_applied: 'SAFE' | 'BALANCED' | 'SPICY';
  risk_score?: number;
  risk_flags?: string[];
  template_validation?: {
    valid: boolean;
    issues: string[];
  };
}

interface SkitResult {
  // New variation support
  variations?: SkitVariation[];
  variation_count?: number;
  // Legacy single-skit fields (backward compatible)
  skit: SkitData;
  risk_tier_applied: 'SAFE' | 'BALANCED' | 'SPICY';
  risk_score?: number;
  risk_flags?: string[];
  intensity_applied?: number;
  budget_clamped?: boolean;
  preset_intensity_clamped?: boolean;
  preset_id?: string;
  preset_name?: string;
  template_id?: string;
  template_validation?: {
    valid: boolean;
    issues: string[];
  };
  ai_score?: AIScore | null;
}

type Persona = 'NONE' | 'DR_PICKLE' | 'CASH_KING' | 'ABSURD_BUDDY' | 'DEADPAN_OFFICE' | 'INFOMERCIAL_CHAOS';
type RiskTier = 'SAFE' | 'BALANCED' | 'SPICY';

interface SavedSkit {
  id: string;
  title: string;
  status: 'draft' | 'approved' | 'produced' | 'posted' | 'archived';
  product_name: string | null;
  product_brand: string | null;
  user_rating: number | null;
  created_at: string;
  updated_at: string;
  skit_data?: SkitResult['skit'];
  generation_config?: Record<string, unknown>;
  ai_score?: AIScore | null;
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

type SkitStatus = 'draft' | 'approved' | 'produced' | 'posted' | 'archived';

const SKIT_STATUS_OPTIONS: { value: SkitStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'produced', label: 'Produced' },
  { value: 'posted', label: 'Posted' },
  { value: 'archived', label: 'Archived' },
];

// localStorage keys for persisting user preferences
const SETTINGS_STORAGE_KEY = 'skit-generator-settings';
const RECENT_PRODUCTS_KEY = 'skit-generator-recent-products';
const TEMPLATE_FAVORITES_KEY = 'skit-generator-favorites';

interface RecentProduct {
  id: string;
  name: string;
  brand: string;
  usedAt: number; // timestamp
}

interface TemplateFavorite {
  id: string;
  presetId: string;
  templateId: string;
  name: string;
  createdAt: number;
}

interface GenerationHistoryItem {
  id: string;
  result: SkitResult;
  productName: string;
  timestamp: number;
}

interface SavedSettings {
  actorType: ActorType;
  targetDuration: TargetDuration;
  contentFormat: ContentFormat;
  contentEdge: ContentEdge;
  unpredictability: number;
  humorLevel: number;
  variationCount: number;
  showAdvanced: boolean;
  pacing?: Pacing;
  hookStrength?: HookStrength;
  authenticity?: Authenticity;
  characterPersona?: string;
  presentationStyle?: string;
  lastProductId?: string;
  lastProductName?: string;
  lastBrandName?: string;
}

export default function SkitGeneratorPage() {
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

  // Data state
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [presets, setPresets] = useState<SkitPreset[]>([]);
  const [templates, setTemplates] = useState<SkitTemplate[]>([]);
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
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [contentEdge, setContentEdge] = useState<ContentEdge>('SAFE');
  const [persona, setPersona] = useState<Persona>('NONE');
  const [humorLevel, setHumorLevel] = useState<number>(3);
  const [unpredictability, setUnpredictability] = useState<number>(3);
  const [creativeDirection, setCreativeDirection] = useState<string>('');
  const [targetDuration, setTargetDuration] = useState<TargetDuration>('standard');
  const [contentFormat, setContentFormat] = useState<ContentFormat>('skit_dialogue');
  const [productContext, setProductContext] = useState<string>('');
  const [variationCount, setVariationCount] = useState<number>(3);
  // New creative controls
  const [characterPersona, setCharacterPersona] = useState<string>('');
  const [creatorPersonaId, setCreatorPersonaId] = useState<string | null>(null);
  const [dialogueDensity, setDialogueDensity] = useState<number>(3); // 1-5 scale, 3 is balanced
  const [presentationStyle, setPresentationStyle] = useState<string>('');
  const [pacing, setPacing] = useState<Pacing>('moderate');
  const [hookStrength, setHookStrength] = useState<HookStrength>('standard');
  const [authenticity, setAuthenticity] = useState<Authenticity>('balanced');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Result state
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SkitResult | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Version history state
  const [versions, setVersions] = useState<SkitVersion[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState<number>(0);

  // Refinement state
  const [refinementOpen, setRefinementOpen] = useState(false);
  const [refinementText, setRefinementText] = useState('');
  const [refining, setRefining] = useState(false);

  // Rating state
  const [userRating, setUserRating] = useState<number>(0);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [savingRating, setSavingRating] = useState(false);
  const [ratingSaved, setRatingSaved] = useState(false);

  // Library state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<SkitStatus>('draft');
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [savedSkits, setSavedSkits] = useState<SavedSkit[]>([]);
  const [loadingSkits, setLoadingSkits] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<string>('');
  const [libraryProductFilter, setLibraryProductFilter] = useState<string>('');

  // AI Score state
  const [aiScore, setAiScore] = useState<AIScore | null>(null);
  const [scoringInProgress, setScoringInProgress] = useState(false);

  // Variation state
  const [selectedVariationIndex, setSelectedVariationIndex] = useState(0);

  // Network/retry state
  const [retryPayload, setRetryPayload] = useState<Record<string, unknown> | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitResetTime, setRateLimitResetTime] = useState<Date | null>(null);

  // Inline editing state
  const [editingSection, setEditingSection] = useState<string | null>(null); // 'hook', 'cta', 'beat-0', etc.
  const [undoStack, setUndoStack] = useState<{ sectionId: string; previousValue: SkitData }[]>([]);
  const [editValue, setEditValue] = useState('');
  const [editDialogue, setEditDialogue] = useState('');
  const [editOnScreenText, setEditOnScreenText] = useState('');
  const [improvingSection, setImprovingSection] = useState(false);
  const [isModified, setIsModified] = useState(false);
  const [localSkit, setLocalSkit] = useState<SkitData | null>(null);

  // UX state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savedSkitId, setSavedSkitId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Send to Video Queue state
  const [sendingToVideo, setSendingToVideo] = useState(false);
  const [linkedVideoId, setLinkedVideoId] = useState<string | null>(null);
  const [linkedVideoCode, setLinkedVideoCode] = useState<string | null>(null);

  // Recent products state (persisted in localStorage)
  const [recentProducts, setRecentProducts] = useState<RecentProduct[]>([]);

  // Template favorites state
  const [templateFavorites, setTemplateFavorites] = useState<TemplateFavorite[]>([]);

  // Generation history (session only - last 10 generations)
  const [generationHistory, setGenerationHistory] = useState<GenerationHistoryItem[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  // Winners Bank Intelligence state
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [winnerInfo, setWinnerInfo] = useState<{ hook_line?: string; content_type?: string } | null>(null);

  // Helper to get current skit data based on selected variation
  const getCurrentSkit = useCallback((): SkitData | null => {
    // If we have local modifications, use those
    if (localSkit) return localSkit;
    if (!result) return null;
    const variations = result.variations || [];
    if (variations.length > 0 && variations[selectedVariationIndex]) {
      return variations[selectedVariationIndex].skit;
    }
    return result.skit;
  }, [result, selectedVariationIndex, localSkit]);

  // Initialize local skit when result or variation changes
  useEffect(() => {
    if (result) {
      const variations = result.variations || [];
      if (variations.length > 0 && variations[selectedVariationIndex]) {
        setLocalSkit(JSON.parse(JSON.stringify(variations[selectedVariationIndex].skit)));
      } else {
        setLocalSkit(JSON.parse(JSON.stringify(result.skit)));
      }
      setIsModified(false);
    }
  }, [result, selectedVariationIndex]);

  // Start editing a section
  const startEditing = (sectionId: string, content: string, dialogue?: string, onScreenText?: string) => {
    setEditingSection(sectionId);
    setEditValue(content);
    setEditDialogue(dialogue || '');
    setEditOnScreenText(onScreenText || '');
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingSection(null);
    setEditValue('');
    setEditDialogue('');
    setEditOnScreenText('');
  };

  // Save manual edit
  const saveEdit = (sectionId: string) => {
    if (!localSkit) return;

    // Push current state to undo stack (limit to 10 items)
    setUndoStack(prev => [...prev.slice(-9), { sectionId, previousValue: JSON.parse(JSON.stringify(localSkit)) }]);

    const updatedSkit = { ...localSkit };

    if (sectionId === 'hook') {
      updatedSkit.hook_line = editValue;
    } else if (sectionId === 'cta') {
      updatedSkit.cta_line = editValue;
    } else if (sectionId === 'cta_overlay') {
      updatedSkit.cta_overlay = editValue;
    } else if (sectionId.startsWith('beat-')) {
      const beatIndex = parseInt(sectionId.replace('beat-', ''), 10);
      if (updatedSkit.beats[beatIndex]) {
        updatedSkit.beats[beatIndex] = {
          ...updatedSkit.beats[beatIndex],
          action: editValue,
          dialogue: editDialogue || undefined,
          on_screen_text: editOnScreenText || undefined,
        };
      }
    } else if (sectionId.startsWith('broll-')) {
      const index = parseInt(sectionId.replace('broll-', ''), 10);
      updatedSkit.b_roll[index] = editValue;
    } else if (sectionId.startsWith('overlay-')) {
      const index = parseInt(sectionId.replace('overlay-', ''), 10);
      updatedSkit.overlays[index] = editValue;
    }

    setLocalSkit(updatedSkit);
    setIsModified(true);
    cancelEditing();
    setAiScore(null); // Clear score since skit changed
  };

  // Undo last edit
  const undoEdit = useCallback(() => {
    if (undoStack.length === 0) return;
    const lastUndo = undoStack[undoStack.length - 1];
    setLocalSkit(lastUndo.previousValue);
    setUndoStack(prev => prev.slice(0, -1));
    setIsModified(true);
  }, [undoStack]);

  // Keyboard shortcuts for editing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to cancel editing
      if (e.key === 'Escape' && editingSection) {
        cancelEditing();
      }
      // Ctrl/Cmd + Z to undo (only when not in a text input)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !editingSection && undoStack.length > 0) {
        e.preventDefault();
        undoEdit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingSection, undoStack, undoEdit]);

  // AI improve section
  const improveSection = async (sectionId: string, currentContent: string) => {
    setImprovingSection(true);

    const product = selectedProductId
      ? products.find(p => p.id === selectedProductId)
      : null;

    // Determine section type for API
    let sectionType = 'hook';
    let beatIndex: number | undefined;
    if (sectionId === 'hook') sectionType = 'hook';
    else if (sectionId === 'cta') sectionType = 'cta';
    else if (sectionId === 'cta_overlay') sectionType = 'cta_overlay';
    else if (sectionId.startsWith('beat-')) {
      sectionType = 'beat';
      beatIndex = parseInt(sectionId.replace('beat-', ''), 10);
    }
    else if (sectionId.startsWith('broll-')) sectionType = 'broll';
    else if (sectionId.startsWith('overlay-')) sectionType = 'overlay';

    try {
      const res = await fetch('/api/ai/improve-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_type: sectionType,
          current_content: currentContent,
          context: {
            product_name: product?.name || manualProductName || 'Product',
            product_brand: product?.brand || manualBrandName,
            beat_index: beatIndex,
          },
        }),
      });

      const data = await res.json();

      if (data.ok && data.data?.improved) {
        if (sectionType === 'beat' && typeof data.data.improved === 'object') {
          setEditValue(data.data.improved.action || currentContent);
          setEditDialogue(data.data.improved.dialogue || '');
          setEditOnScreenText(data.data.improved.on_screen_text || '');
        } else {
          setEditValue(data.data.improved);
        }
      }
    } catch (err) {
      console.error('Failed to improve section:', err);
    } finally {
      setImprovingSection(false);
    }
  };

  // Move beat up or down
  const moveBeat = (index: number, direction: 'up' | 'down') => {
    if (!localSkit) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= localSkit.beats.length) return;

    const updatedBeats = [...localSkit.beats];
    const [removed] = updatedBeats.splice(index, 1);
    updatedBeats.splice(newIndex, 0, removed);

    // Update timestamps based on new order
    const updatedBeatsWithTiming = updatedBeats.map((beat, i) => ({
      ...beat,
      t: `0:${String((i + 1) * 5).padStart(2, '0')}-0:${String((i + 2) * 5).padStart(2, '0')}`,
    }));

    setLocalSkit({ ...localSkit, beats: updatedBeatsWithTiming });
    setIsModified(true);
    setAiScore(null);
  };

  // Delete a beat
  const deleteBeat = (index: number) => {
    if (!localSkit || localSkit.beats.length <= 1) return;

    const updatedBeats = localSkit.beats.filter((_, i) => i !== index);

    // Update timestamps
    const updatedBeatsWithTiming = updatedBeats.map((beat, i) => ({
      ...beat,
      t: `0:${String((i + 1) * 5).padStart(2, '0')}-0:${String((i + 2) * 5).padStart(2, '0')}`,
    }));

    setLocalSkit({ ...localSkit, beats: updatedBeatsWithTiming });
    setIsModified(true);
    setAiScore(null);
  };

  // Add a new beat
  const addBeat = () => {
    // Get the current skit data - use localSkit if available, otherwise initialize from result
    const skit = localSkit || getCurrentSkit();
    if (!skit) return;

    const newBeatIndex = skit.beats.length;
    const newBeat = {
      t: `0:${String((newBeatIndex + 1) * 5).padStart(2, '0')}-0:${String((newBeatIndex + 2) * 5).padStart(2, '0')}`,
      action: 'New action here...',
      dialogue: undefined,
      on_screen_text: undefined,
    };

    // If localSkit wasn't set yet, initialize it from the current skit
    const updatedSkit = localSkit
      ? { ...localSkit, beats: [...localSkit.beats, newBeat] }
      : { ...skit, beats: [...skit.beats, newBeat] };

    setLocalSkit(updatedSkit);
    setIsModified(true);
    setAiScore(null);

    // Open editor for new beat
    startEditing(`beat-${newBeatIndex}`, newBeat.action);
  };

  // Add new B-roll item
  const addBrollItem = () => {
    if (!localSkit) return;
    const newIndex = localSkit.b_roll.length;
    setLocalSkit({ ...localSkit, b_roll: [...localSkit.b_roll, 'New B-roll suggestion...'] });
    setIsModified(true);
    setAiScore(null);
    startEditing(`broll-${newIndex}`, 'New B-roll suggestion...');
  };

  // Delete B-roll item
  const deleteBrollItem = (index: number) => {
    if (!localSkit) return;
    setLocalSkit({ ...localSkit, b_roll: localSkit.b_roll.filter((_, i) => i !== index) });
    setIsModified(true);
    setAiScore(null);
  };

  // Add new overlay item
  const addOverlayItem = () => {
    if (!localSkit) return;
    const newIndex = localSkit.overlays.length;
    setLocalSkit({ ...localSkit, overlays: [...localSkit.overlays, 'New overlay text...'] });
    setIsModified(true);
    setAiScore(null);
    startEditing(`overlay-${newIndex}`, 'New overlay text...');
  };

  // Delete overlay item
  const deleteOverlayItem = (index: number) => {
    if (!localSkit) return;
    setLocalSkit({ ...localSkit, overlays: localSkit.overlays.filter((_, i) => i !== index) });
    setIsModified(true);
    setAiScore(null);
  };

  // Check for product_id and winner_id from URL
  useEffect(() => {
    const productId = searchParams.get('product_id');
    if (productId) {
      setSelectedProductId(productId);
    }

    // Winner ID for "Generate Similar" feature
    const urlWinnerId = searchParams.get('winner_id');
    if (urlWinnerId) {
      setWinnerId(urlWinnerId);
      // Fetch winner info for display
      fetch(`/api/winners/${urlWinnerId}`)
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.data) {
            setWinnerInfo({
              hook_line: data.data.ai_analysis?.hook_line || data.data.reference_extracts?.[0]?.spoken_hook,
              content_type: data.data.ai_analysis?.content_format,
            });
          }
        })
        .catch(() => {
          // Ignore fetch errors
        });
    }
  }, [searchParams]);

  // Load saved settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const settings: SavedSettings = JSON.parse(saved);
        if (settings.actorType) setActorType(settings.actorType);
        if (settings.targetDuration) setTargetDuration(settings.targetDuration);
        if (settings.contentFormat) setContentFormat(settings.contentFormat);
        if (settings.contentEdge) setContentEdge(settings.contentEdge);
        if (typeof settings.unpredictability === 'number') setUnpredictability(settings.unpredictability);
        if (typeof settings.humorLevel === 'number') setHumorLevel(settings.humorLevel);
        if (typeof settings.variationCount === 'number') setVariationCount(settings.variationCount);
        if (typeof settings.showAdvanced === 'boolean') setShowAdvanced(settings.showAdvanced);
        if (settings.pacing) setPacing(settings.pacing);
        if (settings.hookStrength) setHookStrength(settings.hookStrength);
        if (settings.authenticity) setAuthenticity(settings.authenticity);
        if (settings.characterPersona) setCharacterPersona(settings.characterPersona);
        if (settings.presentationStyle) setPresentationStyle(settings.presentationStyle);
        // Don't auto-select last product on load if URL has product_id
        // The URL param takes precedence
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    try {
      // Get current product info for saving
      const product = selectedProductId ? products.find(p => p.id === selectedProductId) : null;
      const settings: SavedSettings = {
        actorType,
        targetDuration,
        contentFormat,
        contentEdge,
        unpredictability,
        humorLevel,
        variationCount,
        showAdvanced,
        pacing,
        hookStrength,
        authenticity,
        characterPersona: characterPersona || undefined,
        presentationStyle: presentationStyle || undefined,
        lastProductId: selectedProductId || undefined,
        lastProductName: product?.name || manualProductName || undefined,
        lastBrandName: product?.brand || manualBrandName || undefined,
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore localStorage errors
    }
  }, [actorType, targetDuration, contentFormat, contentEdge, unpredictability, humorLevel, variationCount, showAdvanced, pacing, hookStrength, authenticity, characterPersona, presentationStyle, selectedProductId, manualProductName, manualBrandName, products]);

  // Load recent products from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_PRODUCTS_KEY);
      if (saved) {
        const recentList: RecentProduct[] = JSON.parse(saved);
        setRecentProducts(recentList.slice(0, 5)); // Keep max 5
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Load template favorites from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEMPLATE_FAVORITES_KEY);
      if (saved) {
        setTemplateFavorites(JSON.parse(saved));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Function to track recently used product
  const trackRecentProduct = useCallback((productId: string, name: string, brand: string) => {
    setRecentProducts(prev => {
      // Remove if already exists
      const filtered = prev.filter(p => p.id !== productId);
      // Add to front with timestamp
      const updated = [
        { id: productId, name, brand, usedAt: Date.now() },
        ...filtered
      ].slice(0, 5); // Keep max 5

      // Persist to localStorage
      try {
        localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(updated));
      } catch {
        // Ignore
      }

      return updated;
    });
  }, []);

  // Function to toggle template favorite
  const toggleFavorite = useCallback((presetId: string, templateId: string) => {
    setTemplateFavorites(prev => {
      const existingIndex = prev.findIndex(
        f => f.presetId === presetId && f.templateId === templateId
      );

      let updated: TemplateFavorite[];
      if (existingIndex >= 0) {
        // Remove favorite
        updated = prev.filter((_, i) => i !== existingIndex);
      } else {
        // Add favorite
        const preset = presets.find(p => p.id === presetId);
        const template = templates.find(t => t.id === templateId);
        const name = `${preset?.name || presetId} + ${template?.name || templateId || 'No Template'}`;
        updated = [
          ...prev,
          {
            id: `${presetId}-${templateId || 'none'}`,
            presetId,
            templateId: templateId || '',
            name,
            createdAt: Date.now(),
          }
        ];
      }

      // Persist to localStorage
      try {
        localStorage.setItem(TEMPLATE_FAVORITES_KEY, JSON.stringify(updated));
      } catch {
        // Ignore
      }

      return updated;
    });
  }, [presets, templates]);

  // Check if current combo is favorited
  const isFavorited = useCallback((presetId: string, templateId: string) => {
    return templateFavorites.some(
      f => f.presetId === presetId && f.templateId === (templateId || '')
    );
  }, [templateFavorites]);

  // Add generation to history
  const addToHistory = useCallback((result: SkitResult, productName: string) => {
    setGenerationHistory(prev => {
      const updated = [
        {
          id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
          result,
          productName,
          timestamp: Date.now(),
        },
        ...prev
      ].slice(0, 10); // Keep max 10
      return updated;
    });
  }, []);

  // Load a generation from history
  const loadFromHistory = useCallback((item: GenerationHistoryItem) => {
    setResult(item.result);
    setSelectedVariationIndex(0);

    // Reset version history with loaded generation
    const newVersion: SkitVersion = {
      id: 1,
      result: item.result,
      timestamp: new Date(item.timestamp),
    };
    setVersions([newVersion]);
    setCurrentVersionIndex(0);

    // Set AI score if available
    const variations = item.result.variations || [];
    if (variations.length > 0) {
      setAiScore(variations[0].ai_score || null);
    } else {
      setAiScore(item.result.ai_score || null);
    }

    setShowHistoryDropdown(false);
  }, []);

  // Keyboard shortcuts (Ctrl+Enter to generate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter to generate
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!generating && (selectedProductId || manualProductName.trim())) {
          handleGenerate();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [generating, selectedProductId, manualProductName]);

  // Fetch auth user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/skit-generator');
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
        });
      } catch (err) {
        console.error('Failed to fetch auth user:', err);
        router.push('/login?redirect=/admin/skit-generator');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch products, presets, templates
  useEffect(() => {
    if (authLoading || !authUser) return;

    const fetchData = async () => {
      setLoadingData(true);
      try {
        // Fetch products
        const productsRes = await fetch('/api/products');
        const productsData = await productsRes.json();
        if (productsData.ok) {
          const productList = productsData.data || [];
          setProducts(productList);
          // Extract unique brands
          const uniqueBrands = [...new Set(productList.map((p: Product) => p.brand))].filter(Boolean).sort() as string[];
          setBrands(uniqueBrands);
        }

        // Fetch presets
        const presetsRes = await fetch('/api/ai/skit-presets');
        const presetsData = await presetsRes.json();
        if (presetsData.ok) {
          setPresets(presetsData.data || []);
        }

        // Fetch templates
        const templatesRes = await fetch('/api/ai/skit-templates');
        const templatesData = await templatesRes.json();
        if (templatesData.ok) {
          setTemplates(templatesData.data || []);
        }

        // Fetch audience personas
        const personasRes = await fetch('/api/audience/personas');
        const personasData = await personasRes.json();
        if (personasData.ok) {
          setAudiencePersonas(personasData.data || []);
        }

        // Fetch pain points
        const painPointsRes = await fetch('/api/audience/pain-points');
        const painPointsData = await painPointsRes.json();
        if (painPointsData.ok) {
          setPainPoints(painPointsData.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [authLoading, authUser]);

  // Filter products by selected brand (memoized)
  const filteredProducts = useMemo(() => {
    if (!selectedBrand) return products;
    // Trim and compare to handle any whitespace inconsistencies
    const normalizedBrand = selectedBrand.trim();
    return products.filter(p => p.brand?.trim() === normalizedBrand);
  }, [products, selectedBrand]);

  // Auto-select product from URL param
  useEffect(() => {
    if (selectedProductId && products.length > 0) {
      const product = products.find(p => p.id === selectedProductId);
      if (product && product.brand) {
        setSelectedBrand(product.brand);
      }
    }
  }, [selectedProductId, products]);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const handleGenerate = async (retryWithPayload?: Record<string, unknown>) => {
    // Check if user has credits
    if (!hasCredits) {
      noCreditsModal.open();
      return;
    }

    // Check if rate limited
    if (isRateLimited && rateLimitResetTime && new Date() < rateLimitResetTime) {
      const secondsRemaining = Math.ceil((rateLimitResetTime.getTime() - Date.now()) / 1000);
      setError({
        ok: false,
        error_code: 'RATE_LIMITED',
        message: `AI service is busy. Please wait ${secondsRemaining} seconds.`,
        correlation_id: 'rate_limit_check',
        httpStatus: 429,
      });
      return;
    }

    // Validate: need either product_id or manual product name
    if (!retryWithPayload && !selectedProductId && !manualProductName.trim()) {
      setError({
        ok: false,
        error_code: 'VALIDATION_ERROR',
        message: 'Please select a product or enter a product name',
        correlation_id: 'client_validation',
        httpStatus: 400,
      });
      return;
    }

    // Validate manual product name length
    if (!selectedProductId && manualProductName.trim().length < 3) {
      setError({
        ok: false,
        error_code: 'VALIDATION_ERROR',
        message: 'Product name must be at least 3 characters',
        correlation_id: 'client_validation',
        httpStatus: 400,
      });
      return;
    }

    setGenerating(true);
    setError(null);
    if (!retryWithPayload) {
      setResult(null);
    }
    setIsRateLimited(false);

    const payload: Record<string, unknown> = retryWithPayload || {
      // Map creative controls to API format
      risk_tier: contentEdge,
      persona: persona,
      intensity: humorLevelToIntensity(humorLevel),
      chaos_level: unpredictabilityToChaos(unpredictability),
      creative_direction: creativeDirection.trim() || undefined,
      actor_type: actorType,
      target_duration: targetDuration,
      content_format: contentFormat,
      product_context: productContext.trim() || undefined,
      variation_count: variationCount,
      // Additional creative controls
      pacing: pacing || undefined,
      hook_strength: hookStrength || undefined,
      authenticity: authenticity || undefined,
      presentation_style: presentationStyle || undefined,
      creator_persona_id: creatorPersonaId || undefined,
      dialogue_density: dialogueDensity,
      // Audience Intelligence
      audience_persona_id: selectedPersonaId || undefined,
      pain_point_id: selectedPainPointId || undefined,
      pain_point_focus: selectedPersonaPainPoints.length > 0 ? selectedPersonaPainPoints : undefined,
      use_audience_language: useAudienceLanguage,
      // Winners Bank Intelligence
      winner_id: winnerId || undefined,
      use_winners_intelligence: true,
    };

    if (!retryWithPayload) {
      if (selectedProductId) {
        payload.product_id = selectedProductId;
      } else {
        payload.product_name = manualProductName.trim();
        if (manualBrandName.trim()) {
          payload.brand_name = manualBrandName.trim();
        }
      }

      if (selectedPreset && selectedPreset !== 'NONE') {
        payload.preset_id = selectedPreset;
      }

      if (selectedTemplate) {
        payload.template_id = selectedTemplate;
      }
    }

    // Store payload for potential retry
    setRetryPayload(payload);

    let response;
    try {
      response = await postJson<SkitResult>('/api/ai/generate-skit', payload);
    } catch {
      setGenerating(false);
      setError({
        ok: false,
        error_code: 'INTERNAL',
        message: 'Network error: Unable to reach the server',
        correlation_id: 'network_error',
        httpStatus: 0,
      });
      return;
    }

    setGenerating(false);

    if (isApiError(response)) {
      // Handle rate limiting specially
      if (response.error_code === 'RATE_LIMITED') {
        setIsRateLimited(true);
        setRateLimitResetTime(new Date(Date.now() + 30000)); // 30 second cooldown
      }
      // Handle no credits (402 Payment Required)
      if (response.httpStatus === 402) {
        refetchCredits();
        noCreditsModal.open();
        return;
      }
      setError(response);
      return;
    }

    // Refetch credits after successful generation
    refetchCredits();

    setResult(response.data);

    // Reset version history with new generation
    const newVersion: SkitVersion = {
      id: 1,
      result: response.data,
      timestamp: new Date(),
    };
    setVersions([newVersion]);
    setCurrentVersionIndex(0);

    // Reset rating state
    setUserRating(0);
    setRatingFeedback('');
    setRatingSaved(false);
    setRefinementOpen(false);
    setRefinementText('');

    // Reset variation selection to best (first) variation
    setSelectedVariationIndex(0);

    // Set AI score from response (use best variation's score)
    const variations = response.data.variations;
    let newScore = null;
    if (variations && variations.length > 0) {
      newScore = variations[0].ai_score || null;
    } else {
      newScore = response.data.ai_score || null;
    }
    setAiScore(newScore);

    // Celebrate high scores!
    if (newScore && newScore.overall_score >= 8.0) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
    }

    // Track recent product if using product_id
    if (selectedProductId && !retryWithPayload) {
      const product = products.find(p => p.id === selectedProductId);
      if (product) {
        trackRecentProduct(selectedProductId, product.name, product.brand);
      }
    }

    // Add to generation history
    const productName = selectedProductId
      ? products.find(p => p.id === selectedProductId)?.name || 'Product'
      : manualProductName || 'Product';
    addToHistory(response.data, productName);
  };

  // Retry last failed generation
  const handleRetry = () => {
    if (retryPayload) {
      handleGenerate(retryPayload);
    } else {
      handleGenerate();
    }
  };

  // Clear rate limit after timeout
  useEffect(() => {
    if (isRateLimited && rateLimitResetTime) {
      const timeout = setTimeout(() => {
        if (new Date() >= rateLimitResetTime) {
          setIsRateLimited(false);
          setRateLimitResetTime(null);
        }
      }, rateLimitResetTime.getTime() - Date.now());
      return () => clearTimeout(timeout);
    }
  }, [isRateLimited, rateLimitResetTime]);


  // Handle skit refinement
  const handleRefine = async (instruction: string) => {
    if (!result || !instruction.trim()) return;

    setRefining(true);
    setError(null);

    const product = selectedProductId
      ? products.find(p => p.id === selectedProductId)
      : null;

    const currentSkit = getCurrentSkit();
    if (!currentSkit) return;

    const payload = {
      current_skit: currentSkit,
      instruction: instruction.trim(),
      product_name: product?.name || manualProductName || 'Product',
      product_brand: product?.brand || manualBrandName || undefined,
      risk_tier: contentEdge,
    };

    const response = await postJson<SkitResult>('/api/ai/refine-skit', payload);

    setRefining(false);

    if (isApiError(response)) {
      setError(response);
      return;
    }

    // Add new version
    const newVersion: SkitVersion = {
      id: versions.length + 1,
      result: response.data,
      refinement: instruction.trim(),
      timestamp: new Date(),
    };
    setVersions(prev => [...prev, newVersion]);
    setCurrentVersionIndex(versions.length);
    setResult(response.data);
    setRefinementText('');

    // Reset rating and score for new version
    setUserRating(0);
    setRatingFeedback('');
    setRatingSaved(false);
    setAiScore(null);
  };

  // Handle rating save
  const handleSaveRating = async () => {
    if (!result || userRating === 0) return;

    setSavingRating(true);

    const product = selectedProductId
      ? products.find(p => p.id === selectedProductId)
      : null;

    const currentSkit = getCurrentSkit();
    if (!currentSkit) return;

    const payload = {
      skit_data: currentSkit,
      rating: userRating,
      feedback: ratingFeedback.trim() || undefined,
      product_id: selectedProductId || undefined,
      product_name: product?.name || manualProductName || undefined,
      product_brand: product?.brand || manualBrandName || undefined,
      generation_config: {
        risk_tier: contentEdge,
        persona,
        chaos_level: unpredictabilityToChaos(unpredictability),
        intensity: humorLevelToIntensity(humorLevel),
        actor_type: actorType,
        target_duration: targetDuration,
        preset_id: selectedPreset !== 'NONE' ? selectedPreset : undefined,
        template_id: selectedTemplate || undefined,
        creative_direction: creativeDirection || undefined,
        character_persona: characterPersona || undefined,
        presentation_style: presentationStyle || undefined,
        pacing,
        hook_strength: hookStrength,
        authenticity,
      },
    };

    const response = await postJson('/api/ai/rate-skit', payload);

    setSavingRating(false);

    if (isApiError(response)) {
      setError(response);
      return;
    }

    setRatingSaved(true);
  };

  // Handle AI score request
  const handleGetAIScore = async () => {
    if (!result) return;
    const currentSkit = getCurrentSkit();
    if (!currentSkit) return;

    setScoringInProgress(true);
    setError(null);

    const product = selectedProductId
      ? products.find(p => p.id === selectedProductId)
      : null;

    const payload = {
      skit_data: currentSkit,
      product_name: product?.name || manualProductName || 'Product',
      product_brand: product?.brand || manualBrandName || undefined,
    };

    const response = await postJson<AIScore>('/api/ai/score-skit', payload);

    setScoringInProgress(false);

    if (isApiError(response)) {
      setError(response);
      return;
    }

    setAiScore(response.data);

    // Celebrate high scores!
    if (response.data && response.data.overall_score >= 8.0) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
    }
  };

  // Switch to a specific version
  const switchToVersion = (index: number) => {
    if (index >= 0 && index < versions.length) {
      setCurrentVersionIndex(index);
      setResult(versions[index].result);
      // Reset rating state for this version
      setUserRating(0);
      setRatingFeedback('');
      setRatingSaved(false);
    }
  };

  // Open save modal with auto-generated title
  const openSaveModal = () => {
    if (!result) return;
    const currentSkit = getCurrentSkit();
    if (!currentSkit) return;
    // Generate default title from hook line
    const hookLine = currentSkit.hook_line || '';
    const defaultTitle = hookLine.length > 50
      ? hookLine.substring(0, 50) + '...'
      : hookLine || 'Untitled Skit';
    setSaveTitle(defaultTitle);
    setSaveStatus('draft');
    setSaveModalOpen(true);
    setSavedToLibrary(false);
  };

  // Save skit to library
  const handleSaveToLibrary = async () => {
    if (!result || !saveTitle.trim()) return;
    const currentSkit = getCurrentSkit();
    if (!currentSkit) return;

    setSavingToLibrary(true);

    const product = selectedProductId
      ? products.find(p => p.id === selectedProductId)
      : null;

    const payload = {
      title: saveTitle.trim(),
      skit_data: currentSkit,
      status: saveStatus,
      product_id: selectedProductId || undefined,
      product_name: product?.name || manualProductName || undefined,
      product_brand: product?.brand || manualBrandName || undefined,
      user_rating: userRating > 0 ? userRating : undefined,
      ai_score: aiScore || undefined,
      generation_config: {
        risk_tier: contentEdge,
        persona,
        chaos_level: unpredictabilityToChaos(unpredictability),
        intensity: humorLevelToIntensity(humorLevel),
        actor_type: actorType,
        target_duration: targetDuration,
        content_format: contentFormat,
        preset_id: selectedPreset !== 'NONE' ? selectedPreset : undefined,
        template_id: selectedTemplate || undefined,
        creative_direction: creativeDirection || undefined,
        variation_count: variationCount,
        selected_variation_index: selectedVariationIndex,
        is_modified: isModified,
        character_persona: characterPersona || undefined,
        presentation_style: presentationStyle || undefined,
        pacing,
        hook_strength: hookStrength,
        authenticity,
      },
    };

    const response = await postJson<{ id: string }>('/api/skits', payload);

    setSavingToLibrary(false);

    if (isApiError(response)) {
      setError(response);
      return;
    }

    setSavedToLibrary(true);
    // Store the saved skit ID for the "View in Library" link
    if (response.data?.id) {
      setSavedSkitId(response.data.id);
    }
    // Don't auto-close - let user see success state and click "View in Library"
  };

  // Send skit to video queue
  const handleSendToVideo = async () => {
    if (!savedSkitId) {
      // Must save to library first
      setError({
        message: 'Please save to library first',
        error_code: 'VALIDATION_ERROR',
      } as ApiClientError);
      return;
    }

    setSendingToVideo(true);

    const response = await postJson<{ video_id: string; video_code: string }>(
      `/api/skits/${savedSkitId}/send-to-video`,
      { priority: 'normal' }
    );

    setSendingToVideo(false);

    if (isApiError(response)) {
      setError(response);
      return;
    }

    if (response.data) {
      setLinkedVideoId(response.data.video_id);
      setLinkedVideoCode(response.data.video_code);
    }
  };

  // Fetch saved skits for library
  const fetchSavedSkits = async () => {
    setLoadingSkits(true);

    let url = '/api/skits?limit=50';
    if (libraryStatusFilter) {
      url += `&status=${libraryStatusFilter}`;
    }
    if (librarySearch.trim()) {
      url += `&search=${encodeURIComponent(librarySearch.trim())}`;
    }
    if (libraryProductFilter) {
      url += `&product_id=${libraryProductFilter}`;
    }

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (!json.ok) {
        console.error('Failed to fetch skits:', json);
        return;
      }

      setSavedSkits(json.data || []);
    } catch (err) {
      console.error('Failed to fetch skits:', err);
    } finally {
      setLoadingSkits(false);
    }
  };

  // Open load modal and fetch skits
  const openLoadModal = () => {
    setLoadModalOpen(true);
    setLibrarySearch('');
    setLibraryStatusFilter('');
    setLibraryProductFilter('');
    fetchSavedSkits();
  };

  // Load a skit from library
  const handleLoadSkit = async (skitId: string) => {
    try {
      const res = await fetch(`/api/skits/${skitId}`);
      const json = await res.json();

      if (!json.ok) {
        setError({
          ok: false,
          error_code: json.error_code || 'INTERNAL',
          message: json.message || 'Failed to load skit',
          correlation_id: json.correlation_id || 'unknown',
          httpStatus: res.status,
        });
        return;
      }

      const skit = json.data as SavedSkit;

      // Set the result
      if (skit.skit_data) {
        const loadedResult: SkitResult = {
          skit: skit.skit_data,
          risk_tier_applied: (skit.generation_config?.risk_tier as RiskTier) || 'SAFE',
          intensity_applied: (skit.generation_config?.intensity as number) || 50,
        };
        setResult(loadedResult);

        // Reset version history with loaded skit
        const newVersion: SkitVersion = {
          id: 1,
          result: loadedResult,
          timestamp: new Date(),
        };
        setVersions([newVersion]);
        setCurrentVersionIndex(0);
      }

      // Restore generation config if available
      if (skit.generation_config) {
        const config = skit.generation_config;
        if (config.risk_tier) setContentEdge(config.risk_tier as ContentEdge);
        if (config.persona) setPersona(config.persona as Persona);
        // Convert old 0-100 scale to new 1-5 scale
        if (typeof config.chaos_level === 'number') setUnpredictability(chaosToUnpredictability(config.chaos_level));
        if (typeof config.intensity === 'number') setHumorLevel(intensityToHumorLevel(config.intensity));
        if (config.actor_type) setActorType(config.actor_type as ActorType);
        if (config.target_duration) setTargetDuration(config.target_duration as TargetDuration);
        if (config.content_format) setContentFormat(config.content_format as ContentFormat);
        if (config.preset_id) setSelectedPreset(config.preset_id as string);
        if (config.template_id) setSelectedTemplate(config.template_id as string);
        if (config.creative_direction) setCreativeDirection(config.creative_direction as string);
        // Load new creative controls if available
        if (config.character_persona) setCharacterPersona(config.character_persona as string);
        if (config.presentation_style) setPresentationStyle(config.presentation_style as string);
        if (config.pacing) setPacing(config.pacing as Pacing);
        if (config.hook_strength) setHookStrength(config.hook_strength as HookStrength);
        if (config.authenticity) setAuthenticity(config.authenticity as Authenticity);
      }

      // Set rating if available
      if (skit.user_rating) {
        setUserRating(skit.user_rating);
      } else {
        setUserRating(0);
      }
      setRatingFeedback('');
      setRatingSaved(false);

      // Set AI score if available
      if (skit.ai_score) {
        setAiScore(skit.ai_score);
      } else {
        setAiScore(null);
      }

      setLoadModalOpen(false);
    } catch (err) {
      console.error('Failed to load skit:', err);
    }
  };

  if (authLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
        Checking access...
      </div>
    );
  }

  if (!authUser) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
        Redirecting to login...
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }} className="pb-24 lg:pb-6">
      {/* Celebration Toast */}
      {showCelebration && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#10b981',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            fontSize: '16px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'slideDown 0.3s ease-out',
          }}
        >
          <span style={{ fontSize: '20px' }}>🎉</span>
          Great score! This skit has high viral potential.
        </div>
      )}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        /* Mobile Responsive Styles */
        @media (max-width: 768px) {
          .variation-tabs { flex-wrap: nowrap !important; }
          input, select, textarea { font-size: 16px !important; } /* Prevent iOS zoom */
          button { min-height: 44px; }
        }
      `}</style>

      {/* Breadcrumb Navigation */}
      <nav style={{ marginBottom: '12px', fontSize: '13px' }}>
        <Link href="/admin/pipeline" style={{ color: colors.textMuted, textDecoration: 'none' }}>
          Admin
        </Link>
        <span style={{ color: colors.textMuted, margin: '0 8px' }}>/</span>
        <span style={{ color: colors.text, fontWeight: 500 }}>Skit Generator</span>
      </nav>

      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, color: colors.text }}>Skit Generator</h1>
          <p style={{ margin: '4px 0 0 0', color: colors.textSecondary, fontSize: '14px' }}>
            Generate AI-powered comedy skits for product marketing
          </p>
        </div>
        <div className="header-buttons" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button"
            onClick={openLoadModal}
            style={{
              padding: '10px 16px',
              backgroundColor: '#7c3aed',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: 500,
              minHeight: '44px',
            }}
          >
            Load from Library
          </button>
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
              display: 'flex',
              alignItems: 'center',
              minHeight: '44px',
            }}
          >
            View Library
          </Link>
          <Link
            href="/admin/pipeline"
            style={{
              padding: '10px 16px',
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              color: colors.text,
              textDecoration: 'none',
              minHeight: '44px',
              fontSize: '14px',
            }}
          >
            Back to Pipeline
          </Link>
        </div>
      </div>

      {/* Winner Variation Banner */}
      {winnerId && (
        <div style={{
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Trophy style={{ color: '#10b981', width: '18px', height: '18px' }} />
            <div>
              <div style={{ color: '#10b981', fontWeight: 600, fontSize: '13px' }}>
                Generating Variation of Winner
              </div>
              {winnerInfo?.hook_line && (
                <div style={{ color: colors.textMuted, fontSize: '12px', marginTop: '2px' }}>
                  Original hook: &ldquo;{winnerInfo.hook_line.slice(0, 60)}{winnerInfo.hook_line.length > 60 ? '...' : ''}&rdquo;
                </div>
              )}
            </div>
          </div>
          <button type="button"
            onClick={() => {
              setWinnerId(null);
              setWinnerInfo(null);
              router.replace('/admin/skit-generator');
            }}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '4px',
              color: '#10b981',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Winners Intelligence Panel - shows insights from winners bank */}
      <WinnersIntelligencePanel className="mb-6" />

      {/* Main content - responsive grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
        {/* Left column: Form */}
        <div style={{
          backgroundColor: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
          padding: '20px',
          flex: '1 1 400px',
          minWidth: '320px',
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', color: colors.text }}>Configuration</h2>

          {loadingData ? (
            <div style={{ padding: '20px', textAlign: 'center', color: colors.textSecondary }}>
              Loading options...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Product Selection */}
              <div style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: colors.textSecondary, fontWeight: 500 }}>
                  Product
                </h3>

                {/* Recent Products Quick Access */}
                {recentProducts.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '11px', color: colors.textSecondary, textTransform: 'uppercase' }}>
                      Recent
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {recentProducts
                        .filter(rp => products.some(p => p.id === rp.id)) // Only show if product still exists
                        .map((rp) => (
                        <button type="button"
                          key={rp.id}
                          onClick={() => {
                            setSelectedProductId(rp.id);
                            setManualProductName('');
                            setManualBrandName('');
                            // Also set the brand filter if it matches
                            if (brands.includes(rp.brand)) {
                              setSelectedBrand(rp.brand);
                            }
                          }}
                          title={`${rp.name} (${rp.brand})`}
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            backgroundColor: selectedProductId === rp.id ? '#7c3aed' : colors.bg,
                            color: selectedProductId === rp.id ? 'white' : colors.text,
                            border: `1px solid ${selectedProductId === rp.id ? '#7c3aed' : colors.border}`,
                            borderRadius: '16px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            maxWidth: '150px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {truncateText(rp.name, 20)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Brand Filter */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                    Filter by Brand (optional)
                  </label>
                  <select
                    value={selectedBrand}
                    onChange={(e) => {
                      setSelectedBrand(e.target.value);
                      setSelectedProductId('');
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  >
                    <option value="">All Brands</option>
                    {brands.map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>

                {/* Product Dropdown */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                    Select Product (or enter manually below)
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      if (e.target.value) {
                        setManualProductName('');
                        setManualBrandName('');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  >
                    <option value="">-- Select a Product --</option>
                    {filteredProducts.map((product) => (
                      <option
                        key={product.id}
                        value={product.id}
                        title={`${product.name} (${product.brand})`}
                      >
                        {truncateText(product.name, 40)} ({truncateText(product.brand, 20)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Manual Entry */}
                <div style={{
                  padding: '12px',
                  backgroundColor: colors.bg,
                  borderRadius: '4px',
                  opacity: selectedProductId ? 0.5 : 1,
                }}>
                  <div style={{ marginBottom: '8px', fontSize: '12px', color: colors.textSecondary }}>
                    Or enter manually:
                  </div>
                  <input
                    type="text"
                    placeholder="Product Name"
                    value={manualProductName}
                    onChange={(e) => {
                      setManualProductName(e.target.value);
                      if (e.target.value) {
                        setSelectedProductId('');
                      }
                    }}
                    disabled={!!selectedProductId}
                    style={{
                      width: '100%',
                      padding: '8px',
                      marginBottom: '8px',
                      backgroundColor: colors.card,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Brand Name (optional)"
                    value={manualBrandName}
                    onChange={(e) => setManualBrandName(e.target.value)}
                    disabled={!!selectedProductId}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: colors.card,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Product Context */}
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                    Product Link or Description (optional)
                  </label>
                  <textarea
                    placeholder="Paste a product URL or describe key features, benefits, unique selling points..."
                    value={productContext}
                    onChange={(e) => setProductContext(e.target.value)}
                    maxLength={1000}
                    style={{
                      width: '100%',
                      minHeight: '70px',
                      padding: '8px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '13px',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                  <div style={{ fontSize: '10px', color: colors.textSecondary, marginTop: '4px', textAlign: 'right' }}>
                    {productContext.length}/1000
                  </div>
                </div>
              </div>

              {/* Audience Intelligence */}
              <div style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: colors.textSecondary, fontWeight: 500 }}>
                  Target Audience
                </h3>

                {/* Persona Selection */}
                <div style={{ marginBottom: '12px' }}>
                  <label
                    style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}
                    title="Select an audience persona to match their language and pain points"
                  >
                    Audience Persona <span style={{ cursor: 'help', opacity: 0.6 }}>ⓘ</span>
                  </label>
                  <select
                    value={selectedPersonaId}
                    onChange={(e) => {
                      setSelectedPersonaId(e.target.value);
                      // Reset pain point selections when persona changes
                      setSelectedPainPointId('');
                      setSelectedPersonaPainPoints([]);
                      setPersonaPreviewExpanded(true);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  >
                    <option value="">-- No specific persona --</option>
                    {audiencePersonas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.times_used ? ` (used ${p.times_used}x)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Persona Preview Card (shows when persona selected) */}
                {selectedPersonaId && (() => {
                  const selectedPersona = audiencePersonas.find(p => p.id === selectedPersonaId);
                  return selectedPersona ? (
                    <div style={{ marginBottom: '12px' }}>
                      <PersonaPreviewCard
                        persona={selectedPersona}
                        selectedPainPoints={selectedPersonaPainPoints}
                        onPainPointsChange={setSelectedPersonaPainPoints}
                        expanded={personaPreviewExpanded}
                        onToggleExpand={() => setPersonaPreviewExpanded(!personaPreviewExpanded)}
                      />
                    </div>
                  ) : null;
                })()}

                {/* Pain Point from Library (show if no persona or as additional option) */}
                {!selectedPersonaId && painPoints.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                      Pain Point Focus (from library)
                    </label>
                    <select
                      value={selectedPainPointId}
                      onChange={(e) => setSelectedPainPointId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        color: colors.text,
                        fontSize: '14px',
                      }}
                    >
                      <option value="">-- Any pain point --</option>
                      {painPoints.map((pp) => (
                        <option key={pp.id} value={pp.id}>
                          {pp.pain_point}
                          {pp.category ? ` (${pp.category})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Use Audience Language Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="useAudienceLanguage"
                    checked={useAudienceLanguage}
                    onChange={(e) => setUseAudienceLanguage(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <label
                    htmlFor="useAudienceLanguage"
                    style={{ fontSize: '12px', color: colors.textSecondary, cursor: 'pointer' }}
                  >
                    Use authentic audience language
                  </label>
                </div>

                {audiencePersonas.length === 0 && (
                  <div style={{ marginTop: '12px', fontSize: '11px', color: colors.textSecondary, fontStyle: 'italic' }}>
                    No personas yet.{' '}
                    <a href="/admin/audience" style={{ color: colors.accent }}>Create one →</a>
                  </div>
                )}
              </div>

              {/* Actor & Style */}
              <div style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: colors.textSecondary, fontWeight: 500 }}>
                  Actor & Style
                </h3>

                {/* Actor/Role */}
                <div style={{ marginBottom: '12px' }}>
                  <label
                    style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}
                    title="Who will perform this skit? Affects dialogue style and visual suggestions."
                  >
                    Actor/Role <span style={{ cursor: 'help', opacity: 0.6 }}>ⓘ</span>
                  </label>
                  <select
                    value={actorType}
                    onChange={(e) => setActorType(e.target.value as ActorType)}
                    title="Select performer type"
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  >
                    {ACTOR_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} title={option.description}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: '4px', fontSize: '11px', color: colors.textSecondary }}>
                    {ACTOR_TYPE_OPTIONS.find(o => o.value === actorType)?.description}
                  </div>
                </div>

                {/* Target Length */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                    Target Length
                  </label>
                  <select
                    value={targetDuration}
                    onChange={(e) => setTargetDuration(e.target.value as TargetDuration)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  >
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: '4px', fontSize: '11px', color: colors.textSecondary }}>
                    {DURATION_OPTIONS.find(o => o.value === targetDuration)?.description}
                  </div>
                </div>

                {/* Content Format */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                    Content Format
                  </label>
                  <select
                    value={contentFormat}
                    onChange={(e) => setContentFormat(e.target.value as ContentFormat)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  >
                    {CONTENT_FORMAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: '4px', fontSize: '11px', color: colors.textSecondary }}>
                    {CONTENT_FORMAT_OPTIONS.find(o => o.value === contentFormat)?.description}
                  </div>
                </div>

                {/* Personality Type (grouped) */}
                <div style={{ marginBottom: '12px' }}>
                  <label
                    style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}
                    title="Choose a comedic persona or archetype to shape the skit's voice and humor style"
                  >
                    Personality Type <span style={{ cursor: 'help', opacity: 0.6 }}>ⓘ</span>
                  </label>
                  <select
                    value={selectedPreset}
                    onChange={(e) => setSelectedPreset(e.target.value)}
                    title="Select comedic persona"
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  >
                    {/* Group presets by energy category */}
                    {(['neutral', 'high_energy', 'deadpan', 'chaotic', 'wholesome'] as const).map((category) => {
                      const categoryPresets = presets.filter(p => p.energy_category === category);
                      if (categoryPresets.length === 0) return null;
                      return (
                        <optgroup key={category} label={ENERGY_CATEGORY_LABELS[category]}>
                          {categoryPresets.map((preset) => (
                            <option key={preset.id} value={preset.id} title={preset.description}>
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  {selectedPreset !== 'NONE' && presets.find(p => p.id === selectedPreset)?.description && (
                    <div style={{ marginTop: '4px', fontSize: '11px', color: colors.textSecondary }}>
                      {presets.find(p => p.id === selectedPreset)?.description}
                    </div>
                  )}
                </div>

                {/* Template */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ fontSize: '12px', color: colors.textSecondary }}>
                      Skit Template (optional)
                    </label>
                    {/* Favorite button for current combo */}
                    <button type="button"
                      onClick={() => toggleFavorite(selectedPreset, selectedTemplate)}
                      title={isFavorited(selectedPreset, selectedTemplate) ? 'Remove from favorites' : 'Add to favorites'}
                      style={{
                        padding: '2px 6px',
                        fontSize: '14px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: isFavorited(selectedPreset, selectedTemplate) ? '#f59e0b' : colors.textSecondary,
                      }}
                    >
                      {isFavorited(selectedPreset, selectedTemplate) ? '★' : '☆'}
                    </button>
                  </div>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  >
                    <option value="">No Template (AI Choice)</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  {selectedTemplate && templates.find(t => t.id === selectedTemplate)?.description && (
                    <div style={{ marginTop: '4px', fontSize: '11px', color: colors.textSecondary }}>
                      {templates.find(t => t.id === selectedTemplate)?.description}
                    </div>
                  )}
                </div>

                {/* Template Favorites Quick Select */}
                {templateFavorites.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '11px', color: colors.textSecondary, textTransform: 'uppercase' }}>
                      Favorite Combos
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {templateFavorites.map((fav) => (
                        <button type="button"
                          key={fav.id}
                          onClick={() => {
                            setSelectedPreset(fav.presetId);
                            setSelectedTemplate(fav.templateId);
                          }}
                          title={fav.name}
                          style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            backgroundColor: (selectedPreset === fav.presetId && selectedTemplate === fav.templateId)
                              ? '#7c3aed' : colors.bg,
                            color: (selectedPreset === fav.presetId && selectedTemplate === fav.templateId)
                              ? 'white' : colors.text,
                            border: `1px solid ${(selectedPreset === fav.presetId && selectedTemplate === fav.templateId)
                              ? '#7c3aed' : colors.border}`,
                            borderRadius: '16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span style={{ color: '#f59e0b' }}>★</span>
                          {truncateText(fav.name, 25)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Advanced Options Toggle */}
              <div>
                <button type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '12px',
                    backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    color: colors.text,
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '10px' }}>
                    ▶
                  </span>
                  Advanced Options
                  {(creativeDirection || unpredictability !== 3 || humorLevel !== 3 || contentEdge !== 'SAFE') && (
                    <span style={{
                      marginLeft: 'auto',
                      padding: '2px 8px',
                      backgroundColor: '#7c3aed',
                      color: 'white',
                      borderRadius: '10px',
                      fontSize: '10px',
                    }}>
                      Customized
                    </span>
                  )}
                </button>
              </div>

              {showAdvanced && (
                <>
                  {/* Creative Direction */}
                  <div style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: '16px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: colors.textSecondary, fontWeight: 500 }}>
                      Creative Direction
                    </h3>
                    <textarea
                      placeholder="Optional: Give specific guidance like 'make it feel like a fever dream' or 'corporate satire vibes' or 'POV: you're the main character'..."
                      value={creativeDirection}
                      onChange={(e) => setCreativeDirection(e.target.value)}
                      maxLength={500}
                      style={{
                        width: '100%',
                        minHeight: '80px',
                        padding: '10px',
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        color: colors.text,
                        fontSize: '13px',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ fontSize: '10px', color: colors.textSecondary, marginTop: '4px', textAlign: 'right' }}>
                      {creativeDirection.length}/500
                    </div>
                  </div>

                  {/* Creative Controls */}
                  <div>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: colors.textSecondary, fontWeight: 500 }}>
                      Creative Controls
                    </h3>

                    {/* Boldness Level */}
                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: colors.textSecondary }}
                        title="How boundary-pushing the content is"
                      >
                        Boldness Level <span style={{ cursor: 'help', opacity: 0.6 }}>ⓘ</span>
                      </label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {CONTENT_EDGE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setContentEdge(option.value)}
                            title={option.description}
                            style={{
                              flex: '1 1 auto',
                              minWidth: '100px',
                              padding: '8px 12px',
                              backgroundColor: contentEdge === option.value ? '#7c3aed' : colors.bg,
                              border: `1px solid ${contentEdge === option.value ? '#7c3aed' : colors.border}`,
                              borderRadius: '6px',
                              color: contentEdge === option.value ? 'white' : colors.text,
                              fontSize: '13px',
                              fontWeight: contentEdge === option.value ? 600 : 400,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
                        {CONTENT_EDGE_OPTIONS.find(o => o.value === contentEdge)?.desc}
                      </div>
                    </div>

                    {/* Plot Style */}
                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: colors.textSecondary }}
                        title="How grounded vs surreal the scenario is"
                      >
                        Plot Style <span style={{ cursor: 'help', opacity: 0.6 }}>ⓘ</span>
                      </label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {UNPREDICTABILITY_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setUnpredictability(option.value)}
                            title={option.description}
                            style={{
                              flex: 1,
                              padding: '8px 4px',
                              backgroundColor: unpredictability === option.value ? '#7c3aed' : colors.bg,
                              border: `1px solid ${unpredictability === option.value ? '#7c3aed' : colors.border}`,
                              borderRadius: '6px',
                              color: unpredictability === option.value ? 'white' : colors.text,
                              fontSize: '11px',
                              fontWeight: unpredictability === option.value ? 600 : 400,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                          >
                            {option.value}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: colors.textSecondary, marginTop: '4px' }}>
                        <span>Grounded</span>
                        <span>Fever Dream</span>
                      </div>
                      <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
                        {UNPREDICTABILITY_OPTIONS.find(o => o.value === unpredictability)?.description}
                      </div>
                    </div>

                    {/* Comedy Intensity */}
                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: colors.textSecondary }}
                        title="How funny or comedic the content is"
                      >
                        Comedy Intensity <span style={{ cursor: 'help', opacity: 0.6 }}>ⓘ</span>
                      </label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {HUMOR_LEVEL_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setHumorLevel(option.value)}
                            title={option.description}
                            style={{
                              flex: 1,
                              padding: '8px 4px',
                              backgroundColor: humorLevel === option.value ? '#7c3aed' : colors.bg,
                              border: `1px solid ${humorLevel === option.value ? '#7c3aed' : colors.border}`,
                              borderRadius: '6px',
                              color: humorLevel === option.value ? 'white' : colors.text,
                              fontSize: '11px',
                              fontWeight: humorLevel === option.value ? 600 : 400,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                          >
                            {option.value}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: colors.textSecondary, marginTop: '4px' }}>
                        <span>Serious</span>
                        <span>Full Comedy</span>
                      </div>
                      <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
                        {HUMOR_LEVEL_OPTIONS.find(o => o.value === humorLevel)?.description}
                      </div>
                    </div>

                    {/* Dialogue Density */}
                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: colors.textSecondary }}
                        title="How much dialogue vs visual storytelling"
                      >
                        Dialogue Density <span style={{ cursor: 'help', opacity: 0.6 }}>ⓘ</span>
                      </label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[
                          { value: 1, label: '1', desc: 'Minimal - Visual first' },
                          { value: 2, label: '2', desc: 'Light - Strategic dialogue' },
                          { value: 3, label: '3', desc: 'Balanced - Mix of both' },
                          { value: 4, label: '4', desc: 'Heavy - Dialogue-driven' },
                          { value: 5, label: '5', desc: 'All Talk - Rapid-fire' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setDialogueDensity(option.value)}
                            title={option.desc}
                            style={{
                              flex: 1,
                              padding: '8px 4px',
                              backgroundColor: dialogueDensity === option.value ? '#7c3aed' : colors.bg,
                              border: `1px solid ${dialogueDensity === option.value ? '#7c3aed' : colors.border}`,
                              borderRadius: '6px',
                              color: dialogueDensity === option.value ? 'white' : colors.text,
                              fontSize: '11px',
                              fontWeight: dialogueDensity === option.value ? 600 : 400,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: colors.textSecondary, marginTop: '4px' }}>
                        <span>Visual</span>
                        <span>All Talk</span>
                      </div>
                      <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
                        {[
                          'Minimal dialogue, heavy visuals and text overlays',
                          'Light dialogue, visual-first storytelling',
                          'Balanced mix of dialogue and action',
                          'Dialogue-driven with visual support',
                          'Rapid-fire dialogue throughout',
                        ][dialogueDensity - 1]}
                      </div>
                    </div>

                    {/* Number of Variations */}
                    <div style={{ marginTop: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                        Number of Variations
                      </label>
                      <select
                        value={variationCount}
                        onChange={(e) => setVariationCount(Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          color: colors.text,
                          fontSize: '14px',
                        }}
                      >
                        <option value={1}>1 (Single)</option>
                        <option value={3}>3 (Recommended)</option>
                        <option value={5}>5 (Maximum)</option>
                      </select>
                      <div style={{
                        fontSize: '11px',
                        color: colors.textSecondary,
                        marginTop: '4px',
                      }}>
                        More variations = more creative options to choose from
                      </div>
                    </div>

                    {/* Character Persona */}
                    <div style={{ marginTop: '16px' }}>
                      <label
                        style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: colors.textSecondary }}
                        title="Select a character archetype to shape the script's voice and personality"
                      >
                        Character Persona <span style={{ cursor: 'help', opacity: 0.6 }}>ⓘ</span>
                      </label>
                      <PersonaSelector
                        value={characterPersona}
                        onChange={setCharacterPersona}
                      />
                    </div>

                    {/* Creator Persona (New Detailed Personas) */}
                    <div style={{ marginTop: '16px' }}>
                      <label
                        style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: colors.textSecondary }}
                        title="Select a detailed TikTok Shop creator persona with specific patterns and style"
                      >
                        Creator Persona <span style={{ cursor: 'help', opacity: 0.6, marginLeft: '4px' }}>NEW</span>
                      </label>
                      <CreatorPersonaSelector
                        value={creatorPersonaId}
                        onChange={setCreatorPersonaId}
                      />
                      {creatorPersonaId && (
                        <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
                          Overrides character persona with detailed creator style
                        </div>
                      )}
                    </div>

                    {/* Presentation Style */}
                    <div style={{ marginTop: '16px' }}>
                      <label
                        style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: colors.textSecondary }}
                        title="Choose how the content is presented to the audience"
                      >
                        Presentation Style <span style={{ cursor: 'help', opacity: 0.6 }}>ⓘ</span>
                      </label>
                      <select
                        value={presentationStyle}
                        onChange={(e) => setPresentationStyle(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          color: colors.text,
                          fontSize: '14px',
                        }}
                      >
                        <option value="">-- Auto (Let AI decide) --</option>
                        {PRESENTATION_STYLES.map((style) => (
                          <option key={style.value} value={style.value} title={style.desc}>
                            {style.label}
                          </option>
                        ))}
                      </select>
                      {presentationStyle && (
                        <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
                          {PRESENTATION_STYLES.find(s => s.value === presentationStyle)?.desc}
                        </div>
                      )}
                    </div>

                    {/* Advanced Creative Controls */}
                    <div style={{ marginTop: '16px' }}>
                      <button
                        type="button"
                        onClick={() => setAdvancedOpen(!advancedOpen)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '8px 12px',
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '6px',
                          color: colors.textSecondary,
                          fontSize: '13px',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ transform: advancedOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '10px' }}>
                          ▶
                        </span>
                        Fine-Tune Controls
                        {(pacing !== 'moderate' || hookStrength !== 'standard' || authenticity !== 'balanced') && (
                          <span style={{
                            marginLeft: 'auto',
                            padding: '2px 8px',
                            backgroundColor: '#7c3aed',
                            color: 'white',
                            borderRadius: '10px',
                            fontSize: '10px',
                          }}>
                            Customized
                          </span>
                        )}
                      </button>

                      {advancedOpen && (
                        <div style={{
                          marginTop: '12px',
                          padding: '12px',
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '6px',
                        }}>
                          {/* Pacing */}
                          <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: colors.textSecondary }}>
                              Pacing
                            </label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {PACING_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => setPacing(option.value)}
                                  title={option.description}
                                  style={{
                                    flex: '1 1 auto',
                                    minWidth: '80px',
                                    padding: '6px 10px',
                                    backgroundColor: pacing === option.value ? '#7c3aed' : colors.card,
                                    border: `1px solid ${pacing === option.value ? '#7c3aed' : colors.border}`,
                                    borderRadius: '4px',
                                    color: pacing === option.value ? 'white' : colors.text,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Hook Strength */}
                          <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: colors.textSecondary }}>
                              Hook Strength
                            </label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {HOOK_STRENGTH_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => setHookStrength(option.value)}
                                  title={option.description}
                                  style={{
                                    flex: '1 1 auto',
                                    minWidth: '80px',
                                    padding: '6px 10px',
                                    backgroundColor: hookStrength === option.value ? '#7c3aed' : colors.card,
                                    border: `1px solid ${hookStrength === option.value ? '#7c3aed' : colors.border}`,
                                    borderRadius: '4px',
                                    color: hookStrength === option.value ? 'white' : colors.text,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Authenticity */}
                          <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: colors.textSecondary }}>
                              Authenticity Feel
                            </label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {AUTHENTICITY_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => setAuthenticity(option.value)}
                                  title={option.description}
                                  style={{
                                    flex: '1 1 auto',
                                    minWidth: '80px',
                                    padding: '6px 10px',
                                    backgroundColor: authenticity === option.value ? '#7c3aed' : colors.card,
                                    border: `1px solid ${authenticity === option.value ? '#7c3aed' : colors.border}`,
                                    borderRadius: '4px',
                                    color: authenticity === option.value ? 'white' : colors.text,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Credits Display */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: credits?.isUnlimited || (credits?.remaining ?? 0) === -1
                  ? 'rgba(45, 212, 191, 0.1)'
                  : (credits?.remaining ?? 0) === 0
                    ? 'rgba(239, 68, 68, 0.1)'
                    : (credits?.remaining ?? 0) <= 5
                      ? 'rgba(245, 158, 11, 0.1)'
                      : colors.bg,
                border: `1px solid ${
                  credits?.isUnlimited || (credits?.remaining ?? 0) === -1
                    ? 'rgba(45, 212, 191, 0.2)'
                    : (credits?.remaining ?? 0) === 0
                      ? 'rgba(239, 68, 68, 0.2)'
                      : (credits?.remaining ?? 0) <= 5
                        ? 'rgba(245, 158, 11, 0.2)'
                        : colors.border
                }`,
                borderRadius: '6px',
                marginTop: '8px',
              }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={
                    credits?.isUnlimited || (credits?.remaining ?? 0) === -1
                      ? '#2dd4bf'
                      : (credits?.remaining ?? 0) === 0
                        ? '#ef4444'
                        : (credits?.remaining ?? 0) <= 5
                          ? '#f59e0b'
                          : colors.text
                  }
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: credits?.isUnlimited || (credits?.remaining ?? 0) === -1
                    ? '#2dd4bf'
                    : (credits?.remaining ?? 0) === 0
                      ? '#ef4444'
                      : (credits?.remaining ?? 0) <= 5
                        ? '#f59e0b'
                        : colors.text,
                }}>
                  {credits?.isUnlimited || (credits?.remaining ?? 0) === -1
                    ? 'Unlimited credits'
                    : `${credits?.remaining ?? 0} credit${(credits?.remaining ?? 0) !== 1 ? 's' : ''} remaining`}
                </span>
                {!hasCredits && (
                  <Link href="/upgrade" style={{ fontSize: '12px', color: colors.accent, marginLeft: '8px' }}>
                    Upgrade
                  </Link>
                )}
              </div>

              {/* Generate Button */}
              <button type="button"
                onClick={() => handleGenerate()}
                disabled={generating || !hasCredits}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: generating || !hasCredits ? colors.border : '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: generating || !hasCredits ? 'not-allowed' : 'pointer',
                  marginTop: '8px',
                  minHeight: '52px',
                }}
              >
                {generating
                  ? `Generating ${variationCount} Variation${variationCount > 1 ? 's' : ''} & Scoring...`
                  : !hasCredits
                    ? 'No Credits - Upgrade to Continue'
                    : `Generate ${variationCount > 1 ? `${variationCount} Variations` : 'Skit'}`}
              </button>
              {!generating && hasCredits && (
                <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '11px', color: colors.textSecondary }}>
                  <kbd style={{ padding: '1px 4px', backgroundColor: colors.bg, borderRadius: '2px', border: `1px solid ${colors.border}` }}>Ctrl</kbd>+<kbd style={{ padding: '1px 4px', backgroundColor: colors.bg, borderRadius: '2px', border: `1px solid ${colors.border}` }}>Enter</kbd> to generate
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column: Results */}
        <div style={{
          backgroundColor: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
          padding: '20px',
          flex: '1 1 400px',
          minWidth: '320px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: colors.text }}>Result</h2>
              {/* Undo Button */}
              {undoStack.length > 0 && (
                <button type="button"
                  onClick={undoEdit}
                  title={`Undo last edit (Ctrl+Z) - ${undoStack.length} action${undoStack.length > 1 ? 's' : ''} available`}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    backgroundColor: colors.bg,
                    color: colors.textSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  ↩ Undo ({undoStack.length})
                </button>
              )}
            </div>

            {/* Generation History Dropdown */}
            {generationHistory.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button type="button"
                  onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    backgroundColor: colors.bg,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  📜 History ({generationHistory.length})
                  <span style={{ transform: showHistoryDropdown ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
                </button>

                {showHistoryDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    width: '280px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    backgroundColor: colors.card,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 100,
                  }}>
                    <div style={{ padding: '8px', borderBottom: `1px solid ${colors.border}`, fontSize: '11px', color: colors.textSecondary }}>
                      Session History (clears on refresh)
                    </div>
                    {generationHistory.map((item) => {
                      const score = item.result.variations?.[0]?.ai_score?.overall_score
                        || item.result.ai_score?.overall_score;
                      return (
                        <button type="button"
                          key={item.id}
                          onClick={() => loadFromHistory(item)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            textAlign: 'left',
                            backgroundColor: 'transparent',
                            border: 'none',
                            borderBottom: `1px solid ${colors.border}`,
                            cursor: 'pointer',
                            color: colors.text,
                          }}
                        >
                          <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '2px' }}>
                            {truncateText(item.productName, 30)}
                          </div>
                          <div style={{ fontSize: '11px', color: colors.textSecondary, display: 'flex', gap: '8px' }}>
                            <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                            {score && (
                              <span style={{
                                padding: '1px 4px',
                                borderRadius: '3px',
                                backgroundColor: score >= 7 ? '#d1fae5' : score >= 5 ? '#fef3c7' : '#fee2e2',
                                color: score >= 7 ? '#059669' : score >= 5 ? '#d97706' : '#dc2626',
                              }}>
                                {score.toFixed(1)}
                              </span>
                            )}
                            <span>{item.result.variations?.length || 1} var</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div style={{ marginBottom: '16px' }}>
              <ApiErrorPanel
                error={error}
                onDismiss={() => setError(null)}
              />
              {/* Actionable error message and retry button */}
              {(() => {
                const { action } = getActionableErrorMessage(error);
                const canRetry = error.error_code !== 'VALIDATION_ERROR' &&
                                 error.error_code !== 'UNAUTHORIZED' &&
                                 !isRateLimited;
                return (
                  <div style={{
                    marginTop: '8px',
                    padding: '12px',
                    backgroundColor: colors.bg,
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}>
                    <span style={{ fontSize: '12px', color: colors.textSecondary }}>
                      {action}
                    </span>
                    {canRetry && retryPayload && (
                      <button type="button"
                        onClick={handleRetry}
                        disabled={generating}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: generating ? colors.border : '#7c3aed',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: generating ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {generating ? 'Retrying...' : 'Retry'}
                      </button>
                    )}
                    {isRateLimited && rateLimitResetTime && (
                      <span style={{ fontSize: '11px', color: '#dc2626' }}>
                        Available in {Math.max(0, Math.ceil((rateLimitResetTime.getTime() - Date.now()) / 1000))}s
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Empty State - before generating */}
          {!result && !error && !generating && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>🎬</div>
              <div style={{ fontSize: '16px', fontWeight: 500, color: colors.text, marginBottom: '8px' }}>
                Ready to Generate
              </div>
              <div style={{ fontSize: '13px', color: colors.textSecondary, marginBottom: '16px' }}>
                Select a product and click Generate to create skit variations
              </div>
              <div style={{
                padding: '10px 16px',
                backgroundColor: colors.bg,
                borderRadius: '6px',
                display: 'inline-block',
                fontSize: '12px',
                color: colors.textSecondary,
              }}>
                Tip: Press <kbd style={{ padding: '2px 6px', backgroundColor: colors.card, borderRadius: '3px', border: `1px solid ${colors.border}` }}>Ctrl</kbd> + <kbd style={{ padding: '2px 6px', backgroundColor: colors.card, borderRadius: '3px', border: `1px solid ${colors.border}` }}>Enter</kbd> to generate quickly
              </div>
            </div>
          )}

          {/* Generating State */}
          {generating && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{
                width: '48px',
                height: '48px',
                margin: '0 auto 16px',
                border: '3px solid #7c3aed',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ fontSize: '14px', fontWeight: 500, color: colors.text, marginBottom: '4px' }}>
                Generating {variationCount} Variation{variationCount > 1 ? 's' : ''} & Scoring...
              </div>
              <div style={{ fontSize: '12px', color: colors.textSecondary }}>
                Creating distinct creative approaches for your product
              </div>
            </div>
          )}

          {result && (() => {
            // Get current variation data
            const variations = result.variations || [];
            const hasVariations = variations.length > 1;
            const currentVariation = hasVariations ? variations[selectedVariationIndex] : null;
            // Use localSkit if modified, otherwise use variation/result skit
            const currentSkit = localSkit || currentVariation?.skit || result.skit;
            const currentScore = currentVariation?.ai_score || result.ai_score;
            const currentRiskTier = currentVariation?.risk_tier_applied || result.risk_tier_applied;
            const currentRiskScore = currentVariation?.risk_score ?? result.risk_score;
            const currentRiskFlags = currentVariation?.risk_flags || result.risk_flags;

            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Variation Selector */}
              {hasVariations && (
                <div style={{
                  padding: '12px',
                  backgroundColor: colors.bg,
                  borderRadius: '8px',
                  marginBottom: '4px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: colors.textSecondary, marginBottom: '8px', textTransform: 'uppercase' }}>
                    Variations ({variations.length})
                  </div>
                  <div className="variation-tabs" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '4px' }}>
                    {variations.map((v, idx) => {
                      const score = v.ai_score?.overall_score;
                      const isSelected = idx === selectedVariationIndex;
                      return (
                        <button type="button"
                          key={idx}
                          onClick={() => {
                            setSelectedVariationIndex(idx);
                            setAiScore(v.ai_score || null);
                          }}
                          style={{
                            padding: '10px 14px',
                            backgroundColor: isSelected ? '#7c3aed' : colors.card,
                            color: isSelected ? 'white' : colors.text,
                            border: `2px solid ${isSelected ? '#7c3aed' : colors.border}`,
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: isSelected ? 600 : 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            minHeight: '44px',
                            flexShrink: 0,
                          }}
                        >
                          <span>V{idx + 1}</span>
                          {score !== undefined && (
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' :
                                (score < 5 ? '#fee2e2' : score < 7 ? '#fef3c7' : '#d1fae5'),
                              color: isSelected ? 'white' :
                                (score < 5 ? '#dc2626' : score < 7 ? '#d97706' : '#059669'),
                            }}>
                              {score.toFixed(1)}
                            </span>
                          )}
                          {idx === 0 && <span style={{ fontSize: '10px', opacity: 0.7 }}>Best</span>}
                        </button>
                      );
                    })}
                    {/* Generate More button */}
                    {variations.length < 5 && (
                      <button type="button"
                        onClick={() => handleGenerate()}
                        disabled={generating}
                        title="Generate more variations"
                        style={{
                          padding: '8px 14px',
                          backgroundColor: generating ? colors.border : colors.bg,
                          color: generating ? colors.textSecondary : '#7c3aed',
                          border: `2px dashed ${generating ? colors.border : '#7c3aed'}`,
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: generating ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {generating ? '...' : '+ More'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Score Summary + Actions Bar */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '12px',
                backgroundColor: colors.bg,
                borderRadius: '8px',
                alignItems: 'center',
              }}>
                {/* Score Summary */}
                {currentScore && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      backgroundColor: currentScore.overall_score >= 7 ? '#d1fae5' :
                        currentScore.overall_score >= 5 ? '#fef3c7' : '#fee2e2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '18px',
                      color: currentScore.overall_score >= 7 ? '#059669' :
                        currentScore.overall_score >= 5 ? '#d97706' : '#dc2626',
                    }}>
                      {currentScore.overall_score.toFixed(1)}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {[
                        { key: 'hook_strength', label: 'Hook', value: currentScore.hook_strength },
                        { key: 'humor_level', label: 'Humor', value: currentScore.humor_level },
                        { key: 'virality_potential', label: 'Viral', value: currentScore.virality_potential },
                        { key: 'audience_language', label: 'Voice', value: currentScore.audience_language },
                        { key: 'clarity', label: 'Clear', value: currentScore.clarity },
                      ].map(({ key, label, value }) => (
                        <span
                          key={key}
                          title={`${label}: ${value}/10`}
                          style={{
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            backgroundColor: value >= 7 ? '#d1fae5' : value >= 5 ? '#fef3c7' : '#fee2e2',
                            color: value >= 7 ? '#059669' : value >= 5 ? '#92400e' : '#dc2626',
                          }}
                        >
                          {label} {value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Copy Full Script Button */}
                <button type="button"
                  onClick={() => {
                    const script = `HOOK: ${currentSkit.hook_line || '(No hook)'}

${(currentSkit.beats || []).map((b, i) => `SCENE ${i + 1} [${b.t || '0:00'}]
Action: ${b.action || '(No action)'}${b.dialogue ? `\nDialogue: "${b.dialogue}"` : ''}${b.on_screen_text ? `\nText: ${b.on_screen_text}` : ''}`).join('\n\n') || '(No beats)'}

CTA: ${currentSkit.cta_line || '(No CTA)'}
Overlay: ${currentSkit.cta_overlay || '(No overlay)'}

B-ROLL IDEAS:
${(currentSkit.b_roll || []).map(b => `- ${b}`).join('\n') || '(No B-roll suggestions)'}

OVERLAY IDEAS:
${(currentSkit.overlays || []).map(o => `- ${o}`).join('\n') || '(No overlay suggestions)'}`;
                    navigator.clipboard.writeText(script);
                    setCopiedField('script');
                    setTimeout(() => setCopiedField(null), 2000);
                  }}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: copiedField === 'script' ? '#10b981' : '#7c3aed',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {copiedField === 'script' ? '✓ Copied!' : '📋 Copy Full Script'}
                </button>
              </div>

              {/* Metadata badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: currentRiskTier === 'SAFE' ? '#d1fae5' :
                    currentRiskTier === 'BALANCED' ? '#fef3c7' : '#fce7f3',
                  color: currentRiskTier === 'SAFE' ? '#065f46' :
                    currentRiskTier === 'BALANCED' ? '#92400e' : '#9d174d',
                }}>
                  {currentRiskTier}
                </span>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  backgroundColor: colors.bg,
                  color: colors.textSecondary,
                }}>
                  Risk Score: {currentRiskScore ?? 'N/A'}
                </span>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  backgroundColor: colors.bg,
                  color: colors.textSecondary,
                }}>
                  Humor: {HUMOR_LEVEL_OPTIONS.find(o => o.value === (result.intensity_applied ? intensityToHumorLevel(result.intensity_applied) : humorLevel))?.label || `Level ${humorLevel}`}
                </span>
                {result.preset_name && result.preset_id !== 'NONE' && (
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    backgroundColor: '#ede9fe',
                    color: '#5b21b6',
                  }}>
                    {result.preset_name}
                  </span>
                )}
                {result.template_id && (
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    backgroundColor: '#dbeafe',
                    color: '#1e40af',
                  }}>
                    Template: {templates.find(t => t.id === result.template_id)?.name || result.template_id}
                  </span>
                )}
              </div>

              {/* Warnings */}
              {(currentRiskFlags?.length ?? 0) > 0 && (
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#92400e',
                }}>
                  {currentRiskFlags?.length} risk flag(s) detected
                </div>
              )}
              {(result.budget_clamped || result.preset_intensity_clamped) && (
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: '#e0e7ff',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#3730a3',
                }}>
                  {result.preset_intensity_clamped ? 'Intensity adjusted to fit character range' : 'Intensity clamped for stability'}
                </div>
              )}
              {result.template_validation && !result.template_validation.valid && (
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#92400e',
                }}>
                  Template validation: {result.template_validation.issues?.join(', ')}
                </div>
              )}

              {/* Hook Line */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>Hook Line</span>
                    {isModified && <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: '4px' }}>Modified</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {editingSection !== 'hook' && (
                      <button type="button"
                        onClick={() => startEditing('hook', currentSkit.hook_line)}
                        style={{
                          padding: '2px 8px',
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          color: colors.text,
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <button type="button"
                      onClick={() => copyToClipboard(currentSkit.hook_line, 'hook')}
                      style={{
                        padding: '2px 8px',
                        backgroundColor: copiedField === 'hook' ? '#d3f9d8' : colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        color: colors.text,
                      }}
                    >
                      {copiedField === 'hook' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                {editingSection === 'hook' ? (
                  <div style={{
                    padding: '12px',
                    backgroundColor: colors.bg,
                    borderRadius: '4px',
                    border: `2px solid #7c3aed`,
                  }}>
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '60px',
                        padding: '8px',
                        backgroundColor: colors.card,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        color: colors.text,
                        fontSize: '14px',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button type="button"
                        onClick={() => saveEdit('hook')}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#059669',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Save
                      </button>
                      <button type="button"
                        onClick={() => improveSection('hook', currentSkit.hook_line)}
                        disabled={improvingSection}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: improvingSection ? colors.border : '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: improvingSection ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {improvingSection ? 'Improving...' : 'AI Improve'}
                      </button>
                      <button type="button"
                        onClick={cancelEditing}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'transparent',
                          color: colors.textSecondary,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '12px',
                    backgroundColor: colors.bg,
                    borderRadius: '4px',
                    fontSize: '14px',
                    color: '#ffffff',
                    fontStyle: 'italic',
                  }}>
                    {currentSkit.hook_line}
                  </div>
                )}
              </div>

              {/* Scenes */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>Scenes ({currentSkit.beats?.length ?? 0})</span>
                    {/* Total reading time estimate */}
                    {currentSkit.beats && currentSkit.beats.length > 0 && (() => {
                      const totalDialogue = currentSkit.beats
                        .map(b => (b.dialogue || '') + ' ' + (b.action || ''))
                        .join(' ');
                      const totalSecs = estimateReadingTime(totalDialogue);
                      const targetSecs = targetDuration === 'quick' ? 20 : targetDuration === 'standard' ? 45 : targetDuration === 'extended' ? 60 : 90;
                      const isOverTarget = totalSecs > targetSecs + 10;
                      return (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: isOverTarget ? '#fee2e2' : colors.bg,
                            color: isOverTarget ? '#dc2626' : colors.textSecondary,
                          }}
                          title={isOverTarget ? `Script may be too long for ${targetDuration} format (target: ${targetSecs}s)` : `Estimated speaking time`}
                        >
                          ~{totalSecs}s {isOverTarget && '⚠️'}
                        </span>
                      );
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button type="button"
                      onClick={addBeat}
                      style={{
                        padding: '2px 8px',
                        backgroundColor: '#059669',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        color: 'white',
                      }}
                    >
                      + Add Scene
                    </button>
                    <button type="button"
                      onClick={() => copyToClipboard(
                        (currentSkit.beats || []).map(b => `[${b.t}] ${b.action}${b.dialogue ? `\n"${b.dialogue}"` : ''}${b.on_screen_text ? `\n(Text: ${b.on_screen_text})` : ''}`).join('\n\n'),
                        'scenes'
                      )}
                      style={{
                        padding: '2px 8px',
                        backgroundColor: copiedField === 'scenes' ? '#d3f9d8' : colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        color: colors.text,
                      }}
                    >
                      {copiedField === 'scenes' ? 'Copied!' : 'Copy All'}
                    </button>
                  </div>
                </div>
                <div style={{
                  backgroundColor: colors.bg,
                  borderRadius: '4px',
                  padding: '8px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                }}>
                  {/* Empty beats state */}
                  {(!currentSkit.beats || currentSkit.beats.length === 0) && (
                    <div style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: colors.textSecondary,
                      fontSize: '13px',
                    }}>
                      <div style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.5 }}>📝</div>
                      No scenes yet. Click &quot;+ Add Scene&quot; to create the first one.
                    </div>
                  )}
                  {(currentSkit.beats || []).map((beat, i) => (
                    <div key={i} style={{
                      padding: '8px',
                      borderBottom: i < currentSkit.beats.length - 1 ? `1px solid ${colors.border}` : 'none',
                      position: 'relative',
                    }}>
                      {editingSection === `beat-${i}` ? (
                        <div style={{
                          padding: '12px',
                          backgroundColor: colors.card,
                          borderRadius: '4px',
                          border: `2px solid #7c3aed`,
                        }}>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>Action</label>
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              style={{
                                width: '100%',
                                minHeight: '60px',
                                padding: '8px',
                                backgroundColor: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '4px',
                                color: colors.text,
                                fontSize: '13px',
                                resize: 'vertical',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit',
                              }}
                            />
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>Dialogue (optional)</label>
                            <input
                              type="text"
                              value={editDialogue}
                              onChange={(e) => setEditDialogue(e.target.value)}
                              placeholder="What the character says..."
                              style={{
                                width: '100%',
                                padding: '8px',
                                backgroundColor: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '4px',
                                color: colors.text,
                                fontSize: '13px',
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '4px' }}>On-screen Text (optional)</label>
                            <input
                              type="text"
                              value={editOnScreenText}
                              onChange={(e) => setEditOnScreenText(e.target.value)}
                              placeholder="Text overlay..."
                              style={{
                                width: '100%',
                                padding: '8px',
                                backgroundColor: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '4px',
                                color: colors.text,
                                fontSize: '13px',
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="button"
                              onClick={() => saveEdit(`beat-${i}`)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#059669',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              Save
                            </button>
                            <button type="button"
                              onClick={() => improveSection(`beat-${i}`, beat.action)}
                              disabled={improvingSection}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: improvingSection ? colors.border : '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: improvingSection ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {improvingSection ? 'Improving...' : 'AI Improve'}
                            </button>
                            <button type="button"
                              onClick={cancelEditing}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: 'transparent',
                                color: colors.textSecondary,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed', marginBottom: '4px' }}>
                              [{beat.t}]
                            </div>
                            <div style={{ display: 'flex', gap: '2px' }}>
                              <button type="button"
                                onClick={() => moveBeat(i, 'up')}
                                disabled={i === 0}
                                title="Move up"
                                style={{
                                  padding: '2px 6px',
                                  backgroundColor: 'transparent',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  cursor: i === 0 ? 'not-allowed' : 'pointer',
                                  color: i === 0 ? colors.border : colors.text,
                                }}
                              >
                                ▲
                              </button>
                              <button type="button"
                                onClick={() => moveBeat(i, 'down')}
                                disabled={i === currentSkit.beats.length - 1}
                                title="Move down"
                                style={{
                                  padding: '2px 6px',
                                  backgroundColor: 'transparent',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  cursor: i === currentSkit.beats.length - 1 ? 'not-allowed' : 'pointer',
                                  color: i === currentSkit.beats.length - 1 ? colors.border : colors.text,
                                }}
                              >
                                ▼
                              </button>
                              <button type="button"
                                onClick={() => startEditing(`beat-${i}`, beat.action, beat.dialogue, beat.on_screen_text)}
                                title="Edit beat"
                                style={{
                                  padding: '2px 6px',
                                  backgroundColor: 'transparent',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                  color: colors.text,
                                }}
                              >
                                ✏️
                              </button>
                              <button type="button"
                                onClick={() => deleteBeat(i)}
                                disabled={currentSkit.beats.length <= 1}
                                title="Delete beat"
                                style={{
                                  padding: '2px 6px',
                                  backgroundColor: 'transparent',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  cursor: currentSkit.beats.length <= 1 ? 'not-allowed' : 'pointer',
                                  color: currentSkit.beats.length <= 1 ? colors.border : '#ef4444',
                                }}
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                          <div style={{ fontSize: '13px', color: colors.text, marginBottom: beat.dialogue ? '4px' : 0 }}>
                            {beat.action}
                          </div>
                          {beat.dialogue && (
                            <div style={{ fontSize: '13px', color: '#059669', fontStyle: 'italic' }}>
                              &quot;{beat.dialogue}&quot;
                            </div>
                          )}
                          {beat.on_screen_text && (
                            <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '4px' }}>
                              Text: {beat.on_screen_text}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Total Duration Summary */}
                {currentSkit.beats && currentSkit.beats.length > 0 && (() => {
                  // Parse timestamps and sum durations
                  let totalSeconds = 0;
                  currentSkit.beats.forEach(beat => {
                    const match = beat.t?.match(/(\d+):(\d+)-(\d+):(\d+)/);
                    if (match) {
                      const endSec = parseInt(match[3]) * 60 + parseInt(match[4]);
                      totalSeconds = Math.max(totalSeconds, endSec);
                    }
                  });
                  const targetSecs = targetDuration === 'quick' ? 20 : targetDuration === 'standard' ? 45 : targetDuration === 'extended' ? 60 : 90;
                  const isOverTarget = totalSeconds > targetSecs + 10;
                  return totalSeconds > 0 ? (
                    <div style={{
                      marginTop: '8px',
                      padding: '6px 10px',
                      backgroundColor: isOverTarget ? '#fef2f2' : colors.bg,
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: isOverTarget ? '#dc2626' : colors.textSecondary,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <span>Total Duration: <strong>{Math.floor(totalSeconds / 60)}:{(totalSeconds % 60).toString().padStart(2, '0')}</strong></span>
                      <span>Target: {targetSecs}s {isOverTarget && '⚠️ Over target'}</span>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* CTA */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>CTA</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {editingSection !== 'cta' && editingSection !== 'cta_overlay' && (
                      <button type="button"
                        onClick={() => startEditing('cta', currentSkit.cta_line)}
                        style={{
                          padding: '2px 8px',
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          color: colors.text,
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <button type="button"
                      onClick={() => copyToClipboard(`${currentSkit.cta_line}\n[Overlay: ${currentSkit.cta_overlay}]`, 'cta')}
                      style={{
                        padding: '2px 8px',
                        backgroundColor: copiedField === 'cta' ? '#d3f9d8' : colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        color: colors.text,
                      }}
                    >
                      {copiedField === 'cta' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                {editingSection === 'cta' ? (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#fef3c7',
                    borderRadius: '4px',
                    border: `2px solid #7c3aed`,
                  }}>
                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', display: 'block', marginBottom: '4px' }}>CTA Line</label>
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'white',
                          border: `1px solid #d97706`,
                          borderRadius: '4px',
                          color: '#92400e',
                          fontSize: '14px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button"
                        onClick={() => saveEdit('cta')}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#059669',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Save
                      </button>
                      <button type="button"
                        onClick={() => improveSection('cta', currentSkit.cta_line)}
                        disabled={improvingSection}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: improvingSection ? colors.border : '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: improvingSection ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {improvingSection ? 'Improving...' : 'AI Improve'}
                      </button>
                      <button type="button"
                        onClick={cancelEditing}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'transparent',
                          color: '#92400e',
                          border: `1px solid #d97706`,
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #d97706' }}>
                      <div style={{ color: '#b45309', fontSize: '11px', marginBottom: '4px' }}>
                        Overlay: {currentSkit.cta_overlay}
                        <button type="button"
                          onClick={() => {
                            cancelEditing();
                            startEditing('cta_overlay', currentSkit.cta_overlay);
                          }}
                          style={{
                            marginLeft: '8px',
                            padding: '2px 6px',
                            backgroundColor: 'transparent',
                            border: `1px solid #d97706`,
                            borderRadius: '3px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            color: '#b45309',
                          }}
                        >
                          Edit Overlay
                        </button>
                      </div>
                    </div>
                  </div>
                ) : editingSection === 'cta_overlay' ? (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#fef3c7',
                    borderRadius: '4px',
                    border: `2px solid #7c3aed`,
                  }}>
                    <div style={{ color: '#92400e', marginBottom: '8px', fontSize: '14px' }}>
                      {currentSkit.cta_line}
                      <button type="button"
                        onClick={() => {
                          cancelEditing();
                          startEditing('cta', currentSkit.cta_line);
                        }}
                        style={{
                          marginLeft: '8px',
                          padding: '2px 6px',
                          backgroundColor: 'transparent',
                          border: `1px solid #d97706`,
                          borderRadius: '3px',
                          fontSize: '10px',
                          cursor: 'pointer',
                          color: '#92400e',
                        }}
                      >
                        Edit Line
                      </button>
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#b45309', display: 'block', marginBottom: '4px' }}>Overlay Text</label>
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        maxLength={40}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'white',
                          border: `1px solid #d97706`,
                          borderRadius: '4px',
                          color: '#b45309',
                          fontSize: '12px',
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ fontSize: '10px', color: '#92400e', marginTop: '2px' }}>{editValue.length}/40 characters</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button"
                        onClick={() => saveEdit('cta_overlay')}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#059669',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Save
                      </button>
                      <button type="button"
                        onClick={() => improveSection('cta_overlay', currentSkit.cta_overlay)}
                        disabled={improvingSection}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: improvingSection ? colors.border : '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: improvingSection ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {improvingSection ? 'Improving...' : 'AI Improve'}
                      </button>
                      <button type="button"
                        onClick={cancelEditing}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'transparent',
                          color: '#92400e',
                          border: `1px solid #d97706`,
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#fef3c7',
                    borderRadius: '4px',
                  }}>
                    <div style={{ color: '#92400e', marginBottom: '4px', fontSize: '14px' }}>{currentSkit.cta_line}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#b45309', fontSize: '11px' }}>Overlay: {currentSkit.cta_overlay}</span>
                      {/* Character count warning for overlay */}
                      {(() => {
                        const warning = getOverlayCharWarning(currentSkit.cta_overlay, 40);
                        if (warning) {
                          return (
                            <span style={{
                              fontSize: '10px',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              backgroundColor: '#fee2e2',
                              color: '#dc2626',
                            }} title="TikTok overlays should be under 40 characters">
                              {currentSkit.cta_overlay.length}/40 ⚠️
                            </span>
                          );
                        }
                        return (
                          <span style={{ fontSize: '10px', color: '#d97706' }}>
                            {currentSkit.cta_overlay.length}/40
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* B-Roll & Overlays */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {/* B-Roll */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>
                      B-Roll ({currentSkit.b_roll.length})
                    </span>
                    <button type="button"
                      onClick={addBrollItem}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: '#059669',
                        border: 'none',
                        borderRadius: '3px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        color: 'white',
                      }}
                    >
                      + Add
                    </button>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: colors.bg, borderRadius: '4px', fontSize: '12px' }}>
                    {currentSkit.b_roll.map((item, i) => (
                      <div key={i} style={{ marginBottom: i < currentSkit.b_roll.length - 1 ? '8px' : 0 }}>
                        {editingSection === `broll-${i}` ? (
                          <div style={{
                            padding: '8px',
                            backgroundColor: colors.card,
                            borderRadius: '4px',
                            border: `2px solid #7c3aed`,
                          }}>
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '6px',
                                backgroundColor: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '4px',
                                color: colors.text,
                                fontSize: '12px',
                                boxSizing: 'border-box',
                                marginBottom: '8px',
                              }}
                            />
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button type="button"
                                onClick={() => saveEdit(`broll-${i}`)}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#059669',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                }}
                              >
                                Save
                              </button>
                              <button type="button"
                                onClick={() => improveSection(`broll-${i}`, item)}
                                disabled={improvingSection}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: improvingSection ? colors.border : '#3b82f6',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  cursor: improvingSection ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {improvingSection ? '...' : 'AI'}
                              </button>
                              <button type="button"
                                onClick={cancelEditing}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: 'transparent',
                                  color: colors.textSecondary,
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ color: colors.textSecondary, flex: 1 }}>
                              {i + 1}. {item}
                            </div>
                            <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
                              <button type="button"
                                onClick={() => startEditing(`broll-${i}`, item)}
                                style={{
                                  padding: '2px 4px',
                                  backgroundColor: 'transparent',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '2px',
                                  fontSize: '9px',
                                  cursor: 'pointer',
                                  color: colors.text,
                                }}
                              >
                                ✏️
                              </button>
                              <button type="button"
                                onClick={() => deleteBrollItem(i)}
                                style={{
                                  padding: '2px 4px',
                                  backgroundColor: 'transparent',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '2px',
                                  fontSize: '9px',
                                  cursor: 'pointer',
                                  color: '#ef4444',
                                }}
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Overlays */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>
                      Overlays ({currentSkit.overlays.length})
                    </span>
                    <button type="button"
                      onClick={addOverlayItem}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: '#059669',
                        border: 'none',
                        borderRadius: '3px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        color: 'white',
                      }}
                    >
                      + Add
                    </button>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: colors.bg, borderRadius: '4px', fontSize: '12px' }}>
                    {currentSkit.overlays.map((item, i) => (
                      <div key={i} style={{ marginBottom: i < currentSkit.overlays.length - 1 ? '8px' : 0 }}>
                        {editingSection === `overlay-${i}` ? (
                          <div style={{
                            padding: '8px',
                            backgroundColor: colors.card,
                            borderRadius: '4px',
                            border: `2px solid #7c3aed`,
                          }}>
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              maxLength={50}
                              style={{
                                width: '100%',
                                padding: '6px',
                                backgroundColor: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '4px',
                                color: colors.text,
                                fontSize: '12px',
                                boxSizing: 'border-box',
                                marginBottom: '4px',
                              }}
                            />
                            <div style={{ fontSize: '9px', color: colors.textSecondary, marginBottom: '8px' }}>{editValue.length}/50</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button type="button"
                                onClick={() => saveEdit(`overlay-${i}`)}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#059669',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                }}
                              >
                                Save
                              </button>
                              <button type="button"
                                onClick={() => improveSection(`overlay-${i}`, item)}
                                disabled={improvingSection}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: improvingSection ? colors.border : '#3b82f6',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  cursor: improvingSection ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {improvingSection ? '...' : 'AI'}
                              </button>
                              <button type="button"
                                onClick={cancelEditing}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: 'transparent',
                                  color: colors.textSecondary,
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ color: colors.textSecondary }}>{i + 1}. {item}</span>
                              {/* Character count warning */}
                              {item.length > 40 && (
                                <span style={{
                                  marginLeft: '6px',
                                  fontSize: '9px',
                                  padding: '1px 3px',
                                  borderRadius: '2px',
                                  backgroundColor: '#fee2e2',
                                  color: '#dc2626',
                                }} title="Overlay text too long">
                                  {item.length}ch
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
                              <button type="button"
                                onClick={() => startEditing(`overlay-${i}`, item)}
                                style={{
                                  padding: '2px 4px',
                                  backgroundColor: 'transparent',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '2px',
                                  fontSize: '9px',
                                  cursor: 'pointer',
                                  color: colors.text,
                                }}
                              >
                                ✏️
                              </button>
                              <button type="button"
                                onClick={() => deleteOverlayItem(i)}
                                style={{
                                  padding: '2px 4px',
                                  backgroundColor: 'transparent',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '2px',
                                  fontSize: '9px',
                                  cursor: 'pointer',
                                  color: '#ef4444',
                                }}
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Export Actions */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {/* Copy Full Skit */}
                <button type="button"
                  onClick={() => copyToClipboard(
                    `HOOK: ${currentSkit.hook_line}\n\n` +
                    `SCENES:\n${currentSkit.beats.map(b => `[${b.t}] ${b.action}${b.dialogue ? `\nDialogue: "${b.dialogue}"` : ''}${b.on_screen_text ? `\nText: ${b.on_screen_text}` : ''}`).join('\n\n')}\n\n` +
                    `CTA: ${currentSkit.cta_line}\nOverlay: ${currentSkit.cta_overlay}\n\n` +
                    `B-ROLL:\n${currentSkit.b_roll.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\n` +
                    `OVERLAYS:\n${currentSkit.overlays.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
                    'full'
                  )}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: copiedField === 'full' ? '#d3f9d8' : colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: colors.text,
                    fontWeight: 500,
                  }}
                >
                  {copiedField === 'full' ? 'Copied Full Skit!' : 'Copy Full Skit'}
                </button>

                {/* Export as JSON */}
                <button type="button"
                  onClick={() => {
                    const product = selectedProductId ? products.find(p => p.id === selectedProductId) : null;
                    const productName = product?.name || manualProductName || 'Product';
                    const exportData = {
                      title: productName ? `Skit for ${productName}` : 'Untitled Skit',
                      product: product ? { name: product.name, brand: product.brand } : manualProductName ? { name: manualProductName, brand: manualBrandName || null } : null,
                      skit_data: currentSkit,
                      ai_score: aiScore || null,
                      generated_at: new Date().toISOString(),
                    };
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `skit-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: colors.text,
                    fontWeight: 500,
                  }}
                >
                  Export JSON
                </button>

                {/* Export as Markdown */}
                <button type="button"
                  onClick={() => {
                    const product = selectedProductId ? products.find(p => p.id === selectedProductId) : null;
                    const productName = product?.name || manualProductName || 'Product';
                    const productBrand = product?.brand ? `${product.brand} ` : manualBrandName ? `${manualBrandName} ` : '';
                    const md = `# Skit: ${productBrand}${productName}\n\n` +
                      `## Hook\n> ${currentSkit.hook_line}\n\n` +
                      `## Scenes\n${currentSkit.beats.map((b, i) =>
                        `### Scene ${i + 1} (${b.t})\n**Action:** ${b.action}${b.dialogue ? `\n\n*"${b.dialogue}"*` : ''}${b.on_screen_text ? `\n\n**On-screen:** ${b.on_screen_text}` : ''}`
                      ).join('\n\n')}\n\n` +
                      `## CTA\n**Spoken:** ${currentSkit.cta_line}\n\n**Overlay:** ${currentSkit.cta_overlay}\n\n` +
                      `## B-Roll Suggestions\n${currentSkit.b_roll.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\n` +
                      `## Text Overlays\n${currentSkit.overlays.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\n` +
                      (aiScore ? `## AI Score: ${aiScore.overall_score.toFixed(1)}/10\n\n` +
                        `**Strengths:**\n${aiScore.strengths.map(s => `- ${s}`).join('\n')}\n\n` +
                        `**Suggestions:**\n${aiScore.improvements.map(s => `- ${s}`).join('\n')}` : '') +
                      `\n\n---\n*Generated on ${new Date().toLocaleString()}*`;

                    const blob = new Blob([md], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `skit-${Date.now()}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: colors.text,
                    fontWeight: 500,
                  }}
                >
                  Export Markdown
                </button>

                {/* Download as Plain Text */}
                <button type="button"
                  onClick={() => {
                    const product = selectedProductId ? products.find(p => p.id === selectedProductId) : null;
                    const productName = product?.name || manualProductName || 'Product';
                    const productBrand = product?.brand || manualBrandName || '';
                    const txt = `SKIT: ${productBrand ? productBrand + ' ' : ''}${productName}\n` +
                      `${'='.repeat(50)}\n\n` +
                      `HOOK:\n${currentSkit.hook_line}\n\n` +
                      `SCENES:\n${currentSkit.beats.map((b, i) =>
                        `Scene ${i + 1} [${b.t}]\n  Action: ${b.action}${b.dialogue ? `\n  Dialogue: "${b.dialogue}"` : ''}${b.on_screen_text ? `\n  On-screen text: ${b.on_screen_text}` : ''}`
                      ).join('\n\n')}\n\n` +
                      `CTA:\n  Spoken: ${currentSkit.cta_line}\n  Overlay: ${currentSkit.cta_overlay}\n\n` +
                      `B-ROLL SUGGESTIONS:\n${currentSkit.b_roll.map((b, i) => `  ${i + 1}. ${b}`).join('\n')}\n\n` +
                      `TEXT OVERLAYS:\n${currentSkit.overlays.map((o, i) => `  ${i + 1}. ${o}`).join('\n')}\n\n` +
                      (aiScore ? `AI SCORE: ${aiScore.overall_score.toFixed(1)}/10\n` : '') +
                      `\n${'='.repeat(50)}\nGenerated: ${new Date().toLocaleString()}`;

                    const blob = new Blob([txt], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `skit-${Date.now()}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: colors.text,
                    fontWeight: 500,
                  }}
                >
                  Download .txt
                </button>

                {/* Copy for Google Docs (HTML/Rich Text) */}
                <button type="button"
                  onClick={async () => {
                    const product = selectedProductId ? products.find(p => p.id === selectedProductId) : null;
                    const productName = product?.name || manualProductName || 'Product';
                    const productBrand = product?.brand || manualBrandName || '';

                    // Create HTML for rich text clipboard
                    const html = `
                      <h1>Skit: ${productBrand ? productBrand + ' ' : ''}${productName}</h1>
                      <h2>Hook</h2>
                      <p><em>"${currentSkit.hook_line}"</em></p>
                      <h2>Scenes</h2>
                      ${currentSkit.beats.map((b, i) => `
                        <h3>Scene ${i + 1} (${b.t})</h3>
                        <p><strong>Action:</strong> ${b.action}</p>
                        ${b.dialogue ? `<p><strong>Dialogue:</strong> <em>"${b.dialogue}"</em></p>` : ''}
                        ${b.on_screen_text ? `<p><strong>On-screen:</strong> ${b.on_screen_text}</p>` : ''}
                      `).join('')}
                      <h2>CTA</h2>
                      <p><strong>Spoken:</strong> ${currentSkit.cta_line}</p>
                      <p><strong>Overlay:</strong> ${currentSkit.cta_overlay}</p>
                      <h2>B-Roll Suggestions</h2>
                      <ol>${currentSkit.b_roll.map(b => `<li>${b}</li>`).join('')}</ol>
                      <h2>Text Overlays</h2>
                      <ol>${currentSkit.overlays.map(o => `<li>${o}</li>`).join('')}</ol>
                      ${aiScore ? `<h2>AI Score: ${aiScore.overall_score.toFixed(1)}/10</h2>` : ''}
                    `;

                    // Also create plain text fallback
                    const plainText = `SKIT: ${productBrand ? productBrand + ' ' : ''}${productName}\n\nHOOK:\n${currentSkit.hook_line}\n\nSCENES:\n${currentSkit.beats.map((b, i) => `Scene ${i + 1}: ${b.action}`).join('\n')}\n\nCTA: ${currentSkit.cta_line}`;

                    try {
                      await navigator.clipboard.write([
                        new ClipboardItem({
                          'text/html': new Blob([html], { type: 'text/html' }),
                          'text/plain': new Blob([plainText], { type: 'text/plain' }),
                        }),
                      ]);
                      setCopiedField('gdocs');
                      setTimeout(() => setCopiedField(null), 2000);
                    } catch {
                      // Fallback to plain text copy
                      await navigator.clipboard.writeText(plainText);
                      setCopiedField('gdocs');
                      setTimeout(() => setCopiedField(null), 2000);
                    }
                  }}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: copiedField === 'gdocs' ? '#d3f9d8' : colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: colors.text,
                    fontWeight: 500,
                  }}
                  title="Copy formatted text - paste into Google Docs"
                >
                  {copiedField === 'gdocs' ? 'Copied!' : 'Copy for Docs'}
                </button>

                {/* Download Word Doc */}
                <button type="button"
                  onClick={async () => {
                    const product = selectedProductId ? products.find(p => p.id === selectedProductId) : null;
                    const productName = product?.name || manualProductName || 'Product';
                    const productBrand = product?.brand || manualBrandName || '';
                    const title = `${productBrand ? productBrand + ' ' : ''}${productName} Skit`;

                    const children: Paragraph[] = [];

                    // Title
                    children.push(new Paragraph({
                      text: title,
                      heading: HeadingLevel.HEADING_1,
                      spacing: { after: 200 },
                    }));

                    // Hook
                    children.push(new Paragraph({
                      text: 'HOOK',
                      heading: HeadingLevel.HEADING_2,
                      spacing: { before: 300, after: 100 },
                    }));
                    children.push(new Paragraph({
                      children: [new TextRun({ text: `"${currentSkit.hook_line}"`, italics: true })],
                      spacing: { after: 200 },
                    }));

                    // Scenes
                    children.push(new Paragraph({
                      text: 'SCENES',
                      heading: HeadingLevel.HEADING_2,
                      spacing: { before: 300, after: 100 },
                    }));
                    currentSkit.beats.forEach((beat, idx) => {
                      children.push(new Paragraph({
                        text: `Scene ${idx + 1} [${beat.t}]`,
                        heading: HeadingLevel.HEADING_3,
                        spacing: { before: 200 },
                      }));
                      children.push(new Paragraph({
                        children: [
                          new TextRun({ text: 'Action: ', bold: true }),
                          new TextRun({ text: beat.action }),
                        ],
                      }));
                      if (beat.dialogue) {
                        children.push(new Paragraph({
                          children: [
                            new TextRun({ text: 'Dialogue: ', bold: true }),
                            new TextRun({ text: `"${beat.dialogue}"`, italics: true }),
                          ],
                        }));
                      }
                      if (beat.on_screen_text) {
                        children.push(new Paragraph({
                          children: [
                            new TextRun({ text: 'On-screen: ', bold: true }),
                            new TextRun({ text: beat.on_screen_text }),
                          ],
                        }));
                      }
                    });

                    // CTA
                    children.push(new Paragraph({
                      text: 'CALL TO ACTION',
                      heading: HeadingLevel.HEADING_2,
                      spacing: { before: 300, after: 100 },
                    }));
                    children.push(new Paragraph({
                      children: [
                        new TextRun({ text: 'Spoken: ', bold: true }),
                        new TextRun({ text: currentSkit.cta_line }),
                      ],
                    }));
                    children.push(new Paragraph({
                      children: [
                        new TextRun({ text: 'Overlay: ', bold: true }),
                        new TextRun({ text: currentSkit.cta_overlay }),
                      ],
                    }));

                    // B-Roll
                    if (currentSkit.b_roll.length > 0) {
                      children.push(new Paragraph({
                        text: 'B-ROLL SUGGESTIONS',
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 300, after: 100 },
                      }));
                      currentSkit.b_roll.forEach((item, idx) => {
                        children.push(new Paragraph({
                          text: `${idx + 1}. ${item}`,
                          bullet: { level: 0 },
                        }));
                      });
                    }

                    // Overlays
                    if (currentSkit.overlays.length > 0) {
                      children.push(new Paragraph({
                        text: 'TEXT OVERLAYS',
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 300, after: 100 },
                      }));
                      currentSkit.overlays.forEach((item, idx) => {
                        children.push(new Paragraph({
                          text: `${idx + 1}. ${item}`,
                          bullet: { level: 0 },
                        }));
                      });
                    }

                    // AI Score
                    if (aiScore) {
                      children.push(new Paragraph({
                        text: 'AI SCORE',
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 300, after: 100 },
                      }));
                      children.push(new Paragraph({
                        children: [
                          new TextRun({ text: `Overall: ${aiScore.overall_score.toFixed(1)}/10`, bold: true, size: 28 }),
                        ],
                      }));
                      children.push(new Paragraph({
                        text: `Hook: ${aiScore.hook_strength}/10 | Humor: ${aiScore.humor_level}/10 | Product: ${aiScore.product_integration}/10 | Virality: ${aiScore.virality_potential}/10`,
                        spacing: { before: 100 },
                      }));
                    }

                    const doc = new Document({
                      sections: [{ children }],
                    });

                    const blob = await Packer.toBlob(doc);
                    saveAs(blob, `skit-${Date.now()}.docx`);
                  }}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#2563eb',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: 'white',
                    fontWeight: 500,
                  }}
                >
                  Download .docx
                </button>

                {/* Download PDF */}
                <button type="button"
                  onClick={() => {
                    const product = selectedProductId ? products.find(p => p.id === selectedProductId) : null;
                    const productName = product?.name || manualProductName || 'Product';
                    const productBrand = product?.brand || manualBrandName || '';
                    const title = `${productBrand ? productBrand + ' ' : ''}${productName} Skit`;

                    const pdf = new jsPDF();
                    let yPos = 20;
                    const leftMargin = 20;
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const maxWidth = pageWidth - 2 * leftMargin;

                    // Title
                    pdf.setFontSize(18);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(title, leftMargin, yPos);
                    yPos += 15;

                    // Hook
                    pdf.setFontSize(14);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text('HOOK', leftMargin, yPos);
                    yPos += 8;
                    pdf.setFontSize(11);
                    pdf.setFont('helvetica', 'italic');
                    const hookLines = pdf.splitTextToSize(`"${currentSkit.hook_line}"`, maxWidth);
                    pdf.text(hookLines, leftMargin, yPos);
                    yPos += hookLines.length * 6 + 10;

                    // Scenes
                    pdf.setFontSize(14);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text('SCENES', leftMargin, yPos);
                    yPos += 8;

                    currentSkit.beats.forEach((beat, idx) => {
                      // Check for page break
                      if (yPos > 270) {
                        pdf.addPage();
                        yPos = 20;
                      }

                      pdf.setFontSize(12);
                      pdf.setFont('helvetica', 'bold');
                      pdf.text(`Scene ${idx + 1} [${beat.t}]`, leftMargin, yPos);
                      yPos += 6;

                      pdf.setFontSize(10);
                      pdf.setFont('helvetica', 'normal');
                      const actionLines = pdf.splitTextToSize(`Action: ${beat.action}`, maxWidth);
                      pdf.text(actionLines, leftMargin, yPos);
                      yPos += actionLines.length * 5;

                      if (beat.dialogue) {
                        pdf.setFont('helvetica', 'italic');
                        const dialogueLines = pdf.splitTextToSize(`Dialogue: "${beat.dialogue}"`, maxWidth);
                        pdf.text(dialogueLines, leftMargin, yPos);
                        yPos += dialogueLines.length * 5;
                        pdf.setFont('helvetica', 'normal');
                      }

                      if (beat.on_screen_text) {
                        const textLines = pdf.splitTextToSize(`On-screen: ${beat.on_screen_text}`, maxWidth);
                        pdf.text(textLines, leftMargin, yPos);
                        yPos += textLines.length * 5;
                      }
                      yPos += 5;
                    });

                    // CTA
                    if (yPos > 260) { pdf.addPage(); yPos = 20; }
                    pdf.setFontSize(14);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text('CALL TO ACTION', leftMargin, yPos);
                    yPos += 8;
                    pdf.setFontSize(10);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`Spoken: ${currentSkit.cta_line}`, leftMargin, yPos);
                    yPos += 6;
                    pdf.text(`Overlay: ${currentSkit.cta_overlay}`, leftMargin, yPos);
                    yPos += 12;

                    // B-Roll
                    if (currentSkit.b_roll.length > 0) {
                      if (yPos > 250) { pdf.addPage(); yPos = 20; }
                      pdf.setFontSize(14);
                      pdf.setFont('helvetica', 'bold');
                      pdf.text('B-ROLL SUGGESTIONS', leftMargin, yPos);
                      yPos += 8;
                      pdf.setFontSize(10);
                      pdf.setFont('helvetica', 'normal');
                      currentSkit.b_roll.forEach((item, idx) => {
                        if (yPos > 280) { pdf.addPage(); yPos = 20; }
                        pdf.text(`${idx + 1}. ${item}`, leftMargin, yPos);
                        yPos += 5;
                      });
                      yPos += 5;
                    }

                    // AI Score
                    if (aiScore) {
                      if (yPos > 250) { pdf.addPage(); yPos = 20; }
                      pdf.setFontSize(14);
                      pdf.setFont('helvetica', 'bold');
                      pdf.text('AI SCORE', leftMargin, yPos);
                      yPos += 8;
                      pdf.setFontSize(12);
                      pdf.text(`Overall: ${aiScore.overall_score.toFixed(1)}/10`, leftMargin, yPos);
                      yPos += 6;
                      pdf.setFontSize(10);
                      pdf.setFont('helvetica', 'normal');
                      pdf.text(`Hook: ${aiScore.hook_strength}/10 | Humor: ${aiScore.humor_level}/10 | Product: ${aiScore.product_integration}/10`, leftMargin, yPos);
                    }

                    // Footer
                    pdf.setFontSize(8);
                    pdf.setTextColor(150);
                    pdf.text(`Generated: ${new Date().toLocaleString()}`, leftMargin, 290);

                    pdf.save(`skit-${Date.now()}.pdf`);
                  }}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#dc2626',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: 'white',
                    fontWeight: 500,
                  }}
                >
                  Download PDF
                </button>
              </div>

              {/* AI Score Section */}
              <div style={{
                marginTop: '16px',
                borderTop: `1px solid ${colors.border}`,
                paddingTop: '16px',
              }}>
                {!aiScore && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: colors.bg,
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '13px', color: colors.textSecondary, marginBottom: '12px' }}>
                      Auto-scoring was unavailable. You can manually score this skit.
                    </div>
                    <button type="button"
                      onClick={handleGetAIScore}
                      disabled={scoringInProgress}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: scoringInProgress ? colors.border : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: scoringInProgress ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {scoringInProgress ? 'Scoring...' : 'Get AI Score'}
                    </button>
                  </div>
                )}

                {aiScore && (
                  <div style={{
                    backgroundColor: colors.bg,
                    borderRadius: '8px',
                    padding: '16px',
                  }}>
                    {/* Overall Score */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px',
                    }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: colors.text }}>
                        AI Score
                      </span>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        <span style={{
                          fontSize: '28px',
                          fontWeight: 700,
                          color: aiScore.overall_score < 5 ? '#ef4444' :
                                 aiScore.overall_score < 7 ? '#f59e0b' : '#10b981',
                        }}>
                          {aiScore.overall_score.toFixed(1)}
                        </span>
                        <span style={{ fontSize: '14px', color: colors.textSecondary }}>/10</span>
                      </div>
                    </div>

                    {/* Individual Scores */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      marginBottom: '16px',
                    }}>
                      {[
                        { key: 'hook_strength', label: 'Hook' },
                        { key: 'humor_level', label: 'Humor' },
                        { key: 'product_integration', label: 'Product Fit' },
                        { key: 'virality_potential', label: 'Virality' },
                        { key: 'audience_language', label: 'Voice' },
                        { key: 'clarity', label: 'Clarity' },
                        { key: 'production_feasibility', label: 'Feasibility' },
                      ].map(({ key, label }) => {
                        const score = aiScore[key as keyof AIScore] as number;
                        const barColor = score < 5 ? '#ef4444' : score < 7 ? '#f59e0b' : '#10b981';
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', color: colors.textSecondary, width: '70px', flexShrink: 0 }}>
                              {label}
                            </span>
                            <div style={{
                              flex: 1,
                              height: '8px',
                              backgroundColor: colors.border,
                              borderRadius: '4px',
                              overflow: 'hidden',
                            }}>
                              <div style={{
                                width: `${score * 10}%`,
                                height: '100%',
                                backgroundColor: barColor,
                                borderRadius: '4px',
                                transition: 'width 0.3s ease',
                              }} />
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: barColor, width: '20px', textAlign: 'right' }}>
                              {score}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Strengths */}
                    {aiScore.strengths.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', marginBottom: '6px' }}>
                          Strengths
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: colors.text }}>
                          {aiScore.strengths.map((s, i) => (
                            <li key={i} style={{ marginBottom: '4px' }}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Improvements */}
                    {aiScore.improvements.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#f59e0b', marginBottom: '6px' }}>
                          Suggestions
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: colors.text }}>
                          {aiScore.improvements.map((s, i) => (
                            <li key={i} style={{ marginBottom: '4px' }}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Re-score Button */}
                    <button type="button"
                      onClick={handleGetAIScore}
                      disabled={scoringInProgress}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'transparent',
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: scoringInProgress ? 'not-allowed' : 'pointer',
                        color: colors.textSecondary,
                        opacity: scoringInProgress ? 0.6 : 1,
                      }}
                    >
                      {scoringInProgress ? 'Scoring...' : 'Re-score'}
                    </button>
                  </div>
                )}
              </div>

              {/* Version History */}
              {versions.length > 1 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: colors.text, marginBottom: '8px' }}>
                    Version History
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {versions.map((v, i) => (
                      <button type="button"
                        key={v.id}
                        onClick={() => switchToVersion(i)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: i === currentVersionIndex ? '#7c3aed' : colors.bg,
                          color: i === currentVersionIndex ? 'white' : colors.text,
                          border: `1px solid ${i === currentVersionIndex ? '#7c3aed' : colors.border}`,
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        V{v.id}
                        {v.refinement && (
                          <span style={{ marginLeft: '4px', opacity: 0.7 }}>
                            ({v.refinement.slice(0, 15)}...)
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Refinement Panel */}
              <div style={{
                marginTop: '16px',
                borderTop: `1px solid ${colors.border}`,
                paddingTop: '16px',
              }}>
                <button type="button"
                  onClick={() => setRefinementOpen(!refinementOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: colors.text,
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ transform: refinementOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    ▶
                  </span>
                  Refine This Skit
                </button>

                {refinementOpen && (
                  <div style={{ marginTop: '12px', padding: '12px', backgroundColor: colors.bg, borderRadius: '6px' }}>
                    {/* Quick Actions */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', color: colors.textSecondary, marginBottom: '8px' }}>
                        Quick Actions
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {QUICK_ACTIONS.map((action) => (
                          <button type="button"
                            key={action.id}
                            onClick={() => handleRefine(action.instruction)}
                            disabled={refining}
                            style={{
                              padding: '6px 10px',
                              backgroundColor: colors.card,
                              border: `1px solid ${colors.border}`,
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: refining ? 'not-allowed' : 'pointer',
                              color: colors.text,
                              opacity: refining ? 0.6 : 1,
                            }}
                          >
                            {action.label}
                          </button>
                        ))}
                        <button type="button"
                          onClick={() => handleGenerate()}
                          disabled={refining || generating}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: '#dc2626',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: (refining || generating) ? 'not-allowed' : 'pointer',
                            color: 'white',
                            opacity: (refining || generating) ? 0.6 : 1,
                          }}
                        >
                          Regenerate All
                        </button>
                      </div>
                    </div>

                    {/* Custom Refinement */}
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: colors.textSecondary, marginBottom: '4px' }}>
                        What would you like to change?
                      </label>
                      <textarea
                        value={refinementText}
                        onChange={(e) => setRefinementText(e.target.value)}
                        placeholder="e.g., Make the hook more aggressive, add a plot twist in beat 3, make the CTA funnier..."
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '8px',
                          backgroundColor: colors.card,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          color: colors.text,
                          fontSize: '12px',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit',
                        }}
                      />
                      <button type="button"
                        onClick={() => handleRefine(refinementText)}
                        disabled={refining || !refinementText.trim()}
                        style={{
                          marginTop: '8px',
                          padding: '8px 16px',
                          backgroundColor: (refining || !refinementText.trim()) ? colors.border : '#7c3aed',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: (refining || !refinementText.trim()) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {refining ? 'Refining...' : 'Send'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Rating System */}
              <div style={{
                marginTop: '16px',
                borderTop: `1px solid ${colors.border}`,
                paddingTop: '16px',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: colors.text, marginBottom: '12px' }}>
                  Rate This Skit
                </div>

                {/* Star Rating */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button type="button"
                      key={star}
                      onClick={() => {
                        setUserRating(star);
                        setRatingSaved(false);
                      }}
                      style={{
                        padding: '4px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        fontSize: '24px',
                        cursor: 'pointer',
                        color: star <= userRating ? '#fbbf24' : colors.border,
                        transition: 'color 0.15s',
                      }}
                    >
                      ★
                    </button>
                  ))}
                  {userRating > 0 && (
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: colors.textSecondary, alignSelf: 'center' }}>
                      {userRating}/5
                    </span>
                  )}
                </div>

                {/* Feedback */}
                {userRating > 0 && (
                  <>
                    <textarea
                      value={ratingFeedback}
                      onChange={(e) => {
                        setRatingFeedback(e.target.value);
                        setRatingSaved(false);
                      }}
                      placeholder="What worked? What didn't? (optional)"
                      style={{
                        width: '100%',
                        minHeight: '50px',
                        padding: '8px',
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        color: colors.text,
                        fontSize: '12px',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                        marginBottom: '8px',
                      }}
                    />
                    <button type="button"
                      onClick={handleSaveRating}
                      disabled={savingRating || ratingSaved}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: ratingSaved ? '#10b981' : (savingRating ? colors.border : '#7c3aed'),
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: (savingRating || ratingSaved) ? 'default' : 'pointer',
                      }}
                    >
                      {ratingSaved ? 'Rating Saved!' : (savingRating ? 'Saving...' : 'Save Rating')}
                    </button>
                  </>
                )}
              </div>

              {/* Save to Library */}
              <div style={{
                marginTop: '16px',
                borderTop: `1px solid ${colors.border}`,
                paddingTop: '16px',
              }}>
                <button type="button"
                  onClick={openSaveModal}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    backgroundColor: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save to Library
                </button>

                {/* Send to Video Queue - only show after saving to library */}
                {savedSkitId && !linkedVideoId && (
                  <button type="button"
                    onClick={handleSendToVideo}
                    disabled={sendingToVideo}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '12px 20px',
                      backgroundColor: sendingToVideo ? colors.surface2 : '#6366f1',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: sendingToVideo ? 'default' : 'pointer',
                      opacity: sendingToVideo ? 0.7 : 1,
                    }}
                  >
                    {sendingToVideo ? 'Sending to Queue...' : 'Send to Video Queue'}
                  </button>
                )}

                {/* Show linked video info */}
                {linkedVideoId && (
                  <div style={{
                    marginTop: '8px',
                    padding: '12px',
                    backgroundColor: colors.surface2,
                    borderRadius: '6px',
                    border: `1px solid ${colors.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ color: '#10b981', fontSize: '16px' }}>&#10003;</span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>
                        Video Created
                      </span>
                    </div>
                    {linkedVideoCode && (
                      <div style={{ fontSize: '11px', color: colors.textSecondary, marginBottom: '8px' }}>
                        Code: {linkedVideoCode}
                      </div>
                    )}
                    <Link
                      href={`/admin/pipeline/${linkedVideoId}`}
                      style={{
                        display: 'inline-block',
                        padding: '8px 12px',
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: colors.text,
                        textDecoration: 'none',
                      }}
                    >
                      View in Pipeline
                    </Link>
                  </div>
                )}
              </div>
            </div>
            );
          })()}
        </div>
      </div>

      {/* Save to Library Modal */}
      {saveModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setSaveModalOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setSaveModalOpen(false)}
          tabIndex={-1}
        >
          <div
            style={{
              backgroundColor: colors.card,
              borderRadius: '8px',
              padding: '24px',
              width: '400px',
              maxWidth: '90vw',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', color: colors.text }}>Save to Library</h3>

            {/* Show which variation is being saved */}
            {result?.variations && result.variations.length > 1 && (
              <div style={{
                marginBottom: '16px',
                padding: '10px 12px',
                backgroundColor: colors.bg,
                borderRadius: '6px',
                border: `1px solid ${colors.border}`,
              }}>
                <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>
                  Saving Variation
                </div>
                <div style={{ fontSize: '14px', color: colors.text, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>V{selectedVariationIndex + 1}</span>
                  {result.variations[selectedVariationIndex]?.ai_score && (
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      backgroundColor: (result.variations[selectedVariationIndex]?.ai_score?.overall_score || 0) >= 7 ? '#d1fae5' : '#fef3c7',
                      color: (result.variations[selectedVariationIndex]?.ai_score?.overall_score || 0) >= 7 ? '#059669' : '#d97706',
                    }}>
                      Score: {result.variations[selectedVariationIndex]?.ai_score?.overall_score?.toFixed(1)}
                    </span>
                  )}
                  {selectedVariationIndex === 0 && <span style={{ fontSize: '10px', color: '#7c3aed' }}>(Best)</span>}
                  {isModified && <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: '4px' }}>Modified</span>}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                Title
              </label>
              <input
                type="text"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder="Enter a title for this skit"
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  color: colors.text,
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                Status
              </label>
              <select
                value={saveStatus}
                onChange={(e) => setSaveStatus(e.target.value as SkitStatus)}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  color: colors.text,
                  fontSize: '14px',
                }}
              >
                {SKIT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button"
                onClick={() => setSaveModalOpen(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  color: colors.text,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button type="button"
                onClick={handleSaveToLibrary}
                disabled={savingToLibrary || !saveTitle.trim() || savedToLibrary}
                style={{
                  padding: '10px 20px',
                  backgroundColor: savedToLibrary ? '#10b981' : (savingToLibrary || !saveTitle.trim() ? colors.border : '#059669'),
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: (savingToLibrary || !saveTitle.trim() || savedToLibrary) ? 'default' : 'pointer',
                }}
              >
                {savedToLibrary ? 'Saved!' : (savingToLibrary ? 'Saving...' : 'Save')}
              </button>
            </div>

            {/* Success state with link to library */}
            {savedToLibrary && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#d1fae5',
                borderRadius: '6px',
                textAlign: 'center',
              }}>
                <div style={{ color: '#065f46', fontWeight: 500, marginBottom: '8px' }}>
                  Skit saved successfully!
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <Link
                    href="/admin/skit-library"
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#059669',
                      color: 'white',
                      borderRadius: '4px',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}
                  >
                    View in Library
                  </Link>
                  <button type="button"
                    onClick={() => {
                      setSaveModalOpen(false);
                      setSavedToLibrary(false);
                      setSaveTitle('');
                      setSavedSkitId(null);
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'transparent',
                      color: '#065f46',
                      border: `1px solid #059669`,
                      borderRadius: '4px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Continue Editing
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Load from Library Modal */}
      {loadModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setLoadModalOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setLoadModalOpen(false)}
          tabIndex={-1}
        >
          <div
            style={{
              backgroundColor: colors.card,
              borderRadius: '8px',
              padding: '24px',
              width: '600px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: colors.text }}>Load from Library</h3>
              <button type="button"
                onClick={() => setLoadModalOpen(false)}
                style={{
                  padding: '4px 8px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: colors.textSecondary,
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                &times;
              </button>
            </div>

            {/* Search and Filter */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Search by title..."
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchSavedSkits()}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  color: colors.text,
                  fontSize: '14px',
                }}
              />
              <select
                value={libraryStatusFilter}
                onChange={(e) => {
                  setLibraryStatusFilter(e.target.value);
                  setTimeout(fetchSavedSkits, 0);
                }}
                style={{
                  padding: '8px',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  color: colors.text,
                  fontSize: '14px',
                }}
              >
                <option value="">All Statuses</option>
                {SKIT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                value={libraryProductFilter}
                onChange={(e) => {
                  setLibraryProductFilter(e.target.value);
                  setTimeout(fetchSavedSkits, 0);
                }}
                style={{
                  padding: '8px',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  color: colors.text,
                  fontSize: '14px',
                  maxWidth: '150px',
                }}
              >
                <option value="">All Products</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button type="button"
                onClick={fetchSavedSkits}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#7c3aed',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Search
              </button>
            </div>

            {/* Skits List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loadingSkits ? (
                <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
                  Loading skits...
                </div>
              ) : savedSkits.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
                  No saved skits found
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {savedSkits.map((skit) => (
                    <button type="button"
                      key={skit.id}
                      onClick={() => handleLoadSkit(skit.id)}
                      style={{
                        padding: '12px',
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '6px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#7c3aed'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = colors.border}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, color: colors.text, marginBottom: '4px' }}>
                            {skit.title}
                          </div>
                          <div style={{ fontSize: '12px', color: colors.textSecondary }}>
                            {skit.product_name && <span>{skit.product_brand ? `${skit.product_brand} - ` : ''}{skit.product_name}</span>}
                            {!skit.product_name && <span>No product</span>}
                            <span style={{ margin: '0 8px' }}>|</span>
                            {new Date(skit.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {skit.user_rating && (
                            <span style={{ fontSize: '12px', color: '#fbbf24' }}>
                              {'★'.repeat(skit.user_rating)}
                            </span>
                          )}
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 500,
                            backgroundColor: skit.status === 'approved' ? '#d1fae5' :
                              skit.status === 'produced' ? '#dbeafe' :
                              skit.status === 'posted' ? '#ede9fe' :
                              skit.status === 'archived' ? '#f3f4f6' : '#fef3c7',
                            color: skit.status === 'approved' ? '#065f46' :
                              skit.status === 'produced' ? '#1e40af' :
                              skit.status === 'posted' ? '#5b21b6' :
                              skit.status === 'archived' ? '#6b7280' : '#92400e',
                          }}>
                            {skit.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No Credits Modal */}
      <NoCreditsModal isOpen={noCreditsModal.isOpen} onClose={noCreditsModal.close} />
    </div>
  );
}
