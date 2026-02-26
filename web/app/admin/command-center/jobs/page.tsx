'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, ExternalLink, Briefcase } from 'lucide-react';
import CommandCenterShell from '../_components/CommandCenterShell';
import { CCPageHeader } from '../_components/ui';
import { CCTable, CCThead, CCTh, CCTbody, CCTr, CCTd } from '../_components/ui/CCTable';
import CCEmptyState from '../_components/ui/CCEmptyState';
import JobDrawer from './_components/JobDrawer';
import type { CcJob, JobStatus, JobPlatform } from '@/lib/command-center/types';

const STATUS_OPTIONS: { value: JobStatus; label: string; color: string }[] = [
  { value: 'lead', label: 'Lead', color: 'bg-zinc-500/20 text-zinc-400' },
  { value: 'applied', label: 'Applied', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'interviewing', label: 'Interviewing', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'hired', label: 'Hired', color: 'bg-teal-500/20 text-teal-400' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'delivered', label: 'Delivered', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'closed', label: 'Closed', color: 'bg-zinc-500/20 text-zinc-500' },
];

const PLATFORM_OPTIONS: { value: JobPlatform; label: string }[] = [
  { value: 'upwork', label: 'Upwork' },
  { value: 'fiverr', label: 'Fiverr' },
  { value: 'direct', label: 'Direct' },
  { value: 'other', label: 'Other' },
];

function getStatusInfo(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function JobTrackerPage() {
  const [jobs, setJobs] = useState<CcJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<CcJob | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const [newJob, setNewJob] = useState({
    title: '',
    source_url: '',
    platform: 'upwork' as JobPlatform,
    hourly_rate: '',
    budget: '',
    contact: '',
    notes: '',
  });

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (platformFilter) params.set('platform', platformFilter);
    try {
      const res = await fetch(`/api/admin/cc-jobs?${params}`);
      if (res.ok) {
        const json = await res.json();
        setJobs(json.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, platformFilter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  async function createJob() {
    if (!newJob.title.trim()) return;
    const payload: Record<string, unknown> = {
      title: newJob.title,
      platform: newJob.platform,
      notes: newJob.notes,
    };
    if (newJob.source_url) payload.source_url = newJob.source_url;
    if (newJob.hourly_rate) payload.hourly_rate = parseFloat(newJob.hourly_rate);
    if (newJob.budget) payload.budget = parseFloat(newJob.budget);
    if (newJob.contact) payload.contact = newJob.contact;

    await fetch('/api/admin/cc-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setNewJob({ title: '', source_url: '', platform: 'upwork', hourly_rate: '', budget: '', contact: '', notes: '' });
    setShowAddForm(false);
    await fetchJobs();
  }

  async function handleUpdateJob(jobId: string, updates: Record<string, unknown>) {
    await fetch(`/api/admin/cc-jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await fetchJobs();
    if (selectedJob?.id === jobId) {
      setSelectedJob((prev) => prev ? { ...prev, ...updates } as CcJob : null);
    }
  }

  async function handleInlineStatusChange(jobId: string, status: string) {
    await handleUpdateJob(jobId, { status });
  }

  return (
    <CommandCenterShell>
      <CCPageHeader
        title="Jobs"
        subtitle="Freelance job tracker and pipeline"
        loading={loading}
        onRefresh={fetchJobs}
        actions={
          <>
            {/* Filters */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All platforms</option>
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Job
            </button>
          </>
        }
      />

      {/* Inline creation form */}
      {showAddForm && (
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Job title *"
              value={newJob.title}
              onChange={(e) => setNewJob({ ...newJob, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') createJob(); }}
              autoFocus
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2.5 text-sm col-span-2"
            />
            <input
              placeholder="Source URL (e.g. Upwork link)"
              value={newJob.source_url}
              onChange={(e) => setNewJob({ ...newJob, source_url: e.target.value })}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2.5 text-sm"
            />
            <select
              value={newJob.platform}
              onChange={(e) => setNewJob({ ...newJob, platform: e.target.value as JobPlatform })}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2.5 text-sm"
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <input
              placeholder="Hourly rate"
              type="number"
              value={newJob.hourly_rate}
              onChange={(e) => setNewJob({ ...newJob, hourly_rate: e.target.value })}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2.5 text-sm"
            />
            <input
              placeholder="Budget"
              type="number"
              value={newJob.budget}
              onChange={(e) => setNewJob({ ...newJob, budget: e.target.value })}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2.5 text-sm"
            />
            <input
              placeholder="Contact name/email"
              value={newJob.contact}
              onChange={(e) => setNewJob({ ...newJob, contact: e.target.value })}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2.5 text-sm"
            />
            <textarea
              placeholder="Notes"
              value={newJob.notes}
              onChange={(e) => setNewJob({ ...newJob, notes: e.target.value })}
              rows={2}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={createJob} disabled={!newJob.title.trim()} className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg disabled:opacity-50 transition-colors">
              Create
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Jobs table */}
      <CCTable>
        <CCThead>
          <CCTh>Title</CCTh>
          <CCTh>Platform</CCTh>
          <CCTh>Status</CCTh>
          <CCTh>Rate</CCTh>
          <CCTh>Budget</CCTh>
          <CCTh>Contact</CCTh>
          <CCTh>Updated</CCTh>
        </CCThead>
        <CCTbody>
          {jobs.length === 0 && (
            <tr>
              <td colSpan={7}>
                {loading ? (
                  <div className="px-4 py-8 text-center text-zinc-500 text-sm">Loading...</div>
                ) : (
                  <CCEmptyState
                    icon={Briefcase}
                    title="No jobs yet"
                    body="Start tracking freelance opportunities."
                    action={{ label: 'Add Job', onClick: () => setShowAddForm(true) }}
                  />
                )}
              </td>
            </tr>
          )}
          {jobs.map((job) => {
            const si = getStatusInfo(job.status);
            return (
              <CCTr key={job.id} onClick={() => setSelectedJob(job)}>
                <CCTd>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-200 font-medium">{job.title}</span>
                    {job.source_url && (
                      <a
                        href={job.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-zinc-500 hover:text-teal-400"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </CCTd>
                <CCTd className="text-zinc-400 capitalize">{job.platform}</CCTd>
                <CCTd>
                  <select
                    value={job.status}
                    onChange={(e) => { e.stopPropagation(); handleInlineStatusChange(job.id, e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                    className={`text-xs px-2.5 py-1 rounded-full border-0 cursor-pointer ${si.color} bg-transparent`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </CCTd>
                <CCTd className="text-zinc-400">
                  {job.hourly_rate !== null ? `$${job.hourly_rate}/hr` : '—'}
                </CCTd>
                <CCTd className="text-zinc-400">
                  {job.budget !== null ? `$${job.budget}` : '—'}
                </CCTd>
                <CCTd className="text-zinc-400 truncate max-w-[150px]">{job.contact || '—'}</CCTd>
                <CCTd className="text-zinc-500 text-xs whitespace-nowrap">{timeAgo(job.updated_at)}</CCTd>
              </CCTr>
            );
          })}
        </CCTbody>
      </CCTable>

      {/* Job Drawer */}
      {selectedJob && (
        <JobDrawer
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdate={handleUpdateJob}
        />
      )}
    </CommandCenterShell>
  );
}
