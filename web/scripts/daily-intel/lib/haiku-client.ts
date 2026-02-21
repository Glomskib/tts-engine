/**
 * Shared Claude Haiku API client.
 * Extracts the duplicated Anthropic API call pattern into reusable helpers.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface HaikuOpts {
  model?: string;
  maxTokens?: number;
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  return key;
}

/**
 * Call Claude Haiku and return the text response.
 */
export async function callHaiku(
  system: string,
  user: string,
  opts?: HaikuOpts,
): Promise<string> {
  const model = opts?.model || 'claude-haiku-4-5-20251001';
  const maxTokens = opts?.maxTokens || 2048;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude API error: ${res.status} ${text}`);
  }

  const json = await res.json();
  const content = json.content?.[0]?.text;
  if (!content) throw new Error('Empty response from Claude API');

  return content;
}

/**
 * Strip markdown code fences from a string (```json ... ``` or ``` ... ```).
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:\w*)\n?([\s\S]*?)```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/**
 * Call Claude Haiku and parse the response as JSON.
 * Handles markdown code fence stripping automatically.
 */
export async function callHaikuJSON<T>(
  system: string,
  user: string,
  opts?: HaikuOpts,
): Promise<T> {
  const raw = await callHaiku(system, user, opts);
  const cleaned = stripCodeFences(raw);
  return JSON.parse(cleaned) as T;
}
