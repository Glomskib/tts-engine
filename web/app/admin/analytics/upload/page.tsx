'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AdminPageLayout, { AdminCard } from '../../components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import {
  Upload, Loader2, Eye, Heart, MessageCircle, Share2,
  Trophy, ImagePlus, X, CheckCircle2, MapPin, Users,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScreenshotResult {
  id: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement_rate: number;
  gender_breakdown: Record<string, number> | null;
  age_breakdown: Record<string, number> | null;
  locations: string[] | null;
  follower_ratio: number | null;
  winner_suggestion: boolean;
  status: string;
}

interface UploadItem {
  id: string;
  file: File;
  preview: string;
  status: 'uploading' | 'done' | 'error';
  result: ScreenshotResult | null;
  error: string | null;
  videoId: string;
  productId: string;
}

interface VideoOption { id: string; title: string }
interface ProductOption { id: string; name: string; brand: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function engColor(rate: number) {
  if (rate >= 5) return 'text-emerald-400';
  if (rate >= 3) return 'text-amber-400';
  return 'text-red-400';
}

function engBg(rate: number) {
  if (rate >= 5) return 'bg-emerald-500/10 border-emerald-500/20';
  if (rate >= 3) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

const ACCEPTED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const GENDER_COLORS: Record<string, string> = { male: 'bg-blue-500', female: 'bg-pink-500', other: 'bg-zinc-500' };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatBox({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-800/60 border border-white/5 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
      <div className={color}>{icon}</div>
      <div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</div>
        <div className="text-base font-semibold text-zinc-100">{value}</div>
      </div>
    </div>
  );
}

function GenderBar({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
        <Users className="w-3 h-3" /> Gender
      </div>
      <div className="flex h-3 rounded-full overflow-hidden">
        {entries.map(([k, v]) => (
          <div key={k} className={`${GENDER_COLORS[k.toLowerCase()] || 'bg-zinc-600'} transition-all`} style={{ width: `${(v / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex gap-3 mt-1.5">
        {entries.map(([k, v]) => (
          <span key={k} className="text-[10px] text-zinc-400 capitalize">{k}: {Math.round((v / total) * 100)}%</span>
        ))}
      </div>
    </div>
  );
}

function AgeBars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1.5">Age Groups</div>
      <div className="space-y-1">
        {entries.map(([range, val]) => (
          <div key={range} className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-400 w-12 shrink-0">{range}</span>
            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${(val / max) * 100}%` }} />
            </div>
            <span className="text-[10px] text-zinc-500 w-8 text-right">{val}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
      >
        <option value="">None</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ResultCard({ item, onRemove, videos, products, onVideoChange, onProductChange }: {
  item: UploadItem; onRemove: () => void; videos: VideoOption[]; products: ProductOption[];
  onVideoChange: (v: string) => void; onProductChange: (v: string) => void;
}) {
  const r = item.result;
  return (
    <div className="bg-zinc-900/50 rounded-xl border border-white/10 overflow-hidden">
      {/* Header with thumbnail */}
      <div className="flex items-start gap-4 p-4 border-b border-white/5">
        <img src={item.preview} alt="Screenshot" className="w-20 h-20 rounded-lg object-cover border border-white/10 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-200 truncate">{item.file.name}</p>
            <button onClick={onRemove} className="text-zinc-600 hover:text-zinc-300 transition-colors p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          {item.status === 'uploading' && (
            <div className="flex items-center gap-2 mt-2 text-sm text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" /> Analyzing screenshot...
            </div>
          )}
          {item.status === 'error' && <p className="text-sm text-red-400 mt-1">{item.error || 'Upload failed'}</p>}
          {item.status === 'done' && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Processed
            </div>
          )}
        </div>
      </div>

      {/* Extracted data */}
      {item.status === 'done' && r && (
        <div className="p-4 space-y-4">
          {r.winner_suggestion && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <Trophy className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-300">High engagement! Consider adding to Winners Bank</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatBox icon={<Eye className="w-4 h-4" />} label="Views" value={fmt(r.views)} color="text-blue-400" />
            <StatBox icon={<Heart className="w-4 h-4" />} label="Likes" value={fmt(r.likes)} color="text-pink-400" />
            <StatBox icon={<MessageCircle className="w-4 h-4" />} label="Comments" value={fmt(r.comments)} color="text-amber-400" />
            <StatBox icon={<Share2 className="w-4 h-4" />} label="Shares" value={fmt(r.shares)} color="text-teal-400" />
          </div>

          <div className={`rounded-lg border px-3 py-2.5 ${engBg(r.engagement_rate)}`}>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Engagement Rate</span>
            <div className={`text-lg font-bold ${engColor(r.engagement_rate)}`}>{r.engagement_rate.toFixed(2)}%</div>
          </div>

          {(r.gender_breakdown || r.age_breakdown || r.locations) && (
            <div className="space-y-3">
              {r.gender_breakdown && Object.keys(r.gender_breakdown).length > 0 && <GenderBar data={r.gender_breakdown} />}
              {r.age_breakdown && Object.keys(r.age_breakdown).length > 0 && <AgeBars data={r.age_breakdown} />}
              {r.locations && r.locations.length > 0 && (
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Top Locations
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.locations.map((loc) => (
                      <span key={loc} className="text-[11px] bg-zinc-800 border border-white/5 text-zinc-300 rounded-full px-2 py-0.5">{loc}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
            <SelectField label="Link to Video" value={item.videoId} onChange={onVideoChange}
              options={videos.map((v) => ({ value: v.id, label: v.title || v.id.slice(0, 8) }))} />
            <SelectField label="Link to Product" value={item.productId} onChange={onProductChange}
              options={products.map((p) => ({ value: p.id, label: p.brand ? `${p.brand} - ${p.name}` : p.name }))} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AnalyticsScreenshotUploadPage() {
  const { showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [videos, setVideos] = useState<VideoOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Fetch posted videos and products for linking dropdowns
  useEffect(() => {
    fetch('/api/videos?status=POSTED').then((r) => r.json()).then((j) => {
      if (j.ok) setVideos((j.data || []).map((v: { id: string; title: string }) => ({ id: v.id, title: v.title })));
    }).catch(() => {});
    fetch('/api/products').then((r) => r.json()).then((j) => {
      if (j.ok) setProducts((j.data || []).map((p: { id: string; name: string; brand: string }) => ({ id: p.id, name: p.name, brand: p.brand })));
    }).catch(() => {});
  }, []);

  const uploadFile = useCallback(async (item: UploadItem) => {
    const fd = new FormData();
    fd.append('file', item.file);
    if (item.videoId) fd.append('video_id', item.videoId);
    if (item.productId) fd.append('product_id', item.productId);
    try {
      const res = await fetch('/api/analytics/screenshot', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.ok) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'done' as const, result: json.data } : i)));
      } else {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error' as const, error: json.message || 'Analysis failed' } : i)));
      }
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error' as const, error: 'Network error' } : i)));
    }
  }, []);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const valid = Array.from(files).filter((f) => ACCEPTED.includes(f.type));
    if (valid.length === 0) { showError('Please upload image files (PNG, JPG, or WebP)'); return; }
    const newItems: UploadItem[] = valid.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file, preview: URL.createObjectURL(file), status: 'uploading' as const,
      result: null, error: null, videoId: '', productId: '',
    }));
    setItems((prev) => [...newItems, ...prev]);
    newItems.forEach(uploadFile);
  }, [showError, uploadFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeItem = (id: string) => {
    setItems((prev) => { const it = prev.find((i) => i.id === id); if (it) URL.revokeObjectURL(it.preview); return prev.filter((i) => i.id !== id); });
  };
  const updateItemVideo = (id: string, videoId: string) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, videoId } : i)));
  const updateItemProduct = (id: string, productId: string) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, productId } : i)));

  const doneCount = items.filter((i) => i.status === 'done').length;
  const processingCount = items.filter((i) => i.status === 'uploading').length;

  return (
    <AdminPageLayout
      title="Analytics Screenshot Reader"
      subtitle="Upload TikTok analytics screenshots to extract performance data"
      headerActions={items.length > 0 ? (
        <span className="text-xs text-zinc-500">{doneCount} processed{processingCount > 0 ? `, ${processingCount} analyzing` : ''}</span>
      ) : undefined}
    >
      {/* Drop Zone */}
      <AdminCard>
        <div
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center py-12 px-6 ${
            isDragOver ? 'border-violet-500 bg-violet-500/5' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/20 hover:bg-zinc-800/40'
          }`}
        >
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-colors ${isDragOver ? 'bg-violet-500/20' : 'bg-zinc-800'}`}>
            <Upload className={`w-6 h-6 ${isDragOver ? 'text-violet-400' : 'text-zinc-400'}`} />
          </div>
          <p className="text-sm font-medium text-zinc-200 mb-1">
            {isDragOver ? 'Drop screenshots here' : 'Drag & drop analytics screenshots'}
          </p>
          <p className="text-xs text-zinc-500 mb-4">PNG, JPG, or WebP - multiple files supported</p>
          <button type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-zinc-800 text-zinc-100 border border-white/10 hover:bg-zinc-700 transition-colors">
            <ImagePlus className="w-4 h-4 mr-1.5" /> Browse Files
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" multiple
            onChange={(e) => { if (e.target.files && e.target.files.length > 0) { handleFiles(e.target.files); e.target.value = ''; } }}
            className="hidden" />
        </div>
      </AdminCard>

      {/* Results */}
      {items.length > 0 && (
        <div className="space-y-4">
          {items.map((item) => (
            <ResultCard key={item.id} item={item} onRemove={() => removeItem(item.id)}
              videos={videos} products={products}
              onVideoChange={(v) => updateItemVideo(item.id, v)} onProductChange={(v) => updateItemProduct(item.id, v)} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <AdminCard>
          <div className="text-center py-8">
            <Upload className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              Upload screenshots from your TikTok analytics to automatically extract views, likes, comments, shares,
              engagement rate, demographics, and more. The AI will parse the data and flag potential winners.
            </p>
          </div>
        </AdminCard>
      )}
    </AdminPageLayout>
  );
}
