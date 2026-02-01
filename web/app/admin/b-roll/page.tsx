'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

// Types for API responses
interface ImageModel {
  id: string;
  name: string;
  description: string;
  credit_cost: number;
}

interface StylePreset {
  id: string;
  name: string;
  description: string;
}

interface AspectRatio {
  id: string;
  label: string;
  width: number;
  height: number;
  platforms: string[];
}

interface GeneratedImageResult {
  url: string;
}

interface GenerationMetadata {
  model: string;
  model_name: string;
  style: string | null;
  style_name: string | null;
  aspect_ratio: string;
  dimensions: { width: number; height: number };
  credit_cost: number;
}

export default function BRollGeneratorPage() {
  // Form state
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('flux-schnell');
  const [style, setStyle] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [numOutputs, setNumOutputs] = useState(1);
  const [negativePrompt, setNegativePrompt] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<GenerationMetadata | null>(null);

  // Options from API
  const [models, setModels] = useState<ImageModel[]>([]);
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [aspectRatios, setAspectRatios] = useState<AspectRatio[]>([]);

  // Fetch available options
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch('/api/ai/generate-image');
        if (res.ok) {
          const data = await res.json();
          setModels(data.models || []);
          setStyles(data.styles || []);
          setAspectRatios(data.aspect_ratios || []);
        }
      } catch (err) {
        console.error('Failed to fetch options:', err);
      }
    };
    fetchOptions();
  }, []);

  // Calculate credit cost
  const selectedModel = models.find(m => m.id === model);
  const creditCost = (selectedModel?.credit_cost || 1) * numOutputs;

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
          style: style || undefined,
          aspect_ratio: aspectRatio,
          num_outputs: numOutputs,
          negative_prompt: negativePrompt || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error_code === 'INSUFFICIENT_CREDITS') {
          setError(`Not enough credits. Need ${data.details?.required}, have ${data.details?.available}. Upgrade to get more credits.`);
        } else {
          setError(data.message || 'Failed to generate images');
        }
        return;
      }

      setGeneratedImages(data.images);
      setMetadata(data.metadata);
      if (data.images.length > 0) {
        setSelectedImage(data.images[0]);
      }
    } catch (err) {
      setError('Network error. Please try again.');
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
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  // Prompt suggestions for B-roll
  const promptSuggestions = [
    'Product on marble surface with soft lighting',
    'Hands holding smartphone, social media feed',
    'Coffee cup on wooden table, morning light',
    'Person typing on laptop, focused work',
    'Healthy food spread, vibrant colors',
    'City street at golden hour, people walking',
  ];

  return (
    <div className="max-w-7xl mx-auto">
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
              placeholder="e.g., Product shot of a sleek smartphone on a minimal desk setup"
              className="w-full h-32 px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
            />
            {/* Suggestions */}
            <div className="flex flex-wrap gap-2 mt-3">
              {promptSuggestions.slice(0, 3).map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => setPrompt(suggestion)}
                  className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
                >
                  {suggestion.substring(0, 30)}...
                </button>
              ))}
            </div>
          </div>

          {/* Model selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Model
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    model === m.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-sm font-medium text-zinc-100">{m.name}</div>
                  <div className="text-xs text-zinc-400 mt-1">{m.description}</div>
                  <div className="text-xs text-blue-400 mt-1">{m.credit_cost} credit/image</div>
                </button>
              ))}
            </div>
          </div>

          {/* Style preset */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Style (optional)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                onClick={() => setStyle(null)}
                className={`px-3 py-2 rounded-lg text-sm transition-all ${
                  style === null
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-zinc-800 text-zinc-400 border border-transparent hover:border-zinc-600'
                }`}
              >
                None
              </button>
              {styles.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  title={s.description}
                  className={`px-3 py-2 rounded-lg text-sm transition-all ${
                    style === s.id
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                      : 'bg-zinc-800 text-zinc-400 border border-transparent hover:border-zinc-600'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect ratio */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {aspectRatios.map((ar) => (
                <button
                  key={ar.id}
                  onClick={() => setAspectRatio(ar.id)}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    aspectRatio === ar.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-sm font-medium text-zinc-100">{ar.label}</div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {ar.platforms.slice(0, 2).join(', ')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Number of outputs */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Number of Images
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setNumOutputs(n)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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

          {/* Advanced options (collapsible) */}
          <details className="group">
            <summary className="text-sm font-medium text-zinc-400 cursor-pointer hover:text-zinc-300 list-none flex items-center gap-2">
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Advanced Options
            </summary>
            <div className="mt-3">
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Negative Prompt (things to avoid)
              </label>
              <input
                type="text"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="e.g., blurry, watermark, text, logo"
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </details>

          {/* Error message */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Generate button */}
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
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                </svg>
                Generate ({creditCost} credit{creditCost !== 1 ? 's' : ''})
              </>
            )}
          </button>
        </div>

        {/* Right column - Results */}
        <div className="space-y-6">
          {/* Selected image preview */}
          <div className="aspect-square bg-zinc-800/50 border border-zinc-700 rounded-2xl overflow-hidden flex items-center justify-center">
            {selectedImage ? (
              <Image
                src={selectedImage}
                alt="Generated image"
                width={1024}
                height={1024}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center text-zinc-500 p-8">
                <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                  <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                  <path d="M21 15l-5-5L5 21" strokeWidth="1.5" />
                </svg>
                <p>Generated images will appear here</p>
              </div>
            )}
          </div>

          {/* Thumbnail grid */}
          {generatedImages.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {generatedImages.map((url, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(url)}
                  className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage === url
                      ? 'border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <Image
                    src={url}
                    alt={`Generated ${idx + 1}`}
                    width={200}
                    height={200}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Actions for selected image */}
          {selectedImage && (
            <div className="flex gap-3">
              <button
                onClick={() => handleDownload(selectedImage)}
                className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7,10 12,15 17,10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedImage);
                }}
                className="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy URL
              </button>
            </div>
          )}

          {/* Generation metadata */}
          {metadata && (
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">Generation Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-zinc-500">Model:</span>
                  <span className="text-zinc-300 ml-2">{metadata.model_name}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Style:</span>
                  <span className="text-zinc-300 ml-2">{metadata.style_name || 'None'}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Size:</span>
                  <span className="text-zinc-300 ml-2">{metadata.dimensions.width}x{metadata.dimensions.height}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Credits:</span>
                  <span className="text-zinc-300 ml-2">{metadata.credit_cost}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
