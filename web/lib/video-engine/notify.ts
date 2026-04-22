/**
 * Completion notifications for the Video Engine.
 *
 * Fires once per terminal-state run (complete | failed):
 *   1. In-app notification row (notifications table) so the bell icon lights up.
 *   2. Email via Resend so the user can leave the tab and come back later.
 *
 * Idempotency: ve_runs.notify_state advances unsent → sending → (sent | failed).
 * The pipeline tick + cron both call notifyTerminalRun on transition; whichever
 * runs first wins via a row-level update guarded on notify_state='unsent'.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail } from '@/lib/email/resend';

export type NotifyOutcome =
  | { ok: true; channels: { inApp: boolean; email: boolean } }
  | { ok: false; reason: string };

interface RunForNotify {
  id: string;
  user_id: string;
  status: 'complete' | 'failed';
  mode: string;
  error_message: string | null;
  notify_state: string;
  target_clip_count: number;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com';

/**
 * Claim the run for notification by atomically advancing notify_state from
 * 'unsent' to 'sending'. Returns true if we got the claim, false if someone
 * else already started.
 */
async function claimNotify(runId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('ve_runs')
    .update({ notify_state: 'sending' })
    .eq('id', runId)
    .eq('notify_state', 'unsent')
    .select('id')
    .maybeSingle();
  return !!data;
}

async function markNotified(runId: string, sent: boolean): Promise<void> {
  await supabaseAdmin
    .from('ve_runs')
    .update({
      notify_state: sent ? 'sent' : 'failed',
      notification_sent_at: sent ? new Date().toISOString() : null,
    })
    .eq('id', runId);
}

async function getUserEmail(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function insertInAppNotification(
  userId: string,
  runId: string,
  type: 'video_engine_complete' | 'video_engine_failed',
  payload: Record<string, unknown>,
): Promise<boolean> {
  // We can't use the SECURITY DEFINER insert_notification helper here because
  // it gates on auth.uid() — service-role calls have no auth.uid(). Insert
  // directly via the service role (bypasses RLS).
  const { error } = await supabaseAdmin.from('notifications').insert({
    user_id: userId,
    type,
    video_id: null,                  // ve_runs are not in the videos table
    payload: { run_id: runId, ...payload },
    is_read: false,
  });
  if (error) {
    console.error('[ve-notify] in-app insert failed:', error.message);
    return false;
  }
  return true;
}

function emailHtmlComplete(args: { runId: string; mode: string; clipCount: number }): string {
  const url = `${APP_URL}/video-engine/${args.runId}`;
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0a0a0a;color:#fafafa;">
      <h1 style="font-size:22px;margin:0 0 16px 0;color:#fff;">Your clips are ready 🎬</h1>
      <p style="margin:0 0 12px 0;color:#a1a1aa;">
        Your ${args.mode} run finished. We pulled ${args.clipCount} clips out of your upload — captions, headlines, and CTA cards burned in.
      </p>
      <p style="margin:24px 0;">
        <a href="${url}" style="background:#fff;color:#000;padding:12px 20px;border-radius:8px;font-weight:600;text-decoration:none;display:inline-block;">View your clips</a>
      </p>
      <p style="margin:0;color:#71717a;font-size:13px;">
        Tip: each clip card has a copy-paste caption, hashtags, and a suggested title ready to go.
      </p>
    </div>
  `;
}

function emailHtmlFailed(args: { runId: string; errorMessage: string | null }): string {
  const url = `${APP_URL}/video-engine/${args.runId}`;
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0a0a0a;color:#fafafa;">
      <h1 style="font-size:22px;margin:0 0 16px 0;color:#fff;">Your run hit a snag</h1>
      <p style="margin:0 0 12px 0;color:#a1a1aa;">
        We couldn't finish processing your upload. Most often this is a source-video issue (no audible speech, corrupted file, or too short).
      </p>
      ${args.errorMessage ? `<pre style="background:#18181b;color:#fbbf24;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;">${args.errorMessage}</pre>` : ''}
      <p style="margin:24px 0;">
        <a href="${url}" style="background:#fff;color:#000;padding:12px 20px;border-radius:8px;font-weight:600;text-decoration:none;display:inline-block;">Open the run</a>
      </p>
      <p style="margin:0;color:#71717a;font-size:13px;">
        Need a hand? Reply to this email and we'll dig in.
      </p>
    </div>
  `;
}

/**
 * Notify the user that this run reached a terminal state. Safe to call
 * multiple times — only the first call delivers.
 */
export async function notifyTerminalRun(runId: string): Promise<NotifyOutcome> {
  const { data: row } = await supabaseAdmin
    .from('ve_runs')
    .select('id,user_id,status,mode,error_message,notify_state,target_clip_count')
    .eq('id', runId)
    .maybeSingle();

  if (!row) return { ok: false, reason: 'run_not_found' };
  const run = row as RunForNotify;
  if (run.status !== 'complete' && run.status !== 'failed') {
    return { ok: false, reason: 'not_terminal' };
  }
  if (run.notify_state !== 'unsent') {
    return { ok: false, reason: `already_${run.notify_state}` };
  }
  if (!(await claimNotify(runId))) {
    return { ok: false, reason: 'claim_lost' };
  }

  const isComplete = run.status === 'complete';
  const type = isComplete ? 'video_engine_complete' : 'video_engine_failed';

  // 1. In-app notification — fire even if the user has no email on file.
  const inAppOk = await insertInAppNotification(run.user_id, run.id, type, {
    mode: run.mode,
    error_message: run.error_message,
    target_clip_count: run.target_clip_count,
  });

  // 2. Email — best-effort.
  let emailOk = false;
  const email = await getUserEmail(run.user_id);
  if (email) {
    const subject = isComplete ? 'Your FlashFlow clips are ready' : 'Your FlashFlow run needs a look';
    const html = isComplete
      ? emailHtmlComplete({ runId: run.id, mode: run.mode, clipCount: run.target_clip_count })
      : emailHtmlFailed({ runId: run.id, errorMessage: run.error_message });
    const result = await sendEmail({
      to: email,
      subject,
      html,
      tags: [
        { name: 'product', value: 'video-engine' },
        { name: 'event', value: type },
      ],
    });
    emailOk = result.success === true;
  }

  await markNotified(runId, inAppOk || emailOk);
  return { ok: true, channels: { inApp: inAppOk, email: emailOk } };
}

/**
 * Sweep up to N runs that finished but never delivered. Used by the cron
 * as a safety net in case the in-line tick path missed the transition.
 */
export async function notifyPendingRuns(max = 10): Promise<NotifyOutcome[]> {
  const { data } = await supabaseAdmin
    .from('ve_runs')
    .select('id')
    .in('status', ['complete', 'failed'])
    .eq('notify_state', 'unsent')
    .order('completed_at', { ascending: true, nullsFirst: false })
    .limit(max);
  if (!data) return [];
  const out: NotifyOutcome[] = [];
  for (const r of data) {
    out.push(await notifyTerminalRun(r.id as string));
  }
  return out;
}
