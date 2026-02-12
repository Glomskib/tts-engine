/**
 * Cron: Process Email Queue
 *
 * Called by Vercel Cron every 6 hours (or manually).
 * Processes the email_queue table and sends due emails via Resend.
 *
 * Vercel cron config (vercel.json):
 * { "crons": [{ "path": "/api/cron/process-emails", "schedule": "0 0,6,12,18 * * *" }] }
 */

import { processEmailQueue } from '@/lib/email/scheduler';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processEmailQueue();

    console.info(`[cron/process-emails] Processed: ${result.sent} sent, ${result.errors} errors`);

    return NextResponse.json({
      ok: true,
      sent: result.sent,
      errors: result.errors,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron/process-emails] Failed:', error);
    return NextResponse.json({ ok: false, error: 'Processing failed' }, { status: 500 });
  }
}
