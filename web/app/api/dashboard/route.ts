/**
 * GET /api/dashboard
 *
 * Single endpoint that returns all data for the Creator Command Center.
 * Returns: nextActions, pipelineCounts, todayAssignments, winners
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId } from '@/lib/api-errors';
import { getNextAction } from '@/lib/videos/nextAction';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const auth = await getApiAuthContext(request);

  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Fetch all non-terminal videos for pipeline counts and next actions
    const { data: videos, error: videosError } = await supabaseAdmin
      .from('videos')
      .select(`
        id, status, recording_status, google_drive_url,
        script_locked_text, product_id, final_video_url,
        posted_url, posting_meta, created_at,
        concept:concept_id (title, core_angle),
        product:product_id (name, brand)
      `)
      .not('status', 'eq', 'archived')
      .order('created_at', { ascending: true });

    if (videosError) {
      console.error('Dashboard videos query error:', videosError);
      return NextResponse.json({ ok: false, error: 'Failed to load dashboard data' }, { status: 500 });
    }

    const allVideos = videos || [];

    // --- Pipeline Counts ---
    const pipelineCounts = {
      draft: 0,
      needs_edit: 0,
      ready_to_post: 0,
      posted: 0,
      failed: 0,
      total: allVideos.length,
    };

    // Sub-counts for recording status within draft
    const recordingCounts = {
      not_recorded: 0,
      recorded: 0,
      ai_rendering: 0,
      edited: 0,
    };

    for (const v of allVideos) {
      if (v.status in pipelineCounts) {
        pipelineCounts[v.status as keyof typeof pipelineCounts]++;
      }
      if (v.status === 'draft') {
        const rs = (v.recording_status || 'NOT_RECORDED').toUpperCase();
        if (rs === 'NOT_RECORDED') recordingCounts.not_recorded++;
        else if (rs === 'RECORDED') recordingCounts.recorded++;
        else if (rs === 'AI_RENDERING') recordingCounts.ai_rendering++;
        else if (rs === 'EDITED') recordingCounts.edited++;
      }
    }

    // Count posted this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const postedThisWeek = allVideos.filter(
      v => v.status === 'posted' && v.created_at && new Date(v.created_at) >= weekAgo
    ).length;

    // --- Next Actions ---
    // Find one video per action type for the Action Center
    const actionTypes = ['record', 'upload', 'edit', 'review_edit', 'post', 'generate_post_package'] as const;
    const nextActions: Array<{
      action: string;
      video: {
        id: string;
        title: string;
        product: string | null;
        status: string;
      };
    }> = [];

    const seenActions = new Set<string>();

    for (const v of allVideos) {
      const next = getNextAction(v);
      if (!seenActions.has(next.action) && actionTypes.includes(next.action as (typeof actionTypes)[number])) {
        seenActions.add(next.action);
        const concept = v.concept as { title?: string; core_angle?: string } | null;
        const product = v.product as { name?: string; brand?: string } | null;
        nextActions.push({
          action: next.action,
          video: {
            id: v.id,
            title: concept?.title || concept?.core_angle || `Video ${v.id.slice(0, 8)}`,
            product: product?.name || null,
            status: v.status,
          },
        });
      }
      if (nextActions.length >= 4) break;
    }

    // --- Today's Assignments ---
    // Videos that are ready_to_post (scheduled for today or next up)
    const todayAssignments = allVideos
      .filter(v => v.status === 'ready_to_post' || v.status === 'needs_edit')
      .slice(0, 5)
      .map(v => {
        const concept = v.concept as { title?: string; core_angle?: string } | null;
        const product = v.product as { name?: string; brand?: string } | null;
        const next = getNextAction(v);
        return {
          id: v.id,
          title: concept?.title || concept?.core_angle || `Video ${v.id.slice(0, 8)}`,
          product: product?.name || null,
          brand: product?.brand || null,
          status: v.status,
          recording_status: v.recording_status,
          nextAction: next.label,
        };
      });

    // --- Winners ---
    let winners: Array<{
      id: string;
      hook: string | null;
      view_count: number | null;
      content_format: string | null;
      product_category: string | null;
    }> = [];

    try {
      const { data: winnerData } = await supabaseAdmin
        .from('winners_bank')
        .select('id, hook, view_count, content_format, product_category')
        .order('view_count', { ascending: false, nullsFirst: false })
        .limit(3);
      winners = winnerData || [];
    } catch {
      // winners_bank might not exist in all environments
    }

    return NextResponse.json({
      ok: true,
      nextActions,
      pipelineCounts: {
        ...pipelineCounts,
        recording: recordingCounts,
        posted_this_week: postedThisWeek,
      },
      todayAssignments,
      winners,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error('GET /api/dashboard error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
