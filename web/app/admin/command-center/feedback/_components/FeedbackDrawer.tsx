'use client';

import { useState, useRef } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import type { FeedbackItem, FeedbackStatus } from '@/lib/command-center/feedback-types';
import { STATUS_CONFIG, TYPE_CONFIG, PRIORITY_CONFIG, timeAgo } from './constants';

interface Props {
  item: FeedbackItem;
  onClose: () => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>;
}

const STATUSES: FeedbackStatus[] = ['new', 'triaged', 'in_progress', 'shipped', 'rejected'];
const PRIORITIES = [1, 2, 3, 4, 5];

export default function FeedbackDrawer({ item, onClose, onUpdate }: Props) {
  const [showRawJson, setShowRawJson] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  const typeConf = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-zinc-900 border-l border-zinc-700 z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-zinc-800">
          <span className="text-xl mt-0.5">{typeConf.icon}</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white">{item.title}</h2>
            <div className="flex items-center gap-3 mt-1">
              {item.reporter_email && (
                <span className="text-xs text-zinc-400">{item.reporter_email}</span>
              )}
              <span className="text-xs text-zinc-600">{timeAgo(item.created_at)}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Status pills */}
          <div className="p-5 space-y-4 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 w-16 shrink-0">Status</span>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => {
                  const conf = STATUS_CONFIG[s];
                  const isActive = item.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => onUpdate(item.id, { status: s })}
                      className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                        isActive
                          ? `${conf.bg} ${conf.color} ring-1 ring-current`
                          : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {conf.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Priority pills */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 w-16 shrink-0">Priority</span>
              <div className="flex flex-wrap gap-1.5">
                {PRIORITIES.map((p) => {
                  const conf = PRIORITY_CONFIG[p];
                  const isActive = item.priority === p;
                  return (
                    <button
                      key={p}
                      onClick={() => onUpdate(item.id, { priority: p })}
                      className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                        isActive
                          ? `${conf.color} bg-current/10 ring-1 ring-current`
                          : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      P{p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="p-5 space-y-3 border-b border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-zinc-500">Source</span>
                <p className="text-zinc-300">{item.source}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Type</span>
                <p className={typeConf.color}>{typeConf.label}</p>
              </div>
              {item.page && (
                <div>
                  <span className="text-xs text-zinc-500">Page</span>
                  <p className="text-zinc-300 truncate" title={item.page}>{item.page}</p>
                </div>
              )}
              {item.device && (
                <div>
                  <span className="text-xs text-zinc-500">Device</span>
                  <p className="text-zinc-300">{item.device}</p>
                </div>
              )}
            </div>
            {item.tags.length > 0 && (
              <div>
                <span className="text-xs text-zinc-500">Tags</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-400">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {item.description && (
            <div className="p-5 border-b border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Description</h3>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {/* Raw JSON */}
          {Object.keys(item.raw_json).length > 0 && (
            <div className="p-5">
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-300"
              >
                {showRawJson ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Raw JSON
              </button>
              {showRawJson && (
                <pre className="mt-2 p-3 bg-zinc-950 rounded-lg text-xs text-zinc-400 overflow-auto max-h-64">
                  {JSON.stringify(item.raw_json, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
