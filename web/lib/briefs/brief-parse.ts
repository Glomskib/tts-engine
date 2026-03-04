import { callAnthropicJSON } from '@/lib/ai/anthropic';

export interface ParsedBrief {
  summary: string;
  key_points: string[];
  constraints: string[];
  deliverables: string[];
  tone: string;
  raw_text: string;
}

const MAX_INPUT_CHARS = 10_000;

const SYSTEM_PROMPT = `You are a brief-parsing assistant. Given the text of a brand brief or campaign document, extract structured information as JSON with these fields:
- summary: 1-2 sentence overview of the brief
- key_points: array of the most important points/requirements
- constraints: array of limitations, rules, or prohibited items
- deliverables: array of expected outputs/deliverables
- tone: the overall tone or voice direction (e.g. "professional", "casual", "energetic")

Respond with ONLY valid JSON, no markdown fences or extra text.`;

export async function parseBriefFromText(
  text: string,
  options?: { correlationId?: string },
): Promise<ParsedBrief> {
  const truncated = text.slice(0, MAX_INPUT_CHARS);

  try {
    const { parsed } = await callAnthropicJSON<Omit<ParsedBrief, 'raw_text'>>(
      truncated,
      {
        model: 'claude-haiku-4-5-20251001',
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.3,
        maxTokens: 1024,
        correlationId: options?.correlationId,
        requestType: 'brief_parse',
        agentId: 'brief-parser',
      },
    );

    return {
      summary: parsed.summary || '',
      key_points: parsed.key_points || [],
      constraints: parsed.constraints || [],
      deliverables: parsed.deliverables || [],
      tone: parsed.tone || '',
      raw_text: text,
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return {
        summary: text.slice(0, 300),
        key_points: [],
        constraints: [],
        deliverables: [],
        tone: '',
        raw_text: text,
      };
    }
    throw err;
  }
}
