/**
 * GET /api/cron/hhh-daily-content
 *
 * Runs daily at 7 AM ET via Vercel cron. Generates tomorrow's HHH FB post,
 * stores it in marketing_posts as a pending draft, optionally pings Brandon
 * via Telegram for one-tap approval. On approval (via /api/marketing/posts/:id/approve),
 * the post fires to Late.dev for 5 PM ET publishing.
 *
 * Idempotent: skips if a post already exists for tomorrow's date.
 *
 * Configure in vercel.json:
 *   { "path": "/api/cron/hhh-daily-content", "schedule": "0 11 * * *" }  // 11 UTC = 7 AM ET
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const maxDuration = 90;

const HHH_BRIEF = `# HHH 2026 — facts the generator needs

EVENT: Hancock Horizontal Hundred — 51st annual — Saturday September 12, 2026 — 7:15 AM start — 721 W Hardin St, Findlay OH (single venue, start + finish + party)
DISTANCES: 100mi (full century) / 62mi (metric) / 30mi / 15mi (FREE family/tour)
HOSTED BY: Making Miles Matter, a 501(c)(3)

HERITAGE
- Originally run by the Hancock Handlebars Bicycle Club for 50+ years before they closed
- Making Miles Matter revived the ride in 2025 (year one drew 202 riders)
- 2026 is the 51st running — continuity, not a startup
- Flat Hancock County farmland — "Horizontal" is the terrain AND the inclusive value

CONFIRMED PARTNERS (only mention these — no others)
- Blanchard Valley Health System (BVHS) — Silver sponsor
- Hancock Hotel — room block for out-of-area riders
- False Chord Brewing — beer tent + Saturday shop ride host year-round
- Arlyns Brewery (Bowling Green) — FFF turnaround partner
- Tiger Lilly — pre-ride breakfast morning of Sept 12
- PT Link Findlay — physical therapists on-site morning of Sept 12

DAY-OF UNIQUE FEATURES
- Tiger Lilly serving pre-ride breakfast (6 AM)
- PT Link doing pre-ride mobility checks (6 AM)
- 4-station check-in (no more 30-minute lines)
- 4 rest stops with captains (Vanlue, Van Buren lunch, Ottawa, Rawson)
- 2 SAG vehicles roaming
- Finish-line: False Chord beer tent, live music, $500+ raffle drawing 7 PM
- Raffle proceeds: St. Jude + Van Buren Mountain Bike Trail Project

CONTACT
- All MMM communication uses miles@makingmilesmatter.com
- Registration: hancockhorizontalhundred.com
- Volunteer: makingmilesmatter.org/hhh/volunteer

VOICE
- Direct, real, vulnerable about 2025's mistakes, confident about 2026's plan
- Not a hype-pitch, not corporate
- "Findlay's hometown ride" energy
- Inclusive — first-timers feel welcome, veterans feel respected
`;

// Rotate post types by day-of-week so the rhythm stays interesting
const POST_TYPE_BY_DAY: Record<number, string> = {
  0: 'voice',           // Sunday
  1: 'heritage',        // Monday
  2: 'partner-spotlight', // Tuesday
  3: 'educational',     // Wednesday
  4: 'sponsor-call',    // Thursday
  5: 'volunteer-call',  // Friday
  6: 'community',       // Saturday
};

interface GeneratedPost {
  hook: string;
  facebook_post: string;
  image_suggestion: string;
  hashtags: string[];
  cta_label: string;
  cta_url: string;
}

async function generatePost(targetDate: Date, postType: string, exclusionTopics: string[]): Promise<GeneratedPost> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const prompt = `You are a social media director for Making Miles Matter, a 501(c)(3) running the Hancock Horizontal Hundred (HHH) 2026 cycling event in Findlay, Ohio.

Generate ONE Facebook post for ${targetDate.toISOString().slice(0, 10)} (a ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][targetDate.getDay()]}).

POST TYPE: ${postType}

REQUIREMENTS:
1. Write in Brandon's voice (warm, real, occasionally vulnerable, never hype-y)
2. End with a clear CTA pointing to one of: hancockhorizontalhundred.com (register) | makingmilesmatter.org/hhh/volunteer (volunteer) | miles@makingmilesmatter.com (sponsor)
3. Suggest a specific photo (not generic)
4. Suggest 4-7 hashtags relevant to Findlay/Ohio cycling/HHH
5. Length 60-180 words
6. Reference real partners only: BVHS, Hancock Hotel, False Chord, Arlyns, Tiger Lilly, PT Link Findlay
7. Use heritage hooks where natural ("for 50 years", "Hancock Handlebars", "51st annual")
8. Do NOT repeat these recent topics: ${exclusionTopics.length ? exclusionTopics.join(', ') : '(none)'}

OUTPUT — strict JSON, no markdown fences:
{
  "hook": "the 1-line attention grabber",
  "facebook_post": "the full body, 60-180 words",
  "image_suggestion": "specific photo idea",
  "hashtags": ["#tag1", "#tag2", ...],
  "cta_label": "Register|Volunteer|Sponsor",
  "cta_url": "https://..."
}

REFERENCE BRIEF (facts only):
${HHH_BRIEF}`;

  const completion = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = completion.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(jsonText);
}

export async function GET(req: Request) {
  // Vercel cron auth — checks for x-vercel-cron header OR allows MISSION_CONTROL_TOKEN
  const cronAuth = req.headers.get('x-vercel-cron') === '1';
  const tokenAuth = req.headers.get('authorization') === `Bearer ${process.env.MISSION_CONTROL_TOKEN || ''}`;
  if (!cronAuth && !tokenAuth) {
    return NextResponse.json({ error: 'Unauthorized — Vercel cron only' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 503 });
  }

  // Target = tomorrow at 5 PM ET (peak FB engagement time)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(17, 0, 0, 0);
  const targetDateIso = tomorrow.toISOString().slice(0, 10);

  // Idempotency check — skip if a post for tomorrow already exists
  const { data: existing } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, status')
    .eq('meta->>scheduled_for_date', targetDateIso)
    .eq('meta->>source', 'hhh-daily-cron')
    .maybeSingle()
    .catch(() => ({ data: null }));

  if (existing) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'post for tomorrow already exists',
      post_id: existing.id,
      status: existing.status,
    });
  }

  // Pull last 7 days of HHH topics so we don't repeat
  const { data: recent } = await supabaseAdmin
    .from('marketing_posts')
    .select('meta')
    .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
    .eq('brand', 'Making Miles Matter')
    .order('created_at', { ascending: false })
    .limit(7);

  const recentTopics = (recent || [])
    .map((r) => (r.meta as Record<string, unknown> | null)?.hook)
    .filter((h): h is string => typeof h === 'string')
    .slice(0, 5);

  const postType = POST_TYPE_BY_DAY[tomorrow.getDay()];

  // Generate
  let post: GeneratedPost;
  try {
    post = await generatePost(tomorrow, postType, recentTopics);
  } catch (err) {
    console.error('[hhh-daily-cron] generation failed', err);
    return NextResponse.json(
      { ok: false, error: 'generation failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // Insert as pending — status='pending' means awaiting approval before Late.dev
  const fullText = `${post.facebook_post}\n\n${(post.hashtags || []).join(' ')}`;
  const { data: row, error } = await supabaseAdmin
    .from('marketing_posts')
    .insert({
      content: fullText,
      brand: 'Making Miles Matter',
      platforms: ['facebook'],
      status: 'pending',
      scheduled_for: tomorrow.toISOString(),
      source: 'hhh-daily-cron',
      meta: {
        post_type: postType,
        hook: post.hook,
        image_suggestion: post.image_suggestion,
        cta_label: post.cta_label,
        cta_url: post.cta_url,
        scheduled_for_date: targetDateIso,
        source: 'hhh-daily-cron',
        generated_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (error || !row) {
    return NextResponse.json({ ok: false, error: error?.message || 'insert failed' }, { status: 500 });
  }

  // Optional: Telegram nudge to Brandon for approval
  let telegramSent = false;
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_BRANDON_CHAT_ID;
  if (tgToken && tgChat) {
    const preview = post.facebook_post.slice(0, 250);
    const tgMessage = `🚴 HHH post for tomorrow (${targetDateIso}) — ${postType}\n\n${preview}${post.facebook_post.length > 250 ? '…' : ''}\n\nApprove: https://flashflowai.com/admin/marketing/queue`;
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChat,
          text: tgMessage,
          parse_mode: 'Markdown',
        }),
      });
      telegramSent = tgRes.ok;
    } catch (err) {
      console.error('[hhh-daily-cron] telegram send failed', err);
    }
  }

  return NextResponse.json({
    ok: true,
    post_id: row.id,
    scheduled_for: tomorrow.toISOString(),
    post_type: postType,
    hook: post.hook,
    telegram_notified: telegramSent,
    next_step: telegramSent
      ? 'Brandon receives Telegram, approves, post fires to Late.dev at 5 PM ET'
      : 'Brandon reviews at /admin/marketing/queue and approves manually',
  });
}
