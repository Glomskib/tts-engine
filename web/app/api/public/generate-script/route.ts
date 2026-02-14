import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { PERSONAS } from "@/lib/personas";
import { cookies } from "next/headers";

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

  // --- Build prompt ---
  const personaSection = persona
    ? `CREATOR VOICE: Write as a "${persona.name}" — ${persona.fullDescription}. Tone: ${persona.tone}. Style: ${persona.style}.`
    : "CREATOR VOICE: Write as a friendly, relatable narrator with conversational tone.";

  const prompt = `You are a TikTok script writer. Generate a short-form video script for the product below.

PRODUCT: "${productName}"
${productDescription ? `DESCRIPTION: ${productDescription}` : ""}

${personaSection}

TONE: ${TIER_PROMPTS[riskTier]}

CRITICAL RULES:
- NEVER use words: cure, treat, heal, diagnose, guaranteed, 100%
- NEVER reference medical conditions or make health claims
- Product benefits should be stated as experiences, not outcomes
- NEVER imitate real celebrities or public figures

INSTRUCTIONS:
- Write a scroll-stopping hook line (first 1-2 seconds)
- Write 4-5 beats (short scenes/moments) that build toward the product
- Each beat has: timestamp range, action description, spoken dialogue, optional on-screen text
- End with a clear CTA
- Keep total spoken words to ~60-70 words (15-30 second video)
- Make it genuinely entertaining, not salesy

Return ONLY valid JSON with this exact structure:
{
  "hook_line": "the attention-grabbing opening line",
  "beats": [
    {
      "t": "0-3s",
      "action": "what happens visually",
      "dialogue": "what is said out loud",
      "on_screen_text": "optional text overlay or null"
    }
  ],
  "cta_line": "the call to action",
  "cta_overlay": "Link in bio!",
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
        max_tokens: 1500,
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
    if (!skit.hook_line || !Array.isArray(skit.beats) || skit.beats.length === 0) {
      return NextResponse.json(
        { error: "Generated script was invalid. Please try again." },
        { status: 500 }
      );
    }

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
