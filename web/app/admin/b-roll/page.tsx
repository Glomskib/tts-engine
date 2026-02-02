'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import {
  Download, Copy, Loader2, Sparkles, Check, Bookmark,
  Trash2, FolderOpen, Image as ImageIcon, Upload, X, Heart, ImagePlus
} from 'lucide-react';
import { IMAGE_STYLES, ASPECT_RATIOS } from '@/lib/replicate';
import { useToast } from '@/contexts/ToastContext';

type TabType = 'generate' | 'library' | 'references';

// Model configurations with descriptions
const MODELS = [
  {
    id: 'flux-schnell' as const,
    name: 'Flux Schnell',
    credits: 2,
    description: 'Fast generation (~2 sec). Great for quick iterations and testing ideas.',
    badge: 'Fast',
    badgeColor: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  {
    id: 'flux-dev' as const,
    name: 'Flux Dev',
    credits: 4,
    description: 'Higher quality with better detail and prompt adherence. Takes longer (~10 sec).',
    badge: 'Quality',
    badgeColor: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  },
  {
    id: 'sdxl' as const,
    name: 'SDXL',
    credits: 3,
    description: 'Stable Diffusion XL. Reliable, versatile, great for product shots and realistic scenes.',
    badge: 'Versatile',
    badgeColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
] as const;

type ModelId = typeof MODELS[number]['id'];

interface LibraryImage {
  id: string;
  url: string;
  prompt: string | null;
  style: string | null;
  aspect_ratio: string | null;
  model: string | null;
  tags: string[];
  is_favorite: boolean;
  folder: string | null;
  created_at: string;
}

interface ReferenceImage {
  id: string;
  name: string;
  url: string;
  tags: string[];
  folder: string | null;
  created_at: string;
}

export default function BRollGeneratorPage() {
  const { showSuccess, showError } = useToast();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('generate');

  // Mode state (text-to-image vs image-to-image)
  const [mode, setMode] = useState<'text-to-image' | 'image-to-image'>('text-to-image');
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [strength, setStrength] = useState(0.7);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ModelId>('flux-schnell');
  const [style, setStyle] = useState<string>('lifestyle');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [numOutputs, setNumOutputs] = useState(2);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedImages, setSavedImages] = useState<Set<string>>(new Set());

  // Library state
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryCount, setLibraryCount] = useState(0);
  const [libraryLimit, setLibraryLimit] = useState(10);
  const [selectedLibraryImage, setSelectedLibraryImage] = useState<LibraryImage | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // References state
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [referencesCount, setReferencesCount] = useState(0);
  const [referencesLimit, setReferencesLimit] = useState(5);

  // Calculate credit cost (img2img uses SDXL = 3 credits, always 1 output)
  const selectedModel = MODELS.find(m => m.id === model) || MODELS[0];
  const creditCost = mode === 'image-to-image' ? 3 : selectedModel.credits * numOutputs;

  // Load library images
  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await fetch('/api/b-roll/library');
      const data = await res.json();
      if (data.ok) {
        setLibraryImages(data.data.images);
        setLibraryCount(data.data.count);
        setLibraryLimit(data.data.limit);
        // Mark saved URLs
        const urls = new Set(data.data.images.map((img: LibraryImage) => img.url));
        setSavedImages(urls);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  // Load reference images
  const loadReferences = useCallback(async () => {
    setReferencesLoading(true);
    try {
      const res = await fetch('/api/b-roll/references');
      const data = await res.json();
      if (data.ok) {
        setReferenceImages(data.data.images);
        setReferencesCount(data.data.count);
        setReferencesLimit(data.data.limit);
      }
    } catch (err) {
      console.error('Failed to load references:', err);
    } finally {
      setReferencesLoading(false);
    }
  }, []);

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === 'library') {
      loadLibrary();
    } else if (activeTab === 'references') {
      loadReferences();
    }
  }, [activeTab, loadLibrary, loadReferences]);

  // Generate images
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    // For img2img, require a source image
    if (mode === 'image-to-image' && !sourceFile) {
      setError('Please upload a source image');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let uploadedImageUrl: string | null = null;

      // If img2img mode, upload source image first
      if (mode === 'image-to-image' && sourceFile) {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', sourceFile);

        const uploadRes = await fetch('/api/upload/image', {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadRes.json();
        setUploading(false);

        if (!uploadRes.ok) {
          setError(uploadData.message || 'Failed to upload source image');
          setLoading(false);
          return;
        }

        uploadedImageUrl = uploadData.url;
      }

      // Generate image
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: mode === 'image-to-image' ? 'sdxl' : model,
          style,
          aspect_ratio: aspectRatio,
          num_outputs: mode === 'image-to-image' ? 1 : numOutputs,
          source_image: uploadedImageUrl,
          strength: mode === 'image-to-image' ? strength : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('Image generation error response:', data);
        if (data.error_code === 'INSUFFICIENT_CREDITS') {
          setError(`Not enough credits. Need ${data.details?.required}, have ${data.details?.available}.`);
        } else if (data.error_code === 'AI_ERROR' && data.details?.details) {
          setError(`${data.message}: ${data.details.details}`);
        } else {
          setError(data.message || data.error || 'Failed to generate images. Please try again.');
        }
        return;
      }

      setGeneratedImages(data.images);
      if (data.images.length > 0) {
        setSelectedImage(data.images[0]);
      }
      showSuccess(`Generated ${data.images.length} image${data.images.length > 1 ? 's' : ''} successfully`);
    } catch (err) {
      setError('Network error. Please try again.');
      showError('Network error. Please try again.');
      console.error('Generation error:', err);
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  // Download image
  const handleDownload = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `b-roll-${Date.now()}.webp`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      showSuccess('Image downloaded');
    } catch (err) {
      console.error('Download error:', err);
      showError('Failed to download image');
    }
  };

  // Copy URL
  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    showSuccess('URL copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  // Save to library
  const handleSaveToLibrary = async (url: string) => {
    if (savedImages.has(url)) {
      showSuccess('Image already saved');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/b-roll/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          prompt,
          style,
          aspect_ratio: aspectRatio,
          model,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error_code === 'STORAGE_LIMIT') {
          showError(`Storage limit reached. ${data.details?.upgrade_required ? 'Upgrade your plan for more space.' : ''}`);
        } else {
          showError(data.message || 'Failed to save image');
        }
        return;
      }

      setSavedImages(prev => new Set(prev).add(url));
      showSuccess(`Image saved! ${data.remaining} slots remaining.`);
    } catch (err) {
      console.error('Save error:', err);
      showError('Failed to save image');
    } finally {
      setSaving(false);
    }
  };

  // Delete from library
  const handleDeleteFromLibrary = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/b-roll/library/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        showError('Failed to delete image');
        return;
      }

      setLibraryImages(prev => prev.filter(img => img.id !== id));
      setLibraryCount(prev => prev - 1);
      if (selectedLibraryImage?.id === id) {
        setSelectedLibraryImage(null);
      }
      showSuccess('Image deleted');
    } catch (err) {
      console.error('Delete error:', err);
      showError('Failed to delete image');
    } finally {
      setDeletingId(null);
    }
  };

  // Toggle favorite
  const handleToggleFavorite = async (id: string, currentFavorite: boolean) => {
    try {
      const res = await fetch(`/api/b-roll/library/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: !currentFavorite }),
      });

      if (!res.ok) {
        showError('Failed to update favorite');
        return;
      }

      setLibraryImages(prev =>
        prev.map(img =>
          img.id === id ? { ...img, is_favorite: !currentFavorite } : img
        )
      );
      showSuccess(currentFavorite ? 'Removed from favorites' : 'Added to favorites');
    } catch (err) {
      console.error('Favorite error:', err);
      showError('Failed to update favorite');
    }
  };

  // Prompt suggestions
  const promptSuggestions = [
    'Person scrolling phone in bed at night, blue light on face',
    'Hands holding product, clean minimal background',
    'Coffee cup on wooden table, morning sunlight',
    'Person typing on laptop, focused work environment',
    'Healthy food spread on marble counter',
    'Person exercising outdoors, golden hour',
  ];

  const tabs = [
    { id: 'generate' as TabType, label: 'Generate', icon: Sparkles },
    { id: 'library' as TabType, label: 'Library', icon: FolderOpen, count: libraryCount },
    { id: 'references' as TabType, label: 'References', icon: ImageIcon, count: referencesCount },
  ];

  return (
    <div className="max-w-7xl mx-auto pb-24 lg:pb-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">B-Roll Generator</h1>
        <p className="text-zinc-400">
          Generate AI images for your video content. Perfect for B-roll, thumbnails, and visual assets.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-zinc-800 pb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                activeTab === tab.id ? 'bg-blue-500/30' : 'bg-zinc-700'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Generate Tab */}
      {activeTab === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left column - Form */}
          <div className="space-y-6">
            {/* Mode Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setMode('text-to-image')}
                className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                  mode === 'text-to-image'
                    ? 'bg-teal-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Text to Image
              </button>
              <button
                onClick={() => setMode('image-to-image')}
                className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                  mode === 'image-to-image'
                    ? 'bg-teal-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                <ImagePlus className="w-4 h-4" />
                Image to Image
              </button>
            </div>

            {/* Image-to-Image Source Upload */}
            {mode === 'image-to-image' && (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-zinc-300">Source Image</label>

                {!sourceImage ? (
                  <div
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file && file.type.startsWith('image/')) {
                        setSourceFile(file);
                        setSourceImage(URL.createObjectURL(file));
                      }
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-teal-500 transition-colors"
                  >
                    <Upload className="w-10 h-10 mx-auto mb-3 text-zinc-500" />
                    <p className="text-zinc-300 font-medium">Drop an image here</p>
                    <p className="text-zinc-500 text-sm mt-1">or click to browse</p>
                    <p className="text-xs text-zinc-600 mt-2">PNG, JPG, WebP up to 10MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSourceFile(file);
                          setSourceImage(URL.createObjectURL(file));
                        }
                      }}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sourceImage} alt="Source" className="w-full max-h-64 object-contain bg-zinc-800" />
                    <button
                      onClick={() => {
                        setSourceImage(null);
                        setSourceFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="absolute top-2 right-2 p-2 bg-black/70 rounded-full hover:bg-black transition-colors"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                )}

                {/* Transformation Strength Slider */}
                <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700">
                  <div className="flex justify-between mb-3">
                    <label className="text-sm font-medium text-zinc-300">Transformation Strength</label>
                    <span className="text-sm font-medium text-teal-400">{(strength * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={strength}
                    onChange={(e) => setStrength(parseFloat(e.target.value))}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                  />
                  <div className="flex justify-between text-xs text-zinc-500 mt-2">
                    <span>Subtle (keep original)</span>
                    <span>Dramatic (full transform)</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-3">
                    {strength < 0.4
                      ? "Low: Keeps composition, adjusts style and lighting"
                      : strength < 0.7
                        ? "Medium: Significant changes while preserving essence"
                        : "High: Major transformation, creative interpretation"}
                  </p>
                </div>
              </div>
            )}

            {/* Prompt */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                {mode === 'image-to-image' ? 'Describe the transformation' : 'Describe your image'}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={mode === 'image-to-image'
                  ? "e.g., Transform into a professional product photo, soft studio lighting, clean white background"
                  : "e.g., Close-up of hands holding a skincare product, soft lighting, minimal background"
                }
                className="w-full h-28 px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-teal-500 resize-none"
              />
              {/* Suggestions */}
              <div className="flex flex-wrap gap-2 mt-3">
                {promptSuggestions.slice(0, 3).map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPrompt(suggestion)}
                    className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors truncate max-w-[200px]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {/* Style */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {IMAGE_STYLES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setStyle(s.value)}
                    title={s.description}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      style === s.value
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                    }`}
                  >
                    <div className="text-sm font-medium text-zinc-100">{s.label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{s.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Aspect Ratio
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ASPECT_RATIOS.map((ar) => (
                  <button
                    key={ar.value}
                    onClick={() => setAspectRatio(ar.value)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      aspectRatio === ar.value
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                    }`}
                  >
                    <div className="text-sm font-medium text-zinc-100">{ar.label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {ar.platforms[0]}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Model Selection (only for text-to-image) */}
            {mode === 'text-to-image' && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Model
                </label>
                <div className="space-y-2">
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setModel(m.id)}
                      className={`w-full p-4 rounded-xl border text-left transition-all ${
                        model === m.id
                          ? 'border-teal-500 bg-teal-500/10'
                          : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-100">{m.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${m.badgeColor}`}>
                            {m.badge}
                          </span>
                        </div>
                        <span className="text-sm text-zinc-400">
                          {m.credits} credit{m.credits > 1 ? 's' : ''}/img
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">{m.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Number of Images (only for text-to-image) */}
            {mode === 'text-to-image' && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Number of Images
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => setNumOutputs(n)}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                        numOutputs === n
                          ? 'bg-teal-500 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Model info for img2img */}
            {mode === 'image-to-image' && (
              <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-300">Model: SDXL</span>
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-500/20 text-blue-400 border-blue-500/30">
                      Best for img2img
                    </span>
                  </div>
                  <span className="text-sm text-zinc-400">3 credits</span>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  SDXL provides the best results for image-to-image transformations with fine control over the output.
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim() || (mode === 'image-to-image' && !sourceFile)}
              className={`w-full py-4 rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-3 ${
                loading || !prompt.trim() || (mode === 'image-to-image' && !sourceFile)
                  ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white hover:from-teal-600 hover:to-cyan-700'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {uploading ? 'Uploading...' : 'Generating...'}
                </>
              ) : (
                <>
                  {mode === 'image-to-image' ? <ImagePlus size={20} /> : <Sparkles size={20} />}
                  {mode === 'image-to-image' ? 'Transform' : 'Generate'} ({creditCost} credit{creditCost !== 1 ? 's' : ''})
                </>
              )}
            </button>
          </div>

          {/* Right column - Results */}
          <div className="space-y-6">
            {/* Preview */}
            <div className="aspect-[9/16] max-h-[600px] bg-zinc-800/50 border border-zinc-700 rounded-2xl overflow-hidden flex items-center justify-center">
              {selectedImage ? (
                <Image
                  src={selectedImage}
                  alt="Generated image"
                  width={768}
                  height={1365}
                  className="w-full h-full object-contain"
                  unoptimized
                />
              ) : (
                <div className="text-center text-zinc-500 p-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-700/50 flex items-center justify-center">
                    <Sparkles size={32} className="opacity-50" />
                  </div>
                  <p>Generated images will appear here</p>
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {generatedImages.length > 0 && (
              <div className="grid grid-cols-4 gap-3">
                {generatedImages.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(url)}
                    className={`aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all ${
                      selectedImage === url
                        ? 'border-teal-500 ring-2 ring-teal-500/20'
                        : 'border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    <Image
                      src={url}
                      alt={`Generated ${idx + 1}`}
                      width={200}
                      height={356}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Actions */}
            {selectedImage && (
              <div className="flex gap-3">
                <button
                  onClick={() => handleDownload(selectedImage)}
                  className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Download size={18} />
                  Download
                </button>
                <button
                  onClick={() => handleSaveToLibrary(selectedImage)}
                  disabled={saving || savedImages.has(selectedImage)}
                  className={`py-3 px-4 rounded-xl font-medium transition-colors flex items-center gap-2 ${
                    savedImages.has(selectedImage)
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                  }`}
                >
                  {savedImages.has(selectedImage) ? (
                    <>
                      <Check size={18} />
                      Saved
                    </>
                  ) : saving ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Bookmark size={18} />
                      Save
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleCopyUrl(selectedImage)}
                  className="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                  {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                  {copied ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Library Tab */}
      {activeTab === 'library' && (
        <div>
          {/* Storage Info */}
          <div className="mb-6 p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-zinc-300">Storage: </span>
              <span className="font-medium text-zinc-100">{libraryCount} / {libraryLimit}</span>
              <span className="text-zinc-500 ml-2">images</span>
            </div>
            <div className="w-32 h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  libraryCount >= libraryLimit ? 'bg-red-500' : 'bg-teal-500'
                }`}
                style={{ width: `${Math.min((libraryCount / libraryLimit) * 100, 100)}%` }}
              />
            </div>
          </div>

          {libraryLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-zinc-500" />
            </div>
          ) : libraryImages.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center">
                <FolderOpen size={32} className="text-zinc-500" />
              </div>
              <h3 className="text-lg font-medium text-zinc-300 mb-2">No saved images</h3>
              <p className="text-zinc-500">Generate some images and save them to your library</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {libraryImages.map((img) => (
                <div
                  key={img.id}
                  className="group relative aspect-[9/16] rounded-xl overflow-hidden border border-zinc-700 hover:border-zinc-600 transition-all cursor-pointer"
                  onClick={() => setSelectedLibraryImage(img)}
                >
                  <Image
                    src={img.url}
                    alt={img.prompt || 'Saved image'}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-xs text-zinc-300 line-clamp-2">{img.prompt}</p>
                    </div>
                  </div>
                  {/* Favorite badge */}
                  {img.is_favorite && (
                    <div className="absolute top-2 right-2">
                      <Heart size={16} className="text-red-400 fill-red-400" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Image Detail Modal */}
          {selectedLibraryImage && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLibraryImage(null)}>
              <div className="bg-zinc-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col md:flex-row h-full">
                  {/* Image */}
                  <div className="flex-1 relative aspect-[9/16] md:aspect-auto md:min-h-[500px] bg-zinc-950">
                    <Image
                      src={selectedLibraryImage.url}
                      alt={selectedLibraryImage.prompt || 'Saved image'}
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                  {/* Details */}
                  <div className="w-full md:w-80 p-6 border-t md:border-t-0 md:border-l border-zinc-800">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-semibold text-zinc-100">Image Details</h3>
                      <button
                        onClick={() => setSelectedLibraryImage(null)}
                        className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"
                      >
                        <X size={20} className="text-zinc-400" />
                      </button>
                    </div>

                    {selectedLibraryImage.prompt && (
                      <div className="mb-4">
                        <label className="text-xs text-zinc-500 uppercase tracking-wide">Prompt</label>
                        <p className="text-sm text-zinc-300 mt-1">{selectedLibraryImage.prompt}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      {selectedLibraryImage.style && (
                        <div>
                          <label className="text-xs text-zinc-500 uppercase tracking-wide">Style</label>
                          <p className="text-sm text-zinc-300 mt-1 capitalize">{selectedLibraryImage.style}</p>
                        </div>
                      )}
                      {selectedLibraryImage.aspect_ratio && (
                        <div>
                          <label className="text-xs text-zinc-500 uppercase tracking-wide">Ratio</label>
                          <p className="text-sm text-zinc-300 mt-1">{selectedLibraryImage.aspect_ratio}</p>
                        </div>
                      )}
                      {selectedLibraryImage.model && (
                        <div>
                          <label className="text-xs text-zinc-500 uppercase tracking-wide">Model</label>
                          <p className="text-sm text-zinc-300 mt-1">{selectedLibraryImage.model}</p>
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-zinc-500 uppercase tracking-wide">Created</label>
                        <p className="text-sm text-zinc-300 mt-1">
                          {new Date(selectedLibraryImage.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-2">
                      <button
                        onClick={() => handleDownload(selectedLibraryImage.url)}
                        className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Download size={18} />
                        Download
                      </button>
                      <button
                        onClick={() => handleToggleFavorite(selectedLibraryImage.id, selectedLibraryImage.is_favorite)}
                        className={`w-full py-2.5 px-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                          selectedLibraryImage.is_favorite
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                        }`}
                      >
                        <Heart size={18} className={selectedLibraryImage.is_favorite ? 'fill-red-400' : ''} />
                        {selectedLibraryImage.is_favorite ? 'Remove Favorite' : 'Add to Favorites'}
                      </button>
                      <button
                        onClick={() => handleDeleteFromLibrary(selectedLibraryImage.id)}
                        disabled={deletingId === selectedLibraryImage.id}
                        className="w-full py-2.5 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        {deletingId === selectedLibraryImage.id ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Trash2 size={18} />
                        )}
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* References Tab */}
      {activeTab === 'references' && (
        <div>
          {/* Storage Info */}
          <div className="mb-6 p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-zinc-300">Reference Images: </span>
              <span className="font-medium text-zinc-100">{referencesCount} / {referencesLimit}</span>
            </div>
            <div className="w-32 h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  referencesCount >= referencesLimit ? 'bg-red-500' : 'bg-teal-500'
                }`}
                style={{ width: `${Math.min((referencesCount / referencesLimit) * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* Coming Soon Notice */}
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center">
              <Upload size={32} className="text-zinc-500" />
            </div>
            <h3 className="text-lg font-medium text-zinc-300 mb-2">Reference Images</h3>
            <p className="text-zinc-500 mb-4">Upload reference images to guide your AI generations</p>
            <p className="text-sm text-zinc-600">Coming soon...</p>
          </div>
        </div>
      )}
    </div>
  );
}
