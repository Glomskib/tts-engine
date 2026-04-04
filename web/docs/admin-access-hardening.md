# Admin Access Hardening

## Architecture

`/admin/` is the **main authenticated app area for ALL users**, not an admin-only zone.
Access control is layered:

| Layer | What it gates | How |
|-------|--------------|-----|
| **Authentication** | Unauthenticated visitors | Middleware redirects to `/login` |
| **Workspace scoping** | Cross-user data access | API routes filter by `user_id` / `workspace_id` |
| **Plan gating** | Premium features | `minPlan` in `lib/navigation.ts` + `meetsMinPlan()` |
| **Admin gating** | System-level features | `isAdmin()` check in API routes + `adminOnly` nav flag |
| **Owner gating** | Platform owner features | `requireOwner()` in API routes + `ownerOnly` nav flag |

## Changes Made

### 1. Middleware — Server-Side Auth Gate (`middleware.ts`)

**Before:** Middleware logged `/admin/*` access but never blocked unauthenticated users. Auth was client-side only (layout useEffect redirect).

**After:** Middleware now redirects unauthenticated users to `/login?redirect=<path>` for any `/admin/*` or `/mission-control/*` path. This is a server-side gate — no client-side bypass possible.

### 2. Deploy Route — Admin Check (`/api/admin/deploy/route.ts`)

**Before:** Any authenticated user could trigger a Vercel deploy (comment said "admin layout already gates access").

**After:** Added `auth.isAdmin` check — only admin users can trigger deploys.

### 3. Test Coverage (`lib/security/admin-access.test.ts`)

14 unit tests covering:
- `isAdmin()` — null/undefined user, app_metadata admin, user_metadata spoofing rejection, ADMIN_USERS allowlist, case insensitivity
- `getAdminRoleSource()` — source detection for app_metadata, allowlist, none, priority

## Auth Patterns

### API Route Auth (174 routes under `/api/admin/`)

| Pattern | Usage | Description |
|---------|-------|-------------|
| `getApiAuthContext()` + `auth.isAdmin` | Admin-only routes | Full admin check |
| `getApiAuthContext()` + workspace scoping | User-facing routes | Scopes data by `user_id` |
| `requireOwner()` | Command center routes | Owner-only (returns 404 to hide) |
| `CC_INGEST_KEY` header | Agent ingest routes | Service-to-service auth |
| `CRON_SECRET` Bearer token | Cron routes | Vercel cron auth |

### Which Routes Are Actually Admin-Only?

Routes under `/api/admin/` that check `auth.isAdmin`:
- `system-status`, `users/manage`, `users/set-plan`, `deploy`, `test-accounts`, `backfill-video-codes`, `sweep-assignments`, `init-credits`, `launch-snapshot`, `marketplace/ops`, `integrations/test`, `ops-metrics`, `ops-warnings`, `ops/health`, `queue-health`, `editor-health`, `job-health`, `reminder-health`, `brain-feed/status`, `upgrade-requests`, `audit-log`, `finops/reconcile-heygen`

Routes that are user-scoped (safe for all authenticated users):
- `retainers`, `revenue`, `clients`, `content-items`, `brands`, `products`, `settings`, `analytics/*`, `export/*`, `hook-bank/*`, etc.

### isAdmin Resolution

1. `app_metadata.role === 'admin'` — set by Supabase admin API (server-controlled, not user-writable)
2. Email in `ADMIN_USERS` env var — comma-separated allowlist

`user_metadata.role` is **NOT trusted** (user-writable).

### Owner Detection

`OWNER_EMAILS` env var (defaults to `spiderbuttons@gmail.com`). Owner-only routes return 404 (not 403) to hide their existence.

## Verification

```bash
# Type check
pnpm tsc --noEmit

# Run security tests
pnpm vitest run lib/security/admin-access.test.ts
pnpm vitest run lib/security/tenant-scoping.test.ts
```
