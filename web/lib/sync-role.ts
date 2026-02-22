import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Sync the user's role in user_roles to match their plan.
 * Admins are never overwritten.
 * Fire-and-forget safe — logs errors but does not throw.
 */
export async function syncRoleFromPlan(userId: string, planId: string): Promise<void> {
  try {
    // Check if user is admin — if so, skip
    const { data: existing } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (existing?.role === 'admin') return;

    // Upsert role = planId
    const { error } = await supabaseAdmin
      .from('user_roles')
      .upsert(
        { user_id: userId, role: planId },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error(`[syncRoleFromPlan] Failed for user ${userId}:`, error);
    }
  } catch (err) {
    console.error(`[syncRoleFromPlan] Error for user ${userId}:`, err);
  }
}
