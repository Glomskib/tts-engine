/**
 * Comment Miner — groups classified RI comments into content-worthy themes.
 *
 * Flow:
 * 1. Fetch classified comments from ri_comments + ri_comment_analysis
 * 2. Send to Claude for theme grouping
 * 3. Return structured themes with content angles
 *
 * Reuses existing RI classification data — no re-scraping needed.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logUsageEventAsync } from '@/lib/finops/log-usage';
import type { CommentTheme, ExampleComment, SuggestedAction, ThemeCategory, MineResult } from './types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

// ── Fetch classified comments ──

interface ClassifiedComment {
  id: string;
  comment_text: string;
  commenter_username: string;
  like_count: number;
  video_id: string;
  category: string;
  subcategory: string | null;
  lead_score: number;
  video_caption: string | null;
}

async function fetchClassifiedComments(userId: string, limit = 200): Promise<ClassifiedComment[]> {
  // Join ri_comments with ri_comment_analysis and ri_videos
  const { data: comments, error: commentError } = await supabaseAdmin
    .from('ri_comments')
    .select('id, comment_text, commenter_username, like_count, video_id')
    .eq('user_id', userId)
    .eq('is_processed', true)
    .eq('is_reply', false) // Top-level comments only
    .not('platform_comment_id', 'like', 'sim_%')
    .order('ingested_at', { ascending: false })
    .limit(limit);

  if (commentError || !comments || comments.length === 0) {
    return [];
  }

  const commentIds = comments.map(c => c.id);
  const videoIds = [...new Set(comments.map(c => c.video_id))];

  // Fetch analyses and video metadata in parallel
  const [analysesRes, videosRes] = await Promise.all([
    supabaseAdmin
      .from('ri_comment_analysis')
      .select('comment_id, category, subcategory, lead_score')
      .in('comment_id', commentIds),
    supabaseAdmin
      .from('ri_videos')
      .select('id, caption')
      .in('id', videoIds),
  ]);

  const analysisMap = new Map<string, { category: string; subcategory: string | null; lead_score: number }>();
  for (const a of analysesRes.data || []) {
    analysisMap.set(a.comment_id, a);
  }

  const videoMap = new Map<string, string | null>();
  for (const v of videosRes.data || []) {
    videoMap.set(v.id, v.caption);
  }

  return comments
    .filter(c => analysisMap.has(c.id))
    .map(c => {
      const analysis = analysisMap.get(c.id)!;
      return {
        ...c,
        category: analysis.category,
        subcategory: analysis.subcategory,
        lead_score: analysis.lead_score,
        video_caption: videoMap.get(c.video_id) ?? null,
      };
    });
}

// ── Theme generation prompt ──

function buildMiningPrompt(comments: ClassifiedComment[]): string {
  const commentBlock = comments
    .map((c, i) => `[${i + 1}] category=${c.category} likes=${c.like_count} user=@${c.commenter_username}: "${c.comment_text}"`)
    .join('\n');

  return `You are a content strategist for a short-form video creator.

Analyze these ${comments.length} comments from the creator's TikTok videos and group them into CONTENT THEMES — recurring questions, objections, requests, or patterns worth making content about.

RULES:
1. Each theme should represent 2+ comments saying roughly the same thing
2. Themes should be actionable — a creator should be able to make a video from each one
3. Order by opportunity_score (highest first)
4. Return 3-8 themes max (only the most useful)
5. Do NOT create generic themes. Bad: "People have questions." Good: "Does this actually work long-term?"
6. Each theme needs a content_angle — one sentence describing what video to make

CATEGORIES:
- question: People keep asking this (FAQ-worthy)
- objection: Pushback or skepticism worth addressing
- request: "Can you do X / show us Y"
- pain_point: Frustration people share that your content can solve
- praise_pattern: What people love — reusable angle for future content
- controversy: Divisive takes worth a reply video

For each theme, suggest 1-3 actions from:
- reply_video: "Make a reply video"
- hook: "Turn into a hook"
- script: "Write a full script"
- content_pack: "Build a content pack"
- comment_reply: "Write reply comments"

Return ONLY a JSON array:
[{
  "theme": "string — the question/objection/pattern in natural language",
  "category": "question|objection|request|pain_point|praise_pattern|controversy",
  "comment_indexes": [1, 4, 7],
  "content_angle": "string — what video to make from this",
  "opportunity_score": 0-100,
  "suggested_actions": [{"type": "reply_video", "label": "Make a reply video"}]
}]

COMMENTS:
${commentBlock}`;
}

// ── Parse response ──

interface RawTheme {
  theme: string;
  category: string;
  comment_indexes: number[];
  content_angle: string;
  opportunity_score: number;
  suggested_actions: SuggestedAction[];
}

function parseThemes(raw: string, comments: ClassifiedComment[]): Omit<CommentTheme, 'id' | 'user_id' | 'created_at' | 'dismissed'>[] {
  let cleaned = raw.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) cleaned = jsonMatch[1].trim();

  const parsed: RawTheme[] = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return [];

  const validCategories: ThemeCategory[] = ['question', 'objection', 'request', 'pain_point', 'praise_pattern', 'controversy'];

  return parsed
    .filter(t => t.theme && t.content_angle && typeof t.opportunity_score === 'number')
    .map(t => {
      const indexes = (t.comment_indexes || []).map(i => i - 1).filter(i => i >= 0 && i < comments.length);
      const exampleComments: ExampleComment[] = indexes.slice(0, 5).map(i => ({
        text: comments[i].comment_text,
        username: comments[i].commenter_username,
        like_count: comments[i].like_count,
      }));

      const sourceVideoIds = [...new Set(indexes.map(i => comments[i].video_id))];

      return {
        theme: t.theme,
        category: (validCategories.includes(t.category as ThemeCategory) ? t.category : 'question') as ThemeCategory,
        comment_count: indexes.length,
        example_comments: exampleComments,
        content_angle: t.content_angle,
        suggested_actions: (t.suggested_actions || []).filter(a => a.type && a.label),
        opportunity_score: Math.max(0, Math.min(100, t.opportunity_score)),
        source_video_ids: sourceVideoIds,
      };
    })
    .sort((a, b) => b.opportunity_score - a.opportunity_score);
}

// ── Main mining function ──

export async function mineComments(userId: string): Promise<MineResult> {
  const comments = await fetchClassifiedComments(userId);

  if (comments.length === 0) {
    return { themes: [], total_comments_analyzed: 0, source_videos: 0 };
  }

  const sourceVideos = new Set(comments.map(c => c.video_id)).size;

  // Call Claude for theme grouping
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const prompt = buildMiningPrompt(comments);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    throw new Error(`Claude API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  logUsageEventAsync({
    source: 'flashflow', lane: 'FlashFlow', provider: 'anthropic', model: MODEL,
    input_tokens: inputTokens, output_tokens: outputTokens,
    user_id: userId, endpoint: '/api/comment-miner/mine', template_key: 'comment_miner_themes', agent_id: 'flash',
  });

  const parsedThemes = parseThemes(text, comments);

  // Persist themes
  const now = new Date().toISOString();
  const themesToInsert = parsedThemes.map(t => ({
    user_id: userId,
    theme: t.theme,
    category: t.category,
    comment_count: t.comment_count,
    example_comments: t.example_comments,
    content_angle: t.content_angle,
    suggested_actions: t.suggested_actions,
    opportunity_score: t.opportunity_score,
    source_video_ids: t.source_video_ids,
    dismissed: false,
  }));

  let savedThemes: CommentTheme[] = [];
  if (themesToInsert.length > 0) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('comment_themes')
      .insert(themesToInsert)
      .select('*');

    if (insertError) {
      console.error('[comment-miner] Failed to save themes:', insertError.message);
      // Still return the themes even if save fails
      savedThemes = parsedThemes.map((t, i) => ({
        ...t,
        id: `unsaved-${i}`,
        user_id: userId,
        dismissed: false,
        created_at: now,
      }));
    } else {
      savedThemes = (inserted || []) as CommentTheme[];
    }
  }

  return {
    themes: savedThemes,
    total_comments_analyzed: comments.length,
    source_videos: sourceVideos,
  };
}
