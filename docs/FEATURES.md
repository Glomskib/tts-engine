# FlashFlow AI - Feature Documentation

## 1. Content Studio (Script Generation)

The core feature of FlashFlow AI. Generates short-form video scripts using Claude AI.

### Content Types
7 content types, each with tailored AI prompting:

| Type | ID | Funnel Stage | Description |
|------|-----|-------------|-------------|
| **Skit** | `skit` | Awareness | Multi-character comedy skits |
| **Top of Funnel** | `tof` | Awareness | Single-person hook/teaser content |
| **Story** | `story` | Awareness | Single-narrator emotional stories |
| **Middle of Funnel** | `mof` | Consideration | Product demos, how-it-works |
| **Testimonial** | `testimonial` | Consideration | UGC-style authentic testimonials |
| **Educational** | `educational` | Consideration | Value-packed teaching content |
| **Bottom of Funnel** | `bof` | Conversion | Direct response, urgency-driven |

### Script Structure
All scripts use the same JSON schema regardless of content type:
- `hook_line` - Opening hook (max 150 chars)
- `beats[]` - Timed beats with action, dialogue, on-screen text
- `b_roll[]` - Suggested B-roll shots
- `overlays[]` - Text overlay suggestions
- `cta_line` - Call to action
- `cta_overlay` - CTA text overlay

### Compliance
Scripts are automatically post-processed through a compliance linter:
- Forbidden terms are detected and replaced (medical claims, guarantees, etc.)
- Risk scoring with tier system (SAFE, BALANCED, SPICY)
- Deterministic sanitization ensures consistent output

### Key Files
- `app/admin/content-studio/page.tsx` - Main UI
- `app/api/ai/generate-skit/route.ts` - Generation API
- `lib/ai/outputFormats.ts` - Content-type-specific prompts
- `lib/ai/skitPostProcess.ts` - Compliance post-processing
- `lib/ai/skitBudget.ts` - Rate limiting

---

## 2. Products & Brands

### Products
- CRUD operations for product catalog
- Each product has name, brand, category, pain points, notes
- Products are user-scoped (RLS)
- Bulk delete support
- AI-powered pain point generation
- TikTok showcase URL linking

### Brands
- Separate brand entities for agency management
- Brand guidelines: tone of voice, target audience, colors
- Monthly video quota tracking per brand
- Products link to brands via `brand_id`
- Brand context automatically injected into AI generation

### Key Files
- `app/admin/products/page.tsx` - Products UI
- `app/admin/brands/page.tsx` - Brands UI
- `lib/ai/brandContext.ts` - Brand context for AI
- `lib/brand.ts` - Brand utilities

---

## 3. Video Pipeline

8-state workflow managing videos from script to published.

### Status Flow
```
draft → needs_edit → ready_to_post → posted
         ↓               ↓
       failed          archived
```

### Claim System
- Team members claim videos to work on them
- Claims expire after a configurable period
- Stale claims can be reclaimed or swept
- Role-based claiming (Recorder, Editor, Uploader)

### Assignment System
- Admin assigns videos to specific team members
- Assignments have expiration dates
- Can be extended, reassigned, or reset
- Completion tracking

### Key Files
- `app/admin/pipeline/page.tsx` - Pipeline board
- `lib/video-pipeline.ts` - Status definitions and transitions
- `lib/video-status-machine.ts` - Atomic status transitions
- `lib/video-claim.ts` - Claim management

---

## 4. Winners Bank

Stores and analyzes winning TikTok videos for pattern extraction.

### Features
- Submit winning video URLs
- AI analysis extracts: hooks, CTAs, structure patterns
- Quality scoring (0-100)
- Hook family classification
- Winners Intelligence panel for AI insights
- Winning Hooks tab for saved hooks from generation

### Processing Pipeline
1. URL submitted → status: `queued`
2. File/transcript added → status: `needs_transcription`
3. AI extraction runs → status: `processing`
4. Complete → status: `ready`

### Key Files
- `app/admin/winners-bank/page.tsx` - Winners Bank UI
- `lib/winners/` - Winners module (api, types, intelligence, context)

---

## 5. Analytics

Performance tracking and insights for content.

### Dashboard Components
- **Stat Cards** - Key metrics (views, engagement, conversion)
- **Trends Chart** - Performance over time
- **Top Performers** - Best performing videos
- **Video Length Chart** - Optimal length analysis
- **AI Recommendations** - Actionable suggestions

### Exports
- Content analytics CSV export
- Scripts export
- Video requests export

### Key Files
- `app/admin/analytics/page.tsx` - Analytics dashboard
- `components/analytics/` - Chart components
- `lib/analytics/` - Analytics utilities

---

## 6. Content Calendar

Schedule and plan content publishing.

### Features
- Date-based scheduling of posts
- Drag-and-drop calendar interface
- Status tracking per post
- Integration with video pipeline

### Key Files
- `app/admin/calendar/page.tsx` - Calendar UI
- `app/api/scheduled-posts/route.ts` - Scheduled posts API

---

## 7. Billing & Credits

Freemium model with subscription tiers and credit system.

### SaaS Plans
| Plan | Price | Credits/Month |
|------|-------|---------------|
| Free | $0 | 5 (lifetime) |
| Starter | $9/mo | 75 |
| Creator | $29/mo | 200 |
| Business | $79/mo | 500 |

### Video Editing Plans
| Plan | Price | Videos/Month |
|------|-------|-------------|
| Starter | $497/mo | 30 |
| Growth | $997/mo | 60 |
| Scale | $1,997/mo | 120 |
| Agency | $3,997/mo | 250 |

### Credit Flow
1. New user → 5 free credits (auto-initialized)
2. Credit check before each generation
3. Atomic deduction via database function
4. Transaction logged for audit
5. Monthly reset for paid plans

### Stripe Integration
- Checkout session creation
- Webhook handling (subscription events)
- Customer portal for self-service
- Credit package purchases

### Key Files
- `lib/credits.ts` - Credit system
- `lib/subscriptions.ts` - Subscription management
- `lib/pricing.ts` - Centralized pricing config
- `app/api/webhooks/stripe/route.ts` - Stripe webhooks

---

## 8. Client Portal

White-labeled portal for agency clients.

### Features
- Client dashboard with organization branding
- Video request submission (AI Content + UGC Edit types)
- Request status tracking (5-status workflow)
- Video pipeline tracking
- Project organization
- Billing dashboard (monthly usage)
- Support page

### Invitation System
- Token-based invitation with email
- 7-day expiry with revocation
- Accept flow creates org membership

### Key Files
- `app/client/` - Client portal pages
- `app/api/client/` - Client API routes
- `lib/client-org.ts` - Organization utilities
- `lib/org-invites.ts` - Invitation system

---

## 9. Agency Features

Multi-tenant agency management system.

### Role Hierarchy
```
Admin > Editor > Recorder > Uploader > Client
```

### Features
- **Role-based permissions** - Each role has specific capabilities
- **Client management** - CRUD, status tracking, quotas
- **Multi-brand support** - Brand metadata, guidelines, per-brand quotas
- **Invitation system** - Token-based, email, 7-day expiry, revoke
- **Organization multi-tenancy** - Data isolation, org-scoped access
- **Event audit trail** - Event sourcing for all org activities

### Key Files
- `lib/supabase/api-auth.ts` - Role resolution
- `app/api/admin/client-orgs/` - Client org management APIs
- `lib/subscription.ts` - Org plan resolution

---

## 10. Audience Intelligence

AI-powered audience analysis tools.

### Features
- **Audience Personas** - Create and manage target personas
- **Pain Point Analysis** - Identify and track customer pain points
- **Language Analysis** - Analyze audience communication patterns
- **Review Extraction** - Extract insights from customer reviews

### Key Files
- `app/admin/audience/page.tsx` - Audience UI
- `app/api/audience/` - Audience API routes

---

## 11. Onboarding

Multi-step onboarding wizard for new users.

### Flow
1. Welcome step
2. Create first product
3. Set up brand
4. Generate first script
5. Explore features

### Key Files
- `app/onboarding/` - Onboarding pages
- `components/OnboardingModal.tsx` - Onboarding modal
- `components/OnboardingChecklist.tsx` - Progress checklist

---

## 12. Settings

4-tab settings panel.

| Tab | Description |
|-----|-------------|
| **Account** | Profile, email, password |
| **Subscription** | Plan details, upgrade, billing |
| **Notifications** | Email and in-app notification preferences |
| **Preferences** | Theme, language, defaults |

### Key Files
- `app/admin/settings/page.tsx` - Settings UI
- `app/api/user/settings/route.ts` - Settings API
