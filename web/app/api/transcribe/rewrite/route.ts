import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { checkRateLimit, recordUsage } from '@/lib/transcribe-rate-limit';
import { PERSONAS } from '@/lib/script-expander';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Customer archetypes for script rewriting.
 * Maps to specific voice styles and audience mindsets.
 */
const CUSTOMER_ARCHETYPES: Record<string, { name: string; voice: string }> = {
  skeptic: {
    name: 'The Skeptic',
    voice: 'Starts doubtful, ends convinced. Uses "I thought this was BS" or "my friend kept telling me to try this". Relatable because everyone has been skeptical. The conversion moment is the emotional peak.',
  },
  sober_curious: {
    name: 'Sober Curious',
    voice: 'Exploring alternatives to alcohol with genuine curiosity. Speaks about wellness journeys without preaching. Uses "I decided to try something different" and "honestly, I didn\'t expect to feel this good". Open-minded, non-judgmental, discovery-focused.',
  },
  chronic_warrior: {
    name: 'Chronic Warrior',
    voice: 'Living with chronic pain or conditions, tough but hopeful. Uses "I\'ve tried everything the doctors gave me" and "some days are harder than others but...". Raw, honest about the struggle, celebrates small wins. Never victim energy — always fighter energy.',
  },
  honest_reviewer: {
    name: 'The Honest Reviewer',
    voice: 'Calm, measured, trustworthy. Speaks like someone who has tried dozens of products and finally found one worth recommending. Uses phrases like "I\'ve tried everything" and "here\'s the truth". Balanced — acknowledges downsides.',
  },
  educator: {
    name: 'The Educator',
    voice: 'Confident, knowledgeable but not condescending. Drops science or facts early. "Here\'s what 90% of people don\'t know..." or "Your doctor won\'t tell you this". Makes the viewer feel smarter.',
  },
  storyteller: {
    name: 'The Storyteller',
    voice: 'Narrative-driven, personal. Starts with a specific moment or timeline. "3 weeks ago I could barely..." or "Last month I was scrolling and...". Draws the viewer into a journey with a payoff.',
  },
  hype_man: {
    name: 'The Hype Man',
    voice: 'High energy, excited, almost disbelief. "BRO you need to see this" or "I literally can\'t stop talking about this". Unboxing energy. Infectious enthusiasm, lots of emphasis and repetition.',
  },
  relatable_friend: {
    name: 'The Relatable Friend',
    voice: 'Casual, low-key, talking to camera like texting a friend. Uses filler words naturally ("honestly", "like", "lowkey"). No hard sell — just sharing something they genuinely use. "Okay so I have to put you guys onto something".',
  },
};

const VOICE_TONES: Record<string, { name: string; description: string }> = {
  conversational: {
    name: 'Conversational',
    description: 'Like talking to a friend. Casual, warm, natural pauses and filler words.',
  },
  authoritative: {
    name: 'Authoritative',
    description: 'Expert confidence. Facts-first, decisive, backed by knowledge.',
  },
  empathetic: {
    name: 'Empathetic',
    description: 'Understanding and warm. Validates feelings, shares vulnerability.',
  },
  high_energy: {
    name: 'High Energy',
    description: 'Excited, enthusiastic, fast-paced. Lots of emphasis and exclamation.',
  },
  educational: {
    name: 'Educational',
    description: 'Clear, informative, teaches something. "Did you know..." energy.',
  },
  raw_authentic: {
    name: 'Raw & Authentic',
    description: 'Unfiltered real talk. No polish, no script feel. Stream of consciousness.',
  },
};

/**
 * POST /api/transcribe/rewrite
 *
 * Rewrites a transcript in a specific persona voice and tone.
 * Counts as 1 use from the shared transcriber rate limit pool.
 */
export async function POST(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';

  const auth = await getApiAuthContext(request);
  const userId = auth.user?.id ?? null;

  const { allowed, remaining, limit } = await checkRateLimit(ip, userId);

  if (!allowed) {
    const msg = userId
      ? "You've reached your daily AI limit. Check back tomorrow!"
      : "You've reached your daily limit. Sign up for FlashFlow to get more AI uses!";
    return NextResponse.json(
      { error: msg, signupUrl: userId ? undefined : '/signup' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  }

  let body: {
    transcript?: string;
    persona?: string;
    tone?: string;
    custom_persona?: string;
    analysis?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { transcript, persona, tone, custom_persona, analysis } = body;
  if (!transcript || typeof transcript !== 'string' || transcript.length < 10) {
    return NextResponse.json({ error: 'Transcript is required.' }, { status: 400 });
  }
  if (!persona || !tone) {
    return NextResponse.json({ error: 'Persona and tone are required.' }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'AI service not configured.' }, { status: 500 });
  }

  // Resolve persona voice
  let personaName: string;
  let personaVoice: string;

  if (persona === 'custom' && custom_persona) {
    personaName = 'Custom';
    personaVoice = custom_persona;
  } else {
    const archetype = CUSTOMER_ARCHETYPES[persona];
    if (!archetype) {
      // Fall back to script-expander personas
      const expanderPersona = PERSONAS.find((p) => p.id === persona);
      if (expanderPersona) {
        personaName = expanderPersona.name;
        personaVoice = expanderPersona.voice;
      } else {
        return NextResponse.json({ error: 'Invalid persona.' }, { status: 400 });
      }
    } else {
      personaName = archetype.name;
      personaVoice = archetype.voice;
    }
  }

  const toneInfo = VOICE_TONES[tone];
  if (!toneInfo) {
    return NextResponse.json({ error: 'Invalid tone.' }, { status: 400 });
  }

  const requestStart = Date.now();

  try {
    const hookLine = (analysis as Record<string, Record<string, string>>)?.hook?.line || '';
    const contentFormat = (analysis as Record<string, Record<string, string>>)?.content?.format || '';

    const prompt = `You are a UGC script writer for TikTok/short-form video. Rewrite this transcript in the specified voice and tone. Return ONLY valid JSON.

ORIGINAL TRANSCRIPT:
${transcript.slice(0, 3000)}

ORIGINAL HOOK: "${hookLine}"
CONTENT FORMAT: ${contentFormat}

=== REWRITE AS THIS PERSONA ===
${personaName}: ${personaVoice}

=== VOICE & TONE ===
${toneInfo.name}: ${toneInfo.description}

=== RULES ===
- Keep the same core message/topic but rewrite it completely in the new voice
- The hook must be a scroll-stopper — 3 seconds or less
- Total script should be 30-60 seconds when read aloud (80-150 words)
- Include [stage directions] in brackets where helpful
- on_screen_text should be 2-4 short overlays
- tips should be practical filming/delivery advice specific to this persona

Return this exact JSON:
{
  "rewritten_hook": "<new hook line — the scroll-stopper>",
  "rewritten_script": "<the full rewritten script including hook, body, and CTA>",
  "on_screen_text": ["<overlay 1>", "<overlay 2>", "<overlay 3>"],
  "cta": "<the call to action line>",
  "persona_used": "${personaName}",
  "tone_used": "${toneInfo.name}",
  "tips": ["<delivery tip 1>", "<delivery tip 2>", "<delivery tip 3>"]
}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('[rewrite] Claude error:', errText);
      return NextResponse.json({ error: 'AI generation failed.' }, { status: 500 });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response.' }, { status: 500 });
    }

    const rewrite = JSON.parse(jsonMatch[0]);

    const processingTimeMs = Date.now() - requestStart;
    await recordUsage(ip, userId, 'rewrite', processingTimeMs);

    return NextResponse.json(
      { ok: true, data: rewrite },
      {
        headers: {
          'X-RateLimit-Remaining': String(remaining === -1 ? -1 : remaining - 1),
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  } catch (err) {
    console.error('[rewrite] Error:', err);
    return NextResponse.json(
      { error: 'Failed to rewrite script. Please try again.' },
      { status: 500 }
    );
  }
}

// Export archetypes and tones for the frontend
export { CUSTOMER_ARCHETYPES, VOICE_TONES };
