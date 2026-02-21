/**
 * Intel report generation via Claude Haiku.
 * Takes fetched articles + pipeline prompt → markdown report.
 */

import type { Article } from './types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  return key;
}

function formatArticlesForPrompt(articles: Article[]): string {
  return articles
    .slice(0, 30) // Cap at 30 articles to stay within token limits
    .map((a, i) => {
      let entry = `${i + 1}. **${a.title}**\n   Source: ${a.source}\n   URL: ${a.url}`;
      if (a.publishedAt) entry += `\n   Published: ${a.publishedAt}`;
      if (a.summary) entry += `\n   Summary: ${a.summary}`;
      return entry;
    })
    .join('\n\n');
}

/**
 * Generate a markdown intel report from articles using Claude Haiku.
 */
export async function generateIntelReport(
  articles: Article[],
  systemPrompt: string,
): Promise<string> {
  if (articles.length === 0) {
    return '# Daily Intel Report\n\nNo articles were fetched today. Check source availability.';
  }

  const userMessage = `Here are today's articles:\n\n${formatArticlesForPrompt(articles)}`;

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

  return content;
}
