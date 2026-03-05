'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Copy, Check, ExternalLink, FolderPlus, Loader2, Sparkles, ArrowLeft, FileText, Save,
  Wand2, ChevronDown, ChevronUp, Scissors, Image as ImageIcon, Type, Hash, MessageCircle,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import type { ContentItem } from '@/lib/content-items/types';
import type { CreatorBriefData, BriefScene } from '@/lib/briefs/creator-brief-types';
import type { EditorNotesJSON } from '@/lib/content-items/editor-notes-schema';

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

function CollapsibleSection({
  title, icon, expanded, onToggle, children,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-3 min-h-[48px] text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          {icon} {title}
        </span>
        {expanded ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
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
  const [transcriptText, setTranscriptText] = useState('');
  const [rawDriveFileUrl, setRawDriveFileUrl] = useState('');
  const [transcriptSaved, setTranscriptSaved] = useState(false);
  const [savingTranscript, setSavingTranscript] = useState(false);

  // Editor Notes
  const [editorNotes, setEditorNotes] = useState<EditorNotesJSON | null>(null);
  const [editorNotesStatus, setEditorNotesStatus] = useState<string>('none');
  const [editorNotesError, setEditorNotesError] = useState<string | null>(null);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState<Record<string, boolean>>({
    summary: true, timeline: false, broll: false, caption: false, comments: false,
  });

  const fetchEditorNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/editor-notes`);
      const json = await res.json();
      if (json.ok) {
        setEditorNotesStatus(json.data.status || 'none');
        if (json.data.json) setEditorNotes(json.data.json);
        if (json.data.error) setEditorNotesError(json.data.error);
      }
    } catch { /* silent */ }
  }, [contentItemId]);

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
        if (itemJson.data.transcript_text) {
          setTranscriptText(itemJson.data.transcript_text);
          setTranscriptSaved(true);
        }
        if (itemJson.data.raw_footage_url) {
          setRawDriveFileUrl(itemJson.data.raw_footage_url);
        }
      }
      if (briefJson.ok && briefJson.data?.data) {
        setBrief(briefJson.data.data as CreatorBriefData);
      }
      await fetchEditorNotes();
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [contentItemId, fetchEditorNotes]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll for editor notes when pending/processing
  useEffect(() => {
    if (editorNotesStatus !== 'pending' && editorNotesStatus !== 'processing') return;
    const interval = setInterval(fetchEditorNotes, 4000);
    return () => clearInterval(interval);
  }, [editorNotesStatus, fetchEditorNotes]);

  const handleGenerateEditorNotes = async () => {
    setGeneratingNotes(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/editor-notes`, { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setEditorNotesStatus('pending');
        showToast({ message: 'Generating editor notes...', type: 'success' });
      } else {
        showToast({ message: json.error || 'Failed', type: 'error' });
      }
    } catch {
      showToast({ message: 'Network error', type: 'error' });
    } finally {
      setGeneratingNotes(false);
    }
  };

  const toggleSection = (key: string) => {
    setNotesExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

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
      const res = await fetch(`/api/content-items/${contentItemId}/drive/ensure`, { method: 'POST' });
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

        {/* Transcript */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text)] mb-2 flex items-center gap-2">
            <FileText size={20} className="text-violet-400" /> Transcript
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-1">
                Paste transcript {transcriptSaved && <span className="text-emerald-400 ml-2">Saved</span>}
              </label>
              <textarea
                value={transcriptText}
                onChange={(e) => { setTranscriptText(e.target.value); setTranscriptSaved(false); }}
                placeholder="Paste the full transcript of your recorded video here..."
                rows={6}
                className="w-full min-h-[120px] px-4 py-3 rounded-xl text-base bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)] resize-y"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-1">Raw footage Drive link (optional)</label>
              <input
                type="url"
                value={rawDriveFileUrl}
                onChange={(e) => setRawDriveFileUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)]"
              />
            </div>
            <button
              onClick={async () => {
                if (!transcriptText.trim()) {
                  showToast({ message: 'Enter transcript text first', type: 'error' });
                  return;
                }
                setSavingTranscript(true);
                try {
                  // Extract Drive file ID from URL if present
                  let rawFileId: string | undefined;
                  if (rawDriveFileUrl) {
                    const match = rawDriveFileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match) rawFileId = match[1];
                  }
                  const res = await fetch(`/api/content-items/${contentItemId}/transcript`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      transcript_text: transcriptText.trim(),
                      source: 'manual',
                      raw_drive_file_id: rawFileId,
                    }),
                  });
                  const json = await res.json();
                  if (json.ok) {
                    setTranscriptSaved(true);
                    showToast({ message: 'Transcript saved!', type: 'success' });
                  } else {
                    showToast({ message: json.error || 'Failed to save', type: 'error' });
                  }
                } catch {
                  showToast({ message: 'Network error', type: 'error' });
                } finally {
                  setSavingTranscript(false);
                }
              }}
              disabled={savingTranscript || !transcriptText.trim()}
              className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium transition-colors bg-violet-600 text-white active:bg-violet-700 disabled:opacity-50"
            >
              {savingTranscript ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Save size={18} /> Save Transcript</>}
            </button>
          </div>
        </section>

        {/* AI Edit Recommendations */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text)] mb-2 flex items-center gap-2">
            <Wand2 size={20} className="text-teal-400" /> AI Edit Recommendations
          </h2>

          {editorNotesStatus === 'none' && !editorNotes && (
            <div className="bg-zinc-900/50 border border-[var(--border)] rounded-xl p-5 text-center space-y-3">
              <p className="text-sm text-[var(--text-muted)]">
                {transcriptSaved
                  ? 'Generate AI-powered editing recommendations from your transcript.'
                  : 'Save a transcript first, then generate edit recommendations.'}
              </p>
              <button
                onClick={handleGenerateEditorNotes}
                disabled={generatingNotes || !transcriptSaved}
                className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-semibold bg-teal-600 text-white active:bg-teal-700 disabled:opacity-50"
              >
                {generatingNotes ? <><Loader2 size={18} className="animate-spin" /> Queuing...</> : <><Wand2 size={18} /> Generate Edit Notes</>}
              </button>
            </div>
          )}

          {(editorNotesStatus === 'pending' || editorNotesStatus === 'processing') && (
            <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-5 text-center space-y-2">
              <Loader2 size={24} className="animate-spin text-teal-400 mx-auto" />
              <p className="text-sm text-teal-300 font-medium">Analyzing your transcript...</p>
              <p className="text-xs text-zinc-500">This usually takes 15-30 seconds</p>
            </div>
          )}

          {editorNotesStatus === 'failed' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 space-y-3">
              <p className="text-sm text-red-300">{editorNotesError || 'Generation failed'}</p>
              <button
                onClick={handleGenerateEditorNotes}
                disabled={generatingNotes}
                className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium bg-red-500/20 text-red-300 border border-red-500/30 active:bg-red-500/30 disabled:opacity-50"
              >
                <Wand2 size={18} /> Retry
              </button>
            </div>
          )}

          {editorNotes && editorNotesStatus === 'completed' && (
            <div className="space-y-3">
              {/* Regenerate */}
              <button
                onClick={handleGenerateEditorNotes}
                disabled={generatingNotes}
                className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 border border-[var(--border)] active:bg-zinc-700 disabled:opacity-50"
              >
                <Wand2 size={16} /> Regenerate Notes
              </button>

              {/* Summary */}
              {editorNotes.summary && (
                <CollapsibleSection
                  title="Summary"
                  icon={<FileText size={16} className="text-teal-400" />}
                  expanded={notesExpanded.summary}
                  onToggle={() => toggleSection('summary')}
                >
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed">{editorNotes.summary}</p>
                  {editorNotes.editing_style && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded-md text-xs bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        Pace: {editorNotes.editing_style.pace}
                      </span>
                    </div>
                  )}
                </CollapsibleSection>
              )}

              {/* Timeline / Cuts */}
              {editorNotes.timeline && editorNotes.timeline.length > 0 && (
                <CollapsibleSection
                  title={`Cuts & Timeline (${editorNotes.timeline.length})`}
                  icon={<Scissors size={16} className="text-amber-400" />}
                  expanded={notesExpanded.timeline}
                  onToggle={() => toggleSection('timeline')}
                >
                  <div className="space-y-2">
                    {editorNotes.timeline.map((seg, i) => {
                      const labelColors: Record<string, string> = {
                        keep: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                        cut: 'bg-red-500/10 text-red-400 border-red-500/20',
                        tighten: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                        broll: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                        text: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
                        retake: 'bg-red-500/10 text-red-400 border-red-500/20',
                      };
                      return (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                          <span className="text-xs font-mono text-zinc-500 pt-0.5 whitespace-nowrap">
                            {Math.floor(seg.start_sec / 60)}:{String(Math.floor(seg.start_sec % 60)).padStart(2, '0')}
                          </span>
                          <div className="flex-1 min-w-0 space-y-1">
                            <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${labelColors[seg.label] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'}`}>
                              {seg.label}
                            </span>
                            <p className="text-sm text-[var(--text-muted)]">{seg.note}</p>
                            {seg.on_screen_text && (
                              <p className="text-xs text-violet-400 flex items-center gap-1">
                                <Type size={12} /> {seg.on_screen_text}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleSection>
              )}

              {/* B-roll Pack */}
              {editorNotes.broll_pack && editorNotes.broll_pack.length > 0 && (
                <CollapsibleSection
                  title={`B-Roll Ideas (${editorNotes.broll_pack.length})`}
                  icon={<ImageIcon size={16} className="text-blue-400" />}
                  expanded={notesExpanded.broll}
                  onToggle={() => toggleSection('broll')}
                >
                  <div className="space-y-2">
                    {editorNotes.broll_pack.map((b, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                        <span className="text-xs font-mono text-zinc-500 pt-0.5">
                          {Math.floor(b.at_sec / 60)}:{String(Math.floor(b.at_sec % 60)).padStart(2, '0')}
                        </span>
                        <div className="flex-1">
                          <span className="text-[10px] font-medium uppercase text-blue-400">{b.type}</span>
                          <p className="text-sm text-[var(--text-muted)]">{b.prompt}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              )}

              {/* Caption Pack */}
              {editorNotes.caption && (
                <CollapsibleSection
                  title="Caption & Hashtags"
                  icon={<Hash size={16} className="text-emerald-400" />}
                  expanded={notesExpanded.caption}
                  onToggle={() => toggleSection('caption')}
                >
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-[var(--text)] flex-1">{editorNotes.caption.primary}</p>
                        <CopyBtn text={editorNotes.caption.primary} label="Copy" />
                      </div>
                      {editorNotes.caption.alt && (
                        <div className="flex items-start justify-between gap-2 opacity-70">
                          <p className="text-sm text-[var(--text-muted)] flex-1 italic">{editorNotes.caption.alt}</p>
                          <CopyBtn text={editorNotes.caption.alt} label="Copy" />
                        </div>
                      )}
                    </div>
                    {editorNotes.hashtags && (
                      <div className="flex flex-wrap gap-1.5">
                        {editorNotes.hashtags.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </CollapsibleSection>
              )}

              {/* Comment Bait */}
              {editorNotes.comment_bait && (
                <CollapsibleSection
                  title="Comment Bait"
                  icon={<MessageCircle size={16} className="text-purple-400" />}
                  expanded={notesExpanded.comments}
                  onToggle={() => toggleSection('comments')}
                >
                  <div className="space-y-3">
                    {(['safe', 'spicy', 'chaotic'] as const).map(tier => {
                      const items = editorNotes.comment_bait?.[tier];
                      if (!items?.length) return null;
                      const tierColors = {
                        safe: 'text-emerald-400',
                        spicy: 'text-amber-400',
                        chaotic: 'text-red-400',
                      };
                      return (
                        <div key={tier}>
                          <p className={`text-xs font-bold uppercase tracking-wider mb-1.5 ${tierColors[tier]}`}>{tier}</p>
                          <div className="space-y-1.5">
                            {items.map((bait, i) => (
                              <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-800/50">
                                <p className="text-sm text-[var(--text-muted)] flex-1">{bait}</p>
                                <CopyBtn text={bait} />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          )}
        </section>
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
