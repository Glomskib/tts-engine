# FlashFlow AI - API Reference

**Total Routes:** 231

All API routes are located under `web/app/api/`. Routes require authentication unless noted otherwise.

---

## Authentication & Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/auth/me` | Yes | Get current authenticated user |
| GET | `/api/auth/plan-status` | Yes | Get user's subscription plan status |
| GET | `/api/auth/runtime-config` | No | Get client-side runtime configuration |
| POST | `/api/auth/upgrade-request` | Yes | Submit a plan upgrade request |

## Health & Status

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | No | Application health check |
| GET | `/api/admin/health` | Admin | Admin health check with diagnostics |
| GET | `/api/admin/enabled` | Yes | Check if admin UI is enabled |

## AI / Script Generation

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/ai/generate-skit` | Yes | Generate a script using AI (main generator) |
| POST | `/api/ai/generate-content` | Yes | Generate content (general purpose) |
| POST | `/api/ai/refine-skit` | Yes | Refine/iterate on a generated script |
| POST | `/api/ai/rate-skit` | Yes | Rate a script's quality |
| POST | `/api/ai/score-skit` | Yes | Score a script with detailed breakdown |
| POST | `/api/ai/chat` | Yes | AI chat for script assistance |
| POST | `/api/ai/hook-feedback` | Yes | Get AI feedback on a hook |
| POST | `/api/ai/analyze-winner` | Yes | Analyze a winning video with AI |
| POST | `/api/ai/draft-video-brief` | Yes | Generate a video brief from parameters |
| POST | `/api/ai/generate-image` | Yes | Generate an image via Replicate |
| POST | `/api/ai/improve-section` | Yes | Improve a specific section of a script |
| GET | `/api/ai/skit-presets` | Yes | Get available skit presets |
| GET | `/api/ai/skit-templates` | Yes | Get available skit templates |

## Scripts

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/scripts` | Yes | List user's scripts |
| POST | `/api/scripts/generate` | Yes | Generate a new script |
| GET | `/api/scripts/library` | Yes | Browse script library |
| POST | `/api/scripts/feedback` | Yes | Submit script feedback |
| POST | `/api/scripts/rewrite-safer` | Yes | Rewrite script with compliance safety |
| GET | `/api/scripts/[id]` | Yes | Get script by ID |
| POST | `/api/scripts/[id]/approve` | Yes | Approve a script |
| POST | `/api/scripts/[id]/restore` | Yes | Restore a script version |
| POST | `/api/scripts/[id]/rewrite` | Yes | Request script rewrite |
| GET | `/api/scripts/[id]/rewrites` | Yes | Get rewrite history |

## Script Templates

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/script-templates` | Yes | List script templates |
| GET | `/api/script-templates/[id]` | Yes | Get template by ID |

## Skits (Saved Scripts)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/skits` | Yes | List user's saved skits |
| GET | `/api/skits/[id]` | Yes | Get skit by ID |
| DELETE | `/api/skits/[id]` | Yes | Delete a skit |
| POST | `/api/skits/[id]/send-to-video` | Yes | Send skit to video pipeline |

## Products

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/products` | Yes | List user's products |
| POST | `/api/products` | Yes | Create a product |
| GET | `/api/products/[id]` | Yes | Get product by ID |
| PATCH | `/api/products/[id]` | Yes | Update a product |
| DELETE | `/api/products/[id]` | Yes | Delete a product |
| POST | `/api/products/bulk-delete` | Yes | Bulk delete products |
| POST | `/api/products/generate-pain-points` | Yes | AI-generate pain points for a product |

## Brands

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/brands` | Yes | List user's brands |
| POST | `/api/brands` | Yes | Create a brand |
| GET | `/api/brands/[id]` | Yes | Get brand by ID |
| PATCH | `/api/brands/[id]` | Yes | Update a brand |
| DELETE | `/api/brands/[id]` | Yes | Delete a brand |

## Videos

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/videos` | Yes | List videos |
| POST | `/api/videos` | Yes | Create a video |
| GET | `/api/videos/[id]` | Yes | Get video by ID |
| PATCH | `/api/videos/[id]` | Yes | Update a video |
| DELETE | `/api/videos/[id]` | Yes | Delete a video |
| GET | `/api/videos/[id]/details` | Yes | Get video details with relations |
| GET | `/api/videos/[id]/events` | Yes | Get video event history |
| GET | `/api/videos/[id]/execution` | Yes | Get video execution tracking |
| POST | `/api/videos/[id]/assign` | Yes | Assign video to team member |
| POST | `/api/videos/[id]/claim` | Yes | Claim video for editing |
| POST | `/api/videos/[id]/release` | Yes | Release video claim |
| POST | `/api/videos/[id]/complete-assignment` | Yes | Complete a video assignment |
| POST | `/api/videos/[id]/handoff` | Yes | Hand off video to next stage |
| POST | `/api/videos/[id]/mark-posted` | Yes | Mark video as posted |
| POST | `/api/videos/[id]/attach-script` | Yes | Attach script to video |
| POST | `/api/videos/[id]/renew` | Yes | Renew video claim |
| GET | `/api/videos/[id]/script` | Yes | Get video's script |
| POST | `/api/videos/[id]/script/lock` | Yes | Lock script version |
| POST | `/api/videos/[id]/script/unlock` | Yes | Unlock script |
| GET | `/api/videos/[id]/posting` | Yes | Get posting metadata |
| PATCH | `/api/videos/[id]/posting` | Yes | Update posting metadata |
| GET | `/api/videos/[id]/assets` | Yes | List video assets |
| DELETE | `/api/videos/[id]/assets/[assetId]` | Yes | Delete a video asset |
| GET | `/api/videos/queue` | Yes | Get video queue |
| GET | `/api/videos/my-active` | Yes | Get user's active videos |
| POST | `/api/videos/create-from-product` | Yes | Create video from product |
| POST | `/api/videos/from-variant` | Yes | Create video from variant |
| POST | `/api/videos/dispatch` | Yes | Dispatch video to queue |
| POST | `/api/videos/import` | Yes | Import external video |
| GET | `/api/videos/import/[id]` | Yes | Get import status |
| POST | `/api/videos/reclaim-expired` | Yes | Reclaim expired video claims |
| POST | `/api/videos/release-stale` | Yes | Release stale claims |
| POST | `/api/videos/renew-active` | Yes | Renew all active claims |

## Video Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/videos/admin` | Admin | Admin video operations |
| POST | `/api/admin/videos/[video_id]/force-status` | Admin | Force video status change |
| POST | `/api/admin/videos/[video_id]/clear-claim` | Admin | Clear video claim |
| POST | `/api/admin/videos/[video_id]/reset-assignments` | Admin | Reset video assignments |
| POST | `/api/admin/videos/[video_id]/set-project` | Admin | Set video project |
| POST | `/api/admin/videos/[video_id]/set-client-org` | Admin | Set video client org |
| GET | `/api/admin/videos/[video_id]/timeline` | Admin | Get video timeline |
| POST | `/api/admin/videos/[video_id]/winner` | Admin | Mark video as winner |
| POST | `/api/admin/videos/[video_id]/underperform` | Admin | Mark video as underperforming |
| POST | `/api/admin/videos/bulk-winner` | Admin | Bulk mark videos as winners |
| POST | `/api/admin/videos/bulk-underperform` | Admin | Bulk mark videos as underperforming |

## Video Requests

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/video-requests` | Yes | List video requests |
| POST | `/api/video-requests` | Yes | Create video request |
| GET | `/api/video-requests/[id]` | Yes | Get request by ID |
| PATCH | `/api/video-requests/[id]` | Yes | Update request |
| GET | `/api/admin/video-requests` | Admin | List all video requests (admin) |
| GET | `/api/admin/video-requests/[id]` | Admin | Get request details (admin) |
| GET | `/api/editor/video-requests` | Yes | List requests for editor |

## Video Service

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/video-service/inquiry` | Yes | Submit video service inquiry |

## Winners Bank

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/winners` | Yes | List winning videos |
| POST | `/api/winners/submit` | Yes | Submit a winner |
| GET | `/api/winners/[id]` | Yes | Get winner by ID |
| DELETE | `/api/winners/[id]` | Yes | Delete a winner |
| POST | `/api/winners/[id]/analyze` | Yes | Analyze a winner with AI |
| POST | `/api/winners/extract` | Yes | Extract winner data |
| GET | `/api/winners/intelligence` | Yes | Get winners intelligence |
| GET | `/api/winners/context` | Yes | Get winners context for AI |
| GET | `/api/analytics/winners` | Yes | Winners analytics data |
| POST | `/api/admin/winners/quality-check` | Admin | Quality check winners |

## Saved Hooks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/saved-hooks` | Yes | List saved hooks |
| POST | `/api/saved-hooks` | Yes | Save a hook |
| DELETE | `/api/saved-hooks/[id]` | Yes | Delete a saved hook |

## Hooks (Concept-linked)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/hooks` | Yes | List hooks |
| POST | `/api/hooks` | Yes | Create a hook |
| POST | `/api/hooks/generate` | Yes | Generate hooks with AI |
| GET | `/api/hooks/proven` | Yes | Get proven hooks |
| POST | `/api/hooks/feedback` | Yes | Submit hook feedback |

## Hook Suggestions (Admin)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/hook-suggestions` | Admin | List hook suggestions |
| POST | `/api/admin/hook-suggestions/[id]/approve` | Admin | Approve suggestion |
| POST | `/api/admin/hook-suggestions/[id]/reject` | Admin | Reject suggestion |

## Audience Intelligence

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/audience/personas` | Yes | List audience personas |
| POST | `/api/audience/personas` | Yes | Create persona |
| GET | `/api/audience/personas/[id]` | Yes | Get persona by ID |
| PATCH | `/api/audience/personas/[id]` | Yes | Update persona |
| DELETE | `/api/audience/personas/[id]` | Yes | Delete persona |
| GET | `/api/audience/pain-points` | Yes | List pain points |
| POST | `/api/audience/pain-points` | Yes | Create pain point |
| GET | `/api/audience/pain-points/[id]` | Yes | Get pain point |
| DELETE | `/api/audience/pain-points/[id]` | Yes | Delete pain point |
| POST | `/api/audience/analyze-language` | Yes | Analyze audience language |
| POST | `/api/audience/extract-from-reviews` | Yes | Extract insights from reviews |

## Concepts

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/concepts` | Yes | List concepts |
| POST | `/api/concepts` | Yes | Create concept |
| GET | `/api/concepts/[id]` | Yes | Get concept by ID |
| PATCH | `/api/concepts/[id]` | Yes | Update concept |
| DELETE | `/api/concepts/[id]` | Yes | Delete concept |

## Variants

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/variants` | Yes | List variants |
| POST | `/api/variants` | Yes | Create variant |
| POST | `/api/variants/generate` | Yes | Generate variants with AI |
| POST | `/api/variants/evaluate` | Yes | Evaluate variant performance |
| POST | `/api/variants/promote` | Yes | Promote a variant |
| POST | `/api/variants/scale` | Yes | Scale a variant |
| GET | `/api/variants/lineage` | Yes | Get variant lineage tree |

## Iteration Groups

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/iteration-groups` | Yes | List iteration groups |
| POST | `/api/iteration-groups` | Yes | Create iteration group |
| GET | `/api/iteration-groups/[id]` | Yes | Get group by ID |

## Credits & Billing

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/credits` | Yes | Get credit balance |
| GET | `/api/credits/packages` | Yes | List credit packages |
| POST | `/api/credits/purchase` | Yes | Purchase credits |
| GET | `/api/credits/transactions` | Yes | Get credit transaction history |
| POST | `/api/checkout` | Yes | Create Stripe checkout session |
| POST | `/api/admin/init-credits` | Admin | Initialize credits for a user |

## Subscriptions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/subscriptions/checkout` | Yes | Create subscription checkout |
| POST | `/api/subscriptions/portal` | Yes | Get Stripe customer portal URL |
| GET | `/api/subscriptions/status` | Yes | Get subscription status |

## Webhooks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/webhooks/stripe` | Stripe Signature | Handle Stripe webhook events |

## Collections

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/collections` | Yes | List collections |
| POST | `/api/collections` | Yes | Create collection |

## Comments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/comments` | Yes | List comments |
| POST | `/api/comments` | Yes | Create comment |
| DELETE | `/api/comments/[id]` | Yes | Delete comment |

## Scheduled Posts

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/scheduled-posts` | Yes | List scheduled posts |
| POST | `/api/scheduled-posts` | Yes | Create scheduled post |
| GET | `/api/scheduled-posts/[id]` | Yes | Get scheduled post |
| PATCH | `/api/scheduled-posts/[id]` | Yes | Update scheduled post |
| DELETE | `/api/scheduled-posts/[id]` | Yes | Delete scheduled post |

## Dashboard & Activity

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dashboard/stats` | Yes | Get dashboard statistics |
| GET | `/api/activity` | Yes | Get recent activity feed |
| GET | `/api/metrics` | Yes | Get application metrics |

## Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | Yes | List notifications |
| POST | `/api/notifications/mark-read` | Yes | Mark notifications as read |

## Onboarding

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/onboarding/status` | Yes | Get onboarding status |
| POST | `/api/onboarding/dismiss` | Yes | Dismiss onboarding |

## Search

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/search` | Yes | Global search |

## User Settings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/user/settings` | Yes | Get user settings |
| PATCH | `/api/user/settings` | Yes | Update user settings |

## Accounts

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/accounts` | Yes | List posting accounts |
| POST | `/api/accounts` | Yes | Create posting account |
| GET | `/api/accounts/[id]` | Yes | Get account by ID |
| PATCH | `/api/accounts/[id]` | Yes | Update account |
| DELETE | `/api/accounts/[id]` | Yes | Delete account |

## Posting Accounts

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/posting-accounts` | Yes | List posting accounts |

## Team Members

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/team-members` | Yes | List team members |

## TikTok

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tiktok/oembed` | Yes | Get TikTok video oEmbed data |
| GET | `/api/showcase/videos` | Yes | Get showcase videos |

## Upload

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/upload/image` | Yes | Upload an image |

## Ingestion

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/ingestion/jobs` | Yes | List ingestion jobs |
| POST | `/api/ingestion/jobs` | Yes | Create ingestion job |
| GET | `/api/ingestion/jobs/[id]` | Yes | Get job by ID |
| POST | `/api/ingestion/csv` | Yes | Import CSV data |
| POST | `/api/ingestion/tiktok` | Yes | Import TikTok data |

## Enrichment

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/enrichment/status` | Yes | Get enrichment status |
| POST | `/api/enrichment/run` | Yes | Run enrichment pipeline |

## Observability

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/observability/health` | Yes | System health check |
| GET | `/api/observability/queue-health` | Yes | Queue health metrics |
| GET | `/api/observability/queue-summary` | Yes | Queue summary stats |
| GET | `/api/observability/claimed` | Yes | Currently claimed items |
| GET | `/api/observability/stuck` | Yes | Stuck items detection |
| GET | `/api/observability/throughput` | Yes | Throughput metrics |
| GET | `/api/observability/ingestion` | Yes | Ingestion pipeline status |
| GET | `/api/observability/recent-events` | Yes | Recent system events |

## Admin - Analytics

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/analytics/summary` | Admin | Analytics summary |
| GET | `/api/admin/analytics/content` | Admin | Content analytics |
| GET | `/api/admin/analytics/export` | Admin | Export analytics data |

## Admin - Users & Teams

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/users` | Admin | List all users |
| POST | `/api/admin/users/set-plan` | Admin | Set user's plan |
| GET | `/api/admin/editors` | Admin | List editors |
| GET | `/api/admin/user-activity` | Admin | Get user activity |

## Admin - Assignments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/assignments` | Admin | List assignments |
| POST | `/api/admin/assignments/[video_id]/extend` | Admin | Extend assignment |
| POST | `/api/admin/assignments/[video_id]/reassign` | Admin | Reassign video |
| POST | `/api/admin/sweep-assignments` | Admin | Sweep stale assignments |

## Admin - Client Organizations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/client-orgs` | Admin | List client organizations |
| POST | `/api/admin/client-orgs/create` | Admin | Create client org |
| GET | `/api/admin/client-orgs/[org_id]/members` | Admin | List org members |
| POST | `/api/admin/client-orgs/members/set` | Admin | Set org member role |
| POST | `/api/admin/client-orgs/[org_id]/invite` | Admin | Invite user to org |
| POST | `/api/admin/client-orgs/[org_id]/invites/resend` | Admin | Resend invitation |
| POST | `/api/admin/client-orgs/[org_id]/invites/revoke` | Admin | Revoke invitation |
| POST | `/api/admin/client-orgs/[org_id]/members/revoke` | Admin | Remove org member |
| GET | `/api/admin/client-orgs/[org_id]/branding` | Admin | Get org branding |
| POST | `/api/admin/client-orgs/[org_id]/branding/set` | Admin | Set org branding |
| GET | `/api/admin/client-orgs/[org_id]/plan` | Admin | Get org plan |
| POST | `/api/admin/client-orgs/[org_id]/plan/set` | Admin | Set org plan |
| POST | `/api/admin/client-orgs/[org_id]/billing-status/set` | Admin | Set billing status |
| GET | `/api/admin/client-orgs/[org_id]/projects` | Admin | List org projects |
| POST | `/api/admin/client-orgs/[org_id]/projects/create` | Admin | Create org project |
| POST | `/api/admin/client-orgs/[org_id]/projects/[project_id]/archive` | Admin | Archive project |

## Admin - Client Requests

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/client-requests` | Admin | List client requests |
| POST | `/api/admin/client-requests/status` | Admin | Update request status |
| POST | `/api/admin/client-requests/priority` | Admin | Update request priority |
| POST | `/api/admin/client-requests/convert` | Admin | Convert request to video |

## Admin - Clients

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/clients` | Admin | List clients |
| GET | `/api/admin/clients/[id]` | Admin | Get client details |
| GET | `/api/admin/clients/[id]/reports` | Admin | Get client reports |

## Admin - Billing

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/billing/orgs` | Admin | Org billing overview |
| GET | `/api/admin/billing/export` | Admin | Export billing data |

## Admin - Settings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/settings` | Admin | Get system settings |
| POST | `/api/admin/settings/set` | Admin | Update system setting |

## Admin - Upgrade Requests

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/upgrade-requests` | Admin | List upgrade requests |
| POST | `/api/admin/upgrade-requests/resolve` | Admin | Resolve upgrade request |

## Admin - Operations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/ops-metrics` | Admin | Operational metrics |
| GET | `/api/admin/ops-warnings` | Admin | Operational warnings |
| GET | `/api/admin/queue-health` | Admin | Queue health dashboard |
| GET | `/api/admin/audit-log` | Admin | Audit log entries |
| GET | `/api/admin/events` | Admin | System events |
| GET | `/api/admin/performance` | Admin | Performance metrics |
| POST | `/api/admin/backfill-video-codes` | Admin | Backfill video codes |

## Admin - Exports

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/export/content-analytics` | Admin | Export content analytics |
| GET | `/api/admin/export/scripts` | Admin | Export scripts |
| GET | `/api/admin/export/video-requests` | Admin | Export video requests |

## Admin - Products & Brands

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/products` | Admin | List all products (admin view) |
| GET | `/api/admin/brands` | Admin | List all brands (admin view) |

## Client Portal

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/client/videos` | Client | List client's videos |
| GET | `/api/client/videos/[id]` | Client | Get video details |
| GET | `/api/client/my-videos` | Client | List my videos |
| GET | `/api/client/my-videos/[id]` | Client | Get my video details |
| GET | `/api/client/projects` | Client | List client projects |
| GET | `/api/client/projects/[project_id]` | Client | Get project details |
| GET | `/api/client/requests` | Client | List client requests |
| POST | `/api/client/requests/create` | Client | Submit new request |
| GET | `/api/client/requests/[request_id]` | Client | Get request details |
| GET | `/api/client/billing/summary` | Client | Get billing summary |
| GET | `/api/client/branding` | Client | Get org branding |

## Invitations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/invite/accept` | Yes | Accept an invitation |

## Uploader

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/uploader/queue` | Yes | Get uploader queue |

---

## Authentication Methods

- **Yes**: Requires authenticated user via Supabase Auth (`createServerSupabaseClient` + `getUser()`)
- **Admin**: Requires admin role via `getApiAuthContext()` (checks `ADMIN_USERS` env or `user_roles` table)
- **Client**: Requires authenticated client user with org membership
- **Stripe Signature**: Verified via Stripe webhook signing secret
- **No**: Public endpoint, no auth required
