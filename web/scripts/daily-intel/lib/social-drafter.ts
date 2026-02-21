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
      max_tokens: 2048,
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

  // Parse the markdown into individual drafts
  const drafts: SocialDraft[] = [];
  const sections = content.split(/\n##?\s+\*?\*?/);
  const platformPatterns = [
    { pattern: /twitter|x\b/i, platform: 'Twitter/X' },
    { pattern: /instagram/i, platform: 'Instagram' },
    { pattern: /linkedin/i, platform: 'LinkedIn' },
  ];

  for (const section of sections) {
    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(section.slice(0, 50))) {
        // Strip the header line and clean up
        const lines = section.split('\n');
        const body = lines.slice(1).join('\n').trim();
        if (body) {
          drafts.push({ platform, content: body });
        }
        break;
      }
    }
  }

  return { markdown: content, drafts };
}
