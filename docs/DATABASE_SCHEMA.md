# FlashFlow AI - Database Schema

**Database:** Supabase (PostgreSQL)
**Migrations:** `web/supabase/migrations/`
**Total Migrations:** 75 files

---

## Core Tables

### `products`
Product catalog for script generation.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Product ID |
| user_id | UUID (FK → auth.users) | Owner |
| name | TEXT | Product name |
| brand | TEXT | Brand name (legacy) |
| brand_id | UUID (FK → brands) | Brand reference |
| category_risk | TEXT | Risk category |
| notes | TEXT | Additional notes |
| tiktok_showcase_url | TEXT | TikTok showcase link |
| pain_points | JSONB | Product pain points |
| created_at | TIMESTAMPTZ | Created timestamp |
| updated_at | TIMESTAMPTZ | Updated timestamp |

**RLS:** Yes | **Indexes:** user_id, brand_id

### `brands`
Brand entities for organizing products and agency quotas.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Brand ID |
| user_id | UUID (FK → auth.users) | Owner |
| name | VARCHAR(255) | Brand name |
| logo_url | TEXT | Logo URL |
| website | TEXT | Website URL |
| description | TEXT | Description |
| colors | JSONB | Hex color array |
| tone_of_voice | TEXT | Brand voice guidelines |
| target_audience | TEXT | Target audience description |
| guidelines | TEXT | Brand guidelines |
| monthly_video_quota | INT | Monthly video quota (0=unlimited) |
| videos_this_month | INT | Videos used this month |
| quota_reset_day | INT | Day of month to reset quota |
| is_active | BOOLEAN | Active status |

**RLS:** Yes - users can manage own brands

### `videos`
Core video pipeline entity.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Video ID |
| product_id | UUID (FK → products) | Associated product |
| status | TEXT | Pipeline status (draft, needs_edit, ready_to_post, posted, failed, archived) |
| video_code | TEXT | Unique video code |
| editor_id | UUID | Claimed editor |
| claimed_at | TIMESTAMPTZ | Claim timestamp |
| claim_role | TEXT | Claimer's role |
| google_drive_url | TEXT | Drive link for video file |
| client_org_id | UUID | Client organization |
| project_id | UUID | Project assignment |

**RLS:** Yes | **Indexes:** status, product_id, editor_id, video_code

### `video_events`
Event audit trail for all video state changes.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Event ID |
| video_id | UUID (FK → videos) | Associated video |
| event_type | TEXT | Event type |
| from_status | TEXT | Previous status |
| to_status | TEXT | New status |
| actor_id | UUID | User who triggered event |
| payload | JSONB | Event payload |
| created_at | TIMESTAMPTZ | Event timestamp |

**RLS:** Yes

---

## Script System

### `saved_skits`
Saved scripts for library/reuse.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Skit ID |
| title | TEXT | Display title |
| skit_data | JSONB | Full script data (hook, beats, CTA) |
| generation_config | JSONB | Config that produced the script |
| product_id | UUID (FK → products) | Associated product |
| product_name | TEXT | Product name snapshot |
| product_brand | TEXT | Brand name snapshot |
| status | TEXT | Workflow status (draft, approved, produced, posted, archived) |
| user_id | UUID (FK → auth.users) | Owner |
| org_id | UUID | Organization |
| user_rating | INT | User rating (1-5) |
| ai_score | JSONB | AI quality score |

**RLS:** Yes - users can manage own skits

### `video_script_versions`
Script version history for videos.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Version ID |
| video_id | UUID (FK → videos) | Associated video |
| version_number | INT | Version number |
| script_data | JSONB | Script content |
| locked | BOOLEAN | Whether version is locked |
| locked_by | UUID | User who locked it |

**RLS:** Yes

### `concepts`
Content concepts linking products to hooks.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Concept ID |
| product_id | UUID (FK → products) | Associated product |
| name | TEXT | Concept name |
| description | TEXT | Concept description |
| hooks | JSONB | Associated hooks |

**RLS:** Yes

### `script_templates`
Reusable script templates.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Template ID |
| name | TEXT | Template name |
| template_data | JSONB | Template structure |

**RLS:** Yes

---

## Winners Bank

### `reference_videos`
Winning TikTok examples for pattern extraction.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Reference ID |
| url | TEXT (UNIQUE) | TikTok URL |
| submitted_by | TEXT | Submitter |
| notes | TEXT | Notes |
| category | TEXT | Category |
| status | TEXT | Processing status (queued, needs_file, needs_transcription, processing, ready, failed) |

**RLS:** No (admin managed)

### `reference_assets`
Files and transcripts for reference videos.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Asset ID |
| reference_video_id | UUID (FK → reference_videos) | Parent video |
| asset_type | TEXT | Type (mp4, audio, transcript) |
| storage_path | TEXT | File storage path |
| transcript_text | TEXT | Transcript content |

### `reference_extracts`
AI-extracted hooks and patterns from reference videos.

| Column | Type | Description |
|--------|------|-------------|
| reference_video_id | UUID (PK, FK) | 1:1 with reference_videos |
| spoken_hook | TEXT | Spoken hook text |
| on_screen_hook | TEXT | On-screen text hook |
| visual_hook | TEXT | Visual hook description |
| cta | TEXT | Call to action |
| hook_family | TEXT | Hook family classification |
| structure_tags | JSONB | Structure tags |
| quality_score | INT | Quality score (0-100) |

### `saved_hooks`
User's saved hooks from generation.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Hook ID |
| user_id | UUID (FK → auth.users) | Owner |
| hook_text | TEXT | Hook text |
| source | TEXT | Source (generated, manual) |
| content_type | TEXT | Content type used |
| content_format | TEXT | Content format |
| product_id | UUID | Product reference |
| product_name | TEXT | Product name |
| brand_name | TEXT | Brand name |
| performance_score | INT | Performance score |
| notes | TEXT | Notes |

**RLS:** Yes - users can manage own hooks

---

## Subscriptions & Credits

### `subscription_plans`
Available subscription tiers.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Plan ID (free, starter, creator, business) |
| name | TEXT | Display name |
| price_monthly | INT | Price in cents |
| price_yearly | INT | Yearly price in cents |
| credits_per_month | INT | Monthly credit allocation |
| max_products | INT | Product limit |
| max_team_members | INT | Team member limit |
| max_saved_skits | INT | Saved skit limit |
| features | JSONB | Feature list |
| stripe_price_id_monthly | TEXT | Stripe price ID |

**RLS:** Yes - public read for active plans

### `user_subscriptions`
User subscription status.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Subscription ID |
| user_id | UUID (FK, UNIQUE) | User (one per user) |
| plan_id | TEXT (FK → subscription_plans) | Current plan |
| status | TEXT | Status (active, canceled, past_due, trialing, paused) |
| stripe_customer_id | TEXT | Stripe customer ID |
| stripe_subscription_id | TEXT | Stripe subscription ID |
| current_period_start | TIMESTAMPTZ | Period start |
| current_period_end | TIMESTAMPTZ | Period end |

**RLS:** Yes - users see own subscription

### `user_credits`
Credit balance tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Credits ID |
| user_id | UUID (FK, UNIQUE) | User (one per user) |
| credits_remaining | INT | Current balance |
| credits_used_this_period | INT | Usage this period |
| lifetime_credits_used | INT | All-time usage |
| free_credits_total | INT | Free trial credits |
| free_credits_used | INT | Free credits used |

**RLS:** Yes - users see own credits

### `credit_transactions`
Audit log of credit changes.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Transaction ID |
| user_id | UUID (FK → auth.users) | User |
| type | TEXT | Type (generation, refund, purchase, bonus, reset, subscription_renewal) |
| amount | INT | Amount (+/-) |
| balance_after | INT | Balance after transaction |
| description | TEXT | Description |
| skit_id | UUID (FK → saved_skits) | Related skit |

**RLS:** Yes

---

## Agency & Client Organization

### `agency_clients`
Clients managed by agency accounts.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Client ID |
| agency_id | UUID (FK → auth.users) | Agency owner |
| company_name | VARCHAR(255) | Company name |
| contact_name | VARCHAR(255) | Contact person |
| email | VARCHAR(255) | Email |
| status | VARCHAR(50) | Status (active, paused, churned) |
| subscription_type | VARCHAR(50) | Subscription type |
| videos_quota | INT | Monthly video quota |
| videos_used | INT | Videos used this month |

**RLS:** Yes - agency manages own clients

### `events_log`
Event sourcing table for organization activities.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Event ID |
| entity_type | TEXT | Entity type (client_org, user, etc.) |
| entity_id | TEXT | Entity ID |
| event_type | TEXT | Event type (e.g., client_org_set_plan, admin_set_plan) |
| payload | JSONB | Event data |
| actor_id | UUID | Acting user |
| created_at | TIMESTAMPTZ | Event timestamp |

Used for: org plans, billing status, invitations, membership changes.

---

## Audience Intelligence

### `audience_personas`
Audience persona definitions.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Persona ID |
| user_id | UUID | Owner |
| name | TEXT | Persona name |
| archetype_name | TEXT | Archetype category |
| description | TEXT | Description |
| demographics | JSONB | Demographics data |
| psychographics | JSONB | Psychographics data |

**RLS:** Yes

---

## Supporting Tables

### `notifications`
User notifications.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Notification ID |
| user_id | UUID | Recipient |
| type | TEXT | Notification type |
| title | TEXT | Title |
| message | TEXT | Message body |
| read | BOOLEAN | Read status |
| data | JSONB | Additional data |

**RLS:** Yes

### `video_assignments`
Video task assignments to team members.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Assignment ID |
| video_id | UUID | Video |
| user_id | UUID | Assigned user |
| role | TEXT | Assignment role |
| status | TEXT | Assignment status |
| expires_at | TIMESTAMPTZ | Expiration |

### `posting_meta`
Video posting metadata (caption, hashtags, etc.).

| Column | Type | Description |
|--------|------|-------------|
| video_id | UUID (PK, FK) | Video ID |
| caption | TEXT | Post caption |
| hashtags | TEXT[] | Hashtags array |
| posting_account_id | UUID | Posting account |
| scheduled_at | TIMESTAMPTZ | Scheduled time |

### `video_assets`
File assets associated with videos.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Asset ID |
| video_id | UUID | Video |
| asset_type | TEXT | Asset type |
| storage_path | TEXT | Storage path |
| file_name | TEXT | Original filename |

### `scheduled_posts`
Content calendar scheduled posts.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Post ID |
| user_id | UUID | Owner |
| video_id | UUID | Associated video |
| scheduled_date | DATE | Scheduled date |
| status | TEXT | Post status |

**RLS:** Yes

### `collections`
Script/video collections for organization.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Collection ID |
| user_id | UUID | Owner |
| name | TEXT | Collection name |
| description | TEXT | Description |

**RLS:** Yes

### `comments`
Comments on scripts/videos.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Comment ID |
| user_id | UUID | Author |
| entity_type | TEXT | What it's on (script, video) |
| entity_id | UUID | Entity ID |
| content | TEXT | Comment text |

**RLS:** Yes

### `user_roles`
Role assignments for team members.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Role ID |
| user_id | UUID | User |
| role | TEXT | Role name (admin, editor, recorder, uploader) |

### `hook_suggestions`
AI-generated hook suggestions pending review.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Suggestion ID |
| hook_text | TEXT | Suggested hook |
| status | TEXT | Review status (pending, approved, rejected) |
| product_id | UUID | Related product |

### `skit_budgets`
Token-bucket rate limiting for AI generation.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Budget ID |
| org_id | TEXT | Organization |
| points | NUMERIC | Current points |
| last_refill_at | TIMESTAMPTZ | Last refill time |

### `ai_generation_logs`
Audit log for AI generation requests.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Log ID |
| user_id | UUID | User |
| model | TEXT | AI model used |
| input_tokens | INT | Input token count |
| output_tokens | INT | Output token count |
| cost_cents | NUMERIC | Estimated cost |

---

## Database Functions

| Function | Description |
|----------|-------------|
| `deduct_credit(user_id, description, skit_id)` | Atomically deduct one credit |
| `add_credits(user_id, amount, type, description)` | Add credits to balance |
| `reset_monthly_credits(user_id)` | Reset credits for subscription renewal |
| `initialize_user_credits()` | Trigger: auto-create credits on signup |
| `apply_skit_budget(org_id, user_id, cost, capacity, refill_rate)` | Token bucket rate limit |
| `deduct_video(user_id)` | Deduct video from monthly allocation |

## Triggers

| Trigger | Table | Description |
|---------|-------|-------------|
| `on_auth_user_created_init_credits` | auth.users | Auto-initialize credits on signup |
| `*_updated_at` | Multiple | Auto-update `updated_at` timestamps |

---

## RLS Policy Summary

All user-facing tables have Row Level Security enabled with policies ensuring users can only access their own data. Admin access is handled through the service role key (`supabaseAdmin`) which bypasses RLS.

| Pattern | Tables |
|---------|--------|
| User owns data (`auth.uid() = user_id`) | products, brands, saved_skits, saved_hooks, user_credits, user_subscriptions, etc. |
| Agency owns clients (`auth.uid() = agency_id`) | agency_clients |
| Public read | subscription_plans (active only) |
| No RLS (admin only) | reference_videos, reference_assets, reference_extracts |
