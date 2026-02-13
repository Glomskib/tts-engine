'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState } from '../components/AdminPageLayout';
import { patchJson, isApiError, type ApiClientError } from '@/lib/http/fetchJson';
import ApiErrorPanel from '../components/ApiErrorPanel';
import { SkeletonAuthCheck, SkeletonTable } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';

interface PainPoint {
  point: string;
  category: 'emotional' | 'practical' | 'social' | 'financial';
  intensity: 'mild' | 'moderate' | 'severe';
  hook_angle: string;
}

interface Product {
  id: string;
  name: string;
  brand: string;
  brand_id?: string | null;
  category: string;
  product_display_name?: string | null;
  description?: string | null;
  notes?: string | null;
  primary_link?: string | null;
  tiktok_showcase_url?: string | null;
  slug?: string | null;
  category_risk?: 'low' | 'medium' | 'high' | null;
  pain_points?: PainPoint[] | null;
  product_image_url?: string | null;  // Primary hero image for video generation
  images?: string[];                   // Additional product images gallery
  created_at?: string;
}

interface BrandEntity {
  id: string;
  name: string;
  monthly_video_quota?: number | null;
  videos_this_month?: number | null;
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

  // Add product drawer state
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);
  const [addForm, setAddForm] = useState<Partial<Product>>({});
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  // Ops warnings state
  const [opsWarnings, setOpsWarnings] = useState<OpsWarning[]>([]);
  const [, setWarningsLoading] = useState(false);

  // Pain points generation state
  const [generatingPainPoints, setGeneratingPainPoints] = useState(false);
  const [painPointsError, setPainPointsError] = useState<string | null>(null);

  // Image modal state
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  // Bulk selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Brand entities for linking
  const [brandEntities, setBrandEntities] = useState<BrandEntity[]>([]);
  const [brandEntityFilter, setBrandEntityFilter] = useState<string>('');

  // Quick brand creation
  const [showQuickBrand, setShowQuickBrand] = useState(false);
  const [quickBrandName, setQuickBrandName] = useState('');
  const [creatingBrand, setCreatingBrand] = useState(false);

  // Sort state
  const [sortBy, setSortBy] = useState<'name' | 'brand' | 'posted' | 'this_month' | 'in_queue'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const { showSuccess, showError } = useToast();

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

      const products: Product[] = productsData.data?.products || [];

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
      // Fetch brand entities for linking (includes quota fields)
      fetch('/api/brands')
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.data) {
            setBrandEntities(data.data.map((b: Record<string, unknown>) => ({
              id: b.id as string,
              name: b.name as string,
              monthly_video_quota: (b.monthly_video_quota as number) ?? null,
              videos_this_month: (b.videos_this_month as number) ?? null,
            })));
          }
        })
        .catch(err => console.error('Failed to fetch brands:', err));
    }
  }, [authLoading, authUser, fetchProductStats]);

  // Open edit drawer
  const handleEdit = async (product: ProductStats) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      brand: product.brand,
      brand_id: product.brand_id || null,
      category: product.category,
      product_display_name: product.product_display_name || '',
      description: product.description || '',
      notes: product.notes || '',
      primary_link: product.primary_link || '',
      tiktok_showcase_url: product.tiktok_showcase_url || '',
      slug: product.slug || '',
      category_risk: product.category_risk || null,
      pain_points: product.pain_points || [],
      product_image_url: product.product_image_url || '',
      images: product.images || [],
    });
    setSaveError(null);
    setOpsWarnings([]);
    setPainPointsError(null);
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

  // Open add drawer
  const handleAddOpen = () => {
    setAddForm({ name: '', brand: '', brand_id: null, category: '' });
    setAddError(null);
    setAddDrawerOpen(true);
  };

  // Close add drawer
  const handleAddClose = () => {
    setAddDrawerOpen(false);
    setAddForm({});
    setAddError(null);
  };

  // Save new product
  const handleAddSave = async () => {
    if (!addForm.name?.trim() || !addForm.brand_id || !addForm.category?.trim()) {
      setAddError('Name, Brand, and Category are required');
      return;
    }

    // Get brand name from selected brand entity
    const selectedBrand = brandEntities.find(b => b.id === addForm.brand_id);
    const brandName = selectedBrand?.name || '';

    setAddSaving(true);
    setAddError(null);

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name.trim(),
          brand: brandName, // Keep for backwards compat
          brand_id: addForm.brand_id,
          category: addForm.category.trim(),
          category_risk: addForm.category_risk || null,
          notes: addForm.notes?.trim() || null,
        }),
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to create product');
      }

      // Refresh product list
      await fetchProductStats();
      handleAddClose();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create product');
    } finally {
      setAddSaving(false);
    }
  };

  // Quick brand creation from add product form
  const handleQuickBrandCreate = async () => {
    if (!quickBrandName.trim()) return;

    setCreatingBrand(true);
    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: quickBrandName.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAddError(data.error?.message || data.error || 'Failed to create brand');
        return;
      }
      // Add to brand entities and auto-select
      const newBrand = data.data;
      setBrandEntities(prev => [...prev, { id: newBrand.id, name: newBrand.name }].sort((a, b) => a.name.localeCompare(b.name)));
      setAddForm(prev => ({ ...prev, brand_id: newBrand.id }));
      setShowQuickBrand(false);
      setQuickBrandName('');
    } catch {
      setAddError('Failed to create brand');
    } finally {
      setCreatingBrand(false);
    }
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
      showError('Failed to update product');
      return;
    }

    // Update local state
    setProductStats(prev =>
      prev.map(p => p.id === editingProduct.id ? { ...p, ...result.data } : p)
    );

    showSuccess('Product updated');
    handleCloseDrawer();
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedProducts.size === 0) return;

    const confirmed = window.confirm(
      `Delete ${selectedProducts.size} product(s)? This cannot be undone.`
    );

    if (!confirmed) return;

    setBulkDeleting(true);
    try {
      const res = await fetch('/api/products/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedProducts) }),
      });

      const data = await res.json();
      if (data.ok) {
        setSelectedProducts(new Set());
        fetchProductStats();
      } else {
        setError(data.message || 'Failed to delete products');
      }
    } catch (err) {
      console.error('Bulk delete failed:', err);
      setError('Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Toggle single product selection
  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // Toggle all products selection
  const toggleAllSelection = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    }
  };

  // Generate pain points handler
  const handleGeneratePainPoints = async () => {
    if (!editingProduct) return;

    setGeneratingPainPoints(true);
    setPainPointsError(null);

    try {
      const res = await fetch('/api/products/generate-pain-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          product_id: editingProduct.id,
          product_name: editForm.name || editingProduct.name,
          product_description: editForm.notes || editForm.description || editingProduct.notes || editingProduct.description,
          save_to_product: true,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to generate pain points');
      }

      // Update the edit form with the new pain points
      setEditForm(prev => ({
        ...prev,
        pain_points: data.data.pain_points,
      }));

      // Update local state to reflect saved pain points
      setProductStats(prev =>
        prev.map(p =>
          p.id === editingProduct.id
            ? { ...p, pain_points: data.data.pain_points }
            : p
        )
      );
    } catch (err) {
      setPainPointsError(err instanceof Error ? err.message : 'Failed to generate pain points');
    } finally {
      setGeneratingPainPoints(false);
    }
  };

  // Remove a pain point
  const handleRemovePainPoint = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      pain_points: prev.pain_points?.filter((_, i) => i !== index) || [],
    }));
  };

  // Handle image file upload
  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setImageUploadError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageUploadError('Image must be smaller than 5MB');
      return;
    }

    setUploadingImage(true);
    setImageUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'product-images');

      const res = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      // Set the uploaded image URL as the product_image_url
      setEditForm(prev => ({
        ...prev,
        product_image_url: data.data.url,
      }));

      showSuccess('Image uploaded successfully!');
    } catch (err) {
      setImageUploadError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploadingImage(false);
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
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <SkeletonAuthCheck />
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
    if (brandEntityFilter) {
      if (brandEntityFilter === 'unlinked') {
        if (p.brand_id) return false;
      } else {
        if (p.brand_id !== brandEntityFilter) return false;
      }
    }
    return true;
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortBy) {
      case 'name': return dir * a.name.localeCompare(b.name);
      case 'brand': return dir * a.brand.localeCompare(b.brand);
      case 'posted': return dir * (a.posted - b.posted);
      case 'this_month': return dir * (a.videos_this_month - b.videos_this_month);
      case 'in_queue': return dir * (a.in_queue - b.in_queue);
      default: return 0;
    }
  });

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir(col === 'name' || col === 'brand' ? 'asc' : 'desc');
    }
  };

  const SortIndicator = ({ col }: { col: typeof sortBy }) => (
    sortBy === col ? <span className="ml-1 text-teal-400">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span> : null
  );

  return (
    <AdminPageLayout
      title="Products"
      subtitle="Manage product catalog and view statistics"
      isAdmin={isAdmin}
      breadcrumbs={[
        { label: 'Dashboard', href: '/admin' },
        { label: 'Products' },
      ]}
      headerActions={
        <div className="flex gap-2">
          {selectedProducts.size > 0 && isAdmin && (
            <AdminButton
              variant="danger"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? 'Deleting...' : `Delete (${selectedProducts.size})`}
            </AdminButton>
          )}
          <AdminButton variant="secondary" onClick={fetchProductStats}>
            Refresh
          </AdminButton>
          <AdminButton onClick={handleAddOpen}>
            + Add Product
          </AdminButton>
        </div>
      }
    >
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-zinc-400">Brand:</label>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-white/10 rounded-md bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">All Brands</option>
            {uniqueBrands.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-zinc-400">Category:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-white/10 rounded-md bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">All Categories</option>
            {uniqueCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {brandEntities.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-zinc-400">Brand Entity:</label>
            <select
              value={brandEntityFilter}
              onChange={(e) => setBrandEntityFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-white/10 rounded-md bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">All</option>
              <option value="unlinked">Unlinked</option>
              {brandEntities.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        {(brandFilter || categoryFilter || brandEntityFilter) && (
          <button type="button"
            onClick={() => { setBrandFilter(''); setCategoryFilter(''); setBrandEntityFilter(''); }}
            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:underline"
          >
            Clear Filters
          </button>
        )}

        <div className="ml-auto text-sm text-zinc-400">
          {filteredProducts.length} of {productStats.length} products
        </div>
      </div>

      {/* Brand Quotas Summary */}
      {(() => {
        const brandsWithQuota = brandEntities.filter(b => b.monthly_video_quota && b.monthly_video_quota > 0);
        if (brandsWithQuota.length === 0) return null;
        return (
          <AdminCard>
            <div className="mb-2 text-sm font-semibold text-zinc-300">Brand Quotas</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {brandsWithQuota.map(brand => {
                const used = brand.videos_this_month ?? 0;
                const quota = brand.monthly_video_quota!;
                const pct = Math.min((used / quota) * 100, 100);
                const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-teal-500';
                const textColor = pct >= 100 ? 'text-red-400' : pct >= 80 ? 'text-amber-400' : 'text-teal-400';
                return (
                  <div key={brand.id} className="p-3 bg-zinc-800/50 border border-white/5 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-zinc-200 truncate">{brand.name}</span>
                      <span className={`text-xs font-semibold ${textColor}`}>{used}/{quota}</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </AdminCard>
        );
      })()}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      <AdminCard noPadding>
        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
            }
            title={productStats.length === 0 ? "Add your first product" : "No matches"}
            description={productStats.length === 0
              ? "FlashFlow writes scripts about your products. Add one to get started — just a name, brand, and category."
              : "No products match the current filters."
            }
            action={productStats.length === 0 ? (
              <AdminButton onClick={handleAddOpen}>+ Add Product</AdminButton>
            ) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-800/50 border-b border-white/10">
                  {isAdmin && (
                    <th className="px-4 py-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                        onChange={toggleAllSelection}
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-teal-500 focus:ring-teal-500"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-center font-medium text-zinc-400 w-16">Image</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400 cursor-pointer select-none hover:text-zinc-200" onClick={() => handleSort('name')}>Product<SortIndicator col="name" /></th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400 cursor-pointer select-none hover:text-zinc-200" onClick={() => handleSort('brand')}>Brand<SortIndicator col="brand" /></th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Category</th>
                  <th className="px-4 py-3 text-center font-medium text-zinc-400 cursor-pointer select-none hover:text-zinc-200" onClick={() => handleSort('this_month')}>This Month<SortIndicator col="this_month" /></th>
                  <th className="px-4 py-3 text-center font-medium text-zinc-400 cursor-pointer select-none hover:text-zinc-200" onClick={() => handleSort('in_queue')}>In Queue<SortIndicator col="in_queue" /></th>
                  <th className="px-4 py-3 text-center font-medium text-zinc-400 cursor-pointer select-none hover:text-zinc-200" onClick={() => handleSort('posted')}>Posted<SortIndicator col="posted" /></th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Target Accounts</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const duplicateWarning = getDuplicateWarning(product);
                  return (
                    <tr key={product.id} className="border-b border-white/5 hover:bg-zinc-800/50">
                      {isAdmin && (
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleProductSelection(product.id)}
                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-teal-500 focus:ring-teal-500"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        {product.product_image_url ? (
                          <button
                            onClick={() => {
                              setImageModalUrl(product.product_image_url || null);
                              setImageModalOpen(true);
                            }}
                            className="inline-block overflow-hidden rounded border border-white/10 hover:border-teal-500/50 transition-colors"
                          >
                            <img
                              src={product.product_image_url}
                              alt={product.name}
                              className="w-12 h-12 object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded border border-white/10 bg-zinc-800 flex items-center justify-center text-zinc-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-zinc-100">{product.name}</span>
                          {product.product_display_name && (
                            <div className="text-xs text-zinc-400 mt-0.5">
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
                        <span className="px-2 py-0.5 bg-zinc-700/50 text-zinc-300 rounded text-xs font-medium">
                          {product.brand}
                        </span>
                        {(() => {
                          const brandEntity = product.brand_id
                            ? brandEntities.find(b => b.id === product.brand_id)
                            : null;
                          if (!brandEntity?.monthly_video_quota || brandEntity.monthly_video_quota <= 0) return null;
                          const used = brandEntity.videos_this_month ?? 0;
                          const quota = brandEntity.monthly_video_quota;
                          if (used >= quota) {
                            return <span className="ml-1.5 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px] font-semibold">Over quota</span>;
                          }
                          if (used >= quota * 0.8) {
                            return <span className="ml-1.5 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px] font-semibold">Near quota</span>;
                          }
                          return null;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {product.category}
                      </td>
                      <td className="px-4 py-3 text-center text-zinc-300">
                        {product.videos_this_month}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          product.in_queue > 0
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-zinc-700/50 text-zinc-400'
                        }`}>
                          {product.in_queue}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          product.posted > 0
                            ? 'bg-green-100 text-green-700'
                            : 'bg-zinc-700/50 text-zinc-400'
                        }`}>
                          {product.posted}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {product.target_accounts.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {product.target_accounts.slice(0, 3).map((account, idx) => (
                              <span key={idx} className="px-1.5 py-0.5 bg-zinc-700/50 rounded text-xs text-zinc-400">
                                {account}
                              </span>
                            ))}
                            {product.target_accounts.length > 3 && (
                              <span className="text-xs text-zinc-500">
                                +{product.target_accounts.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500 text-xs">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {isAdmin && (
                            <button type="button"
                              onClick={() => handleEdit(product)}
                              className="text-xs text-zinc-400 hover:text-zinc-100 hover:underline"
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

      <div className="text-xs text-zinc-400">
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
          <div className="relative w-full max-w-md bg-zinc-900 shadow-xl flex flex-col border-l border-white/10">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-100">Edit Product</h2>
              <button type="button"
                onClick={handleCloseDrawer}
                className="text-zinc-400 hover:text-zinc-200"
                aria-label="Close"
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
                          : 'bg-zinc-800/50 border border-white/10 text-zinc-300'
                      }`}
                    >
                      <div className="font-medium text-xs uppercase tracking-wide mb-1">
                        {warning.title}
                      </div>
                      <div className="text-xs">{warning.message}</div>
                      {warning.cta && (
                        <Link
                          href={warning.cta.href || '#'}
                          className="text-xs text-zinc-400 hover:underline mt-1 inline-block"
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
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Product Display Name */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Display Name
                  <span className="text-zinc-500 font-normal ml-1">(TikTok-safe, max 30 chars)</span>
                </label>
                <input
                  type="text"
                  value={editForm.product_display_name || ''}
                  onChange={(e) => setEditForm({ ...editForm, product_display_name: e.target.value })}
                  maxLength={30}
                  placeholder="Short name for TikTok"
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-xs text-zinc-400 mt-1">
                  {(editForm.product_display_name || '').length}/30 characters
                </p>
              </div>

              {/* Brand */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Brand <span className="text-red-500">*</span>
                </label>
                <select
                  value={editForm.brand_id || ''}
                  onChange={(e) => {
                    const brandId = e.target.value || null;
                    const selectedBrand = brandEntities.find(b => b.id === brandId);
                    setEditForm({
                      ...editForm,
                      brand_id: brandId,
                      brand: selectedBrand?.name || editForm.brand
                    });
                  }}
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">Select a brand...</option>
                  {brandEntities.map(brand => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
                {!editForm.brand_id && editForm.brand && (
                  <p className="text-xs text-amber-400 mt-1">
                    Legacy brand: &quot;{editForm.brand}&quot; - select a brand entity to link
                  </p>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.category || ''}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Category Risk */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Category Risk
                </label>
                <select
                  value={editForm.category_risk || ''}
                  onChange={(e) => setEditForm({ ...editForm, category_risk: (e.target.value as 'low' | 'medium' | 'high') || null })}
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">Not set</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>


              {/* Primary Link */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Primary Link
                </label>
                <input
                  type="url"
                  value={editForm.primary_link || ''}
                  onChange={(e) => setEditForm({ ...editForm, primary_link: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* TikTok Showcase URL */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  TikTok Showcase URL
                </label>
                <input
                  type="url"
                  value={editForm.tiktok_showcase_url || ''}
                  onChange={(e) => setEditForm({ ...editForm, tiktok_showcase_url: e.target.value })}
                  placeholder="https://www.tiktok.com/..."
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  value={editForm.slug || ''}
                  onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                  placeholder="product-slug"
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Product Image */}
              <div className="pt-4 border-t border-white/10">
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Product Image
                  <span className="text-zinc-500 font-normal ml-1">(for Bolt AI video generation)</span>
                </label>

                {/* Current Image Preview */}
                {editForm.product_image_url && (
                  <div className="mb-3 relative group">
                    <img
                      src={editForm.product_image_url}
                      alt="Product"
                      className="w-full max-w-xs h-48 object-cover rounded-lg border border-white/10"
                    />
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, product_image_url: '' })}
                      className="absolute top-2 right-2 p-1.5 bg-red-500/90 hover:bg-red-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove image"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Image URL Input */}
                <div className="mb-2">
                  <input
                    type="url"
                    value={editForm.product_image_url || ''}
                    onChange={(e) => setEditForm({ ...editForm, product_image_url: e.target.value })}
                    placeholder="https://example.com/product-image.jpg"
                    className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Paste image URL from Amazon, TikTok, or brand website</p>
                </div>

                {/* OR Divider */}
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-white/10"></div>
                  <span className="text-xs text-zinc-500 uppercase">or</span>
                  <div className="flex-1 h-px bg-white/10"></div>
                </div>

                {/* File Upload */}
                <div>
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                      disabled={uploadingImage}
                      className="hidden"
                      id="product-image-upload"
                    />
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 border border-white/10 text-zinc-100 text-sm font-medium rounded-md cursor-pointer transition-colors">
                      {uploadingImage ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Uploading...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          Upload Image File
                        </>
                      )}
                    </span>
                  </label>
                  <p className="text-xs text-zinc-500 mt-1">Max 5MB • JPG, PNG, WebP</p>
                </div>

                {/* Upload Error */}
                {imageUploadError && (
                  <div className="mt-2 p-2 text-xs bg-red-900/50 border border-red-500/50 text-red-200 rounded">
                    {imageUploadError}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={4}
                  placeholder="Product-specific notes, talking points, compliance warnings..."
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Pain Points Section */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-zinc-300">
                    Pain Points
                    <span className="text-zinc-500 font-normal ml-1">(for AI script generation)</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePainPoints}
                    disabled={generatingPainPoints}
                    className="px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white rounded-md transition-colors"
                  >
                    {generatingPainPoints ? 'Generating...' : 'Auto-Generate'}
                  </button>
                </div>

                {painPointsError && (
                  <div className="mb-3 p-2 text-xs bg-red-900/50 border border-red-500/50 text-red-200 rounded">
                    {painPointsError}
                  </div>
                )}

                {editForm.pain_points && editForm.pain_points.length > 0 ? (
                  <div className="space-y-2">
                    {editForm.pain_points.map((pp, index) => (
                      <div
                        key={index}
                        className="p-3 bg-zinc-800/50 border border-white/5 rounded-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-200">{pp.point}</p>
                            <div className="flex gap-2 mt-1.5">
                              <span className={`px-1.5 py-0.5 text-xs rounded ${
                                pp.category === 'emotional' ? 'bg-pink-900/50 text-pink-300' :
                                pp.category === 'practical' ? 'bg-blue-900/50 text-blue-300' :
                                pp.category === 'social' ? 'bg-purple-900/50 text-purple-300' :
                                'bg-green-900/50 text-green-300'
                              }`}>
                                {pp.category}
                              </span>
                              <span className={`px-1.5 py-0.5 text-xs rounded ${
                                pp.intensity === 'severe' ? 'bg-red-900/50 text-red-300' :
                                pp.intensity === 'moderate' ? 'bg-amber-900/50 text-amber-300' :
                                'bg-zinc-700 text-zinc-300'
                              }`}>
                                {pp.intensity}
                              </span>
                            </div>
                            {pp.hook_angle && (
                              <p className="text-xs text-zinc-400 mt-1.5 italic">
                                Hook: &quot;{pp.hook_angle}&quot;
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePainPoint(index)}
                            className="text-zinc-500 hover:text-red-400 p-1"
                            title="Remove pain point"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center border border-dashed border-white/10 rounded-md">
                    <p className="text-sm text-zinc-500">No pain points yet</p>
                    <p className="text-xs text-zinc-600 mt-1">
                      Click &quot;Auto-Generate&quot; to create pain points using AI
                    </p>
                  </div>
                )}
              </div>

              {/* Audit Trail Link */}
              <div className="pt-2 border-t border-white/5">
                <Link
                  href={`/admin/audit-log?entity_type=product&entity_id=${editingProduct.id}`}
                  className="text-xs text-zinc-400 hover:text-zinc-300 hover:underline"
                >
                  View audit trail
                </Link>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
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

      {/* Add Product Drawer */}
      {addDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={handleAddClose}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-zinc-900 shadow-xl flex flex-col border-l border-white/10">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-100">Add Product</h2>
              <button type="button"
                onClick={handleAddClose}
                className="text-zinc-400 hover:text-zinc-200"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {addError && (
                <div className="p-3 rounded-md text-sm bg-red-900/50 border border-red-500/50 text-red-200">
                  {addError}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={addForm.name || ''}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="e.g., Vitamin D3 Gummies"
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Brand */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Brand <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={addForm.brand_id || ''}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setShowQuickBrand(true);
                      } else {
                        setAddForm({ ...addForm, brand_id: e.target.value || null });
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Select a brand...</option>
                    {brandEntities.map(brand => (
                      <option key={brand.id} value={brand.id}>{brand.name}</option>
                    ))}
                    <option value="__new__">+ Create New Brand</option>
                  </select>
                </div>
                {showQuickBrand && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={quickBrandName}
                      onChange={(e) => setQuickBrandName(e.target.value)}
                      placeholder="New brand name..."
                      className="flex-1 px-3 py-2 border border-teal-500/50 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleQuickBrandCreate(); }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleQuickBrandCreate}
                      disabled={creatingBrand || !quickBrandName.trim()}
                      className="px-3 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-md disabled:opacity-50"
                    >
                      {creatingBrand ? '...' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowQuickBrand(false); setQuickBrandName(''); }}
                      className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {brandEntities.length === 0 && !showQuickBrand && (
                  <p className="text-xs text-zinc-500 mt-1">
                    No brands yet — select &quot;+ Create New Brand&quot; above.
                  </p>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={addForm.category || ''}
                  onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                  placeholder="e.g., Supplements"
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Category Risk */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Category Risk
                </label>
                <select
                  value={addForm.category_risk || ''}
                  onChange={(e) => setAddForm({ ...addForm, category_risk: (e.target.value as 'low' | 'medium' | 'high') || undefined })}
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">Not set</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={addForm.notes || ''}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Product-specific notes, talking points..."
                  className="w-full px-3 py-2 border border-white/10 rounded-md text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
              <AdminButton variant="secondary" onClick={handleAddClose}>
                Cancel
              </AdminButton>
              <AdminButton onClick={handleAddSave} disabled={addSaving}>
                {addSaving ? 'Creating...' : 'Create Product'}
              </AdminButton>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {imageModalOpen && imageModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setImageModalOpen(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setImageModalOpen(false)}
              className="absolute top-2 right-2 z-10 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={imageModalUrl}
              alt="Product image"
              className="max-w-full max-h-[90vh] object-contain"
            />
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}
