'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import AdminPageLayout from '../../components/AdminPageLayout';
import {
  Upload, Film, Sparkles, CheckCircle2, Loader2, X, ChevronRight,
  Copy, Check, Zap, Target, Star, AlertTriangle, Play, RefreshCw,
  MousePointerClick, Hash, FileVideo, ArrowLeft, Trophy, Lightbulb,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClipFile {
  id: string;
  file: File;
  previewUrl: string;
  thumbnail: string | null;
}

interface ClipResult {
  index: number;
  filename: string;
  size_bytes: number;
  url: string | null;
  transcript: string | null;
  score: number | null;
  is_best: boolean;
}

interface AnalysisResult {
  job_id: string;
  clips: ClipResult[];
  best_clip_index: number;
  best_clip_url: string | null;
  reasoning: string;
  content_angle: string;
  hook: string;
  caption: string;
  hashtags: string[];
  cta: string;
  cover_text: string;
  product_id: string | null;
  product_name: string;
  tiktok_product_id: string | null;
  link_code: string | null;
  affiliate_url: string | null;
  credits_used: number;
  credits_remaining: number;
}

interface Product {
  id: string;
  name: string;
  tiktok_product_id: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function captureThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      video.src = url;
      video.muted = true;
      video.currentTime = 1;
      video.onloadeddata = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 120;
          canvas.height = 200;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(video, 0, 0, 120, 200);
          const thumb = canvas.toDataURL('image/jpeg', 0.7);
          URL.revokeObjectURL(url);
          resolve(thumb);
        } catch { resolve(null); }
      };
      video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      setTimeout(() => { URL.revokeObjectURL(url); resolve(null); }, 5000);
    } catch { resolve(null); }
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ClipCard({ clip, onRemove, result }: {
  clip: ClipFile;
  onRemove: (id: string) => void;
  result?: ClipResult;
}) {
  return (
    <div className={`relative bg-zinc-900 border rounded-2xl overflow-hidden transition-all ${
      result?.is_best
        ? 'border-yellow-500/50 shadow-lg shadow-yellow-500/10'
        : result
          ? 'border-zinc-700'
          : 'border-zinc-800'
    }`}>
      {/* Thumbnail */}
      <div className="relative aspect-[9/16] bg-zinc-800 max-h-40 overflow-hidden">
        {clip.thumbnail ? (
          <img src={clip.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <FileVideo className="w-8 h-8 text-zinc-600" />
          </div>
        )}
        {result?.is_best && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-yellow-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
            <Trophy className="w-2.5 h-2.5" /> BEST
          </div>
        )}
        {result?.score !== null && result?.score !== undefined && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            {result.score}/10
          </div>
        )}
        {!result && (
          <button
            onClick={() => onRemove(clip.id)}
            className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center hover:bg-black transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        )}
      </div>
      {/* Info */}
      <div className="p-2">
        <p className="text-[10px] text-zinc-300 truncate font-medium">{clip.file.name}</p>
        <p className="text-[9px] text-zinc-600 mt-0.5">{formatBytes(clip.file.size)}</p>
        {result?.transcript && (
          <p className="text-[9px] text-zinc-500 mt-1 line-clamp-2 italic">"{result.transcript}"</p>
        )}
      </div>
    </div>
  );
}

function EditableField({ label, value, onChange, multiline = false, icon: Icon }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  icon?: typeof Zap;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-zinc-500" />}
        <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{label}</label>
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none focus:border-teal-500/50 transition-colors"
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-teal-500/50 transition-colors"
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageView = 'upload' | 'analyzing' | 'results' | 'saved';

export default function ClipStudio() {
  const { showError, showSuccess } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<PageView>('upload');
  const [clips, setClips] = useState<ClipFile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [context, setContext] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [savedItemId, setSavedItemId] = useState<string | null>(null);

  // Editable result fields
  const [editHook, setEditHook] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editHashtags, setEditHashtags] = useState<string[]>([]);
  const [editCta, setEditCta] = useState('');
  const [editCoverText, setEditCoverText] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [selectedClipIndex, setSelectedClipIndex] = useState(0);

  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load products
  useEffect(() => {
    fetch('/api/products?limit=50')
      .then(r => r.json())
      .then(j => { if (j.ok) setProducts(j.data || j.products || []); })
      .catch(() => {});
  }, []);

  // When analysis comes in, populate edit fields
  useEffect(() => {
    if (!analysis) return;
    setEditHook(analysis.hook);
    setEditCaption(analysis.caption);
    setEditHashtags(analysis.hashtags);
    setEditCta(analysis.cta);
    setEditCoverText(analysis.cover_text);
    setEditTitle(analysis.hook.slice(0, 80));
    setSelectedClipIndex(analysis.best_clip_index);
  }, [analysis]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const remaining = 6 - clips.length;
    const toAdd = arr.slice(0, remaining);

    const newClips: ClipFile[] = await Promise.all(toAdd.map(async (file) => {
      const thumb = await captureThumbnail(file);
      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        thumbnail: thumb,
      };
    }));
    setClips(prev => [...prev, ...newClips]);
  }, [clips]);

  const removeClip = (id: string) => {
    setClips(prev => prev.filter(c => c.id !== id));
  };

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const handleAnalyze = async () => {
    if (!clips.length) return;
    setView('analyzing');

    const formData = new FormData();
    for (const clip of clips) formData.append('clips', clip.file);
    if (selectedProductId) formData.append('product_id', selectedProductId);
    if (context) formData.append('context', context);

    try {
      const res = await fetch('/api/creator/analyze-clips', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        showError(json.error || 'Analysis failed');
        setView('upload');
        return;
      }
      setAnalysis(json.data);
      setView('results');
    } catch {
      showError('Analysis failed. Please try again.');
      setView('upload');
    }
  };

  const handleSave = async () => {
    if (!analysis) return;
    setSaving(true);
    try {
      const selectedClip = analysis.clips[selectedClipIndex];
      const res = await fetch('/api/creator/analyze-clips/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle || editHook,
          hook: editHook,
          caption: editCaption,
          hashtags: editHashtags,
          cta: editCta,
          cover_text: editCoverText,
          final_video_url: selectedClip?.url || analysis.best_clip_url,
          product_id: analysis.product_id,
          tiktok_product_id: analysis.tiktok_product_id,
          job_id: analysis.job_id,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSavedItemId(json.data.content_item_id);
        setView('saved');
        showSuccess('Added to posting queue!');
      } else {
        showError(json.error || 'Failed to save');
      }
    } catch {
      showError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const copyFullPost = () => {
    const text = [editCaption, editCta, editHashtags.join(' '), analysis?.affiliate_url ? '🔗 Link in bio' : ''].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setClips([]);
    setAnalysis(null);
    setSavedItemId(null);
    setContext('');
    setSelectedProductId('');
    setView('upload');
  };

  // ── Upload View ────────────────────────────────────────────────────────────

  if (view === 'upload') {
    return (
      <AdminPageLayout
        title="Clip Studio"
        subtitle="Drop your raw clips — get a post-ready TikTok in seconds"
        maxWidth="2xl"
        headerActions={
          <Link href="/admin/creator" className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> My Studio
          </Link>
        }
      >
        {/* Drop Zone */}
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => clips.length < 6 && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
            isDragOver
              ? 'border-teal-400 bg-teal-500/10'
              : clips.length > 0
                ? 'border-zinc-700 bg-zinc-900/50'
                : 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-600 hover:bg-zinc-900/60'
          }`}
          style={{ minHeight: clips.length > 0 ? 'auto' : '220px' }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
            multiple
            className="hidden"
            onChange={e => e.target.files && addFiles(e.target.files)}
          />

          {clips.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                <Film className="w-8 h-8 text-zinc-500" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-zinc-300">Drop your clips here</p>
                <p className="text-sm text-zinc-500 mt-1">or click to browse — up to 6 clips, mp4 / mov / webm</p>
              </div>
              <div className="flex items-center gap-6 mt-2">
                {[
                  { icon: Zap, text: 'Audio transcribed' },
                  { icon: Lightbulb, text: 'AI picks best clip' },
                  { icon: Sparkles, text: 'Caption generated' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Icon className="w-3.5 h-3.5 text-zinc-600" />
                    {text}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-3">
                {clips.map(clip => (
                  <ClipCard key={clip.id} clip={clip} onRemove={removeClip} />
                ))}
                {clips.length < 6 && (
                  <div
                    className="aspect-[9/16] max-h-40 bg-zinc-800/40 border-2 border-dashed border-zinc-700 rounded-2xl flex flex-col items-center justify-center gap-1 hover:border-zinc-500 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-5 h-5 text-zinc-600" />
                    <span className="text-[10px] text-zinc-600">Add clip</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-500 text-center">{clips.length}/6 clips · Click anywhere to add more</p>
            </div>
          )}
        </div>

        {/* Settings */}
        {clips.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Product */}
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide block mb-2">Product (optional)</label>
                <select
                  value={selectedProductId}
                  onChange={e => setSelectedProductId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-teal-500/50"
                >
                  <option value="">No product selected</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.tiktok_product_id ? ' ✓ TikTok Shop' : ''}</option>
                  ))}
                </select>
              </div>

              {/* Extra context */}
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide block mb-2">Extra context (optional)</label>
                <input
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="e.g. 'Focus on the energy boost angle'"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-teal-500/50"
                />
              </div>
            </div>

            {/* Credit info + CTA */}
            <div className="flex items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-teal-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {clips.length} credit{clips.length !== 1 ? 's' : ''} will be used
                  </p>
                  <p className="text-xs text-zinc-500">1 credit per clip · AI transcription + content generation</p>
                </div>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={clips.length === 0}
                className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold bg-teal-600 text-white hover:bg-teal-500 transition-colors disabled:opacity-40"
              >
                <Sparkles className="w-5 h-5" />
                Analyze & Generate
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </AdminPageLayout>
    );
  }

  // ── Analyzing View ─────────────────────────────────────────────────────────

  if (view === 'analyzing') {
    return (
      <AdminPageLayout title="Clip Studio" subtitle="Analyzing your clips..." maxWidth="2xl">
        <div className="flex flex-col items-center justify-center py-20 gap-8">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-zinc-800 border-t-teal-500 animate-spin" />
            <Sparkles className="w-8 h-8 text-teal-400 absolute inset-0 m-auto" />
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-white mb-2">Analyzing {clips.length} clip{clips.length !== 1 ? 's' : ''}...</p>
            <p className="text-sm text-zinc-400">Transcribing audio · Identifying best clip · Generating your post</p>
          </div>
          <div className="w-full max-w-sm space-y-2">
            {clips.map((clip, i) => (
              <div key={clip.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5">
                {clip.thumbnail ? (
                  <img src={clip.thumbnail} alt="" className="w-8 h-10 rounded object-cover flex-shrink-0" />
                ) : (
                  <FileVideo className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                )}
                <span className="text-sm text-zinc-300 truncate flex-1">{clip.file.name}</span>
                <Loader2 className="w-4 h-4 text-teal-400 animate-spin flex-shrink-0" />
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-600">This takes about 15–30 seconds</p>
        </div>
      </AdminPageLayout>
    );
  }

  // ── Results View ───────────────────────────────────────────────────────────

  if (view === 'results' && analysis) {
    const selectedClip = analysis.clips[selectedClipIndex];

    return (
      <AdminPageLayout
        title="Clip Studio"
        subtitle="Review and edit your generated content"
        maxWidth="2xl"
        headerActions={
          <button onClick={reset} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" /> Start Over
          </button>
        }
      >
        {/* Analysis summary */}
        <div className="bg-gradient-to-br from-teal-900/20 to-zinc-900 border border-teal-500/20 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-base font-bold text-white">Analysis Complete</p>
                <span className="text-xs text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  {analysis.credits_used} credit{analysis.credits_used !== 1 ? 's' : ''} used
                </span>
              </div>
              <p className="text-sm text-zinc-400">{analysis.reasoning}</p>
              {analysis.content_angle && (
                <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" /> Angle: {analysis.content_angle}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Clip selector */}
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Select clip to use</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {analysis.clips.map((clip) => {
              const clipFile = clips[clip.index];
              return clipFile ? (
                <div
                  key={clip.index}
                  onClick={() => setSelectedClipIndex(clip.index)}
                  className={`cursor-pointer transition-all ${selectedClipIndex === clip.index ? 'ring-2 ring-teal-500 rounded-2xl' : 'opacity-70 hover:opacity-100'}`}
                >
                  <ClipCard clip={clipFile} onRemove={() => {}} result={clip} />
                </div>
              ) : null;
            })}
          </div>
        </div>

        {/* Editable fields */}
        <div className="space-y-4">
          <EditableField
            label="Title (internal)"
            value={editTitle}
            onChange={setEditTitle}
            icon={Film}
          />
          <EditableField
            label="Hook — opening line"
            value={editHook}
            onChange={setEditHook}
            icon={Zap}
          />
          <EditableField
            label="Caption"
            value={editCaption}
            onChange={setEditCaption}
            multiline
            icon={Sparkles}
          />
          <EditableField
            label="Call to action"
            value={editCta}
            onChange={setEditCta}
            icon={Target}
          />
          <EditableField
            label="Cover text (thumbnail overlay)"
            value={editCoverText}
            onChange={setEditCoverText}
            icon={Play}
          />

          {/* Hashtags */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Hash className="w-3.5 h-3.5 text-zinc-500" />
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Hashtags</label>
            </div>
            <div className="flex flex-wrap gap-1.5 p-3 bg-zinc-800/40 border border-zinc-700 rounded-xl">
              {editHashtags.map((tag, i) => (
                <span
                  key={i}
                  className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
                    tag.toLowerCase() === '#ad'
                      ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                      : 'bg-teal-500/10 text-teal-300 border-teal-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                  }`}
                  onClick={() => {
                    if (tag.toLowerCase() !== '#ad') {
                      setEditHashtags(prev => prev.filter((_, j) => j !== i));
                    }
                  }}
                  title={tag.toLowerCase() !== '#ad' ? 'Click to remove' : 'Required for FTC compliance'}
                >
                  {tag}
                </span>
              ))}
              <input
                placeholder="+ add tag"
                className="text-xs bg-transparent text-zinc-400 placeholder-zinc-700 outline-none w-20"
                onKeyDown={e => {
                  if ((e.key === 'Enter' || e.key === ' ') && e.currentTarget.value.trim()) {
                    e.preventDefault();
                    const tag = e.currentTarget.value.trim();
                    const normalized = tag.startsWith('#') ? tag : `#${tag}`;
                    setEditHashtags(prev => [...prev, normalized]);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">Click a tag to remove it · Type + Enter to add</p>
          </div>

          {/* Affiliate link */}
          {analysis.affiliate_url && (
            <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
              <MousePointerClick className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold mb-0.5">Affiliate Link</p>
                <p className="text-xs text-zinc-300 truncate">{analysis.affiliate_url}</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            </div>
          )}
        </div>

        {/* Compliance check */}
        {!editHashtags.some(h => h.toLowerCase() === '#ad') && (
          <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
            <p className="text-xs text-orange-300">
              <span className="font-semibold">#ad is required</span> for FTC compliance on sponsored content.
              <button onClick={() => setEditHashtags(prev => ['#ad', ...prev.filter(h => h.toLowerCase() !== '#ad')])} className="underline ml-1 hover:text-orange-200">Add it back</button>
            </p>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={copyFullPost}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              copied ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Full Post'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold bg-teal-600 text-white hover:bg-teal-500 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {saving ? 'Saving...' : 'Save to Posting Queue →'}
          </button>
        </div>
      </AdminPageLayout>
    );
  }

  // ── Saved View ─────────────────────────────────────────────────────────────

  if (view === 'saved') {
    return (
      <AdminPageLayout title="Clip Studio" subtitle="Post added to queue" maxWidth="2xl">
        <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500/30 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white mb-2">Ready to Post!</p>
            <p className="text-sm text-zinc-400 max-w-sm">
              Your clip has been analyzed, content has been generated, and the post is in your queue.
            </p>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <Link
              href="/admin/creator"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-500 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Go to My Studio → Post It
            </Link>
            <button
              onClick={reset}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors"
            >
              <Film className="w-4 h-4" />
              Analyze More Clips
            </button>
          </div>
        </div>
      </AdminPageLayout>
    );
  }

  return null;
}
