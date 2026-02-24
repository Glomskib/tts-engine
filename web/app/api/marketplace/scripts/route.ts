import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { getFirstClientId, getPipelineRows, createScript } from '@/lib/marketplace/queries';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const clientId = await getFirstClientId(user.id);
  if (!clientId) return NextResponse.json({ error: 'No client found' }, { status: 404 });
  const rows = await getPipelineRows(clientId);
  return NextResponse.json({ scripts: rows });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const clientId = await getFirstClientId(user.id);
  if (!clientId) return NextResponse.json({ error: 'No client found' }, { status: 404 });
  const body = await req.json();
  try {
    const script = await createScript(clientId, user.id, body);
    return NextResponse.json({ script }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
