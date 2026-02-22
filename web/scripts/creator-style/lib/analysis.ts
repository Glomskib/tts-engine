/**
 * LLM analysis for creator-style fingerprinting.
 *
 * - analyzeVideoSample: text-based style analysis via Haiku
 * - describeScreenshots: vision-based screenshot descriptions via Haiku Vision
 */

import type { Screenshot, SampleAnalysis } from './types';

const TAG = '[creator-style:analysis]';

// ── Helpers (same JSON extraction as lib/ai/anthropic.ts) ──

function extractJSON<T>(text: string): T {
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    const objectMatch = jsonStr.match(/[\[{][\s\S]*[\]}]/);
    if (objectMatch) jsonStr = objectMatch[0];
  }
  return JSON.parse(jsonStr) as T;
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  return key;
}

// ── Screenshot descriptions (Haiku Vision) ──

export async function describeScreenshots(
  screenshots: Screenshot[],
  creatorKey: string,
): Promise<Screenshot[]> {
  if (screenshots.length === 0) return screenshots;

  const apiKey = getApiKey();

  // Build content blocks: images + prompt
  const contentBlocks: Array<Record<string, unknown>> = [];

  for (const ss of screenshots) {
    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: ss.base64_jpeg,
      },
    });
  }

  contentBlocks.push({
    type: 'text',
    text: `You are analyzing ${screenshots.length} screenshots from a video by creator "${creatorKey}".

For each screenshot, provide a concise description (1-2 sentences) covering:
- Setting/environment
- Camera angle and framing
- Any on-screen text or graphics
- Notable visual elements

Return ONLY valid JSON — an array of strings, one description per screenshot:
["description for screenshot 1", "description for screenshot 2", ...]`,
  });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`${TAG} Vision API error ${response.status}: ${errText.slice(0, 200)}`);
      return screenshots;
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text || '';
    const descriptions = extractJSON<string[]>(text);

    return screenshots.map((ss, i) => ({
      ...ss,
      description: descriptions[i] || ss.description,
    }));
  } catch (err) {
    console.warn(`${TAG} describeScreenshots failed:`, err);
    return screenshots;
  }
}

// ── Video sample analysis (Haiku text) ──

export async function analyzeVideoSample(
  transcript: string,
  screenshots: Screenshot[],
  creatorKey: string,
  platform: string,
): Promise<SampleAnalysis> {
  const apiKey = getApiKey();

  const screenshotContext = screenshots
    .filter(s => s.description)
    .map(s => `[${s.timestamp_label}] ${s.description}`)
    .join('\n');

  const systemPrompt = `You are a content strategist analyzing a creator's speaking style and content patterns.

CRITICAL RULES:
- Extract ABSTRACT PATTERNS only — never copy verbatim lines
- Use bracket notation for templates: [pain point], [product name], [personal anecdote]
- Identify the underlying formula, not the specific content
- Focus on structure, cadence, word choices, and emotional beats`;

  const prompt = `Analyze this ${platform} video from creator "${creatorKey}" and extract their style fingerprint.

TRANSCRIPT:
${transcript.slice(0, 4000)}

${screenshotContext ? `VISUAL CONTEXT:\n${screenshotContext}\n` : ''}
Return ONLY valid JSON:
{
  "hook_pattern": {
    "type": "e.g. relatable-pain, curiosity-gap, bold-claim, story-opener",
    "avg_word_count": 12,
    "template": "e.g. [relatable situation] + but [unexpected twist]",
    "examples_abstracted": ["[pain point] is ruining your [goal]"]
  },
  "structure_pattern": {
    "format": "e.g. hook-story-demo-cta",
    "flow": "e.g. hook → personal story → product demo → soft CTA",
    "avg_duration_seconds": 45,
    "pacing": "e.g. fast and punchy"
  },
  "voice_patterns": {
    "tone": "e.g. casual and self-deprecating",
    "person": "e.g. first-person singular",
    "transition_phrases": ["e.g. okay so", "but here's the thing"],
    "filler_patterns": ["e.g. you know what I mean"],
    "signature_cadence": "e.g. short punchy sentences"
  },
  "cta_pattern": {
    "style": "e.g. link-in-bio",
    "placement": "e.g. end only",
    "template": "e.g. [social proof] + check [location]"
  },
  "content_dna": {
    "niche_signals": ["e.g. wellness", "skincare"],
    "emotional_range": ["e.g. empathy", "excitement"],
    "audience_relationship": "e.g. friend sharing advice",
    "unique_angle": "e.g. science-backed claims"
  }${screenshotContext ? `,
  "visual_patterns": {
    "primary_settings": ["e.g. bedroom", "bathroom"],
    "lighting_style": "e.g. natural",
    "camera_style": "e.g. handheld selfie",
    "text_overlay_usage": "e.g. heavy captions",
    "production_level": "e.g. raw/authentic"
  }` : ''}
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Analysis API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text || '';

  return extractJSON<SampleAnalysis>(text);
}
