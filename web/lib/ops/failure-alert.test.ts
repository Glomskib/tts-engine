import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabaseAdmin
const mockInsert = vi.fn();
const mockSelectChain = vi.fn();
const mockEq = vi.fn();
const mockEq2 = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: mockSelectChain,
      insert: mockInsert,
    })),
  },
}));

vi.mock('@/lib/node-id', () => ({
  getNodeId: () => 'test-node',
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { checkAndSendFailureAlert } from './failure-alert';

describe('failure-alert', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default chain: from().select().eq().eq().order().limit()
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ eq: mockEq2 });
    mockEq2.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue({ limit: mockLimit });

    // Default: insert succeeds
    mockInsert.mockReturnValue({
      then: (cb: (r: { error: null }) => void) => { cb({ error: null }); return { catch: () => {} }; },
    });
  });

  it('suppresses alert during cooldown', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';

    // Last alert was 10 minutes ago
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockLimit.mockResolvedValue({
      data: [{ started_at: tenMinAgo }],
    });

    const sent = await checkAndSendFailureAlert({
      source: 'ri_ingestion',
      error: 'Test error',
      cooldownMinutes: 60,
    });

    expect(sent).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends alert when cooldown expired', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';

    // Last alert was 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockLimit.mockResolvedValue({
      data: [{ started_at: twoHoursAgo }],
    });

    mockFetch.mockResolvedValue({ ok: true });

    const sent = await checkAndSendFailureAlert({
      source: 'ri_ingestion',
      error: 'Test error',
      cooldownMinutes: 60,
    });

    expect(sent).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sends alert when no previous alerts exist', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';

    mockLimit.mockResolvedValue({ data: [] });
    mockFetch.mockResolvedValue({ ok: true });

    const sent = await checkAndSendFailureAlert({
      source: 'nightly_draft',
      error: 'Session invalid',
      cooldownMinutes: 360,
    });

    expect(sent).toBe(true);
  });

  it('returns false when Telegram not configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    mockLimit.mockResolvedValue({ data: [] });

    const sent = await checkAndSendFailureAlert({
      source: 'ri_ingestion',
      error: 'Test error',
      cooldownMinutes: 60,
    });

    expect(sent).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('records alert send in ff_cron_runs', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';

    mockLimit.mockResolvedValue({ data: [] });
    mockFetch.mockResolvedValue({ ok: true });

    // Track insert call
    const insertCalls: unknown[] = [];
    mockInsert.mockImplementation((row: unknown) => {
      insertCalls.push(row);
      return {
        then: (cb: (r: { error: null }) => void) => { cb({ error: null }); return { catch: () => {} }; },
      };
    });

    await checkAndSendFailureAlert({
      source: 'ri_ingestion',
      error: 'DB timeout',
      cooldownMinutes: 60,
    });

    expect(insertCalls.length).toBe(1);
    const row = insertCalls[0] as Record<string, unknown>;
    expect(row.job).toBe('failure_alert:ri_ingestion');
    expect(row.status).toBe('ok');
  });
});
