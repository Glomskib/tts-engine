/**
 * POST /api/intake/google/folders/createRecommended
 * Creates "FlashFlow Intake / Raw Footage" folder structure in user's Drive.
 * Automatically selects the Raw Footage folder as the intake source.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createRecommendedFolders } from '@/lib/intake/google-drive';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { intakeFolder, rawFootageFolder } = await createRecommendedFolders(authContext.user.id);

    // Auto-select the Raw Footage folder
    await supabaseAdmin
      .from('drive_intake_connectors')
      .update({
        folder_id: rawFootageFolder.id,
        folder_name: `${intakeFolder.name} / ${rawFootageFolder.name}`,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', authContext.user.id);

    return NextResponse.json({
      ok: true,
      intakeFolder,
      rawFootageFolder,
      selectedFolder: {
        id: rawFootageFolder.id,
        name: `${intakeFolder.name} / ${rawFootageFolder.name}`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Insufficient Permission') || msg.includes('insufficientPermissions')) {
      return NextResponse.json({
        error: 'Missing folder creation permission. Please reconnect with "Create folder" permission.',
        needsReconnect: true,
      }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
