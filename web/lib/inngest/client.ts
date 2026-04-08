/**
 * Inngest client for FlashFlow background jobs.
 *
 * Used to enqueue async work (e.g. editor pipeline) so that it runs outside
 * Vercel's 300s request cap. Events are sent via `inngest.send(...)` and
 * handled by functions registered at `app/api/inngest/route.ts`.
 */
import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'flashflow' });

export type EditorJobProcessEvent = {
  name: 'editor/job.process';
  data: { jobId: string; userId: string };
};
