/**
 * @module zebby/scene-builder
 *
 * Generates Zebby's World scene content from raw EDS intel/draft posts.
 * Produces scene descriptions, image prompts, and optional storyboard scripts.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { callAnthropicJSON } from '@/lib/ai/anthropic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZebbyScene {
  title: string;
  description: string;
  characters: string[];
  mood: string;
  setting: string;
}

export interface ZebbyImagePrompt {
  scene_index: number;
  prompt: string;
  negative_prompt: string;
  style_notes: string;
}

export interface ZebbyStoryboard {
  duration_seconds: number;
  vo_lines: string[];
  scene_flow: string;
}

export interface ZebbySceneOutput {
  scenes: ZebbyScene[];
  image_prompts: ZebbyImagePrompt[];
  storyboard: ZebbyStoryboard | null;
  disclaimer: string;
  source_summary: string;
}

export interface BuildScenesOptions {
  include_storyboard?: boolean;
  character_focus?: string[];
}

// ---------------------------------------------------------------------------
// Style guide (loaded once, cached in module scope)
// ---------------------------------------------------------------------------

let cachedStyleGuide: string | null = null;

function getStyleGuide(): string {
  if (!cachedStyleGuide) {
    const stylePath = join(process.cwd(), 'prompts', 'zebby_style.md');
    cachedStyleGuide = readFileSync(stylePath, 'utf-8');
  }
  return cachedStyleGuide;
}

const STANDARD_DISCLAIMER =
  'This content is for educational and awareness purposes only. It is not medical advice. Always consult a qualified healthcare provider for medical questions or concerns. Sources are summarized and attributed but should be verified independently.';

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(options: BuildScenesOptions): string {
  const styleGuide = getStyleGuide();

  const characterConstraint = options.character_focus?.length
    ? `Focus on these characters: ${options.character_focus.join(', ')}. You may include others as supporting characters but the focus characters must be prominent in every scene.`
    : 'Use any combination of Zebby, Spoonie, and Bracer. Include at least one character in every scene.';

  const storyboardInstruction = options.include_storyboard
    ? `Also generate a "storyboard" object with:
  - "duration_seconds": estimated total duration (30-90 seconds)
  - "vo_lines": array of voiceover lines (one per scene)
  - "scene_flow": brief text describing transitions between scenes`
    : 'Set "storyboard" to null in your response.';

  return `You are the Zebby's World scene builder. You transform EDS (Ehlers-Danlos Syndrome) intel and draft content into scene descriptions and image prompts for Zebby's World.

## Style Guide & Character Reference
${styleGuide}

## Your Task
Given raw EDS-related text (news, research summaries, community posts, draft content), generate exactly 3 scenes with matching image prompts.

${characterConstraint}

${storyboardInstruction}

## Safety Rules (CRITICAL)
- NEVER give medical advice. Do not recommend treatments, medications, or diagnoses.
- Always attribute information to its source using phrases like "According to [source]..." or "Research from [source] suggests..."
- Include a "source_summary" field that briefly summarizes what sources were referenced in the input.
- Maintain a positive, empowering tone. Acknowledge challenges without dwelling on suffering.

## Output Format
Respond with a single JSON object matching this exact structure:
{
  "scenes": [
    {
      "title": "Scene title",
      "description": "2-3 sentence scene description",
      "characters": ["Zebby", "Spoonie"],
      "mood": "cozy and empowering",
      "setting": "Zebby's living room"
    }
  ],
  "image_prompts": [
    {
      "scene_index": 0,
      "prompt": "Full image generation prompt following the style template",
      "negative_prompt": "no photorealism, no dark themes, no medical imagery, no sharp edges, no horror, no clinical settings",
      "style_notes": "Brief notes on specific style choices for this scene"
    }
  ],
  "storyboard": null,
  "source_summary": "Brief summary of sources referenced in the input"
}

Generate exactly 3 scenes and 3 matching image_prompts (scene_index 0, 1, 2).`;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export interface BuildScenesResult extends ZebbySceneOutput {
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
  latency_ms?: number;
}

export async function buildZebbyScenes(
  intelText: string,
  options: BuildScenesOptions = {},
): Promise<BuildScenesResult> {
  const systemPrompt = buildSystemPrompt(options);

  const userPrompt = `Transform this EDS intel into Zebby's World scenes:\n\n---\n${intelText}\n---`;

  const { parsed, raw } = await callAnthropicJSON<Omit<ZebbySceneOutput, 'disclaimer'>>(
    userPrompt,
    {
      systemPrompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      temperature: 0.7,
      requestType: 'generation',
      agentId: 'zebby-scene-builder',
    },
  );

  return {
    ...parsed,
    disclaimer: STANDARD_DISCLAIMER,
    usage: raw.usage,
    model: raw.model,
    latency_ms: raw.latency_ms,
  };
}
