'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Building2, Edit, Trash2, ExternalLink, X, Loader2 } from 'lucide-react';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState } from '../components/AdminPageLayout';

interface Brand {
  id: string;
  name: string;
  logo_url?: string | null;
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

  useEffect(() => {
    if (!authLoading && authUser) {
      fetchBrands();
    }
  }, [authLoading, authUser, fetchBrands]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this brand? Products will be unlinked but not deleted.')) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/brands/${id}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.ok) {
        fetchBrands();
      } else {
        alert(data.message || 'Failed to delete brand');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete brand');
    } finally {
      setDeleting(null);
    }
  };

  const handleSave = async () => {
    setIsModalOpen(false);
    setEditingBrand(null);
    fetchBrands();
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

      <AdminCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-zinc-400">Loading brands...</div>
        ) : brands.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-6 h-6" />}
            title="No brands yet"
            description="Add your first brand to organize products and track quotas"
            action={
              <AdminButton onClick={() => { setEditingBrand(null); setIsModalOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" />
                Add Brand
              </AdminButton>
            }
          />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {brands.map(brand => (
              <div key={brand.id} className="bg-zinc-800/50 border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {brand.logo_url ? (
                      <img
                        src={brand.logo_url}
                        alt={brand.name}
                        className="w-10 h-10 rounded-lg object-cover"
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
                    <button
                      onClick={() => { setEditingBrand(brand); setIsModalOpen(true); }}
                      className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
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
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-zinc-400">Monthly Quota</span>
                      <span className="text-zinc-100">
                        {brand.videos_this_month} / {brand.monthly_video_quota}
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          brand.videos_this_month >= brand.monthly_video_quota
                            ? 'bg-red-500'
                            : 'bg-teal-500'
                        }`}
                        style={{
                          width: `${Math.min(100, (brand.videos_this_month / brand.monthly_video_quota) * 100)}%`
                        }}
                      />
                    </div>
                  </div>
                )}

                {brand.monthly_video_quota === 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <span className="text-xs text-zinc-500">Unlimited videos</span>
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
  const [formData, setFormData] = useState({
    name: brand?.name || '',
    logo_url: brand?.logo_url || '',
    website: brand?.website || '',
    description: brand?.description || '',
    colors: brand?.colors || [],
    tone_of_voice: brand?.tone_of_voice || '',
    target_audience: brand?.target_audience || '',
    guidelines: brand?.guidelines || '',
    monthly_video_quota: brand?.monthly_video_quota || 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newColor, setNewColor] = useState('#10b981');

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
        website: formData.website || null,
        description: formData.description || null,
        colors: formData.colors,
        tone_of_voice: formData.tone_of_voice || null,
        target_audience: formData.target_audience || null,
        guidelines: formData.guidelines || null,
        monthly_video_quota: formData.monthly_video_quota,
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

  const addColor = () => {
    if (newColor && !formData.colors.includes(newColor)) {
      setFormData({ ...formData, colors: [...formData.colors, newColor] });
    }
  };

  const removeColor = (color: string) => {
    setFormData({ ...formData, colors: formData.colors.filter(c => c !== color) });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">
            {brand?.id ? 'Edit Brand' : 'Add Brand'}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-sm text-red-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Brand Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
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
              <label className="block text-sm text-zinc-400 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white h-20 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Brief description of the brand..."
              />
            </div>

            {/* Brand Colors */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Brand Colors</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.colors.map((color, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 py-1"
                  >
                    <div
                      className="w-5 h-5 rounded border border-white/20"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-zinc-400">{color}</span>
                    <button
                      type="button"
                      onClick={() => removeColor(color)}
                      className="text-zinc-500 hover:text-red-400"
                    >
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
                <button
                  type="button"
                  onClick={addColor}
                  className="px-3 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 text-sm"
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Tone of Voice</label>
              <input
                type="text"
                value={formData.tone_of_voice}
                onChange={(e) => setFormData({ ...formData, tone_of_voice: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="e.g., Professional, Friendly, Bold..."
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Target Audience</label>
              <input
                type="text"
                value={formData.target_audience}
                onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="e.g., Young professionals, 25-35..."
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Brand Guidelines</label>
              <textarea
                value={formData.guidelines}
                onChange={(e) => setFormData({ ...formData, guidelines: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white h-24 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Dos, don'ts, specific requirements..."
              />
            </div>

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
