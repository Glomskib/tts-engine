import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCallAnthropicJSON = vi.fn();

vi.mock('@/lib/ai/anthropic', () => ({
  callAnthropicJSON: (...args: unknown[]) => mockCallAnthropicJSON(...args),
}));

import { parseBriefFromText } from './brief-parse';

describe('parseBriefFromText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns full shape with raw_text appended', async () => {
    mockCallAnthropicJSON.mockResolvedValue({
      parsed: {
        summary: 'A skincare campaign',
        key_points: ['Must use product'],
        constraints: ['No competitor mentions'],
        deliverables: ['3 videos'],
        tone: 'energetic',
      },
    });

    const result = await parseBriefFromText('This is a brand brief text');

    expect(result.summary).toBe('A skincare campaign');
    expect(result.key_points).toEqual(['Must use product']);
    expect(result.constraints).toEqual(['No competitor mentions']);
    expect(result.deliverables).toEqual(['3 videos']);
    expect(result.tone).toBe('energetic');
    expect(result.raw_text).toBe('This is a brand brief text');
  });

  it('passes correct model and options to callAnthropicJSON', async () => {
    mockCallAnthropicJSON.mockResolvedValue({
      parsed: { summary: '', key_points: [], constraints: [], deliverables: [], tone: '' },
    });

    await parseBriefFromText('test', { correlationId: 'abc-123' });

    expect(mockCallAnthropicJSON).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        temperature: 0.3,
        maxTokens: 1024,
        correlationId: 'abc-123',
        requestType: 'brief_parse',
        agentId: 'brief-parser',
      }),
    );
  });

  it('returns fallback shape on SyntaxError', async () => {
    mockCallAnthropicJSON.mockRejectedValue(new SyntaxError('Unexpected token'));

    const result = await parseBriefFromText('Some brief text here');

    expect(result.summary).toBe('Some brief text here');
    expect(result.key_points).toEqual([]);
    expect(result.constraints).toEqual([]);
    expect(result.deliverables).toEqual([]);
    expect(result.raw_text).toBe('Some brief text here');
  });

  it('re-throws non-SyntaxError errors', async () => {
    mockCallAnthropicJSON.mockRejectedValue(new Error('API down'));

    await expect(parseBriefFromText('test')).rejects.toThrow('API down');
  });

  it('defaults missing fields to empty arrays', async () => {
    mockCallAnthropicJSON.mockResolvedValue({
      parsed: { summary: 'Brief summary' },
    });

    const result = await parseBriefFromText('test');

    expect(result.summary).toBe('Brief summary');
    expect(result.key_points).toEqual([]);
    expect(result.constraints).toEqual([]);
    expect(result.deliverables).toEqual([]);
    expect(result.tone).toBe('');
  });

  it('truncates long text to 10,000 chars in prompt', async () => {
    mockCallAnthropicJSON.mockResolvedValue({
      parsed: { summary: '', key_points: [], constraints: [], deliverables: [], tone: '' },
    });

    const longText = 'A'.repeat(15_000);
    await parseBriefFromText(longText);

    const promptArg = mockCallAnthropicJSON.mock.calls[0][0] as string;
    expect(promptArg.length).toBe(10_000);
  });
});
