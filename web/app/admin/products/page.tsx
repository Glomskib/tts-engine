'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  product_display_name?: string | null;
  notes?: string | null;
  primary_link?: string | null;
  tiktok_showcase_url?: string | null;
  slug?: string | null;
  category_risk?: 'low' | 'medium' | 'high' | null;
  created_at?: string;
}

interface ProductStats extends Product {
  videos_this_month: number;
  in_queue: number;
  posted: number;
  target_accounts: string[];
}

interface AuthUser {
  id: string;
  email: string | null;
  role: 'admin' | 'recorder' | 'editor' | 'uploader' | null;
}

// Colors for dark mode consistency
const colors = {
  bg: '#1a1a1a',
  surface: '#242424',
  surface2: '#2d2d2d',
  border: '#404040',
  text: '#e5e5e5',
  textMuted: '#a0a0a0',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  danger: '#ef4444',
  warning: '#f59e0b',
  success: '#22c55e',
};

export default function ProductsPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [productStats, setProductStats] = useState<ProductStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Edit drawer state
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch auth user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/products');
          return;
        }

        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        setAuthUser({
          id: user.id,
          email: user.email || null,
          role: roleData.role || null,
        });
      } catch (err) {
        console.error('Failed to fetch auth user:', err);
        router.push('/login?redirect=/admin/products');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch product stats
  const fetchProductStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all products
      const productsRes = await fetch('/api/products');
      const productsData = await productsRes.json();

      if (!productsData.ok) {
        throw new Error(productsData.error || 'Failed to fetch products');
      }

      const products: Product[] = productsData.data || [];

      // Fetch videos (simplified - in production this would be a dedicated API)
      const videosRes = await fetch('/api/videos/queue?limit=200&claimed=any');
      const videosData = await videosRes.json();
      const videos = videosData.ok ? (videosData.data || []) : [];

      // Fetch accounts for name lookup
      const accountsRes = await fetch('/api/accounts');
      const accountsData = await accountsRes.json();
      const accounts: Record<string, string> = {};
      if (accountsData.ok && accountsData.data) {
        accountsData.data.forEach((a: { id: string; name: string }) => {
          accounts[a.id] = a.name;
        });
      }

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Calculate stats per product
      const stats: ProductStats[] = products.map((product) => {
        const productVideos = videos.filter((v: { product_id: string | null }) =>
          v.product_id === product.id
        );

        // Get unique account IDs
        const accountIds = new Set<string>();
        productVideos.forEach((v: { account_id: string }) => {
          if (v.account_id) accountIds.add(v.account_id);
        });

        return {
          ...product,
          videos_this_month: productVideos.filter((v: { created_at: string }) =>
            new Date(v.created_at) >= startOfMonth
          ).length,
          in_queue: productVideos.filter((v: { recording_status: string | null }) =>
            v.recording_status !== 'POSTED' && v.recording_status !== 'REJECTED'
          ).length,
          posted: productVideos.filter((v: { recording_status: string | null }) =>
            v.recording_status === 'POSTED'
          ).length,
          target_accounts: Array.from(accountIds).map(id => accounts[id] || id.slice(0, 8)),
        };
      });

      // Sort by in_queue desc (most urgent first)
      stats.sort((a, b) => b.in_queue - a.in_queue);

      setProductStats(stats);
    } catch (err) {
      console.error('Failed to fetch product stats:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && authUser) {
      fetchProductStats();
    }
  }, [authLoading, authUser, fetchProductStats]);

  // Open edit drawer
  const handleEdit = (product: ProductStats) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      brand: product.brand,
      category: product.category,
      product_display_name: product.product_display_name || '',
      notes: product.notes || '',
      primary_link: product.primary_link || '',
      tiktok_showcase_url: product.tiktok_showcase_url || '',
      slug: product.slug || '',
      category_risk: product.category_risk || null,
    });
    setSaveError(null);
    setEditDrawerOpen(true);
  };

  // Close edit drawer
  const handleCloseDrawer = () => {
    setEditDrawerOpen(false);
    setEditingProduct(null);
    setEditForm({});
    setSaveError(null);
  };

  // Save product changes
  const handleSave = async () => {
    if (!editingProduct) return;

    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to save product');
      }

      // Update local state
      setProductStats(prev =>
        prev.map(p => p.id === editingProduct.id ? { ...p, ...data.data } : p)
      );

      handleCloseDrawer();
    } catch (err) {
      console.error('Failed to save product:', err);
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Detect potential duplicates
  const getDuplicateWarning = (product: ProductStats): string | null => {
    const normalizedName = product.name.toLowerCase().trim();
    const duplicates = productStats.filter(p =>
      p.id !== product.id &&
      p.brand === product.brand &&
      p.name.toLowerCase().trim() === normalizedName
    );
    if (duplicates.length > 0) {
      return `Potential duplicate: same name and brand as product ${duplicates[0].id.slice(0, 8)}`;
    }
    return null;
  };

  if (authLoading) {
    return <div style={{ padding: '20px', backgroundColor: colors.bg, color: colors.text, minHeight: '100vh' }}>Checking access...</div>;
  }

  if (!authUser) {
    return <div style={{ padding: '20px', backgroundColor: colors.bg, color: colors.text, minHeight: '100vh' }}>Redirecting to login...</div>;
  }

  const isAdmin = authUser.role === 'admin';

  // Get unique brands and categories for filters
  const uniqueBrands = Array.from(new Set(productStats.map(p => p.brand))).sort();
  const uniqueCategories = Array.from(new Set(productStats.map(p => p.category))).sort();

  // Apply filters
  const filteredProducts = productStats.filter(p => {
    if (brandFilter && p.brand !== brandFilter) return false;
    if (categoryFilter && p.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', backgroundColor: colors.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, color: colors.text }}>Products</h1>
        <button
          onClick={fetchProductStats}
          style={{
            padding: '8px 16px',
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>


      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        padding: '12px',
        backgroundColor: colors.surface,
        borderRadius: '8px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: colors.textMuted }}>Brand:</label>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: `1px solid ${colors.border}`,
              fontSize: '13px',
              minWidth: '140px',
              backgroundColor: colors.surface2,
              color: colors.text,
            }}
          >
            <option value="">All Brands</option>
            {uniqueBrands.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: colors.textMuted }}>Category:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: `1px solid ${colors.border}`,
              fontSize: '13px',
              minWidth: '140px',
              backgroundColor: colors.surface2,
              color: colors.text,
            }}
          >
            <option value="">All Categories</option>
            {uniqueCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {(brandFilter || categoryFilter) && (
          <button
            onClick={() => { setBrandFilter(''); setCategoryFilter(''); }}
            style={{
              padding: '6px 12px',
              backgroundColor: colors.danger,
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Clear Filters
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '12px', color: colors.textMuted }}>
          {filteredProducts.length} of {productStats.length} products
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#3b1c1c',
          color: '#fca5a5',
          borderRadius: '4px',
          marginBottom: '20px',
          border: `1px solid ${colors.danger}`,
        }}>
          Error: {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: colors.textMuted }}>
          Loading product statistics...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: colors.textMuted,
          backgroundColor: colors.surface,
          borderRadius: '8px',
        }}>
          {productStats.length === 0
            ? 'No products found. Add products to see statistics here.'
            : 'No products match the current filters.'
          }
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'left', backgroundColor: colors.surface, color: colors.text }}>Product</th>
                <th style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'left', backgroundColor: colors.surface, color: colors.text }}>Brand</th>
                <th style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'left', backgroundColor: colors.surface, color: colors.text }}>Category</th>
                <th style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'center', backgroundColor: colors.surface, color: colors.text }}>This Month</th>
                <th style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'center', backgroundColor: colors.surface, color: colors.text }}>In Queue</th>
                <th style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'center', backgroundColor: colors.surface, color: colors.text }}>Posted</th>
                <th style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'left', backgroundColor: colors.surface, color: colors.text }}>Target Accounts</th>
                <th style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'center', backgroundColor: colors.surface, color: colors.text }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const duplicateWarning = getDuplicateWarning(product);
                return (
                  <tr key={product.id} style={{ backgroundColor: colors.bg }}>
                    <td style={{ border: `1px solid ${colors.border}`, padding: '12px' }}>
                      <div>
                        <span style={{ fontWeight: 'bold', fontSize: '14px', color: colors.text }}>{product.name}</span>
                        {product.product_display_name && (
                          <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px' }}>
                            Display: {product.product_display_name}
                          </div>
                        )}
                        {duplicateWarning && (
                          <div style={{ fontSize: '10px', color: colors.warning, marginTop: '4px' }}>
                            {duplicateWarning}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ border: `1px solid ${colors.border}`, padding: '12px' }}>
                      <span style={{
                        padding: '3px 8px',
                        backgroundColor: '#1e3a5f',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: '#93c5fd',
                      }}>
                        {product.brand}
                      </span>
                    </td>
                    <td style={{ border: `1px solid ${colors.border}`, padding: '12px', fontSize: '13px', color: colors.textMuted }}>
                      {product.category}
                    </td>
                    <td style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'center', color: colors.text }}>
                      {product.videos_this_month}
                    </td>
                    <td style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 12px',
                        backgroundColor: product.in_queue > 0 ? '#422006' : colors.surface2,
                        borderRadius: '12px',
                        fontWeight: 'bold',
                        color: product.in_queue > 0 ? '#fcd34d' : colors.textMuted,
                      }}>
                        {product.in_queue}
                      </span>
                    </td>
                    <td style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 12px',
                        backgroundColor: product.posted > 0 ? '#14532d' : colors.surface2,
                        borderRadius: '12px',
                        fontWeight: 'bold',
                        color: product.posted > 0 ? '#86efac' : colors.textMuted,
                      }}>
                        {product.posted}
                      </span>
                    </td>
                    <td style={{ border: `1px solid ${colors.border}`, padding: '12px' }}>
                      {product.target_accounts.length > 0 ? (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {product.target_accounts.slice(0, 3).map((account, idx) => (
                            <span key={idx} style={{
                              padding: '2px 6px',
                              backgroundColor: colors.surface2,
                              borderRadius: '4px',
                              fontSize: '11px',
                              color: colors.textMuted,
                            }}>
                              {account}
                            </span>
                          ))}
                          {product.target_accounts.length > 3 && (
                            <span style={{ fontSize: '11px', color: colors.textMuted }}>
                              +{product.target_accounts.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: colors.textMuted, fontSize: '12px' }}>None</span>
                      )}
                    </td>
                    <td style={{ border: `1px solid ${colors.border}`, padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        {isAdmin && (
                          <button
                            onClick={() => handleEdit(product)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: colors.surface2,
                              color: colors.text,
                              border: `1px solid ${colors.border}`,
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <Link
                          href={`/admin/pipeline?product=${encodeURIComponent(product.id)}`}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: colors.primary,
                            color: 'white',
                            borderRadius: '4px',
                            textDecoration: 'none',
                            fontSize: '12px',
                          }}
                        >
                          View Videos
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '20px', fontSize: '12px', color: colors.textMuted }}>
        Showing {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
      </div>

      {/* Edit Drawer */}
      {editDrawerOpen && editingProduct && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleCloseDrawer}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
          />

          {/* Drawer */}
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '480px',
            maxWidth: '100%',
            height: '100vh',
            backgroundColor: colors.surface,
            boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.3)',
            zIndex: 1001,
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${colors.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h2 style={{ margin: 0, color: colors.text, fontSize: '18px' }}>Edit Product</h2>
              <button
                onClick={handleCloseDrawer}
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.textMuted,
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                x
              </button>
            </div>

            {/* Form */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              {saveError && (
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#3b1c1c',
                  color: '#fca5a5',
                  borderRadius: '4px',
                  marginBottom: '16px',
                  fontSize: '13px',
                }}>
                  {saveError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Name */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: colors.textMuted }}>
                    Product Name *
                  </label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: colors.surface2,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* Product Display Name */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: colors.textMuted }}>
                    Display Name (TikTok-safe, max 30 chars)
                  </label>
                  <input
                    type="text"
                    value={editForm.product_display_name || ''}
                    onChange={(e) => setEditForm({ ...editForm, product_display_name: e.target.value })}
                    maxLength={30}
                    placeholder="Short name for TikTok"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: colors.surface2,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  />
                  <div style={{ fontSize: '10px', color: colors.textMuted, marginTop: '4px' }}>
                    {(editForm.product_display_name || '').length}/30 characters
                  </div>
                </div>

                {/* Brand */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: colors.textMuted }}>
                    Brand *
                  </label>
                  <input
                    type="text"
                    value={editForm.brand || ''}
                    onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: colors.surface2,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* Category */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: colors.textMuted }}>
                    Category *
                  </label>
                  <input
                    type="text"
                    value={editForm.category || ''}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: colors.surface2,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* Category Risk */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: colors.textMuted }}>
                    Category Risk
                  </label>
                  <select
                    value={editForm.category_risk || ''}
                    onChange={(e) => setEditForm({ ...editForm, category_risk: e.target.value as 'low' | 'medium' | 'high' | null || null })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: colors.surface2,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  >
                    <option value="">Not set</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                {/* Primary Link */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: colors.textMuted }}>
                    Primary Link (Product URL)
                  </label>
                  <input
                    type="url"
                    value={editForm.primary_link || ''}
                    onChange={(e) => setEditForm({ ...editForm, primary_link: e.target.value })}
                    placeholder="https://..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: colors.surface2,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* TikTok Showcase URL */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: colors.textMuted }}>
                    TikTok Showcase URL
                  </label>
                  <input
                    type="url"
                    value={editForm.tiktok_showcase_url || ''}
                    onChange={(e) => setEditForm({ ...editForm, tiktok_showcase_url: e.target.value })}
                    placeholder="https://www.tiktok.com/..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: colors.surface2,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* Slug */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: colors.textMuted }}>
                    Slug (URL-friendly identifier)
                  </label>
                  <input
                    type="text"
                    value={editForm.slug || ''}
                    onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                    placeholder="product-slug"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: colors.surface2,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: colors.textMuted }}>
                    Notes
                  </label>
                  <textarea
                    value={editForm.notes || ''}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    rows={4}
                    placeholder="Product-specific notes, talking points, compliance warnings..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: colors.surface2,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      color: colors.text,
                      fontSize: '14px',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: `1px solid ${colors.border}`,
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={handleCloseDrawer}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  color: colors.text,
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  backgroundColor: saving ? colors.textMuted : colors.primary,
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
