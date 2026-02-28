/**
 * GET /api/revenue-mode/digest
 *
 * Remote digest endpoint for Revenue Mode.
 * Returns top high-intent items with previews (never full commentText).
 *
 * Query params:
 *   minLeadScore      — minimum lead score filter (default 70)
 *   limit             — max items to return (default 5, max 10)
 *   includeSimulation — include sim_ rows (default false)
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getRevenueModeInbox } from '@/lib/revenue-intelligence/revenue-inbox-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await getApiAuthContext(request);

    const userId = auth.user?.id || process.env.RI_TEST_USER_ID;
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'missing_user' }, { status: 500 });
    }

    const url = new URL(request.url);
    const minLeadScore = Number(url.searchParams.get('minLeadScore') ?? 70);
    const rawLimit = Number(url.searchParams.get('limit') ?? 5);
    const limit = Math.min(Math.max(1, rawLimit), 10);
    const includeSimulation = url.searchParams.get('includeSimulation') === 'true';

    const items = await getRevenueModeInbox({ userId, minLeadScore, includeSimulation, limit });

    const digest = items.map((item) => ({
      commentId: item.commentId,
      commenterUsername: item.commenterUsername,
      preview: item.commentText.slice(0, 160),
      category: item.category,
      leadScore: item.leadScore,
      urgencyScore: item.urgencyScore,
      status: item.status,
      videoUrl: item.videoUrl ?? null,
      ingestedAt: item.ingestedAt ?? null,
    }));

    return NextResponse.json({
      ok: true,
      total: digest.length,
      minLeadScore,
      includeSimulation,
      items: digest,
      ts: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
