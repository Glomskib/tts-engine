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

interface CreateVideoDrawerProps {
  onClose: () => void;
  onSuccess: () => void;
  onShowToast?: (message: string) => void;
}

interface AIDraft {
  hook_options: string[];
  angle_options: string[];
  selected_hook: string;
  selected_angle: string;
  proof_type: 'testimonial' | 'demo' | 'comparison' | 'other';
  notes: string;
  broll_ideas: string[];
  on_screen_text: string[];
  script_draft: string;
}

type ScriptPath = 'ai_draft' | 'manual' | 'later';
type ProofType = 'testimonial' | 'demo' | 'comparison' | 'other';

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

  // Form state - Required (Section A)
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

  // AI Draft state
  const [aiDraft, setAiDraft] = useState<AIDraft | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Form state - Script path (default to AI)
  const [scriptPath, setScriptPath] = useState<ScriptPath>('ai_draft');

  // Form state - Brief (editable after AI draft)
  const [selectedHook, setSelectedHook] = useState('');
  const [selectedAngle, setSelectedAngle] = useState('');
  const [proofType, setProofType] = useState<ProofType>('testimonial');
  const [notes, setNotes] = useState('');
  const [scriptDraft, setScriptDraft] = useState('');

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

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

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

  // Generate AI Draft
  const generateAIDraft = async () => {
    if (!selectedProductId) return;

    setAiLoading(true);
    setAiError(null);
    setError('');

    try {
      const res = await fetch('/api/ai/draft-video-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: selectedProductId }),
      });

      const data = await res.json();

      if (data.ok && data.data) {
        const draft = data.data as AIDraft;
        setAiDraft(draft);
        // Populate editable fields with AI suggestions
        setSelectedHook(draft.selected_hook);
        setSelectedAngle(draft.selected_angle);
        setProofType(draft.proof_type);
        setNotes(draft.notes);
        setScriptDraft(draft.script_draft);
        if (onShowToast) onShowToast('Brief generated!');
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

  // Validate form
  const isProductSelected = selectedBrand && selectedProductId;

  // With AI draft, we can create immediately. Without, we need basic fields.
  const canCreate = isProductSelected && (
    aiDraft !== null || // AI draft exists
    scriptPath === 'later' || // Script coming later is always OK
    scriptPath === 'manual' // Manual entry is OK (we'll use TBD defaults)
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
    setAiError(null);
    setSelectedHook('');
    setSelectedAngle('');
    setProofType('testimonial');
    setNotes('');
    setScriptDraft('');
    setError('');
  };

  // Handle submit
  const handleSubmit = async (closeAfter: boolean) => {
    if (!canCreate) return;

    setSubmitting(true);
    setError('');

    // Determine recording status based on script path
    // ai_draft with script -> NOT_RECORDED (ready to record)
    // later -> NEEDS_SCRIPT
    // manual without script -> NEEDS_SCRIPT
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
            hook: selectedHook.trim() || undefined,
            angle: selectedAngle.trim() || undefined,
            proof_type: proofType,
            notes: notes.trim() || undefined,
          },
          // Include script draft if available
          script_draft: scriptDraft.trim() || undefined,
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
          // Reset form, keep brand selected for fast batch entry
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
          width: '520px',
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
            Select Brand + Product, then let AI draft the brief
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
                        flex: 1,
                        padding: '8px',
                        backgroundColor: colors.bgSecondary,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddBrand}
                      disabled={!newBrandName.trim() || addingBrand}
                      style={{
                        flex: 1,
                        padding: '8px',
                        backgroundColor: newBrandName.trim() && !addingBrand ? '#40c057' : colors.bgTertiary,
                        color: newBrandName.trim() && !addingBrand ? 'white' : colors.textMuted,
                        border: 'none',
                        borderRadius: '4px',
                        cursor: newBrandName.trim() && !addingBrand ? 'pointer' : 'not-allowed',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    >
                      {addingBrand ? 'Adding...' : 'Add Brand'}
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  value={selectedBrand}
                  onChange={(e) => handleBrandChange(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">Select a brand...</option>
                  {brands.map(brand => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
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
                  <select
                    value={newProductCategory}
                    onChange={(e) => setNewProductCategory(e.target.value)}
                    style={{ ...selectStyle, marginBottom: '10px' }}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => { setShowAddProduct(false); setNewProductName(''); }}
                      style={{
                        flex: 1,
                        padding: '8px',
                        backgroundColor: colors.bgSecondary,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddProduct}
                      disabled={!newProductName.trim() || addingProduct}
                      style={{
                        flex: 1,
                        padding: '8px',
                        backgroundColor: newProductName.trim() && !addingProduct ? '#40c057' : colors.bgTertiary,
                        color: newProductName.trim() && !addingProduct ? 'white' : colors.textMuted,
                        border: 'none',
                        borderRadius: '4px',
                        cursor: newProductName.trim() && !addingProduct ? 'pointer' : 'not-allowed',
                        fontSize: '12px',
                        fontWeight: 'bold',
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
                  style={{
                    ...selectStyle,
                    opacity: selectedBrand ? 1 : 0.5,
                  }}
                >
                  <option value="">{selectedBrand ? 'Select a product...' : 'Select brand first'}</option>
                  {filteredProducts.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.category})
                    </option>
                  ))}
                  {selectedBrand && <option value="__add_new__">+ Add New Product...</option>}
                </select>
              )}
            </div>
          </div>

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
                  transition: 'all 0.15s',
                }}
              >
                {aiLoading ? (
                  <>
                    <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                    Generating Brief + Script...
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    Generate Brief + Script
                  </>
                )}
              </button>
              <p style={{
                margin: '8px 0 0',
                fontSize: '12px',
                color: colors.textSecondary,
                textAlign: 'center',
              }}>
                AI will draft hook, angle, notes, and script from Brand + Product
              </p>

              {aiError && (
                <div style={{
                  marginTop: '10px',
                  padding: '10px',
                  backgroundColor: isDark ? '#4a3000' : '#fff3cd',
                  border: `1px solid ${isDark ? '#6b4400' : '#ffc107'}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: isDark ? '#ffc107' : '#856404',
                }}>
                  {aiError}
                </div>
              )}
            </div>
          )}

          {/* ==================== BRIEF PREVIEW (AI-populated, editable) ==================== */}
          {aiDraft && (
            <div style={{
              padding: '16px',
              backgroundColor: isDark ? '#2d4a3e' : '#d3f9d8',
              borderRadius: '8px',
              border: `1px solid ${isDark ? '#3d6a4e' : '#69db7c'}`,
              marginBottom: '16px',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: isDark ? '#69db7c' : '#2b8a3e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <span>✨</span> AI-Generated Brief
                </div>
                <button
                  onClick={generateAIDraft}
                  disabled={aiLoading}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: 'transparent',
                    color: isDark ? '#69db7c' : '#2b8a3e',
                    border: `1px solid ${isDark ? '#69db7c' : '#2b8a3e'}`,
                    borderRadius: '4px',
                    cursor: aiLoading ? 'not-allowed' : 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  {aiLoading ? '...' : 'Regenerate'}
                </button>
              </div>

              {/* Hook dropdown */}
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Hook</label>
                <select
                  value={selectedHook}
                  onChange={(e) => setSelectedHook(e.target.value)}
                  style={selectStyle}
                >
                  {aiDraft.hook_options.map((hook, idx) => (
                    <option key={idx} value={hook}>{hook}</option>
                  ))}
                </select>
              </div>

              {/* Angle dropdown */}
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Angle</label>
                <select
                  value={selectedAngle}
                  onChange={(e) => setSelectedAngle(e.target.value)}
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
                  <label style={labelStyle}>Proof Type</label>
                  <select
                    value={proofType}
                    onChange={(e) => setProofType(e.target.value as ProofType)}
                    style={selectStyle}
                  >
                    <option value="testimonial">Testimonial</option>
                    <option value="demo">Demo</option>
                    <option value="comparison">Comparison</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* B-roll ideas (read-only chips) */}
              {aiDraft.broll_ideas.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>B-Roll Ideas</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {aiDraft.broll_ideas.map((idea, idx) => (
                      <span
                        key={idx}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: isDark ? colors.bgTertiary : '#fff',
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: colors.textSecondary,
                        }}
                      >
                        {idea}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Script draft (expandable) */}
              <div>
                <label style={labelStyle}>Script Draft</label>
                <textarea
                  value={scriptDraft}
                  onChange={(e) => setScriptDraft(e.target.value)}
                  rows={4}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    fontSize: '13px',
                    lineHeight: '1.5',
                  }}
                />
              </div>
            </div>
          )}

          {/* ==================== MANUAL MODE TOGGLE ==================== */}
          {isProductSelected && !aiDraft && (
            <div style={{
              padding: '12px',
              backgroundColor: colors.bgSecondary,
              borderRadius: '6px',
              border: `1px solid ${colors.border}`,
              marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <label style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  backgroundColor: scriptPath === 'later' ? (isDark ? '#1f3a5f' : '#e7f5ff') : 'transparent',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: colors.text,
                  border: `1px solid ${scriptPath === 'later' ? colors.info : 'transparent'}`,
                }}>
                  <input
                    type="radio"
                    name="manualPath"
                    checked={scriptPath === 'later'}
                    onChange={() => setScriptPath('later')}
                  />
                  Script later
                </label>
                <label style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  backgroundColor: scriptPath === 'manual' ? (isDark ? '#1f3a5f' : '#e7f5ff') : 'transparent',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: colors.text,
                  border: `1px solid ${scriptPath === 'manual' ? colors.info : 'transparent'}`,
                }}>
                  <input
                    type="radio"
                    name="manualPath"
                    checked={scriptPath === 'manual'}
                    onChange={() => setScriptPath('manual')}
                  />
                  Manual entry
                </label>
              </div>
              <p style={{
                margin: '8px 0 0',
                fontSize: '11px',
                color: colors.textSecondary,
                textAlign: 'center',
              }}>
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
              marginBottom: '12px',
              padding: '10px',
              backgroundColor: isDark ? '#4a1f1f' : '#ffe0e0',
              borderRadius: '6px',
              color: colors.danger,
              fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            {/* Cancel */}
            <button
              onClick={onClose}
              disabled={submitting || aiLoading}
              style={{
                padding: '12px 16px',
                backgroundColor: colors.bgSecondary,
                color: colors.text,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                cursor: submitting || aiLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: submitting || aiLoading ? 0.5 : 1,
              }}
            >
              Cancel
            </button>

            {/* Create & Add Another */}
            <button
              onClick={() => handleSubmit(false)}
              disabled={!canCreate || submitting || aiLoading}
              style={{
                flex: 1,
                padding: '12px 16px',
                backgroundColor: canCreate && !submitting && !aiLoading ? (isDark ? '#2d4a3e' : '#d3f9d8') : (isDark ? '#2d3748' : '#e9ecef'),
                color: canCreate && !submitting && !aiLoading ? (isDark ? '#69db7c' : '#2b8a3e') : (isDark ? '#718096' : '#adb5bd'),
                border: `1px solid ${canCreate && !submitting && !aiLoading ? '#40c057' : (isDark ? '#4a5568' : '#ced4da')}`,
                borderRadius: '6px',
                cursor: canCreate && !submitting && !aiLoading ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              {submitting ? 'Creating...' : 'Create & Add Another'}
            </button>

            {/* Create & Close - Primary */}
            <button
              onClick={() => handleSubmit(true)}
              disabled={!canCreate || submitting || aiLoading}
              style={{
                flex: 1,
                padding: '12px 16px',
                backgroundColor: canCreate && !submitting && !aiLoading ? '#228be6' : (isDark ? '#2d3748' : '#e9ecef'),
                color: canCreate && !submitting && !aiLoading ? 'white' : (isDark ? '#718096' : '#adb5bd'),
                border: canCreate && !submitting && !aiLoading ? 'none' : `1px solid ${isDark ? '#4a5568' : '#ced4da'}`,
                borderRadius: '6px',
                cursor: canCreate && !submitting && !aiLoading ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              {submitting ? 'Creating...' : 'Create & Close'}
            </button>
          </div>
        </div>
      </div>

      {/* Keyframe animation for spinner */}
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
