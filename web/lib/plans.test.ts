/**
 * Tests for plans.ts — plan gates, limits, and FlashFlow billing helpers.
 *
 * These functions are used in API routes and the render gate.
 * Incorrect behavior here = billing holes or unjustified access denials.
 */

import { describe, it, expect } from 'vitest';
import {
  meetsMinPlan,
  hasFeature,
  isWithinLimit,
  getLimit,
  getPlanByStringId,
  migrateOldPlanId,
  isVideoPlan,
  isFlashFlowPlan,
  getPlanRenderLimit,
  FF_RENDER_LIMITS,
  FLASHFLOW_PLANS,
  PLANS,
} from './plans';

// ── meetsMinPlan ─────────────────────────────────────────────────────────────

describe('meetsMinPlan', () => {
  it('free does NOT meet creator_pro', () => {
    expect(meetsMinPlan('free', 'creator_pro')).toBe(false);
  });

  it('creator_pro meets creator_pro (self)', () => {
    expect(meetsMinPlan('creator_pro', 'creator_pro')).toBe(true);
  });

  it('business meets creator_pro (higher plan)', () => {
    expect(meetsMinPlan('business', 'creator_pro')).toBe(true);
  });

  it('agency meets business', () => {
    expect(meetsMinPlan('agency', 'business')).toBe(true);
  });

  it('creator_lite does NOT meet creator_pro', () => {
    expect(meetsMinPlan('creator_lite', 'creator_pro')).toBe(false);
  });

  it('unknown plan treated as rank 0 (same as free)', () => {
    expect(meetsMinPlan('unknown_plan', 'creator_lite')).toBe(false);
    expect(meetsMinPlan('unknown_plan', 'free')).toBe(true);
  });
});

// ── hasFeature ────────────────────────────────────────────────────────────────

describe('hasFeature', () => {
  it('free does NOT have winnersBank', () => {
    expect(hasFeature('free', 'winnersBank')).toBe(false);
  });

  it('creator_pro has winnersBank', () => {
    expect(hasFeature('creator_pro', 'winnersBank')).toBe(true);
  });

  it('creator_pro has productionBoard', () => {
    expect(hasFeature('creator_pro', 'productionBoard')).toBe(true);
  });

  it('free does NOT have contentCalendar', () => {
    expect(hasFeature('free', 'contentCalendar')).toBe(false);
  });

  it('returns false for unknown plan', () => {
    expect(hasFeature('unknown_plan', 'winnersBank')).toBe(false);
  });

  it('numeric unlimited feature (-1) returns true', () => {
    // scriptsPerMonth = -1 for creator_pro
    expect(hasFeature('creator_pro', 'scriptsPerMonth')).toBe(true);
  });

  it('numeric limited feature returns true when > 0', () => {
    // scriptsPerMonth = 5 for free
    expect(hasFeature('free', 'scriptsPerMonth')).toBe(true);
  });
});

// ── isWithinLimit ─────────────────────────────────────────────────────────────

describe('isWithinLimit', () => {
  it('free at 4 scripts is within limit of 5', () => {
    expect(isWithinLimit('free', 'scriptsPerMonth', 4)).toBe(true);
  });

  it('free at exactly 5 scripts is NOT within limit', () => {
    expect(isWithinLimit('free', 'scriptsPerMonth', 5)).toBe(false);
  });

  it('creator_pro with 999 scripts is within limit (unlimited)', () => {
    expect(isWithinLimit('creator_pro', 'scriptsPerMonth', 999)).toBe(true);
  });

  it('returns false for boolean false feature', () => {
    expect(isWithinLimit('free', 'winnersBank', 0)).toBe(false);
  });

  it('returns true for boolean true feature', () => {
    expect(isWithinLimit('creator_pro', 'winnersBank', 0)).toBe(true);
  });

  it('returns false for unknown plan', () => {
    expect(isWithinLimit('unknown', 'scriptsPerMonth', 0)).toBe(false);
  });
});

// ── getLimit ──────────────────────────────────────────────────────────────────

describe('getLimit', () => {
  it('returns 5 for free scriptsPerMonth', () => {
    expect(getLimit('free', 'scriptsPerMonth')).toBe(5);
  });

  it('returns -1 for unlimited (creator_pro scriptsPerMonth)', () => {
    expect(getLimit('creator_pro', 'scriptsPerMonth')).toBe(-1);
  });

  it('returns -1 for boolean true feature', () => {
    expect(getLimit('creator_pro', 'winnersBank')).toBe(-1);
  });

  it('returns 0 for boolean false feature', () => {
    expect(getLimit('free', 'winnersBank')).toBe(0);
  });

  it('returns 0 for unknown plan', () => {
    expect(getLimit('unknown', 'scriptsPerMonth')).toBe(0);
  });
});

// ── getPlanByStringId ─────────────────────────────────────────────────────────

describe('getPlanByStringId', () => {
  it('returns PLANS.FREE for "free"', () => {
    expect(getPlanByStringId('free')).toBe(PLANS.FREE);
  });

  it('returns PLANS.CREATOR_PRO for "creator_pro"', () => {
    expect(getPlanByStringId('creator_pro')).toBe(PLANS.CREATOR_PRO);
  });

  it('returns undefined for unknown plan', () => {
    expect(getPlanByStringId('not_a_plan')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getPlanByStringId('')).toBeUndefined();
  });
});

// ── migrateOldPlanId ──────────────────────────────────────────────────────────

describe('migrateOldPlanId', () => {
  it('migrates "starter" → "creator_lite"', () => {
    expect(migrateOldPlanId('starter')).toBe('creator_lite');
  });

  it('migrates "creator" → "creator_pro"', () => {
    expect(migrateOldPlanId('creator')).toBe('creator_pro');
  });

  it('migrates "business" → "brand"', () => {
    expect(migrateOldPlanId('business')).toBe('brand');
  });

  it('"free" stays "free"', () => {
    expect(migrateOldPlanId('free')).toBe('free');
  });

  it('unknown plan passes through unchanged', () => {
    expect(migrateOldPlanId('some_new_plan')).toBe('some_new_plan');
  });
});

// ── isVideoPlan ───────────────────────────────────────────────────────────────

describe('isVideoPlan', () => {
  it('video_starter is a video plan', () => {
    expect(isVideoPlan('video_starter')).toBe(true);
  });

  it('video_growth is a video plan', () => {
    expect(isVideoPlan('video_growth')).toBe(true);
  });

  it('creator_pro is NOT a video plan', () => {
    expect(isVideoPlan('creator_pro')).toBe(false);
  });

  it('ff_creator is NOT a video plan', () => {
    expect(isVideoPlan('ff_creator')).toBe(false);
  });
});

// ── FlashFlow plan helpers ────────────────────────────────────────────────────

describe('isFlashFlowPlan', () => {
  it('ff_creator is a FlashFlow plan', () => {
    expect(isFlashFlowPlan('ff_creator')).toBe(true);
  });

  it('ff_pro is a FlashFlow plan', () => {
    expect(isFlashFlowPlan('ff_pro')).toBe(true);
  });

  it('creator_pro is NOT a FlashFlow plan', () => {
    expect(isFlashFlowPlan('creator_pro')).toBe(false);
  });

  it('free is NOT a FlashFlow plan', () => {
    expect(isFlashFlowPlan('free')).toBe(false);
  });

  it('empty string is NOT a FlashFlow plan', () => {
    expect(isFlashFlowPlan('')).toBe(false);
  });
});

describe('getPlanRenderLimit', () => {
  it('ff_creator → 30', () => {
    expect(getPlanRenderLimit('ff_creator')).toBe(30);
  });

  it('ff_pro → 100', () => {
    expect(getPlanRenderLimit('ff_pro')).toBe(100);
  });

  it('creator_pro → -1 (unlimited)', () => {
    expect(getPlanRenderLimit('creator_pro')).toBe(-1);
  });

  it('business → -1 (unlimited)', () => {
    expect(getPlanRenderLimit('business')).toBe(-1);
  });

  it('unknown plan → 0 (blocked)', () => {
    expect(getPlanRenderLimit('free')).toBe(0);
    expect(getPlanRenderLimit('')).toBe(0);
    expect(getPlanRenderLimit('unknown')).toBe(0);
  });
});

describe('FF_RENDER_LIMITS constant', () => {
  it('covers all FlashFlow plan IDs with correct limits', () => {
    expect(FF_RENDER_LIMITS['ff_creator']).toBe(30);
    expect(FF_RENDER_LIMITS['ff_pro']).toBe(100);
  });

  it('unlimited plans are marked -1', () => {
    for (const id of ['creator_pro', 'business', 'brand', 'agency']) {
      expect(FF_RENDER_LIMITS[id]).toBe(-1);
    }
  });
});

describe('FLASHFLOW_PLANS constant', () => {
  it('FF_CREATOR has correct id and rendersPerMonth', () => {
    expect(FLASHFLOW_PLANS.FF_CREATOR.id).toBe('ff_creator');
    expect(FLASHFLOW_PLANS.FF_CREATOR.rendersPerMonth).toBe(30);
    expect(FLASHFLOW_PLANS.FF_CREATOR.price).toBe(29);
  });

  it('FF_PRO has correct id and rendersPerMonth', () => {
    expect(FLASHFLOW_PLANS.FF_PRO.id).toBe('ff_pro');
    expect(FLASHFLOW_PLANS.FF_PRO.rendersPerMonth).toBe(100);
    expect(FLASHFLOW_PLANS.FF_PRO.price).toBe(79);
  });

  it('FF_PRO is marked popular', () => {
    expect(FLASHFLOW_PLANS.FF_PRO.popular).toBe(true);
  });
});
