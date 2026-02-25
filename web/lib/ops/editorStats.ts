/**
 * Editor Performance Tracker
 *
 * Lightweight analytics layer for VA editors.
 * Queries edit_jobs + job_events to compute per-editor metrics.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ── Types ──────────────────────────────────────────────────

export interface EditorStats {
  editor_user_id: string;
  display_name: string | null;
  jobs_claimed_last_7d: number;
  avg_edit_time_hours: number | null;
  revisions_per_job: number | null;
}

export interface EditorHealthSummary {
  editors: EditorStats[];
  total_active_editors: number;
}

// ── Queries ────────────────────────────────────────────────

const SEVEN_DAYS_AGO = () => new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();

/**
 * Get aggregated stats for all editors who have claimed jobs in the last 7 days.
 */
export async function getEditorHealthSummary(): Promise<EditorHealthSummary> {
  const since = SEVEN_DAYS_AGO();

  // 1. Get all jobs claimed in the last 7 days, grouped by editor
  const { data: recentJobs, error: jobsErr } = await supabaseAdmin
    .from("edit_jobs")
    .select("id, claimed_by, claimed_at, started_at, submitted_at, job_status")
    .not("claimed_by", "is", null)
    .gte("claimed_at", since);

  if (jobsErr) {
    throw new Error(`Failed to fetch editor jobs: ${jobsErr.message}`);
  }

  const jobs = recentJobs ?? [];

  // 2. Get revision counts (changes_requested events) for those jobs
  const jobIds = jobs.map((j) => j.id as string);
  let revisionCounts = new Map<string, number>();

  if (jobIds.length > 0) {
    const { data: revEvents } = await supabaseAdmin
      .from("job_events")
      .select("job_id")
      .in("job_id", jobIds)
      .eq("event_type", "changes_requested");

    if (revEvents) {
      for (const ev of revEvents) {
        const jid = ev.job_id as string;
        revisionCounts.set(jid, (revisionCounts.get(jid) ?? 0) + 1);
      }
    }
  }

  // 3. Get editor display names
  const editorIds = [...new Set(jobs.map((j) => j.claimed_by as string))];
  let nameMap = new Map<string, string | null>();

  if (editorIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("mp_profiles")
      .select("id, display_name")
      .in("id", editorIds);

    if (profiles) {
      for (const p of profiles) {
        nameMap.set(p.id as string, p.display_name as string | null);
      }
    }
  }

  // 4. Aggregate per editor
  const editorMap = new Map<string, {
    claimed: number;
    editTimes: number[];
    revisions: number[];
  }>();

  for (const job of jobs) {
    const eid = job.claimed_by as string;
    if (!editorMap.has(eid)) {
      editorMap.set(eid, { claimed: 0, editTimes: [], revisions: [] });
    }
    const stats = editorMap.get(eid)!;
    stats.claimed++;

    // Edit time: started_at → submitted_at (if both exist)
    if (job.started_at && job.submitted_at) {
      const hours =
        (new Date(job.submitted_at as string).getTime() -
          new Date(job.started_at as string).getTime()) /
        3_600_000;
      if (hours > 0) stats.editTimes.push(hours);
    }

    // Revisions for this job
    const revs = revisionCounts.get(job.id as string) ?? 0;
    stats.revisions.push(revs);
  }

  const editors: EditorStats[] = [...editorMap.entries()].map(
    ([editorId, agg]) => {
      const avgEdit =
        agg.editTimes.length > 0
          ? Math.round(
              (agg.editTimes.reduce((a, b) => a + b, 0) / agg.editTimes.length) * 10,
            ) / 10
          : null;

      const avgRevisions =
        agg.revisions.length > 0
          ? Math.round(
              (agg.revisions.reduce((a, b) => a + b, 0) / agg.revisions.length) * 10,
            ) / 10
          : null;

      return {
        editor_user_id: editorId,
        display_name: nameMap.get(editorId) ?? null,
        jobs_claimed_last_7d: agg.claimed,
        avg_edit_time_hours: avgEdit,
        revisions_per_job: avgRevisions,
      };
    },
  );

  // Sort by jobs claimed descending
  editors.sort((a, b) => b.jobs_claimed_last_7d - a.jobs_claimed_last_7d);

  return {
    editors,
    total_active_editors: editors.length,
  };
}
