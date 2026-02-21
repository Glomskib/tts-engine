/**
 * Social draft generation via Claude Haiku.
 * Takes intel report + pipeline prompt → 3 platform-specific drafts.
 */

import type { SocialDraft } from './types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  return key;
}

/**
 * Generate 3 social media drafts from an intel report using Claude Haiku.
 */
export async function generateSocialDrafts(
  intelReport: string,
  systemPrompt: string,
): Promise<{ markdown: string; drafts: SocialDraft[] }> {
  const userMessage = `Here is today's intel report:\n\n${intelReport}`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude API error: ${res.status} ${text}`);
  }

  const json = await res.json();
  const content = json.content?.[0]?.text;
  if (!content) throw new Error('Empty response from Claude API');

  // Parse the markdown into individual drafts.
  // Splits on ## and ### headers to handle both flat (## Draft 1) and nested
  // (## SECTION A → ### 1. Draft Title) formats.
  const drafts: SocialDraft[] = [];
  const sections = content.split(/\n#{2,3}\s+/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    // Skip pure section headers like "SECTION A: 5 SOCIAL POST DRAFTS" that contain subsections
    const isSectionHeader = /^SECTION\s+[AB]/i.test(trimmed);
    // Check if this section header has subsections split out already (no real content beyond the title line)
    if (isSectionHeader) {
      const lines = trimmed.split('\n');
      const bodyAfterHeader = lines.slice(1).join('\n').trim();
      // If the body is short or empty, it was just a parent header — skip
      if (bodyAfterHeader.length < 50) continue;
    }

    // Match numbered drafts: "1. Title", "Draft N", platform names
    const numberedMatch = trimmed.match(/^\*?\*?\d+\.?\s+\*?\*?/);
    const draftMatch = trimmed.match(/^(?:Draft\s+\d+)/i);
    const platformMatch = trimmed.match(/^(?:\*?\*?)?(Twitter|X\b|Instagram|LinkedIn|Facebook|Threads)/i);
    const sceneMatch = trimmed.match(/^(?:Scene\s+\d+|\d+\.?\s+\*?\*?Scene)/i);

    const isDraft = numberedMatch || draftMatch || platformMatch || isSectionHeader;

    if (isDraft && !sceneMatch) {
      const lines = trimmed.split('\n');
      const body = lines.slice(1).join('\n').trim();
      if (body && body.length > 20) {
        let platform = 'Multi-platform';
        const platFind = body.match(/\*?\*?Platform[^:]*:\*?\*?\s*(.*)/i);
        if (platFind) platform = platFind[1].trim();
        else if (platformMatch) platform = platformMatch[1];

        drafts.push({ platform, content: body });
      }
    } else if (sceneMatch) {
      const lines = trimmed.split('\n');
      const body = lines.slice(1).join('\n').trim();
      if (body && body.length > 20) {
        drafts.push({ platform: 'Scene Prompt', content: body });
      }
    }
  }

  return { markdown: content, drafts };
}
