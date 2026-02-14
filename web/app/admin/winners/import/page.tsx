'use client';

import { useState, useEffect } from 'react';
import {
  Link2, ArrowRight, Loader2, Check, AlertCircle, Plus,
  Trophy, Video, Sparkles, ChevronDown, Search,
} from 'lucide-react';

interface OEmbedData {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
}

interface ImportResult {
  winner_id: string;
  hook: string;
  brand: string;
  product: string;
  oembed: OEmbedData;
}

interface TranscriptResult {
  transcript: string;
  hook: string;
  scenes: Array<{ timestamp?: string; action?: string; dialogue?: string }>;
  summary: string;
}

interface PipelineResult {
  video_id: string;
  video_code: string;
  status: string;
}

interface Brand {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  brand: string;
}

export default function WinnerImportPage() {
  // Form state
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [brandName, setBrandName] = useState('');
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [createNewBrand, setCreateNewBrand] = useState(false);
  const [createNewProduct, setCreateNewProduct] = useState(false);

  // Data state
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  // Flow state
  const [step, setStep] = useState<'input' | 'preview' | 'transcript' | 'done'>('input');
  const [fetching, setFetching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [addingToPipeline, setAddingToPipeline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [transcriptResult, setTranscriptResult] = useState<TranscriptResult | null>(null);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);

  // Load brands and products
  useEffect(() => {
    fetch('/api/admin/brands')
      .then(r => r.json())
      .then(d => { if (d.brands) setBrands(d.brands); })
      .catch(() => {});

    fetch('/api/admin/products')
      .then(r => r.json())
      .then(d => { if (d.products) setProducts(d.products); })
      .catch(() => {});
  }, []);

  // Filter products by brand
  useEffect(() => {
    if (brandName && !createNewBrand) {
      setFilteredProducts(products.filter(p => p.brand.toLowerCase() === brandName.toLowerCase()));
    } else {
      setFilteredProducts(products);
    }
  }, [brandName, products, createNewBrand]);

  const handleFetchPreview = async () => {
    if (!tiktokUrl.trim()) return;
    setFetching(true);
    setError(null);

    try {
      const res = await fetch('/api/winners/import-tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: tiktokUrl.trim(),
          brand_name: createNewBrand ? brandName : (brandName || undefined),
          product_name: createNewProduct ? productName : (productName || undefined),
          product_category: productCategory || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || data.error || 'Import failed');
      }
      setImportResult(data.data);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setFetching(false);
    }
  };

  const handleTranscribe = async () => {
    if (!importResult) return;
    setTranscribing(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiktok_url: tiktokUrl,
          title: importResult.oembed.title,
          author: importResult.oembed.author_name,
          brand_context: importResult.brand,
          product_context: importResult.product,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Transcription failed');
      }
      setTranscriptResult(data.data);
      setStep('transcript');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setTranscribing(false);
    }
  };

  const handleAddToPipeline = async () => {
    if (!importResult) return;
    setAddingToPipeline(true);
    setError(null);

    try {
      const res = await fetch('/api/pipeline/from-winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winner_id: importResult.winner_id,
          transcript: transcriptResult?.transcript,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Pipeline creation failed');
      }
      setPipelineResult(data.data);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pipeline creation failed');
    } finally {
      setAddingToPipeline(false);
    }
  };

  const handleReset = () => {
    setTiktokUrl('');
    setBrandName('');
    setProductName('');
    setProductCategory('');
    setNotes('');
    setCreateNewBrand(false);
    setCreateNewProduct(false);
    setStep('input');
    setImportResult(null);
    setTranscriptResult(null);
    setPipelineResult(null);
    setError(null);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
            <Video className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Import TikTok Winner</h1>
        </div>
        <p className="text-zinc-400">Paste a TikTok URL to import it as a winner, generate a script, and add to pipeline.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(['input', 'preview', 'transcript', 'done'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s ? 'bg-teal-600 text-white' :
              (['input', 'preview', 'transcript', 'done'].indexOf(step) > i) ? 'bg-green-600 text-white' :
              'bg-zinc-800 text-zinc-500'
            }`}>
              {(['input', 'preview', 'transcript', 'done'].indexOf(step) > i) ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            {i < 3 && <div className={`w-8 h-0.5 ${(['input', 'preview', 'transcript', 'done'].indexOf(step) > i) ? 'bg-green-600' : 'bg-zinc-700'}`} />}
          </div>
        ))}
        <span className="text-xs text-zinc-500 ml-2">
          {step === 'input' ? 'Enter URL' : step === 'preview' ? 'Preview' : step === 'transcript' ? 'Script' : 'Complete'}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Step 1: Input */}
      {step === 'input' && (
        <div className="space-y-6">
          {/* URL */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">TikTok URL</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="url"
                  value={tiktokUrl}
                  onChange={e => setTiktokUrl(e.target.value)}
                  placeholder="https://tiktok.com/@creator/video/..."
                  className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                  onKeyDown={e => { if (e.key === 'Enter') handleFetchPreview(); }}
                />
              </div>
            </div>
          </div>

          {/* Brand */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-zinc-300">Brand</label>
              <button
                type="button"
                onClick={() => { setCreateNewBrand(!createNewBrand); setBrandName(''); }}
                className="text-xs text-teal-400 hover:text-teal-300"
              >
                {createNewBrand ? 'Select existing' : '+ Create new'}
              </button>
            </div>
            {createNewBrand ? (
              <input
                type="text"
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="Enter new brand name"
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              />
            ) : (
              <select
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              >
                <option value="">Skip (use creator name)</option>
                {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            )}
          </div>

          {/* Product */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-zinc-300">Product</label>
              <button
                type="button"
                onClick={() => { setCreateNewProduct(!createNewProduct); setProductName(''); }}
                className="text-xs text-teal-400 hover:text-teal-300"
              >
                {createNewProduct ? 'Select existing' : '+ Create new'}
              </button>
            </div>
            {createNewProduct ? (
              <input
                type="text"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                placeholder="Enter new product name"
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              />
            ) : (
              <select
                value={productName}
                onChange={e => setProductName(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              >
                <option value="">Skip</option>
                {filteredProducts.map(p => <option key={p.id} value={p.name}>{p.name} ({p.brand})</option>)}
              </select>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Why is this a winner? What makes the hook work?"
              rows={2}
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
            />
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleFetchPreview}
            disabled={!tiktokUrl.trim() || fetching}
            className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-600/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {fetching ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Fetching...</>
            ) : (
              <><Search className="w-4 h-4" /> Fetch &amp; Import</>
            )}
          </button>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && importResult && (
        <div className="space-y-6">
          {/* Preview card */}
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
            {importResult.oembed.thumbnail_url && (
              <div className="relative h-48 bg-zinc-900">
                <img
                  src={importResult.oembed.thumbnail_url}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent" />
                <div className="absolute bottom-3 left-3">
                  <span className="text-xs bg-pink-600 text-white px-2 py-0.5 rounded">TikTok</span>
                </div>
              </div>
            )}
            <div className="p-5 space-y-3">
              <h3 className="text-lg font-semibold text-white">{importResult.oembed.title}</h3>
              <p className="text-sm text-zinc-400">@{importResult.oembed.author_name}</p>

              <div className="flex flex-wrap gap-2 mt-2">
                {importResult.brand && (
                  <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-1 rounded">{importResult.brand}</span>
                )}
                {importResult.product && (
                  <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-1 rounded">{importResult.product}</span>
                )}
              </div>

              <div className="mt-3 p-3 bg-zinc-900 rounded-lg">
                <p className="text-xs text-zinc-500 mb-1">Extracted Hook</p>
                <p className="text-sm text-amber-400 font-medium">&ldquo;{importResult.hook}&rdquo;</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleTranscribe}
              disabled={transcribing}
              className="flex-1 py-3 bg-teal-600 hover:bg-purple-500 disabled:bg-teal-600/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {transcribing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating Script...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> AI Generate Script</>
              )}
            </button>
            <button
              type="button"
              onClick={handleAddToPipeline}
              disabled={addingToPipeline}
              className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {addingToPipeline ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</>
              ) : (
                <><ArrowRight className="w-4 h-4" /> Skip to Pipeline</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Transcript */}
      {step === 'transcript' && transcriptResult && (
        <div className="space-y-6">
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-5">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">AI-Generated Script</h3>
            <div className="space-y-2">
              <div className="p-3 bg-zinc-900 rounded-lg">
                <p className="text-xs text-zinc-500 mb-1">Hook</p>
                <p className="text-amber-400 font-medium">&ldquo;{transcriptResult.hook}&rdquo;</p>
              </div>
              {transcriptResult.scenes.map((scene, i) => (
                <div key={i} className="p-3 bg-zinc-900 rounded-lg">
                  <p className="text-xs text-zinc-500 mb-1">Scene {i + 1}{scene.timestamp ? ` (${scene.timestamp})` : ''}</p>
                  {scene.action && <p className="text-sm text-zinc-300">{scene.action}</p>}
                  {scene.dialogue && <p className="text-sm text-teal-300 mt-1">&ldquo;{scene.dialogue}&rdquo;</p>}
                </div>
              ))}
              <div className="p-3 bg-zinc-900/50 rounded-lg">
                <p className="text-xs text-zinc-500 mb-1">Summary</p>
                <p className="text-sm text-zinc-400">{transcriptResult.summary}</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddToPipeline}
            disabled={addingToPipeline}
            className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {addingToPipeline ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating Pipeline Entry...</>
            ) : (
              <><Trophy className="w-4 h-4" /> Add to Winners + Pipeline</>
            )}
          </button>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && pipelineResult && (
        <div className="space-y-6">
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Added to Winners + Pipeline</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Video code: <span className="text-white font-mono">{pipelineResult.video_code}</span>
            </p>
            <div className="flex gap-3 justify-center">
              <a
                href="/admin/winners-bank"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <Trophy className="w-4 h-4" /> View Winners
              </a>
              <a
                href="/admin/pipeline"
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <Video className="w-4 h-4" /> View Pipeline
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="w-full py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Import Another
          </button>
        </div>
      )}
    </div>
  );
}
