'use client';

/**
 * /clips — "My Clips" library.
 *
 * For each job:
 *   - Pending/in-progress jobs show a status pill + "View progress →"
 *     button that opens /create?job=<id> to watch the Cooking screen.
 *   - Completed jobs render the actual clip(s) inline with a player +
 *     download button so the user doesn't have to bounce back to /create.
 *   - Failed jobs show the error_message so the user knows why.
 *
 * Source data: /api/create/jobs (now returns `clips[]` per job).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Loader2, Plus, Download, ExternalLink, AlertTriangle } from 'lucide-react';

interface Clip {
  id: string;
  output_url: string | null;
  duration_sec: number | null;
  status: string;
}

interface JobRow {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  target_clip_count: number;
  context_json: { describe?: string; vibe?: string };
  error_message: string | null;
  clips: Clip[];
}

export default function ClipsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/create/jobs', { cache: 'no-store' });
        const j = await r.json();
        if (!cancelled && j?.ok) setJobs(j.jobs || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    // Keep the page fresh while jobs are in progress.
    const interval = setInterval(load, 6000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">My Clips</h1>
          <Link
            href="/create"
            className="px-4 py-2 bg-teal-500 hover:bg-teal-600 rounded-lg font-medium flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-xl">
            <Sparkles className="w-12 h-12 mx-auto text-gray-600 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No clips yet</h2>
            <p className="text-gray-400 mb-6">Make your first one — should take under a minute.</p>
            <Link
              href="/create"
              className="inline-block px-6 py-3 bg-teal-500 hover:bg-teal-600 rounded-lg font-medium"
            >
              Start a clip →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: JobRow }) {
  const done = job.status === 'complete';
  const failed = job.status === 'failed';
  const inProgress = !done && !failed;
  const ready = job.clips.filter((c) => c.output_url && c.status === 'complete');

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <div className="font-medium truncate">{job.context_json?.describe || 'Untitled clip job'}</div>
          <div className="text-xs text-gray-400 mt-1">
            {job.target_clip_count} clip{job.target_clip_count === 1 ? '' : 's'}
            {job.context_json?.vibe ? ` · ${job.context_json.vibe}` : ''}
            {' · '}
            {new Date(job.created_at).toLocaleDateString()}
          </div>
        </div>
        <StatusPill status={job.status} />
      </div>

      {failed && job.error_message && (
        <div className="mx-4 mb-4 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="leading-snug">{job.error_message}</div>
        </div>
      )}

      {inProgress && (
        <div className="px-4 pb-4">
          <Link
            href={`/create?job=${job.id}`}
            className="inline-flex items-center gap-1 text-sm text-teal-400 hover:text-teal-300"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> View progress
          </Link>
        </div>
      )}

      {done && ready.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-4">
          {ready.map((c) => (
            <div key={c.id} className="bg-black rounded-lg overflow-hidden border border-gray-800">
              <video
                src={c.output_url || ''}
                controls
                playsInline
                preload="metadata"
                className="w-full aspect-[9/16] bg-black"
              />
              <div className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="text-gray-400">
                  {c.duration_sec ? `${c.duration_sec.toFixed(1)}s` : ''}
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={c.output_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-300 hover:text-white inline-flex items-center gap-1"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={c.output_url || '#'}
                    download
                    className="px-2 py-1 bg-teal-600 hover:bg-teal-500 rounded text-white inline-flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {done && ready.length === 0 && (
        <div className="px-4 pb-4 text-sm text-gray-400">
          Job completed but no clip URLs returned — this is rare. Try re-creating.
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    created:      { color: 'bg-gray-700 text-gray-200',      label: 'Queued' },
    transcribing: { color: 'bg-blue-900/40 text-blue-200',   label: 'Transcribing' },
    analyzing:    { color: 'bg-blue-900/40 text-blue-200',   label: 'Analyzing' },
    assembling:   { color: 'bg-blue-900/40 text-blue-200',   label: 'Assembling' },
    rendering:    { color: 'bg-amber-900/40 text-amber-200', label: 'Rendering' },
    complete:     { color: 'bg-green-900/40 text-green-200', label: '✓ Done' },
    failed:       { color: 'bg-red-900/40 text-red-200',     label: 'Failed' },
  };
  const m = map[status] || map.created;
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full ${m.color}`}>{m.label}</span>;
}
