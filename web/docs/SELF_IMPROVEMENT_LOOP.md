# Self-Improvement Loop

FlashFlow tracks every AI generation, its real-world outcome, and lifecycle events so we can systematically improve prompt quality over time.

## Architecture

```
Generation → Outcome → Weekly Trainer → Mission Control doc
  (hook/script)  (views/rating/reject)      (recommendations)
```

### Tables

| Table | Purpose |
|-------|---------|
| `ff_generations` | One row per AI generation (hook, script, etc.) |
| `ff_outcomes` | Performance data: rating, views, winner/reject status |
| `ff_events` | Lifecycle events: viewed, edited, approved, rejected, regenerated |

### Migration

```
supabase/migrations/20260223000001_ff_self_improvement_loop.sql
```

## API Routes

All routes require admin authentication (session or API key).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/flashflow/generations` | Log a new generation |
| PATCH | `/api/flashflow/generations/:id` | Update generation (status, output) |
| POST | `/api/flashflow/generations/:id/events` | Log lifecycle event |
| POST | `/api/flashflow/outcomes` | Upsert outcome (by generation_id) |
| GET | `/api/flashflow/weekly-report?start&end` | Aggregated stats |
| POST | `/api/flashflow/weekly-trainer/run` | Run trainer, post to MC |

## Using logGeneration

Any endpoint that produces AI output should call `logGeneration()`:

```typescript
import { logGeneration, logGenerationAsync } from '@/lib/flashflow/generations';

// Awaited (when you need the generation ID)
const gen = await logGeneration({
  user_id: auth.user.id,
  template_id: 'hook_v3',
  prompt_version: '1.2.0',
  inputs_json: { product, platform },
  output_text: generatedHook,
  model: 'gpt-4o-mini',
  latency_ms: 1200,
});

// Fire-and-forget (when you don't need the ID)
logGenerationAsync({
  user_id: auth.user.id,
  template_id: 'script_educator',
  prompt_version: '2.0.0',
  inputs_json: { concept_id, product_id },
  output_text: renderedScript,
});
```

## Recording Outcomes

After a generation is used in production, record its outcome:

```bash
curl -X POST /api/flashflow/outcomes \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "generation_id": "uuid-here",
    "rating": 4,
    "is_winner": true,
    "views": 50000,
    "orders": 120,
    "revenue_cents": 360000,
    "tags": ["strong-hook", "good-cta"]
  }'
```

## Weekly Trainer

The trainer aggregates the last 7 days of data and posts a recommendations doc to Mission Control:

```bash
curl -X POST /api/flashflow/weekly-trainer/run \
  -H "Authorization: Bearer $TOKEN"
```

The report includes:
- Top 10 winners (by winner_score or rating+views)
- Bottom 10 losers (rejected or low-rated)
- Regen rate, reject rate, average rating
- Best/worst template_id + prompt_version
- Specific recommended actions

### Mission Control Integration

Set these environment variables:

```
MC_BASE_URL=http://127.0.0.1:3100   # default
MC_API_TOKEN=your-admin-token-here
```

The trainer posts to `POST /api/docs` with category `plans`, lane `FlashFlow`, and tags `weekly-trainer,prompt-optimization`.

## Smoke Tests

```bash
SMOKE_TEST_TOKEN=your-admin-jwt npx tsx scripts/test-flashflow-loop/smoke.ts
```

Runs 8 tests covering happy-path CRUD and auth failure cases.

## Event Types

| Event | Meaning |
|-------|---------|
| `viewed` | User saw the generation |
| `edited` | User modified the output |
| `approved` | User accepted as-is |
| `rejected` | User rejected the output |
| `regenerated` | User requested a new version |
| `posted` | Content was published |
| `feedback` | Free-text feedback recorded |
