import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { getFirstClientId, getClientMetrics } from '@/lib/marketplace/queries';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const clientId = await getFirstClientId(user.id);
  if (!clientId) return NextResponse.json({ error: 'No client found' }, { status: 404 });
  const metrics = await getClientMetrics(clientId);
  return NextResponse.json({ metrics });
}
