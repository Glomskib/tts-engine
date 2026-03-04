import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock callAnthropicJSON before imports
vi.mock('@/lib/ai/anthropic', () => ({
  callAnthropicJSON: vi.fn(),
}));

// Mock flashflow-knowledge to keep tests fast
vi.mock('@/lib/flashflow-knowledge', () => ({
  FLASHFLOW_KNOWLEDGE_BASE: '## Test Knowledge Base\nFlashFlow is a platform.',
}));

import { buildSupportContext, type SupportContextInput } from './buildSupportContext';
import { generateDraftReply } from './generateDraftReply';
import { callAnthropicJSON } from '@/lib/ai/anthropic';

const mockedCallAnthropicJSON = vi.mocked(callAnthropicJSON);

function makeInput(overrides?: Partial<SupportContextInput>): SupportContextInput {
  return {
    thread: {
      id: 'thread-1',
      subject: 'Cannot generate scripts',
      status: 'open',
      priority: 'high',
      tags: ['billing', 'bug'],
      user_email: 'user@example.com',
      created_at: '2026-02-01T10:00:00Z',
    },
    messages: [
      { sender_type: 'user', sender_email: 'user@example.com', body: 'My scripts are not generating.', is_internal: false, created_at: '2026-02-01T10:01:00Z' },
      { sender_type: 'admin', sender_email: 'admin@flashflow.com', body: 'Can you share which product?', is_internal: false, created_at: '2026-02-01T10:05:00Z' },
      { sender_type: 'admin', sender_email: 'admin@flashflow.com', body: 'Internal: check credits', is_internal: true, created_at: '2026-02-01T10:06:00Z' },
      { sender_type: 'user', sender_email: 'user@example.com', body: 'I tried Matcha Energy Powder but it just spins forever.', is_internal: false, created_at: '2026-02-01T10:10:00Z' },
    ],
    userPlan: 'Pro',
    userAccountAge: '3 months',
    ...overrides,
  };
}

describe('buildSupportContext', () => {
  it('formats conversation correctly', () => {
    const result = buildSupportContext(makeInput());

    expect(result).toContain('## Ticket Summary');
    expect(result).toContain('Cannot generate scripts');
    expect(result).toContain('open');
    expect(result).toContain('high');
    expect(result).toContain('## Customer Context');
    expect(result).toContain('user@example.com');
    expect(result).toContain('Pro');
    expect(result).toContain('3 months');
    expect(result).toContain('## Conversation History');
    expect(result).toContain('[User]');
    expect(result).toContain('[Admin]');
    expect(result).toContain('## Last User Message');
    expect(result).toContain('Matcha Energy Powder');
  });

  it('excludes internal notes from conversation', () => {
    const result = buildSupportContext(makeInput());

    expect(result).not.toContain('Internal: check credits');
  });

  it('includes plan info when available', () => {
    const result = buildSupportContext(makeInput({ userPlan: 'Agency', userAccountAge: '1 year' }));

    expect(result).toContain('Plan: Agency');
    expect(result).toContain('Account age: 1 year');
  });

  it('handles missing plan info gracefully', () => {
    const result = buildSupportContext(makeInput({ userPlan: null, userAccountAge: null }));

    expect(result).toContain('## Customer Context');
    expect(result).not.toContain('Plan:');
    expect(result).not.toContain('Account age:');
  });

  it('includes tags when present', () => {
    const result = buildSupportContext(makeInput());

    expect(result).toContain('Tags: billing, bug');
  });
});

describe('generateDraftReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns expected shape on success', async () => {
    mockedCallAnthropicJSON.mockResolvedValue({
      parsed: {
        reply_text: 'Have you checked your credit balance?',
        confidence_score: 0.85,
        suggested_tags: ['credits', 'generation'],
      },
      raw: { text: '', model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 100, output_tokens: 50 }, latency_ms: 500 },
    });

    const result = await generateDraftReply('test prompt');

    expect(result.reply_text).toBe('Have you checked your credit balance?');
    expect(result.confidence_score).toBe(0.85);
    expect(result.suggested_tags).toEqual(['credits', 'generation']);
    expect(mockedCallAnthropicJSON).toHaveBeenCalledWith('test prompt', expect.objectContaining({
      model: 'claude-haiku-4-5-20251001',
      temperature: 0.3,
      requestType: 'support_draft_reply',
    }));
  });

  it('clamps confidence_score to 0-1 range', async () => {
    mockedCallAnthropicJSON.mockResolvedValue({
      parsed: { reply_text: 'test', confidence_score: 1.5, suggested_tags: [] },
      raw: { text: '', model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 10, output_tokens: 10 }, latency_ms: 100 },
    });

    const result = await generateDraftReply('test');
    expect(result.confidence_score).toBe(1);
  });

  it('falls back gracefully on JSON parse failure', async () => {
    mockedCallAnthropicJSON.mockRejectedValue(new SyntaxError('Unexpected token in JSON'));

    const result = await generateDraftReply('test');

    expect(result.reply_text).toContain('Unable to generate draft');
    expect(result.confidence_score).toBe(0.5);
    expect(result.suggested_tags).toEqual([]);
  });

  it('rethrows non-SyntaxError errors', async () => {
    mockedCallAnthropicJSON.mockRejectedValue(new Error('Network timeout'));

    await expect(generateDraftReply('test')).rejects.toThrow('Network timeout');
  });
});
