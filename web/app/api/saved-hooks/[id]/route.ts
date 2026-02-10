import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('saved_hooks')
    .delete()
    .eq('id', id)
    .eq('user_id', authContext.user.id);

  if (error) {
    console.error('[Saved Hooks DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete hook' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
