'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, Check, Minus, Film, Inbox } from 'lucide-react';
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, ageString } from '@/lib/marketplace/types';
import type { JobStatus } from '@/lib/marketplace/types';

type StatusTab = 'all' | 'queued' | 'mine';

interface BoardJob {
  id: string;
  script_id: string;
  client_id: string;
  job_status: JobStatus;
  priority: number;
  claimed_by: string | null;
  due_at: string | null;
  created_at: string;
  client_code: string;
  script_title: string;
  script_notes: string;
  has_raw_footage: boolean;
  has_broll_pack: boolean;
  revision_count: number;
}

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'queued', label: 'Queued' },
  { key: 'mine', label: 'My Jobs' },
];

function dueHighlight(dueAt: string | null): string {
  if (!dueAt) return '';
  const diff = new Date(dueAt).getTime() - Date.now();
  const hours = diff / 3_600_000;
  if (hours < 0) return 'bg-red-900/10';
  if (hours < 6) return 'bg-amber-900/10';
  return '';
}

function dueLabel(dueAt: string | null): { text: string; color: string } | null {
  if (!dueAt) return null;
  const diff = new Date(dueAt).getTime() - Date.now();
  const absHours = Math.abs(Math.round(diff / 3_600_000));
  if (diff < 0) return { text: `${absHours}h overdue`, color: 'text-red-400' };
  if (absHours < 6) return { text: `${absHours}h left`, color: 'text-amber-400' };
  if (absHours < 24) return { text: `${absHours}h`, color: 'text-zinc-400' };
  return { text: `${Math.floor(absHours / 24)}d`, color: 'text-zinc-500' };
}

function nextActionLabel(job: BoardJob): string | null {
  switch (job.job_status) {
    case 'queued': return 'Claim';
    case 'claimed': return 'Start';
    case 'in_progress': return 'Submit';
    case 'changes_requested': return 'Revise';
    default: return null;
  }
}

export default function VaJobBoard() {
  const [jobs, setJobs] = useState<BoardJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'newest' | 'due_soon' | 'priority'>('newest');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchJobs = useCallback(async (searchTerm?: string) => {
    setLoading(true);
    const params = new URLSearchParams({ sort, status: statusTab });
    if (searchTerm) params.set('search', searchTerm);
    const res = await fetch(`/api/marketplace/jobs?${params}`);
    const data = await res.json();
    setJobs(data.jobs || []);
    setLoading(false);
  }, [sort, statusTab]);

  useEffect(() => { fetchJobs(search); }, [sort, statusTab, fetchJobs, search]);

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchJobs(value), 300);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Job Board</h1>
          {!loading && (
            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/10 text-zinc-300">
              {jobs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Sort:</span>
          {(['newest', 'due_soon', 'priority'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                sort === s ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {s === 'newest' ? 'Newest' : s === 'due_soon' ? 'Due Soon' : 'Priority'}
            </button>
          ))}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3 mb-6">
        {/* Status tabs */}
        <div className="flex bg-zinc-800/50 rounded-lg p-0.5">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusTab(tab.key)}
              className={`text-xs px-4 py-1.5 rounded-md transition-colors ${
                statusTab === tab.key
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search titles..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full bg-zinc-800/50 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-zinc-500 text-sm py-12 text-center">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
          <Inbox className="w-10 h-10 mb-3 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400">
            {statusTab === 'mine' ? "You don't have any active jobs" : search ? 'No jobs match your search' : "You're all caught up"}
          </p>
          <p className="text-xs mt-1">
            {statusTab === 'mine' ? 'Claim a job from the Queued tab to get started' : 'Check back soon for new jobs'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-white/10">
                <th className="pb-3 pr-3 font-medium">Status</th>
                <th className="pb-3 pr-3 font-medium">Client</th>
                <th className="pb-3 pr-3 font-medium">Title</th>
                <th className="pb-3 pr-3 font-medium text-center" title="Raw footage">
                  <Film className="w-3.5 h-3.5 inline" />
                </th>
                <th className="pb-3 pr-3 font-medium text-center" title="B-roll pack">B-roll</th>
                <th className="pb-3 pr-3 font-medium text-center" title="Revision count">Rev</th>
                <th className="pb-3 pr-3 font-medium">Due</th>
                <th className="pb-3 pr-3 font-medium">Priority</th>
                <th className="pb-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const due = dueLabel(job.due_at);
                const action = nextActionLabel(job);
                return (
                  <tr key={job.id} className={`border-b border-white/5 hover:bg-white/[0.02] ${dueHighlight(job.due_at)}`}>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${JOB_STATUS_COLORS[job.job_status]}`}>
                        {JOB_STATUS_LABELS[job.job_status]}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-zinc-400 font-mono text-xs">{job.client_code}</td>
                    <td className="py-3 pr-3">
                      <Link href={`/va/jobs/${job.id}`} className="text-zinc-200 hover:text-white hover:underline">
                        {job.script_title}
                      </Link>
                      {job.script_notes && (
                        <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-xs">{job.script_notes}</p>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-center">
                      {job.has_raw_footage
                        ? <Check className="w-3.5 h-3.5 text-green-400 inline" />
                        : <Minus className="w-3.5 h-3.5 text-zinc-600 inline" />}
                    </td>
                    <td className="py-3 pr-3 text-center">
                      {job.has_broll_pack
                        ? <Check className="w-3.5 h-3.5 text-purple-400 inline" />
                        : <Minus className="w-3.5 h-3.5 text-zinc-600 inline" />}
                    </td>
                    <td className="py-3 pr-3 text-center text-xs text-zinc-400">
                      {job.revision_count > 0 ? job.revision_count : '—'}
                    </td>
                    <td className="py-3 pr-3">
                      {due ? (
                        <span className={`text-xs ${due.color}`}>{due.text}</span>
                      ) : '—'}
                    </td>
                    <td className="py-3 pr-3">
                      {job.priority > 0 ? (
                        <span className="text-xs text-amber-400 font-medium">P{job.priority}</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      {action ? (
                        <Link
                          href={`/va/jobs/${job.id}`}
                          className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-teal-900/30 text-teal-300 hover:bg-teal-900/50 transition-colors"
                        >
                          {action} <ChevronRight className="w-3 h-3" />
                        </Link>
                      ) : (
                        <Link href={`/va/jobs/${job.id}`} className="text-zinc-500 hover:text-white">
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
