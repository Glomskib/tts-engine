'use client';

import { useState, useCallback } from 'react';
import { X, Copy, ExternalLink, CheckSquare, FileText, Palette, FolderPlus, Loader2 } from 'lucide-react';
import type { ContentItem, CowTier } from '@/lib/content-items/types';
import type { CreatorBriefData, PurpleCowTier } from '@/lib/briefs/creator-brief-types';
import { useToast } from '@/contexts/ToastContext';

interface RecordingKitModalProps {
  item: ContentItem;
  brief: CreatorBriefData | null;
  onClose: () => void;
  onMarkRecorded: () => void;
}

const TIER_LABELS: Record<CowTier, string> = {
  safe: 'Safe',
  edgy: 'Edgy',
  unhinged: 'Unhinged',
};

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
    >
      <Copy size={12} />
      {copied ? 'Copied!' : (label || 'Copy')}
    </button>
  );
}

export default function RecordingKitModal({ item, brief, onClose, onMarkRecorded }: RecordingKitModalProps) {
  const { showSuccess, showError } = useToast();
  const [selectedTier, setSelectedTier] = useState<CowTier>(
    (item.brief_selected_cow_tier as CowTier) || 'edgy'
  );
  const [confirming, setConfirming] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderUrl, setFolderUrl] = useState<string | null>(item.drive_folder_url);

  const activeTier = brief?.purple_cow?.tiers?.[selectedTier];

  const handleCreateFolder = useCallback(async () => {
    setCreatingFolder(true);
    try {
      const res = await fetch(`/api/content-items/${item.id}/drive-folder`, { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setFolderUrl(json.data.drive_folder_url);
        showSuccess('Upload folder created');
      } else {
        showError(json.error || 'Failed to create folder');
      }
    } catch {
      showError('Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  }, [item.id, showSuccess, showError]);

  const handleMarkRecorded = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/content-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'recorded' }),
      });
      const json = await res.json();
      if (json.ok) {
        showSuccess('Marked as recorded');
        onMarkRecorded();
        onClose();
      }
    } catch {
      // Error handled by caller
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold">Recording Kit</h2>
            <span className="text-xs font-mono text-gray-500">{item.short_id} — {item.title}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Script */}
          {brief?.script_text && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm flex items-center gap-1"><FileText size={14} /> Script</h3>
                <CopyBtn text={brief.script_text} label="Copy Script" />
              </div>
              <pre className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                {brief.script_text}
              </pre>
            </section>
          )}

          {/* Beforehand Checklist */}
          {brief?.beforehand_checklist?.length ? (
            <section>
              <h3 className="font-semibold text-sm flex items-center gap-1 mb-2"><CheckSquare size={14} /> Beforehand Checklist</h3>
              <ul className="space-y-1.5">
                {brief.beforehand_checklist.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 rounded" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Recording Notes */}
          {brief?.recording_notes?.length ? (
            <section>
              <h3 className="font-semibold text-sm mb-2">Recording Notes</h3>
              <ul className="list-disc pl-4 space-y-1 text-sm">
                {brief.recording_notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </section>
          ) : null}

          {/* Purple Cow — Tier Switcher */}
          {brief?.purple_cow?.tiers && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-sm flex items-center gap-1"><Palette size={14} /> Purple Cow</h3>
                <div className="flex gap-1 ml-auto">
                  {(['safe', 'edgy', 'unhinged'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setSelectedTier(t)}
                      className={`px-2 py-0.5 text-xs rounded-full font-medium transition ${
                        selectedTier === t
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              {activeTier && (
                <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg space-y-2 text-sm">
                  {activeTier.visual_interrupts?.length > 0 && (
                    <div><span className="font-medium text-gray-500 text-xs">Visual:</span> {activeTier.visual_interrupts.join(', ')}</div>
                  )}
                  {activeTier.audio_interrupts?.length > 0 && (
                    <div><span className="font-medium text-gray-500 text-xs">Audio:</span> {activeTier.audio_interrupts.join(', ')}</div>
                  )}
                  {activeTier.behavioral_interrupts?.length > 0 && (
                    <div><span className="font-medium text-gray-500 text-xs">Behavioral:</span> {activeTier.behavioral_interrupts.join(', ')}</div>
                  )}
                  {activeTier.comment_bait?.length > 0 && (
                    <div><span className="font-medium text-gray-500 text-xs">Comment Bait:</span> {activeTier.comment_bait.join(' | ')}</div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Quick Copy Section */}
          <section className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg space-y-2">
            <h3 className="font-semibold text-sm mb-1">Quick Copy</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Filename Token</span>
              <CopyBtn text={`[${item.short_id}]`} label={`[${item.short_id}]`} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Short ID</span>
              <CopyBtn text={item.short_id} label={item.short_id} />
            </div>
          </section>

          {/* Links */}
          <section className="flex gap-2 flex-wrap">
            {folderUrl ? (
              <a href={folderUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-100 transition">
                <ExternalLink size={12} /> Open Upload Folder
              </a>
            ) : (
              <button
                onClick={handleCreateFolder}
                disabled={creatingFolder}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-100 transition disabled:opacity-50"
              >
                {creatingFolder ? <Loader2 size={12} className="animate-spin" /> : <FolderPlus size={12} />}
                {creatingFolder ? 'Creating...' : 'Create Upload Folder'}
              </button>
            )}
            {item.brief_doc_url && (
              <a href={item.brief_doc_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded hover:bg-green-100 transition">
                <FileText size={12} /> Open Brief Doc
              </a>
            )}
          </section>
          {!folderUrl && (
            <p className="text-xs text-gray-400">
              Create a Google Drive folder to receive raw footage uploads for this content item.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleMarkRecorded}
            disabled={confirming}
            className="w-full px-4 py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            {confirming ? 'Updating...' : 'Mark Recorded'}
          </button>
        </div>
      </div>
    </div>
  );
}
