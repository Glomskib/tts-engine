'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, ChevronRight, ChevronLeft, Loader2, Check, AlertTriangle,
  Users, Lightbulb, Settings, Rocket,
} from 'lucide-react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import { PERSONAS } from '@/lib/personas';
import { MAX_MATRIX_SIZE, MAX_HOOKS_PER_COMBO, MAX_PERSONAS, MAX_ANGLES } from '@/lib/campaigns/types';

// ── Types ───────────────────────────────────────────────────────

interface Brand {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
}

type Step = 'setup' | 'personas' | 'angles' | 'review';

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: 'setup', label: 'Setup', icon: <Settings className="w-4 h-4" /> },
  { key: 'personas', label: 'Personas', icon: <Users className="w-4 h-4" /> },
  { key: 'angles', label: 'Angles', icon: <Lightbulb className="w-4 h-4" /> },
  { key: 'review', label: 'Launch', icon: <Rocket className="w-4 h-4" /> },
];

const PLATFORM_OPTIONS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram_reels', label: 'Instagram Reels' },
  { value: 'youtube_shorts', label: 'YouTube Shorts' },
];

const SUGGESTED_ANGLES = [
  'Pain point solution',
  'Before/after transformation',
  'Day in the life',
  'Myth busting',
  'Social proof / testimonial',
  'Unboxing / first impression',
  'How-to / tutorial',
  'Comparison / vs competitors',
  'Behind the scenes',
  'Trend jacking',
];

// ── Component ───────────────────────────────────────────────────

export default function NewCampaignPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();

  // Data
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Step state
  const [step, setStep] = useState<Step>('setup');

  // Form: Setup
  const [name, setName] = useState('');
  const [brandId, setBrandId] = useState('');
  const [productId, setProductId] = useState('');
  const [goal, setGoal] = useState('');
  const [platform, setPlatform] = useState('tiktok');
  const [tone, setTone] = useState('');
  const [ctaStyle, setCtaStyle] = useState('');
  const [hooksPerCombo, setHooksPerCombo] = useState(3);
  const [autoScript, setAutoScript] = useState(true);
  const [autoContentItems, setAutoContentItems] = useState(true);

  // Form: Personas
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);

  // Form: Angles
  const [selectedAngles, setSelectedAngles] = useState<string[]>([]);
  const [customAngle, setCustomAngle] = useState('');

  // Generating
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    experiment_id: string;
    total_hooks: number;
    total_scripts: number;
    total_items: number;
    errors: string[];
  } | null>(null);

  // Fetch brands and products
  const fetchData = useCallback(async () => {
    try {
      const [brandsRes, productsRes] = await Promise.all([
        fetch('/api/brand/my-brands'),
        fetch('/api/products'),
      ]);
      const brandsData = await brandsRes.json();
      const productsData = await productsRes.json();

      if (brandsData.ok) {
        setBrands(brandsData.data || []);
        if (brandsData.data?.length) setBrandId(brandsData.data[0].id);
      }
      if (productsData.ok) {
        setProducts(productsData.data || []);
      }
    } catch {
      showError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Products filtered by brand
  const filteredProducts = brandId
    ? products.filter(p => {
        // Products might have brand_id or brand matching the brand name
        return true; // Show all products for now — brand filtering can be enhanced
      })
    : products;

  // Matrix preview
  const matrixSize = selectedPersonas.length * selectedAngles.length * hooksPerCombo;
  const isMatrixValid = matrixSize > 0 && matrixSize <= MAX_MATRIX_SIZE;

  // Step navigation
  const stepIndex = STEPS.findIndex(s => s.key === step);
  const canNext = () => {
    switch (step) {
      case 'setup': return name.trim() && brandId && productId;
      case 'personas': return selectedPersonas.length > 0 && selectedPersonas.length <= MAX_PERSONAS;
      case 'angles': return selectedAngles.length > 0 && selectedAngles.length <= MAX_ANGLES;
      case 'review': return isMatrixValid;
    }
  };

  const goNext = () => {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1].key);
  };
  const goBack = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1].key);
  };

  // Toggle persona
  const togglePersona = (id: string) => {
    setSelectedPersonas(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id].slice(0, MAX_PERSONAS)
    );
  };

  // Toggle angle
  const toggleAngle = (angle: string) => {
    setSelectedAngles(prev =>
      prev.includes(angle) ? prev.filter(a => a !== angle) : [...prev, angle].slice(0, MAX_ANGLES)
    );
  };

  const addCustomAngle = () => {
    if (customAngle.trim() && selectedAngles.length < MAX_ANGLES) {
      setSelectedAngles(prev => [...prev, customAngle.trim()]);
      setCustomAngle('');
    }
  };

  // Generate campaign
  const handleGenerate = async () => {
    if (!isMatrixValid || generating) return;
    setGenerating(true);
    setResult(null);

    try {
      const res = await fetch('/api/campaigns/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          brand_id: brandId,
          product_id: productId,
          goal: goal || undefined,
          hooks_per_combo: hooksPerCombo,
          persona_ids: selectedPersonas,
          angles: selectedAngles,
          platform,
          tone: tone || undefined,
          cta_style: ctaStyle || undefined,
          auto_script: autoScript,
          auto_content_items: autoContentItems,
        }),
      });

      const data = await res.json();
      setResult(data);

      if (data.ok) {
        showSuccess(`Campaign generated: ${data.total_hooks} hooks, ${data.total_scripts} scripts, ${data.total_items} content items`);
      } else {
        showError(data.error || 'Campaign generation failed');
      }
    } catch (err) {
      showError(`Generation failed: ${String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 min-h-[44px]';

  if (loading) {
    return (
      <AdminPageLayout title="New Campaign" subtitle="Auto-generate a full content campaign" stage="create">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="New Campaign"
      subtitle="Auto-generate hooks, scripts, and content items in one flow"
      stage="create"
      breadcrumbs={[
        { label: 'Experiments', href: '/admin/experiments' },
        { label: 'New Campaign' },
      ]}
    >
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const isActive = s.key === step;
          const isDone = i < stepIndex;
          return (
            <button
              key={s.key}
              onClick={() => i <= stepIndex && setStep(s.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-teal-500/15 text-teal-400 ring-1 ring-teal-500/40'
                  : isDone
                  ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  : 'text-zinc-600 cursor-default'
              }`}
              disabled={i > stepIndex}
            >
              {isDone ? <Check className="w-3.5 h-3.5 text-teal-400" /> : s.icon}
              {s.label}
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-zinc-600 ml-1" />}
            </button>
          );
        })}
      </div>

      {/* Step: Setup */}
      {step === 'setup' && (
        <AdminCard title="Campaign Setup" subtitle="Name your campaign and select the product">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Campaign Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Q2 TikTok Hook Test — Protein Powder"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Brand *</label>
                <select value={brandId} onChange={e => setBrandId(e.target.value)} className={inputClass}>
                  <option value="">Select brand...</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Product *</label>
                <select value={productId} onChange={e => setProductId(e.target.value)} className={inputClass}>
                  <option value="">Select product...</option>
                  {filteredProducts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.brand ? ` (${p.brand})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Goal (optional)</label>
              <input
                type="text"
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="e.g., Find the best performing hook style for this product"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Platform</label>
                <select value={platform} onChange={e => setPlatform(e.target.value)} className={inputClass}>
                  {PLATFORM_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Tone (optional)</label>
                <input
                  type="text"
                  value={tone}
                  onChange={e => setTone(e.target.value)}
                  placeholder="e.g., casual, urgent, educational"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Hooks per Combo</label>
                <select value={hooksPerCombo} onChange={e => setHooksPerCombo(Number(e.target.value))} className={inputClass}>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScript}
                  onChange={e => setAutoScript(e.target.checked)}
                  className="w-4 h-4 rounded bg-zinc-800 border-zinc-600 text-teal-500 focus:ring-teal-500/50"
                />
                Auto-generate scripts
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoContentItems}
                  onChange={e => setAutoContentItems(e.target.checked)}
                  className="w-4 h-4 rounded bg-zinc-800 border-zinc-600 text-teal-500 focus:ring-teal-500/50"
                />
                Create content items
              </label>
            </div>
          </div>
        </AdminCard>
      )}

      {/* Step: Personas */}
      {step === 'personas' && (
        <AdminCard
          title="Select Personas"
          subtitle={`Choose up to ${MAX_PERSONAS} creator personas to test (${selectedPersonas.length} selected)`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PERSONAS.map(persona => {
              const isSelected = selectedPersonas.includes(persona.id);
              return (
                <button
                  key={persona.id}
                  onClick={() => togglePersona(persona.id)}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    isSelected
                      ? 'bg-teal-500/10 border-teal-500/30 ring-1 ring-teal-500/20'
                      : 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-sm font-medium text-white">{persona.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{persona.description}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{persona.tone}</span>
                    <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{persona.category}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </AdminCard>
      )}

      {/* Step: Angles */}
      {step === 'angles' && (
        <AdminCard
          title="Content Angles"
          subtitle={`Choose up to ${MAX_ANGLES} angles to test (${selectedAngles.length} selected)`}
        >
          <div className="space-y-4">
            {/* Suggested angles */}
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_ANGLES.map(angle => {
                const isSelected = selectedAngles.includes(angle);
                return (
                  <button
                    key={angle}
                    onClick={() => toggleAngle(angle)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-teal-500/15 text-teal-400 ring-1 ring-teal-500/30'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
                    }`}
                  >
                    {angle}
                  </button>
                );
              })}
            </div>

            {/* Custom angle */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customAngle}
                onChange={e => setCustomAngle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomAngle()}
                placeholder="Add custom angle..."
                className={`flex-1 ${inputClass}`}
              />
              <button
                onClick={addCustomAngle}
                disabled={!customAngle.trim() || selectedAngles.length >= MAX_ANGLES}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            </div>

            {/* Selected angles */}
            {selectedAngles.length > 0 && (
              <div className="pt-2 border-t border-zinc-800">
                <div className="text-xs text-zinc-500 mb-2">Selected angles:</div>
                <div className="flex flex-wrap gap-2">
                  {selectedAngles.map(angle => (
                    <span
                      key={angle}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-500/10 text-teal-400 rounded-full text-xs"
                    >
                      {angle}
                      <button onClick={() => toggleAngle(angle)} className="text-teal-500/60 hover:text-teal-400">
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </AdminCard>
      )}

      {/* Step: Review & Launch */}
      {step === 'review' && (
        <div className="space-y-4">
          <AdminCard title="Campaign Preview">
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-zinc-500">Campaign</div>
                  <div className="text-sm text-white font-medium">{name}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Platform</div>
                  <div className="text-sm text-white">{PLATFORM_OPTIONS.find(p => p.value === platform)?.label}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Personas</div>
                  <div className="text-sm text-white">{selectedPersonas.length}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Angles</div>
                  <div className="text-sm text-white">{selectedAngles.length}</div>
                </div>
              </div>

              {/* Matrix preview */}
              <div className="pt-3 border-t border-zinc-800">
                <div className="text-xs text-zinc-500 mb-2">Generation Matrix</div>
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-2xl font-bold text-teal-400 tabular-nums">{matrixSize}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Hooks</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-violet-400 tabular-nums">{autoScript ? matrixSize : 0}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Scripts</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-400 tabular-nums">{autoContentItems && autoScript ? matrixSize : 0}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Content Items</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-zinc-600 text-center mt-2">
                    {selectedPersonas.length} personas &times; {selectedAngles.length} angles &times; {hooksPerCombo} hooks/combo = {matrixSize} total
                  </div>
                </div>
              </div>

              {!isMatrixValid && matrixSize > MAX_MATRIX_SIZE && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-xs text-red-400">
                    Matrix size ({matrixSize}) exceeds maximum ({MAX_MATRIX_SIZE}). Reduce personas, angles, or hooks per combo.
                  </span>
                </div>
              )}

              {/* Combos list */}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {selectedPersonas.map(pid => {
                  const persona = PERSONAS.find(p => p.id === pid);
                  return selectedAngles.map(angle => (
                    <div key={`${pid}-${angle}`} className="flex items-center gap-2 text-xs text-zinc-400 py-1 px-2 bg-zinc-800/30 rounded">
                      <span className="text-zinc-300 font-medium">{persona?.name || pid}</span>
                      <span className="text-zinc-600">&times;</span>
                      <span>{angle}</span>
                      <span className="ml-auto text-zinc-600">{hooksPerCombo} hooks</span>
                    </div>
                  ));
                })}
              </div>
            </div>
          </AdminCard>

          {/* Result */}
          {result && (
            <AdminCard title={result.ok ? 'Campaign Generated' : 'Generation Issues'} accent={result.ok ? 'teal' : 'red'}>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xl font-bold text-teal-400">{result.total_hooks}</div>
                    <div className="text-[10px] text-zinc-500">Hooks</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-violet-400">{result.total_scripts}</div>
                    <div className="text-[10px] text-zinc-500">Scripts</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-blue-400">{result.total_items}</div>
                    <div className="text-[10px] text-zinc-500">Content Items</div>
                  </div>
                </div>

                {result.errors.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-zinc-800">
                    <div className="text-xs text-amber-400 font-medium">Warnings ({result.errors.length})</div>
                    {result.errors.slice(0, 5).map((err, i) => (
                      <div key={i} className="text-xs text-zinc-500 pl-2 border-l-2 border-amber-500/30">{err}</div>
                    ))}
                    {result.errors.length > 5 && (
                      <div className="text-xs text-zinc-600">+{result.errors.length - 5} more</div>
                    )}
                  </div>
                )}

                {result.ok && result.experiment_id && (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => router.push('/admin/experiments')}
                      className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-500 transition-colors"
                    >
                      View Experiments
                    </button>
                    <button
                      onClick={() => router.push('/admin/pipeline?mode=scripts')}
                      className="px-4 py-2 bg-zinc-800 text-zinc-300 text-sm rounded-lg hover:bg-zinc-700 transition-colors"
                    >
                      Go to Pipeline
                    </button>
                  </div>
                )}
              </div>
            </AdminCard>
          )}
        </div>
      )}

      {/* Navigation footer */}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
        <button
          onClick={goBack}
          disabled={stepIndex === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2">
          {/* Matrix size indicator */}
          {selectedPersonas.length > 0 && selectedAngles.length > 0 && (
            <span className={`text-xs tabular-nums ${isMatrixValid ? 'text-zinc-500' : 'text-red-400'}`}>
              {matrixSize} hooks
            </span>
          )}

          {step === 'review' ? (
            <button
              onClick={handleGenerate}
              disabled={generating || !isMatrixValid || !!result?.ok}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : result?.ok ? (
                <>
                  <Check className="w-4 h-4" />
                  Done
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Generate Campaign
                </>
              )}
            </button>
          ) : (
            <button
              onClick={goNext}
              disabled={!canNext()}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </AdminPageLayout>
  );
}
