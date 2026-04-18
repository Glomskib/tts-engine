/**
 * POST /api/video-engine/clips/[id]/copy
 *
 * Lightweight engagement beacon — bumps ve_rendered_clips.copies_made
 * by 1 each time the user copies caption / hook / product link from
 * a clip card. The UI should call this fire-and-forget after a
 * successful `navigator.clipboard.writeText()`.
 *
 * No analytics provider, no external call — the counter itself is
 * the signal. Keep the endpoint fast and forgiving: unknown surface
 * strings still count as 1.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id: clipId } = await ctx.params;

  // Ownership check: clip → run → user. One join, cheap.
  const { data: clip, error: clipErr } = await supabaseAdmin
    .from('ve_rendered_clips')
    .select('id, run_id, ve_runs!inner(user_id)')
    .eq('id', clipId)
    .single();

  if (clipErr || !clip) {
    return createApiErrorResponse('NOT_FOUND', 'Clip not found', 404, correlationId);
  }

  // ve_runs is a single related row via the !inner join.
  const ownerId = Array.isArray((clip as { ve_runs?: unknown }).ve_runs)
    ? ((clip as { ve_runs?: { user_id?: string }[] }).ve_runs?.[0]?.user_id ?? null)
    : ((clip as { ve_runs?: { user_id?: string } }).ve_runs?.user_id ?? null);
  if (ownerId !== auth.user.id && !auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Clip belongs to another user', 403, correlationId);
  }

  const { data: updated, error: rpcErr } = await supabaseAdmin.rpc('ve_increment_clip_copies', {
    p_clip_id: clipId,
  });

  if (rpcErr) {
    console.error(`[${correlationId}] clips/copy RPC failed:`, rpcErr);
    return createApiErrorResponse('DB_ERROR', `Failed to increment copies_made: ${rpcErr.message}`, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: { copies_made: (updated as { copies_made?: number } | null)?.copies_made ?? null },
    correlation_id: correlationId,
  });
}
