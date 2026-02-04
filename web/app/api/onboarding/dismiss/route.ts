import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST() {
  try {
    const authContext = await getApiAuthContext();
    if (!authContext.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authContext.user.id;

    // Try to update user_profiles if it exists, otherwise just return success
    // The frontend can also store this in localStorage as a fallback
    try {
      await supabaseAdmin
        .from('user_profiles')
        .upsert({
          user_id: userId,
          onboarding_dismissed: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });
    } catch (dbError) {
      // If the table doesn't exist, that's okay
      console.error('[Onboarding] Could not update user_profiles:', dbError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Dismiss onboarding error:', error);
    return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 });
  }
}
