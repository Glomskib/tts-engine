# Event OS — MMM Command Center

Internal doc for the operator-facing module that runs Making Miles Matter (MMM,
HHH, FFF) and is structured to host additional nonprofit/event-org "groups"
later (white-label).

## What exists

**Route:** `/admin/command-center/mmm` (owner-gated via `checkIsOwner` server-side)

The page is a server component that calls `getMmmDashboardData()` and composes
13 panels:

1. **Next actions** — hand-curated leverage plays + Operator Checklist
2. **Needs approval** — unified queue across `marketing_posts`, `project_tasks`, `ideas`, `idea_artifacts`
3. **Trigger Bolt/Miles** — buttons that invoke the agent loop
4. **HHH readiness** — computed from `project_tasks` linked to `MMM_HHH_2026`
5. **Sponsor pipeline** — live read of the `mmm-sponsors` CRM pipeline
6. **Events** — FFF (completed) + HHH (countdown)
7. **Tasks by owner** — Brandon / Tim / Josh / Miles
8. **Team** — registry-driven cards
9. **Social media queue** — `marketing_posts` filtered to MMM
10. **Financial summary** — `finance_transactions` joined to MMM initiatives
11. **Meeting notes** — markdown files under `content/meetings/mmm/`
12. **Research queue** — `ideas` tagged `mmm` + `bike-event-research`
13. **Bolt/Miles activity** — `agent_runs` where `agent_id='bolt-miles'` plus demo stubs

## Data tables reused (no new schema)

| Concept | Table | How |
|---|---|---|
| Initiatives | `initiatives` | slug `MMM_*` (HHH, FONDO, SPONSORS, GRANTS) |
| Projects | `cc_projects` | `type='hhh'` or `initiative_id IN (MMM_*)` |
| Tasks | `project_tasks` | linked via `project_id`; ownership in `assigned_agent` |
| Sponsors | `crm_pipelines` (slug `mmm-sponsors`), `crm_deals`, `crm_contacts`, `crm_activities` | preset 7-stage pipeline |
| Social posts | `marketing_posts` | `source='bolt-miles'` for agent drafts; `source='mmm-calendar'` for human-scheduled |
| Finance | `finance_transactions` | filter by `initiative_id`; `meta.is_demo=true` for placeholders |
| Research | `ideas` + `idea_artifacts` | tags `mmm` + `bike-event-research`; `artifact_type='summary'` for meeting notes |
| Agent runs | `agent_runs` | `agent_id='bolt-miles'` |
| Approval state | `meta.requires_approval` + `meta.approval_status` | metadata-only, no new table |

## Real vs demo data

Everything in the dashboard is real, with a few clearly-labeled demo fallbacks
that exist only when there's nothing else to show:

| Surface | State |
|---|---|
| Tasks, owners, projects, finance txs | Real (seed-managed) |
| Social posts (Apr/May calendar) | Real (12 rows in `marketing_posts`) |
| Sponsor pipeline | Real pipeline; seeded deals are tagged `meta.is_demo=true` |
| Research queue | Real (3 ideas tagged); demo fallback only if zero ideas |
| Meeting notes | Real (file-backed) |
| Bolt/Miles activity stream | Real `agent_runs` rows merged with 6 explicit demo stubs (badged "Demo") |
| Operator Checklist statuses | Computed live |

## Approval gate

Every agent-created artifact gets the same metadata contract on insert:

```json
{
  "meta": {
    "source": "agent",
    "agent_id": "bolt-miles",
    "requires_approval": true,
    "approval_status": "pending",
    "approval_type": "social_post | task | research | weekly_digest | meeting_summary",
    "group_slug": "making-miles-matter",
    "is_demo": false,
    "related_event_slug": "fff-2026 | hhh-2026 | null"
  }
}
```

Plus a row-status that prevents auto-publishing:

| Kind | Insert status | On approve | On reject |
|---|---|---|---|
| `social_post` | `marketing_posts.status='cancelled'` | `→ scheduled`, default `scheduled_for=+1h` | stays `cancelled` |
| `weekly_digest` | `marketing_posts.status='cancelled'` | `→ scheduled` | stays `cancelled` |
| `task` | `project_tasks.status='queued'` (existing) | `→ queued` (no-op) | `→ killed` |
| `research` | `ideas.status='inbox'` | `→ queued` | `→ killed` |
| `meeting_summary` | `idea_artifacts` row | meta only | meta only |

## API endpoints

All owner-gated via `getApiAuthContext` + `isOwnerEmail`. All return
`x-correlation-id` header.

```
POST /api/admin/mmm/agent/draft-post           — { event_slug, post_type }
POST /api/admin/mmm/agent/weekly-digest        — {}
POST /api/admin/mmm/agent/research-note        — { event_name, source_url? }
POST /api/admin/mmm/agent/meeting-summary      — { filename? }
POST /api/admin/mmm/approvals/approve          — { kind, id, note? }
POST /api/admin/mmm/approvals/reject           — { kind, id, reason }
```

## Scripts

```
npm run seed:cc                 # seeds MMM initiatives, projects, tasks, ideas, sponsor demo deals, finance demo
npm run mmm:verify              # smoke-tests the data layer (no auth needed)
npm run mmm:weekly              # prints a markdown weekly digest to stdout
npm run mmm:weekly:persist      # also saves the digest as a marketing_posts draft (pending approval)
npx tsx scripts/marketing/publish-mmm-calendar.ts \
  --file content/social/mmm_apr_may_2026_calendar.md \
  --from 2026-04-26 --to 2026-05-31      # publishes calendar to marketing_posts
```

## How to add a second org (white-label primer)

The architecture is registry-driven. To onboard a second nonprofit/event org
without touching dashboard component code:

1. **Pick a `group_slug`** (e.g. `cascade-rides`).
2. **Add initiatives** with slug prefix `<ORG>_*` (e.g. `CASCADE_FALL_2026`).
3. **Add a registry module** at `lib/command-center/<group>/registry.ts` mirroring
   the MMM one — events, team, agents.
4. **Reuse `crm_pipelines`** by creating a new pipeline with slug `<group>-sponsors`.
5. **Reuse `marketing_posts`** by adopting the same metadata contract:
   ```
   meta.group_slug = '<group>'
   meta.requires_approval = true
   meta.source = 'agent' | 'human'
   ```
6. **Reuse `agent_runs`** with a per-org agent identity (e.g. `cascade-helper`).
7. **Add a route** at `/admin/command-center/<group>` that calls a per-group
   `getDashboardData()` — most of the existing `_components` are
   group-agnostic and just need the group's data shape.

What still needs generalization (intentionally deferred):

- The readiness category map is HHH-shaped today (`lib/command-center/mmm/readiness.ts`).
  Splitting into a per-event config will be straightforward but adds surface
  area not needed yet.
- The agent prompts in `lib/command-center/mmm/agent-loop.ts` reference MMM
  voice/brand. Split into a `prompts/` directory keyed by group when needed.

## What still needs real integrations

| Gap | Path forward |
|---|---|
| Auto-publish post-approval | The publisher cron already picks up `status='scheduled'`; verify cadence is right for MMM. |
| Cron for weekly digest | Add `/api/cron/mmm-weekly-digest` route (Bearer-auth, calls `generateWeeklyDigest()`); register in `vercel.json`. |
| Sponsor automation | Wire CRM stage moves to trigger Bolt/Miles outreach drafts. |
| Real registration data | Replace HHH 47/200 / 3/8 sponsor counts in `registry.ts` with a pull from Shopify or the registration platform. |
| Telegram intake | Out of scope — see `web/CLAUDE.md` for the bot-token rules. |

## File map

```
app/admin/command-center/mmm/
  page.tsx                              — server component
  _components/
    Section.tsx                         — primitives (Card, Section, StatusPill, DemoBadge)
    SectionNav.tsx                      — sticky in-page anchor nav
    EventCards.tsx                      — FFF + HHH cards with progress bars
    TasksByOwner.tsx                    — task groups
    TeamPanel.tsx                       — team roster
    SocialQueue.tsx                     — marketing_posts list
    FinancePanel.tsx                    — per-event finance breakdown
    MeetingNotes.tsx                    — file-backed notes
    ResearchQueue.tsx                   — ideas-backed cards
    AgentPanel.tsx                      — Bolt/Miles identity + activity
    NextActions.tsx                     — curated leverage plays
    OperatorChecklist.tsx               — connected/demo at-a-glance
    ApprovalQueue.tsx                   — approve/reject UI (client)
    AgentActions.tsx                    — trigger buttons (client)
    SponsorPanel.tsx                    — CRM pipeline view
    ReadinessPanel.tsx                  — HHH readiness scoring view

lib/command-center/mmm/
  types.ts                              — all MMM types, white-label-aware
  registry.ts                           — team, agents, events
  queries.ts                            — orchestrates all dashboard data
  approvals.ts                          — unified approval queue + decision applier
  agent-loop.ts                         — 4 real Anthropic-backed actions
  sponsors.ts                           — mmm-sponsors pipeline reader
  readiness.ts                          — HHH category scorer
  finance-targets.ts                    — demo finance lines (fallback)
  agent-activity.ts                     — demo activity stubs
  research-seed.ts                      — demo research stubs
  meeting-notes.ts                      — markdown loader

app/api/admin/mmm/
  agent/draft-post/route.ts
  agent/weekly-digest/route.ts
  agent/research-note/route.ts
  agent/meeting-summary/route.ts
  approvals/approve/route.ts
  approvals/reject/route.ts

scripts/
  seed-command-center.ts                — extended for MMM
  mmm-weekly-digest.ts                  — operator digest
  verify-mmm-dashboard.ts               — data-layer smoke test
  marketing/publish-mmm-calendar.ts     — pre-existing publisher

content/
  social/mmm_apr_may_2026_calendar.md
  meetings/mmm/2026-04-26-fff-debrief.md
  meetings/mmm/2026-04-30-hhh-kickoff.md
```
