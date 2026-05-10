/**
 * /api/marketing/hhh-generate-week — Generate a week of HHH 2026 Facebook posts
 *
 * POST: produces 7 (or N) FB-ready posts grounded in the HHH 2026 master brief.
 * Returns posts as structured JSON ready to paste into /api/marketing/enqueue.
 *
 * The generator knows:
 *   - Event identity (51st annual, Sept 12 2026, Findlay OH, 4 distances)
 *   - Confirmed partners (BVHS, Hancock Hotel, False Chord, Arlyns, Tiger Lilly, PT Link)
 *   - Heritage angle (Hancock Handlebars, 50+ years)
 *   - 2025 actuals (202 riders) and 2026 targets (400-500)
 *   - Sponsor tiers + open slots
 *   - Day-of differentiators (Tiger Lilly breakfast, PT Link mobility checks, raffle, beer tent)
 *
 * It rotates through post types so a week doesn't get monotonous:
 *   - Heritage (the 50-year story, Hancock Handlebars throwbacks)
 *   - Spotlight (one partner, one volunteer, one rider's reason)
 *   - Educational (route info, what to bring, training tips)
 *   - Recruitment (volunteer call, sponsor call, register-by deadline)
 *   - Community (shop ride recap, raffle update, ride-day countdown)
 *   - Behind-the-scenes (Brandon's voice, MMM mission, prep work)
 *
 * Body: {
 *   start_date?: string ISO (defaults to next Monday),
 *   count?: number (default 7),
 *   tones?: string[] (default warm, real, occasionally vulnerable),
 *   exclude_topics?: string[] (post topics from prior weeks to not repeat),
 * }
 *
 * Returns: {
 *   ok: true,
 *   week_start: string,
 *   posts: [{
 *     date: string ISO,
 *     post_type: string,
 *     hook: string,
 *     facebook_post: string,    // ready to publish
 *     image_suggestion: string, // what photo to attach
 *     hashtags: string[],
 *     cta: { label: string, url: string },
 *     enqueue_payload: object,  // copy-paste into /api/marketing/enqueue
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { generateRunId } from '@/lib/marketing/queue';
import { requireOwner } from '@/lib/command-center/owner-guard';

export const runtime = 'nodejs';
export const maxDuration = 90;

const HHH_BRIEF = `# HHH 2026 — facts the generator needs

EVENT
- Hancock Horizontal Hundred — 51st annual
- Saturday, September 12, 2026 — 7:15 AM start
- 721 W Hardin St, Findlay OH (single venue, start + finish + party)
- Distances: 100mi (full century) / 62mi (metric) / 30mi / 15mi (FREE family/tour)
- Hosted by Making Miles Matter, a 501(c)(3)

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

2026 TARGETS
- 400-500 riders (vs 202 in 2025)
- 30+ volunteers (vs 3 in 2025)
- $5,000+ sponsor revenue (vs $750 in 2025)
- Net positive +$5K-$20K (vs -$1.6K in 2025)

SPONSOR PIPELINE OPEN SLOTS
- Spoke Life Cycles (Champion ~$1,000) - reaching out
- Findlay Brewing Company (Champion ~$1,000) - reaching out
- Reineke Family Dealerships (Presenting ~$2,500) - reaching out
- Findlay-Hancock County Community Foundation (Title ~$5,000) - reaching out
- BVHS upgrade ask: Silver -> Gold or Platinum

SPONSOR TIERS (Canonical 2026)
- Platinum $2,500 / Gold $1,000 / Silver $500 / Bronze $250 / In-kind varies

CONTACT
- All MMM communication uses miles@makingmilesmatter.com
- Registration: hancockhorizontalhundred.com
- Volunteer: makingmilesmatter.org/hhh/volunteer

VOICE
- Direct, real, vulnerable about 2025's mistakes, confident about 2026's plan
- Not a hype-pitch, not corporate
- "Findlay's hometown ride" energy
- Inclusive — first-timers feel welcome, veterans feel respected
- Uses Brandon's voice from his post-ride doc as reference

TEAM
- Brandon Glomski (director, marketing)
- Joshua Herod (logistics, routes)
- Timothy Brown (volunteers, experience)
`;

const POST_TYPES_ROTATION = [
  'heritage',       // 50-year story, Hancock Handlebars throwback
  'partner-spotlight', // one confirmed partner, why-they-matter
  'educational',    // route, training tip, what to bring
  'sponsor-call',   // open sponsor pitch
  'volunteer-call', // recruiting helpers
  'community',      // shop ride, raffle update, countdown
  'voice',          // Brandon's first-person, behind-the-scenes
];

interface PostGenerated {
  date: string;
  post_type: string;
  hook: string;
  facebook_post: string;
  image_suggestion: string;
  hashtags: string[];
  cta: { label: string; url: string };
  enqueue_payload: Record<string, unknown>;
}

function nextMonday(from: Date = new Date()): Date {
  const d = new Date(from);
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day; // Sunday → +1, otherwise → next Monday
  d.setDate(d.getDate() + diff);
  d.setHours(9, 0, 0, 0);
  return d;
}

function buildPrompt(opts: {
  weekStart: string;
  count: number;
  postTypes: string[];
  excludeTopics: string[];
}): string {
  return `You are a social media director for Making Miles Matter, a 501(c)(3) running the Hancock Horizontal Hundred (HHH) 2026 cycling event in Findlay, Ohio.

Generate ${opts.count} Facebook posts for the week starting ${opts.weekStart}. Each post type rotates so the week doesn't feel monotonous.

POST TYPE ROTATION FOR THIS WEEK (in order):
${opts.postTypes.map((t, i) => `Day ${i + 1}: ${t}`).join('\n')}

${opts.excludeTopics.length ? `\nDO NOT REPEAT THESE TOPICS (covered in prior weeks):\n${opts.excludeTopics.map(t => `- ${t}`).join('\n')}` : ''}

REQUIREMENTS for every post:
1. Write in Brandon's voice (warm, real, occasionally vulnerable, never hype-y)
2. End with a clear CTA pointing to one of:
   - hancockhorizontalhundred.com (register)
   - makingmilesmatter.org/hhh/volunteer (volunteer)
   - miles@makingmilesmatter.com (sponsor inquiry)
3. Suggest a photo to attach (be specific: "rider crossing a country road at sunrise" not "a cyclist")
4. Suggest 4-7 hashtags relevant to Findlay/Ohio cycling/HHH
5. Length 60-180 words for the body — long enough to mean something, short enough to read on a phone
6. Reference real partners only: BVHS, Hancock Hotel, False Chord, Arlyns, Tiger Lilly, PT Link Findlay
7. Use heritage hooks where natural ("for 50 years", "Hancock Handlebars", "51st annual")
8. Never invent stats or quotes — if specific numbers/quotes are needed, use the ones in the brief

OUTPUT FORMAT — strict JSON, no markdown fences, no commentary outside JSON:
{
  "posts": [
    {
      "post_type": "heritage|partner-spotlight|educational|sponsor-call|volunteer-call|community|voice",
      "hook": "the 1-line attention grabber that opens the post",
      "facebook_post": "the full post body, 60-180 words, Brandon's voice, ending with CTA URL or email",
      "image_suggestion": "specific photo idea, 1 sentence",
      "hashtags": ["#hashtag1", "#hashtag2", ...],
      "cta": { "label": "Register|Volunteer|Sponsor", "url": "https://..." }
    },
    ... ${opts.count} total
  ]
}

REFERENCE BRIEF (use this for facts only — do not paste into posts):
${HHH_BRIEF}
`;
}

export async function POST(req: NextRequest) {
  // Auth — owner OR MC token
  const serviceToken = process.env.MISSION_CONTROL_TOKEN;
  let authed = false;
  if (serviceToken) {
    const authHeader = req.headers.get('authorization');
    const serviceAuth = req.headers.get('x-service-token') || req.headers.get('x-mc-token');
    if (authHeader === `Bearer ${serviceToken}` || serviceAuth === serviceToken) {
      authed = true;
    }
  }
  if (!authed) {
    const ownerErr = await requireOwner(req);
    if (ownerErr) return ownerErr;
  }

  let body: {
    start_date?: string;
    count?: number;
    exclude_topics?: string[];
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body OK */
  }

  const startDate = body.start_date ? new Date(body.start_date) : nextMonday();
  if (isNaN(startDate.getTime())) {
    return NextResponse.json({ error: 'invalid start_date' }, { status: 400 });
  }
  const count = Math.min(Math.max(body.count ?? 7, 1), 14); // 1-14 posts max per call
  const excludeTopics = Array.isArray(body.exclude_topics) ? body.exclude_topics.slice(0, 50) : [];

  const postTypes = Array.from({ length: count }, (_, i) => POST_TYPES_ROTATION[i % POST_TYPES_ROTATION.length]);

  // Anthropic key — same one the rest of FF uses
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  const anthropic = new Anthropic({ apiKey });
  const weekStartIso = startDate.toISOString().slice(0, 10);

  const prompt = buildPrompt({
    weekStart: weekStartIso,
    count,
    postTypes,
    excludeTopics,
  });

  let parsed: { posts: Array<Omit<PostGenerated, 'date' | 'enqueue_payload'>> };
  try {
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = completion.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');
    // Trim any accidental markdown fence
    const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'generation failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  if (!parsed?.posts || !Array.isArray(parsed.posts) || parsed.posts.length === 0) {
    return NextResponse.json({ error: 'no posts generated' }, { status: 502 });
  }

  // Decorate each with date + enqueue_payload
  const runId = generateRunId('hhh-generate-week');
  const posts: PostGenerated[] = parsed.posts.slice(0, count).map((p, i) => {
    const postDate = new Date(startDate);
    postDate.setDate(postDate.getDate() + i);
    postDate.setHours(17, 0, 0, 0); // schedule at 5 PM ET — peak FB engagement window

    const facebookText = `${p.facebook_post}\n\n${(p.hashtags || []).join(' ')}`;

    return {
      date: postDate.toISOString(),
      post_type: p.post_type,
      hook: p.hook,
      facebook_post: p.facebook_post,
      image_suggestion: p.image_suggestion,
      hashtags: p.hashtags || [],
      cta: p.cta,
      enqueue_payload: {
        content: facebookText,
        brand: 'Making Miles Matter',
        platforms: ['facebook'],
        publishNow: false,
        source: 'hhh-content-generator',
        run_id: runId,
        meta: {
          post_type: p.post_type,
          hook: p.hook,
          image_suggestion: p.image_suggestion,
          scheduled_for: postDate.toISOString(),
        },
      },
    };
  });

  return NextResponse.json({
    ok: true,
    week_start: weekStartIso,
    count: posts.length,
    posts,
    run_id: runId,
    next_steps: [
      'Review posts in chat, edit anything Brandon would change',
      'POST each enqueue_payload to /api/marketing/enqueue (with publishNow=false → goes to draft queue for approval)',
      'Or set publishNow=true to fire to Late.dev directly',
    ],
  });
}
