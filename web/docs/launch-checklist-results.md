# Marketplace Launch Checklist — QA Results

**Date:** 2026-02-25
**Runner:** Terminal A (QA + fixes)
**Script:** `scripts/qa-client-journey.ts`
**Build verification:** `npx tsc --noEmit` + `npx next build` — both clean, 0 errors

## Environments Tested

| Environment | URL | Status |
|-------------|-----|--------|
| Preview | `tts-engine-97te7rryk-brandons-projects-94dcab35.vercel.app` | 22/22 PASS |
| Production | `flashflowai.com` | 22/22 PASS |

## Results Summary

**44 passed, 0 failed** across both environments.

---

## 1. Signup/Access

Client owner can authenticate and access client portal routes.

| Env | Test | Status | Detail |
|-----|------|--------|--------|
| Preview | Client membership exists | PASS | client=820e66cc... role=owner |
| Preview | Client reads own scripts (RLS) | PASS | count=1 |
| Preview | VA reads job board (RLS) | PASS | visible_jobs=0 |
| Preview | Unauthenticated rejected (HTTP 401) | PASS | status=401 |
| Production | Client membership exists | PASS | client=dbbdeb40... role=owner |
| Production | Client reads own scripts (RLS) | PASS | count=1 |
| Production | VA reads job board (RLS) | PASS | visible_jobs=0 |
| Production | Unauthenticated rejected (HTTP 401) | PASS | status=401 |

**Commands:** Supabase RLS queries + `GET /api/marketplace/usage` with invalid Bearer token

---

## 2. Plan Sync

Stripe subscription tier changes propagate to `client_plans` correctly.

| Env | Test | Status | Detail |
|-----|------|--------|--------|
| Preview | Pool → Dedicated | PASS | tier=dedicated_30 cap=30 weight=2 |
| Preview | Dedicated → Scale | PASS | tier=scale_50 cap=50 weight=3 |
| Production | Pool → Dedicated | PASS | tier=dedicated_30 cap=30 weight=2 |
| Production | Dedicated → Scale | PASS | tier=scale_50 cap=50 weight=3 |

**Commands:** Direct `client_plans` upsert simulating `syncMpPlanFromStripe()` flow, then read-back verification.

---

## 3. Usage

`GET /api/marketplace/usage` returns correct shape and values.

| Env | Test | Status | Detail |
|-----|------|--------|--------|
| Preview | Response shape | PASS | `used_today`, `daily_cap`, `remaining_today`, `resets_at`, `plan_status`, `claimed_today`, `upgrade_hint` all present with correct types |
| Preview | Math check | PASS | remaining = max(0, cap - used) |
| Production | Response shape | PASS | All fields present |
| Production | Math check | PASS | remaining = max(0, cap - used) |

**Command:** `GET /api/marketplace/usage` with Bearer JWT token

**Response example (masked):**
```json
{
  "ok": true,
  "data": {
    "used_today": 0,
    "daily_cap": 2,
    "remaining_today": 2,
    "resets_at": "2026-02-26T06:00:00.000Z",
    "plan_tier": "pool_15",
    "plan_label": "Pool",
    "plan_status": "active",
    "sla_hours": 48,
    "claimed_today": 0,
    "upgrade_hint": false
  }
}
```

---

## 4. Cap Enforcement

Job beyond daily cap fails cleanly with friendly message; no stack traces.

| Env | Test | Status | Detail |
|-----|------|--------|--------|
| Preview | Queue script #1 | PASS | submitted_count=1 |
| Preview | Queue script #2 | PASS | submitted_count=2 |
| Preview | Usage reflects cap hit | PASS | used=2 remaining=0 |
| Preview | Upgrade hint fires at cap | PASS | upgrade_hint=true (100% >= 80%) |
| Preview | Cap blocks job #3 | PASS | used=2 cap=2 → blocked |
| Preview | No stack trace in response | PASS | clean response |
| Production | Queue script #1 | PASS | submitted_count=1 |
| Production | Queue script #2 | PASS | submitted_count=2 |
| Production | Usage reflects cap hit | PASS | used=2 remaining=0 |
| Production | Upgrade hint fires at cap | PASS | upgrade_hint=true |
| Production | Cap blocks job #3 | PASS | used=2 cap=2 → blocked |
| Production | No stack trace in response | PASS | clean response |

**Behavior:** When daily cap is exceeded, `queueForEditing()` creates the job as `blocked` with `blocked_reason: 'DAILY_CAP_EXCEEDED'`. The usage endpoint returns `upgrade_hint: true` when usage >= 80% of cap. No stack traces leak in any response.

---

## 5. Billing Guard

Canceled/past_due clients are blocked from creating new jobs and hidden from VA queue.

| Env | Test | Status | Detail |
|-----|------|--------|--------|
| Preview | Canceled blocks queueing | PASS | status=canceled → entitlement check blocks |
| Preview | VA queue excludes canceled | PASS | 0 jobs visible after billing filter |
| Preview | Past_due blocks queueing | PASS | status=past_due → blocked |
| Preview | Usage shows plan_status | PASS | plan_status=past_due |
| Production | Canceled blocks queueing | PASS | status=canceled → blocked |
| Production | VA queue excludes canceled | PASS | 0 jobs visible |
| Production | Past_due blocks queueing | PASS | status=past_due → blocked |
| Production | Usage shows plan_status | PASS | plan_status=past_due |

**Enforcement points:**
- `checkPlanActive()` in `queueForEditing()` — returns 402 `PLAN_INACTIVE` for canceled/past_due
- `isPlanBillable()` filter in `getQueuedJobs()` — hides jobs from non-paying clients
- Usage endpoint surfaces `plan_status` so client UI can show billing alerts

---

## 6. Admin Ops

`GET /api/admin/marketplace/ops` returns sane rows, accurate counts, no PII, no 500s.

| Env | Test | Status | Detail |
|-----|------|--------|--------|
| Preview | Non-admin rejected | PASS | status=403 |
| Preview | Response shape | PASS | clients=2 active=2 overdue=0 stalled=0 |
| Preview | No PII leaked | PASS | no emails or full client names in response |
| Preview | Counts sane | PASS | active=2 overdue=0 used=2/15 |
| Production | Non-admin rejected | PASS | status=403 |
| Production | Response shape | PASS | clients=2 active=2 overdue=0 stalled=0 |
| Production | No PII leaked | PASS | no emails or full names |
| Production | Counts sane | PASS | active=2 overdue=0 used=2/15 |

**Command:** `GET /api/admin/marketplace/ops` with admin Bearer JWT

**Response fields verified:** `ok`, `data[]`, `total_clients`, `total_active_jobs`, `total_overdue`, `stalled_jobs[]`, `total_stalled`

**Per-client row fields:** `client_code`, `tier`, `plan_tier`, `plan_status`, `used_today`, `daily_cap`, `remaining_today`, `active_jobs`, `overdue_jobs`, `avg_turnaround_7d`, `sla_hours`, `priority_weight`, `has_stripe`, `current_period_end`

---

## Fix Applied During QA

### `getUserClientIds` — Bearer token compatibility

**File:** `lib/marketplace/queries.ts`
**Commit:** `e23c223`
**Issue:** `getUserClientIds()` used `createServerSupabaseClient()` (cookie-based). When called from `/api/marketplace/usage` (which authenticates via Bearer JWT through `getApiAuthContext()`), the cookie client had no session, so `client_memberships` query returned empty → 404 "No marketplace client found".
**Fix:** Changed to use `supabaseAdmin` since the caller has already verified the user's identity and the WHERE clause scopes to the authenticated user's memberships.

---

## Build Verification

```
$ npx tsc --noEmit
(clean — 0 errors)

$ npx next build
✓ Compiled successfully
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization
(0 errors, 0 warnings)
```
