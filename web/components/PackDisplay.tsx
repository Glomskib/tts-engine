'use client';

import { useState } from 'react';
import {
  Loader2,
  Sparkles,
  Zap,
  Eye,
  Copy,
  Check,
  FileText,
  Mic,
  MessageCircle,
  Camera,
  Tag,
  Clapperboard,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import type {
  ContentPack,
  PackHook,
  PackScript,
  PackVisualHook,
} from '@/lib/content-pack/types';

// ── Helpers ──

const ENERGY_STYLES: Record<string, { bg: string; text: string }> = {
  calm: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  punchy: { bg: 'bg-orange-500/10', text: 'text-orange-400' },
  dramatic: { bg: 'bg-red-500/10', text: 'text-red-400' },
  comedic: { bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
  mysterious: { bg: 'bg-violet-500/10', text: 'text-violet-400' },
};

const SHOT_LABELS: Record<string, string> = {
  'close-up': 'Close-up', wide: 'Wide', pov: 'POV', overhead: 'Overhead',
  'split-screen': 'Split screen', 'screen-record': 'Screen record', 'text-first': 'Text first',
};

interface PackDisplayProps {
  pack: ContentPack;
  /** Show regenerate buttons per section */
  onRegenerate?: (component: 'hooks' | 'script' | 'visual_hooks') => void;
  regenerating?: 'hooks' | 'script' | 'visual_hooks' | null;
}

export default function PackDisplay({ pack, onRegenerate, regenerating }: PackDisplayProps) {
  const { showSuccess, showError } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyText = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      showSuccess('Copied');
    } catch {
      showError('Failed to copy');
    }
  };

  const copyFullPack = async () => {
    const parts: string[] = [`CONTENT PACK: ${pack.topic}\n`];

    if (pack.hooks.length > 0) {
      parts.push('═══ HOOKS ═══\n');
      pack.hooks.forEach((h, i) => {
        parts.push(`Hook #${i + 1} (${h.category.replace(/_/g, ' ')})`);
        parts.push(`  Visual: ${h.visual_hook}`);
        parts.push(`  Text: ${h.text_on_screen}`);
        parts.push(`  Verbal: ${h.verbal_hook}`);
        parts.push(`  Why: ${h.why_this_works}\n`);
      });
    }

    if (pack.script) {
      parts.push('═══ SCRIPT ═══\n');
      parts.push(pack.script.full_script);
      parts.push(`\nCTA: ${pack.script.cta}`);
      if (pack.script.filming_notes) parts.push(`Filming: ${pack.script.filming_notes}`);
      parts.push('');
    }

    if (pack.visual_hooks.length > 0) {
      parts.push('═══ VISUAL IDEAS ═══\n');
      pack.visual_hooks.forEach((v, i) => {
        parts.push(`${i + 1}. ${v.action} [${SHOT_LABELS[v.shot_type] || v.shot_type}]`);
        parts.push(`   Setup: ${v.setup}`);
        if (v.pairs_with) parts.push(`   Try saying: "${v.pairs_with}"`);
        parts.push('');
      });
    }

    if (pack.title_variants.length > 0) {
      parts.push('═══ CAPTION IDEAS ═══\n');
      pack.title_variants.forEach((t, i) => parts.push(`${i + 1}. ${t}`));
    }

    await copyText(parts.join('\n'), 'full-pack');
  };

  const useScriptInStudio = () => {
    if (!pack.script) return;
    const params = new URLSearchParams({
      inspiration: pack.script.full_script.slice(0, 500),
      hook: pack.script.hook,
    });
    window.location.href = `/admin/content-studio?${params.toString()}`;
  };

  const useHookInStudio = (hook: PackHook) => {
    const params = new URLSearchParams({
      hook: hook.verbal_hook,
      inspiration: `Visual: ${hook.visual_hook}\nText: ${hook.text_on_screen}\nWhy: ${hook.why_this_works}`,
    });
    window.location.href = `/admin/content-studio?${params.toString()}`;
  };

  const RegenButton = ({ component, label }: { component: 'hooks' | 'script' | 'visual_hooks'; label: string }) => {
    if (!onRegenerate) return null;
    const isRegen = regenerating === component;
    return (
      <button
        onClick={() => onRegenerate(component)}
        disabled={!!regenerating}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-400 border border-zinc-700 rounded transition-colors"
      >
        {isRegen ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
        {isRegen ? `Regenerating ${label}...` : `Regenerate ${label}`}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Copy All */}
      <div className="flex justify-end">
        <button
          onClick={copyFullPack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
        >
          {copiedField === 'full-pack' ? <><Check size={13} className="text-teal-400" /> Copied</> : <><Copy size={13} /> Copy All</>}
        </button>
      </div>

      {/* Component failure warnings */}
      {(pack.status.hooks === 'failed' || pack.status.script === 'failed' || pack.status.visual_hooks === 'failed') && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
          <AlertCircle size={14} />
          <span>
            Some parts didn&apos;t generate:{' '}
            {[
              pack.status.hooks === 'failed' && 'hooks',
              pack.status.script === 'failed' && 'script',
              pack.status.visual_hooks === 'failed' && 'visual ideas',
            ].filter(Boolean).join(', ')}
          </span>
        </div>
      )}

      {/* ═══ HOOKS ═══ */}
      {(pack.hooks.length > 0 || pack.status.hooks === 'failed') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
              <Zap size={14} className="text-teal-400" /> Hooks ({pack.hooks.length})
            </h3>
            <RegenButton component="hooks" label="Hooks" />
          </div>
          <div className="space-y-3">
            {pack.hooks.map((hook, i) => (
              <div key={i} className="p-4 bg-zinc-900/60 border border-white/10 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-500">#{i + 1}</span>
                    {hook.category && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded">
                        <Tag size={10} />
                        {hook.category.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => useHookInStudio(hook)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded transition-colors"
                    >
                      <Sparkles size={10} /> Use in Studio
                    </button>
                    <button
                      onClick={() => copyText(
                        `VISUAL: ${hook.visual_hook}\nTEXT: ${hook.text_on_screen}\nVERBAL: ${hook.verbal_hook}`,
                        `hook-${i}`
                      )}
                      className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {copiedField === `hook-${i}` ? <Check size={13} className="text-teal-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Eye size={13} className="flex-shrink-0 mt-0.5 text-teal-400" />
                    <p className="text-sm text-zinc-200">{hook.visual_hook}</p>
                  </div>
                  <div className="flex gap-2">
                    <MessageCircle size={13} className="flex-shrink-0 mt-0.5 text-blue-400" />
                    <p className="text-sm text-zinc-200">{hook.text_on_screen}</p>
                  </div>
                  <div className="flex gap-2">
                    <Mic size={13} className="flex-shrink-0 mt-0.5 text-violet-400" />
                    <p className="text-sm text-zinc-200">{hook.verbal_hook}</p>
                  </div>
                  <p className="text-xs text-zinc-500 italic mt-1">{hook.why_this_works}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SCRIPT ═══ */}
      {(pack.script || pack.status.script === 'failed') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
              <FileText size={14} className="text-violet-400" /> Script
            </h3>
            <RegenButton component="script" label="Script" />
          </div>
          {pack.script && (
            <div className="p-4 bg-zinc-900/60 border border-white/10 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  {pack.script.estimated_length && <span>{pack.script.estimated_length}</span>}
                  {pack.script.persona && <span>· {pack.script.persona}</span>}
                  {pack.script.structure_used && <span>· {pack.script.structure_used}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={useScriptInStudio}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded transition-colors"
                  >
                    <Sparkles size={10} /> Open in Studio
                  </button>
                  <button
                    onClick={() => copyText(pack.script!.full_script, 'script')}
                    className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {copiedField === 'script' ? <Check size={13} className="text-teal-400" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold text-teal-400 uppercase tracking-wide mb-1">Hook</div>
                <p className="text-sm text-white font-medium">{pack.script.hook}</p>
              </div>

              <div>
                <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">Full Script</div>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{pack.script.full_script}</p>
              </div>

              {pack.script.cta && (
                <div>
                  <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-1">CTA</div>
                  <p className="text-sm text-zinc-200">{pack.script.cta}</p>
                </div>
              )}

              {pack.script.on_screen_text.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-1">On-Screen Text</div>
                  <ul className="space-y-1">
                    {pack.script.on_screen_text.map((t, i) => (
                      <li key={i} className="text-sm text-zinc-300">{i + 1}. {t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {pack.script.filming_notes && (
                <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-lg">
                  <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-1">Filming Notes</div>
                  <p className="text-sm text-zinc-300">{pack.script.filming_notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ VISUAL IDEAS ═══ */}
      {(pack.visual_hooks.length > 0 || pack.status.visual_hooks === 'failed') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
              <Camera size={14} className="text-teal-400" /> Visual Ideas ({pack.visual_hooks.length})
            </h3>
            <RegenButton component="visual_hooks" label="Visual Ideas" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pack.visual_hooks.map((v, i) => {
              const energyStyle = ENERGY_STYLES[v.energy] || ENERGY_STYLES.punchy;
              return (
                <div key={i} className="p-3 bg-zinc-900/60 border border-white/10 rounded-xl">
                  <div className="flex items-start gap-2">
                    <Clapperboard size={13} className="flex-shrink-0 mt-0.5 text-teal-400" />
                    <p className="text-sm text-zinc-200 leading-relaxed flex-1">{v.action}</p>
                    <button
                      onClick={() => copyText(`VISUAL: ${v.action}\nSHOT: ${SHOT_LABELS[v.shot_type] || v.shot_type}\nSETUP: ${v.setup}`, `visual-${i}`)}
                      className="flex-shrink-0 p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {copiedField === `visual-${i}` ? <Check size={12} className="text-teal-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-400 rounded">{SHOT_LABELS[v.shot_type] || v.shot_type}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${energyStyle.bg} ${energyStyle.text}`}>{v.energy}</span>
                    {v.strength && v.strength >= 70 && <span className="text-[10px] font-medium text-emerald-400">Strong</span>}
                  </div>
                  <div className="mt-1.5 text-xs text-zinc-500">Setup: {v.setup}</div>
                  {v.pairs_with && (
                    <div className="mt-1 text-xs text-zinc-500">
                      <span className="text-violet-400">Try saying:</span> <span className="text-zinc-300 italic">&ldquo;{v.pairs_with}&rdquo;</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ CAPTION IDEAS ═══ */}
      {pack.title_variants.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3 flex items-center gap-2">
            <MessageCircle size={14} className="text-blue-400" /> Caption Ideas ({pack.title_variants.length})
          </h3>
          <div className="space-y-2">
            {pack.title_variants.map((t, i) => (
              <div key={i} className="flex items-center gap-2 p-3 bg-zinc-900/60 border border-white/10 rounded-xl">
                <p className="text-sm text-zinc-300 flex-1">{t}</p>
                <button
                  onClick={() => copyText(t, `caption-${i}`)}
                  className="flex-shrink-0 p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {copiedField === `caption-${i}` ? <Check size={12} className="text-teal-400" /> : <Copy size={12} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hashtags */}
      {pack.script?.hashtags && pack.script.hashtags.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Hashtags</h3>
          <div className="flex flex-wrap gap-2">
            {pack.script.hashtags.map((h, i) => (
              <span key={i} className="px-2 py-1 text-xs bg-zinc-800 text-zinc-400 rounded-lg">
                {h.startsWith('#') ? h : `#${h}`}
              </span>
            ))}
            <button
              onClick={() => copyText(pack.script!.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' '), 'hashtags')}
              className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
            >
              {copiedField === 'hashtags' ? 'Copied!' : 'Copy all'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
