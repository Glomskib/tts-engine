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

  // Parse the markdown into individual drafts (handles both old 3-platform and new 5-draft format)
  const drafts: SocialDraft[] = [];
  const sections = content.split(/\n##\s+/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    // Match "Draft N" or platform names
    const draftMatch = trimmed.match(/^(?:Draft\s+\d+|SECTION\s+A)/i);
    const platformMatch = trimmed.match(/^(?:\*?\*?)?(Twitter|X\b|Instagram|LinkedIn|Facebook|Threads)/i);
    const sceneMatch = trimmed.match(/^(?:SECTION\s+B|Scene\s+\d+)/i);

    if (draftMatch || platformMatch) {
      const lines = trimmed.split('\n');
      const header = lines[0].replace(/\*\*/g, '').trim();
      const body = lines.slice(1).join('\n').trim();
      if (body) {
        // Try to extract platform from body
        let platform = 'Multi-platform';
        const platFind = body.match(/\*?\*?Platform[^:]*:\*?\*?\s*(.*)/i);
        if (platFind) platform = platFind[1].trim();
        else if (platformMatch) platform = platformMatch[1];

        drafts.push({ platform, content: body });
      }
    } else if (sceneMatch) {
      // Scene prompts get bundled as drafts too
      const lines = trimmed.split('\n');
      const body = lines.slice(1).join('\n').trim();
      if (body) {
        drafts.push({ platform: 'Scene Prompt', content: body });
      }
    }
  }

  return { markdown: content, drafts };
}
