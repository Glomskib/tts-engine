# FlashFlow Production Bug Audit
**Date:** 2026-02-09
**Environment:** https://web-pied-delta-30.vercel.app
**Auth:** API key `ff_ak_71a45c****` (Bearer token) + session auth review

---

## Test 1: Script Generation

### ✅ WORKS — AI Skit Generation (API)
- `POST /api/ai/generate-skit` returns 200, generates full skit with hook, beats, b-roll, overlays, CTA, AI scoring
- Response time: ~15-25 seconds
- Scoring works (returns 7/10 with strengths/weaknesses)
- Variations parameter (`variation_count`) works

### ✅ WORKS — ClawBot Skit Generation (API)
- `POST /api/clawbot/generate-skit` returns 200 with full structured skit
- Includes strategy metadata (recommended angle, tone direction, suggested hooks)
- API key auth works correctly

### ⚠️ PARTIAL — Skit Generator UI
- UI page exists at `/admin/skit-generator`
- Requires session auth (cookie-based login) — cannot test programmatically
- Product selection, audience, content type controls present in code
- Inline editing, save, export functionality exists in codebase

---

## Test 2: Pipeline Management

### ✅ WORKS — Queue Listing
- `GET /api/videos/queue` returns 200 with full computed fields (SLA, stage info, priority)
- Supports filtering: `status`, `recording_status`, `claimed`, `assigned`, `claim_role`, `account_id`
- Sorting works: priority, newest, oldest, SLA deadline

### ✅ WORKS — Status Transitions
- PATCH `/api/videos/{id}` handles status transitions correctly
- Valid transitions enforced (e.g., `posted` → `archived` allowed, `posted` → `needs_edit` rejected)
- PUT `/api/videos/{id}/execution` used by pipeline UI — validates gates (video URL, posting URL, etc.)
- Pipeline UI uses role-based action buttons (Record → Edit Done → Approve → Post)

### ✅ WORKS — Pipeline Filtering (UI)
- 6 quick filters: All, Assigned to Me, Needs Attention, Past Due, Missing Info, Ready to Publish
- 7 detailed filters: Status, Brand, Product, Assignee, Date Range, Priority, Sort
- Persisted to localStorage
- Mobile filter sheet available

### ✅ WORKS — Pipeline UI Assigned To Column
- Shows "You" if current user claimed, user initials if someone else, "—" if unclaimed
- Uses `claimed_by` field (claim-based workflow, not direct assignment)

### ❌ BROKEN — Video Assignment via API Key
- `POST /api/videos/{id}/assign` returns **401 Unauthorized** with API key
- **Root cause:** `getApiAuthContext()` called without `request` parameter (line ~71)
- **File:** `web/app/api/videos/[id]/assign/route.ts`
- Works with session auth (admin UI), broken for OpenClaw/external consumers

### ❌ BROKEN — Video Creation via API Key (POST /api/videos)
- `POST /api/videos` returns **401** with API key
- **Root cause:** Uses `createServerSupabaseClient()` instead of `getApiAuthContext(request)`
- **File:** `web/app/api/videos/route.ts`
- **Workaround:** `POST /api/videos/admin` works correctly with API key

### ✅ WORKS — Video Creation via Admin Route
- `POST /api/videos/admin` returns 200, creates video with product_id + script + brief
- Supports API key auth

### ✅ WORKS — Video CRUD
- GET `/api/videos/{id}` — returns full video object
- PATCH `/api/videos/{id}` — updates fields (status, google_drive_url, etc.)
- DELETE `/api/videos/{id}` — deletes video

---

## Test 3: Library (Saved Skits)

### ✅ WORKS — Full CRUD
- `GET /api/skits` — lists saved skits with pagination (200)
- `POST /api/skits` — creates skit with structured skit_data (200)
- `GET /api/skits/{id}` — returns full skit (200)
- `PATCH /api/skits/{id}` — updates title, status, rating (200)
- `DELETE /api/skits/{id}` — deletes skit (200)

### ✅ WORKS — Skit Data Structure
- Accepts: `hook_line`, `beats[]`, `b_roll[]`, `overlays[]`, `cta_line`, `cta_overlay`
- Stores as JSONB in `skit_data` column
- AI scoring fields preserved

---

## Test 4: Winners Bank

### ✅ WORKS — List Winners
- `GET /api/winners` returns 200 with filters (source_type, category, tag, sort)

### ❌ BROKEN — Create Winner (500 Error)
- `POST /api/winners` returns **500 DB_ERROR** when using TypeScript field names
- **Root cause:** `toDbColumns()` mapping not executing in production build
- Sending raw DB column names (e.g., `hook_text` instead of `hook`) works
- Sending API field names (e.g., `hook`, `video_url`, `notes`) fails with column-not-found error
- **File:** `web/lib/winners/api.ts` — `toDbColumns()` function
- **Likely fix:** Redeploy with clean build cache, or fix mapping function

### ❌ BROKEN — Winner Analyze Route (401)
- `POST /api/winners/{id}/analyze` returns **401 Unauthorized** with API key
- **Root cause:** Uses `createServerSupabaseClient()` instead of `getApiAuthContext(request)`
- **File:** `web/app/api/winners/[id]/analyze/route.ts`

### ❌ BROKEN — Analyze Route DB Query
- GET handler queries non-existent `patterns` column
- Should be `extracted_patterns`
- **File:** `web/app/api/winners/[id]/analyze/route.ts` (line ~107)

### ⚠️ PARTIAL — Missing DB Columns
- `full_script` and `retention_1s` fields accepted by API but have NO DB column mapping
- Silently dropped on insert
- **File:** `web/lib/winners/api.ts` — `toDbColumns()`

### ✅ WORKS — Delete Winner
- `DELETE /api/winners/{id}` returns 200

---

## Test 5: Audience Intelligence

### ❌ BROKEN — Personas API (401)
- `GET /api/audience/personas` returns **401 Unauthorized** with API key
- **Root cause:** `getApiAuthContext()` called without `request` parameter
- **File:** `web/app/api/audience/personas/route.ts` (lines 70, 140)
- Both GET and POST handlers affected

---

## Test 6: API Endpoints

### ✅ WORKS (8/10 core endpoints)
| Endpoint | Status | Notes |
|----------|--------|-------|
| GET /api/health | 200 | All checks pass |
| GET /api/products | 200 | Returns product data |
| GET /api/videos/queue | 200 | Returns queue with computed fields |
| GET /api/skits | 200 | Returns saved skits |
| GET /api/winners | 200 | Returns winners list |
| GET /api/dashboard/stats | 200 | Returns stats summary |
| GET /api/videos/lookup | 200 | Lookup by URL works |
| GET /api/scripts | 200 | Returns scripts list |

### ❌ BROKEN (2/10 core endpoints)
| Endpoint | Status | Issue |
|----------|--------|-------|
| GET /api/audience/personas | 401 | Missing `request` in auth call |
| GET /api/brands | 401 | Missing `request` in auth call |

### ❌ BROKEN — Additional Auth Gaps (Code Review)
| Route | Auth Method | Issue |
|-------|-------------|-------|
| POST /api/videos/[id]/assign | `getApiAuthContext()` no request | API key auth broken |
| POST /api/videos/create-from-script | `getApiAuthContext()` no request | API key auth broken |
| POST /api/videos/create-from-product | `createServerSupabaseClient()` | No API key support |
| POST /api/videos (main) | `createServerSupabaseClient()` | No API key support |
| POST /api/winners/[id]/analyze | `createServerSupabaseClient()` | No API key support |
| POST /api/videos/import | `getApiAuthContext()` no request | API key auth broken |
| GET /api/brands | `getApiAuthContext()` no request | API key auth broken |

---

## Test 7: TikTok Stats Integration

### ✅ WORKS — Stats Sync
- `POST /api/videos/{id}/stats` accepts TikTok metrics and syncs to both tiktok_* and legacy columns
- Fields: views, likes, comments, shares, saves, sales, revenue, clicks, tiktok_url

### ✅ WORKS — Video Lookup
- `GET /api/videos/lookup` — lookup by tiktok_url, posted_url, or title

### ✅ WORKS — Winner Detection
- `POST /api/videos/{id}/detect-winner` — runs detectWinner() with product averages
- `POST /api/videos/detect-winners` — bulk detection

### ⚠️ PARTIAL — No Browser Automation
- No TikTok scraping/browser automation found in codebase
- Stats must be submitted manually via API
- Performance reports generated from stored data only

---

## Prioritized Fix List

### P0 — Blocks VA Workflow (Fix Immediately)

| # | Bug | File | Fix |
|---|-----|------|-----|
| P0-1 | Video assign route 401 for API keys | `web/app/api/videos/[id]/assign/route.ts` | Add `request` param to `getApiAuthContext()` |
| P0-2 | Audience personas 401 for API keys | `web/app/api/audience/personas/route.ts` | Add `request` param to `getApiAuthContext()` |
| P0-3 | Brands route 401 for API keys | `web/app/api/brands/route.ts` | Add `request` param to `getApiAuthContext()` |
| P0-4 | Video creation (main) no API key support | `web/app/api/videos/route.ts` | Refactor to `getApiAuthContext(request)` |
| P0-5 | Create-from-script no API key support | `web/app/api/videos/create-from-script/route.ts` | Add `request` param to `getApiAuthContext()` |

### P1 — Blocks Tracking & Analytics

| # | Bug | File | Fix |
|---|-----|------|-----|
| P1-1 | Winners bank creation 500 error | `web/lib/winners/api.ts` | Fix `toDbColumns()` mapping or redeploy |
| P1-2 | Winner analyze route 401 | `web/app/api/winners/[id]/analyze/route.ts` | Refactor to `getApiAuthContext(request)` |
| P1-3 | Analyze route queries wrong column | `web/app/api/winners/[id]/analyze/route.ts` | Change `patterns` → `extracted_patterns` |
| P1-4 | Videos/import no API key support | `web/app/api/videos/import/route.ts` | Add `request` param |
| P1-5 | Create-from-product no API key support | `web/app/api/videos/create-from-product/route.ts` | Refactor auth |
| P1-6 | Missing DB columns for full_script, retention_1s | `web/lib/winners/api.ts` | Add migration or remove from schema |

### P2 — Nice to Have

| # | Bug | Notes |
|---|-----|-------|
| P2-1 | No TikTok browser automation | Stats must be manually submitted via API |
| P2-2 | Skit generator UI not testable without session | Works via API, UI requires login |
| P2-3 | Field name confusion (hook vs hook_text) | Winners bank API/DB naming inconsistency |
