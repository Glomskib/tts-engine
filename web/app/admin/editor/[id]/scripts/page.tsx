'use client';

/**
 * /admin/editor/[id]/scripts
 *
 * Lists every "script group" in the edit job + the takes captured for that
 * line, with the AI-chosen take badged. User can swap to any other take —
 * triggers a re-render via the override endpoint.
 *
 * V1 scope: works for the common 2–3 take case. Doesn't yet handle:
 *   - merging takes mid-line
 *   - splitting a script group across multiple recordings
 * See work-order Task #24 for V2.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Check } from 'lucide-react';

interface Take {
  id: string;
  take_number: number;
  asset_path: string;
  segment_start: number | null;
  segment_end: number | null;
  ai_score: number | null;
  ai_chosen: boolean;
  ai_reason: string | null;
  user_override_chosen: boolean;
}

interface Group {
  script_group: string;
  script_text: string;
  takes: Take[];
}

export default function ScriptAttemptsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const jobId = params.id;
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTake, setBusyTake] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [jobId]);

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/editor/jobs/${jobId}/script-attempts`);
    const data = await r.json();
    if (r.ok) setGroups(data.groups || []);
    setLoading(false);
  }

  async function handleOverride(takeId: string) {
    setBusyTake(takeId);
    try {
      const r = await fetch(`/api/editor/jobs/${jobId}/script-attempts/${takeId}/override`, {
        method: 'POST',
      });
      if (r.ok) {
        await load();
      }
    } finally {
      setBusyTake(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to job
      </button>

      <h1 className="text-2xl font-bold text-zinc-100">Script takes</h1>
      <p className="text-sm text-zinc-500 mt-1">
        AI picks the best take per line. Swap if you disagree — the video re-renders.
      </p>

      {loading && <p className="mt-6 text-zinc-500">Loading takes…</p>}

      {!loading && groups.length === 0 && (
        <p className="mt-6 text-zinc-500 italic">
          No multi-take groups detected for this job. Single-take recordings
          render as-is and don&apos;t show up here.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {groups.map((g) => (
          <div key={g.script_group} className="rounded-2xl bg-zinc-900/40 border border-white/5">
            <div className="p-4 border-b border-white/5">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Line</div>
              <p className="mt-1 text-zinc-100 leading-relaxed">{g.script_text}</p>
            </div>
            <ul className="divide-y divide-white/5">
              {g.takes.map((t) => {
                const isChosen = t.user_override_chosen || (!hasOverride(g.takes) && t.ai_chosen);
                return (
                  <li key={t.id} className="p-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100">Take {t.take_number}</span>
                        {t.ai_chosen && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 text-xs">
                            <Sparkles className="w-3 h-3" /> AI pick
                          </span>
                        )}
                        {t.user_override_chosen && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-xs">
                            <Check className="w-3 h-3" /> Your pick
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {t.segment_start !== null && t.segment_end !== null && (
                          <>{t.segment_start.toFixed(1)}s – {t.segment_end.toFixed(1)}s · </>
                        )}
                        {t.ai_score !== null && <>score {(t.ai_score * 100).toFixed(0)}/100</>}
                      </div>
                      {t.ai_reason && (
                        <p className="text-xs text-zinc-500 mt-1 italic">{t.ai_reason}</p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {isChosen ? (
                        <span className="text-xs text-zinc-500">Selected</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOverride(t.id)}
                          disabled={busyTake === t.id}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 disabled:opacity-50"
                        >
                          {busyTake === t.id ? 'Swapping…' : 'Use this take'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-8 text-sm text-zinc-500">
        <Link href={`/admin/editor/${jobId}`} className="hover:text-teal-400">← Back to job</Link>
      </div>
    </div>
  );
}

function hasOverride(takes: Take[]): boolean {
  return takes.some((t) => t.user_override_chosen);
}
