'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Building2, Edit, Trash2, ExternalLink, X, Loader2,
  TrendingUp, Video, Trophy, Target, AlertCircle, CheckCircle,
  DollarSign, ChevronDown,
} from 'lucide-react';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState } from '../components/AdminPageLayout';
import { SkeletonAuthCheck, SkeletonTable } from '@/components/ui/Skeleton';
import { Progress } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { computeBrandStats, BrandStats, BrandVideo, BrandProduct, BrandWinner } from '@/lib/brands/brand-stats';

interface BonusTier {
  videos?: number;
  payout?: number;
  gmv?: number;
  bonus?: number;
  label: string;
}

interface Brand {
  id: string;
  name: string;
  logo_url?: string | null;
  brand_image_url?: string | null;  // Brand logo/image for video generation
  website?: string | null;
  description?: string | null;
  colors?: string[];
  tone_of_voice?: string | null;
  target_audience?: string | null;
  guidelines?: string | null;
  monthly_video_quota: number;
  videos_this_month: number;
  is_active: boolean;
  created_at: string;
  retainer_type?: string;
  retainer_video_goal?: number;
  retainer_period_start?: string | null;
  retainer_period_end?: string | null;
  retainer_payout_amount?: number;
  retainer_bonus_tiers?: BonusTier[];
  retainer_notes?: string | null;
  brand_profile_json?: {
    category?: string;
    product_types?: string[];
    key_angles?: string[];
    compliance_notes?: string | null;
    claims_to_avoid?: string | null;
  };
}


interface AuthUser {
  id: string;
  email: string | null;
  role: 'admin' | 'recorder' | 'editor' | 'uploader' | null;
}

export default function BrandsPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { showSuccess, showError } = useToast();
  // Analytics data
  const [brandStats, setBrandStats] = useState<BrandStats[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  // Fetch auth user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        if (!roleData.ok || !roleData.user) {
          router.push('/login?redirect=/admin/brands');
          return;
        }

        setAuthUser({
          id: roleData.user.id,
          email: roleData.user.email || null,
          role: roleData.role || null,
        });
      } catch (err) {
        console.error('Failed to fetch auth user:', err);
        router.push('/login?redirect=/admin/brands');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch brands
  const fetchBrands = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/brands');
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.message || 'Failed to fetch brands');
      }

      setBrands(data.data || []);
    } catch (err) {
      console.error('Failed to fetch brands:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch brand analytics data
  const fetchBrandStats = useCallback(async (brandList: Brand[]) => {
    if (brandList.length === 0) return;
    setStatsLoading(true);
    try {
      const [videosRes, productsRes, winnersRes] = await Promise.all([
        fetch('/api/admin/videos?limit=500'),
        fetch('/api/products'),
        fetch('/api/admin/winners-bank?limit=200'),
      ]);
      const [videosData, productsData, winnersData] = await Promise.all([
        videosRes.json(),
        productsRes.json(),
        winnersRes.json(),
      ]);

      const videos: BrandVideo[] = (videosData.data || []).map((v: Record<string, unknown>) => ({
        brand_name: v.brand_name || null,
        product_name: v.product_name || null,
        recording_status: v.recording_status || null,
        tiktok_views: v.tiktok_views || null,
        tiktok_likes: v.tiktok_likes || null,
      }));
      const products: BrandProduct[] = (productsData.data || []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: p.name as string,
        brand: p.brand as string,
      }));
      const winners: BrandWinner[] = (winnersData.data || []).map((w: Record<string, unknown>) => ({
        brand: (w.brand as string) || null,
      }));

      const stats = brandList.map(brand => computeBrandStats(brand, videos, products, winners));
      setBrandStats(stats);
    } catch {
      // stats are supplementary, don't block main page
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && authUser) {
      fetchBrands();
    }
  }, [authLoading, authUser, fetchBrands]);

  // Fetch stats after brands load
  useEffect(() => {
    if (brands.length > 0) {
      fetchBrandStats(brands);
    }
  }, [brands, fetchBrandStats]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this brand? Products will be unlinked but not deleted.')) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/brands/${id}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.ok) {
        fetchBrands();
        showSuccess('Brand deleted');
      } else {
        showError('Failed to delete brand');
      }
    } catch (err) {
      console.error('Delete error:', err);
      showError('Failed to delete brand');
    } finally {
      setDeleting(null);
    }
  };

  const handleSave = async () => {
    setIsModalOpen(false);
    setEditingBrand(null);
    fetchBrands();
    showSuccess('Brand saved');
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

  return (
    <AdminPageLayout
      title="Brands"
      subtitle="Manage your brands and their video quotas"
      isAdmin={authUser.role === 'admin'}
      headerActions={
        <div className="flex gap-2">
          <AdminButton variant="secondary" onClick={fetchBrands}>
            Refresh
          </AdminButton>
          <AdminButton onClick={() => { setEditingBrand(null); setIsModalOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" />
            Add Brand
          </AdminButton>
        </div>
      }
    >
      {error && (
        <div className="bg-red-900/50 border border-red-500/50 rounded-md p-3 text-sm text-red-200">
          Error: {error}
        </div>
      )}

      {/* Brand Health Dashboard */}
      {brandStats.length > 0 && !statsLoading && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3">Brand Health Overview</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            {brandStats.map(stat => {
              const healthColor = stat.health_label === 'excellent' ? 'text-green-400' :
                stat.health_label === 'good' ? 'text-teal-400' :
                stat.health_label === 'needs_attention' ? 'text-yellow-400' : 'text-red-400';
              const healthBg = stat.health_label === 'excellent' ? 'bg-green-500' :
                stat.health_label === 'good' ? 'bg-teal-500' :
                stat.health_label === 'needs_attention' ? 'bg-yellow-500' : 'bg-red-500';
              const HealthIcon = stat.health_label === 'excellent' || stat.health_label === 'good'
                ? CheckCircle : AlertCircle;

              return (
                <div key={stat.brand} className="bg-zinc-800/50 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-zinc-200 truncate">{stat.brand}</span>
                    <div className={`flex items-center gap-1 text-xs ${healthColor}`}>
                      <HealthIcon className="w-3.5 h-3.5" />
                      {stat.health_score}
                    </div>
                  </div>
                  {/* Health bar */}
                  <Progress
                    value={stat.health_score / 100}
                    size="sm"
                    showLabels={false}
                    intent={
                      stat.health_label === 'excellent' ? 'success' :
                      stat.health_label === 'good'      ? 'default' :
                      stat.health_label === 'needs_attention' ? 'warn' : 'danger'
                    }
                    className="mb-3"
                    aria-label={`Health score ${stat.health_score}%`}
                  />
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Video className="w-3 h-3" /> {stat.posted_videos}/{stat.total_videos} posted
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Trophy className="w-3 h-3 text-yellow-500" /> {stat.winner_count} winners
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <TrendingUp className="w-3 h-3" /> {stat.avg_engagement}% eng.
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Target className="w-3 h-3" /> {stat.products.length} products
                    </div>
                  </div>
                  {stat.suggested_product && (
                    <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-zinc-500">
                      Next: <span className="text-teal-400">{stat.suggested_product}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AdminCard noPadding>
        {loading ? (
          <SkeletonTable rows={4} cols={4} />
        ) : brands.length === 0 ? (
          <div className="py-10 px-6 text-center max-w-lg mx-auto">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-teal-400" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">Organize by brand</h3>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Brands let you group products, set retainer goals, and track video quotas in one place.
              If you work with multiple brands, this keeps everything organized.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { icon: <Building2 className="w-4 h-4" />, label: 'Create Brand', sub: 'Name & details' },
                { icon: <Target className="w-4 h-4" />, label: 'Set Quotas', sub: 'Retainers & goals' },
                { icon: <TrendingUp className="w-4 h-4" />, label: 'Track Progress', sub: 'Dashboard stats' },
              ].map((s) => (
                <div key={s.label} className="bg-zinc-800/60 rounded-lg p-3 border border-white/5">
                  <div className="text-teal-400 mb-1 flex justify-center">{s.icon}</div>
                  <div className="text-xs font-medium text-zinc-200">{s.label}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-3">
              <AdminButton onClick={() => { setEditingBrand(null); setIsModalOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" />
                Add Brand
              </AdminButton>
              <Link href="/admin/products" className="text-sm text-zinc-400 hover:text-zinc-300">
                or add products first &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {brands.map(brand => (
              <div key={brand.id} className="bg-zinc-800/50 border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {(brand.brand_image_url || brand.logo_url) ? (
                      <img
                        src={(brand.brand_image_url || brand.logo_url)!}
                        alt={brand.name}
                        className="w-10 h-10 rounded-lg object-cover border border-white/10"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-zinc-400" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-zinc-100">{brand.name}</h3>
                      {brand.website && (
                        <a
                          href={brand.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-teal-400 hover:underline flex items-center gap-1"
                        >
                          Website <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button"
                      onClick={() => { setEditingBrand(brand); setIsModalOpen(true); }}
                      className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button type="button"
                      onClick={() => handleDelete(brand.id)}
                      disabled={deleting === brand.id}
                      className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 rounded disabled:opacity-50"
                    >
                      {deleting === brand.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {brand.description && (
                  <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{brand.description}</p>
                )}

                {/* Color swatches */}
                {brand.colors && brand.colors.length > 0 && (
                  <div className="flex gap-1 mb-3">
                    {brand.colors.slice(0, 5).map((color, i) => (
                      <div
                        key={i}
                        className="w-6 h-6 rounded border border-white/20"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                    {brand.colors.length > 5 && (
                      <span className="text-xs text-zinc-500 ml-1">+{brand.colors.length - 5}</span>
                    )}
                  </div>
                )}

                {/* Quota progress */}
                {brand.monthly_video_quota > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <Progress
                      current={brand.videos_this_month}
                      total={brand.monthly_video_quota}
                      label="Monthly Quota"
                      sublabel={`${brand.videos_this_month} / ${brand.monthly_video_quota}`}
                      intent={brand.videos_this_month >= brand.monthly_video_quota ? 'danger' : 'default'}
                    />
                  </div>
                )}

                {brand.monthly_video_quota === 0 && (!brand.retainer_type || brand.retainer_type === 'none') && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <span className="text-xs text-zinc-500">Not on retainer</span>
                  </div>
                )}

                {/* Retainer badge */}
                {brand.retainer_type && brand.retainer_type !== 'none' && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-xs font-medium text-green-400 capitalize">{brand.retainer_type}</span>
                      {brand.retainer_video_goal ? (
                        <span className="text-xs text-zinc-400">
                          {brand.retainer_video_goal} videos &middot; ${brand.retainer_payout_amount}
                        </span>
                      ) : null}
                    </div>
                    {brand.retainer_period_end && (
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Ends {new Date(brand.retainer_period_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      {/* Brand Edit Modal */}
      {isModalOpen && (
        <BrandEditModal
          brand={editingBrand}
          onClose={() => { setIsModalOpen(false); setEditingBrand(null); }}
          onSave={handleSave}
        />
      )}
    </AdminPageLayout>
  );
}

// Accordion wrapper component
function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  badge,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden bg-zinc-900">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-200">{title}</span>
          {badge && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-700 text-zinc-400">{badge}</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="border-t border-white/10 p-4 space-y-4">{children}</div>}
    </div>
  );
}

const CATEGORY_OPTIONS = [
  'Health & Wellness',
  'Beauty & Skincare',
  'Supplements',
  'Food & Beverage',
  'Fitness',
  'Tech & Gadgets',
  'Home & Garden',
  'Fashion',
  'Pet',
  'Other',
];

const KEY_ANGLE_PLACEHOLDERS = [
  'e.g., All-natural ingredients',
  'e.g., Doctor recommended',
  'e.g., Made in the USA',
  'e.g., 30-day money back guarantee',
  'e.g., Featured on major publications',
];

// Brand Edit Modal Component
function BrandEditModal({
  brand,
  onClose,
  onSave,
}: {
  brand: Brand | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const profile = brand?.brand_profile_json || {};
  const [formData, setFormData] = useState({
    name: brand?.name || '',
    logo_url: brand?.logo_url || '',
    brand_image_url: brand?.brand_image_url || '',
    website: brand?.website || '',
    description: brand?.description || '',
    colors: brand?.colors || [],
    tone_of_voice: brand?.tone_of_voice || '',
    target_audience: brand?.target_audience || '',
    guidelines: brand?.guidelines || '',
    monthly_video_quota: brand?.monthly_video_quota || 0,
    retainer_type: brand?.retainer_type || 'none',
    retainer_video_goal: brand?.retainer_video_goal || 0,
    retainer_period_start: brand?.retainer_period_start || '',
    retainer_period_end: brand?.retainer_period_end || '',
    retainer_payout_amount: brand?.retainer_payout_amount || 0,
    retainer_bonus_tiers: (brand?.retainer_bonus_tiers || []) as BonusTier[],
    retainer_notes: brand?.retainer_notes || '',
    brand_profile_json: {
      category: profile.category || '',
      product_types: profile.product_types || [],
      key_angles: profile.key_angles || [],
      compliance_notes: profile.compliance_notes || '',
      claims_to_avoid: profile.claims_to_avoid || '',
    },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newColor, setNewColor] = useState('#10b981');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [productTypeInput, setProductTypeInput] = useState('');

  // Accordion state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(
    brand?.retainer_type !== undefined && brand.retainer_type !== 'none'
  );

  const updateProfile = <K extends keyof typeof formData.brand_profile_json>(
    key: K,
    val: (typeof formData.brand_profile_json)[K]
  ) => {
    setFormData({
      ...formData,
      brand_profile_json: { ...formData.brand_profile_json, [key]: val },
    });
  };

  // Count filled fields in Advanced accordion (11 fields)
  const advancedFilledCount = [
    formData.brand_profile_json.product_types.length > 0 ? 'yes' : '',
    formData.tone_of_voice,
    formData.description,
    formData.website,
    formData.logo_url,
    formData.brand_image_url,
    formData.colors.length > 0 ? 'yes' : '',
    formData.target_audience,
    formData.guidelines,
    formData.brand_profile_json.compliance_notes,
    formData.brand_profile_json.claims_to_avoid,
  ].filter(Boolean).length;

  // Completeness score (12 optional fields; logo/brand image combined as one)
  const completenessCount = [
    formData.brand_profile_json.category,
    formData.brand_profile_json.key_angles.length > 0 ? 'yes' : '',
    formData.brand_profile_json.product_types.length > 0 ? 'yes' : '',
    formData.tone_of_voice,
    formData.description,
    formData.website,
    (formData.logo_url || formData.brand_image_url) ? 'yes' : '',
    formData.colors.length > 0 ? 'yes' : '',
    formData.target_audience,
    formData.guidelines,
    formData.brand_profile_json.compliance_notes,
    formData.brand_profile_json.claims_to_avoid,
  ].filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const url = brand?.id ? `/api/brands/${brand.id}` : '/api/brands';
      const method = brand?.id ? 'PATCH' : 'POST';

      const payload = {
        name: formData.name,
        logo_url: formData.logo_url || null,
        brand_image_url: formData.brand_image_url || null,
        website: formData.website || null,
        description: formData.description || null,
        colors: formData.colors,
        tone_of_voice: formData.tone_of_voice || null,
        target_audience: formData.target_audience || null,
        guidelines: formData.guidelines || null,
        monthly_video_quota: formData.monthly_video_quota,
        retainer_type: formData.retainer_type,
        retainer_video_goal: formData.retainer_video_goal,
        retainer_period_start: formData.retainer_period_start || null,
        retainer_period_end: formData.retainer_period_end || null,
        retainer_payout_amount: formData.retainer_payout_amount,
        retainer_bonus_tiers: formData.retainer_bonus_tiers,
        retainer_notes: formData.retainer_notes || null,
        brand_profile_json: {
          category: formData.brand_profile_json.category || undefined,
          product_types: formData.brand_profile_json.product_types.filter(t => t.trim()),
          key_angles: formData.brand_profile_json.key_angles.filter(a => a.trim()),
          compliance_notes: formData.brand_profile_json.compliance_notes || null,
          claims_to_avoid: formData.brand_profile_json.claims_to_avoid || null,
        },
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.ok) {
        onSave();
      } else {
        setError(data.message || 'Failed to save brand');
      }
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save brand');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    setImageUploadError(null);

    try {
      const formDataObj = new FormData();
      formDataObj.append('file', file);

      const res = await fetch('/api/upload/image', {
        method: 'POST',
        body: formDataObj,
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setFormData({ ...formData, brand_image_url: data.data.url });
    } catch (err) {
      console.error('Image upload failed:', err);
      setImageUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const addColor = () => {
    if (newColor && !formData.colors.includes(newColor)) {
      setFormData({ ...formData, colors: [...formData.colors, newColor] });
    }
  };

  const removeColor = (color: string) => {
    setFormData({ ...formData, colors: formData.colors.filter(c => c !== color) });
  };

  const addProductType = () => {
    const trimmed = productTypeInput.trim();
    if (trimmed && formData.brand_profile_json.product_types.length < 10 && !formData.brand_profile_json.product_types.includes(trimmed)) {
      updateProfile('product_types', [...formData.brand_profile_json.product_types, trimmed]);
      setProductTypeInput('');
    }
  };

  const removeProductType = (tag: string) => {
    updateProfile('product_types', formData.brand_profile_json.product_types.filter(t => t !== tag));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">
            {brand?.id ? 'Edit Brand' : 'Add Brand'}
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Completeness progress bar */}
        <div className="px-4 pt-3 pb-1">
          <Progress
            current={completenessCount}
            total={12}
            label={`Brand Profile: ${completenessCount} of 12 complete`}
          />
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-sm text-red-200">
                {error}
              </div>
            )}

            {/* ── Section A: Essentials (always visible) ── */}
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3">Essentials</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Brand Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value.slice(0, 255) })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    required
                    maxLength={255}
                  />
                  <div className="flex justify-between mt-0.5">
                    <p className="text-[10px] text-zinc-600">Appears in scripts and video captions</p>
                    <p className="text-[10px] text-zinc-600">{formData.name.length}/255</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Category</label>
                  <select
                    value={formData.brand_profile_json.category}
                    onChange={(e) => updateProfile('category', e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Select category...</option>
                    {CATEGORY_OPTIONS.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <p className="text-xs text-zinc-500 mt-1">The primary industry this brand operates in</p>
                </div>

                {/* Key Angles — dynamic 0-5 inputs */}
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Key Angles
                    {formData.brand_profile_json.key_angles.length > 0 && (
                      <span className="text-zinc-600 ml-1">({formData.brand_profile_json.key_angles.length}/5)</span>
                    )}
                  </label>
                  <p className="text-[10px] text-zinc-600 mb-2">Top selling points used when generating scripts</p>
                  <div className="space-y-2">
                    {formData.brand_profile_json.key_angles.map((angle, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={angle}
                            onChange={(e) => {
                              const updated = [...formData.brand_profile_json.key_angles];
                              updated[i] = e.target.value.slice(0, 200);
                              updateProfile('key_angles', updated);
                            }}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            placeholder={KEY_ANGLE_PLACEHOLDERS[i] || 'Key selling angle...'}
                            maxLength={200}
                          />
                          <p className="text-[10px] text-zinc-600 text-right mt-0.5">{angle.length}/200</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = formData.brand_profile_json.key_angles.filter((_, idx) => idx !== i);
                            updateProfile('key_angles', updated);
                          }}
                          className="mt-2 text-zinc-500 hover:text-red-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {formData.brand_profile_json.key_angles.length < 5 && (
                      <button
                        type="button"
                        onClick={() => updateProfile('key_angles', [...formData.brand_profile_json.key_angles, ''])}
                        className="text-xs text-teal-400 hover:text-teal-300 px-2 py-1 bg-zinc-800 rounded"
                      >
                        + Add angle
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section B: Advanced (collapsed accordion) ── */}
            <CollapsibleSection
              title="Advanced"
              isOpen={advancedOpen}
              onToggle={() => setAdvancedOpen(!advancedOpen)}
              badge={advancedFilledCount > 0 ? `${advancedFilledCount} of 11 filled` : undefined}
            >
              {/* Product Types — tag input */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  Product Types
                  {formData.brand_profile_json.product_types.length > 0 && (
                    <span className="text-zinc-600 ml-1">({formData.brand_profile_json.product_types.length}/10)</span>
                  )}
                </label>
                <p className="text-[10px] text-zinc-600 mb-2">What this brand sells — helps AI tailor scripts</p>
                {formData.brand_profile_json.product_types.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {formData.brand_profile_json.product_types.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 bg-zinc-800 rounded-full px-2.5 py-1 text-xs text-zinc-300">
                        {tag}
                        <button type="button" onClick={() => removeProductType(tag)} className="text-zinc-500 hover:text-red-400">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {formData.brand_profile_json.product_types.length < 10 && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={productTypeInput}
                      onChange={(e) => setProductTypeInput(e.target.value.slice(0, 100))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addProductType(); } }}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="e.g., CBD Oil, Gummies, Capsules"
                    />
                    <button
                      type="button"
                      onClick={addProductType}
                      className="px-3 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 text-sm"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>

              {/* Tone of Voice */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Tone of Voice</label>
                <input
                  type="text"
                  value={formData.tone_of_voice}
                  onChange={(e) => setFormData({ ...formData, tone_of_voice: e.target.value.slice(0, 500) })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., Professional, Friendly, Bold..."
                  maxLength={500}
                />
                <div className="flex justify-between mt-0.5">
                  <p className="text-[10px] text-zinc-600">How the brand should sound in generated scripts</p>
                  <p className="text-[10px] text-zinc-600">{formData.tone_of_voice.length}/500</p>
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value.slice(0, 5000) })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white h-20 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Brief description of the brand..."
                  maxLength={5000}
                />
                <div className="flex justify-between mt-0.5">
                  <p className="text-[10px] text-zinc-600">Overview of the brand — gives AI additional context</p>
                  <p className="text-[10px] text-zinc-600">{formData.description.length}/5000</p>
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Website</label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Logo URL</label>
                <input
                  type="url"
                  value={formData.logo_url}
                  onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="https://..."
                />
              </div>

              {/* Brand Image Upload */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Brand Image (for video generation)</label>
                {formData.brand_image_url && (
                  <div className="mb-2">
                    <img
                      src={formData.brand_image_url}
                      alt="Brand preview"
                      className="w-32 h-32 object-cover rounded-lg border border-zinc-700"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <input
                    type="url"
                    value={formData.brand_image_url}
                    onChange={(e) => setFormData({ ...formData, brand_image_url: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Paste image URL or upload file below..."
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file);
                        }}
                        disabled={uploadingImage}
                      />
                      <div className="w-full bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg px-3 py-2 text-center transition-colors">
                        {uploadingImage ? 'Uploading...' : 'Upload File'}
                      </div>
                    </label>
                  </div>
                  {imageUploadError && (
                    <p className="text-xs text-red-400">{imageUploadError}</p>
                  )}
                </div>
              </div>

              {/* Brand Colors */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Brand Colors</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.colors.map((color, i) => (
                    <div key={i} className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 py-1">
                      <div className="w-5 h-5 rounded border border-white/20" style={{ backgroundColor: color }} />
                      <span className="text-xs text-zinc-400">{color}</span>
                      <button type="button" onClick={() => removeColor(color)} className="text-zinc-500 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="#000000"
                  />
                  <button type="button" onClick={addColor} className="px-3 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 text-sm">
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Target Audience</label>
                <input
                  type="text"
                  value={formData.target_audience}
                  onChange={(e) => setFormData({ ...formData, target_audience: e.target.value.slice(0, 500) })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., Young professionals, 25-35..."
                  maxLength={500}
                />
                <div className="flex justify-between mt-0.5">
                  <p className="text-[10px] text-zinc-600">Who the brand&apos;s content is aimed at</p>
                  <p className="text-[10px] text-zinc-600">{formData.target_audience.length}/500</p>
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Brand Guidelines</label>
                <textarea
                  value={formData.guidelines}
                  onChange={(e) => setFormData({ ...formData, guidelines: e.target.value.slice(0, 5000) })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white h-24 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Dos, don'ts, specific requirements..."
                  maxLength={5000}
                />
                <div className="flex justify-between mt-0.5">
                  <p className="text-[10px] text-zinc-600">Dos, don&apos;ts, and specific content requirements</p>
                  <p className="text-[10px] text-zinc-600">{formData.guidelines.length}/5000</p>
                </div>
              </div>

              {/* Compliance Notes */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Compliance Notes</label>
                <textarea
                  value={formData.brand_profile_json.compliance_notes}
                  onChange={(e) => updateProfile('compliance_notes', e.target.value.slice(0, 2000))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white h-20 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., Must include FDA disclaimer. Cannot reference clinical studies without approval."
                  maxLength={2000}
                />
                <div className="flex justify-between mt-0.5">
                  <p className="text-[10px] text-zinc-600">Legal disclaimers, required disclosures, or regulatory notes</p>
                  <p className="text-[10px] text-zinc-600">{formData.brand_profile_json.compliance_notes.length}/2000</p>
                </div>
              </div>

              {/* Claims to Avoid */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Claims to Avoid</label>
                <textarea
                  value={formData.brand_profile_json.claims_to_avoid}
                  onChange={(e) => updateProfile('claims_to_avoid', e.target.value.slice(0, 2000))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white h-20 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder={`e.g., No cure/treatment claims. Don't say "clinically proven" without approval.`}
                  maxLength={2000}
                />
                <div className="flex justify-between mt-0.5">
                  <p className="text-[10px] text-zinc-600">Specific claims or phrases that must not appear in scripts</p>
                  <p className="text-[10px] text-zinc-600">{formData.brand_profile_json.claims_to_avoid.length}/2000</p>
                </div>
              </div>
            </CollapsibleSection>

            {/* ── Section C: Quota & Partnership (collapsed accordion) ── */}
            <CollapsibleSection
              title="Quota & Partnership"
              isOpen={quotaOpen}
              onToggle={() => setQuotaOpen(!quotaOpen)}
              badge={formData.retainer_type !== 'none' ? formData.retainer_type : undefined}
            >
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Monthly Video Quota</label>
                <input
                  type="number"
                  value={formData.monthly_video_quota}
                  onChange={(e) => setFormData({ ...formData, monthly_video_quota: parseInt(e.target.value) || 0 })}
                  min="0"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-xs text-zinc-500 mt-1">Set to 0 for unlimited</p>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Retainer Type</label>
                <select
                  value={formData.retainer_type}
                  onChange={(e) => setFormData({ ...formData, retainer_type: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="none">None</option>
                  <option value="retainer">Retainer</option>
                  <option value="bonus">Bonus</option>
                  <option value="challenge">Challenge</option>
                  <option value="affiliate">Affiliate</option>
                </select>
              </div>

              {formData.retainer_type !== 'none' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Video Goal</label>
                      <input
                        type="number"
                        value={formData.retainer_video_goal}
                        onChange={(e) => setFormData({ ...formData, retainer_video_goal: parseInt(e.target.value) || 0 })}
                        min="0"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Base Payout ($)</label>
                      <input
                        type="number"
                        value={formData.retainer_payout_amount}
                        onChange={(e) => setFormData({ ...formData, retainer_payout_amount: parseFloat(e.target.value) || 0 })}
                        min="0"
                        step="0.01"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Period Start</label>
                      <input
                        type="date"
                        value={formData.retainer_period_start}
                        onChange={(e) => setFormData({ ...formData, retainer_period_start: e.target.value })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Period End</label>
                      <input
                        type="date"
                        value={formData.retainer_period_end}
                        onChange={(e) => setFormData({ ...formData, retainer_period_end: e.target.value })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  {/* Bonus Tiers */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Bonus Tiers</label>
                    <div className="space-y-2">
                      {formData.retainer_bonus_tiers.map((tier, i) => (
                        <div key={i} className="flex items-center gap-2 bg-zinc-800/50 rounded-lg p-2">
                          <input
                            type="text"
                            value={tier.label}
                            onChange={(e) => {
                              const tiers = [...formData.retainer_bonus_tiers];
                              tiers[i] = { ...tiers[i], label: e.target.value };
                              setFormData({ ...formData, retainer_bonus_tiers: tiers });
                            }}
                            className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                            placeholder="Label"
                          />
                          <input
                            type="number"
                            value={tier.videos ?? tier.gmv ?? ''}
                            onChange={(e) => {
                              const tiers = [...formData.retainer_bonus_tiers];
                              const val = parseFloat(e.target.value) || 0;
                              if (tier.videos !== undefined) {
                                tiers[i] = { ...tiers[i], videos: val };
                              } else {
                                tiers[i] = { ...tiers[i], gmv: val };
                              }
                              setFormData({ ...formData, retainer_bonus_tiers: tiers });
                            }}
                            className="w-20 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                            placeholder="Threshold"
                          />
                          <span className="text-zinc-500 text-xs">$</span>
                          <input
                            type="number"
                            value={tier.payout ?? tier.bonus ?? ''}
                            onChange={(e) => {
                              const tiers = [...formData.retainer_bonus_tiers];
                              const val = parseFloat(e.target.value) || 0;
                              if (tier.payout !== undefined) {
                                tiers[i] = { ...tiers[i], payout: val };
                              } else {
                                tiers[i] = { ...tiers[i], bonus: val };
                              }
                              setFormData({ ...formData, retainer_bonus_tiers: tiers });
                            }}
                            className="w-20 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                            placeholder="Payout"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const tiers = formData.retainer_bonus_tiers.filter((_, idx) => idx !== i);
                              setFormData({ ...formData, retainer_bonus_tiers: tiers });
                            }}
                            className="text-zinc-500 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData({
                            ...formData,
                            retainer_bonus_tiers: [...formData.retainer_bonus_tiers, { videos: 0, payout: 0, label: '' }],
                          })}
                          className="text-xs text-teal-400 hover:text-teal-300 px-2 py-1 bg-zinc-800 rounded"
                        >
                          + Video tier
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({
                            ...formData,
                            retainer_bonus_tiers: [...formData.retainer_bonus_tiers, { gmv: 0, bonus: 0, label: '' }],
                          })}
                          className="text-xs text-teal-400 hover:text-teal-300 px-2 py-1 bg-zinc-800 rounded"
                        >
                          + GMV tier
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Notes</label>
                    <textarea
                      value={formData.retainer_notes}
                      onChange={(e) => setFormData({ ...formData, retainer_notes: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white h-16 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="Partnership details, terms, etc."
                    />
                  </div>
                </>
              )}
            </CollapsibleSection>
          </div>

          <div className="flex gap-3 p-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !formData.name}
              className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : brand?.id ? 'Save Changes' : 'Add Brand'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
