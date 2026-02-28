/**
 * GET /api/revenue-mode/self-check
 *
 * Remote-verifiable health check for Revenue Mode.
 * Returns inbox summary without exposing full comment data.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getRevenueModeInbox } from '@/lib/revenue-intelligence/revenue-inbox-service';

export const runtime = 'nodejs';

function maskUserId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

export async function GET(request: Request) {
  try {
    const auth = await getApiAuthContext(request);

    const userId = auth.user?.id || process.env.RI_TEST_USER_ID;
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'missing_user' }, { status: 500 });
    }

    const url = new URL(request.url);
    const minLeadScore = Number(url.searchParams.get('minLeadScore') ?? 70);
    const includeSimulation = url.searchParams.get('includeSimulation') === 'true';

    const items = await getRevenueModeInbox({ userId, minLeadScore, includeSimulation });

    const top =
      items.length > 0
        ? {
            commenterUsername: items[0].commenterUsername,
            category: items[0].category,
            leadScore: items[0].leadScore,
            urgencyScore: items[0].urgencyScore,
            preview: items[0].commentText.slice(0, 120),
          }
        : null;

    return NextResponse.json({
      ok: true,
      userIdMasked: maskUserId(userId),
      minLeadScore,
      includeSimulation,
      total: items.length,
      top,
      statusRoute: '/api/revenue-mode/status',
      ts: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
