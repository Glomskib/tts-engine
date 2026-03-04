/**
 * GET /api/intake/google/folders?query=FlashFlow
 * Lists Google Drive folders the user has access to.
 *
 * POST /api/intake/google/folders
 * Body: { folder_id, folder_name } — saves selected folder to connector config.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { listFolders } from '@/lib/intake/google-drive';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get('query') || undefined;

  try {
    const folders = await listFolders(authContext.user.id, query);
    return NextResponse.json({ ok: true, folders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('No Drive tokens')) {
      return NextResponse.json({ error: 'Drive not connected' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { folder_id: string; folder_name: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.folder_id || !body.folder_name) {
    return NextResponse.json({ error: 'folder_id and folder_name required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('drive_intake_connectors')
    .update({
      folder_id: body.folder_id,
      folder_name: body.folder_name,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', authContext.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, folder_id: body.folder_id, folder_name: body.folder_name });
}
