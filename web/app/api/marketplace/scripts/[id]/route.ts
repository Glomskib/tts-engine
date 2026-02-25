import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { getFirstClientId, getScriptWithAssets, updateScript, updateScriptStatus, queueForEditing, addScriptAsset, markPosted, MarketplaceError } from '@/lib/marketplace/queries';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const result = await getScriptWithAssets(id);
  if (!result.script) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  try {
    // Handle action-based transitions
    if (body.action) {
      const clientId = await getFirstClientId(user.id);
      switch (body.action) {
        case 'mark_ready':
          await updateScriptStatus(id, 'ready_to_record');
          break;
        case 'mark_recorded':
          await updateScriptStatus(id, 'recorded');
          break;
        case 'queue_for_edit':
          if (!clientId) return NextResponse.json({ error: 'No client' }, { status: 400 });
          await queueForEditing(id, clientId, user.id);
          break;
        case 'mark_posted':
          await markPosted(id, user.id);
          break;
        case 'add_asset':
          await addScriptAsset(id, user.id, {
            asset_type: body.asset_type,
            label: body.label,
            url: body.url,
          });
          break;
        default:
          return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
      }
      const result = await getScriptWithAssets(id);
      return NextResponse.json(result);
    }

    // Regular field update
    const script = await updateScript(id, body);
    return NextResponse.json({ script });
  } catch (e: unknown) {
    if (e instanceof MarketplaceError) {
      return NextResponse.json(
        { error: e.message, error_code: e.code },
        { status: e.httpStatus },
      );
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
