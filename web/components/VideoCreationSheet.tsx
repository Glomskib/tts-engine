'use client';

import { useState } from 'react';
import { X, FileText, Link as LinkIcon, Send, AlertCircle } from 'lucide-react';

interface Script {
  id: string;
  title: string;
  content: string;
  hook?: string;
  cta?: string;
}

interface VideoCreationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  script: Script | null;
  onSuccess?: () => void;
}

export function VideoCreationSheet({ isOpen, onClose, script, onSuccess }: VideoCreationSheetProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    driveLink: '',
    notes: '',
    priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent',
  });

  if (!isOpen || !script) return null;

  const handleSubmit = async () => {
    if (!form.driveLink) {
      setError('Please provide a Google Drive link');
      return;
    }

    if (!form.driveLink.includes('drive.google.com')) {
      setError('Please provide a valid Google Drive link');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/video-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: script.title,
          description: form.notes,
          source_drive_link: form.driveLink,
          script_id: script.id,
          content_type: 'scripted',
          priority: form.priority === 'urgent' ? 3 : form.priority === 'high' ? 2 : form.priority === 'normal' ? 1 : 0,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit');
      }

      onClose();
      onSuccess?.();
      setForm({ driveLink: '', notes: '', priority: 'normal' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1.5 rounded-full bg-zinc-600" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">Create Video</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Script Preview */}
          <div className="bg-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-teal-400" />
              <h3 className="font-medium text-white">{script.title}</h3>
            </div>
            {script.hook && (
              <p className="text-sm text-teal-400 mb-2">{script.hook}</p>
            )}
            <p className="text-sm text-zinc-300 whitespace-pre-wrap max-h-32 overflow-y-auto">
              {script.content}
            </p>
            {script.cta && (
              <p className="text-sm text-amber-400 mt-2">{script.cta}</p>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-amber-400 mb-1">Recording Tips</h4>
                <ul className="text-sm text-zinc-300 space-y-1">
                  <li>• Record vertical (9:16)</li>
                  <li>• Good lighting & clear audio</li>
                  <li>• Follow script naturally</li>
                  <li>• Upload raw footage to Google Drive</li>
                </ul>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Google Drive Link */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              <LinkIcon className="w-4 h-4 inline mr-2" />
              Google Drive Link *
            </label>
            <input
              type="url"
              value={form.driveLink}
              onChange={(e) => setForm({ ...form, driveLink: e.target.value })}
              placeholder="https://drive.google.com/..."
              className="w-full h-12 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:border-teal-500 focus:outline-none"
            />
            <p className="text-xs text-zinc-500 mt-1">Share folder with edit access so we can upload finished video</p>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Priority</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 'low', label: 'Low' },
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setForm({ ...form, priority: p.value as 'low' | 'normal' | 'high' | 'urgent' })}
                  className={`p-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.priority === p.value
                      ? p.value === 'urgent' ? 'border-red-500 bg-red-500/10 text-red-400'
                      : p.value === 'high' ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                      : 'border-teal-500 bg-teal-500/10 text-teal-400'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Additional Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Editing style, music preferences, text overlays..."
              rows={3}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 resize-none focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800 pb-[max(16px,env(safe-area-inset-bottom))]">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full h-12 bg-teal-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-teal-700 transition-colors"
          >
            {submitting ? 'Submitting...' : (
              <>
                <Send className="w-5 h-5" />
                Submit to Editor Pipeline
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
