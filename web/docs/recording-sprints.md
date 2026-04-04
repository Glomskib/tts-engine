# Recording Sprints

## What Are Recording Sprints?

Recording Sprints turn FlashFlow into a fast execution tool for creators producing batches of videos. Instead of navigating between individual content items, creators work through a focused queue — one hook at a time, with script previews and instant progress tracking.

A sprint takes an experiment's content items and presents them as a guided recording workflow. The creator sees the hook, optionally previews the script, marks it recorded, and moves to the next.

## How They Work With Experiments

```
Experiment (5-10 hook variations)
  → "Start Recording Sprint"
  → Sprint loads all recordable content items
  → Sorts by hook (consistency for batch recording)
  → Creator walks through one at a time
  → Each "Mark Recorded" updates the content item status
  → Sprint ends when all items are recorded or skipped
```

Experiments group content items around a product/hypothesis. Recording Sprints are the execution layer — how those items actually get filmed.

## Workflow

### 1. Start a Sprint

From the Experiments page (`/admin/experiments`), click **Start Recording Sprint** on any experiment with hooks. This:
- Creates a `recording_sprint` record
- Loads all content items in the experiment that haven't been recorded
- Transitions items in `briefing` or `scripted` status to `ready_to_record`
- Redirects to the Sprint Player

### 2. Sprint Player (`/admin/recording-sprint/[id]`)

The player shows:
- **Progress bar** with numbered dots for each item
- **Current hook** in large text
- **Script preview** (collapsible, parsed into sections: hook/beat/cta/overlay)
- **Angle and persona** badges from the experiment creative
- **Actions**: Mark Recorded, Skip, Previous/Next navigation

### 3. Record

Two paths for attaching video:
1. **Mark Recorded in FlashFlow** — creator records externally, clicks "Mark Recorded" to advance
2. **Upload via Drive** — if Drive intake is configured, raw footage uploaded to the content item's Drive folder is automatically detected by the intake worker

### 4. Sprint Completion

When all items are recorded or skipped, the sprint shows a completion summary:
- Total recorded
- Total skipped
- Link to Pipeline (to continue editing workflow)

## Optional Sprint Timer

When creating a sprint via the API with `timer_minutes`, a countdown timer appears in the header. This helps creators maintain focus during batch recording sessions (e.g., "record 8 hooks in 20 minutes").

The timer is informational only — it doesn't auto-end the sprint.

## Pipeline Integration

When a content item is marked recorded:
1. Sprint item status → `recorded`
2. Content item status → `recorded` (pipeline moves forward)
3. If a video URL is provided, it's attached as `raw_video_url`
4. The content item is now ready for the next pipeline stage (editing)

## API

### GET /api/admin/recording-sprints

List sprints. Optional filters: `?status=active`, `?experiment_id=uuid`

### POST /api/admin/recording-sprints

Create a sprint.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `experiment_id` | string | yes | Experiment to create sprint from |
| `timer_minutes` | number | no | Optional focus timer (5-120 min) |

### GET /api/admin/recording-sprints/[id]

Get sprint with all items, content item details, and creative metadata.

### PATCH /api/admin/recording-sprints/[id]

Sprint actions:

| Action | Params | Effect |
|--------|--------|--------|
| `mark_recorded` | `item_id`, optional `video_url` | Mark item recorded, advance sprint |
| `skip` | `item_id` | Skip item, advance sprint |
| `navigate` | `index` | Move to specific item |
| `pause` | — | Pause sprint |
| `resume` | — | Resume sprint |
| `complete` | — | End sprint early |

## Schema

### recording_sprints

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `workspace_id` | TEXT | Owner workspace |
| `experiment_id` | UUID | Source experiment |
| `name` | TEXT | Sprint name (auto-generated) |
| `status` | TEXT | active, paused, completed, cancelled |
| `total_items` | INT | Total items in sprint |
| `completed_items` | INT | Items recorded |
| `skipped_items` | INT | Items skipped |
| `current_index` | INT | Current position |
| `timer_minutes` | INT | Optional timer |
| `started_at` | TIMESTAMPTZ | When sprint started |
| `completed_at` | TIMESTAMPTZ | When sprint finished |

### recording_sprint_items

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `sprint_id` | UUID | Parent sprint |
| `content_item_id` | UUID | Linked content item |
| `sort_order` | INT | Position in queue |
| `status` | TEXT | pending, recording, recorded, skipped |
| `recorded_at` | TIMESTAMPTZ | When recorded |

## How Sprints Speed Up Content Production

1. **No context switching** — creator stays in one focused view instead of navigating between pages
2. **Visual progress** — dot indicators and counters create momentum
3. **Batch mindset** — seeing "3/8" encourages finishing the set
4. **Optional timer** — time pressure helps creators avoid overthinking
5. **Instant pipeline integration** — recorded items flow into editing automatically

## Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260416100000_recording_sprints.sql` | Schema |
| `app/api/admin/recording-sprints/route.ts` | List + create API |
| `app/api/admin/recording-sprints/[id]/route.ts` | Detail + actions API |
| `app/admin/recording-sprint/[id]/page.tsx` | Sprint Player UI |
| `app/admin/experiments/page.tsx` | "Start Recording Sprint" button |
