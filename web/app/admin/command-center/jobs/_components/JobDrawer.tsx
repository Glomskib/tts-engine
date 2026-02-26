'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Clock, ExternalLink } from 'lucide-react';
import type { CcJob, CcJobEvent, JobStatus } from '@/lib/command-center/types';

const JOB_STATUSES: { value: JobStatus; label: string; color: string }[] = [
  { value: 'lead', label: 'Lead', color: 'bg-zinc-500/20 text-zinc-400' },
  { value: 'applied', label: 'Applied', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'interviewing', label: 'Interviewing', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'hired', label: 'Hired', color: 'bg-teal-500/20 text-teal-400' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'delivered', label: 'Delivered', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'closed', label: 'Closed', color: 'bg-zinc-500/20 text-zinc-500' },
];

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  job: CcJob;
  onClose: () => void;
  onUpdate: (jobId: string, updates: Record<string, unknown>) => Promise<void>;
}

export default function JobDrawer({ job, onClose, onUpdate }: Props) {
  const [events, setEvents] = useState<CcJobEvent[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(job.title);
  const [notesDraft, setNotesDraft] = useState(job.notes);
  const [notesSaving, setNotesSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const notesTimeout = useRef<NodeJS.Timeout | null>(null);

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/admin/cc-jobs/${job.id}`);
    if (res.ok) {
      const json = await res.json();
      setEvents(json.data.events || []);
    }
  }, [job.id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);
  useEffect(() => { setTitleDraft(job.title); }, [job.title]);
  useEffect(() => { setNotesDraft(job.notes); }, [job.notes]);

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, [editingTitle]);

  async function handleTitleSave() {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== job.title) {
      await onUpdate(job.id, { title: trimmed });
    } else {
      setTitleDraft(job.title);
    }
  }

  async function handleStatusChange(status: JobStatus) {
    await onUpdate(job.id, { status });
    fetchDetail();
  }

  function handleNotesChange(value: string) {
    setNotesDraft(value);
    if (notesTimeout.current) clearTimeout(notesTimeout.current);
    notesTimeout.current = setTimeout(async () => {
      setNotesSaving(true);
      await onUpdate(job.id, { notes: value });
      setNotesSaving(false);
    }, 800);
  }

  const statusInfo = JOB_STATUSES.find((s) => s.value === job.status);

  return (
    <>
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      />

      <div className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-zinc-900 border-l border-zinc-700 z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-zinc-800">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                ref={titleRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') { setTitleDraft(job.title); setEditingTitle(false); }
                }}
                className="w-full text-lg font-semibold text-white bg-zinc-800 border border-zinc-600 rounded px-2 py-1"
              />
            ) : (
              <h2
                className="text-lg font-semibold text-white truncate cursor-pointer hover:text-zinc-300"
                onClick={() => setEditingTitle(true)}
                title="Click to edit"
              >
                {job.title}
              </h2>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo?.color || 'bg-zinc-700 text-zinc-400'}`}>
                {statusInfo?.label || job.status}
              </span>
              <span className="text-xs text-zinc-500">{job.platform}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4 border-b border-zinc-800">
            {/* Status selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 w-20 shrink-0">Status</span>
              <div className="flex flex-wrap gap-1.5">
                {JOB_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => handleStatusChange(s.value)}
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                      job.status === s.value
                        ? `${s.color} ring-1 ring-current`
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Source URL */}
            {job.source_url && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 w-20 shrink-0">Source</span>
                <a
                  href={job.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-teal-400 hover:text-teal-300 truncate flex items-center gap-1"
                >
                  {new URL(job.source_url).hostname}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Rate / Budget */}
            {(job.hourly_rate !== null || job.budget !== null) && (
              <div className="flex items-center gap-6">
                {job.hourly_rate !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500 w-20 shrink-0">Rate</span>
                    <span className="text-sm text-zinc-300">${job.hourly_rate}/hr</span>
                  </div>
                )}
                {job.budget !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">Budget</span>
                    <span className="text-sm text-zinc-300">${job.budget}</span>
                  </div>
                )}
              </div>
            )}

            {/* Contact */}
            {job.contact && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 w-20 shrink-0">Contact</span>
                <span className="text-sm text-zinc-300">{job.contact}</span>
              </div>
            )}

            {/* Notes */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-zinc-500">Notes</span>
                {notesSaving && <span className="text-[10px] text-zinc-600">Saving...</span>}
              </div>
              <textarea
                value={notesDraft}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Add notes..."
                rows={4}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600 resize-y"
              />
            </div>
          </div>

          {/* Timeline */}
          <div className="p-5">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Timeline</h3>
            <div className="space-y-3">
              {events.map((e) => (
                <div key={e.id} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="w-3 h-3 text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-600">{timeAgo(e.ts)}</span>
                    </div>
                    {e.event_type === 'status_change' ? (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Status: {e.from_status} → <span className="text-zinc-300">{e.to_status}</span>
                      </p>
                    ) : e.event_type === 'created' ? (
                      <p className="text-xs text-zinc-500 mt-0.5">Job created</p>
                    ) : (
                      <p className="text-xs text-zinc-500 mt-0.5">{e.event_type}</p>
                    )}
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <p className="text-sm text-zinc-500">No events yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
