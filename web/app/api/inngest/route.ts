/**
 * Inngest webhook endpoint.
 *
 * In local dev: `npx inngest-cli@latest dev` discovers this route and
 * invokes registered functions when events are sent.
 *
 * In production: Inngest Cloud calls this endpoint (signed with
 * INNGEST_SIGNING_KEY) to execute functions.
 */
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { processEditJobFn } from '@/lib/inngest/functions/processEditJob';

export const runtime = 'nodejs';
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processEditJobFn],
});
