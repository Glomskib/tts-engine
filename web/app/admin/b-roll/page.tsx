'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Download, Copy, Loader2, Sparkles, Check } from 'lucide-react';
import { IMAGE_STYLES, ASPECT_RATIOS, IMAGE_MODELS } from '@/lib/replicate';
import { useToast } from '@/contexts/ToastContext';

export default function BRollGeneratorPage() {
  const { showSuccess, showError } = useToast();

  // Form state
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<'flux-schnell' | 'flux-dev' | 'sdxl'>('flux-schnell');
  const [style, setStyle] = useState<string>('lifestyle');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [numOutputs, setNumOutputs] = useState(2);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Calculate credit cost
  const creditCost = IMAGE_MODELS[model].creditCost * numOutputs;

  // Generate images
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model,
          style,
          aspect_ratio: aspectRatio,
          num_outputs: numOutputs,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('Image generation error response:', data);
        if (data.error_code === 'INSUFFICIENT_CREDITS') {
          setError(`Not enough credits. Need ${data.details?.required}, have ${data.details?.available}.`);
        } else if (data.error_code === 'AI_ERROR' && data.details?.details) {
          // Show detailed error message for AI errors
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

  // Prompt suggestions
  const promptSuggestions = [
    'Person scrolling phone in bed at night, blue light on face',
    'Hands holding product, clean minimal background',
    'Coffee cup on wooden table, morning sunlight',
    'Person typing on laptop, focused work environment',
    'Healthy food spread on marble counter',
    'Person exercising outdoors, golden hour',
  ];

  return (
    <div className="max-w-7xl mx-auto pb-24 lg:pb-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">B-Roll Generator</h1>
        <p className="text-zinc-400">
          Generate AI images for your video content. Perfect for B-roll, thumbnails, and visual assets.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column - Form */}
        <div className="space-y-6">
          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Describe your image
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Close-up of hands holding a skincare product, soft lighting, minimal background"
              className="w-full h-28 px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
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
                      ? 'border-blue-500 bg-blue-500/10'
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
                      ? 'border-blue-500 bg-blue-500/10'
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

          {/* Model & Count */}
          <div className="grid grid-cols-2 gap-4">
            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as typeof model)}
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-100 focus:outline-none focus:border-blue-500"
              >
                {Object.entries(IMAGE_MODELS).map(([key, m]) => (
                  <option key={key} value={key}>
                    {m.name} ({m.creditCost} credit{m.creditCost > 1 ? 's' : ''}/img)
                  </option>
                ))}
              </select>
            </div>

            {/* Count */}
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
                        ? 'bg-blue-500 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-3 ${
              loading || !prompt.trim()
                ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-violet-600 text-white hover:from-blue-600 hover:to-violet-700'
            }`}
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Generate ({creditCost} credit{creditCost !== 1 ? 's' : ''})
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
                      ? 'border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <Image
                    src={url}
                    alt={`Generated ${idx + 1}`}
                    width={200}
                    height={356}
                    className="w-full h-full object-cover"
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
    </div>
  );
}
