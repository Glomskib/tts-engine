/**
 * Email Scheduler
 *
 * Queues email sequences (onboarding, lead_magnet, winback) into the
 * email_queue table. A cron job processes due emails every 6 hours.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail } from './resend';
import { onboardingEmails } from './templates/onboarding';
import { leadMagnetEmails } from './templates/lead-magnet';
import { winbackEmails } from './templates/winback';

export type EmailSequence = 'onboarding' | 'lead_magnet' | 'winback' | 'weekly_digest' | 'upgrade_nudge';

const SEQUENCE_MAP = {
  onboarding: onboardingEmails,
  lead_magnet: leadMagnetEmails,
  winback: winbackEmails,
} as const;

export async function queueEmailSequence(
  email: string,
  name: string,
  sequence: EmailSequence,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const emails = SEQUENCE_MAP[sequence as keyof typeof SEQUENCE_MAP];
  if (!emails) {
    console.warn(`[email-scheduler] Unknown sequence: ${sequence}`);
    return;
  }

  const now = new Date();
  const rows = emails.map((tmpl, index) => ({
    user_email: email,
    user_name: name || email.split('@')[0],
    sequence,
    step: index,
    send_at: new Date(now.getTime() + tmpl.delay * 24 * 60 * 60 * 1000).toISOString(),
    metadata: metadata || {},
  }));

  const { error } = await supabaseAdmin.from('email_queue').insert(rows);

  if (error) {
    console.error('[email-scheduler] Failed to queue sequence:', error);
  }
}

export async function processEmailQueue(): Promise<{ sent: number; errors: number }> {
  let sent = 0;
  let errors = 0;

  // Fetch all unsent emails that are due
  const { data: pending, error: fetchError } = await supabaseAdmin
    .from('email_queue')
    .select('*')
    .eq('sent', false)
    .lte('send_at', new Date().toISOString())
    .order('send_at', { ascending: true })
    .limit(50);

  if (fetchError) {
    console.error('[email-scheduler] Failed to fetch queue:', fetchError);
    return { sent: 0, errors: 1 };
  }

  if (!pending || pending.length === 0) {
    return { sent: 0, errors: 0 };
  }

  for (const item of pending) {
    try {
      const emails = SEQUENCE_MAP[item.sequence as keyof typeof SEQUENCE_MAP];
      if (!emails || !emails[item.step]) {
        // Mark as sent to avoid infinite retries on invalid sequences
        await supabaseAdmin
          .from('email_queue')
          .update({ sent: true, error: 'Invalid sequence or step' })
          .eq('id', item.id);
        errors++;
        continue;
      }

      const template = emails[item.step];
      const templateData = {
        userName: item.user_name || item.user_email.split('@')[0],
        ...(item.metadata || {}),
      };

      const html = template.getHtml(templateData as never);

      const result = await sendEmail({
        to: item.user_email,
        subject: template.subject,
        html,
        tags: [
          { name: 'sequence', value: item.sequence },
          { name: 'step', value: String(item.step) },
        ],
      });

      if (result.success) {
        await supabaseAdmin
          .from('email_queue')
          .update({ sent: true, sent_at: new Date().toISOString() })
          .eq('id', item.id);
        sent++;
      } else {
        await supabaseAdmin
          .from('email_queue')
          .update({ error: JSON.stringify(result.error) })
          .eq('id', item.id);
        errors++;
      }
    } catch (err) {
      console.error(`[email-scheduler] Error processing email ${item.id}:`, err);
      await supabaseAdmin
        .from('email_queue')
        .update({ error: String(err) })
        .eq('id', item.id);
      errors++;
    }
  }

  return { sent, errors };
}
