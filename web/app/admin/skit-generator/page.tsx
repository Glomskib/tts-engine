'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { postJson, isApiError, type ApiClientError } from '@/lib/http/fetchJson';
import ApiErrorPanel from '@/app/admin/components/ApiErrorPanel';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';

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

interface SkitPreset {
  id: string;
  name: string;
  description: string;
}

interface SkitTemplate {
  id: string;
  name: string;
  description: string;
}

interface SkitResult {
  skit: {
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
  };
  risk_tier_applied: 'SAFE' | 'BALANCED' | 'SPICY';
  risk_score: number;
  risk_flags: string[];
  intensity_applied: number;
  budget_clamped?: boolean;
  preset_intensity_clamped?: boolean;
  preset_id?: string;
  preset_name?: string;
  template_id?: string;
  template_validation?: {
    valid: boolean;
    issues: string[];
  };
}

type Persona = 'NONE' | 'DR_PICKLE' | 'CASH_KING' | 'ABSURD_BUDDY' | 'DEADPAN_OFFICE' | 'INFOMERCIAL_CHAOS';
type RiskTier = 'SAFE' | 'BALANCED' | 'SPICY';

export default function SkitGeneratorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  // Auth state
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data state
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [presets, setPresets] = useState<SkitPreset[]>([]);
  const [templates, setTemplates] = useState<SkitTemplate[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Form state
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [manualProductName, setManualProductName] = useState<string>('');
  const [manualBrandName, setManualBrandName] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('NONE');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [riskTier, setRiskTier] = useState<RiskTier>('SAFE');
  const [persona, setPersona] = useState<Persona>('NONE');
  const [intensity, setIntensity] = useState<number>(50);

  // Result state
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SkitResult | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Check for product_id from URL
  useEffect(() => {
    const productId = searchParams.get('product_id');
    if (productId) {
      setSelectedProductId(productId);
    }
  }, [searchParams]);

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
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [authLoading, authUser]);

  // Filter products by selected brand
  const filteredProducts = selectedBrand
    ? products.filter(p => p.brand === selectedBrand)
    : products;

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

  const handleGenerate = async () => {
    // Validate: need either product_id or manual product name
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

    const payload: Record<string, unknown> = {
      risk_tier: riskTier,
      persona: persona,
      intensity: intensity,
    };

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

    const response = await postJson<SkitResult>('/api/ai/generate-skit', payload);

    setGenerating(false);

    if (isApiError(response)) {
      setError(response);
      return;
    }

    setResult(response.data);
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
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, color: colors.text }}>Skit Generator</h1>
          <p style={{ margin: '4px 0 0 0', color: colors.textSecondary, fontSize: '14px' }}>
            Generate AI-powered comedy skits for product marketing
          </p>
        </div>
        <Link
          href="/admin/pipeline"
          style={{
            padding: '8px 16px',
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            color: colors.text,
            textDecoration: 'none',
            fontSize: '14px',
          }}
        >
          Back to Pipeline
        </Link>
      </div>

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left column: Form */}
        <div style={{
          backgroundColor: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
          padding: '20px',
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
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.brand})
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
              </div>

              {/* Character & Style */}
              <div style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: colors.textSecondary, fontWeight: 500 }}>
                  Character & Style
                </h3>

                {/* Preset */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                    Character Preset
                  </label>
                  <select
                    value={selectedPreset}
                    onChange={(e) => setSelectedPreset(e.target.value)}
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
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  {selectedPreset !== 'NONE' && presets.find(p => p.id === selectedPreset)?.description && (
                    <div style={{ marginTop: '4px', fontSize: '11px', color: colors.textSecondary }}>
                      {presets.find(p => p.id === selectedPreset)?.description}
                    </div>
                  )}
                </div>

                {/* Template */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                    Skit Template (optional)
                  </label>
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

                {/* Persona */}
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                    Persona
                  </label>
                  <select
                    value={persona}
                    onChange={(e) => setPersona(e.target.value as Persona)}
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
                    <option value="NONE">No Persona</option>
                    <option value="DR_PICKLE">Dr. Pickle</option>
                    <option value="CASH_KING">Cash King</option>
                    <option value="ABSURD_BUDDY">Absurd Buddy</option>
                    <option value="DEADPAN_OFFICE">Deadpan Office</option>
                    <option value="INFOMERCIAL_CHAOS">Infomercial Chaos</option>
                  </select>
                </div>
              </div>

              {/* Intensity & Risk */}
              <div>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: colors.textSecondary, fontWeight: 500 }}>
                  Intensity & Risk
                </h3>

                {/* Risk Tier */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                    Risk Tier
                  </label>
                  <select
                    value={riskTier}
                    onChange={(e) => setRiskTier(e.target.value as RiskTier)}
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
                    <option value="SAFE">Safe (Light Humor)</option>
                    <option value="BALANCED">Balanced (Sharper)</option>
                    <option value="SPICY">Spicy (Bold Parody)</option>
                  </select>
                </div>

                {/* Intensity Slider */}
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: colors.textSecondary }}>
                    Comedy Intensity: {intensity}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: colors.textSecondary }}>
                    <span>Subtle</span>
                    <span>Bold</span>
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  padding: '12px 20px',
                  backgroundColor: generating ? colors.border : '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: generating ? 'not-allowed' : 'pointer',
                  marginTop: '8px',
                }}
              >
                {generating ? 'Generating...' : 'Generate Skit'}
              </button>
            </div>
          )}
        </div>

        {/* Right column: Results */}
        <div style={{
          backgroundColor: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
          padding: '20px',
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', color: colors.text }}>Result</h2>

          {error && (
            <div style={{ marginBottom: '16px' }}>
              <ApiErrorPanel
                error={error}
                onDismiss={() => setError(null)}
              />
            </div>
          )}

          {!result && !error && !generating && (
            <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
              Configure your skit and click Generate to see results
            </div>
          )}

          {generating && (
            <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
              Generating your skit...
            </div>
          )}

          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Metadata badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: result.risk_tier_applied === 'SAFE' ? '#d1fae5' :
                    result.risk_tier_applied === 'BALANCED' ? '#fef3c7' : '#fce7f3',
                  color: result.risk_tier_applied === 'SAFE' ? '#065f46' :
                    result.risk_tier_applied === 'BALANCED' ? '#92400e' : '#9d174d',
                }}>
                  {result.risk_tier_applied}
                </span>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  backgroundColor: colors.bg,
                  color: colors.textSecondary,
                }}>
                  Risk Score: {result.risk_score}
                </span>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  backgroundColor: colors.bg,
                  color: colors.textSecondary,
                }}>
                  Intensity: {result.intensity_applied}
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
              {result.risk_flags.length > 0 && (
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#92400e',
                }}>
                  {result.risk_flags.length} risk flag(s) detected
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
                  Template validation: {result.template_validation.issues.join(', ')}
                </div>
              )}

              {/* Hook Line */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>Hook Line</span>
                  <button
                    onClick={() => copyToClipboard(result.skit.hook_line, 'hook')}
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
                <div style={{
                  padding: '12px',
                  backgroundColor: colors.bg,
                  borderRadius: '4px',
                  fontSize: '14px',
                  color: colors.text,
                  fontStyle: 'italic',
                }}>
                  {result.skit.hook_line}
                </div>
              </div>

              {/* Beats */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>Beats ({result.skit.beats.length})</span>
                  <button
                    onClick={() => copyToClipboard(
                      result.skit.beats.map(b => `[${b.t}] ${b.action}${b.dialogue ? `\n"${b.dialogue}"` : ''}${b.on_screen_text ? `\n(Text: ${b.on_screen_text})` : ''}`).join('\n\n'),
                      'beats'
                    )}
                    style={{
                      padding: '2px 8px',
                      backgroundColor: copiedField === 'beats' ? '#d3f9d8' : colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      color: colors.text,
                    }}
                  >
                    {copiedField === 'beats' ? 'Copied!' : 'Copy All'}
                  </button>
                </div>
                <div style={{
                  backgroundColor: colors.bg,
                  borderRadius: '4px',
                  padding: '8px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}>
                  {result.skit.beats.map((beat, i) => (
                    <div key={i} style={{
                      padding: '8px',
                      borderBottom: i < result.skit.beats.length - 1 ? `1px solid ${colors.border}` : 'none',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed', marginBottom: '4px' }}>
                        [{beat.t}]
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
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>CTA</span>
                  <button
                    onClick={() => copyToClipboard(`${result.skit.cta_line}\n[Overlay: ${result.skit.cta_overlay}]`, 'cta')}
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
                <div style={{
                  padding: '12px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '4px',
                }}>
                  <div style={{ color: '#92400e', marginBottom: '4px', fontSize: '14px' }}>{result.skit.cta_line}</div>
                  <div style={{ color: '#b45309', fontSize: '11px' }}>Overlay: {result.skit.cta_overlay}</div>
                </div>
              </div>

              {/* B-Roll & Overlays */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: colors.text, marginBottom: '4px' }}>
                    B-Roll ({result.skit.b_roll.length})
                  </div>
                  <div style={{ padding: '8px', backgroundColor: colors.bg, borderRadius: '4px', fontSize: '12px' }}>
                    {result.skit.b_roll.map((item, i) => (
                      <div key={i} style={{ color: colors.textSecondary, marginBottom: i < result.skit.b_roll.length - 1 ? '4px' : 0 }}>
                        {i + 1}. {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: colors.text, marginBottom: '4px' }}>
                    Overlays ({result.skit.overlays.length})
                  </div>
                  <div style={{ padding: '8px', backgroundColor: colors.bg, borderRadius: '4px', fontSize: '12px' }}>
                    {result.skit.overlays.map((item, i) => (
                      <div key={i} style={{ color: colors.textSecondary, marginBottom: i < result.skit.overlays.length - 1 ? '4px' : 0 }}>
                        {i + 1}. {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Copy Full Skit */}
              <button
                onClick={() => copyToClipboard(
                  `HOOK: ${result.skit.hook_line}\n\n` +
                  `BEATS:\n${result.skit.beats.map(b => `[${b.t}] ${b.action}${b.dialogue ? `\nDialogue: "${b.dialogue}"` : ''}${b.on_screen_text ? `\nText: ${b.on_screen_text}` : ''}`).join('\n\n')}\n\n` +
                  `CTA: ${result.skit.cta_line}\nOverlay: ${result.skit.cta_overlay}\n\n` +
                  `B-ROLL:\n${result.skit.b_roll.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\n` +
                  `OVERLAYS:\n${result.skit.overlays.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
