'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  primary_link?: string;
}

interface PostingAccount {
  id: string;
  display_name: string;
  account_code: string;
  platform: string;
  is_active: boolean;
}

interface CreateVideoDrawerProps {
  onClose: () => void;
  onSuccess: () => void;
  onShowToast?: (message: string) => void;
}

// Hook score interface
interface HookScore {
  curiosity: number;
  clarity: number;
  ugc_fit: number;
  overall: number;
}

// Enhanced AI Draft interface
interface AIDraft {
  // Spoken hooks (expanded)
  spoken_hook_options: string[];
  spoken_hook_by_family?: Record<string, string[]>;
  hook_scores?: Record<string, HookScore>;
  selected_spoken_hook: string;

  // Visual hooks (multiple options now)
  visual_hook_options?: string[];
  selected_visual_hook?: string;
  visual_hook: string;

  // On-screen text
  on_screen_text_hook_options: string[];
  selected_on_screen_text_hook: string;
  mid_overlays?: string[];
  cta_overlay_options?: string[];
  selected_cta_overlay?: string;
  on_screen_text_mid: string[];
  on_screen_text_cta: string;

  // Standard fields
  angle_options: string[];
  selected_angle: string;
  proof_type: 'testimonial' | 'demo' | 'comparison' | 'other';
  notes: string;
  broll_ideas: string[];
  script_draft: string;

  // Legacy
  hook_options: string[];
  selected_hook: string;
  on_screen_text: string[];
}

// Track which fields user has modified
type ModifiableField =
  | 'selectedSpokenHook'
  | 'visualHook'
  | 'selectedTextHook'
  | 'onScreenTextMid'
  | 'onScreenTextCta'
  | 'selectedAngle'
  | 'proofType'
  | 'notes'
  | 'scriptDraft';

// Target length options
type TargetLength = '7-9s' | '15-20s' | '30-45s' | '60s+';

const TARGET_LENGTHS: { value: TargetLength; label: string }[] = [
  { value: '7-9s', label: '7-9 seconds (Quick hook)' },
  { value: '15-20s', label: '15-20 seconds (Standard)' },
  { value: '30-45s', label: '30-45 seconds (Story)' },
  { value: '60s+', label: '60+ seconds (Deep dive)' },
];

type ScriptPath = 'ai_draft' | 'manual' | 'later';
type ProofType = 'testimonial' | 'demo' | 'comparison' | 'other';
type HookType = 'all' | 'pattern_interrupt' | 'relatable_pain' | 'proof_teaser' | 'contrarian' | 'mini_story' | 'curiosity_gap';
type TonePreset = 'ugc_casual' | 'funny' | 'serious' | 'fast_paced' | 'soft_sell';

// Hook Strategy options (renamed from Hook Type for clarity)
const HOOK_STRATEGIES: { value: HookType; label: string; description: string }[] = [
  { value: 'all', label: 'Mixed (All Families)', description: 'Equal distribution across all hook families' },
  { value: 'pattern_interrupt', label: 'Pattern Interrupt', description: '70% bias - Break the scroll with something unexpected' },
  { value: 'relatable_pain', label: 'Relatable Pain', description: '70% bias - Open with a common frustration' },
  { value: 'proof_teaser', label: 'Proof Teaser', description: '70% bias - Tease results/transformation' },
  { value: 'contrarian', label: 'Contrarian', description: '70% bias - Challenge common beliefs' },
  { value: 'mini_story', label: 'Mini Story', description: '70% bias - Start with a quick personal story' },
  { value: 'curiosity_gap', label: 'Curiosity Gap', description: '70% bias - Create an open loop that demands closure' },
];

const TONE_PRESETS: { value: TonePreset; label: string }[] = [
  { value: 'ugc_casual', label: 'UGC Casual' },
  { value: 'funny', label: 'Funny' },
  { value: 'serious', label: 'Serious' },
  { value: 'fast_paced', label: 'Fast-paced' },
  { value: 'soft_sell', label: 'Soft-sell' },
];

const CATEGORIES = [
  { value: 'supplements', label: 'Supplements' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'health', label: 'Health' },
  { value: 'other', label: 'Other' },
];

export default function CreateVideoDrawer({ onClose, onSuccess, onShowToast }: CreateVideoDrawerProps) {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  // Products data
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  // Posting accounts data
  const [postingAccounts, setPostingAccounts] = useState<PostingAccount[]>([]);
  const [selectedPostingAccountId, setSelectedPostingAccountId] = useState('');

  // Form state - Required
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  // Inline add forms
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('supplements');
  const [addingBrand, setAddingBrand] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);

  // Reference section (collapsible)
  const [showReference, setShowReference] = useState(false);
  const [referenceScriptText, setReferenceScriptText] = useState('');
  const [referenceVideoUrl, setReferenceVideoUrl] = useState('');
  const [tonePreset, setTonePreset] = useState<TonePreset>('ugc_casual');
  const [hookType, setHookType] = useState<HookType>('all');

  // More options toggle
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // AI Draft state
  const [aiDraft, setAiDraft] = useState<AIDraft | null>(null);
  const [originalAiDraft, setOriginalAiDraft] = useState<AIDraft | null>(null); // Store original for readjust
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isReadjusting, setIsReadjusting] = useState(false);

  // Track user-modified fields (locked from readjust)
  const [userModifiedFields, setUserModifiedFields] = useState<Set<ModifiableField>>(new Set());

  // Target length for video
  const [targetLength, setTargetLength] = useState<TargetLength>('15-20s');

  // Form state - Script path (default to AI)
  const [scriptPath, setScriptPath] = useState<ScriptPath>('ai_draft');

  // Form state - Hook Package (editable after AI draft)
  const [selectedSpokenHook, setSelectedSpokenHook] = useState('');
  const [visualHook, setVisualHook] = useState('');
  const [selectedTextHook, setSelectedTextHook] = useState('');
  const [onScreenTextMid, setOnScreenTextMid] = useState<string[]>([]);
  const [onScreenTextCta, setOnScreenTextCta] = useState('');

  // Form state - Brief (editable after AI draft)
  const [selectedAngle, setSelectedAngle] = useState('');
  const [proofType, setProofType] = useState<ProofType>('testimonial');
  const [notes, setNotes] = useState('');
  const [scriptDraft, setScriptDraft] = useState('');

  // Hook feedback state
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Debug state for AI response (admin only)
  const [showDebug, setShowDebug] = useState(false);
  const [aiResponseDebug, setAiResponseDebug] = useState<Record<string, unknown> | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.ok) {
        setProducts(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  // Fetch posting accounts
  const fetchPostingAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/posting-accounts');
      const data = await res.json();
      if (data.ok) {
        setPostingAccounts(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch posting accounts:', err);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchPostingAccounts();
  }, [fetchProducts, fetchPostingAccounts]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !aiLoading && !submitting) onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose, aiLoading, submitting]);

  // Get unique brands from products
  const brands = Array.from(new Set(products.map(p => p.brand))).filter(Boolean).sort();

  // Filter products by selected brand
  const filteredProducts = selectedBrand
    ? products.filter(p => p.brand === selectedBrand)
    : [];

  // Get selected product details
  const selectedProduct = products.find(p => p.id === selectedProductId);

  // Handle brand change - reset product and AI draft
  const handleBrandChange = (brand: string) => {
    if (brand === '__add_new__') {
      setShowAddBrand(true);
      return;
    }
    setSelectedBrand(brand);
    setSelectedProductId('');
    setAiDraft(null);
    setAiError(null);
    setShowAddBrand(false);
  };

  // Handle product change - clear AI draft
  const handleProductChange = (productId: string) => {
    if (productId === '__add_new__') {
      setShowAddProduct(true);
      return;
    }
    setSelectedProductId(productId);
    setAiDraft(null);
    setAiError(null);
    setShowAddProduct(false);
  };

  // Add new brand using admin endpoint
  const handleAddBrand = async () => {
    if (!newBrandName.trim()) return;
    setAddingBrand(true);
    setError('');
    try {
      const res = await fetch('/api/admin/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBrandName.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchProducts();
        setSelectedBrand(newBrandName.trim());
        if (data.data?.placeholder_product?.id) {
          setSelectedProductId(data.data.placeholder_product.id);
        }
        setNewBrandName('');
        setShowAddBrand(false);
        if (onShowToast) onShowToast(`Brand "${newBrandName.trim()}" created`);
      } else {
        setError(data.error || 'Failed to create brand');
      }
    } catch (err) {
      console.error('Failed to add brand:', err);
      setError('Failed to create brand');
    } finally {
      setAddingBrand(false);
    }
  };

  // Add new product using admin endpoint
  const handleAddProduct = async () => {
    if (!newProductName.trim() || !selectedBrand) return;
    setAddingProduct(true);
    setError('');
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProductName.trim(),
          brand: selectedBrand,
          category: newProductCategory,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchProducts();
        setSelectedProductId(data.data.id);
        setNewProductName('');
        setNewProductCategory('supplements');
        setShowAddProduct(false);
        if (onShowToast) onShowToast(`Product "${newProductName.trim()}" created`);
      } else {
        setError(data.error || 'Failed to create product');
      }
    } catch (err) {
      console.error('Failed to add product:', err);
      setError('Failed to create product');
    } finally {
      setAddingProduct(false);
    }
  };

  // Helper to mark a field as user-modified
  const markFieldModified = (field: ModifiableField) => {
    if (originalAiDraft) {
      setUserModifiedFields(prev => new Set(prev).add(field));
    }
  };

  // Calculate hook strength (heuristic based on best practices)
  const calculateHookStrength = (hook: string): { score: number; label: string; color: string } => {
    if (!hook) return { score: 0, label: 'No hook', color: '#868e96' };

    let score = 0;
    const hookLower = hook.toLowerCase();

    // Length check (5-12 words is ideal)
    const wordCount = hook.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount >= 5 && wordCount <= 12) score += 25;
    else if (wordCount >= 3 && wordCount <= 15) score += 15;

    // Pattern interrupt indicators
    if (/stop|wait|hold on|don't scroll/i.test(hookLower)) score += 15;

    // Question hooks engage
    if (hook.includes('?')) score += 10;

    // Personal/relatable language
    if (/\b(you|your|i|my|me)\b/i.test(hookLower)) score += 15;

    // Urgency/curiosity words
    if (/secret|never|always|actually|finally|truth|why|how/i.test(hookLower)) score += 10;

    // Emotional triggers
    if (/tired|frustrated|hate|love|obsessed|amazing|insane/i.test(hookLower)) score += 10;

    // Has a specific benefit or result implied
    if (/changed|discovered|found|works|results/i.test(hookLower)) score += 15;

    // Cap at 100
    score = Math.min(score, 100);

    if (score >= 75) return { score, label: 'Strong', color: '#40c057' };
    if (score >= 50) return { score, label: 'Good', color: '#fab005' };
    if (score >= 25) return { score, label: 'Weak', color: '#fd7e14' };
    return { score, label: 'Needs work', color: '#e03131' };
  };

  // Submit hook feedback (approve/ban)
  const submitHookFeedback = async (hookText: string, rating: -1 | 1) => {
    if (!selectedBrand || !hookText) return;

    setFeedbackLoading(true);
    try {
      const res = await fetch('/api/ai/hook-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: selectedBrand,
          product_id: selectedProductId || undefined,
          hook_text: hookText,
          rating,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        if (rating === -1 && aiDraft) {
          // Remove banned hook from options and select next best
          const currentOptions = aiDraft.spoken_hook_options || aiDraft.hook_options || [];
          const filteredOptions = currentOptions.filter(h => h !== hookText);

          if (filteredOptions.length > 0) {
            // Find best remaining hook by score
            let bestHook = filteredOptions[0];
            let bestScore = 0;
            if (aiDraft.hook_scores) {
              for (const hook of filteredOptions) {
                const score = aiDraft.hook_scores[hook]?.overall || 0;
                if (score > bestScore) {
                  bestScore = score;
                  bestHook = hook;
                }
              }
            }
            setSelectedSpokenHook(bestHook);
            // Update aiDraft to remove the banned hook
            setAiDraft({
              ...aiDraft,
              spoken_hook_options: filteredOptions,
              hook_options: filteredOptions,
            });
          }
          if (onShowToast) onShowToast('Hook banned - removed from options');
        } else {
          if (onShowToast) onShowToast('Hook approved!');
        }
      } else {
        console.error('Failed to submit feedback:', data.error);
      }
    } catch (err) {
      console.error('Hook feedback error:', err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  // Generate AI Draft
  const generateAIDraft = async () => {
    if (!selectedProductId) return;

    setAiLoading(true);
    setAiError(null);
    setError('');
    setAiResponseDebug(null);

    try {
      const nonce = crypto.randomUUID();
      const res = await fetch('/api/ai/draft-video-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProductId,
          hook_type: hookType,
          tone_preset: tonePreset,
          target_length: targetLength,
          reference_script_text: referenceScriptText.trim() || undefined,
          reference_video_url: referenceVideoUrl.trim() || undefined,
          nonce,
        }),
      });

      const data = await res.json();

      // Store debug info
      setAiResponseDebug({
        ok: data.ok,
        keys: data.data ? Object.keys(data.data) : [],
        meta: data.meta,
        error: data.error,
        nonce,
      });

      if (data.ok && data.data) {
        const draft = data.data as AIDraft;

        // Handle multiple response shapes for hooks
        let hookOptions: string[] = [];

        // Priority 1: spoken_hook_options (new format)
        if (Array.isArray(draft.spoken_hook_options) && draft.spoken_hook_options.length > 0) {
          hookOptions = draft.spoken_hook_options;
        }
        // Priority 2: hook_options (legacy format)
        else if (Array.isArray(draft.hook_options) && draft.hook_options.length > 0) {
          hookOptions = draft.hook_options;
        }
        // Priority 3: Extract from hook_scores keys
        else if (draft.hook_scores && Object.keys(draft.hook_scores).length > 0) {
          hookOptions = Object.keys(draft.hook_scores);
        }
        // Priority 4: Use selected_spoken_hook or selected_hook as single option
        else if (draft.selected_spoken_hook) {
          hookOptions = [draft.selected_spoken_hook];
        }
        else if (draft.selected_hook) {
          hookOptions = [draft.selected_hook];
        }

        // Normalize the draft to ensure hooks are populated
        const normalizedDraft: AIDraft = {
          ...draft,
          spoken_hook_options: hookOptions,
          hook_options: hookOptions,
        };

        // Log if hooks array is empty
        if (hookOptions.length === 0) {
          console.warn('AI draft returned 0 hooks. Response keys:', Object.keys(draft));
          setAiError('AI draft returned 0 hooks. Click Regenerate or check debug info.');
        }

        setAiDraft(normalizedDraft);
        setOriginalAiDraft(normalizedDraft); // Store original for readjust comparison
        setUserModifiedFields(new Set()); // Reset modified tracking

        // Select best-scoring hook if hook_scores available
        let bestHook = draft.selected_spoken_hook || draft.selected_hook || hookOptions[0] || '';
        if (draft.hook_scores && hookOptions.length > 0) {
          let bestScore = 0;
          for (const hook of hookOptions) {
            const score = draft.hook_scores[hook]?.overall || 0;
            if (score > bestScore) {
              bestScore = score;
              bestHook = hook;
            }
          }
        }

        // Populate Hook Package fields
        setSelectedSpokenHook(bestHook);
        setVisualHook(draft.selected_visual_hook || draft.visual_hook_options?.[0] || draft.visual_hook || '');
        setSelectedTextHook(draft.selected_on_screen_text_hook || '');
        setOnScreenTextMid(draft.on_screen_text_mid || draft.mid_overlays || []);
        setOnScreenTextCta(draft.selected_cta_overlay || draft.on_screen_text_cta || 'Link in bio!');
        // Populate standard fields
        setSelectedAngle(draft.selected_angle || draft.angle_options?.[0] || '');
        setProofType(draft.proof_type || 'testimonial');
        setNotes(draft.notes || '');
        setScriptDraft(draft.script_draft || '');

        if (hookOptions.length > 0 && onShowToast) {
          onShowToast('Brief generated!');
        }
      } else {
        setAiError(data.error || 'AI generation failed');
      }
    } catch (err) {
      console.error('AI draft error:', err);
      setAiError('Failed to generate brief. You can proceed manually.');
    } finally {
      setAiLoading(false);
    }
  };

  // Readjust with AI - adapts non-locked fields to user edits
  const readjustWithAI = async () => {
    if (!selectedProductId || !aiDraft || !originalAiDraft) return;

    setIsReadjusting(true);
    setAiError(null);
    setError('');

    // Build current state
    const currentState = {
      selectedSpokenHook,
      visualHook,
      selectedTextHook,
      onScreenTextMid,
      onScreenTextCta,
      selectedAngle,
      proofType,
      notes,
      scriptDraft,
    };

    try {
      const res = await fetch('/api/ai/draft-video-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProductId,
          hook_type: hookType,
          tone_preset: tonePreset,
          target_length: targetLength,
          reference_script_text: referenceScriptText.trim() || undefined,
          reference_video_url: referenceVideoUrl.trim() || undefined,
          nonce: crypto.randomUUID(),
          // Readjust mode
          mode: 'readjust',
          locked_fields: Array.from(userModifiedFields),
          original_ai_draft: originalAiDraft,
          current_state: currentState,
        }),
      });

      const data = await res.json();

      if (data.ok && data.data) {
        const draft = data.data as AIDraft;
        // Only update non-locked fields
        if (!userModifiedFields.has('selectedSpokenHook')) {
          setSelectedSpokenHook(draft.selected_spoken_hook || draft.selected_hook);
        }
        if (!userModifiedFields.has('visualHook')) {
          setVisualHook(draft.visual_hook || '');
        }
        if (!userModifiedFields.has('selectedTextHook')) {
          setSelectedTextHook(draft.selected_on_screen_text_hook || '');
        }
        if (!userModifiedFields.has('onScreenTextMid')) {
          setOnScreenTextMid(draft.on_screen_text_mid || []);
        }
        if (!userModifiedFields.has('onScreenTextCta')) {
          setOnScreenTextCta(draft.on_screen_text_cta || 'Link in bio!');
        }
        if (!userModifiedFields.has('selectedAngle')) {
          setSelectedAngle(draft.selected_angle);
        }
        if (!userModifiedFields.has('proofType')) {
          setProofType(draft.proof_type);
        }
        if (!userModifiedFields.has('notes')) {
          setNotes(draft.notes);
        }
        if (!userModifiedFields.has('scriptDraft')) {
          setScriptDraft(draft.script_draft);
        }
        // Update aiDraft with new data for options, but keep original for comparison
        setAiDraft(draft);
        if (onShowToast) onShowToast('Brief re-aligned to your edits');
      } else {
        setAiError(data.error || 'Readjust failed');
      }
    } catch (err) {
      console.error('AI readjust error:', err);
      setAiError('Failed to readjust. Try regenerating instead.');
    } finally {
      setIsReadjusting(false);
    }
  };

  // Validate form
  const isProductSelected = selectedBrand && selectedProductId;

  // With AI draft, we can create immediately. Without, we need basic fields.
  const canCreate = isProductSelected && (
    aiDraft !== null ||
    scriptPath === 'later' ||
    scriptPath === 'manual'
  );

  // Reset form for "Create & Add Another"
  const resetForm = (keepBrand: boolean = false) => {
    if (!keepBrand) {
      setSelectedBrand('');
    }
    setSelectedProductId('');
    setShowAddBrand(false);
    setShowAddProduct(false);
    setNewBrandName('');
    setNewProductName('');
    setNewProductCategory('supplements');
    setScriptPath('ai_draft');
    setAiDraft(null);
    setOriginalAiDraft(null);
    setAiError(null);
    setUserModifiedFields(new Set());
    // Reset Hook Package
    setSelectedSpokenHook('');
    setVisualHook('');
    setSelectedTextHook('');
    setOnScreenTextMid([]);
    setOnScreenTextCta('');
    // Reset brief
    setSelectedAngle('');
    setProofType('testimonial');
    setNotes('');
    setScriptDraft('');
    setError('');
    // Keep posting account for batch creation
    // Keep reference settings for batch creation (including targetLength)
  };

  // Handle submit
  const handleSubmit = async (closeAfter: boolean) => {
    if (!canCreate) return;

    setSubmitting(true);
    setError('');

    const hasScript = scriptPath === 'ai_draft' && scriptDraft.trim();
    const recordingScriptPath = hasScript ? 'existing' : (scriptPath === 'later' ? 'later' : 'later');

    try {
      const res = await fetch('/api/videos/create-from-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProductId,
          script_path: recordingScriptPath,
          brief: {
            hook: selectedSpokenHook.trim() || undefined,
            angle: selectedAngle.trim() || undefined,
            proof_type: proofType,
            notes: notes.trim() || undefined,
          },
          // Hook Package data
          hook_package: aiDraft ? {
            spoken_hook: selectedSpokenHook.trim(),
            visual_hook: visualHook.trim(),
            on_screen_text_hook: selectedTextHook.trim(),
            on_screen_text_mid: onScreenTextMid,
            on_screen_text_cta: onScreenTextCta.trim(),
            hook_type: hookType,
          } : undefined,
          // Reference data
          reference: (referenceScriptText.trim() || referenceVideoUrl.trim() || tonePreset !== 'ugc_casual') ? {
            script_text: referenceScriptText.trim() || undefined,
            video_url: referenceVideoUrl.trim() || undefined,
            tone_preset: tonePreset,
          } : undefined,
          script_draft: scriptDraft.trim() || undefined,
          // Posting account (for video_code generation)
          posting_account_id: selectedPostingAccountId || undefined,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        onSuccess();
        if (onShowToast) {
          const productName = selectedProduct?.name || 'Video';
          onShowToast(`${productName} video created`);
        }
        if (closeAfter) {
          onClose();
        } else {
          resetForm(true);
        }
      } else {
        setError(data.error || 'Failed to create video');
      }
    } catch (err) {
      console.error('Failed to create video:', err);
      setError('Failed to create video');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: `1px solid ${colors.inputBorder}`,
    borderRadius: '6px',
    backgroundColor: colors.input,
    color: colors.text,
    outline: 'none',
  };

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    fontWeight: 'bold' as const,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  };

  const inlineFormStyle = {
    marginTop: '8px',
    padding: '12px',
    backgroundColor: isDark ? colors.bgTertiary : '#f8f9fa',
    borderRadius: '6px',
    border: `1px dashed ${colors.border}`,
  };

  const collapsibleHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '10px 12px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '6px',
    border: `1px solid ${colors.border}`,
    marginBottom: '12px',
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={() => !aiLoading && !submitting && onClose()}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '540px',
          backgroundColor: colors.drawer,
          boxShadow: '-4px 0 20px rgba(0,0,0,0.2)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: `1px solid ${colors.border}`,
          backgroundColor: colors.drawerHeader,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: colors.text }}>
              Create Video
            </h2>
            <button
              onClick={onClose}
              disabled={aiLoading || submitting}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: aiLoading || submitting ? 'not-allowed' : 'pointer',
                color: colors.textSecondary,
                padding: '0',
                lineHeight: 1,
                opacity: aiLoading || submitting ? 0.5 : 1,
              }}
            >
              ×
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: colors.textSecondary }}>
            Select Brand + Product, then let AI draft the hook package + script
          </p>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

          {/* ==================== SECTION: BRAND + PRODUCT ==================== */}
          <div style={{
            padding: '16px',
            backgroundColor: isDark ? '#1f3a5f' : '#e7f5ff',
            borderRadius: '8px',
            border: `1px solid ${isDark ? '#2d5a87' : '#74c0fc'}`,
            marginBottom: '16px',
          }}>
            {/* Brand Select */}
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Brand *</label>
              {productsLoading ? (
                <div style={{ padding: '10px', color: colors.textMuted, fontSize: '13px' }}>Loading brands...</div>
              ) : showAddBrand ? (
                <div style={inlineFormStyle}>
                  <input
                    type="text"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="Enter brand name..."
                    autoFocus
                    style={{ ...inputStyle, marginBottom: '10px' }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddBrand()}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => { setShowAddBrand(false); setNewBrandName(''); }}
                      style={{
                        flex: 1, padding: '8px', backgroundColor: colors.bgSecondary,
                        color: colors.text, border: `1px solid ${colors.border}`,
                        borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddBrand}
                      disabled={!newBrandName.trim() || addingBrand}
                      style={{
                        flex: 1, padding: '8px',
                        backgroundColor: newBrandName.trim() && !addingBrand ? '#40c057' : colors.bgTertiary,
                        color: newBrandName.trim() && !addingBrand ? 'white' : colors.textMuted,
                        border: 'none', borderRadius: '4px',
                        cursor: newBrandName.trim() && !addingBrand ? 'pointer' : 'not-allowed',
                        fontSize: '12px', fontWeight: 'bold',
                      }}
                    >
                      {addingBrand ? 'Adding...' : 'Add Brand'}
                    </button>
                  </div>
                </div>
              ) : (
                <select value={selectedBrand} onChange={(e) => handleBrandChange(e.target.value)} style={selectStyle}>
                  <option value="">Select a brand...</option>
                  {brands.map(brand => (<option key={brand} value={brand}>{brand}</option>))}
                  <option value="__add_new__">+ Add New Brand...</option>
                </select>
              )}
            </div>

            {/* Product Select */}
            <div>
              <label style={labelStyle}>Product / SKU *</label>
              {showAddProduct ? (
                <div style={inlineFormStyle}>
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    placeholder="Enter product name..."
                    autoFocus
                    style={{ ...inputStyle, marginBottom: '10px' }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddProduct()}
                  />
                  <select value={newProductCategory} onChange={(e) => setNewProductCategory(e.target.value)} style={{ ...selectStyle, marginBottom: '10px' }}>
                    {CATEGORIES.map(cat => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
                  </select>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => { setShowAddProduct(false); setNewProductName(''); }}
                      style={{
                        flex: 1, padding: '8px', backgroundColor: colors.bgSecondary,
                        color: colors.text, border: `1px solid ${colors.border}`,
                        borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddProduct}
                      disabled={!newProductName.trim() || addingProduct}
                      style={{
                        flex: 1, padding: '8px',
                        backgroundColor: newProductName.trim() && !addingProduct ? '#40c057' : colors.bgTertiary,
                        color: newProductName.trim() && !addingProduct ? 'white' : colors.textMuted,
                        border: 'none', borderRadius: '4px',
                        cursor: newProductName.trim() && !addingProduct ? 'pointer' : 'not-allowed',
                        fontSize: '12px', fontWeight: 'bold',
                      }}
                    >
                      {addingProduct ? 'Adding...' : 'Add Product'}
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  value={selectedProductId}
                  onChange={(e) => handleProductChange(e.target.value)}
                  disabled={!selectedBrand}
                  style={{ ...selectStyle, opacity: selectedBrand ? 1 : 0.5 }}
                >
                  <option value="">{selectedBrand ? 'Select a product...' : 'Select brand first'}</option>
                  {filteredProducts.map(product => (
                    <option key={product.id} value={product.id}>{product.name} ({product.category})</option>
                  ))}
                  {selectedBrand && <option value="__add_new__">+ Add New Product...</option>}
                </select>
              )}
            </div>

            {/* Posting Account Select */}
            <div style={{ marginTop: '14px' }}>
              <label style={labelStyle}>Posting Account</label>
              <select
                value={selectedPostingAccountId}
                onChange={(e) => setSelectedPostingAccountId(e.target.value)}
                style={selectStyle}
              >
                <option value="">Select posting account (optional)...</option>
                {postingAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.display_name} ({account.account_code})
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '4px' }}>
                Used in video code: ACCOUNT-BRAND-SKU-DATE-###
              </div>
            </div>
          </div>

          {/* ==================== REFERENCE (OPTIONAL) SECTION ==================== */}
          {isProductSelected && (
            <div style={{ marginBottom: '16px' }}>
              <div
                style={collapsibleHeaderStyle}
                onClick={() => setShowReference(!showReference)}
              >
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: colors.textSecondary }}>
                  Reference (Optional)
                </span>
                <span style={{ fontSize: '14px', color: colors.textMuted }}>
                  {showReference ? '▼' : '▶'}
                </span>
              </div>

              {showReference && (
                <div style={{
                  padding: '14px',
                  backgroundColor: colors.bgSecondary,
                  borderRadius: '6px',
                  border: `1px solid ${colors.border}`,
                  marginTop: '-6px',
                }}>
                  {/* Hook Strategy */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Hook Strategy</label>
                    <select value={hookType} onChange={(e) => setHookType(e.target.value as HookType)} style={selectStyle}>
                      {HOOK_STRATEGIES.map(ht => (
                        <option key={ht.value} value={ht.value}>{ht.label}</option>
                      ))}
                    </select>
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: colors.textMuted }}>
                      {HOOK_STRATEGIES.find(h => h.value === hookType)?.description}
                    </p>
                  </div>

                  {/* Tone Preset & Target Length row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={labelStyle}>Tone</label>
                      <select value={tonePreset} onChange={(e) => setTonePreset(e.target.value as TonePreset)} style={selectStyle}>
                        {TONE_PRESETS.map(tp => (
                          <option key={tp.value} value={tp.value}>{tp.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Target Length</label>
                      <select value={targetLength} onChange={(e) => setTargetLength(e.target.value as TargetLength)} style={selectStyle}>
                        {TARGET_LENGTHS.map(tl => (
                          <option key={tl.value} value={tl.value}>{tl.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Paste Script */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Reference Script (paste)</label>
                    <textarea
                      value={referenceScriptText}
                      onChange={(e) => setReferenceScriptText(e.target.value)}
                      placeholder="Paste a script to use as structural/tone reference..."
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', fontSize: '13px' }}
                    />
                  </div>

                  {/* Example Video URL */}
                  <div>
                    <label style={labelStyle}>Example Video URL</label>
                    <input
                      type="text"
                      value={referenceVideoUrl}
                      onChange={(e) => setReferenceVideoUrl(e.target.value)}
                      placeholder="TikTok/YouTube/Drive URL for pacing reference..."
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== AI GENERATE BUTTON ==================== */}
          {isProductSelected && !aiDraft && (
            <div style={{ marginBottom: '16px' }}>
              <button
                onClick={generateAIDraft}
                disabled={aiLoading}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: aiLoading ? colors.bgTertiary : (isDark ? '#5c3d8b' : '#7950f2'),
                  color: aiLoading ? colors.textMuted : 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {aiLoading ? (
                  <><span>⏳</span> Generating Hook Package + Script...</>
                ) : (
                  <><span>✨</span> Generate Hook Package + Script</>
                )}
              </button>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: colors.textSecondary, textAlign: 'center' }}>
                AI will draft spoken hook, visual hook, text overlays, and script
              </p>

              {aiError && (
                <div style={{
                  marginTop: '10px', padding: '10px',
                  backgroundColor: isDark ? '#4a3000' : '#fff3cd',
                  border: `1px solid ${isDark ? '#6b4400' : '#ffc107'}`,
                  borderRadius: '6px', fontSize: '12px',
                  color: isDark ? '#ffc107' : '#856404',
                }}>
                  {aiError}
                </div>
              )}

              {/* Debug expander (show raw AI response info) */}
              {aiResponseDebug && (
                <div style={{ marginTop: '10px' }}>
                  <button
                    onClick={() => setShowDebug(!showDebug)}
                    style={{
                      background: 'none', border: 'none',
                      fontSize: '11px', color: colors.textMuted,
                      cursor: 'pointer', padding: '4px 0',
                    }}
                  >
                    {showDebug ? '▼' : '▶'} Debug Info
                  </button>
                  {showDebug && (
                    <pre style={{
                      marginTop: '6px', padding: '8px',
                      backgroundColor: colors.bgSecondary,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px', fontSize: '10px',
                      color: colors.textSecondary,
                      overflow: 'auto', maxHeight: '150px',
                    }}>
                      {JSON.stringify(aiResponseDebug, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ==================== AI-GENERATED BRIEF (Hook Package + Standard) ==================== */}
          {aiDraft && (
            <div style={{
              padding: '16px',
              backgroundColor: isDark ? '#2d4a3e' : '#d3f9d8',
              borderRadius: '8px',
              border: `1px solid ${isDark ? '#3d6a4e' : '#69db7c'}`,
              marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase',
                  letterSpacing: '0.5px', color: isDark ? '#69db7c' : '#2b8a3e',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <span>✨</span> AI-Generated Brief
                  {userModifiedFields.size > 0 && (
                    <span style={{
                      fontSize: '9px', fontWeight: 'normal', textTransform: 'none',
                      backgroundColor: isDark ? '#4a3000' : '#fff3cd',
                      color: isDark ? '#ffd43b' : '#856404',
                      padding: '2px 6px', borderRadius: '3px',
                    }}>
                      {userModifiedFields.size} edited
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {/* Readjust button - only show if user has made edits */}
                  {userModifiedFields.size > 0 && (
                    <button
                      onClick={readjustWithAI}
                      disabled={aiLoading || isReadjusting}
                      title="Re-align other fields to your edits without overwriting what you changed"
                      style={{
                        padding: '4px 10px', backgroundColor: isDark ? '#2d4a3e' : '#d3f9d8',
                        color: isDark ? '#69db7c' : '#2b8a3e',
                        border: `1px solid ${isDark ? '#69db7c' : '#40c057'}`,
                        borderRadius: '4px', cursor: aiLoading || isReadjusting ? 'not-allowed' : 'pointer',
                        fontSize: '11px', fontWeight: 500,
                        opacity: aiLoading || isReadjusting ? 0.6 : 1,
                      }}
                    >
                      {isReadjusting ? '⏳' : '🔁'} Readjust
                    </button>
                  )}
                  <button
                    onClick={generateAIDraft}
                    disabled={aiLoading || isReadjusting}
                    style={{
                      padding: '4px 10px', backgroundColor: 'transparent',
                      color: isDark ? '#69db7c' : '#2b8a3e',
                      border: `1px solid ${isDark ? '#69db7c' : '#2b8a3e'}`,
                      borderRadius: '4px', cursor: aiLoading || isReadjusting ? 'not-allowed' : 'pointer',
                      fontSize: '11px', fontWeight: 500,
                      opacity: aiLoading || isReadjusting ? 0.6 : 1,
                    }}
                  >
                    {aiLoading ? '...' : '🔄 Regenerate'}
                  </button>
                </div>
              </div>

              {/* ===== HOOK PACKAGE SECTION ===== */}
              <div style={{
                padding: '12px',
                backgroundColor: isDark ? '#1a3a2a' : '#c3fae8',
                borderRadius: '6px',
                marginBottom: '14px',
              }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: isDark ? '#8ce99a' : '#087f5b', marginBottom: '10px', textTransform: 'uppercase' }}>
                  Hook Package
                </div>

                {/* Spoken Hook dropdown with strength indicator */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ ...labelStyle, marginBottom: 0, fontSize: '11px' }}>
                      Spoken Hook
                      {userModifiedFields.has('selectedSpokenHook') && (
                        <span style={{ marginLeft: '6px', fontSize: '9px', color: '#fab005' }}>✏️ edited</span>
                      )}
                    </label>
                    {/* Hook Strength Indicator */}
                    {selectedSpokenHook && (() => {
                      const strength = calculateHookStrength(selectedSpokenHook);
                      return (
                        <span style={{
                          fontSize: '10px', fontWeight: 'bold',
                          color: strength.color,
                          display: 'flex', alignItems: 'center', gap: '4px',
                        }}>
                          <span style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            backgroundColor: strength.color,
                          }} />
                          {strength.label}
                        </span>
                      );
                    })()}
                  </div>
                  {(aiDraft.spoken_hook_options || aiDraft.hook_options || []).length === 0 ? (
                    <div style={{
                      padding: '10px', backgroundColor: isDark ? '#4a1f1f' : '#ffe0e0',
                      border: `1px solid ${colors.danger}`, borderRadius: '6px',
                      fontSize: '12px', color: colors.danger,
                    }}>
                      ⚠️ AI returned 0 hooks. Click Regenerate above.
                    </div>
                  ) : (
                    <select
                      value={selectedSpokenHook}
                      onChange={(e) => {
                        setSelectedSpokenHook(e.target.value);
                        markFieldModified('selectedSpokenHook');
                      }}
                      style={selectStyle}
                    >
                      {(aiDraft.spoken_hook_options || aiDraft.hook_options || []).map((hook, idx) => {
                        const score = aiDraft.hook_scores?.[hook]?.overall;
                        const scoreLabel = score ? ` (${Math.round(score * 100)}%)` : '';
                        return (
                          <option key={idx} value={hook}>{hook}{scoreLabel}</option>
                        );
                      })}
                    </select>
                  )}
                  {/* Thumbs up/down feedback buttons */}
                  {selectedSpokenHook && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                      <button
                        onClick={() => submitHookFeedback(selectedSpokenHook, 1)}
                        disabled={feedbackLoading}
                        title="Approve this hook for future generations"
                        style={{
                          padding: '4px 10px',
                          backgroundColor: 'transparent',
                          color: isDark ? '#69db7c' : '#2b8a3e',
                          border: `1px solid ${isDark ? '#69db7c' : '#40c057'}`,
                          borderRadius: '4px',
                          cursor: feedbackLoading ? 'not-allowed' : 'pointer',
                          fontSize: '11px',
                          opacity: feedbackLoading ? 0.6 : 1,
                        }}
                      >
                        👍 Approve
                      </button>
                      <button
                        onClick={() => submitHookFeedback(selectedSpokenHook, -1)}
                        disabled={feedbackLoading}
                        title="Ban this hook - won't be used again for this brand"
                        style={{
                          padding: '4px 10px',
                          backgroundColor: 'transparent',
                          color: isDark ? '#ff6b6b' : '#c92a2a',
                          border: `1px solid ${isDark ? '#ff6b6b' : '#e03131'}`,
                          borderRadius: '4px',
                          cursor: feedbackLoading ? 'not-allowed' : 'pointer',
                          fontSize: '11px',
                          opacity: feedbackLoading ? 0.6 : 1,
                        }}
                      >
                        👎 Ban
                      </button>
                    </div>
                  )}
                </div>

                {/* Visual Hook - dropdown if options available, else textarea */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>
                    Visual Hook (opening shot)
                    {userModifiedFields.has('visualHook') && (
                      <span style={{ marginLeft: '6px', fontSize: '9px', color: '#fab005' }}>✏️ edited</span>
                    )}
                  </label>
                  {aiDraft.visual_hook_options && aiDraft.visual_hook_options.length > 0 ? (
                    <select
                      value={visualHook}
                      onChange={(e) => {
                        setVisualHook(e.target.value);
                        markFieldModified('visualHook');
                      }}
                      style={selectStyle}
                    >
                      {aiDraft.visual_hook_options.map((vh, idx) => (
                        <option key={idx} value={vh}>{vh}</option>
                      ))}
                    </select>
                  ) : (
                    <textarea
                      value={visualHook}
                      onChange={(e) => {
                        setVisualHook(e.target.value);
                        markFieldModified('visualHook');
                      }}
                      rows={2}
                      style={{ ...inputStyle, fontSize: '13px', resize: 'vertical' }}
                    />
                  )}
                </div>

                {/* On-Screen Text Hook dropdown */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>
                    On-Screen Text Hook
                    {userModifiedFields.has('selectedTextHook') && (
                      <span style={{ marginLeft: '6px', fontSize: '9px', color: '#fab005' }}>✏️ edited</span>
                    )}
                  </label>
                  <select
                    value={selectedTextHook}
                    onChange={(e) => {
                      setSelectedTextHook(e.target.value);
                      markFieldModified('selectedTextHook');
                    }}
                    style={selectStyle}
                  >
                    {(aiDraft.on_screen_text_hook_options || []).map((text, idx) => (
                      <option key={idx} value={text}>{text}</option>
                    ))}
                  </select>
                </div>

                {/* Mid Overlays (chips, editable) */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>
                    Mid-Video Overlays
                    {userModifiedFields.has('onScreenTextMid') && (
                      <span style={{ marginLeft: '6px', fontSize: '9px', color: '#fab005' }}>✏️ edited</span>
                    )}
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {onScreenTextMid.map((text, idx) => (
                      <input
                        key={idx}
                        type="text"
                        value={text}
                        onChange={(e) => {
                          const newMid = [...onScreenTextMid];
                          newMid[idx] = e.target.value;
                          setOnScreenTextMid(newMid);
                          markFieldModified('onScreenTextMid');
                        }}
                        style={{
                          padding: '4px 8px', fontSize: '12px',
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px', backgroundColor: colors.input,
                          color: colors.text, width: 'auto', minWidth: '80px',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* CTA Overlay - dropdown if options available, else text input */}
                <div>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>
                    CTA Overlay
                    {userModifiedFields.has('onScreenTextCta') && (
                      <span style={{ marginLeft: '6px', fontSize: '9px', color: '#fab005' }}>✏️ edited</span>
                    )}
                  </label>
                  {aiDraft.cta_overlay_options && aiDraft.cta_overlay_options.length > 0 ? (
                    <select
                      value={onScreenTextCta}
                      onChange={(e) => {
                        setOnScreenTextCta(e.target.value);
                        markFieldModified('onScreenTextCta');
                      }}
                      style={selectStyle}
                    >
                      {aiDraft.cta_overlay_options.map((cta, idx) => (
                        <option key={idx} value={cta}>{cta}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={onScreenTextCta}
                      onChange={(e) => {
                        setOnScreenTextCta(e.target.value);
                        markFieldModified('onScreenTextCta');
                      }}
                      style={inputStyle}
                    />
                  )}
                </div>
              </div>

              {/* ===== STANDARD BRIEF FIELDS ===== */}
              {/* Angle dropdown */}
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>
                  Angle
                  {userModifiedFields.has('selectedAngle') && (
                    <span style={{ marginLeft: '6px', fontSize: '9px', color: '#fab005' }}>✏️ edited</span>
                  )}
                </label>
                <select
                  value={selectedAngle}
                  onChange={(e) => {
                    setSelectedAngle(e.target.value);
                    markFieldModified('selectedAngle');
                  }}
                  style={selectStyle}
                >
                  {aiDraft.angle_options.map((angle, idx) => (
                    <option key={idx} value={angle}>{angle}</option>
                  ))}
                </select>
              </div>

              {/* Proof Type & Notes row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>
                    Proof Type
                    {userModifiedFields.has('proofType') && (
                      <span style={{ marginLeft: '6px', fontSize: '9px', color: '#fab005' }}>✏️</span>
                    )}
                  </label>
                  <select
                    value={proofType}
                    onChange={(e) => {
                      setProofType(e.target.value as ProofType);
                      markFieldModified('proofType');
                    }}
                    style={selectStyle}
                  >
                    <option value="testimonial">Testimonial</option>
                    <option value="demo">Demo</option>
                    <option value="comparison">Comparison</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>
                    Notes
                    {userModifiedFields.has('notes') && (
                      <span style={{ marginLeft: '6px', fontSize: '9px', color: '#fab005' }}>✏️</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      markFieldModified('notes');
                    }}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* B-roll ideas */}
              {aiDraft.broll_ideas.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>B-Roll Ideas</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {aiDraft.broll_ideas.map((idea, idx) => (
                      <span key={idx} style={{
                        padding: '4px 8px', backgroundColor: isDark ? colors.bgTertiary : '#fff',
                        border: `1px solid ${colors.border}`, borderRadius: '4px',
                        fontSize: '11px', color: colors.textSecondary,
                      }}>
                        {idea}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Script draft */}
              <div>
                <label style={labelStyle}>
                  Script Draft
                  {userModifiedFields.has('scriptDraft') && (
                    <span style={{ marginLeft: '6px', fontSize: '9px', color: '#fab005' }}>✏️ edited</span>
                  )}
                </label>
                <textarea
                  value={scriptDraft}
                  onChange={(e) => {
                    setScriptDraft(e.target.value);
                    markFieldModified('scriptDraft');
                  }}
                  rows={5}
                  style={{ ...inputStyle, resize: 'vertical', fontSize: '13px', lineHeight: '1.5' }}
                />
              </div>
            </div>
          )}

          {/* ==================== MANUAL MODE TOGGLE ==================== */}
          {isProductSelected && !aiDraft && (
            <div style={{
              padding: '12px', backgroundColor: colors.bgSecondary,
              borderRadius: '6px', border: `1px solid ${colors.border}`, marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <label style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px',
                  backgroundColor: scriptPath === 'later' ? (isDark ? '#1f3a5f' : '#e7f5ff') : 'transparent',
                  borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: colors.text,
                  border: `1px solid ${scriptPath === 'later' ? colors.info : 'transparent'}`,
                }}>
                  <input type="radio" name="manualPath" checked={scriptPath === 'later'} onChange={() => setScriptPath('later')} />
                  Script later
                </label>
                <label style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px',
                  backgroundColor: scriptPath === 'manual' ? (isDark ? '#1f3a5f' : '#e7f5ff') : 'transparent',
                  borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: colors.text,
                  border: `1px solid ${scriptPath === 'manual' ? colors.info : 'transparent'}`,
                }}>
                  <input type="radio" name="manualPath" checked={scriptPath === 'manual'} onChange={() => setScriptPath('manual')} />
                  Manual entry
                </label>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '11px', color: colors.textSecondary, textAlign: 'center' }}>
                Or skip AI and create video now
              </p>
            </div>
          )}
        </div>

        {/* ==================== STICKY FOOTER ==================== */}
        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${colors.border}`,
          backgroundColor: colors.drawerHeader,
        }}>
          {error && (
            <div style={{
              marginBottom: '12px', padding: '10px',
              backgroundColor: isDark ? '#4a1f1f' : '#ffe0e0',
              borderRadius: '6px', color: colors.danger, fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              disabled={submitting || aiLoading}
              style={{
                padding: '12px 16px', backgroundColor: colors.bgSecondary,
                color: colors.text, border: `1px solid ${colors.border}`,
                borderRadius: '6px', cursor: submitting || aiLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px', opacity: submitting || aiLoading ? 0.5 : 1,
              }}
            >
              Cancel
            </button>

            <button
              onClick={() => handleSubmit(false)}
              disabled={!canCreate || submitting || aiLoading}
              style={{
                flex: 1, padding: '12px 16px',
                backgroundColor: canCreate && !submitting && !aiLoading ? (isDark ? '#2d4a3e' : '#d3f9d8') : (isDark ? '#2d3748' : '#e9ecef'),
                color: canCreate && !submitting && !aiLoading ? (isDark ? '#69db7c' : '#2b8a3e') : (isDark ? '#718096' : '#adb5bd'),
                border: `1px solid ${canCreate && !submitting && !aiLoading ? '#40c057' : (isDark ? '#4a5568' : '#ced4da')}`,
                borderRadius: '6px', cursor: canCreate && !submitting && !aiLoading ? 'pointer' : 'not-allowed',
                fontSize: '14px', fontWeight: 500,
              }}
            >
              {submitting ? 'Creating...' : 'Create & Add Another'}
            </button>

            <button
              onClick={() => handleSubmit(true)}
              disabled={!canCreate || submitting || aiLoading}
              style={{
                flex: 1, padding: '12px 16px',
                backgroundColor: canCreate && !submitting && !aiLoading ? '#228be6' : (isDark ? '#2d3748' : '#e9ecef'),
                color: canCreate && !submitting && !aiLoading ? 'white' : (isDark ? '#718096' : '#adb5bd'),
                border: canCreate && !submitting && !aiLoading ? 'none' : `1px solid ${isDark ? '#4a5568' : '#ced4da'}`,
                borderRadius: '6px', cursor: canCreate && !submitting && !aiLoading ? 'pointer' : 'not-allowed',
                fontSize: '14px', fontWeight: 'bold',
              }}
            >
              {submitting ? 'Creating...' : 'Create & Close'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
