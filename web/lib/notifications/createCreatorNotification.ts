/**
 * Creator Notification Service
 *
 * Creates notifications when action is needed:
 * - ready_to_record for >24h
 * - ready_to_post for >24h
 * - winner detected
 *
 * Uses the existing `notifications` table.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

const CREATOR_TYPES = {
  record_reminder: 'pipeline_idle',
  post_reminder: 'pipeline_idle',
  winner_detected: 'winner_detected',
} as const;

type CreatorNotificationType = keyof typeof CREATOR_TYPES;

export async function createCreatorNotification(
  userId: string,
  type: CreatorNotificationType,
  title: string,
  message: string,
  actionUrl?: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('notifications')
    .insert({
      user_id: userId,
      type: CREATOR_TYPES[type],
      title,
      message,
      action_url: actionUrl ?? null,
      read: false,
      is_read: false,
    });

  if (error) {
    console.error('[creator-notifications] insert error:', error.message);
    return false;
  }
  return true;
}

/**
 * Scan workspace for stale items and generate notifications.
 * Idempotent — skips if a similar notification already exists today.
 */
export async function generatePendingNotifications(userId: string): Promise<number> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  let created = 0;

  // Find stale ready_to_record items
  const { data: staleRecord } = await supabaseAdmin
    .from('content_items')
    .select('id, title')
    .eq('workspace_id', userId)
    .eq('status', 'ready_to_record')
    .lt('updated_at', twentyFourHoursAgo)
    .limit(5);

  for (const item of staleRecord || []) {
    const i = item as any;
    const exists = await notificationExistsToday(userId, i.title, todayStart);
    if (!exists) {
      await createCreatorNotification(
        userId,
        'record_reminder',
        'Recording Reminder',
        `You still need to record: ${i.title}`,
        `/admin/record/${i.id}`,
      );
      created++;
    }
  }

  // Find stale ready_to_post items
  const { data: stalePost } = await supabaseAdmin
    .from('content_items')
    .select('id, title')
    .eq('workspace_id', userId)
    .eq('status', 'ready_to_post')
    .lt('updated_at', twentyFourHoursAgo)
    .limit(5);

  for (const item of stalePost || []) {
    const i = item as any;
    const exists = await notificationExistsToday(userId, i.title, todayStart);
    if (!exists) {
      await createCreatorNotification(
        userId,
        'post_reminder',
        'Ready to Post',
        `This video is ready to post: ${i.title}`,
        `/admin/post/${i.id}`,
      );
      created++;
    }
  }

  return created;
}

async function notificationExistsToday(
  userId: string,
  titleFragment: string,
  todayStart: Date,
): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .ilike('message', `%${titleFragment}%`)
    .gte('created_at', todayStart.toISOString());

  return (count ?? 0) > 0;
}
