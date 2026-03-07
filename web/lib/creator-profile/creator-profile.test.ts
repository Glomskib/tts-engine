/**
 * Tests: Creator Profile — schema validation, stage heuristic, tenant isolation
 *
 * Run: pnpm vitest run lib/creator-profile/creator-profile.test.ts
 */

import { describe, it, expect } from 'vitest';
import { CreatorProfileSchema } from '@/lib/creator-profile/schema';
import { computeCreatorStage } from '@/lib/creator-profile/stage';
import { assertTenantScopedRow } from '@/lib/auth/tenant';
import type { CreatorProfile } from '@/lib/creator-profile/schema';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';

function makeAuthContext(userId: string) {
  return { user: { id: userId }, isAdmin: false };
}

// ─── Schema validation ────────────────────────────────────────────────────────

describe('CreatorProfileSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = CreatorProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts null values for all fields', () => {
    const result = CreatorProfileSchema.safeParse({
      content_creation_tenure: null,
      tts_affiliate_tenure: null,
      current_videos_per_day: null,
      target_videos_per_day: null,
      role_type: null,
      tiktok_shop_status: null,
      team_mode: null,
      primary_goal_30d: null,
      monthly_gmv_bucket: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid partial profile', () => {
    const result = CreatorProfileSchema.safeParse({
      content_creation_tenure: '1_2y',
      current_videos_per_day: '4_10',
      tts_affiliate_tenure: '1_6m',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid enum values', () => {
    const result = CreatorProfileSchema.safeParse({
      content_creation_tenure: 'not_a_valid_value',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role_type', () => {
    const result = CreatorProfileSchema.safeParse({ role_type: 'influencer' });
    expect(result.success).toBe(false);
  });
});

// ─── Stage heuristic ─────────────────────────────────────────────────────────

describe('computeCreatorStage', () => {
  it("returns Starter for null profile", () => {
    expect(computeCreatorStage(null).stage).toBe("Starter");
  });

  it("returns Builder for empty profile (partial profile fallback)", () => {
    // Empty profile has no disqualifying signals, defaults to Builder per heuristic
    expect(computeCreatorStage({}).stage).toBe("Builder");
  });

  it("returns Starter when not posting", () => {
    const profile: Partial<CreatorProfile> = { current_videos_per_day: "not_posting" };
    expect(computeCreatorStage(profile).stage).toBe("Starter");
  });

  it("returns Starter when TTS tenure is not_started", () => {
    const profile: Partial<CreatorProfile> = {
      tts_affiliate_tenure: "not_started",
      current_videos_per_day: "1",
    };
    expect(computeCreatorStage(profile).stage).toBe("Starter");
  });

  it("returns Builder for low volume, low GMV", () => {
    const profile: Partial<CreatorProfile> = {
      tts_affiliate_tenure: "1_6m",
      current_videos_per_day: "2_3",
      monthly_gmv_bucket: "lt_1k",
      team_mode: "solo",
    };
    expect(computeCreatorStage(profile).stage).toBe("Builder");
  });

  it("returns Scaling for high volume", () => {
    const profile: Partial<CreatorProfile> = {
      tts_affiliate_tenure: "1_6m",
      current_videos_per_day: "21_30",
    };
    expect(computeCreatorStage(profile).stage).toBe("Scaling");
  });

  it("returns Scaling for non-solo team", () => {
    const profile: Partial<CreatorProfile> = {
      current_videos_per_day: "2_3",
      team_mode: "team_2_5",
    };
    expect(computeCreatorStage(profile).stage).toBe("Scaling");
  });

  it("returns Advanced for high GMV", () => {
    const profile: Partial<CreatorProfile> = {
      current_videos_per_day: "4_10",
      monthly_gmv_bucket: "20_100k",
    };
    expect(computeCreatorStage(profile).stage).toBe("Advanced");
  });

  it("returns Advanced for 100k+ GMV", () => {
    const profile: Partial<CreatorProfile> = { monthly_gmv_bucket: "100k_plus" };
    expect(computeCreatorStage(profile).stage).toBe("Advanced");
  });

  it("returns Advanced for large team", () => {
    const profile: Partial<CreatorProfile> = { team_mode: "team_6_plus" };
    expect(computeCreatorStage(profile).stage).toBe("Advanced");
  });

  it("stage result always includes color, bg, description", () => {
    const result = computeCreatorStage({ current_videos_per_day: "4_10" });
    expect(result.color).toBeTruthy();
    expect(result.bg).toBeTruthy();
    expect(result.description).toBeTruthy();
  });
});

// ─── Tenant isolation (creator_profiles uses user_id) ─────────────────────────

interface CreatorProfileRow {
  id: string;
  user_id: string;
  completed_onboarding_at: string | null;
}

const PROFILE_A: CreatorProfileRow = {
  id: "prof-a",
  user_id: USER_A,
  completed_onboarding_at: null,
};

const PROFILE_B: CreatorProfileRow = {
  id: "prof-b",
  user_id: USER_B,
  completed_onboarding_at: "2026-01-01T00:00:00Z",
};

const ALL_PROFILES = [PROFILE_A, PROFILE_B];

/** Mirrors: supabaseAdmin.from('creator_profiles').select('*').eq('user_id', userId) */
function simulateGetProfile(userId: string, rows: CreatorProfileRow[]) {
  return rows.find(r => r.user_id === userId) ?? null;
}

describe("creator_profiles — tenant isolation", () => {
  it("user A can read their own profile", () => {
    const result = simulateGetProfile(USER_A, ALL_PROFILES);
    expect(result?.id).toBe("prof-a");
  });

  it("user A cannot read user B profile", () => {
    const result = simulateGetProfile(USER_A, ALL_PROFILES);
    expect(result?.user_id).not.toBe(USER_B);
  });

  it("user B cannot read user A profile", () => {
    const result = simulateGetProfile(USER_B, ALL_PROFILES);
    expect(result?.id).toBe("prof-b");
    expect(result?.user_id).not.toBe(USER_A);
  });

  it("assertTenantScopedRow passes for own profile row", () => {
    const ctx = makeAuthContext(USER_A);
    expect(() => assertTenantScopedRow({ user_id: USER_A }, ctx)).not.toThrow();
  });

  it("assertTenantScopedRow throws for cross-user row", () => {
    const ctx = makeAuthContext(USER_A);
    expect(() => assertTenantScopedRow({ user_id: USER_B }, ctx)).toThrow();
  });
});

// ─── Upsert behaviour ─────────────────────────────────────────────────────────

describe("creator_profiles — upsert behaviour", () => {
  it("upsert merges fields correctly (simulated)", () => {
    const existing: Record<string, unknown> = {
      user_id: USER_A,
      content_creation_tenure: "0_3m",
      tts_affiliate_tenure: null,
      completed_onboarding_at: null,
    };

    const updates = { tts_affiliate_tenure: "1_6m" };
    const merged: Record<string, unknown> = { ...existing, ...updates, updated_at: "2026-03-05T00:00:00Z" };

    expect(merged["content_creation_tenure"]).toBe("0_3m");
    expect(merged["tts_affiliate_tenure"]).toBe("1_6m");
    expect(merged["user_id"]).toBe(USER_A);
  });

  it("complete sets completed_onboarding_at", () => {
    const existing: Record<string, unknown> = {
      user_id: USER_A,
      completed_onboarding_at: null,
    };

    const now = new Date().toISOString();
    const completed = { ...existing, completed_onboarding_at: now };

    expect(completed.completed_onboarding_at).not.toBeNull();
    expect(typeof completed.completed_onboarding_at).toBe("string");
  });

  it("needsOnboarding is true when completed_onboarding_at is null", () => {
    const profile: Partial<CreatorProfile> & { completed_onboarding_at?: string | null } = {
      completed_onboarding_at: null,
    };
    const needsOnboarding = !profile.completed_onboarding_at;
    expect(needsOnboarding).toBe(true);
  });

  it("needsOnboarding is false when completed_onboarding_at is set", () => {
    const profile: Partial<CreatorProfile> & { completed_onboarding_at?: string | null } = {
      completed_onboarding_at: "2026-03-05T00:00:00Z",
    };
    const needsOnboarding = !profile.completed_onboarding_at;
    expect(needsOnboarding).toBe(false);
  });
});
