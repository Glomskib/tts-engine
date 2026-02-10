'use client';

import { useState, useEffect } from 'react';
import {
  X, Sparkles, Shuffle, Users, Mic, Minus, Plus,
  Target, Loader2, Copy, Check, Send,
} from 'lucide-react';

interface RemixModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceType: 'winner' | 'script' | 'competitor';
  sourceText: string;
  sourceTitle?: string;
  onSendToPipeline?: (scriptJson: Record<string, unknown>) => void;
}

const REMIX_STYLES = [
  { key: 'variation', label: 'Fresh Variation', icon: Shuffle, description: 'New hook & delivery, same message' },
  { key: 'angle_shift', label: 'New Angle', icon: Target, description: 'Different perspective entirely' },
  { key: 'audience_swap', label: 'Audience Swap', icon: Users, description: 'Adapt for different demographics' },
  { key: 'tone_change', label: 'Tone Change', icon: Mic, description: 'Flip the vibe (funny ↔ serious)' },
  { key: 'shorten', label: 'Shorten', icon: Minus, description: 'Condense to under 30 seconds' },
  { key: 'expand', label: 'Expand', icon: Plus, description: 'Stretch to 60-90 seconds' },
] as const;

export function RemixModal({
  isOpen,
  onClose,
  sourceType,
  sourceText,
  sourceTitle,
  onSendToPipeline,
}: RemixModalProps) {
  const [selectedStyle, setSelectedStyle] = useState<string>('variation');
  const [customInstructions, setCustomInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    remixed_script: {
      hook?: string;
      body?: string;
      cta?: string;
      on_screen_text?: string[];
      pacing?: string;
      remix_notes?: string;
    };
    raw_text: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setResult(null);
      setError(null);
      setCustomInstructions('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRemix = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: sourceType,
          source_text: sourceText,
          remix_style: selectedStyle,
          custom_instructions: customInstructions || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(data.data);
      } else {
        setError(data.message || 'Remix failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result?.raw_text) {
      navigator.clipboard.writeText(result.raw_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendToPipeline = () => {
    if (result?.remixed_script && onSendToPipeline) {
      onSendToPipeline(result.remixed_script);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-400" />
            <h2 className="text-lg font-semibold text-white">Content Remix</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Source Preview */}
          <div className="p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Source ({sourceType})</span>
              {sourceTitle && <span className="text-xs text-zinc-400">{sourceTitle}</span>}
            </div>
            <p className="text-xs text-zinc-400 line-clamp-3">{sourceText}</p>
          </div>

          {/* Style Selection */}
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-2 block">Remix Style</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {REMIX_STYLES.map(style => {
                const Icon = style.icon;
                const isSelected = selectedStyle === style.key;
                return (
                  <button
                    key={style.key}
                    onClick={() => setSelectedStyle(style.key)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-1 ${isSelected ? 'text-teal-400' : 'text-zinc-500'}`} />
                    <div className={`text-xs font-semibold ${isSelected ? 'text-teal-300' : 'text-zinc-300'}`}>
                      {style.label}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{style.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Instructions */}
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Custom Instructions (optional)</label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="e.g., Make it about skincare, target Gen Z..."
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-teal-500 h-16 resize-none"
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={handleRemix}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-500 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Remixing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Remix
              </>
            )}
          </button>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">Remixed Script</span>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-zinc-800 text-zinc-400 rounded-lg hover:text-white transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  {onSendToPipeline && (
                    <button
                      onClick={handleSendToPipeline}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors"
                    >
                      <Send className="w-3 h-3" /> To Pipeline
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50 space-y-3">
                {result.remixed_script.hook && (
                  <div>
                    <span className="text-[10px] font-bold text-teal-500 uppercase">Hook</span>
                    <p className="text-sm text-white mt-0.5">{result.remixed_script.hook}</p>
                  </div>
                )}
                {result.remixed_script.body && (
                  <div>
                    <span className="text-[10px] font-bold text-blue-400 uppercase">Body</span>
                    <p className="text-sm text-zinc-300 mt-0.5 whitespace-pre-wrap">{result.remixed_script.body}</p>
                  </div>
                )}
                {result.remixed_script.cta && (
                  <div>
                    <span className="text-[10px] font-bold text-green-400 uppercase">CTA</span>
                    <p className="text-sm text-zinc-300 mt-0.5">{result.remixed_script.cta}</p>
                  </div>
                )}
                {result.remixed_script.on_screen_text && result.remixed_script.on_screen_text.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-yellow-400 uppercase">On-Screen Text</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.remixed_script.on_screen_text.map((t, i) => (
                        <span key={i} className="px-2 py-0.5 bg-zinc-700 text-xs text-zinc-300 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {result.remixed_script.pacing && (
                  <span className="inline-block px-2 py-0.5 bg-zinc-700 text-[10px] text-zinc-400 rounded uppercase">
                    {result.remixed_script.pacing} pacing
                  </span>
                )}
              </div>

              {result.remixed_script.remix_notes && (
                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <span className="text-[10px] font-bold text-blue-400 uppercase">Remix Notes</span>
                  <p className="text-xs text-zinc-400 mt-0.5">{result.remixed_script.remix_notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
