'use client';

import { useState } from 'react';
import {
  Camera,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Clapperboard,
  Bookmark,
  BookmarkCheck,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import type { VisualHookIdea, VibeContext } from '@/lib/visual-hooks/types';

interface VisualHooksPanelProps {
  /** Product or topic to generate visual hooks for */
  topic: string;
  /** Optional platform context */
  platform?: 'tiktok' | 'youtube_shorts' | 'instagram_reels';
  /** Optional verbal hook to pair with */
  verbalHook?: string;
  /** Optional script context */
  scriptContext?: string;
  /** Optional niche */
  niche?: string;
  /** Optional vibe analysis for style-matching */
  vibe?: VibeContext;
  /** Visual variant — 'inline' embeds in existing layout, 'card' is standalone */
  variant?: 'inline' | 'card';
}

const ENERGY_STYLES: Record<string, { bg: string; text: string }> = {
  calm: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  punchy: { bg: 'bg-orange-500/10', text: 'text-orange-400' },
  dramatic: { bg: 'bg-red-500/10', text: 'text-red-400' },
  comedic: { bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
  mysterious: { bg: 'bg-violet-500/10', text: 'text-violet-400' },
};

const SHOT_LABELS: Record<string, string> = {
  'close-up': 'Close-up',
  'wide': 'Wide shot',
  'pov': 'POV',
  'overhead': 'Overhead',
  'split-screen': 'Split screen',
  'screen-record': 'Screen record',
  'text-first': 'Text first',
};

function strengthLabel(score: number | undefined): { text: string; color: string } | null {
  if (!score) return null;
  if (score >= 75) return { text: 'Strong', color: 'text-emerald-400' };
  if (score >= 55) return { text: 'Solid', color: 'text-amber-400' };
  return null; // Don't show weak labels — just rank them lower
}

export default function VisualHooksPanel({
  topic,
  platform = 'tiktok',
  verbalHook,
  scriptContext,
  niche,
  vibe,
  variant = 'card',
}: VisualHooksPanelProps) {
  const { showSuccess, showError } = useToast();
  const [ideas, setIdeas] = useState<VisualHookIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setIdeas([]);

    try {
      const res = await fetch('/api/visual-hooks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          topic: topic.trim(),
          platform,
          verbal_hook: verbalHook,
          script_context: scriptContext,
          niche,
          vibe,
          count: 6,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate');
      }

      const data = await res.json();
      setIdeas(data.ideas || []);
      if ((data.ideas || []).length > 0) {
        showSuccess(`${data.ideas.length} visual ideas ready`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Visual hooks failed — try again');
    } finally {
      setLoading(false);
    }
  };

  const copyIdea = async (idea: VisualHookIdea, idx: number) => {
    const text = [
      `VISUAL: ${idea.action}`,
      `SHOT: ${SHOT_LABELS[idea.shot_type] || idea.shot_type}`,
      `SETUP: ${idea.setup}`,
      idea.pairs_with ? `VERBAL HOOK: ${idea.pairs_with}` : null,
      `WHY IT WORKS: ${idea.why_it_works}`,
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
      showSuccess('Copied');
    } catch {
      showError('Failed to copy');
    }
  };

  const saveIdea = async (idea: VisualHookIdea, idx: number) => {
    setSavingIdx(idx);
    try {
      if (idea.saved_id) {
        // Unsave
        const res = await fetch('/api/visual-hooks/saved', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: idea.saved_id }),
        });
        const data = await res.json();
        if (data.ok) {
          setIdeas(prev => prev.map((item, i) =>
            i === idx ? { ...item, saved_id: undefined } : item
          ));
          showSuccess('Removed from saved');
        }
      } else {
        // Save
        const res = await fetch('/api/visual-hooks/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            topic: topic.trim(),
            action: idea.action,
            shot_type: idea.shot_type,
            setup: idea.setup,
            pairs_with: idea.pairs_with,
            energy: idea.energy,
            why_it_works: idea.why_it_works,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setIdeas(prev => prev.map((item, i) =>
            i === idx ? { ...item, saved_id: data.id } : item
          ));
          showSuccess('Saved');
        }
      }
    } catch {
      showError('Save failed — try again');
    } finally {
      setSavingIdx(null);
    }
  };

  // Collapsed trigger button — shows when panel has no ideas yet
  if (ideas.length === 0 && !loading) {
    return (
      <div className={variant === 'card' ? 'mt-4' : ''}>
        <button
          onClick={generate}
          disabled={!topic.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Camera size={15} />
          Visual Ideas
        </button>
        {!topic.trim() && (
          <p className="mt-1.5 text-xs text-zinc-600">Add a topic first to get visual ideas</p>
        )}
      </div>
    );
  }

  return (
    <div className={variant === 'card' ? 'mt-4 bg-zinc-900/60 border border-white/10 rounded-xl overflow-hidden' : ''}>
      {/* Header */}
      <div className={`flex items-center justify-between ${variant === 'card' ? 'px-4 py-3 border-b border-white/5' : 'py-2'}`}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-medium text-zinc-200 hover:text-white transition-colors"
        >
          <Clapperboard size={15} className="text-teal-400" />
          Visual Ideas ({ideas.length})
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={generate}
            disabled={loading || !topic.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 rounded-lg transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
            {loading ? 'Thinking...' : 'More Ideas'}
          </button>
        </div>
      </div>

      {/* Ideas list */}
      {expanded && !loading && (
        <div className={variant === 'card' ? 'p-4 space-y-3' : 'py-2 space-y-3'}>
          {ideas.map((idea, idx) => {
            const energyStyle = ENERGY_STYLES[idea.energy] || ENERGY_STYLES.punchy;
            const strength = strengthLabel(idea.strength);
            const isSaving = savingIdx === idx;

            return (
              <div
                key={idx}
                className="p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors"
              >
                {/* Main action */}
                <div className="flex items-start gap-2">
                  <Eye size={14} className="flex-shrink-0 mt-0.5 text-teal-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 leading-relaxed">{idea.action}</p>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => saveIdea(idea, idx)}
                      disabled={isSaving}
                      className={`p-1.5 rounded transition-colors ${
                        idea.saved_id
                          ? 'text-teal-400 hover:text-teal-300'
                          : 'text-zinc-600 hover:text-zinc-400'
                      }`}
                      title={idea.saved_id ? 'Remove from saved' : 'Save this idea'}
                    >
                      {isSaving ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : idea.saved_id ? (
                        <BookmarkCheck size={13} />
                      ) : (
                        <Bookmark size={13} />
                      )}
                    </button>
                    <button
                      onClick={() => copyIdea(idea, idx)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Copy"
                    >
                      {copiedIdx === idx ? <Check size={13} className="text-teal-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>

                {/* Tags */}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium bg-zinc-800 text-zinc-400 rounded">
                    {SHOT_LABELS[idea.shot_type] || idea.shot_type}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded ${energyStyle.bg} ${energyStyle.text}`}>
                    {idea.energy}
                  </span>
                  {strength && (
                    <span className={`text-[11px] font-medium ${strength.color}`}>
                      {strength.text}
                    </span>
                  )}
                </div>

                {/* Setup */}
                <div className="mt-2 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-400">Setup:</span> {idea.setup}
                </div>

                {/* Pairs with */}
                {idea.pairs_with && (
                  <div className="mt-1.5 text-xs text-zinc-500">
                    <span className="font-medium text-violet-400">Try saying:</span>{' '}
                    <span className="text-zinc-300 italic">&ldquo;{idea.pairs_with}&rdquo;</span>
                  </div>
                )}

                {/* Why it works */}
                {idea.why_it_works && (
                  <div className="mt-1.5 text-xs text-zinc-600 italic">
                    {idea.why_it_works}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className={`flex items-center justify-center py-8 ${variant === 'card' ? 'px-4' : ''}`}>
          <Loader2 size={18} className="animate-spin text-teal-400" />
          <span className="ml-2 text-sm text-zinc-400">Finding filmable openings...</span>
        </div>
      )}
    </div>
  );
}
