/**
 * GET /api/marketing/pending-summary
 *
 * High-level counts of the pending queue. Helps Brandon understand the pile
 * before triaging it. There are currently ~950 pending posts and growing —
 * we need to know what's there before bulk-actioning.
 *
 * Auth: owner session OR Bearer MISSION_CONTROL_TOKEN.
 *
 * Returns: {
 *   ok,
 *   total_pending, approved_pending, unapproved_pending,
 *   rejected_in_queue,
 *   by_source: { [source]: count },
 *   by_age_days: { "<1": n, "1-7": n, "8-30": n, "31-90": n, ">90": n },
 *   oldest_unapproved_age_days,
 *   recommendation: string
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireOwner } from '@/lib/command-center/owner-guard';

export const runtime = 'nodejs';

async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const serviceToken = process.env.MISSION_CONTROL_TOKEN;
  if (serviceToken) {
    const authHeader = request.headers.get('authorization');
    const serviceAuth =
      request.headers.get('x-service-token') || request.headers.get('x-mc-token');
    if (authHeader === `Bearer ${serviceToken}` || serviceAuth === serviceToken) {
      return null;
    }
  }
  return requireOwner(request);
}

export async function GET(request: NextRequest) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  // Pull everything that's status=pending. Could be many — limit to 5000 for safety.
  const { data, error } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, source, created_at, meta')
    .eq('status', 'pending')
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const total = rows.length;
  const now = Date.now();

  let approvedYes = 0;
  let rejectedYes = 0;
  const bySource: Record<string, number> = {};
  const byAge: Record<string, number> = { '<1': 0, '1-7': 0, '8-30': 0, '31-90': 0, '>90': 0 };
  let oldestUnapprovedAgeDays = 0;

  for (const r of rows) {
    const meta = (r.meta as Record<string, unknown> | null) || {};
    const isApproved = meta.approved === true;
    const isRejected = meta.rejected === true;
    if (isApproved) approvedYes++;
    if (isRejected) rejectedYes++;

    const src = r.source || 'unknown';
    bySource[src] = (bySource[src] || 0) + 1;

    const ageMs = now - new Date(r.created_at as string).getTime();
    const ageDays = ageMs / 86400000;
    if (ageDays < 1) byAge['<1']++;
    else if (ageDays <= 7) byAge['1-7']++;
    else if (ageDays <= 30) byAge['8-30']++;
    else if (ageDays <= 90) byAge['31-90']++;
    else byAge['>90']++;

    if (!isApproved && !isRejected && ageDays > oldestUnapprovedAgeDays) {
      oldestUnapprovedAgeDays = Math.round(ageDays);
    }
  }

  const unapproved = total - approvedYes - rejectedYes;

  let recommendation = `${total} posts pending.`;
  if (unapproved > 100 && oldestUnapprovedAgeDays > 30) {
    recommendation = `${unapproved} unapproved posts, oldest is ${oldestUnapprovedAgeDays} days old. Recommend bulk-cancelling everything older than 30 days (use \`mc-post bulk-cancel --older-than 30\`) so the queue is fresh content only.`;
  } else if (unapproved > 0) {
    recommendation = `${unapproved} unapproved posts waiting (${approvedYes} already approved, ${rejectedYes} rejected). Review with \`mc-post pending\`.`;
  } else {
    recommendation = `All ${total} pending posts have either been approved or rejected. Queue is clean.`;
  }

  return NextResponse.json({
    ok: true,
    total_pending: total,
    approved_pending: approvedYes,
    unapproved_pending: unapproved,
    rejected_in_queue: rejectedYes,
    by_source: bySource,
    by_age_days: byAge,
    oldest_unapproved_age_days: oldestUnapprovedAgeDays,
    recommendation,
  });
}
