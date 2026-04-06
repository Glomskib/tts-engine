'use client';

import { useState } from 'react';
import AdminPageLayout from '@/app/admin/components/AdminPageLayout';
import { Upload, Loader2, CheckCircle, FileImage, Copy, Check } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface ParsedBrief {
  brand_name: string;
  products: Array<{ name: string; description: string; price: string }>;
  target_audience: string;
  key_messages: string[];
  content_guidelines: string[];
  hashtags: string[];
  commission: string;
  posting_requirements: string;
  brand_voice: string;
  additional_notes: string;
}

export default function BriefAnalyzerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParsedBrief | null>(null);
  const [copied, setCopied] = useState(false);
  const { showSuccess, showError } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreview(event.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/ai/analyze-brief', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Analysis failed');
      }

      const data = await res.json();
      setResult(data.data);
      showSuccess('Brief analyzed successfully!');
    } catch (err: unknown) {
      console.error(err);
      showError(err instanceof Error ? err.message : 'Failed to analyze brief');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminPageLayout title="Brand Brief Analyzer">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Upload Brief</h3>

          <div className="mb-4">
            <label className="block w-full">
              <div className="border-2 border-dashed border-gray-600 hover:border-teal-500 rounded-lg p-8 text-center cursor-pointer transition">
                {preview ? (
                  <img src={preview} alt="Brief preview" className="max-w-full max-h-64 mx-auto rounded" />
                ) : (
                  <>
                    <FileImage className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="text-gray-400">Click to upload or drag & drop</p>
                    <p className="text-sm text-gray-500 mt-1">PNG, JPG, or PDF</p>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </label>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            className="w-full py-3 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center gap-2 transition"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Analyze Brief
              </>
            )}
          </button>
        </div>

        {/* Results Section */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Extracted Data</h3>

          {result ? (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Brand Name</label>
                <input
                  type="text"
                  value={result.brand_name}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded"
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Target Audience</label>
                <textarea
                  value={result.target_audience}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded"
                  rows={2}
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Brand Voice</label>
                <textarea
                  value={result.brand_voice}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded"
                  rows={2}
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Commission</label>
                <input
                  type="text"
                  value={result.commission}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded"
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Products ({result.products.length})</label>
                <div className="space-y-2">
                  {result.products.map((product, idx) => (
                    <div key={idx} className="p-3 bg-gray-900 rounded border border-gray-700">
                      <div className="font-medium">{product.name}</div>
                      <div className="text-sm text-gray-400">{product.description}</div>
                      <div className="text-sm text-teal-400">{product.price}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Key Messages</label>
                <ul className="list-disc list-inside text-sm text-gray-300">
                  {result.key_messages.map((msg, idx) => (
                    <li key={idx}>{msg}</li>
                  ))}
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Hashtags</label>
                <div className="flex flex-wrap gap-2">
                  {result.hashtags.map((tag, idx) => (
                    <span key={idx} className="px-2 py-1 bg-teal-500/20 text-teal-400 rounded text-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => {
                    if (!result) return;
                    const text = [
                      `Brand: ${result.brand_name}`,
                      `Voice: ${result.brand_voice}`,
                      `Audience: ${result.target_audience}`,
                      `Key Messages:\n${result.key_messages.map(m => `• ${m}`).join('\n')}`,
                      `Guidelines:\n${result.content_guidelines.map(g => `• ${g}`).join('\n')}`,
                      `Hashtags: ${result.hashtags.join(' ')}`,
                      result.commission ? `Commission: ${result.commission}` : '',
                      result.posting_requirements ? `Requirements: ${result.posting_requirements}` : '',
                    ].filter(Boolean).join('\n\n');
                    navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 rounded-lg font-semibold flex items-center justify-center gap-2 transition text-white text-sm"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied to clipboard!' : 'Copy Brief Summary'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-12">
              Upload and analyze a brief to see extracted data here
            </div>
          )}
        </div>
      </div>
    </AdminPageLayout>
  );
}
