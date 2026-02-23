/**
 * TikTok Research API client for fetching comment text.
 *
 * Uses client-credentials grant (separate from Content Posting API user tokens).
 * Requires TIKTOK_RESEARCH_CLIENT_KEY and TIKTOK_RESEARCH_CLIENT_SECRET env vars.
 * Degrades gracefully: if not configured, callers fall back to count-only mode.
 */

const TIKTOK_AUTH_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_COMMENTS_URL = 'https://open.tiktokapis.com/v2/research/video/comment/list/';

const RATE_LIMIT_DELAY = 200; // ms between paginated requests

interface TikTokComment {
  id: string;
  text: string;
  like_count: number;
  reply_count: number;
  parent_comment_id?: string;
  create_time: number;
}

interface CommentsPageResponse {
  data: {
    comments: Array<{
      id: string;
      text: string;
      like_count: number;
      reply_count: number;
      parent_comment_id?: string;
      create_time: number;
    }>;
    cursor: number;
    has_more: boolean;
  };
  error: {
    code: string;
    message: string;
  };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isConfigured(): boolean {
  return !!(process.env.TIKTOK_RESEARCH_CLIENT_KEY && process.env.TIKTOK_RESEARCH_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const clientKey = process.env.TIKTOK_RESEARCH_CLIENT_KEY!;
  const clientSecret = process.env.TIKTOK_RESEARCH_CLIENT_SECRET!;

  const res = await fetch(TIKTOK_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    throw new Error(`TikTok Research auth failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`TikTok Research auth: no access_token in response`);
  }

  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 7200) * 1000,
  };

  return cachedToken.token;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchAllComments(
  videoId: string,
  maxComments: number = 500
): Promise<TikTokComment[]> {
  if (!isConfigured()) {
    throw new Error('TikTok Research API not configured');
  }

  const accessToken = await getAccessToken();
  const allComments: TikTokComment[] = [];
  let cursor = 0;
  let hasMore = true;

  while (hasMore && allComments.length < maxComments) {
    const res = await fetch(TIKTOK_COMMENTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_id: videoId,
        max_count: Math.min(50, maxComments - allComments.length),
        cursor,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      // Rate limited — stop gracefully with what we have
      if (res.status === 429) {
        console.warn(`[tiktok-research] Rate limited at ${allComments.length} comments for video ${videoId}`);
        break;
      }
      throw new Error(`TikTok Research comments failed: ${res.status} ${body}`);
    }

    const json: CommentsPageResponse = await res.json();

    if (json.error?.code && json.error.code !== 'ok') {
      throw new Error(`TikTok Research API error: ${json.error.code} — ${json.error.message}`);
    }

    const comments = json.data?.comments || [];
    for (const c of comments) {
      allComments.push({
        id: c.id,
        text: c.text,
        like_count: c.like_count || 0,
        reply_count: c.reply_count || 0,
        parent_comment_id: c.parent_comment_id || undefined,
        create_time: c.create_time,
      });
    }

    hasMore = json.data?.has_more ?? false;
    cursor = json.data?.cursor ?? 0;

    if (hasMore) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  return allComments;
}
