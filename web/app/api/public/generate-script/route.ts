import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { PERSONAS } from "@/lib/personas";
import { logUsageEventAsync } from "@/lib/finops/log-usage";
import { cookies } from "next/headers";
import { fetchHookIntelligence, buildIntelligenceContext } from "@/lib/hooks/hook-intelligence";

export const runtime = "nodejs";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Rate limiting: cookie-based daily counter for anonymous, credit-based for auth
// ---------------------------------------------------------------------------

const ANON_DAILY_LIMIT = 3;
const FREE_DAILY_LIMIT = 5;

async function getDailyUsageFromCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>
): Promise<{ count: number; date: string }> {
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const raw = cookieStore.get("ff_gen_usage")?.value;
  if (!raw) return { count: 0, date: dateStr };

  try {
    const parsed = JSON.parse(raw);
    if (parsed.date === dateStr && typeof parsed.count === "number") {
      return { count: parsed.count, date: dateStr };
    }
  } catch {
    // ignore malformed cookie
  }
  return { count: 0, date: dateStr };
}

// In-memory IP rate limit (prevent burst abuse): 6 req/min
const ipBuckets = new Map<string, { count: number; windowStart: number }>();

function checkIpBurst(ip: string): boolean {
  const now = Date.now();
  const entry = ipBuckets.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    ipBuckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= 6) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries every 5 min
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, entry] of ipBuckets) {
    if (entry.windowStart < cutoff) ipBuckets.delete(key);
  }
}, 300_000);

// ---------------------------------------------------------------------------
// Simplified risk tier / persona prompt builders
// ---------------------------------------------------------------------------

const TIER_PROMPTS: Record<string, string> = {
  SAFE: "Keep humor mild, wholesome, and universally relatable. No edgy content. Suitable for all audiences.",
  BALANCED:
    "Humor can be sharper. Light teasing of common frustrations is OK. Mild exaggeration for comedy. Suitable for general social media.",
  SPICY:
    "High energy, bold comedic choices. Parody and satire encouraged. Self-aware humor about advertising tropes. Still no health claims or guarantees.",
};

// ---------------------------------------------------------------------------
// Platform-aware generation. Each profile changes hook length, pacing, captions,
// and CTA style so a script generated for "tiktok" feels native to TikTok and
// a script generated for "youtube_long" feels native to long-form YouTube.
// ---------------------------------------------------------------------------

type PlatformId =
  | "tiktok"
  | "reels"
  | "youtube_shorts"
  | "youtube_long"
  | "facebook_reels";

const VALID_PLATFORMS: PlatformId[] = [
  "tiktok",
  "reels",
  "youtube_shorts",
  "youtube_long",
  "facebook_reels",
];

const PLATFORM_PROFILES: Record<PlatformId, {
  label: string;
  aspect: string;
  durationGuidance: string;
  hookGuidance: string;
  captionGuidance: string;
  ctaGuidance: string;
  pacingGuidance: string;
  extras: string;
}> = {
  tiktok: {
    label: "TikTok",
    aspect: "9:16 vertical, 1080x1920",
    durationGuidance: "15–60 seconds total. Optimal sweet spot 22–35 seconds. Total spoken words ~60–80.",
    hookGuidance: "First 1–2 seconds is everything. Hook lands before any logo, brand reveal, or context. Lean into trend-aware language, oddly-specific observations, or pattern interrupts. The on-screen text overlay should pop within 0.5 seconds and create tension that's DIFFERENT from the spoken hook.",
    captionGuidance: "Burned-in captions across the full video, large readable type, ALL CAPS for punchlines, color callouts on key words. The spoken caption should match the audio. Use 2–3 line limit per caption frame.",
    ctaGuidance: "End with a comments-driven CTA when possible (\"comment X if you want…\", \"tell me below…\"). Comments boost reach more than likes on TikTok. Use \"Tap the orange cart\" only if the video links to TikTok Shop.",
    pacingGuidance: "Fast cuts every 1.5–3 seconds. Visual variety per beat. No static talking-head longer than 4 seconds without a cut, B-roll insert, or zoom.",
    extras: "Title-driven trends and sound trends matter — assume the user will pair this with a trending sound. Hook can reference current TikTok culture if it fits the persona.",
  },
  reels: {
    label: "Instagram Reels",
    aspect: "9:16 vertical, 1080x1920",
    durationGuidance: "15–60 seconds total. Optimal 18–30 seconds. Total spoken words ~55–75.",
    hookGuidance: "Reels viewers expect aesthetic + narrative cohesion. Hook in 1–2 seconds with a clear visual signal of what the video will give them. Less raw/chaotic than TikTok — more 'magazine cover' framing. On-screen text should be visually polished and short.",
    captionGuidance: "Captions burned-in, slightly more refined typography than TikTok. Use punctuation correctly. Hashtag bar in the post caption (not the video) — recommend 5–10 niche hashtags + 2 broad.",
    ctaGuidance: "Reels rewards SAVES and SHARES more than comments. End with a 'save for later if…' or 'send this to a friend who…' CTA. Avoid 'link in bio' as the only CTA — viewers won't click out.",
    pacingGuidance: "Smoother cuts than TikTok, slightly slower (cuts every 2–4 seconds). Maintain visual consistency — same angle/lighting helps Reels' aesthetic prioritization.",
    extras: "Reels viewers swipe quickly. The first 3 seconds determine whether they swipe past. End with a loop-back if the format allows (e.g., the last frame visually matches the first frame so it auto-replays).",
  },
  youtube_shorts: {
    label: "YouTube Shorts",
    aspect: "9:16 vertical, 1080x1920",
    durationGuidance: "30–60 seconds total. Shorts viewers tolerate longer than TikTok. Total spoken words ~85–110.",
    hookGuidance: "First 3 seconds. Slightly more setup is OK because YouTube viewers came for content depth. Hook can be a clear question, a 'what most people don't know about X', or a value-promise. Less trend-chasing than TikTok.",
    captionGuidance: "YouTube auto-generates captions but burn yours in for clarity. Slightly more conservative typography. Title and description matter more than on TikTok — recommend a strong YouTube-style title (search-optimized) at the end.",
    ctaGuidance: "End with subscribe-driven CTA. \"Subscribe for more X\" or \"comment Y if you want a part 2\". YouTube rewards channels with high subscriber-conversion-per-view. The CTA should feel earned, not bolted on.",
    pacingGuidance: "Cuts every 2–4 seconds. More room for B-roll and screen recording inserts since YouTube has higher visual fidelity tolerance. Audio quality matters more than on TikTok.",
    extras: "YouTube viewers often discover via search, not feed scroll, so the hook can assume the viewer chose to watch. Reference future content (\"in part 2 we'll cover…\") to drive subscribes.",
  },
  youtube_long: {
    label: "YouTube long-form",
    aspect: "16:9 horizontal, 1920x1080",
    durationGuidance: "5–15 minutes typical. Total spoken words ~700–2000. The 'beats' field should function as section markers / chapters.",
    hookGuidance: "Hook is 30–60 seconds — the cold open. Promise specific value the viewer will get if they watch to the end. Tease the most surprising moment. Show a glimpse of the result/payoff. Then transition to intro/branding.",
    captionGuidance: "Closed captions auto-generated by YouTube; do NOT burn captions into the video itself for long-form (looks amateur on horizontal). Provide a written transcript-style description with timestamps in the post.",
    ctaGuidance: "Two CTA layers: a soft mid-roll (3–5 min in) ('subscribe so you don't miss part 2') and a hard end CTA (subscribe + bell + watch this next video). End screen should suggest one related video.",
    pacingGuidance: "Sections of 60–120 seconds with clear transitions. B-roll heavy. Multiple camera angles preferred. Each section should have a hook of its own — viewers drop off at section boundaries.",
    extras: "Generate the script as 5–8 sections (chapters): cold open, intro, section 1, section 2, ..., conclusion + CTA. Include suggested chapter titles in `b_roll` field as 'CH: <title>' entries.",
  },
  facebook_reels: {
    label: "Facebook Reels",
    aspect: "9:16 vertical, 1080x1920",
    durationGuidance: "15–60 seconds. Audience skews older than TikTok/Instagram (35+). Total spoken words ~60–90.",
    hookGuidance: "Hook should be clearer and more narrative than TikTok — Facebook viewers respond to setup-then-payoff. Less trend-chasing slang. Avoid Gen-Z idioms. Lead with a relatable real-life situation.",
    captionGuidance: "Burned-in captions critical (Facebook autoplays muted, audience skews to silent watching). Use friendly, clear sentences. Avoid heavy abbreviations.",
    ctaGuidance: "Share-driven CTAs work best on Facebook ('share this with a friend who needs to hear it'). Comments are second. Likes are weakest signal. Link-in-bio doesn't exist on Facebook Reels — direct viewers to a Facebook page or group.",
    pacingGuidance: "Slower than TikTok, faster than YouTube. Cuts every 3–5 seconds. Clear narrative progression. Avoid jump-scare cuts that work on Gen-Z but feel jarring on Facebook's older audience.",
    extras: "Facebook Reels rewards content that drives Page follows and Group joins, not just video performance. Pair with a clear destination (Page/Group) when possible.",
  },
};

// ---------------------------------------------------------------------------
// POST /api/public/generate-script
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";

  // Burst protection
  if (!checkIpBurst(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  // Parse body
  let body: {
    product_name?: string;
    product_description?: string;
    persona_id?: string;
    risk_tier?: string;
    creator_style_id?: string;
    platform?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const productName = body.product_name?.trim();
  if (!productName || productName.length < 3 || productName.length > 100) {
    return NextResponse.json(
      { error: "Product name is required (3-100 characters)" },
      { status: 400 }
    );
  }

  const riskTier = (["SAFE", "BALANCED", "SPICY"].includes(body.risk_tier || "")
    ? body.risk_tier
    : "BALANCED") as string;
  const persona = body.persona_id ? PERSONAS.find((p) => p.id === body.persona_id) : null;
  const productDescription = body.product_description?.trim().slice(0, 500) || "";
  // Default to TikTok when client doesn't specify, since TikTok is the
  // largest single user segment for FlashFlow today. Validates against
  // the whitelist; anything else collapses to tiktok.
  const platform: PlatformId = (VALID_PLATFORMS.includes(body.platform as PlatformId)
    ? body.platform
    : "tiktok") as PlatformId;
  const platformProfile = PLATFORM_PROFILES[platform];

  // --- Auth check: determines rate limit tier ---
  const authContext = await getApiAuthContext(request);
  const userId = authContext.user?.id ?? null;
  let isPaid = false;

  if (userId) {
    // Check subscription for paid status
    const { data: sub } = await supabaseAdmin
      .from("user_subscriptions")
      .select("plan_id")
      .eq("user_id", userId)
      .maybeSingle();

    const planId = (sub?.plan_id as string) || "free";
    isPaid = planId !== "free";

    if (!isPaid) {
      // Free authenticated user: 5/day tracked via Supabase
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { count } = await supabaseAdmin
        .from("public_script_generations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", todayStart.toISOString());

      if ((count ?? 0) >= FREE_DAILY_LIMIT) {
        return NextResponse.json(
          {
            error: `You've used all ${FREE_DAILY_LIMIT} free generations today. Upgrade for unlimited scripts!`,
            upgrade: true,
          },
          { status: 429 }
        );
      }
    }
    // Paid users: unlimited (no check needed)
  } else {
    // Anonymous: cookie-based 3/day
    const cookieStore = await cookies();
    const usage = await getDailyUsageFromCookie(cookieStore);
    if (usage.count >= ANON_DAILY_LIMIT) {
      return NextResponse.json(
        {
          error: `You've used all ${ANON_DAILY_LIMIT} free generations today. Sign up for more!`,
          signup: true,
        },
        { status: 429 }
      );
    }
  }

  // --- Fetch creator style context (if provided) ---
  let creatorStyleSection = '';
  if (body.creator_style_id && typeof body.creator_style_id === 'string') {
    try {
      const { data: styleCreator } = await supabaseAdmin
        .from('style_creators')
        .select('style_fingerprint')
        .eq('id', body.creator_style_id)
        .single();

      const fingerprint = styleCreator?.style_fingerprint as { prompt_context?: string } | null;
      if (fingerprint?.prompt_context) {
        creatorStyleSection = `\n${fingerprint.prompt_context}\nMatch this creator's style closely — mimic their tone, pacing, and hook patterns.\n`;
      }
    } catch {
      // Non-fatal — proceed without creator style
    }
  }

  // --- Fetch hook intelligence (non-fatal, works for all users) ---
  let intelligenceSection = '';
  try {
    const intel = await fetchHookIntelligence(undefined);
    const ctx = buildIntelligenceContext(intel);
    if (ctx) intelligenceSection = '\n' + ctx;
  } catch { /* non-fatal */ }

  // --- Build prompt ---
  const personaSection = persona
    ? `CREATOR VOICE: Write as a "${persona.name}" — ${persona.fullDescription}. Tone: ${persona.tone}. Style: ${persona.style}.`
    : "CREATOR VOICE: Write as a friendly, relatable narrator with conversational tone.";

  // Platform-specific section. The model uses this to adjust hook length,
  // pacing, captions, and CTA style. Without this section, the model
  // generates generic short-form that doesn't feel native to any platform.
  const platformSection = `
TARGET PLATFORM: ${platformProfile.label}
- Aspect / format: ${platformProfile.aspect}
- Duration + word count: ${platformProfile.durationGuidance}
- Hook rules for this platform: ${platformProfile.hookGuidance}
- Captions / on-screen text: ${platformProfile.captionGuidance}
- CTA style for this platform: ${platformProfile.ctaGuidance}
- Pacing / cuts: ${platformProfile.pacingGuidance}
- Platform-specific extras: ${platformProfile.extras}
`;

  const prompt = `You are an elite short-form video script writer who has studied thousands of top-performing TikToks, Reels, YouTube Shorts, YouTube long-form videos, and Facebook Reels. You understand what makes viewers stop scrolling on each platform — and how each platform rewards different formats.

PRODUCT / TOPIC: "${productName}"
${productDescription ? `DESCRIPTION: ${productDescription}` : ""}

${personaSection}
${platformSection}
SELECTED TONE FOR BODY/CTA: ${riskTier} — ${TIER_PROMPTS[riskTier]}
${creatorStyleSection}${intelligenceSection}
CRITICAL RULES:
- NEVER use words: cure, treat, heal, diagnose, guaranteed, 100%
- NEVER reference medical conditions or make health claims
- Product benefits should be stated as experiences, not outcomes
- NEVER imitate real celebrities or public figures

HOOK RULES (apply to ALL three hook variants):
- Each hook must create a pattern interrupt — something that makes a scroller STOP
- NEVER use banned hook phrases: "game changer", "changed my life", "you need this", "trust me", "hear me out", "hidden gem", "run don't walk", "best kept secret", "stop what you're doing", "you won't believe"
- NEVER start with: "So I just...", "Okay so...", "Hey guys...", "Guys,", "OMG guys", "Let me show you", "POV:", "Attention:"
- NEVER use AI patterns: "What if I told you", "Imagine X. Now imagine Y.", "Tired of X? Meet Y."
- Hooks should sound like a real person talking to their phone, not marketing copy
- Each hook is a COMPLETE package: spoken dialogue + visual action + on-screen text overlay
- On-screen text should create tension INDEPENDENT from the spoken dialogue (different words, more provocative)

HOOK VARIANT REQUIREMENTS — you MUST generate exactly 3 hooks that are DRASTICALLY DIFFERENT angles:
1. SAFE — wholesome, story-driven, family-friendly. Example angle: relatable frustration, gentle surprise, honest discovery
2. BALANCED — sharper, curiosity-gap, a little contrarian. Example angle: myth-bust, unexpected use case, oddly specific observation
3. SPICY — bold, pattern-interrupt, provocative (but still brand-safe). Example angle: controversial take, confession, shocking comparison, self-aware satire

The three hooks must use COMPLETELY DIFFERENT opening structures, emotions, and visual approaches. Do not just reword the same hook three ways.

SCRIPT BODY RULES:
- Write 4-5 beats for short-form (TikTok / Reels / Shorts / Facebook Reels). Write 5-8 chapter sections for YouTube long-form (use beats as chapters and put suggested chapter titles in b_roll as "CH: <title>" entries).
- Each beat has: timestamp range, action description, spoken dialogue, optional on-screen text
- On-screen text should create tension INDEPENDENT from spoken dialogue (not the same words)
- End with a clear, natural CTA — not salesy
- Body + CTA should match the SELECTED TONE above (${riskTier})
- Total spoken words and beat count are governed by the TARGET PLATFORM section above. Defer to those numbers.
- Make it genuinely entertaining — write like a real creator, not a brand
- The body must work seamlessly when attached to ANY of the three hook variants
- The CTA, captions, and beat structure must follow the TARGET PLATFORM rules — a TikTok script feels different from a YouTube long-form script.

Return ONLY valid JSON with this exact structure:
{
  "hook_variants": [
    {
      "tier": "SAFE",
      "spoken": "what you say out loud in the first 1-2 seconds",
      "visual": "what you do on camera during the hook",
      "on_screen": "the bold text overlay that appears on screen"
    },
    {
      "tier": "BALANCED",
      "spoken": "...",
      "visual": "...",
      "on_screen": "..."
    },
    {
      "tier": "SPICY",
      "spoken": "...",
      "visual": "...",
      "on_screen": "..."
    }
  ],
  "hook_line": "copy of the spoken dialogue from the ${riskTier} variant (for backward compatibility)",
  "beats": [
    {
      "t": "0-3s",
      "action": "what happens visually",
      "dialogue": "what is said out loud",
      "on_screen_text": "optional text overlay or null"
    }
  ],
  "cta_line": "the call to action",
  "cta_overlay": "Tap the orange cart",
  "b_roll": ["suggested b-roll shot 1", "shot 2"],
  "overlays": ["text overlay suggestion 1"]
}`;

  // --- Call Claude ---
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI service not configured" },
      { status: 500 }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2200,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[public-gen][${correlationId}] Claude API error: ${res.status}`);
      return NextResponse.json(
        { error: "Script generation failed. Please try again." },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    // FinOps: log usage (fire-and-forget)
    const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    logUsageEventAsync({
      source: 'flashflow',
      lane: 'FlashFlow',
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      user_id: userId ?? undefined,
      correlation_id: correlationId,
      endpoint: '/api/public/generate-script',
      template_key: 'public_generate_script',
      metadata: usage ? {} : { usage: 'missing' },
    });

    // Parse JSON from response
    let skit;
    try {
      let jsonStr = text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      skit = JSON.parse(jsonStr.trim());
    } catch {
      console.error(`[public-gen][${correlationId}] Failed to parse skit JSON`);
      return NextResponse.json(
        { error: "Failed to generate a valid script. Please try again." },
        { status: 500 }
      );
    }

    // Basic validation
    if (!Array.isArray(skit.beats) || skit.beats.length === 0) {
      return NextResponse.json(
        { error: "Generated script was invalid. Please try again." },
        { status: 500 }
      );
    }

    // Ensure hook_variants is usable; fall back to hook_line if model omitted it
    const VALID_TIERS = ["SAFE", "BALANCED", "SPICY"] as const;
    type HookVariant = { tier: string; spoken: string; visual: string; on_screen: string };
    if (!Array.isArray(skit.hook_variants) || skit.hook_variants.length === 0) {
      if (skit.hook_line) {
        // Synthesize a single-variant array using the selected tier
        skit.hook_variants = [{ tier: riskTier, spoken: skit.hook_line, visual: "", on_screen: "" }];
      } else {
        return NextResponse.json(
          { error: "Generated script was missing hooks. Please try again." },
          { status: 500 }
        );
      }
    } else {
      // Normalize: keep only valid tiers, ensure fields are strings
      skit.hook_variants = (skit.hook_variants as HookVariant[])
        .filter((v) => v && VALID_TIERS.includes(v.tier as typeof VALID_TIERS[number]))
        .map((v) => ({
          tier: v.tier,
          spoken: typeof v.spoken === "string" ? v.spoken : "",
          visual: typeof v.visual === "string" ? v.visual : "",
          on_screen: typeof v.on_screen === "string" ? v.on_screen : "",
        }));
    }

    // Guarantee hook_line points to the selected tier's spoken line (backward compat)
    const selected = (skit.hook_variants as HookVariant[]).find((v) => v.tier === riskTier)
      || (skit.hook_variants as HookVariant[])[0];
    if (selected?.spoken) skit.hook_line = selected.spoken;

    // --- Quick AI score (best-effort, non-blocking-ish) ---
    let score: number | null = null;
    try {
      const scoreRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 100,
          messages: [
            {
              role: "user",
              content: `Rate this TikTok script 1-10 for overall quality (hook strength, humor, product integration, virality). Return ONLY a JSON object: {"score": <number>}\n\nHOOK: "${skit.hook_line}"\nBEATS: ${skit.beats.map((b: { dialogue?: string }) => b.dialogue || "").join(" | ")}\nCTA: "${skit.cta_line}"`,
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (scoreRes.ok) {
        const scoreData = await scoreRes.json();
        const scoreText = scoreData.content?.[0]?.text || "";
        const scoreMatch = scoreText.match(/\{[\s\S]*?"score"\s*:\s*(\d+)[\s\S]*?\}/);
        if (scoreMatch) score = Math.min(10, Math.max(1, parseInt(scoreMatch[1])));
      }
    } catch {
      // Non-fatal — score is optional
    }

    // --- Track usage ---
    if (userId) {
      // Log to Supabase for authenticated users
      await supabaseAdmin
        .from("public_script_generations")
        .insert({
          user_id: userId,
          product_name: productName,
          persona_id: persona?.id || null,
          risk_tier: riskTier,
          score,
        })
        .then(({ error }) => {
          if (error) console.warn(`[public-gen] Usage log failed:`, error.message);
        });
    }

    // Build response with cookie update for anonymous users
    const responseBody = {
      ok: true,
      skit,
      score,
      persona: persona ? { id: persona.id, name: persona.name } : null,
      generationsRemaining: userId
        ? isPaid
          ? -1
          : FREE_DAILY_LIMIT // approximate — will be exact on next check
        : ANON_DAILY_LIMIT, // approximate
    };

    const response = NextResponse.json(responseBody);

    // Update anonymous usage cookie
    if (!userId) {
      const cookieStore = await cookies();
      const usage = await getDailyUsageFromCookie(cookieStore);
      const newCount = usage.count + 1;
      const dateStr = new Date().toISOString().slice(0, 10);
      response.cookies.set("ff_gen_usage", JSON.stringify({ count: newCount, date: dateStr }), {
        path: "/",
        maxAge: 86400,
        sameSite: "lax",
        httpOnly: true,
      });
      responseBody.generationsRemaining = ANON_DAILY_LIMIT - newCount;
    }

    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("abort") || msg.includes("AbortError")) {
      return NextResponse.json(
        { error: "Generation timed out. Please try again." },
        { status: 504 }
      );
    }
    console.error(`[public-gen][${correlationId}] Error:`, err);
    return NextResponse.json(
      { error: "Script generation failed. Please try again." },
      { status: 500 }
    );
  }
}
