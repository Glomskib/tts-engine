# Ownership & Tenant Scoping Rules

## Current Model

FlashFlow operates in **single-workspace-per-user** mode. Every user IS their own workspace.

```
workspace_id === user_id === authContext.user.id
```

This is enforced by:
1. Application layer (route handlers)
2. Postgres RLS (`auth.uid() = workspace_id` or `auth.uid() = user_id`)
3. Canonical helpers in `lib/auth/tenant.ts`

---

## Two Column Conventions (Historical)

The codebase has two ownership column patterns depending on when a table was created:

| Column | Tables | Pattern |
|--------|--------|---------|
| `workspace_id` | `content_items`, `content_item_posts`, `content_item_metrics_snapshots`, `content_item_ai_insights`, `content_experiments`, `hook_patterns`, `product_performance`, `content_memory`, `workspace_settings` | Newer (content pipeline, 2026+) |
| `user_id` | `videos`, `products`, `brands`, `saved_skits`, `audience_personas`, `scheduled_posts`, `winners_bank`, `notifications`, `user_subscriptions`, etc. | Original system |

In single-workspace mode both values are identical (`authContext.user.id`). A future multi-workspace migration would need to track the mapping separately.

---

## Canonical Helpers

Use helpers from `lib/auth/tenant.ts` in all new code:

```typescript
import { getUserId, getWorkspaceId, assertTenantScopedRow } from '@/lib/auth/tenant';

export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) return 401;

  const userId = getUserId(authContext);         // for user_id columns
  const workspaceId = getWorkspaceId(authContext); // for workspace_id columns
  // Currently: userId === workspaceId

  const { data } = await supabaseAdmin
    .from('content_items')
    .select('*')
    .eq('workspace_id', workspaceId); // always scope reads
}
```

Do NOT use:
- `const workspaceId = user.id` (confusing alias, removed)
- `const workspaceId = authContext.user.id` (bypasses the helper layer)
- Passing `userId` to a `workspace_id` column or vice versa without comment

---

## Rules for Every Route

### Reads (SELECT)
Always add a tenant scope filter:
- `workspace_id` table → `.eq('workspace_id', workspaceId)`
- `user_id` table → `.eq('user_id', userId)`

### Writes (INSERT)
Set the ownership column(s) the table has:
- `workspace_id` only → `workspace_id: workspaceId`
- `user_id` only → `user_id: userId`
- Both (e.g., `audience_personas`) → `user_id: userId, created_by: userId`

Never omit the ownership column on insert — the row becomes orphaned.

### Cross-tenant access
- Use `assertTenantScopedRow(row, authContext)` in risky paths to catch bugs fast
- Admins bypass plan gates but NOT tenant scoping (admins see their own workspace by default)
- Service role (`supabaseAdmin`) bypasses RLS — extra care required in cron routes

---

## RLS Coverage

All workspace-scoped tables have RLS enabled. Policies use:
- `auth.uid() = workspace_id` (content pipeline tables)
- `auth.uid() = user_id` (legacy tables)
- Service role bypass via `(auth.jwt() ->> 'role') = 'service_role'`

If you add a new tenant-scoped table, always add RLS from the start:
```sql
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY my_table_select ON my_table FOR SELECT USING (auth.uid() = workspace_id);
CREATE POLICY my_table_insert ON my_table FOR INSERT WITH CHECK (auth.uid() = workspace_id);
CREATE POLICY my_table_update ON my_table FOR UPDATE USING (auth.uid() = workspace_id);
CREATE POLICY my_table_delete ON my_table FOR DELETE USING (auth.uid() = workspace_id);
CREATE POLICY my_table_service ON my_table FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
```

---

## Future Multi-Workspace Migration

When FlashFlow adds real workspaces:
1. Change `getWorkspaceId(authContext)` to read from the auth token claim or session
2. Add a `workspaces` table with `user_id → workspace_id` mapping
3. Update all RLS policies to check workspace membership
4. Backfill existing rows: `workspace_id = user_id` for all existing users

The application layer needs no changes if all code uses the helpers.

---

## Tests

`lib/security/tenant-scoping.test.ts` — proves isolation for:
- Content items (workspace_id)
- Audience personas (user_id)
- Tenant helper edge cases

`lib/security/scheduled-posts-idor.test.ts` — proves isolation for scheduled posts.
