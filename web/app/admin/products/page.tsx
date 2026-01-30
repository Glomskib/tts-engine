'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState } from '../components/AdminPageLayout';
import { patchJson, isApiError, type ApiClientError } from '@/lib/http/fetchJson';
import ApiErrorPanel from '../components/ApiErrorPanel';

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

interface OpsWarning {
  code: string;
  severity: 'info' | 'warn';
  title: string;
  message: string;
  cta?: { label: string; href?: string };
}

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
  const [saveError, setSaveError] = useState<ApiClientError | null>(null);

  // Ops warnings state
  const [opsWarnings, setOpsWarnings] = useState<OpsWarning[]>([]);
  const [warningsLoading, setWarningsLoading] = useState(false);

  // Fetch auth user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        if (!roleData.ok || !roleData.user) {
          router.push('/login?redirect=/admin/products');
          return;
        }

        setAuthUser({
          id: roleData.user.id,
          email: roleData.user.email || null,
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
  const handleEdit = async (product: ProductStats) => {
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
    setOpsWarnings([]);
    setEditDrawerOpen(true);

    // Fetch ops warnings
    setWarningsLoading(true);
    try {
      const res = await fetch(`/api/admin/ops-warnings?type=product&id=${product.id}`);
      const data = await res.json();
      if (data.ok && data.data?.warnings) {
        setOpsWarnings(data.data.warnings);
      }
    } catch (err) {
      console.error('Failed to fetch ops warnings:', err);
    } finally {
      setWarningsLoading(false);
    }
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

    const result = await patchJson<Product>(
      `/api/products/${editingProduct.id}`,
      editForm
    );

    setSaving(false);

    if (isApiError(result)) {
      setSaveError(result);
      return;
    }

    // Update local state
    setProductStats(prev =>
      prev.map(p => p.id === editingProduct.id ? { ...p, ...result.data } : p)
    );

    handleCloseDrawer();
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
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-zinc-500">Checking access...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-zinc-500">Redirecting to login...</div>
      </div>
    );
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
    <AdminPageLayout
      title="Products"
      subtitle="Manage product catalog and view statistics"
      isAdmin={isAdmin}
      headerActions={
        <AdminButton variant="secondary" onClick={fetchProductStats}>
          Refresh
        </AdminButton>
      }
    >
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Brand:</label>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="">All Brands</option>
            {uniqueBrands.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Category:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
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
            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:underline"
          >
            Clear Filters
          </button>
        )}

        <div className="ml-auto text-sm text-slate-500">
          {filteredProducts.length} of {productStats.length} products
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      <AdminCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading product statistics...</div>
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            title={productStats.length === 0 ? "No products yet" : "No matches"}
            description={productStats.length === 0
              ? "Add products to see statistics here."
              : "No products match the current filters."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Product</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Brand</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Category</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">This Month</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">In Queue</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Posted</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Target Accounts</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const duplicateWarning = getDuplicateWarning(product);
                  return (
                    <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-slate-800">{product.name}</span>
                          {product.product_display_name && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              Display: {product.product_display_name}
                            </div>
                          )}
                          {duplicateWarning && (
                            <div className="text-xs text-amber-600 mt-1">
                              {duplicateWarning}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                          {product.brand}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {product.category}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700">
                        {product.videos_this_month}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          product.in_queue > 0
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {product.in_queue}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          product.posted > 0
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {product.posted}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {product.target_accounts.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {product.target_accounts.slice(0, 3).map((account, idx) => (
                              <span key={idx} className="px-1.5 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
                                {account}
                              </span>
                            ))}
                            {product.target_accounts.length > 3 && (
                              <span className="text-xs text-slate-400">
                                +{product.target_accounts.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {isAdmin && (
                            <button
                              onClick={() => handleEdit(product)}
                              className="text-xs text-slate-600 hover:text-slate-800 hover:underline"
                            >
                              Edit
                            </button>
                          )}
                          <Link
                            href={`/admin/pipeline?product=${encodeURIComponent(product.id)}`}
                            className="text-xs text-blue-600 hover:underline"
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
      </AdminCard>

      <div className="text-xs text-slate-500">
        Showing {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
      </div>

      {/* Edit Drawer */}
      {editDrawerOpen && editingProduct && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={handleCloseDrawer}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Edit Product</h2>
              <button
                onClick={handleCloseDrawer}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {saveError && (
                <ApiErrorPanel
                  error={saveError}
                  onDismiss={() => setSaveError(null)}
                />
              )}

              {/* Ops Warnings */}
              {opsWarnings.length > 0 && (
                <div className="space-y-2">
                  {opsWarnings.map((warning) => (
                    <div
                      key={warning.code}
                      className={`p-3 rounded-md text-sm ${
                        warning.severity === 'warn'
                          ? 'bg-amber-50 border border-amber-200 text-amber-800'
                          : 'bg-slate-50 border border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="font-medium text-xs uppercase tracking-wide mb-1">
                        {warning.title}
                      </div>
                      <div className="text-xs">{warning.message}</div>
                      {warning.cta && (
                        <Link
                          href={warning.cta.href || '#'}
                          className="text-xs text-slate-500 hover:underline mt-1 inline-block"
                        >
                          {warning.cta.label}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>

              {/* Product Display Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Display Name
                  <span className="text-slate-400 font-normal ml-1">(TikTok-safe, max 30 chars)</span>
                </label>
                <input
                  type="text"
                  value={editForm.product_display_name || ''}
                  onChange={(e) => setEditForm({ ...editForm, product_display_name: e.target.value })}
                  maxLength={30}
                  placeholder="Short name for TikTok"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {(editForm.product_display_name || '').length}/30 characters
                </p>
              </div>

              {/* Brand */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Brand <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.brand || ''}
                  onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.category || ''}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>

              {/* Category Risk */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Category Risk
                </label>
                <select
                  value={editForm.category_risk || ''}
                  onChange={(e) => setEditForm({ ...editForm, category_risk: (e.target.value as 'low' | 'medium' | 'high') || null })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="">Not set</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Primary Link */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Primary Link
                </label>
                <input
                  type="url"
                  value={editForm.primary_link || ''}
                  onChange={(e) => setEditForm({ ...editForm, primary_link: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>

              {/* TikTok Showcase URL */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  TikTok Showcase URL
                </label>
                <input
                  type="url"
                  value={editForm.tiktok_showcase_url || ''}
                  onChange={(e) => setEditForm({ ...editForm, tiktok_showcase_url: e.target.value })}
                  placeholder="https://www.tiktok.com/..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  value={editForm.slug || ''}
                  onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                  placeholder="product-slug"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={4}
                  placeholder="Product-specific notes, talking points, compliance warnings..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>

              {/* Audit Trail Link */}
              <div className="pt-2 border-t border-slate-100">
                <Link
                  href={`/admin/audit-log?entity_type=product&entity_id=${editingProduct.id}`}
                  className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
                >
                  View audit trail
                </Link>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <AdminButton variant="secondary" onClick={handleCloseDrawer}>
                Cancel
              </AdminButton>
              <AdminButton onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </AdminButton>
            </div>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}
