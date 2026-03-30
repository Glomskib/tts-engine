/**
 * Tests for render-entitlement.ts
 *
 * Critical path: this is the payment gate for FlashFlow render access.
 * Every scenario that affects billing or access must be covered.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist mock variables so they're available inside vi.mock factories ─────
const { mockMaybeSingle, mockEq, mockSelect, mockRpc } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn();
  const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockRpc = vi.fn();
  return { mockMaybeSingle, mockEq, mockSelect, mockRpc };
});

// ── Mock supabaseAdmin ─────────────────────────────────────────────────────
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({ select: mockSelect })),
    rpc: mockRpc,
  },
}));

// ── Mock plans (FF_RENDER_LIMITS only — avoids env var issues) ─────────────
vi.mock('@/lib/plans', () => ({
  FF_RENDER_LIMITS: {
    ff_creator: 30,
    ff_pro: 100,
    creator_pro: -1,
    business: -1,
    brand: -1,
    agency: -1,
  },
  isFlashFlowPlan: (id: string) => id === 'ff_creator' || id === 'ff_pro',
  getPlanRenderLimit: (id: string) => {
    const limits: Record<string, number> = { ff_creator: 30, ff_pro: 100, creator_pro: -1, business: -1 };
    return limits[id] ?? 0;
  },
  FLASHFLOW_PLANS: {},
  FLASHFLOW_PLANS_LIST: [],
}));

import { getRenderEntitlement, incrementRenderCount, resetRenderCount } from './render-entitlement';

// ── Helpers ────────────────────────────────────────────────────────────────

function mockSub(overrides: Record<string, unknown> = {}) {
  mockMaybeSingle.mockResolvedValue({
    data: {
      plan_id: 'ff_creator',
      status: 'active',
      ff_renders_per_month: null,
      ff_renders_used_this_month: 0,
      ...overrides,
    },
    error: null,
  });
}

function mockNoSub() {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
}

function mockDbError() {
  mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'connection failed' } });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('getRenderEntitlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
  });

  describe('no subscription', () => {
    it('blocks when no subscription row exists', async () => {
      mockNoSub();
      const ent = await getRenderEntitlement('user-1');
      expect(ent.canRender).toBe(false);
      expect(ent.planId).toBe('free');
      expect(ent.rendersRemaining).toBe(0);
      expect(ent.upgradeMessage).toBeTruthy();
      expect(ent.upgradeUrl).toBe('/upgrade');
    });

    it('blocks on DB error — fail-closed for payment gate', async () => {
      mockDbError();
      const ent = await getRenderEntitlement('user-1');
      expect(ent.canRender).toBe(false);
    });
  });

  describe('inactive subscription', () => {
    for (const status of ['past_due', 'canceled', 'paused', 'incomplete']) {
      it(`blocks when status is '${status}'`, async () => {
        mockSub({ status });
        const ent = await getRenderEntitlement('user-1');
        expect(ent.canRender).toBe(false);
        expect(ent.upgradeUrl).toBe('/admin/billing');
      });
    }
  });

  describe('ff_creator plan (30 renders/mo)', () => {
    it('allows render when 5 used', async () => {
      mockSub({ ff_renders_used_this_month: 5 });
      const ent = await getRenderEntitlement('user-1');
      expect(ent.canRender).toBe(true);
      expect(ent.rendersPerMonth).toBe(30);
      expect(ent.rendersUsed).toBe(5);
      expect(ent.rendersRemaining).toBe(25);
    });

    it('allows render at limit - 1 (29 used)', async () => {
      mockSub({ ff_renders_used_this_month: 29 });
      const ent = await getRenderEntitlement('user-1');
      expect(ent.canRender).toBe(true);
      expect(ent.rendersRemaining).toBe(1);
    });

    it('blocks at exactly 30 used', async () => {
      mockSub({ ff_renders_used_this_month: 30 });
      const ent = await getRenderEntitlement('user-1');
      expect(ent.canRender).toBe(false);
      expect(ent.rendersRemaining).toBe(0);
      expect(ent.upgradeMessage).toContain('30');
      expect(ent.upgradeUrl).toBe('/upgrade');
    });

    it('blocks when over limit (e.g. 99 used)', async () => {
      mockSub({ ff_renders_used_this_month: 99 });
      const ent = await getRenderEntitlement('user-1');
      expect(ent.canRender).toBe(false);
      expect(ent.rendersRemaining).toBe(0);
    });

    it('uses DB ff_renders_per_month over plan default when set', async () => {
      // Admin manually gave user 50 renders instead of 30
      mockSub({ ff_renders_per_month: 50, ff_renders_used_this_month: 35 });
      const ent = await getRenderEntitlement('user-1');
      expect(ent.canRender).toBe(true);
      expect(ent.rendersPerMonth).toBe(50);
      expect(ent.rendersRemaining).toBe(15);
    });

    it('treats null ff_renders_used_this_month as 0', async () => {
      mockSub({ ff_renders_used_this_month: null });
      const ent = await getRenderEntitlement('user-1');
      expect(ent.canRender).toBe(true);
      expect(ent.rendersUsed).toBe(0);
      expect(ent.rendersRemaining).toBe(30);
    });
  });

  describe('ff_pro plan (100 renders/mo)', () => {
    it('allows render when 50 used', async () => {
      mockSub({ plan_id: 'ff_pro', ff_renders_used_this_month: 50 });
      const ent = await getRenderEntitlement('user-1');
      expect(ent.canRender).toBe(true);
      expect(ent.rendersPerMonth).toBe(100);
      expect(ent.rendersRemaining).toBe(50);
    });

    it('blocks at exactly 100 used', async () => {
      mockSub({ plan_id: 'ff_pro', ff_renders_used_this_month: 100 });
      const ent = await getRenderEntitlement('user-1');
      expect(ent.canRender).toBe(false);
      expect(ent.rendersRemaining).toBe(0);
    });
  });

  describe('unlimited plans', () => {
    for (const planId of ['creator_pro', 'business']) {
      it(`'${planId}' allows unlimited renders regardless of count`, async () => {
        mockSub({ plan_id: planId, ff_renders_used_this_month: 9999 });
        const ent = await getRenderEntitlement('user-1');
        expect(ent.canRender).toBe(true);
        expect(ent.rendersPerMonth).toBeNull();
        expect(ent.rendersRemaining).toBeNull();
      });
    }
  });

  describe('free / unknown plans', () => {
    for (const planId of ['free', 'unknown_plan', '']) {
      it(`blocks for plan '${planId}'`, async () => {
        mockSub({ plan_id: planId });
        const ent = await getRenderEntitlement('user-1');
        expect(ent.canRender).toBe(false);
        expect(ent.upgradeUrl).toBe('/upgrade');
      });
    }
  });

  it('allows render for trialing subscriptions', async () => {
    mockSub({ status: 'trialing', ff_renders_used_this_month: 0 });
    const ent = await getRenderEntitlement('user-1');
    expect(ent.canRender).toBe(true);
  });

  it('includes no upgradeMessage/upgradeUrl when canRender is true', async () => {
    mockSub({ ff_renders_used_this_month: 5 });
    const ent = await getRenderEntitlement('user-1');
    expect(ent.canRender).toBe(true);
    expect(ent.upgradeMessage).toBeUndefined();
    expect(ent.upgradeUrl).toBeUndefined();
  });
});

describe('incrementRenderCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls increment_ff_render RPC with correct user ID', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await incrementRenderCount('user-abc');
    expect(mockRpc).toHaveBeenCalledWith('increment_ff_render', { p_user_id: 'user-abc' });
  });

  it('resolves without throwing on RPC error (non-fatal)', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'DB down' } });
    await expect(incrementRenderCount('user-abc')).resolves.toBeUndefined();
  });
});

describe('resetRenderCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls reset_ff_renders RPC with correct user ID', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await resetRenderCount('user-xyz');
    expect(mockRpc).toHaveBeenCalledWith('reset_ff_renders', { p_user_id: 'user-xyz' });
  });

  it('resolves without throwing on RPC error (non-fatal)', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'RPC not found' } });
    await expect(resetRenderCount('user-xyz')).resolves.toBeUndefined();
  });
});
