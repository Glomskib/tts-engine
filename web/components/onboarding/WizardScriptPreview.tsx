'use client';

import { useState } from 'react';
import { Copy, CheckCircle } from 'lucide-react';

interface ScriptData {
  hook?: string;
  setup?: string;
  body?: string;
  cta?: string;
}

interface WizardScriptPreviewProps {
  script: ScriptData;
}

export default function WizardScriptPreview({ script }: WizardScriptPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const parts = [script.hook, script.setup, script.body, script.cta].filter(Boolean);
    const text = parts.join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-2">
      <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
        {/* Hook */}
        {script.hook && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold block mb-1">
              Hook
            </span>
            <p className="text-sm font-bold text-white leading-snug">
              &quot;{script.hook}&quot;
            </p>
          </div>
        )}

        {/* Body */}
        {(script.setup || script.body) && (
          <div className="bg-zinc-800 rounded-lg p-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block mb-1">
              Script
            </span>
            <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
              {[script.setup, script.body].filter(Boolean).join('\n\n')}
            </p>
          </div>
        )}

        {/* CTA */}
        {script.cta && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold block mb-1">
              Call to Action
            </span>
            <p className="text-xs text-zinc-200 leading-relaxed">
              {script.cta}
            </p>
          </div>
        )}
      </div>

      {/* Copy button */}
      <button
        type="button"
        onClick={handleCopy}
        disabled={copied}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
      >
        {copied ? (
          <><CheckCircle className="w-3 h-3" /> Copied!</>
        ) : (
          <><Copy className="w-3 h-3" /> Copy Script</>
        )}
      </button>
    </div>
  );
}
