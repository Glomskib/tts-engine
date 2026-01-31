# FlashFlow AI Database Schema

> Comprehensive documentation of all Supabase tables used by FlashFlow AI.

## Table of Contents

1. [Entity Relationship Diagram](#entity-relationship-diagram)
2. [Core Tables](#core-tables)
   - [products](#products)
   - [videos](#videos)
   - [concepts](#concepts)
3. [Skit System](#skit-system)
   - [saved_skits](#saved_skits)
   - [skit_ratings](#skit_ratings)
   - [skit_budget](#skit_budget)
4. [Audience Intelligence](#audience-intelligence)
   - [audience_personas](#audience_personas)
   - [pain_points](#pain_points)
   - [language_patterns](#language_patterns)
5. [Winners & Hooks](#winners--hooks)
   - [reference_videos](#reference_videos)
   - [reference_assets](#reference_assets)
   - [reference_extracts](#reference_extracts)
   - [proven_hooks](#proven_hooks)
   - [hook_suggestions](#hook_suggestions)
   - [script_library](#script_library)
6. [Subscription & Credits](#subscription--credits)
   - [subscription_plans](#subscription_plans)
   - [user_subscriptions](#user_subscriptions)
   - [user_credits](#user_credits)
   - [credit_transactions](#credit_transactions)
7. [Video Workflow](#video-workflow)
   - [video_events](#video_events)
   - [notifications](#notifications)
   - [audit_log](#audit_log)
8. [User Management](#user-management)
   - [user_roles](#user_roles)
   - [user_profiles](#user_profiles)
9. [Quick Reference](#quick-reference)

---

## Entity Relationship Diagram

```
auth.users (Supabase Auth)
│
├── 1:1 ──→ user_subscriptions ──→ subscription_plans
├── 1:1 ──→ user_credits
├── 1:many → credit_transactions
├── 1:1 ──→ user_profiles
├── 1:1 ──→ user_roles
│
├── 1:many → saved_skits ──→ products
├── 1:many → skit_ratings ──→ products
│
├── 1:many → audience_personas
├── 1:many → pain_points
│
└── 1:many → videos
              ├── 1:1 ──→ concepts
              ├── 1:many → video_events
              ├── 1:1 ──→ script_library
              └── → products

products
├── 1:many → videos
├── 1:many → saved_skits
├── 1:many → skit_ratings
├── 1:many → proven_hooks
└── 1:many → script_library

reference_videos (Winners Bank)
├── 1:many → reference_assets
├── 1:1 ──→ reference_extracts
└── → hook_suggestions
```

---

## Core Tables

### products

**Purpose:** Product catalog for generating skits and tracking video content.

```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
brand TEXT
description TEXT
benefits TEXT[] -- Array of product benefits
ingredients TEXT
category TEXT
category_risk TEXT -- Compliance risk level
tiktok_showcase_url TEXT -- TikTok shop URL
notes TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**RLS:** Users can view products; admins can modify.

**Used by:** Skit Generator, Video Pipeline, Products Admin Page

---

### videos

**Purpose:** Core table for video production pipeline - tracks scripts through recording, editing, and posting.

```sql
id UUID PRIMARY KEY
concept_id UUID REFERENCES concepts(id)
product_id UUID REFERENCES products(id)
script_library_id UUID REFERENCES script_library(id)

-- Script content
script_locked_text TEXT
script_locked_version INT
script_locked_json JSONB

-- Workflow status
recording_status TEXT CHECK (IN 'NOT_RECORDED', 'RECORDED', 'EDITED', 'READY_TO_POST', 'POSTED', 'REJECTED')

-- Timestamps for each stage
recorded_at TIMESTAMPTZ
edited_at TIMESTAMPTZ
ready_to_post_at TIMESTAMPTZ
posted_at TIMESTAMPTZ
rejected_at TIMESTAMPTZ
last_status_changed_at TIMESTAMPTZ

-- Notes from team
recording_notes TEXT
editor_notes TEXT
uploader_notes TEXT

-- Posting details
posted_url TEXT
posted_platform TEXT -- 'tiktok', 'instagram', 'youtube'
posted_account TEXT
posting_error TEXT

-- Assignment workflow
assigned_to UUID REFERENCES auth.users(id)
assigned_at TIMESTAMPTZ
assigned_role TEXT -- 'recorder', 'editor', 'uploader'
assignment_state TEXT -- 'AVAILABLE', 'ASSIGNED', 'RELEASED'
assigned_expires_at TIMESTAMPTZ

-- Claim system (legacy)
claimed_by TEXT
claimed_at TIMESTAMPTZ
claim_expires_at TIMESTAMPTZ
claim_role TEXT

-- Work queue
work_lane TEXT
work_priority INT

created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**Indexes:** recording_status, assigned_to, work_lane, last_status_changed_at

**RLS:** Team members can view/claim videos based on role.

**Used by:** Pipeline Page, Workbenches, Video Detail Page, Analytics

---

### concepts

**Purpose:** Video concepts and creative briefs for content generation.

```sql
id UUID PRIMARY KEY
product_id UUID REFERENCES products(id)

-- Creative direction
angle TEXT
proof_type TEXT
hypothesis TEXT
hook_options TEXT[]

-- Hook package
visual_hook TEXT
on_screen_text_hook TEXT
on_screen_text_mid TEXT[]
on_screen_text_cta TEXT
hook_type TEXT

-- Reference
reference_script TEXT
reference_video_url TEXT
tone_preset TEXT

created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**Used by:** Video Pipeline, Script Generation

---

## Skit System

### saved_skits

**Purpose:** Stores user-generated skits for reuse and workflow tracking.

```sql
id UUID PRIMARY KEY
title TEXT NOT NULL
skit_data JSONB NOT NULL -- Full skit content
generation_config JSONB -- Settings used to generate

-- Product context
product_id UUID REFERENCES products(id)
product_name TEXT
product_brand TEXT

-- Workflow
status TEXT CHECK (IN 'draft', 'approved', 'produced', 'posted', 'archived')

-- User ownership
user_id UUID NOT NULL REFERENCES auth.users(id)
org_id UUID

-- Ratings
user_rating INT CHECK (1-5)
ai_score JSONB

created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**RLS:** Users can only view/modify their own skits.

**Used by:** Skit Library, Skit Generator, Video Pipeline

---

### skit_ratings

**Purpose:** Tracks user feedback on generated skits for AI improvement.

```sql
id UUID PRIMARY KEY
skit_data JSONB NOT NULL
rating INT NOT NULL CHECK (1-5)
feedback TEXT

user_id UUID NOT NULL REFERENCES auth.users(id)
org_id UUID

-- Generation context
generation_config JSONB
product_id UUID REFERENCES products(id)
product_name TEXT
product_brand TEXT

created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**RLS:** Users can only view/modify their own ratings.

**Used by:** Skit Generator (after generation)

---

### skit_budget

**Purpose:** Token bucket rate limiting for skit generation intensity.

```sql
org_id UUID NOT NULL
user_id UUID NOT NULL
points NUMERIC DEFAULT 300
updated_at TIMESTAMPTZ
PRIMARY KEY (org_id, user_id)
```

**Function:** `apply_skit_budget(org_id, user_id, cost)` - Atomic budget check/deduct

**Used by:** Skit Generator (intensity slider)

---

## Audience Intelligence

### audience_personas

**Purpose:** Target audience profiles for authentic content creation.

```sql
id UUID PRIMARY KEY
name TEXT NOT NULL -- "Stressed Mom", "Skeptical Buyer"
description TEXT

-- Demographics
age_range TEXT -- "25-34"
gender TEXT
lifestyle TEXT -- "busy professional"

-- Pain points (embedded)
pain_points JSONB DEFAULT '[]' -- [{point, intensity, triggers}]

-- Language patterns
phrases_they_use TEXT[] -- Phrases they relate to
phrases_to_avoid TEXT[] -- Corporate speak to avoid
tone TEXT -- "casual", "skeptical", "enthusiastic"
humor_style TEXT -- "self-deprecating", "sarcastic"

-- Objections
common_objections TEXT[]
beliefs JSONB -- {about_health: "natural is better"}

-- Content preferences
content_they_engage_with TEXT[] -- "relatable fails", "before/after"
platforms TEXT[] -- "tiktok", "instagram"

-- Product associations
product_categories TEXT[]
product_ids UUID[]

-- Stats
times_used INT DEFAULT 0

created_by UUID REFERENCES auth.users(id)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**RLS:** Authenticated users can manage personas.

**Used by:** Skit Generator, Audience Page

---

### pain_points

**Purpose:** Library of customer pain points with authentic language.

```sql
id UUID PRIMARY KEY
pain_point TEXT NOT NULL -- "Can't sleep through the night"
category TEXT -- "sleep", "energy", "stress", etc.

-- Context
when_it_happens TEXT -- "3am, mind racing"
emotional_state TEXT -- "frustrated", "desperate"
intensity TEXT -- "low", "medium", "high", "extreme"

-- Language
how_they_describe_it TEXT[] -- Exact customer phrases
related_searches TEXT[] -- What they Google

-- Solution framing
what_they_want TEXT -- Desired outcome
objections_to_solutions TEXT[] -- Why past solutions failed

-- Product links
product_ids UUID[]

-- Stats
times_used INT DEFAULT 0

created_by UUID REFERENCES auth.users(id)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**RLS:** Authenticated users can manage pain points.

**Used by:** Skit Generator, Audience Page, Extract from Reviews

---

### language_patterns

**Purpose:** Tracked phrases that work (or don't) for content.

```sql
id UUID PRIMARY KEY
pattern_type TEXT NOT NULL -- "phrase", "hook_opener", "cta"
pattern_text TEXT NOT NULL

persona_id UUID REFERENCES audience_personas(id)
category TEXT

-- Performance
times_used INT DEFAULT 0
success_rate NUMERIC(5,2)
source TEXT -- "winner_analysis", "manual", "ai_suggested"
source_video_id UUID

is_recommended BOOLEAN DEFAULT TRUE
is_avoid BOOLEAN DEFAULT FALSE

created_at TIMESTAMPTZ
```

**Used by:** Skit Generator, Winners Analysis

---

## Winners & Hooks

### reference_videos

**Purpose:** Winners Bank - TikTok examples for hook/CTA extraction.

```sql
id UUID PRIMARY KEY
url TEXT NOT NULL UNIQUE
submitted_by TEXT NOT NULL
notes TEXT
category TEXT
status TEXT CHECK (IN 'queued', 'needs_file', 'needs_transcription', 'processing', 'ready', 'failed')
error_message TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**Used by:** Winners Bank Admin Page

---

### reference_assets

**Purpose:** Files and transcripts for reference videos.

```sql
id UUID PRIMARY KEY
reference_video_id UUID NOT NULL REFERENCES reference_videos(id)
asset_type TEXT CHECK (IN 'mp4', 'audio', 'transcript')
storage_path TEXT
transcript_text TEXT
created_at TIMESTAMPTZ
```

---

### reference_extracts

**Purpose:** AI-extracted hook packages from winning videos.

```sql
reference_video_id UUID PRIMARY KEY REFERENCES reference_videos(id)
spoken_hook TEXT NOT NULL
on_screen_hook TEXT
visual_hook TEXT
cta TEXT NOT NULL
hook_family TEXT NOT NULL
structure_tags JSONB
quality_score INT CHECK (0-100)
created_at TIMESTAMPTZ
```

**Used by:** Skit Generator (context injection)

---

### proven_hooks

**Purpose:** Hooks with usage stats for AI context.

```sql
id UUID PRIMARY KEY
brand_name TEXT NOT NULL
product_id UUID REFERENCES products(id)

hook_type TEXT CHECK (IN 'spoken', 'visual', 'text')
hook_text TEXT NOT NULL
hook_hash TEXT NOT NULL
hook_family TEXT -- 'pattern_interrupt', 'relatable_pain', etc.

source_video_id UUID REFERENCES videos(id)

-- Stats
used_count INT DEFAULT 1
approved_count INT DEFAULT 0
posted_count INT DEFAULT 0
winner_count INT DEFAULT 0

last_used_at TIMESTAMPTZ
approved_by TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ

UNIQUE(brand_name, hook_type, hook_hash)
```

**Used by:** Skit Generator, Hook Analytics

---

### hook_suggestions

**Purpose:** Queue of hooks extracted from posted videos for admin review.

```sql
id UUID PRIMARY KEY
source_video_id UUID NOT NULL REFERENCES videos(id)
product_id UUID REFERENCES products(id)
brand_name TEXT

hook_type TEXT NOT NULL -- 'spoken', 'visual', 'text'
hook_text TEXT NOT NULL
hook_hash TEXT NOT NULL

status TEXT DEFAULT 'pending' -- 'pending', 'approved', 'rejected'
reviewed_at TIMESTAMPTZ
reviewed_by UUID
review_note TEXT

created_at TIMESTAMPTZ
```

**Used by:** Hook Suggestions Admin Page

---

### script_library

**Purpose:** Proven/approved scripts for reuse.

```sql
id UUID PRIMARY KEY
product_id UUID REFERENCES products(id)
brand_name TEXT NOT NULL
concept_id UUID REFERENCES concepts(id)
source_video_id UUID REFERENCES videos(id)

script_text TEXT NOT NULL
script_hash TEXT NOT NULL

-- Hook details
hook_spoken TEXT
hook_visual TEXT
hook_text TEXT
hook_family TEXT
tone_preset TEXT

-- Stats
is_winner BOOLEAN DEFAULT FALSE
used_count INT DEFAULT 0
approved_count INT DEFAULT 0
posted_count INT DEFAULT 0

approved_by TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ

UNIQUE(brand_name, script_hash)
```

**Used by:** Script Library Admin Page

---

## Subscription & Credits

### subscription_plans

**Purpose:** Available subscription tiers with pricing and limits.

```sql
id TEXT PRIMARY KEY -- 'free', 'starter', 'pro', 'team'
name TEXT NOT NULL
description TEXT
price_monthly INT DEFAULT 0 -- Cents
price_yearly INT DEFAULT 0
credits_per_month INT DEFAULT 0
max_products INT DEFAULT 10 -- -1 = unlimited
max_team_members INT DEFAULT 1
max_saved_skits INT DEFAULT 3
features JSONB DEFAULT '[]'
stripe_price_id_monthly TEXT
stripe_price_id_yearly TEXT
is_active BOOLEAN DEFAULT TRUE
sort_order INT DEFAULT 0
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**RLS:** Anyone can view active plans.

**Used by:** Upgrade Page, Account Settings

---

### user_subscriptions

**Purpose:** User's current subscription status.

```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE
plan_id TEXT NOT NULL REFERENCES subscription_plans(id) DEFAULT 'free'
status TEXT CHECK (IN 'active', 'canceled', 'past_due', 'trialing', 'paused')
billing_period TEXT CHECK (IN 'monthly', 'yearly')

-- Stripe
stripe_customer_id TEXT
stripe_subscription_id TEXT

-- Dates
current_period_start TIMESTAMPTZ
current_period_end TIMESTAMPTZ
canceled_at TIMESTAMPTZ
trial_end TIMESTAMPTZ

created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**RLS:** Users can only view/modify their own subscription.

**Used by:** Account Settings, Credit Display, Upgrade Flow

---

### user_credits

**Purpose:** Credit balance and usage tracking.

```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE
credits_remaining INT DEFAULT 5
credits_used_this_period INT DEFAULT 0
lifetime_credits_used INT DEFAULT 0
free_credits_total INT DEFAULT 5
free_credits_used INT DEFAULT 0
period_start TIMESTAMPTZ
period_end TIMESTAMPTZ
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**Functions:**
- `deduct_credit(user_id, description, skit_id)` - Atomically deduct 1 credit
- `add_credits(user_id, amount, type, description)` - Add credits
- `reset_monthly_credits(user_id)` - Reset for subscription renewal

**RLS:** Users can only view/modify their own credits.

**Used by:** Skit Generator, Credit Display, Account Settings

---

### credit_transactions

**Purpose:** Audit log of all credit changes.

```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES auth.users(id)
type TEXT CHECK (IN 'generation', 'refund', 'purchase', 'bonus', 'reset', 'subscription_renewal')
amount INT NOT NULL -- Positive = add, negative = deduct
balance_after INT NOT NULL
description TEXT
metadata JSONB DEFAULT '{}'
skit_id UUID REFERENCES saved_skits(id)
created_at TIMESTAMPTZ
```

**RLS:** Users can only view their own transactions.

**Used by:** Account/Billing History

---

## Video Workflow

### video_events

**Purpose:** Audit trail for video state changes.

```sql
id UUID PRIMARY KEY
video_id UUID NOT NULL REFERENCES videos(id)
event_type TEXT NOT NULL
actor TEXT -- User email or 'system'
payload JSONB DEFAULT '{}'
created_at TIMESTAMPTZ
```

**Used by:** Video Timeline, Audit Log

---

### notifications

**Purpose:** User notifications for assignments and handoffs.

```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES auth.users(id)
type TEXT NOT NULL -- 'assigned', 'assignment_expired', 'handoff'
video_id UUID REFERENCES videos(id)
payload JSONB
is_read BOOLEAN DEFAULT FALSE
created_at TIMESTAMPTZ
```

**RLS:** Users can only see their own notifications.

**Used by:** Workbench Notification Panel

---

### audit_log

**Purpose:** System-wide audit log with correlation IDs.

```sql
id UUID PRIMARY KEY
correlation_id TEXT NOT NULL
event_type TEXT NOT NULL -- 'video.posted', 'hook.approved', etc.
entity_type TEXT NOT NULL -- 'video', 'hook', 'product'
entity_id TEXT
actor TEXT -- User ID or 'system'
summary TEXT NOT NULL
details JSONB DEFAULT '{}'
created_at TIMESTAMPTZ
```

**Used by:** Audit Log Admin Page

---

## User Management

### user_roles

**Purpose:** User role assignments for pipeline access.

```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES auth.users(id)
role TEXT CHECK (IN 'admin', 'recorder', 'editor', 'uploader')
assigned_by TEXT
assigned_at TIMESTAMPTZ DEFAULT NOW()
```

**Used by:** Auth, Role-based Access Control

---

### user_profiles

**Purpose:** Extended user profile information.

```sql
user_id UUID PRIMARY KEY REFERENCES auth.users(id)
role TEXT -- 'admin', 'recorder', 'editor', 'uploader'
display_name TEXT
avatar_url TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**Used by:** Profile Display, Auth Context

---

## Quick Reference

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `products` | Product catalog | id, name, brand, benefits, category |
| `videos` | Video pipeline | id, recording_status, assigned_to, posted_url |
| `concepts` | Creative briefs | id, product_id, angle, hook_options |
| `saved_skits` | User skit library | id, title, skit_data, status, user_id |
| `skit_ratings` | Skit feedback | id, rating, feedback, user_id |
| `skit_budget` | Rate limiting | org_id, user_id, points |
| `audience_personas` | Target audiences | id, name, pain_points, tone, phrases_they_use |
| `pain_points` | Customer struggles | id, pain_point, category, how_they_describe_it |
| `language_patterns` | Effective phrases | id, pattern_type, pattern_text, times_used |
| `reference_videos` | Winners bank | id, url, status, category |
| `reference_extracts` | Extracted hooks | reference_video_id, spoken_hook, cta |
| `proven_hooks` | Hooks with stats | id, hook_text, hook_type, winner_count |
| `hook_suggestions` | Pending hook review | id, hook_text, status, source_video_id |
| `script_library` | Proven scripts | id, script_text, is_winner, posted_count |
| `subscription_plans` | Plan definitions | id, name, credits_per_month, price_monthly |
| `user_subscriptions` | User plan status | user_id, plan_id, status, stripe_subscription_id |
| `user_credits` | Credit balance | user_id, credits_remaining, lifetime_credits_used |
| `credit_transactions` | Credit history | user_id, type, amount, balance_after |
| `video_events` | Video audit trail | video_id, event_type, actor |
| `notifications` | User notifications | user_id, type, video_id, is_read |
| `audit_log` | System audit | correlation_id, event_type, entity_id |
| `user_roles` | Role assignments | user_id, role |
| `user_profiles` | Extended profiles | user_id, role, display_name |
| `imported_videos` | Winner video imports | id, video_url, transcript, status |

---

## Migration Files

All schema changes are in `/web/supabase/migrations/`:

| Migration | Description |
|-----------|-------------|
| 001_products_schema | Products table columns |
| 002_concepts_schema | Concepts table |
| 006_video_performance | Video metrics |
| 009_video_events_audit | Video events audit |
| 011_scripts_system | Script system |
| 014_video_execution_tracking | Recording status workflow |
| 016_auth_roles | User roles |
| 017_notifications | Notifications |
| 018_video_assignment | Assignment system |
| 025_ai_generation_logs | AI generation tracking |
| 028_concepts_scripts_hooks | Script library, proven hooks |
| 030_winners_bank | Reference videos system |
| 035_hook_suggestions | Hook suggestion queue |
| 038_audit_log | System audit log |
| 039_skit_budget | Rate limiting |
| 040_skit_ratings | Skit ratings |
| 041_saved_skits | Saved skits |
| 044_video_ingestion | Imported videos |
| 046_audience_personas | Personas, pain points |

Subscription/credits tables are in `/web/001_subscriptions_and_credits.sql` (run manually in Supabase).

---

## Notes & Gotchas

1. **RLS Everywhere**: All tables have Row Level Security enabled. Use `supabaseAdmin` for admin operations.

2. **Soft Deletes**: Most tables don't delete rows - they use status fields instead.

3. **UUID Primary Keys**: All tables use `gen_random_uuid()` for IDs.

4. **Updated At Triggers**: Most tables have automatic `updated_at` triggers.

5. **JSONB for Flexibility**: Complex nested data uses JSONB (skit_data, pain_points, generation_config).

6. **TEXT[] Arrays**: PostgreSQL arrays are used for lists (phrases, benefits, platforms).

7. **Credits System**: Admin users bypass all credit checks via the `isAdmin` flag from user_profiles.role.
