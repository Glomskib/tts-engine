'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Send, Clock, DollarSign, User, Building } from 'lucide-react';
import { formatDealValue, timeAgo } from './constants';
import type { DealWithContact, PipelineStage } from './constants';
import type { CrmActivity } from '@/lib/command-center/crm-types';

interface Props {
  deal: DealWithContact;
  stages: PipelineStage[];
  onClose: () => void;
  onUpdate: (dealId: string, updates: Record<string, unknown>) => Promise<void>;
}

export default function DealDrawer({ deal, stages, onClose, onUpdate }: Props) {
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(deal.title);
  const titleRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const fetchActivities = useCallback(async () => {
    const res = await fetch(`/api/admin/crm/activities?deal_id=${deal.id}`);
    if (res.ok) {
      const json = await res.json();
      setActivities(json.data || []);
    }
  }, [deal.id]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);
  useEffect(() => { setTitleDraft(deal.title); }, [deal.title]);
  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, [editingTitle]);

  async function handleTitleSave() {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== deal.title) {
      await onUpdate(deal.id, { title: trimmed });
    } else {
      setTitleDraft(deal.title);
    }
  }

  async function handleStageChange(stageKey: string) {
    if (stageKey === deal.stage_key) return;
    await onUpdate(deal.id, { stage_key: stageKey });
    fetchActivities();
  }

  async function handleAddNote() {
    if (!note.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/admin/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal_id: deal.id,
          contact_id: deal.contact_id,
          activity_type: 'note',
          subject: 'Note',
          body: note.trim(),
          actor: 'admin',
        }),
      });
      setNote('');
      fetchActivities();
    } finally {
      setSubmitting(false);
    }
  }

  const activityIcons: Record<string, string> = {
    email_in: '📨',
    email_out: '📤',
    call: '📞',
    note: '📝',
    stage_change: '🔀',
    meeting: '🤝',
    task: '✅',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full sm:max-w-[480px] bg-zinc-900 border-l border-zinc-700 z-50 flex flex-col animate-in slide-in-from-right duration-200">
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
                  if (e.key === 'Escape') { setTitleDraft(deal.title); setEditingTitle(false); }
                }}
                className="w-full text-lg font-semibold text-white bg-zinc-800 border border-zinc-600 rounded px-2 py-1"
              />
            ) : (
              <h2
                className="text-lg font-semibold text-white truncate cursor-pointer hover:text-zinc-300"
                onClick={() => setEditingTitle(true)}
                title="Click to edit"
              >
                {deal.title}
              </h2>
            )}
            <div className="flex items-center gap-3 mt-2">
              {deal.value_cents > 0 && (
                <span className="flex items-center gap-1 text-sm text-emerald-400">
                  <DollarSign className="w-3.5 h-3.5" />
                  {formatDealValue(deal.value_cents)}
                </span>
              )}
              <span className="text-xs text-zinc-500">{deal.probability}% probability</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Stage selector */}
          <div className="p-5 space-y-4 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 w-16 shrink-0">Stage</span>
              <div className="flex flex-wrap gap-1.5">
                {stages.map((stage) => (
                  <button
                    key={stage.key}
                    onClick={() => handleStageChange(stage.key)}
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                      deal.stage_key === stage.key
                        ? 'ring-1 ring-current'
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                    style={deal.stage_key === stage.key ? {
                      backgroundColor: `${stage.color}20`,
                      color: stage.color,
                    } : undefined}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>
            </div>

            {deal.crm_contacts && (
              <>
                <div className="flex items-center gap-3">
                  <User className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-xs text-zinc-500 w-12 shrink-0">Contact</span>
                  <span className="text-sm text-zinc-300">{deal.crm_contacts.name}</span>
                </div>
                {deal.crm_contacts.company && (
                  <div className="flex items-center gap-3">
                    <Building className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-xs text-zinc-500 w-12 shrink-0">Company</span>
                    <span className="text-sm text-zinc-300">{deal.crm_contacts.company}</span>
                  </div>
                )}
              </>
            )}

            {deal.notes && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-zinc-500 w-16 shrink-0 pt-0.5">Notes</span>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{deal.notes}</p>
              </div>
            )}
          </div>

          {/* Activity timeline */}
          <div className="p-5">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Activity</h3>
            <div className="space-y-3">
              {activities.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs">{activityIcons[a.activity_type] || '•'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-400">{a.actor}</span>
                      <span className="text-xs text-zinc-600">{timeAgo(a.ts)}</span>
                    </div>
                    {a.subject && (
                      <p className="text-sm text-zinc-300 mt-0.5">{a.subject}</p>
                    )}
                    {a.body && a.activity_type !== 'stage_change' && (
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-3">{a.body}</p>
                    )}
                  </div>
                </div>
              ))}
              {activities.length === 0 && (
                <p className="text-sm text-zinc-500">No activity yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Add note */}
        <div className="border-t border-zinc-800 p-4">
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}
              placeholder="Add a note..."
              className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600"
            />
            <button
              onClick={handleAddNote}
              disabled={!note.trim() || submitting}
              className="px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
