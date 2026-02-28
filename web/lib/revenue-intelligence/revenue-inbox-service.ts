/**
 * Revenue Intelligence – Revenue Inbox Service
 *
 * Provides the query layer for the Inbox UI:
 * - Fetch enriched comments (comment + analysis + drafts + status)
 * - Filter by status, category, urgency, lead score
 * - Update comment status (unread → reviewed → resolved)
 * - Get dashboard stats
 *
 * By default, simulation rows (platform_comment_id like 'sim_%') are excluded.
 * Pass includeSimulation: true to include them.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logAndTime } from './agent-logger';
import { SIM_COMMENT_PATTERN } from './simulation-filter';
import type {
  InboxComment,
  InboxFilters,
  RevenueModeItem,
  RiComment,
  RiCommentAnalysis,
  RiCommentStatus,
  RiReplyDraft,
  RiVideo,
  RiCommentStatusValue,
} from './types';

const TAG = '[ri:inbox]';

// ── Inbox query ────────────────────────────────────────────────

export async function getInboxComments(
  filters: InboxFilters,
): Promise<{ items: InboxComment[]; total: number }> {
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  const includeSim = filters.includeSimulation ?? false;

  // Build base query for comment IDs with filters
  let query = supabaseAdmin
    .from('ri_comments')
    .select('id', { count: 'exact' })
    .eq('user_id', filters.user_id)
    .eq('is_processed', true);

  // Exclude simulation rows by default
  if (!includeSim) {
    query = query.not('platform_comment_id', 'like', SIM_COMMENT_PATTERN);
  }

  const { data: commentRows, count, error } = await query
    .order('ingested_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !commentRows) {
    console.error(`${TAG} Inbox query failed:`, error?.message);
    return { items: [], total: 0 };
  }

  const commentIds = commentRows.map((r) => r.id);
  if (commentIds.length === 0) {
    return { items: [], total: count ?? 0 };
  }

  // Batch-fetch all related data
  const [commentsRes, analysesRes, draftsRes, statusesRes] = await Promise.all([
    supabaseAdmin
      .from('ri_comments')
      .select('*')
      .in('id', commentIds)
      .order('ingested_at', { ascending: false }),
    supabaseAdmin
      .from('ri_comment_analysis')
      .select('*')
      .in('comment_id', commentIds),
    supabaseAdmin
      .from('ri_reply_drafts')
      .select('*')
      .in('comment_id', commentIds),
    supabaseAdmin
      .from('ri_comment_status')
      .select('*')
      .in('comment_id', commentIds),
  ]);

  const comments = (commentsRes.data ?? []) as RiComment[];
  const analyses = (analysesRes.data ?? []) as RiCommentAnalysis[];
  const drafts = (draftsRes.data ?? []) as RiReplyDraft[];
  const statuses = (statusesRes.data ?? []) as RiCommentStatus[];

  // Fetch videos
  const videoIds = Array.from(new Set(comments.map((c) => c.video_id)));
  const { data: videoRows } = await supabaseAdmin
    .from('ri_videos')
    .select('*')
    .in('id', videoIds);
  const videos = (videoRows ?? []) as RiVideo[];

  // Build lookup maps
  const analysisMap = new Map<string, RiCommentAnalysis>();
  for (const a of analyses) analysisMap.set(a.comment_id, a);

  const draftsMap = new Map<string, RiReplyDraft[]>();
  for (const d of drafts) {
    const arr = draftsMap.get(d.comment_id) ?? [];
    arr.push(d);
    draftsMap.set(d.comment_id, arr);
  }

  const statusMap = new Map<string, RiCommentStatus>();
  for (const s of statuses) statusMap.set(s.comment_id, s);

  const videoMap = new Map<string, RiVideo>();
  for (const v of videos) videoMap.set(v.id, v);

  // Assemble inbox items
  let items: InboxComment[] = comments.map((comment) => ({
    comment,
    video: videoMap.get(comment.video_id)!,
    analysis: analysisMap.get(comment.id) ?? null,
    drafts: draftsMap.get(comment.id) ?? [],
    status: statusMap.get(comment.id) ?? {
      id: '',
      comment_id: comment.id,
      status: 'unread' as const,
      flagged_urgent: false,
      resolved_by: null,
      resolved_at: null,
      notes: null,
      created_at: comment.ingested_at,
      updated_at: comment.ingested_at,
    },
  }));

  // Apply in-memory filters that require joined data
  if (filters.status) {
    items = items.filter((i) => i.status.status === filters.status);
  }
  if (filters.flagged_urgent !== undefined) {
    items = items.filter((i) => i.status.flagged_urgent === filters.flagged_urgent);
  }
  if (filters.category) {
    items = items.filter((i) => i.analysis?.category === filters.category);
  }
  if (filters.min_lead_score !== undefined) {
    items = items.filter(
      (i) => (i.analysis?.lead_score ?? 0) >= filters.min_lead_score!,
    );
  }

  return { items, total: count ?? 0 };
}

// ── Update comment status ──────────────────────────────────────

export async function updateCommentStatus(
  commentId: string,
  status: RiCommentStatusValue,
  resolvedBy?: string,
  notes?: string,
): Promise<boolean> {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'resolved') {
    update.resolved_at = new Date().toISOString();
    if (resolvedBy) update.resolved_by = resolvedBy;
  }
  if (notes !== undefined) {
    update.notes = notes;
  }

  const { error } = await supabaseAdmin
    .from('ri_comment_status')
    .update(update)
    .eq('comment_id', commentId);

  if (error) {
    console.error(`${TAG} Status update failed:`, error.message);
    return false;
  }
  return true;
}

// ── Dashboard stats ────────────────────────────────────────────

export interface InboxStats {
  total_comments: number;
  unread: number;
  urgent: number;
  high_intent: number;
  categories: Record<string, number>;
  avg_lead_score: number;
}

export async function getInboxStats(
  userId: string,
  opts?: { includeSimulation?: boolean },
): Promise<InboxStats> {
  const includeSim = opts?.includeSimulation ?? false;

  // Step 1: get user's processed comment IDs
  let query = supabaseAdmin
    .from('ri_comments')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('is_processed', true);

  if (!includeSim) {
    query = query.not('platform_comment_id', 'like', SIM_COMMENT_PATTERN);
  }

  const commentsRes = await query;

  const total = commentsRes.count ?? 0;
  const commentIds = (commentsRes.data ?? []).map((c) => c.id);

  if (commentIds.length === 0) {
    return { total_comments: 0, unread: 0, urgent: 0, high_intent: 0, categories: {}, avg_lead_score: 0 };
  }

  // Step 2: fetch statuses and analyses for those IDs
  const [statusRes, analysisRes] = await Promise.all([
    supabaseAdmin
      .from('ri_comment_status')
      .select('status, flagged_urgent, comment_id')
      .in('comment_id', commentIds),
    supabaseAdmin
      .from('ri_comment_analysis')
      .select('category, lead_score, comment_id')
      .in('comment_id', commentIds),
  ]);

  const statuses = statusRes.data ?? [];
  const userAnalyses = analysisRes.data ?? [];

  const unread = statuses.filter((s) => s.status === 'unread').length;
  const urgent = statuses.filter((s) => s.flagged_urgent).length;
  const highIntent = userAnalyses.filter((a) => a.lead_score >= 70).length;

  const categories: Record<string, number> = {};
  let totalScore = 0;
  for (const a of userAnalyses) {
    categories[a.category] = (categories[a.category] ?? 0) + 1;
    totalScore += a.lead_score;
  }

  return {
    total_comments: total,
    unread,
    urgent,
    high_intent: highIntent,
    categories,
    avg_lead_score: userAnalyses.length > 0 ? Math.round(totalScore / userAnalyses.length) : 0,
  };
}

// ── Revenue Mode Inbox ────────────────────────────────────────

const REVENUE_CATEGORIES = ['buying_intent', 'objection'] as const;

/**
 * Fetch high-intent comments for Revenue Mode.
 * Filters to buying_intent + objection categories with lead_score >= threshold,
 * ordered by urgency then lead score then recency.
 */
export async function getRevenueModeInbox({
  userId,
  minLeadScore = 70,
  includeSimulation = false,
  limit,
}: {
  userId: string;
  minLeadScore?: number;
  includeSimulation?: boolean;
  limit?: number;
}): Promise<RevenueModeItem[]> {
  // Step 1: Get qualifying analyses
  const { data: analyses, error: aErr } = await supabaseAdmin
    .from('ri_comment_analysis')
    .select('comment_id, category, lead_score, urgency_score')
    .in('category', [...REVENUE_CATEGORIES])
    .gte('lead_score', minLeadScore);

  if (aErr || !analyses || analyses.length === 0) {
    if (aErr) console.error(`${TAG} Revenue mode analysis query failed:`, aErr.message);
    return [];
  }

  const qualifiedIds = analyses.map((a) => a.comment_id);

  // Step 2: Fetch matching comments
  let commentsQuery = supabaseAdmin
    .from('ri_comments')
    .select('id, commenter_username, comment_text, platform_comment_id, ingested_at, video_id')
    .eq('user_id', userId)
    .in('id', qualifiedIds);

  if (!includeSimulation) {
    commentsQuery = commentsQuery.not('platform_comment_id', 'like', SIM_COMMENT_PATTERN);
  }

  const { data: comments, error: cErr } = await commentsQuery;
  if (cErr || !comments || comments.length === 0) {
    if (cErr) console.error(`${TAG} Revenue mode comments query failed:`, cErr.message);
    return [];
  }

  const commentIds = comments.map((c) => c.id);

  // Step 3: Batch-fetch statuses, drafts, and videos
  const videoIds = Array.from(new Set(comments.map((c) => c.video_id)));

  const [statusRes, draftsRes, videosRes] = await Promise.all([
    supabaseAdmin
      .from('ri_comment_status')
      .select('comment_id, status')
      .in('comment_id', commentIds),
    supabaseAdmin
      .from('ri_reply_drafts')
      .select('comment_id, tone, draft_text')
      .in('comment_id', commentIds),
    supabaseAdmin
      .from('ri_videos')
      .select('id, video_url')
      .in('id', videoIds),
  ]);

  const statusMap = new Map<string, RiCommentStatusValue>();
  for (const s of statusRes.data ?? []) {
    statusMap.set(s.comment_id, s.status as RiCommentStatusValue);
  }

  const draftsMap = new Map<string, { neutral?: string; friendly?: string; conversion?: string }>();
  for (const d of draftsRes.data ?? []) {
    const existing = draftsMap.get(d.comment_id) ?? {};
    existing[d.tone as 'neutral' | 'friendly' | 'conversion'] = d.draft_text;
    draftsMap.set(d.comment_id, existing);
  }

  const videoUrlMap = new Map<string, string | null>();
  for (const v of videosRes.data ?? []) {
    videoUrlMap.set(v.id, v.video_url);
  }

  const analysisMap = new Map<string, { category: string; lead_score: number; urgency_score: number }>();
  for (const a of analyses) {
    analysisMap.set(a.comment_id, a);
  }

  // Step 4: Assemble + sort
  const items: RevenueModeItem[] = [];
  for (const c of comments) {
    const a = analysisMap.get(c.id);
    if (!a) continue;

    items.push({
      commentId: c.id,
      commenterUsername: c.commenter_username,
      commentText: c.comment_text,
      category: a.category as RevenueModeItem['category'],
      leadScore: a.lead_score,
      urgencyScore: a.urgency_score,
      status: statusMap.get(c.id) ?? null,
      videoUrl: videoUrlMap.get(c.video_id) ?? null,
      ingestedAt: c.ingested_at,
      drafts: draftsMap.get(c.id) ?? {},
    });
  }

  items.sort((a, b) => {
    if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore;
    if (b.leadScore !== a.leadScore) return b.leadScore - a.leadScore;
    return 0; // ingested_at already handled by DB order
  });

  if (limit !== undefined && limit > 0) {
    return items.slice(0, limit);
  }

  return items;
}
