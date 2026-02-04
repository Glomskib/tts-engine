# FlashFlow AI - API Routes

> Complete reference for all Next.js API routes in the FlashFlow AI platform.
> Routes are organized by functional area with HTTP methods, paths, and descriptions.

## Authentication

All routes require authentication via `getApiAuthContext()` unless explicitly noted as **Public**. Admin routes additionally require admin-level permissions. Client routes require client-org membership. Editor routes require editor role.

---

## Routes by Category

### AI / Script Generation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/analyze-winner` | Analyze a winning video with AI insights |
| POST | `/api/ai/chat` | AI chat completion for interactive assistance |
| POST | `/api/ai/draft-video-brief` | AI-generate a video brief from inputs |
| POST | `/api/ai/generate-content` | Generate content variations for a script |
| POST | `/api/ai/generate-image` | Generate an image via AI (Replicate) |
| GET | `/api/ai/generate-image` | Check image generation status |
| POST | `/api/ai/generate-skit` | Generate a new skit/script from a prompt |
| POST | `/api/ai/hook-feedback` | Get AI feedback on a hook |
| GET | `/api/ai/hook-feedback` | Retrieve hook feedback history |
| POST | `/api/ai/improve-section` | AI-improve a specific script section |
| POST | `/api/ai/rate-skit` | Rate a skit with AI scoring |
| POST | `/api/ai/refine-skit` | Refine/iterate on an existing skit |
| POST | `/api/ai/score-skit` | Score a skit against quality criteria |
| GET | `/api/ai/skit-presets` | List available skit generation presets |
| GET | `/api/ai/skit-templates` | List available skit templates |

### Products & Brands

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | List all products for the current user |
| POST | `/api/products` | Create a new product |
| GET | `/api/products/[id]` | Get a single product by ID |
| PATCH | `/api/products/[id]` | Update a product |
| DELETE | `/api/products/[id]` | Delete a product |
| POST | `/api/products/bulk-delete` | Bulk-delete multiple products |
| POST | `/api/products/generate-pain-points` | AI-generate pain points for a product |
| GET | `/api/products/generate-pain-points` | Check pain point generation status |
| GET | `/api/brands` | List all brands |
| POST | `/api/brands` | Create a new brand |
| GET | `/api/brands/[id]` | Get a single brand by ID |
| PATCH | `/api/brands/[id]` | Update a brand |
| DELETE | `/api/brands/[id]` | Delete a brand |

### Audience / Personas

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/audience/personas` | List audience personas |
| POST | `/api/audience/personas` | Create a new persona |
| GET | `/api/audience/personas/[id]` | Get a persona by ID |
| PATCH | `/api/audience/personas/[id]` | Update a persona |
| DELETE | `/api/audience/personas/[id]` | Delete a persona |
| GET | `/api/audience/pain-points` | List pain points |
| POST | `/api/audience/pain-points` | Create a pain point |
| GET | `/api/audience/pain-points/[id]` | Get a pain point by ID |
| PATCH | `/api/audience/pain-points/[id]` | Update a pain point |
| DELETE | `/api/audience/pain-points/[id]` | Delete a pain point |
| POST | `/api/audience/analyze-language` | AI-analyze language patterns from audience data |
| POST | `/api/audience/extract-from-reviews` | Extract audience insights from product reviews |

### Scripts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scripts` | List scripts for the current user |
| POST | `/api/scripts` | Create a new script |
| GET | `/api/scripts/[id]` | Get a script by ID |
| PUT | `/api/scripts/[id]` | Update a script |
| POST | `/api/scripts/[id]/approve` | Approve a script for production |
| POST | `/api/scripts/[id]/restore` | Restore a previously archived script |
| POST | `/api/scripts/[id]/rewrite` | AI-rewrite a script |
| GET | `/api/scripts/[id]/rewrites` | List rewrite history for a script |
| POST | `/api/scripts/feedback` | Submit feedback on a script |
| GET | `/api/scripts/feedback` | Get feedback for scripts |
| POST | `/api/scripts/generate` | AI-generate a new script |
| POST | `/api/scripts/library` | Add a script to the library |
| GET | `/api/scripts/library` | List scripts in the library |
| POST | `/api/scripts/rewrite-safer` | AI-rewrite with safety guardrails |
| GET | `/api/script-templates` | List script templates |
| POST | `/api/script-templates` | Create a script template |
| GET | `/api/script-templates/[id]` | Get a script template by ID |
| PUT | `/api/script-templates/[id]` | Update a script template |

### Skits

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/skits` | List skits |
| POST | `/api/skits` | Create a new skit |
| GET | `/api/skits/[id]` | Get a skit by ID |
| PATCH | `/api/skits/[id]` | Update a skit |
| DELETE | `/api/skits/[id]` | Delete a skit |
| POST | `/api/skits/[id]/send-to-video` | Convert a skit into a video pipeline entry |

### Hooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/hooks` | List hooks |
| POST | `/api/hooks` | Create a new hook |
| POST | `/api/hooks/feedback` | Submit performance feedback on a hook |
| GET | `/api/hooks/feedback` | Get hook feedback data |
| POST | `/api/hooks/generate` | AI-generate hook variations |
| POST | `/api/hooks/proven` | Submit a proven/tested hook |
| GET | `/api/hooks/proven` | List proven hooks |

### Variants

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/variants` | List script/content variants |
| POST | `/api/variants` | Create a variant |
| POST | `/api/variants/evaluate` | Evaluate variant performance |
| POST | `/api/variants/generate` | AI-generate new variants |
| GET | `/api/variants/lineage` | Get variant lineage/ancestry tree |
| POST | `/api/variants/promote` | Promote a variant to primary |
| POST | `/api/variants/scale` | Scale out variants for testing |

### Concepts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/concepts` | List content concepts |
| POST | `/api/concepts` | Create a new concept |
| GET | `/api/concepts/[id]` | Get a concept by ID |
| PATCH | `/api/concepts/[id]` | Update a concept |
| DELETE | `/api/concepts/[id]` | Delete a concept |

### Videos / Pipeline

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/videos` | List videos |
| POST | `/api/videos` | Create a new video entry |
| GET | `/api/videos/[id]` | Get a video by ID |
| PATCH | `/api/videos/[id]` | Update a video |
| GET | `/api/videos/[id]/details` | Get extended video details |
| GET | `/api/videos/[id]/events` | Get event log for a video |
| PUT | `/api/videos/[id]/execution` | Update video execution/stage data |
| GET | `/api/videos/[id]/assets` | List assets attached to a video |
| POST | `/api/videos/[id]/assets` | Upload/attach an asset to a video |
| GET | `/api/videos/[id]/assets/[assetId]` | Get a specific video asset |
| DELETE | `/api/videos/[id]/assets/[assetId]` | Delete a video asset |
| POST | `/api/videos/[id]/assign` | Assign a video to a team member |
| POST | `/api/videos/[id]/attach-script` | Attach a script to a video |
| POST | `/api/videos/[id]/claim` | Claim a video for editing |
| POST | `/api/videos/[id]/complete-assignment` | Mark an assignment as complete |
| POST | `/api/videos/[id]/handoff` | Hand off a video to the next stage |
| POST | `/api/videos/[id]/mark-posted` | Mark a video as posted |
| GET | `/api/videos/[id]/posting` | Get posting details for a video |
| POST | `/api/videos/[id]/posting` | Set posting details for a video |
| POST | `/api/videos/[id]/release` | Release a claimed video |
| POST | `/api/videos/[id]/renew` | Renew a video claim/assignment |
| GET | `/api/videos/[id]/script` | Get the script attached to a video |
| POST | `/api/videos/[id]/script` | Update the script on a video |
| POST | `/api/videos/[id]/script/lock` | Lock a video's script for editing |
| POST | `/api/videos/[id]/script/unlock` | Unlock a video's script |
| POST | `/api/videos/admin` | Admin-create a video entry |
| POST | `/api/videos/create-from-product` | Create a video from a product selection |
| POST | `/api/videos/dispatch` | Dispatch a video through the pipeline |
| POST | `/api/videos/from-variant` | Create a video from a variant |
| GET | `/api/videos/import` | List imported videos |
| POST | `/api/videos/import` | Import an external video |
| GET | `/api/videos/import/[id]` | Get an imported video by ID |
| PATCH | `/api/videos/import/[id]` | Update an imported video |
| DELETE | `/api/videos/import/[id]` | Delete an imported video |
| GET | `/api/videos/my-active` | List videos currently claimed by the user |
| GET | `/api/videos/queue` | Get the video editing queue |
| POST | `/api/videos/reclaim-expired` | Reclaim expired video claims |
| POST | `/api/videos/release-stale` | Release stale/abandoned video claims |
| POST | `/api/videos/renew-active` | Bulk-renew active video claims |

### Video Requests

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/video-requests` | List video requests |
| POST | `/api/video-requests` | Create a new video request |
| GET | `/api/video-requests/[id]` | Get a video request by ID |
| PATCH | `/api/video-requests/[id]` | Update a video request |
| DELETE | `/api/video-requests/[id]` | Delete a video request |

### Iteration Groups

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/iteration-groups` | List iteration groups |
| GET | `/api/iteration-groups/[id]` | Get an iteration group by ID |

### Winners Bank

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/winners` | List winning videos |
| POST | `/api/winners` | Add a video to the winners bank |
| GET | `/api/winners/[id]` | Get a winner by ID |
| PATCH | `/api/winners/[id]` | Update a winner entry |
| DELETE | `/api/winners/[id]` | Remove from winners bank |
| POST | `/api/winners/[id]/analyze` | AI-analyze a winning video |
| GET | `/api/winners/[id]/analyze` | Get analysis results for a winner |
| GET | `/api/winners/context` | Get contextual data for winner analysis |
| POST | `/api/winners/extract` | Extract patterns from winning videos |
| GET | `/api/winners/intelligence` | Get aggregated winner intelligence/insights |
| POST | `/api/winners/submit` | Submit a video as a winner candidate |

### Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics/winners` | Get winner analytics and trends |
| GET | `/api/dashboard/stats` | Get dashboard summary statistics |
| GET | `/api/metrics` | Get video performance metrics |
| POST | `/api/metrics` | Submit/record performance metrics |

### Posting & Scheduling

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/posting-accounts` | List posting accounts |
| POST | `/api/posting-accounts` | Create a posting account |
| GET | `/api/scheduled-posts` | List scheduled posts |
| POST | `/api/scheduled-posts` | Schedule a new post |
| GET | `/api/scheduled-posts/[id]` | Get a scheduled post by ID |
| PATCH | `/api/scheduled-posts/[id]` | Update a scheduled post |
| DELETE | `/api/scheduled-posts/[id]` | Cancel a scheduled post |
| GET | `/api/uploader/queue` | Get the uploader queue (videos ready to post) |

### Collections

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/collections` | List collections |
| POST | `/api/collections` | Create a new collection |

### Comments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/comments` | List comments (on scripts/videos) |
| POST | `/api/comments` | Add a comment |
| PATCH | `/api/comments/[id]` | Update a comment |
| DELETE | `/api/comments/[id]` | Delete a comment |

### Ingestion

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ingestion/csv` | Import data from CSV upload |
| GET | `/api/ingestion/jobs` | List ingestion jobs |
| GET | `/api/ingestion/jobs/[id]` | Get ingestion job status |
| POST | `/api/ingestion/jobs/[id]` | Retry/update an ingestion job |
| POST | `/api/ingestion/tiktok` | Import data from TikTok |

### Enrichment

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/enrichment/run` | Trigger enrichment processing for pending tasks |
| GET | `/api/enrichment/status` | Get enrichment pipeline status |

### Billing & Credits

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/credits` | Get current credit balance |
| POST | `/api/credits` | Add/adjust credits |
| GET | `/api/credits/packages` | List available credit packages |
| POST | `/api/credits/purchase` | Purchase a credit package |
| GET | `/api/credits/transactions` | List credit transaction history |
| POST | `/api/checkout` | Create a Stripe checkout session |
| POST | `/api/subscriptions/checkout` | Create a subscription checkout session |
| GET | `/api/subscriptions/checkout` | Get checkout session status |
| POST | `/api/subscriptions/portal` | Create a Stripe billing portal session |
| GET | `/api/subscriptions/status` | Get current subscription status |

### Auth & User

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/me` | Get current authenticated user profile |
| GET | `/api/auth/plan-status` | Get user's current plan/subscription status |
| GET | `/api/auth/runtime-config` | Get client-side runtime configuration |
| POST | `/api/auth/upgrade-request` | Submit a plan upgrade request |
| GET | `/api/user/settings` | Get user settings/preferences |
| PATCH | `/api/user/settings` | Update user settings/preferences |
| GET | `/api/accounts` | List user accounts |
| POST | `/api/accounts` | Create an account |
| PATCH | `/api/accounts/[id]` | Update an account |
| GET | `/api/onboarding/status` | Get onboarding progress |
| POST | `/api/onboarding/dismiss` | Dismiss an onboarding step |
| GET | `/api/notifications` | List user notifications |
| POST | `/api/notifications/mark-read` | Mark notifications as read |
| GET | `/api/team-members` | List team members for display name mapping |
| GET | `/api/activity` | Get user activity feed |
| POST | `/api/activity` | Log a user activity event |
| GET | `/api/search` | Global search across videos, scripts, clients |

### Editor Portal

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/editor/video-requests` | List video requests assigned to current editor |
| PATCH | `/api/editor/video-requests` | Update editor video request status |

### Client Portal

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/client/billing/summary` | Get client billing summary |
| GET | `/api/client/branding` | Get client branding/theme settings |
| GET | `/api/client/my-videos` | List client's videos |
| GET | `/api/client/my-videos/[id]` | Get a client video by ID |
| PATCH | `/api/client/my-videos/[id]` | Client feedback/update on a video |
| GET | `/api/client/projects` | List client projects |
| GET | `/api/client/projects/[project_id]` | Get a client project by ID |
| GET | `/api/client/requests` | List client video requests |
| GET | `/api/client/requests/[request_id]` | Get a client request by ID |
| POST | `/api/client/requests/create` | Submit a new client video request |
| GET | `/api/client/videos` | List client-visible videos |
| GET | `/api/client/videos/[id]` | Get a client-visible video by ID |

### Invite

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/invite/accept` | Accept an organization invite (Bearer token auth) |
| GET | `/api/invite/accept` | Get invite details for display |

### Observability / Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/observability/health` | System health check (internal) |
| GET | `/api/observability/claimed` | List currently claimed videos |
| GET | `/api/observability/ingestion` | Ingestion pipeline health |
| GET | `/api/observability/queue-health` | Video queue health metrics |
| GET | `/api/observability/queue-summary` | Queue summary statistics |
| GET | `/api/observability/recent-events` | Recent system events |
| GET | `/api/observability/stuck` | Detect stuck/stalled videos |
| GET | `/api/observability/throughput` | Pipeline throughput metrics |

### Admin

#### Admin - Analytics & Exports

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/analytics/content` | Content performance analytics |
| GET | `/api/admin/analytics/export` | Export analytics data |
| GET | `/api/admin/analytics/summary` | Analytics summary/overview |
| GET | `/api/admin/export/content-analytics` | Export content analytics as CSV |
| GET | `/api/admin/export/scripts` | Export scripts as CSV |
| GET | `/api/admin/export/video-requests` | Export video requests as CSV |

#### Admin - Client Organizations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/client-orgs` | List all client organizations |
| POST | `/api/admin/client-orgs` | Create a client organization |
| POST | `/api/admin/client-orgs/create` | Create a client organization (alternate) |
| POST | `/api/admin/client-orgs/members/set` | Set member roles in an organization |
| POST | `/api/admin/client-orgs/[org_id]/billing-status/set` | Set org billing status |
| GET | `/api/admin/client-orgs/[org_id]/branding` | Get org branding settings |
| POST | `/api/admin/client-orgs/[org_id]/branding/set` | Update org branding settings |
| GET | `/api/admin/client-orgs/[org_id]/invite` | List org invites |
| POST | `/api/admin/client-orgs/[org_id]/invite` | Send an org invite |
| POST | `/api/admin/client-orgs/[org_id]/invites/resend` | Resend a pending invite |
| POST | `/api/admin/client-orgs/[org_id]/invites/revoke` | Revoke a pending invite |
| GET | `/api/admin/client-orgs/[org_id]/members` | List org members |
| POST | `/api/admin/client-orgs/[org_id]/members/revoke` | Remove a member from org |
| GET | `/api/admin/client-orgs/[org_id]/plan` | Get org plan details |
| POST | `/api/admin/client-orgs/[org_id]/plan/set` | Set org plan |
| GET | `/api/admin/client-orgs/[org_id]/projects` | List org projects |
| POST | `/api/admin/client-orgs/[org_id]/projects/create` | Create a project in org |
| POST | `/api/admin/client-orgs/[org_id]/projects/[project_id]/archive` | Archive a project |

#### Admin - Client Requests

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/client-requests` | List all client video requests |
| POST | `/api/admin/client-requests/convert` | Convert a request into a video task |
| POST | `/api/admin/client-requests/priority` | Set request priority |
| POST | `/api/admin/client-requests/status` | Update request status |

#### Admin - Clients

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/clients` | List all clients |
| POST | `/api/admin/clients` | Create a client |
| GET | `/api/admin/clients/[id]` | Get a client by ID |
| PATCH | `/api/admin/clients/[id]` | Update a client |
| DELETE | `/api/admin/clients/[id]` | Delete a client |
| GET | `/api/admin/clients/[id]/reports` | Get client reports/analytics |

#### Admin - Videos

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/video-requests` | List all video requests (admin view) |
| PATCH | `/api/admin/video-requests` | Bulk-update video requests |
| GET | `/api/admin/video-requests/[id]` | Get a video request by ID |
| PATCH | `/api/admin/video-requests/[id]` | Update a video request |
| POST | `/api/admin/videos/[video_id]/clear-claim` | Clear a video claim |
| POST | `/api/admin/videos/[video_id]/force-status` | Force-set video status |
| POST | `/api/admin/videos/[video_id]/reset-assignments` | Reset all assignments on a video |
| POST | `/api/admin/videos/[video_id]/set-client-org` | Assign video to a client org |
| POST | `/api/admin/videos/[video_id]/set-project` | Assign video to a project |
| GET | `/api/admin/videos/[video_id]/timeline` | Get video timeline/history |
| POST | `/api/admin/videos/[video_id]/underperform` | Mark video as underperforming |
| GET | `/api/admin/videos/[video_id]/underperform` | Get underperform status |
| POST | `/api/admin/videos/[video_id]/winner` | Mark video as a winner |
| GET | `/api/admin/videos/[video_id]/winner` | Get winner status |
| POST | `/api/admin/videos/bulk-underperform` | Bulk-mark videos as underperforming |
| POST | `/api/admin/videos/bulk-winner` | Bulk-mark videos as winners |

#### Admin - Assignments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/assignments` | List all video assignments |
| POST | `/api/admin/assignments/[video_id]/extend` | Extend an assignment deadline |
| POST | `/api/admin/assignments/[video_id]/reassign` | Reassign a video to another editor |
| POST | `/api/admin/sweep-assignments` | Sweep and clean up expired assignments |

#### Admin - Users & Billing

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users/set-plan` | Set a user's plan |
| GET | `/api/admin/billing/export` | Export billing data |
| GET | `/api/admin/billing/orgs` | List org billing details |
| POST | `/api/admin/init-credits` | Initialize credit allocations |
| GET | `/api/admin/init-credits` | Get credit initialization status |
| GET | `/api/admin/upgrade-requests` | List upgrade requests |
| POST | `/api/admin/upgrade-requests/resolve` | Resolve an upgrade request |

#### Admin - Hooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/hook-suggestions` | List pending hook suggestions |
| POST | `/api/admin/hook-suggestions/[id]/approve` | Approve a hook suggestion |
| POST | `/api/admin/hook-suggestions/[id]/reject` | Reject a hook suggestion |

#### Admin - Winners

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/winners/quality-check` | Run quality check on winner entries |

#### Admin - Settings & Configuration

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/settings` | Get admin settings |
| POST | `/api/admin/settings/set` | Update admin settings |
| GET | `/api/admin/enabled` | Check if admin features are enabled |
| GET | `/api/admin/brands` | List brands (admin view) |
| POST | `/api/admin/brands` | Create a brand (admin) |
| GET | `/api/admin/products` | List products (admin view) |
| POST | `/api/admin/products` | Create a product (admin) |
| GET | `/api/admin/editors` | List editors/team members |

#### Admin - Monitoring & Ops

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/audit-log` | View audit log entries |
| GET | `/api/admin/events` | List system events |
| GET | `/api/admin/health` | Admin health check |
| GET | `/api/admin/ops-metrics` | Operational metrics dashboard data |
| GET | `/api/admin/ops-warnings` | Active operational warnings |
| GET | `/api/admin/performance` | Performance metrics |
| GET | `/api/admin/queue-health` | Video queue health |
| GET | `/api/admin/user-activity` | User activity reports |

#### Admin - Dev Tools

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/backfill-video-codes` | Backfill missing video codes |
| GET | `/api/admin/backfill-video-codes` | Check backfill status |
| POST | `/api/admin/dev/reset-video-ready` | Reset a video to ready state (dev) |
| POST | `/api/admin/dev/seed-postable-video` | Seed a postable video for testing (dev) |

### Public Endpoints

These routes do **not** require authentication:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Application health check |
| GET | `/api/showcase/videos` | Public video showcase gallery |
| GET | `/api/tiktok/oembed` | TikTok oEmbed proxy for video embeds |
| POST | `/api/video-service/inquiry` | Submit a video service inquiry (lead form) |
| POST | `/api/webhooks/stripe` | Stripe webhook receiver (verified via signature) |
| GET | `/api/invite/accept` | Get invite details for display (no sensitive data) |
| GET | `/api/credits/packages` | List available credit packages for pricing display |
| GET | `/api/test-replicate` | Test Replicate API connectivity |

---

## Route Count Summary

| Category | Routes |
|----------|--------|
| AI / Script Generation | 15 |
| Products & Brands | 15 |
| Audience / Personas | 12 |
| Scripts | 18 |
| Skits | 6 |
| Hooks | 7 |
| Variants | 7 |
| Concepts | 5 |
| Videos / Pipeline | 34 |
| Video Requests | 5 |
| Iteration Groups | 2 |
| Winners Bank | 11 |
| Analytics | 4 |
| Posting & Scheduling | 6 |
| Collections | 2 |
| Comments | 4 |
| Ingestion | 5 |
| Enrichment | 2 |
| Billing & Credits | 9 |
| Auth & User | 14 |
| Editor Portal | 2 |
| Client Portal | 12 |
| Invite | 2 |
| Observability / Health | 8 |
| Admin | 65+ |
| Public | 8 |
| **Total** | **~260** |
