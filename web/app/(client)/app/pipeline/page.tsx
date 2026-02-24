'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { PipelineRow } from '@/lib/marketplace/types';
import { SCRIPT_STATUS_LABELS, SCRIPT_STATUS_COLORS, ageString } from '@/lib/marketplace/types';

export default function PipelinePage() {
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/marketplace/scripts');
      const data = await res.json();
      setRows(data.scripts || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await fetch('/api/marketplace/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      setNewTitle('');
      setShowNew(false);
      await fetchRows();
    } finally {
      setCreating(false);
    }
  }

  async function handleAction(row: PipelineRow) {
    const apiActions: Record<string, string> = {
      'Mark Recorded': 'mark_recorded',
      'Queue for Edit': 'queue_for_edit',
      'Mark Posted': 'mark_posted',
    };
    const navActions = ['Edit Script', 'Review', 'Unblock', 'Retry'];

    if (navActions.includes(row.next_action)) {
      window.location.href = `/app/script/${row.id}`;
      return;
    }

    const action = apiActions[row.next_action];
    if (!action) return;

    setActioningId(row.id);
    try {
      const res = await fetch(`/api/marketplace/scripts/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Action failed');
      }
      await fetchRows();
    } finally {
      setActioningId(null);
    }
  }

  const passiveStates = ['Done', 'Awaiting Editor', 'Editing...', 'Awaiting Revision', 'Archived'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <Button onClick={() => setShowNew(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" /> New Script
        </Button>
      </div>

      {showNew && (
        <Card className="mb-6">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Script title..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
              autoFocus
            />
            <Button onClick={handleCreate} loading={creating} size="sm">Create</Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowNew(false); setNewTitle(''); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="text-zinc-500 text-sm py-12 text-center">Loading pipeline...</div>
      ) : rows.length === 0 ? (
        <div className="text-zinc-500 text-sm py-12 text-center">No scripts yet. Create one to get started.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-white/10">
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Title</th>
                <th className="pb-3 pr-4 font-medium">Age</th>
                <th className="pb-3 pr-4 font-medium">Footage</th>
                <th className="pb-3 pr-4 font-medium">Deliverable</th>
                <th className="pb-3 pr-4 font-medium">Editor</th>
                <th className="pb-3 pr-4 font-medium">Next Action</th>
                <th className="pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-3 pr-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SCRIPT_STATUS_COLORS[row.status]}`}>
                      {SCRIPT_STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <Link href={`/app/script/${row.id}`} className="text-zinc-200 hover:text-white hover:underline">
                      {row.title}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-zinc-500">{ageString(row.created_at)}</td>
                  <td className="py-3 pr-4">
                    {row.has_raw_footage ? <Check className="w-4 h-4 text-green-400" /> : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="py-3 pr-4">
                    {row.has_deliverable ? <Check className="w-4 h-4 text-green-400" /> : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="py-3 pr-4 text-zinc-500">
                    {row.assigned_editor ? <span className="text-xs text-zinc-400">Assigned</span> : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    {passiveStates.includes(row.next_action) ? (
                      <span className="text-xs text-zinc-500">{row.next_action}</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAction(row)}
                        loading={actioningId === row.id}
                      >
                        {row.next_action}
                      </Button>
                    )}
                  </td>
                  <td className="py-3">
                    <Link href={`/app/script/${row.id}`} className="text-zinc-500 hover:text-white">
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
