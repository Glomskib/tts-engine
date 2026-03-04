'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check, ExternalLink, FolderPlus, Loader2, Sparkles, ArrowLeft } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import type { ContentItem } from '@/lib/content-items/types';
import type { CreatorBriefData, BriefScene } from '@/lib/briefs/creator-brief-types';

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl text-sm font-medium transition-colors bg-zinc-800 text-zinc-200 active:bg-zinc-700"
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? 'Copied!' : (label || 'Copy')}
    </button>
  );
}

export default function RecordPage({ params }: { params: Promise<{ contentItemId: string }> }) {
  const { contentItemId } = use(params);
  const router = useRouter();
  const { showToast } = useToast();

  const [item, setItem] = useState<ContentItem | null>(null);
  const [brief, setBrief] = useState<CreatorBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [itemRes, briefRes] = await Promise.all([
        fetch(`/api/content-items/${contentItemId}`),
        fetch(`/api/content-items/${contentItemId}/brief`),
      ]);
      const [itemJson, briefJson] = await Promise.all([itemRes.json(), briefRes.json()]);
      if (itemJson.ok && itemJson.data) {
        setItem(itemJson.data);
        setFolderUrl(itemJson.data.drive_folder_url);
      }
      if (briefJson.ok && briefJson.data?.data) {
        setBrief(briefJson.data.data as CreatorBriefData);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [contentItemId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGenerateBrief = async () => {
    setGeneratingBrief(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cow_tier: item?.brief_selected_cow_tier || 'edgy' }),
      });
      const json = await res.json();
      if (json.ok && json.data?.data) {
        setBrief(json.data.data as CreatorBriefData);
        showToast({ message: 'Brief generated!', type: 'success' });
      } else {
        showToast({ message: json.error || 'Failed', type: 'error' });
      }
    } catch {
      showToast({ message: 'Network error', type: 'error' });
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleCreateFolder = async () => {
    setCreatingFolder(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/drive-folder`, { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setFolderUrl(json.data.drive_folder_url);
        showToast({ message: 'Folder created!', type: 'success' });
      } else {
        showToast({ message: json.error || 'Failed', type: 'error' });
      }
    } catch {
      showToast({ message: 'Network error', type: 'error' });
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleMarkRecorded = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'recorded' }),
      });
      const json = await res.json();
      if (json.ok) {
        showToast({ message: 'Marked as recorded!', type: 'success' });
        router.push('/admin/studio');
      } else {
        showToast({ message: json.error || 'Failed', type: 'error' });
      }
    } catch {
      showToast({ message: 'Network error', type: 'error' });
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-base text-[var(--text-muted)]">Content item not found.</p>
      </div>
    );
  }

  const activeTier = brief?.purple_cow?.tiers?.[item.brief_selected_cow_tier || 'edgy'];

  return (
    <div className="pb-28 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-2 pb-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-[var(--text-muted)] mb-3">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-xl font-bold text-[var(--text)]">Recording Kit</h1>
        <p className="text-sm text-[var(--text-muted)] font-mono">{item.short_id} — {item.title}</p>
      </div>

      <div className="px-4 space-y-6">
        {/* Generate Brief CTA */}
        {!brief && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 text-center space-y-3">
            <p className="text-base text-amber-300">No brief yet. Generate one to get your script and scenes.</p>
            <button
              onClick={handleGenerateBrief}
              disabled={generatingBrief}
              className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-semibold bg-teal-600 text-white active:bg-teal-700 disabled:opacity-50"
            >
              {generatingBrief ? <><Loader2 size={18} className="animate-spin" /> Generating...</> : <><Sparkles size={18} /> Generate Creator Brief</>}
            </button>
          </div>
        )}

        {/* Hook */}
        {brief?.one_liner && (
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Hook</h2>
            <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4 flex items-start justify-between gap-3">
              <p className="text-base font-medium text-teal-300 flex-1">&ldquo;{brief.one_liner}&rdquo;</p>
              <CopyBtn text={brief.one_liner} label="Copy" />
            </div>
          </section>
        )}

        {/* Concept */}
        {brief?.plot && (
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Concept</h2>
            <p className="text-base text-[var(--text-muted)] leading-relaxed">{brief.plot}</p>
          </section>
        )}

        {/* Scenes */}
        {brief?.scenes && brief.scenes.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">Scenes</h2>
            <div className="space-y-3">
              {brief.scenes.map((scene: BriefScene) => (
                <div key={scene.scene_number} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--text-muted)]">Scene {scene.scene_number}</span>
                    {scene.framing && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {scene.framing}
                      </span>
                    )}
                  </div>
                  <p className="text-base text-[var(--text)]">{scene.action}</p>
                  {scene.spoken_lines && (
                    <div className="flex items-start justify-between gap-2 bg-zinc-800/50 rounded-lg p-3">
                      <p className="text-base text-zinc-300 italic flex-1">&ldquo;{scene.spoken_lines}&rdquo;</p>
                      <CopyBtn text={scene.spoken_lines} label="Copy" />
                    </div>
                  )}
                  {scene.on_screen_text && (
                    <p className="text-sm text-[var(--text-muted)]">On-screen: {scene.on_screen_text}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTAs */}
        {brief?.captions_pack?.ctas && brief.captions_pack.ctas.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">CTAs</h2>
            <div className="space-y-2">
              {brief.captions_pack.ctas.map((cta, i) => (
                <div key={i} className="flex items-center justify-between gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                  <p className="text-base text-[var(--text)] flex-1">{cta}</p>
                  <CopyBtn text={cta} label="Copy" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Comment Bait */}
        {activeTier?.comment_bait && activeTier.comment_bait.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">Comment Bait</h2>
            <div className="space-y-2">
              {activeTier.comment_bait.slice(0, 5).map((bait, i) => (
                <div key={i} className="flex items-center justify-between gap-3 bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                  <p className="text-base text-purple-300 flex-1">{bait}</p>
                  <CopyBtn text={bait} label="Copy" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Script */}
        {brief?.script_text && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-[var(--text)]">Full Script</h2>
              <CopyBtn text={brief.script_text} label="Copy All" />
            </div>
            <pre className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-base text-[var(--text-muted)] whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
              {brief.script_text}
            </pre>
          </section>
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--bg)] border-t border-[var(--border)] p-4 pb-safe z-50">
        <div className="max-w-lg mx-auto flex gap-3">
          {folderUrl ? (
            <a
              href={folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 flex-1 min-h-[48px] rounded-xl text-base font-medium bg-blue-600 text-white active:bg-blue-700"
            >
              <ExternalLink size={18} /> Drive Folder
            </a>
          ) : (
            <button
              onClick={handleCreateFolder}
              disabled={creatingFolder}
              className="flex items-center justify-center gap-2 flex-1 min-h-[48px] rounded-xl text-base font-medium bg-blue-600 text-white active:bg-blue-700 disabled:opacity-50"
            >
              {creatingFolder ? <Loader2 size={18} className="animate-spin" /> : <FolderPlus size={18} />}
              {creatingFolder ? 'Creating...' : 'Create Folder'}
            </button>
          )}
          <button
            onClick={handleMarkRecorded}
            disabled={confirming}
            className="flex items-center justify-center gap-2 flex-1 min-h-[48px] rounded-xl text-base font-semibold bg-green-600 text-white active:bg-green-700 disabled:opacity-50"
          >
            {confirming ? 'Updating...' : 'Mark Recorded'}
          </button>
        </div>
      </div>
    </div>
  );
}
