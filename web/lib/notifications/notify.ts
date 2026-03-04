/**
 * Smart Notification helper — inserts notifications into the existing
 * notifications table for content intelligence events.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type NotificationType = 'viral_alert' | 'new_winner' | 'score_A_plus';

interface CreateNotificationInput {
  workspaceId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

export async function createNotification({
  workspaceId,
  type,
  title,
  message,
  link,
}: CreateNotificationInput): Promise<void> {
  const { error } = await supabaseAdmin
    .from('notifications')
    .insert({
      user_id: workspaceId,
      type,
      title,
      message,
      action_url: link ?? null,
      read: false,
      is_read: false,
    });

  if (error) {
    console.error('[notify] insert error:', error);
  }
}
