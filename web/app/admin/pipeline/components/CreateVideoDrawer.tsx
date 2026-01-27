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

type ScriptPath = 'existing' | 'generate' | 'later';
type ProofType = 'testimonial' | 'demo' | 'comparison' | 'other';
type Priority = 'normal' | 'high';

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

  // Form state - Script path (Section B)
  const [scriptPath, setScriptPath] = useState<ScriptPath>('later');

  // Form state - Brief Essentials (Section C)
  const [hook, setHook] = useState('');
  const [angle, setAngle] = useState('');
  const [proofType, setProofType] = useState<ProofType>('testimonial');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [targetAccount, setTargetAccount] = useState('');

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
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Get unique brands from products
  const brands = Array.from(new Set(products.map(p => p.brand))).filter(Boolean).sort();

  // Filter products by selected brand
  const filteredProducts = selectedBrand
    ? products.filter(p => p.brand === selectedBrand)
    : [];

  // Get selected product details
  const selectedProduct = products.find(p => p.id === selectedProductId);

  // Handle brand change - reset product
  const handleBrandChange = (brand: string) => {
    if (brand === '__add_new__') {
      setShowAddBrand(true);
      return;
    }
    setSelectedBrand(brand);
    setSelectedProductId('');
    setShowAddBrand(false);
  };

  // Handle product change
  const handleProductChange = (productId: string) => {
    if (productId === '__add_new__') {
      setShowAddProduct(true);
      return;
    }
    setSelectedProductId(productId);
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

  // Validate form
  const isProductSelected = selectedBrand && selectedProductId;

  // For AI generate: require Hook OR Angle (one is enough)
  const needsBriefForGenerate = scriptPath === 'generate' && !hook.trim() && !angle.trim();

  const isValid = isProductSelected && !needsBriefForGenerate;

  // Check if hook/angle are empty (will show warning for non-generate paths)
  const hookEmpty = !hook.trim();
  const angleEmpty = !angle.trim();
  const showTbdWarning = scriptPath !== 'generate' && (hookEmpty || angleEmpty);

  // Reset form for "Create & Add Another"
  const resetForm = () => {
    setSelectedBrand('');
    setSelectedProductId('');
    setShowAddBrand(false);
    setShowAddProduct(false);
    setNewBrandName('');
    setNewProductName('');
    setNewProductCategory('supplements');
    setScriptPath('later');
    setHook('');
    setAngle('');
    setProofType('testimonial');
    setNotes('');
    setPriority('normal');
    setTargetAccount('');
    setError('');
  };

  // Handle submit
  const handleSubmit = async (closeAfter: boolean) => {
    if (!isValid) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/videos/create-from-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProductId,
          script_path: scriptPath,
          brief: {
            hook: hook.trim() || undefined,
            angle: angle.trim() || undefined,
            proof_type: proofType,
            notes: notes.trim() || undefined,
          },
          priority,
          target_account: targetAccount.trim() || undefined,
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
          // Reset form for another entry
          resetForm();
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

  const sectionHeaderStyle = {
    fontSize: '11px',
    fontWeight: 'bold' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '12px',
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
        onClick={onClose}
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
          width: '500px',
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
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: colors.textSecondary,
                padding: '0',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: colors.textSecondary }}>
            Add a new video task to the pipeline
          </p>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

          {/* ==================== SECTION A: REQUIRED ==================== */}
          <div style={{
            padding: '16px',
            backgroundColor: isDark ? '#1f3a5f' : '#e7f5ff',
            borderRadius: '8px',
            border: `1px solid ${isDark ? '#2d5a87' : '#74c0fc'}`,
            marginBottom: '16px',
          }}>
            <div style={{ ...sectionHeaderStyle, color: isDark ? '#74c0fc' : '#1971c2' }}>
              A. Required
            </div>

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
                <>
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
                  {selectedProduct && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: colors.textSecondary }}>
                      Category: {selectedProduct.category}
                      {selectedProduct.primary_link && (
                        <a
                          href={selectedProduct.primary_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ marginLeft: '8px', color: colors.info }}
                        >
                          View Product
                        </a>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ==================== SECTION B: SCRIPT PATH ==================== */}
          <div style={{
            padding: '16px',
            backgroundColor: colors.bgSecondary,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
            marginBottom: '16px',
          }}>
            <div style={{ ...sectionHeaderStyle, color: colors.textSecondary }}>
              B. Script Path
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Script Later - default */}
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px',
                backgroundColor: scriptPath === 'later' ? (isDark ? '#1f3a5f' : '#e7f5ff') : colors.bg,
                borderRadius: '6px',
                cursor: 'pointer',
                border: `2px solid ${scriptPath === 'later' ? colors.info : 'transparent'}`,
                transition: 'all 0.15s',
              }}>
                <input
                  type="radio"
                  name="scriptPath"
                  checked={scriptPath === 'later'}
                  onChange={() => setScriptPath('later')}
                  style={{ marginTop: '2px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', color: colors.text }}>
                    Script coming later
                  </div>
                  <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '2px' }}>
                    Create in "Needs Script" state - recorder will not be notified yet
                  </div>
                </div>
              </label>

              {/* Generate with AI */}
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px',
                backgroundColor: scriptPath === 'generate' ? (isDark ? '#2d4a3e' : '#d3f9d8') : colors.bg,
                borderRadius: '6px',
                cursor: 'pointer',
                border: `2px solid ${scriptPath === 'generate' ? '#40c057' : 'transparent'}`,
                transition: 'all 0.15s',
              }}>
                <input
                  type="radio"
                  name="scriptPath"
                  checked={scriptPath === 'generate'}
                  onChange={() => setScriptPath('generate')}
                  style={{ marginTop: '2px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', color: colors.text }}>
                    Generate script (AI)
                  </div>
                  <div style={{ fontSize: '11px', color: colors.textSecondary, marginTop: '2px' }}>
                    Queue for AI generation - requires Hook or Angle below
                  </div>
                </div>
              </label>
            </div>

            {/* Warning for AI generate without hook/angle */}
            {needsBriefForGenerate && (
              <div style={{
                marginTop: '10px',
                padding: '8px 10px',
                backgroundColor: isDark ? '#4a2020' : '#ffe3e3',
                border: `1px solid ${isDark ? '#8b3030' : '#ffa8a8'}`,
                borderRadius: '6px',
                fontSize: '11px',
                color: isDark ? '#ffa8a8' : '#c92a2a',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <span>!</span>
                <span>AI generation requires at least a Hook or Angle in the Brief section</span>
              </div>
            )}
          </div>

          {/* ==================== SECTION C: BRIEF ESSENTIALS ==================== */}
          <div style={{
            padding: '16px',
            backgroundColor: colors.bgSecondary,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
          }}>
            <div style={{ ...sectionHeaderStyle, color: colors.textSecondary }}>
              C. Brief Essentials {scriptPath !== 'generate' && <span style={{ fontWeight: 'normal', opacity: 0.7 }}>(Optional)</span>}
            </div>

            {/* TBD Warning - only for non-generate paths */}
            {showTbdWarning && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 10px',
                backgroundColor: isDark ? '#4a3000' : '#fff3cd',
                border: `1px solid ${isDark ? '#6b4400' : '#ffc107'}`,
                borderRadius: '6px',
                fontSize: '11px',
                color: isDark ? '#ffc107' : '#856404',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <span>i</span>
                <span>
                  {hookEmpty && angleEmpty ? 'Hook and Angle will default to "TBD"' :
                   hookEmpty ? 'Hook will default to "Hook TBD"' : 'Angle will default to "Angle TBD"'}
                </span>
              </div>
            )}

            {/* 2-column layout for Hook and Angle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>
                  Hook {scriptPath === 'generate' && !angle.trim() && <span style={{ color: '#e03131' }}>*</span>}
                </label>
                <input
                  type="text"
                  value={hook}
                  onChange={(e) => setHook(e.target.value)}
                  placeholder="Opening hook..."
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>
                  Angle {scriptPath === 'generate' && !hook.trim() && <span style={{ color: '#e03131' }}>*</span>}
                </label>
                <input
                  type="text"
                  value={angle}
                  onChange={(e) => setAngle(e.target.value)}
                  placeholder="Marketing angle..."
                  style={inputStyle}
                />
              </div>
            </div>

            {/* 2-column layout for Proof Type and Priority */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
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
                <label style={labelStyle}>Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  style={selectStyle}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            {/* Notes - full width */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Notes / B-Roll Ideas</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes, B-roll ideas..."
                rows={2}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Target Account */}
            <div>
              <label style={labelStyle}>Target Account</label>
              <input
                type="text"
                value={targetAccount}
                onChange={(e) => setTargetAccount(e.target.value)}
                placeholder="@account (optional)"
                style={inputStyle}
              />
            </div>
          </div>
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
              disabled={submitting}
              style={{
                padding: '12px 16px',
                backgroundColor: colors.bgSecondary,
                color: colors.text,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: submitting ? 0.5 : 1,
              }}
            >
              Cancel
            </button>

            {/* Create & Add Another */}
            <button
              onClick={() => handleSubmit(false)}
              disabled={!isValid || submitting}
              style={{
                flex: 1,
                padding: '12px 16px',
                backgroundColor: isValid && !submitting ? (isDark ? '#2d4a3e' : '#d3f9d8') : (isDark ? '#2d3748' : '#e9ecef'),
                color: isValid && !submitting ? (isDark ? '#69db7c' : '#2b8a3e') : (isDark ? '#718096' : '#adb5bd'),
                border: `1px solid ${isValid && !submitting ? '#40c057' : (isDark ? '#4a5568' : '#ced4da')}`,
                borderRadius: '6px',
                cursor: isValid && !submitting ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              {submitting ? 'Creating...' : 'Create & Add Another'}
            </button>

            {/* Create & Close - Primary */}
            <button
              onClick={() => handleSubmit(true)}
              disabled={!isValid || submitting}
              style={{
                flex: 1,
                padding: '12px 16px',
                backgroundColor: isValid && !submitting ? '#228be6' : (isDark ? '#2d3748' : '#e9ecef'),
                color: isValid && !submitting ? 'white' : (isDark ? '#718096' : '#adb5bd'),
                border: isValid && !submitting ? 'none' : `1px solid ${isDark ? '#4a5568' : '#ced4da'}`,
                borderRadius: '6px',
                cursor: isValid && !submitting ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              {submitting ? 'Creating...' : 'Create & Close'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
