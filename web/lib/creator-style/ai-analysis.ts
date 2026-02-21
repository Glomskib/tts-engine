/**
 * AI-powered style analysis for creator videos.
 *
 * Two functions:
 * - analyzeVisuals() — Claude Haiku Vision on extracted frames
 * - analyzeStyle()   — Claude Haiku text on transcript
 */

import { callAnthropicJSON } from '@/lib/ai/anthropic';
import type { ExtractedFrame } from './frame-extractor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VisualObservation {
  per_frame: Array<{
    timestamp: number;
    setting: string;
    camera: string;
    text_overlays: string;
    notable: string;
  }>;
  visual_patterns: {
    primary_settings: string[];
    lighting_style: string;
    camera_style: string;
    text_overlay_usage: string;
    color_palette: string;
    production_level: string;
  };
}

export interface StyleAnalysis {
  hook_pattern: {
    type: string;
    avg_word_count: number;
    template: string;
    examples_abstracted: string[];
  };
  structure_pattern: {
    format: string;
    flow: string;
    avg_duration_seconds: number;
    pacing: string;
  };
  voice_patterns: {
    tone: string;
    person: string;
    transition_phrases: string[];
    filler_patterns: string[];
    signature_cadence: string;
  };
  cta_pattern: {
    style: string;
    placement: string;
    template: string;
  };
  content_dna: {
    niche_signals: string[];
    emotional_range: string[];
    audience_relationship: string;
    unique_angle: string;
  };
}

// ---------------------------------------------------------------------------
// Visual Analysis (Claude Haiku Vision)
// ---------------------------------------------------------------------------

export async function analyzeVisuals(
  frames: ExtractedFrame[],
  handle: string,
): Promise<VisualObservation> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  if (frames.length === 0) {
    throw new Error('No frames provided for visual analysis');
  }

  // Build content blocks: frames + prompt
  const contentBlocks: Array<Record<string, unknown>> = [];

  for (const frame of frames) {
    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: frame.base64_jpeg,
      },
    });
  }

  contentBlocks.push({
    type: 'text',
    text: `You are analyzing ${frames.length} frames from a video by creator @${handle}.

For each frame, describe:
- setting (e.g. bedroom, kitchen, studio, car, outdoors)
- camera (e.g. close-up talking head, medium shot, POV, screen recording)
- text_overlays (describe any on-screen text, captions, or graphics)
- notable (anything distinctive about this frame)

Then provide aggregated visual_patterns across all frames:
- primary_settings: most common settings
- lighting_style: (e.g. natural, ring light, studio, lo-fi)
- camera_style: (e.g. handheld selfie, tripod, multiple angles)
- text_overlay_usage: (e.g. heavy captions, minimal, branded)
- color_palette: (e.g. warm earth tones, cool blues, high contrast)
- production_level: (e.g. raw/authentic, semi-polished, professional)

Return ONLY valid JSON matching this structure:
{
  "per_frame": [{"timestamp": 0, "setting": "", "camera": "", "text_overlays": "", "notable": ""}],
  "visual_patterns": {
    "primary_settings": [],
    "lighting_style": "",
    "camera_style": "",
    "text_overlay_usage": "",
    "color_palette": "",
    "production_level": ""
  }
}`,
  });

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
      messages: [{ role: 'user', content: contentBlocks }],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Vision API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text || '';

  // Parse JSON from response
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) jsonStr = objectMatch[0];
  }

  return JSON.parse(jsonStr) as VisualObservation;
}

// ---------------------------------------------------------------------------
// Style Analysis (Claude Haiku Text)
// ---------------------------------------------------------------------------

export async function analyzeStyle(
  transcript: string,
  handle: string,
): Promise<StyleAnalysis> {
  const systemPrompt = `You are a content strategist analyzing a creator's speaking style and content patterns.

CRITICAL RULES:
- Extract ABSTRACT PATTERNS only — never copy verbatim lines
- Use bracket notation for templates: [pain point], [product name], [personal anecdote]
- Identify the underlying formula, not the specific content
- Focus on structure, cadence, word choices, and emotional beats`;

  const prompt = `Analyze this transcript from creator @${handle} and extract their style fingerprint.

TRANSCRIPT:
${transcript.slice(0, 4000)}

Return ONLY valid JSON:
{
  "hook_pattern": {
    "type": "e.g. relatable-pain, curiosity-gap, bold-claim, story-opener",
    "avg_word_count": 12,
    "template": "e.g. [relatable situation] + but [unexpected twist]",
    "examples_abstracted": ["[pain point] is ruining your [goal]", "[counter-intuitive claim] and here's why"]
  },
  "structure_pattern": {
    "format": "e.g. hook-story-demo-cta, hook-list-recap, hook-problem-solution",
    "flow": "e.g. hook → personal story → product demo → soft CTA",
    "avg_duration_seconds": 45,
    "pacing": "e.g. fast and punchy, conversational ramble, slow build"
  },
  "voice_patterns": {
    "tone": "e.g. casual and self-deprecating, authoritative, enthusiastic",
    "person": "e.g. first-person singular, direct address (you), we/us",
    "transition_phrases": ["e.g. okay so, like literally, but here's the thing"],
    "filler_patterns": ["e.g. you know what I mean, honestly, no but seriously"],
    "signature_cadence": "e.g. short punchy sentences, long flowing thoughts, question-answer"
  },
  "cta_pattern": {
    "style": "e.g. link-in-bio, soft ask, comment prompt, no CTA",
    "placement": "e.g. end only, woven throughout, mid-video",
    "template": "e.g. [social proof] + check [location]"
  },
  "content_dna": {
    "niche_signals": ["e.g. wellness, skincare, fitness"],
    "emotional_range": ["e.g. empathy, frustration, excitement"],
    "audience_relationship": "e.g. friend sharing advice, expert teaching, peer commiserating",
    "unique_angle": "e.g. science-backed claims, personal experience, humor-first"
  }
}`;

  const { parsed } = await callAnthropicJSON<StyleAnalysis>(prompt, {
    model: 'claude-haiku-4-5-20251001',
    systemPrompt,
    maxTokens: 1500,
    temperature: 0.3,
    requestType: 'analysis',
    agentId: 'creator-style',
  });

  return parsed;
}
