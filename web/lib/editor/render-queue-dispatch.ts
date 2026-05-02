/**
 * Editor render-queue dispatch.
 *
 * Routes an ai_edit_jobs row into the `render_jobs` queue (job_type =
 * 'editor_pipeline') so a Mac mini render-worker can claim and process it.
 * The mini worker (scripts/render-worker.ts) reads the ffmpeg args and
 * input/output paths from the queued row's payload.
 *
 * Env flags:
 *   RENDER_WORKER_QUEUE_ENABLED  — when '1' or 'true', new jobs go to the
 *                                  queue. Otherwise they run inline via
 *                                  the existing pipeline.processEditJob.
 *   RENDER_WORKER_FALLBACK_INLINE — when '1' or 'true' AND the queue is
 *                                  enabled, fall back to inline if the
 *                                  enqueue step itself fails (e.g.,
 *                                  Supabase RPC unavailable).
 *
 * The actual ffmpeg args for an editor job are computed inside
 * `web/lib/editor/pipeline.ts` and depend on transcript, mode, captions,
 * music, watermark, etc. Building those without running the pipeline is
 * non-trivial — for V1 we enqueue with a *placeholder* ffmpeg_args set
 * that's rebuilt by the worker. To avoid duplicating logic, the worker
 * pulls the prepared ffmpeg args from the ai_edit_jobs.metadata field
 * (set by pipeline.ts under `render_args`).
 *
 * Wiring TODOs:
 *   1. pipeline.ts produces `ai_edit_jobs.metadata.render_args` with shape
 *      { ffmpeg_args, input_paths, output_path } once it's done with all
 *      of the prep (transcribe, build cuts, etc.).
 *   2. The worker either reads them from the row directly, or we enqueue
 *      with that payload. V1 uses the queue payload (so the worker can
 *      run without touching ai_edit_jobs).
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const RENDER_QUEUE_ENABLED =
  process.env.RENDER_WORKER_QUEUE_ENABLED === '1' ||
  process.env.RENDER_WORKER_QUEUE_ENABLED === 'true';

export const RENDER_QUEUE_FALLBACK_INLINE =
  process.env.RENDER_WORKER_FALLBACK_INLINE === '1' ||
  process.env.RENDER_WORKER_FALLBACK_INLINE === 'true';

export interface EnqueueRenderArgs {
  editJobId: string;
  ffmpegArgs: string[];
  inputPaths: string[];
  outputPath: string;
  workspaceId?: string;
  priority?: number;
}

/**
 * Enqueue an editor render job. Returns the new render_jobs.id, or throws.
 */
export async function enqueueEditorRenderJob(args: EnqueueRenderArgs): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('enqueue_editor_render_job', {
    p_edit_job_id: args.editJobId,
    p_ffmpeg_args: args.ffmpegArgs,
    p_input_paths: args.inputPaths,
    p_output_path: args.outputPath,
    p_workspace_id: args.workspaceId ?? null,
    p_priority: args.priority ?? 5,
  });

  if (error) {
    throw new Error(`enqueue_editor_render_job failed: ${error.message}`);
  }
  return data as string;
}
