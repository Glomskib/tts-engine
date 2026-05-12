'use client';

/**
 * /clips — "My Clips" library. Lists every clip the user has generated from /create.
 *
 * Pulls from /api/create/jobs (their job list) and surfaces rendered clips
 * across jobs. Free tier limited to most recent — paid tiers see the full
 * archive within their retention window.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Loader2, Plus } from 'lucide-react';

interface JobRow {
  id: string;
  status: string;
  created_at: string;
  target_clip_count: number;
  context_json: { describe?: string; vibe?: string };
}

export default function ClipsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/create/jobs', { cache: 'no-store' });
        const j = await r.json();
        if (j?.ok) setJobs(j.jobs || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">My Clips</h1>
          <Link href="/create" className="px-4 py-2 bg-teal-500 hover:bg-teal-600 rounded-lg font-medium flex items-center gap-2">
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
            <Link href="/create" className="inline-block px-6 py-3 bg-teal-500 hover:bg-teal-600 rounded-lg font-medium">
              Start a clip →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => (
              <Link
                key={j.id}
                href={`/create?job=${j.id}`}
                className="block p-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{j.context_json?.describe || 'Untitled clip job'}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {j.target_clip_count} clip{j.target_clip_count === 1 ? '' : 's'}
                      {j.context_json?.vibe ? ` · ${j.context_json.vibe}` : ''}
                      {' · '}
                      {new Date(j.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <StatusPill status={j.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    created:      { color: 'bg-gray-700 text-gray-200',   label: 'Queued' },
    transcribing: { color: 'bg-blue-900/40 text-blue-200', label: 'Transcribing' },
    analyzing:    { color: 'bg-blue-900/40 text-blue-200', label: 'Analyzing' },
    assembling:   { color: 'bg-blue-900/40 text-blue-200', label: 'Assembling' },
    rendering:    { color: 'bg-amber-900/40 text-amber-200', label: 'Rendering' },
    complete:     { color: 'bg-green-900/40 text-green-200', label: '✓ Done' },
    failed:       { color: 'bg-red-900/40 text-red-200',   label: 'Failed' },
  };
  const m = map[status] || map.created;
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full ${m.color}`}>{m.label}</span>;
}
