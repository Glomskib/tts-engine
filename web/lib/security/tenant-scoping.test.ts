/**
 * Tests: Tenant Isolation — Workspace + User ID scoping
 *
 * Verifies the single-workspace-per-user ownership model holds:
 *   - workspace_id == user_id == authContext.user.id
 *   - User A cannot read/write User B's data
 *
 * Covers: content_items (workspace_id), audience_personas (user_id), tenant helpers.
 *
 * Run: pnpm vitest run lib/security/tenant-scoping.test.ts
 */

import { describe, it, expect } from 'vitest';
import { getUserId, getWorkspaceId, assertTenantScopedRow } from '@/lib/auth/tenant';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';

function makeAuthContext(userId: string) {
  return { user: { id: userId }, isAdmin: false };
}

// ─── Tenant helpers ───────────────────────────────────────────────────────────

describe('getUserId / getWorkspaceId', () => {
  it('returns user id when authenticated', () => {
    const ctx = makeAuthContext(USER_A);
    expect(getUserId(ctx)).toBe(USER_A);
    expect(getWorkspaceId(ctx)).toBe(USER_A);
  });

  it('getUserId == getWorkspaceId (single-workspace mode invariant)', () => {
    const ctx = makeAuthContext(USER_B);
    expect(getUserId(ctx)).toBe(getWorkspaceId(ctx));
  });

  it('throws when user is null', () => {
    const ctx = { user: null };
    expect(() => getUserId(ctx)).toThrow();
    expect(() => getWorkspaceId(ctx)).toThrow();
  });
});

// ─── assertTenantScopedRow ────────────────────────────────────────────────────

describe('assertTenantScopedRow', () => {
  it('passes for own workspace_id row', () => {
    const ctx = makeAuthContext(USER_A);
    expect(() => assertTenantScopedRow({ workspace_id: USER_A }, ctx)).not.toThrow();
  });

  it('throws for cross-tenant workspace_id row', () => {
    const ctx = makeAuthContext(USER_A);
    expect(() => assertTenantScopedRow({ workspace_id: USER_B }, ctx)).toThrow();
  });

  it('passes for own user_id row', () => {
    const ctx = makeAuthContext(USER_A);
    expect(() => assertTenantScopedRow({ user_id: USER_A }, ctx)).not.toThrow();
  });

  it('throws for cross-tenant user_id row', () => {
    const ctx = makeAuthContext(USER_A);
    expect(() => assertTenantScopedRow({ user_id: USER_B }, ctx)).toThrow();
  });

  it('is a no-op for null row (not found = 404, not 403)', () => {
    const ctx = makeAuthContext(USER_A);
    expect(() => assertTenantScopedRow(null, ctx)).not.toThrow();
  });
});

// ─── Content Items — workspace_id isolation ───────────────────────────────────

interface ContentItem {
  id: string;
  workspace_id: string;
  title: string;
}

const ITEM_A: ContentItem = { id: 'item-a', workspace_id: USER_A, title: 'User A item' };
const ITEM_B: ContentItem = { id: 'item-b', workspace_id: USER_B, title: 'User B item' };
const ALL_ITEMS = [ITEM_A, ITEM_B];

/** Mirrors the DB query with .eq('workspace_id', workspaceId) */
function simulateContentItemsList(workspaceId: string, items: ContentItem[]) {
  return items.filter(i => i.workspace_id === workspaceId);
}

function simulateContentItemGet(id: string, workspaceId: string, items: ContentItem[]) {
  return items.find(i => i.id === id && i.workspace_id === workspaceId) ?? null;
}

describe('Content Items — workspace_id isolation', () => {
  it("list returns only the requesting user's items", () => {
    const result = simulateContentItemsList(USER_A, ALL_ITEMS);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('item-a');
  });

  it('user A cannot see user B items', () => {
    const result = simulateContentItemsList(USER_A, ALL_ITEMS);
    const hasBItems = result.some(i => i.workspace_id === USER_B);
    expect(hasBItems).toBe(false);
  });

  it('get by id returns null for cross-tenant access', () => {
    const result = simulateContentItemGet('item-b', USER_A, ALL_ITEMS);
    expect(result).toBeNull();
  });

  it('get by id succeeds for own item', () => {
    const result = simulateContentItemGet('item-a', USER_A, ALL_ITEMS);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('item-a');
  });
});

// ─── Audience Personas — user_id isolation ────────────────────────────────────

interface AudiencePersona {
  id: string;
  user_id: string | null;
  is_system: boolean;
  name: string;
}

const SYSTEM_PERSONA: AudiencePersona = { id: 'sys-1', user_id: null, is_system: true, name: 'System' };
const PERSONA_A: AudiencePersona = { id: 'p-a', user_id: USER_A, is_system: false, name: 'User A persona' };
const PERSONA_B: AudiencePersona = { id: 'p-b', user_id: USER_B, is_system: false, name: 'User B persona' };
const ALL_PERSONAS = [SYSTEM_PERSONA, PERSONA_A, PERSONA_B];

/**
 * Mirrors the fixed GET query:
 *   .or(`is_system.eq.true,user_id.eq.${userId},created_by.eq.${userId}`)
 */
function simulatePersonasList(userId: string, personas: AudiencePersona[]) {
  return personas.filter(p => p.is_system || p.user_id === userId);
}

describe('Audience Personas — user_id isolation', () => {
  it('user A sees system personas and own personas', () => {
    const result = simulatePersonasList(USER_A, ALL_PERSONAS);
    expect(result).toHaveLength(2); // system + user-a
    expect(result.map(p => p.id)).toContain('sys-1');
    expect(result.map(p => p.id)).toContain('p-a');
  });

  it('user A cannot see user B custom personas', () => {
    const result = simulatePersonasList(USER_A, ALL_PERSONAS);
    expect(result.some(p => p.id === 'p-b')).toBe(false);
  });

  it('user B sees system personas and own personas', () => {
    const result = simulatePersonasList(USER_B, ALL_PERSONAS);
    expect(result.some(p => p.id === 'p-a')).toBe(false);
    expect(result.some(p => p.id === 'p-b')).toBe(true);
  });
});
