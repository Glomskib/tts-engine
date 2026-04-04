'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Package,
  ArrowLeft,
  Star,
  Trash2,
  Save,
  Pencil,
} from 'lucide-react';
import AdminPageLayout from '@/app/admin/components/AdminPageLayout';
import PackDisplay from '@/components/PackDisplay';
import { useToast } from '@/contexts/ToastContext';
import type { ContentPack } from '@/lib/content-pack/types';

export default function ContentPackDetailPage() {
  const { showSuccess, showError } = useToast();
  const params = useParams();
  const router = useRouter();
  const packId = params.id as string;

  const [pack, setPack] = useState<ContentPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<'hooks' | 'script' | 'visual_hooks' | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [togglingFav, setTogglingFav] = useState(false);

  const fetchPack = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content-pack?id=${packId}`, { credentials: 'include' });
      if (!res.ok) {
        showError('Pack not found');
        router.push('/admin/content-packs');
        return;
      }
      const result = await res.json();
      const found = result.data as ContentPack;

      setPack(found);
      setNotesInput(found.notes || '');
    } catch {
      showError('Failed to load pack');
      router.push('/admin/content-packs');
    } finally {
      setLoading(false);
    }
  }, [packId, router, showError]);

  useEffect(() => { fetchPack(); }, [fetchPack]);

  const handleRegenerate = async (component: 'hooks' | 'script' | 'visual_hooks') => {
    if (!pack || regenerating) return;
    setRegenerating(component);
    try {
      const res = await fetch('/api/content-pack/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pack_id: pack.id, component }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Regeneration failed');
      }

      const result = await res.json();

      // Update pack locally
      setPack(prev => {
        if (!prev) return prev;
        const updated = { ...prev, status: result.status };
        if (component === 'hooks') updated.hooks = result.data;
        else if (component === 'script') updated.script = result.data;
        else updated.visual_hooks = result.data;
        if (result.title_variants) updated.title_variants = result.title_variants;
        return updated;
      });

      const labels = { hooks: 'Hooks', script: 'Script', visual_hooks: 'Visual ideas' };
      showSuccess(`${labels[component]} regenerated`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setRegenerating(null);
    }
  };

  const toggleFavorite = async () => {
    if (!pack) return;
    setTogglingFav(true);
    try {
      const res = await fetch('/api/content-pack', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: pack.id, favorited: !pack.favorited }),
      });
      if (!res.ok) throw new Error('Failed');
      setPack(prev => prev ? { ...prev, favorited: !prev.favorited } : prev);
      showSuccess(pack.favorited ? 'Removed from favorites' : 'Added to favorites');
    } catch {
      showError('Failed to update');
    } finally {
      setTogglingFav(false);
    }
  };

  const saveNotes = async () => {
    if (!pack) return;
    setSavingNotes(true);
    try {
      const res = await fetch('/api/content-pack', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: pack.id, notes: notesInput }),
      });
      if (!res.ok) throw new Error('Failed');
      setPack(prev => prev ? { ...prev, notes: notesInput } : prev);
      setEditingNotes(false);
      showSuccess('Notes saved');
    } catch {
      showError('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const deletePack = async () => {
    if (!pack) return;
    if (!confirm('Delete this content pack? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/content-pack?id=${pack.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
      showSuccess('Pack deleted');
      router.push('/admin/content-packs');
    } catch {
      showError('Failed to delete');
    }
  };

  if (loading) {
    return (
      <AdminPageLayout title="Content Pack" stage="create">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
        </div>
      </AdminPageLayout>
    );
  }

  if (!pack) return null;

  return (
    <AdminPageLayout
      title={pack.topic}
      subtitle={`${pack.source_type} pack · ${new Date(pack.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
      stage="create"
    >
      {/* Back link + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <Link
          href="/admin/content-packs"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft size={14} /> Pack Library
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleFavorite}
            disabled={togglingFav}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              pack.favorited
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
            }`}
          >
            <Star size={12} className={pack.favorited ? 'fill-amber-400' : ''} />
            {pack.favorited ? 'Favorited' : 'Favorite'}
          </button>

          <button
            onClick={deletePack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-500/30 rounded-lg transition-colors"
          >
            <Trash2 size={12} /> Delete
          </button>

          <Link
            href="/admin/content-pack"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
          >
            <Package size={12} /> New Pack
          </Link>
        </div>
      </div>

      {/* Pack metadata */}
      <div className="flex items-center gap-3 mb-4 text-xs text-zinc-500 flex-wrap">
        {pack.status.hooks === 'ok' && <span className="text-emerald-400">{pack.hooks.length} hooks</span>}
        {pack.status.script === 'ok' && <span className="text-emerald-400">1 script</span>}
        {pack.status.visual_hooks === 'ok' && <span className="text-emerald-400">{pack.visual_hooks.length} visual ideas</span>}
        {pack.title_variants.length > 0 && <span className="text-emerald-400">{pack.title_variants.length} captions</span>}
        {pack.meta?.persona_used && <span>Persona: {pack.meta.persona_used}</span>}
        {pack.meta?.vibe_used && <span className="text-violet-400">Vibe-matched</span>}
      </div>

      {/* Notes */}
      <div className="mb-6">
        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Add notes about this pack..."
              rows={3}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {savingNotes ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save
              </button>
              <button
                onClick={() => { setEditingNotes(false); setNotesInput(pack.notes || ''); }}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditingNotes(true)}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Pencil size={12} />
            {pack.notes ? pack.notes : 'Add notes...'}
          </button>
        )}
      </div>

      {/* Pack content */}
      <PackDisplay
        pack={pack}
        onRegenerate={handleRegenerate}
        regenerating={regenerating}
      />
    </AdminPageLayout>
  );
}
