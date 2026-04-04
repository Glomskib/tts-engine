# FlashFlow — High-Volume Readiness Standard

Target: **600–1,000 videos/month** per creator/team/agency.

---

## 1. Batch Generation

- [x] Campaign generator creates hooks + scripts + content items in a single flow
- [x] Matrix generation: personas x angles x hooks_per_combo with safeguards (max 50 per campaign)
- [x] Partial success: if generation fails midway, completed items are preserved
- [x] Generation progress is stored in `experiments.campaign_config` JSONB
- [x] Event logging for all campaign generation steps
- [x] 4-step wizard UI: Setup → Personas → Angles → Review/Launch

**Status: Implemented** — `lib/campaigns/generate-campaign.ts`, `/api/campaigns/generate`, `/admin/campaigns/new`

## 2. Campaign / Experiment Grouping

- [x] Content items link to experiments via `content_items.experiment_id`
- [x] Experiment creatives track hook x angle x persona per item
- [x] Experiments page has "Auto Campaign" entry point
- [ ] Pipeline filtering by experiment/campaign (deferred — needs API-level experiment_id filter on videos)
- [ ] Experiments page shows campaign generation progress visually

**Status: Mostly implemented** — DB schema + campaign generator + UI ready. Pipeline-level experiment filter deferred.

## 3. Recording Sprints

- [x] Full-screen recording session view (`RecordingSessionView`)
- [x] Teleprompter mode, large text mode, keyboard shortcuts (J/K/R/Esc)
- [x] One-at-a-time video navigation with skip/mark-recorded actions
- [x] Can be launched from pipeline in "record" mode
- [x] Pack export as ZIP for offline recording

**Status: Implemented** — `components/session/RecordingSessionView.tsx`

## 4. Editing Queue

- [x] Content items have `edit_status` field for render tracking
- [x] Render jobs tracked with `edit_plan_json`, `rendered_video_url`, `render_error`
- [x] Double-render guard (409 conflict + duplicate job check)
- [x] Async render via job queue — `render_video` job type with auto-retry (max 3 attempts)
- [x] Render enqueued via POST /api/content-items/[id]/render (returns 202 with job_id)
- [x] Job runner processes renders in background (cron-polled, 5-min timeout)
- [x] Editing Sprint UI — launchable from pipeline in "edit" mode
- [x] Render Queue Panel shows active jobs + editing pipeline items

**Status: Implemented** — Async render queue via `lib/jobs/`, `RenderQueuePanel.tsx` with job visibility, `EditingSessionView.tsx`

## 5. Production Bottleneck Visibility

- [x] Production Console shows counts by stage
- [x] Production Pressure Panel identifies bottleneck (highest count)
- [x] Pipeline stacked bar shows distribution
- [x] Throughput metrics: created today/week, posted today/week
- [x] Overdue items highlighted with SLA tracking
- [x] "Next Best Action" recommendation on Production Console

**Status: Implemented** — `ProductionPressurePanel`, Production Console with smart action recommender

## 6. Content Velocity Metrics

- [x] Scripts generated per day/week with trend
- [x] Videos recorded per day/week with trend
- [x] Videos edited per day/week with trend
- [x] Videos posted per day/week with trend
- [x] Week-over-week change indicators
- [ ] Experiment hit rate (deferred)

**Status: Implemented** — `ContentVelocityPanel` with today/week/trend for 4 stages

## 7. Scalable Filtering / Search

- [x] Content items API supports: status, brand_id, product_id, assigned, due_start/end, limit/offset
- [x] Pipeline page filters by work mode (scripts, record, edit, publish)
- [x] Experiments page filters by brand and status
- [x] Content items page has status/brand/product filters + search
- [ ] Saved filter presets (deferred)
- [ ] Quick filter chips in pipeline (deferred)

**Status: Mostly implemented** — Core filtering exists. Saved presets and filter chips are nice-to-haves.

## 8. Safe Bulk Actions

- [x] Multi-select in pipeline view
- [x] Bulk pack export (ZIP)
- [ ] Bulk status transitions (agent implementing — mark recorded, mark ready to post, mark posted)
- [ ] Bulk assign (deferred)
- [ ] Bulk render request (deferred — needs render queue)

**Status: Partially implemented** — Multi-select + export exist. Bulk transitions in progress.

## 9. Mobile-Safe Operational Usage

- [x] All admin pages responsive (min-h-screen, mobile padding, bottom nav clearance)
- [x] Touch-friendly targets (min 44px)
- [x] Pull-to-refresh on calendar
- [x] Recording session works on mobile
- [x] Editing sprint works on mobile

**Status: Implemented** — Mobile-first design throughout

## 10. Large List Performance

- [x] Content items API paginated (limit/offset)
- [x] Content items page has "Load More" button
- [x] Pipeline fetches 200 items (increased from 100)
- [x] Calendar uses date-range bounded queries
- [ ] Virtualization for 1000+ items (deferred — would require react-virtualized)
- [ ] Server-side cursor pagination for pipeline (deferred)

**Status: Improved** — Pagination controls added, limits increased. Virtualization deferred.

---

## Deferred Items (Next Pass)

1. **Pipeline experiment filter** — Add `experiment_id` param to video queue API, then filter UI in pipeline
2. **Saved filter presets** — Store named filter combos in localStorage or DB
3. **List virtualization** — react-virtualized or @tanstack/virtual for 1000+ item lists
4. **Bulk status transitions** — Multi-select → bulk "Mark Recorded" / "Mark Ready to Post"
5. **Campaign progress visualization** — Show generation progress in experiments list
6. **Server-side cursor pagination** — Replace offset pagination with cursor-based for better perf

---

## Manual QA Checklist

- [ ] Generate a campaign via `/admin/campaigns/new` with 3 personas x 2 angles x 3 hooks
- [ ] Verify experiment appears in `/admin/experiments` with correct hook count
- [ ] Navigate to pipeline, verify work mode filtering works
- [ ] Launch Recording Sprint from pipeline "record" mode
- [ ] Record 2-3 videos using keyboard shortcuts (J/K/R)
- [ ] Launch Editing Sprint from pipeline "edit" mode
- [ ] Mark 1-2 videos as edited via sprint UI
- [ ] Verify Production Console loads (fix: now uses `/api/videos/queue` instead of broken endpoint)
- [ ] Check "Next Best Action" recommendation matches current pipeline state
- [ ] Check Content Velocity panel shows today/week metrics with trends
- [ ] Check Render Queue panel shows items in editing pipeline
- [ ] Open Content Items page, verify Load More works when >100 items
- [ ] Filter content items by status, brand, product
- [ ] Multi-select videos in pipeline, bulk export as ZIP
- [ ] Verify mobile responsiveness on production console and pipeline
- [ ] Navigate large content list (200+ items) without noticeable lag
