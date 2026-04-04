'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Sparkles,
  Zap,
  Eye,
  Package,
  LibraryBig,
} from 'lucide-react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import PackDisplay from '@/components/PackDisplay';
import { useToast } from '@/contexts/ToastContext';
import type { ContentPack } from '@/lib/content-pack/types';

export default function ContentPackPage() {
  const { showSuccess, showError } = useToast();
  const searchParams = useSearchParams();

  // Pre-fill from URL params
  const initialTopic = searchParams.get('topic') || '';
  const initialSeedHook = searchParams.get('seed_hook') || '';
  const initialContext = searchParams.get('context') || '';
  const initialSource = searchParams.get('source') || 'topic';

  const [topic, setTopic] = useState(initialTopic);
  const [loading, setLoading] = useState(false);
  const [pack, setPack] = useState<ContentPack | null>(null);

  // Auto-generate if we have a topic from URL params
  const [autoTriggered, setAutoTriggered] = useState(false);

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setPack(null);

    try {
      const res = await fetch('/api/content-pack/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          topic: topic.trim(),
          source_type: initialSource,
          seed_hook: initialSeedHook || undefined,
          context: initialContext || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Pack generation failed');
      }

      const data = await res.json();
      if (data.ok && data.data) {
        setPack(data.data as ContentPack);
        const parts: string[] = [];
        if (data.data.hooks?.length) parts.push(`${data.data.hooks.length} hooks`);
        if (data.data.script) parts.push('1 script');
        if (data.data.visual_hooks?.length) parts.push(`${data.data.visual_hooks.length} visual ideas`);
        showSuccess(`Pack ready: ${parts.join(', ')}`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Pack failed — try again');
    } finally {
      setLoading(false);
    }
  };

  // Auto-trigger on first render if topic is pre-filled
  if (initialTopic && !autoTriggered && !loading && !pack) {
    setAutoTriggered(true);
    setTimeout(generate, 100);
  }

  const inputClass = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <AdminPageLayout
      title="Content Pack"
      subtitle="Hooks, script, visual ideas, and captions — all from one topic"
      stage="create"
    >
      {/* Cross-links */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <Link href="/admin/content-packs" className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors">
          <LibraryBig size={14} /> Pack Library
        </Link>
        <Link href="/admin/content-studio" className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors">
          <Sparkles size={14} /> Content Studio
        </Link>
        <Link href="/admin/hook-generator" className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors">
          <Zap size={14} /> Hooks
        </Link>
        <Link href="/admin/opportunities" className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors">
          <Eye size={14} /> Opportunities
        </Link>
      </div>

      {/* Input */}
      {!pack && (
        <AdminCard title="Make a Content Pack">
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Topic or product *</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Portable blender for protein shakes"
                className={inputClass}
                disabled={loading}
              />
            </div>
            <button
              onClick={generate}
              disabled={loading || !topic.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Building pack...</>
              ) : (
                <><Package className="w-4 h-4" /> Make Content Pack</>
              )}
            </button>
            {loading && (
              <p className="text-xs text-zinc-500">Generating hooks, script, and visual ideas in parallel — this takes 10-20 seconds.</p>
            )}
          </div>
        </AdminCard>
      )}

      {/* Loading */}
      {loading && !pack && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400 mx-auto mb-3" />
            <p className="text-sm text-zinc-400">Building your content pack...</p>
            <p className="text-xs text-zinc-600 mt-1">Hooks + Script + Visual Ideas running in parallel</p>
          </div>
        </div>
      )}

      {/* Pack results */}
      {pack && (
        <div className="space-y-6">
          {/* Pack header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Package size={18} className="text-teal-400" />
                {pack.topic}
              </h2>
              <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                {pack.status.hooks === 'ok' && <span className="text-emerald-400">{pack.hooks.length} hooks</span>}
                {pack.status.script === 'ok' && <span className="text-emerald-400">1 script</span>}
                {pack.status.visual_hooks === 'ok' && <span className="text-emerald-400">{pack.visual_hooks.length} visual ideas</span>}
                {pack.title_variants.length > 0 && <span className="text-emerald-400">{pack.title_variants.length} captions</span>}
                {pack.meta.persona_used && <span>Persona: {pack.meta.persona_used}</span>}
                {pack.meta.vibe_used && <span className="text-violet-400">Vibe-matched</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pack.id && pack.id !== 'unsaved' && (
                <Link
                  href={`/admin/content-packs/${pack.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
                >
                  Open in Library
                </Link>
              )}
              <button
                onClick={() => { setPack(null); setAutoTriggered(false); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition-colors"
              >
                New Pack
              </button>
            </div>
          </div>

          <PackDisplay pack={pack} />
        </div>
      )}
    </AdminPageLayout>
  );
}
