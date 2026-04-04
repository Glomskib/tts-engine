# Feature Maturity Map

**Date:** 2026-03-09
**Purpose:** Track which features are customer-ready, beta, internal, or hidden

## Maturity Levels

| Level | Meaning | Nav Visibility |
|-------|---------|---------------|
| **Launch-Ready** | Fully functional, good empty states, no missing dependencies | Visible to all eligible users |
| **Beta** | Functional but data-dependent or newly shipped — may show empty dashboards for new users | Visible with "Beta" badge |
| **Internal** | Admin/owner tools not intended for customers | Hidden from customer nav (`adminOnly` or `ownerOnly`) |
| **Hidden** | Exists as a route but not linked from navigation | Not in sidebar; only reachable by direct URL |

## Customer-Facing Features (SaaS)

### HOME

| Feature | Route | Maturity | Notes |
|---------|-------|----------|-------|
| Command Center | `/admin` | Launch-Ready | Dashboard hub with queues, quick actions. Empty pipeline shows "Generate a new campaign" CTA. |
| Creator Dashboard | `/admin/creator` | Launch-Ready | Shows recording/editing/posting queues and top video. Good empty states per queue. |

### CREATE

| Feature | Route | Maturity | Notes |
|---------|-------|----------|-------|
| Content Studio | `/admin/content-studio` | Launch-Ready | Core script generation tool. Feature-gated. |
| Hook Generator | `/admin/hook-generator` | Launch-Ready | Standalone hook creation tool. |
| Script Library | `/admin/script-library` | Launch-Ready | Saved scripts + hooks tab. Plan-gated (creator_lite). |
| Comment Reply Creator | `/admin/tools/tok-comment` | Launch-Ready | TikTok comment reply tool. |
| Transcriber | `/admin/transcribe` | Launch-Ready | TikTok video transcription. |
| YT Transcriber | `/admin/youtube-transcribe` | Launch-Ready | YouTube video transcription. |

### PIPELINE

| Feature | Route | Maturity | Notes |
|---------|-------|----------|-------|
| Production Console | `/admin/production` | Launch-Ready | Shows work cards, pressure panel, velocity. Empty pipeline shows CTA. Plan-gated. |
| Content Items | `/admin/content-items` | Launch-Ready | Central content index. |
| Content Planner | `/admin/calendar` | Launch-Ready | Calendar scheduling. Plan-gated. |
| Production Board | `/admin/pipeline` | Launch-Ready | Kanban-style pipeline tracking. Plan-gated. |
| Drive Intake | `/admin/intake` | Launch-Ready | Google Drive import (config-dependent: needs Drive connection). Plan-gated. |
| Posting Queue | `/admin/posting-queue` | Launch-Ready | Ready-to-publish queue. Plan-gated. |

### RESEARCH & ANALYTICS

| Feature | Route | Maturity | Notes |
|---------|-------|----------|-------|
| Speak To Your Audience | `/admin/audience` | Launch-Ready | Persona builder with demographics and psychographics. |
| Winners Bank | `/admin/winners` | Launch-Ready | Reference video collection with AI analysis. Users can add winners manually. |
| Winner Patterns | `/admin/intelligence/winners-bank` | **Beta** | Needs metrics data + detect-winners cron output. Shows "No winning patterns yet" with "Run Detection" CTA. |
| Hook Library | `/admin/hooks` | Launch-Ready | Redirects to Script Library hooks tab. |
| Hook Performance | `/admin/intelligence/hooks` | **Beta** | Needs hook analytics data from posted content. Shows zero stats and "post more content" guidance. |
| Performance | `/admin/performance` | **Beta** | Needs metrics snapshots from metrics-sync cron. Shows helpful empty state with guidance. |
| Clip Index | `/admin/clip-index` | **Beta** | Populated by clip-discover/clip-analyze crons. Plan-gated with blur overlay for non-Pro. Shows "No clips indexed yet" for Pro users. |

### PRODUCTS

| Feature | Route | Maturity | Notes |
|---------|-------|----------|-------|
| Products | `/admin/products` | Launch-Ready | Product catalog. Feature-gated. |
| Brands | `/admin/brands` | Launch-Ready | Brand management. Plan-gated. |
| Briefs | `/admin/briefs` | Launch-Ready | Brand brief analysis with income projections. |
| Experiments | `/admin/experiments` | **Beta** | A/B testing with recording sprints. Functional but advanced. Plan-gated. |
| Retainers & Bonuses | `/admin/retainers` | **Beta** | Agency retainer tracking. Functional but niche — most creators won't have retainer data. Plan-gated. |
| Opportunity Radar | `/admin/opportunity-radar` | **Internal** | Admin-only page (gates to admin at page level). Moved from customer nav to admin-only. |

### SETTINGS

| Feature | Route | Maturity | Notes |
|---------|-------|----------|-------|
| Settings | `/admin/settings` | Launch-Ready | Core settings hub. |
| Referrals | `/admin/referrals` | Launch-Ready | Referral program with tracking. Plan-gated. |
| Export & Reports | `/admin/export` | Launch-Ready | CSV/PDF exports. Data-dependent but export buttons always work. |

## Internal/Admin Features

### SYSTEM (admin-only in nav)

| Feature | Route | Notes |
|---------|-------|-------|
| System Status | `/admin/settings/system-status` | Service health checks, pipeline health, metrics system |
| Feedback | `/admin/feedback` | User feedback collection |
| Support | `/admin/support` | Support ticket management |
| Users | `/admin/settings/users` | User management |
| Integrations | `/admin/settings/integrations` | Integration configuration |

### COMMAND CENTER (owner-only in nav)

| Feature | Route | Notes |
|---------|-------|-------|
| Overview | `/admin/command-center` | Ops dashboard |
| API Usage | `/admin/command-center/usage` | API cost tracking |
| Campaigns | `/admin/command-center/projects` | Campaign management |
| Jobs | `/admin/command-center/jobs` | Job queue status |
| Idea Dump | `/admin/command-center/ideas` | Idea tracking |
| Finance | `/admin/command-center/finance` | Financial data |
| Agent Scoreboard | `/admin/command-center/agents` | AI agent performance |
| FinOps | `/admin/command-center/finops` | Financial operations |
| Feedback Inbox | `/admin/command-center/feedback` | Feedback review |
| Research | `/admin/command-center/research` | Research hub |
| Ops Health | `/admin/command-center/ops-health` | System health |
| Marketing | `/admin/marketing` | Marketing automation |

### ADMIN-ONLY (in AdminNav horizontal bar)

| Feature | Route | Notes |
|---------|-------|-------|
| Ops | `/admin/ops` | Operational dashboard |
| Ingestion | `/admin/ingestion` | Data ingestion management |
| Hook Review | `/admin/hook-suggestions` | Hook suggestion review |
| Assignments | `/admin/assignments` | Task assignment |
| Users | `/admin/users` | User admin |
| Upgrades | `/admin/upgrade-requests` | Upgrade request queue |
| Client Orgs | `/admin/client-orgs` | Organization management |
| Requests | `/admin/requests` | Feature requests |
| Billing | `/admin/billing` | Billing management |
| Status | `/admin/status` | System status |

## Hidden Pages (not in any nav)

These pages exist as routes but are NOT linked from any navigation. They are only reachable by direct URL or internal links within other pages.

| Route | Purpose | Risk |
|-------|---------|------|
| `/admin/ab-tests` | A/B test management | Low — functional, just not in nav |
| `/admin/second-brain` | Knowledge management | Low — plan-gated |
| `/admin/report-card` | Weekly report card | Low — data-dependent |
| `/admin/marketplace-ops` | Marketplace operations | Low — admin tool |
| `/admin/revenue` | Revenue tracking | Low — data-dependent |
| `/admin/automation` | Automation dashboard | Low — plan-gated |
| `/admin/data-audit` | Data validation | Low — admin tool |
| `/admin/monitoring` | System monitoring | Low — admin tool |
| `/admin/events` | Event log | Low — admin tool |
| `/admin/test-center` | Testing tools | Low — admin tool |

## Video Editing Client Portal

| Feature | Route | Maturity |
|---------|-------|----------|
| Dashboard | `/client` | Launch-Ready |
| Submit Video | `/client/requests/new` | Launch-Ready |
| My Videos | `/client/videos` | Launch-Ready |
| All Requests | `/client/requests` | Launch-Ready |
| Analytics | `/client/analytics` | Launch-Ready |
| Billing | `/client/billing` | Launch-Ready |
| Support | `/client/support` | Launch-Ready |

## Public Pages

All public pages (homepage, features, pricing, blog, free tools, landing pages) are Launch-Ready.

## Changes Made (2026-03-09)

| Change | Reason |
|--------|--------|
| Added `badge` field to NavItem interface | Support Beta/New/Internal badges in sidebar |
| Marked 6 items as Beta in sidebar | Winner Patterns, Hook Performance, Performance, Clip Index, Experiments, Retainers |
| Moved Opportunity Radar to `adminOnly` | Page already requires admin — showing it locked in customer nav was misleading |
| Added badge rendering to AppSidebar | Amber "Beta" pills next to item names |
| Added badge rendering to MobileNavSheet | Consistent badge display on mobile |
| Improved Performance empty state | More descriptive guidance on what to do |
