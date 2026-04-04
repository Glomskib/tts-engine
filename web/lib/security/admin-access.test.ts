/**
 * Tests: Admin Access Control
 *
 * Verifies:
 *   - isAdmin correctly identifies admin users via app_metadata and ADMIN_USERS allowlist
 *   - isAdmin rejects non-admin users, null users, and user_metadata spoofing
 *   - getAdminRoleSource returns the correct source
 *
 * Run: pnpm vitest run lib/security/admin-access.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAdmin, getAdminRoleSource } from '@/lib/isAdmin';
import type { User } from '@supabase/supabase-js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> & { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown>; email?: string }): User {
  return {
    id: 'user-uuid',
    aud: 'authenticated',
    role: '',
    email: overrides.email ?? 'user@example.com',
    created_at: '2025-01-01T00:00:00Z',
    app_metadata: overrides.app_metadata ?? {},
    user_metadata: overrides.user_metadata ?? {},
    ...overrides,
  } as User;
}

// ─── isAdmin ─────────────────────────────────────────────────────────────────

describe('isAdmin', () => {
  const originalEnv = process.env.ADMIN_USERS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_USERS = originalEnv;
    } else {
      delete process.env.ADMIN_USERS;
    }
  });

  it('returns false for null user', () => {
    expect(isAdmin(null)).toBe(false);
  });

  it('returns false for undefined user', () => {
    expect(isAdmin(undefined)).toBe(false);
  });

  it('returns true for app_metadata.role === admin', () => {
    const user = makeUser({ app_metadata: { role: 'admin' } });
    expect(isAdmin(user)).toBe(true);
  });

  it('returns false for user_metadata.role === admin (not trusted)', () => {
    const user = makeUser({
      app_metadata: {},
      user_metadata: { role: 'admin' },
    });
    // Without ADMIN_USERS allowlist, user_metadata alone should NOT grant admin
    process.env.ADMIN_USERS = '';
    expect(isAdmin(user)).toBe(false);
  });

  it('returns true for email in ADMIN_USERS allowlist', () => {
    process.env.ADMIN_USERS = 'admin@example.com, other@example.com';
    const user = makeUser({ email: 'admin@example.com', app_metadata: {} });
    expect(isAdmin(user)).toBe(true);
  });

  it('allowlist check is case-insensitive', () => {
    process.env.ADMIN_USERS = 'Admin@Example.com';
    const user = makeUser({ email: 'admin@example.com', app_metadata: {} });
    expect(isAdmin(user)).toBe(true);
  });

  it('returns false for email NOT in ADMIN_USERS', () => {
    process.env.ADMIN_USERS = 'admin@example.com';
    const user = makeUser({ email: 'random@example.com', app_metadata: {} });
    expect(isAdmin(user)).toBe(false);
  });

  it('returns false when ADMIN_USERS is empty', () => {
    process.env.ADMIN_USERS = '';
    const user = makeUser({ email: 'random@example.com', app_metadata: {} });
    expect(isAdmin(user)).toBe(false);
  });

  it('app_metadata.role takes priority over allowlist', () => {
    process.env.ADMIN_USERS = '';
    const user = makeUser({ app_metadata: { role: 'admin' } });
    expect(isAdmin(user)).toBe(true);
  });
});

// ─── getAdminRoleSource ─────────────────────────────────────────────────────

describe('getAdminRoleSource', () => {
  const originalEnv = process.env.ADMIN_USERS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_USERS = originalEnv;
    } else {
      delete process.env.ADMIN_USERS;
    }
  });

  it('returns "none" for null user', () => {
    expect(getAdminRoleSource(null)).toBe('none');
  });

  it('returns "app_metadata" for app_metadata.role admin', () => {
    const user = makeUser({ app_metadata: { role: 'admin' } });
    expect(getAdminRoleSource(user)).toBe('app_metadata');
  });

  it('returns "allowlist" for email in ADMIN_USERS', () => {
    process.env.ADMIN_USERS = 'admin@example.com';
    const user = makeUser({ email: 'admin@example.com', app_metadata: {} });
    expect(getAdminRoleSource(user)).toBe('allowlist');
  });

  it('returns "none" for non-admin user', () => {
    process.env.ADMIN_USERS = '';
    const user = makeUser({ email: 'random@example.com', app_metadata: {} });
    expect(getAdminRoleSource(user)).toBe('none');
  });

  it('prefers app_metadata over allowlist', () => {
    process.env.ADMIN_USERS = 'admin@example.com';
    const user = makeUser({ email: 'admin@example.com', app_metadata: { role: 'admin' } });
    expect(getAdminRoleSource(user)).toBe('app_metadata');
  });
});
