'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, ArrowUpDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, ageString } from '@/lib/marketplace/types';
import type { JobStatus } from '@/lib/marketplace/types';

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
}

export default function VaJobBoard() {
  const [jobs, setJobs] = useState<BoardJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'newest' | 'due_soon' | 'priority'>('newest');

  useEffect(() => { fetchJobs(); }, [sort]);

  async function fetchJobs() {
    setLoading(true);
    const res = await fetch(`/api/marketplace/jobs?sort=${sort}`);
    const data = await res.json();
    setJobs(data.jobs || []);
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Job Board</h1>
          {!loading && jobs.length > 0 && (
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

      {loading ? (
        <div className="text-zinc-500 text-sm py-12 text-center">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="text-zinc-500 text-sm py-12 text-center">No jobs available right now</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-white/10">
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Client</th>
                <th className="pb-3 pr-4 font-medium">Title</th>
                <th className="pb-3 pr-4 font-medium">Age</th>
                <th className="pb-3 pr-4 font-medium">Due</th>
                <th className="pb-3 pr-4 font-medium">Priority</th>
                <th className="pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-3 pr-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${JOB_STATUS_COLORS[job.job_status]}`}>
                      {JOB_STATUS_LABELS[job.job_status]}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-zinc-400 font-mono text-xs">{job.client_code}</td>
                  <td className="py-3 pr-4">
                    <Link href={`/va/jobs/${job.id}`} className="text-zinc-200 hover:text-white hover:underline">
                      {job.script_title}
                    </Link>
                    {job.script_notes && (
                      <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-xs">{job.script_notes}</p>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-zinc-500">{ageString(job.created_at)}</td>
                  <td className="py-3 pr-4">
                    {job.due_at ? (
                      <span className={`text-xs ${new Date(job.due_at) < new Date() ? 'text-red-400' : 'text-zinc-400'}`}>
                        {new Date(job.due_at).toLocaleDateString()} {new Date(job.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    {job.priority > 0 ? (
                      <span className="text-xs text-amber-400 font-medium">P{job.priority}</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="py-3">
                    <Link href={`/va/jobs/${job.id}`} className="text-zinc-500 hover:text-white">
                      <ChevronRight className="w-4 h-4" />
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
