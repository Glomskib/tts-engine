import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabaseAdmin before importing the module under test
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockGte = vi.fn();

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: mockSelect,
    })),
  },
}));

import { getRecentAutoDraftCount, checkHourlyCap } from './cost-caps';

describe('cost-caps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RI_MAX_AI_DRAFTS_PER_HOUR;

    // Default chain: from().select().eq().gte()
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ gte: mockGte });
  });

  describe('getRecentAutoDraftCount', () => {
    it('returns count from DB', async () => {
      mockGte.mockResolvedValue({ count: 5, error: null });
      const count = await getRecentAutoDraftCount(60 * 60 * 1000);
      expect(count).toBe(5);
    });

    it('returns 0 on DB error (fail-open)', async () => {
      mockGte.mockResolvedValue({ count: null, error: { message: 'connection failed' } });
      const count = await getRecentAutoDraftCount(60 * 60 * 1000);
      expect(count).toBe(0);
    });

    it('returns 0 when count is null', async () => {
      mockGte.mockResolvedValue({ count: null, error: null });
      const count = await getRecentAutoDraftCount(60 * 60 * 1000);
      expect(count).toBe(0);
    });
  });

  describe('checkHourlyCap', () => {
    it('allows when under limit', async () => {
      mockGte.mockResolvedValue({ count: 5, error: null });
      const result = await checkHourlyCap();
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(5);
      expect(result.limit).toBe(20);
      expect(result.remaining).toBe(15);
    });

    it('blocks when at limit', async () => {
      mockGte.mockResolvedValue({ count: 20, error: null });
      const result = await checkHourlyCap();
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('blocks when over limit', async () => {
      mockGte.mockResolvedValue({ count: 25, error: null });
      const result = await checkHourlyCap();
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('respects env var override', async () => {
      process.env.RI_MAX_AI_DRAFTS_PER_HOUR = '5';
      mockGte.mockResolvedValue({ count: 3, error: null });
      const result = await checkHourlyCap();
      expect(result.limit).toBe(5);
      expect(result.remaining).toBe(2);
    });

    it('blocks immediately when cap is 0', async () => {
      process.env.RI_MAX_AI_DRAFTS_PER_HOUR = '0';
      mockGte.mockResolvedValue({ count: 0, error: null });
      const result = await checkHourlyCap();
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
    });

    it('fails open on DB error', async () => {
      mockGte.mockRejectedValue(new Error('DB down'));
      const result = await checkHourlyCap();
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
    });
  });
});
