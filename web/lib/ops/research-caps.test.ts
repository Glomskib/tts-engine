import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabaseAdmin before importing the module under test
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockGte = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: mockSelect,
    })),
  },
}));

import {
  getRecentResearchCount,
  checkResearchRateLimit,
  wrapWithTimeout,
  getMaxRuntimeMs,
  checkFailCooldown,
} from './research-caps';

describe('research-caps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.FF_RESEARCH_MAX_PER_HOUR;
    delete process.env.FF_RESEARCH_MAX_RUNTIME_SECONDS;
    delete process.env.FF_RESEARCH_FAIL_COOLDOWN_MINUTES;

    // Default chain: from().select().gte() for count queries
    mockSelect.mockReturnValue({ gte: mockGte });
    // For cooldown queries: from().select().eq().gte().order().limit()
    mockEq.mockReturnValue({ gte: mockGte });
    mockGte.mockReturnValue({ count: 0, error: null });
    mockOrder.mockReturnValue({ limit: mockLimit });
  });

  // ── Rate limiting ────────────────────────────────────────────────────────

  describe('getRecentResearchCount', () => {
    it('returns count from DB', async () => {
      mockGte.mockResolvedValue({ count: 7, error: null });
      const count = await getRecentResearchCount(60 * 60 * 1000);
      expect(count).toBe(7);
    });

    it('returns 0 on DB error (fail-open)', async () => {
      mockGte.mockResolvedValue({ count: null, error: { message: 'connection failed' } });
      const count = await getRecentResearchCount(60 * 60 * 1000);
      expect(count).toBe(0);
    });

    it('returns 0 when count is null', async () => {
      mockGte.mockResolvedValue({ count: null, error: null });
      const count = await getRecentResearchCount(60 * 60 * 1000);
      expect(count).toBe(0);
    });
  });

  describe('checkResearchRateLimit', () => {
    it('allows when under limit', async () => {
      mockGte.mockResolvedValue({ count: 5, error: null });
      const result = await checkResearchRateLimit();
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(5);
      expect(result.limit).toBe(20);
      expect(result.remaining).toBe(15);
    });

    it('blocks when at limit', async () => {
      mockGte.mockResolvedValue({ count: 20, error: null });
      const result = await checkResearchRateLimit();
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('respects env var override', async () => {
      process.env.FF_RESEARCH_MAX_PER_HOUR = '5';
      mockGte.mockResolvedValue({ count: 3, error: null });
      const result = await checkResearchRateLimit();
      expect(result.limit).toBe(5);
      expect(result.remaining).toBe(2);
    });

    it('blocks immediately when cap is 0', async () => {
      process.env.FF_RESEARCH_MAX_PER_HOUR = '0';
      mockGte.mockResolvedValue({ count: 0, error: null });
      const result = await checkResearchRateLimit();
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
    });

    it('fails open on DB error', async () => {
      mockGte.mockRejectedValue(new Error('DB down'));
      const result = await checkResearchRateLimit();
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
    });
  });

  // ── Timeout ──────────────────────────────────────────────────────────────

  describe('wrapWithTimeout', () => {
    it('resolves if function completes before timeout', async () => {
      const result = await wrapWithTimeout(async () => 'done', 1000);
      expect(result).toBe('done');
    });

    it('rejects with TIMEOUT error when exceeded', async () => {
      await expect(
        wrapWithTimeout(
          () => new Promise((resolve) => setTimeout(resolve, 500)),
          50,
        ),
      ).rejects.toThrow('TIMEOUT');
    });

    it('propagates function errors', async () => {
      await expect(
        wrapWithTimeout(async () => { throw new Error('boom'); }, 1000),
      ).rejects.toThrow('boom');
    });
  });

  describe('getMaxRuntimeMs', () => {
    it('defaults to 120000ms (120s)', () => {
      expect(getMaxRuntimeMs()).toBe(120_000);
    });

    it('respects env var override', () => {
      process.env.FF_RESEARCH_MAX_RUNTIME_SECONDS = '60';
      expect(getMaxRuntimeMs()).toBe(60_000);
    });

    it('falls back to default on invalid value', () => {
      process.env.FF_RESEARCH_MAX_RUNTIME_SECONDS = 'abc';
      expect(getMaxRuntimeMs()).toBe(120_000);
    });
  });

  // ── Fail cooldown ──────────────────────────────────────────────────────

  describe('checkFailCooldown', () => {
    it('returns not in cooldown when no recent errors', async () => {
      // Chain: from().select().eq().gte().order().limit()
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ gte: mockGte });
      mockGte.mockReturnValue({ order: mockOrder });
      mockOrder.mockReturnValue({ limit: mockLimit });
      mockLimit.mockResolvedValue({ data: [], error: null });

      const result = await checkFailCooldown();
      expect(result.inCooldown).toBe(false);
      expect(result.lastError).toBeNull();
    });

    it('returns in cooldown when recent error exists', async () => {
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ gte: mockGte });
      mockGte.mockReturnValue({ order: mockOrder });
      mockOrder.mockReturnValue({ limit: mockLimit });
      mockLimit.mockResolvedValue({
        data: [{ error: 'network failure', created_at: new Date().toISOString() }],
        error: null,
      });

      const result = await checkFailCooldown();
      expect(result.inCooldown).toBe(true);
      expect(result.lastError).toBe('network failure');
    });

    it('respects cooldown env var', async () => {
      process.env.FF_RESEARCH_FAIL_COOLDOWN_MINUTES = '60';
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ gte: mockGte });
      mockGte.mockReturnValue({ order: mockOrder });
      mockOrder.mockReturnValue({ limit: mockLimit });
      mockLimit.mockResolvedValue({ data: [], error: null });

      const result = await checkFailCooldown();
      expect(result.cooldownMinutes).toBe(60);
    });

    it('fails open on DB error', async () => {
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ gte: mockGte });
      mockGte.mockReturnValue({ order: mockOrder });
      mockOrder.mockReturnValue({ limit: mockLimit });
      mockLimit.mockResolvedValue({ data: null, error: { message: 'DB down' } });

      const result = await checkFailCooldown();
      expect(result.inCooldown).toBe(false);
    });
  });
});
