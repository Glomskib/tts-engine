# Auto Content Experiments

## Overview

Auto Content Experiments lets operators quickly spin up a test batch of hook/script variations from any opportunity in the feed. One click opens a compact modal, picks angles and personas automatically, and generates a full experiment via the existing campaign engine.

## Workflow

```
Opportunity Feed → "Create Experiment" on any ACT_NOW / TEST_SOON card
  → Modal: pick variant count (3-10), optionally select angles
  → Calls POST /api/admin/experiments/auto-generate
  → Resolves cluster → product
  → Auto-picks angles + personas
  → Generates experiment via campaign engine (hooks → scripts → content items)
  → Shows summary with link to experiment detail
```

## API

### POST /api/admin/experiments/auto-generate

**Input:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `cluster_id` | string | required | Trend cluster to base experiment on |
| `variant_count` | number | 5 | Number of variants (clamped 3-10) |
| `angles` | string[] | auto | Angle mix override (max 5) |
| `cta_style` | string | — | Optional CTA style |
| `platform` | string | tiktok | Platform override |

**Default angles** (when none specified): pain/problem, curiosity, contrarian, product demo, story/relatable

**Response (201 or 207):**

```json
{
  "ok": true,
  "data": {
    "experiment_id": "uuid",
    "cluster_id": "uuid",
    "product_name": "Product Name",
    "total_hooks": 5,
    "total_scripts": 5,
    "total_items": 5,
    "matrix_size": 5,
    "angles_used": ["pain/problem", "curiosity", ...],
    "personas_used": ["Mike", "Sarah", ...]
  }
}
```

207 Multi-Status is returned when some variants succeeded but others had errors.

## Matrix Logic

The `buildMatrix()` function calculates the optimal angle/persona/hooks split:

- **≤5 variants**: 1 persona × N angles × 1 hook each
- **>5 variants**: Multiple personas (up to 3) × all angles × hooks per combo (up to 2)

This ensures diversity across both angle and persona dimensions.

## Persona Selection

Auto-picks from a prioritized diverse list: mike, sarah, jessica, david, emily. Count is determined by the matrix calculation.

## Product Resolution

1. Looks for an existing product matching the cluster's display name (case-insensitive)
2. If not found, creates a minimal product record
3. Links the experiment to the product

## UI

The "Create Experiment" button appears on ACT_NOW and TEST_SOON cards in the Opportunity Feed (`/admin/opportunity-feed`).

The modal provides:
- Variant count slider (3-10) with quick/thorough labels
- Optional angle selection chips (auto-picks if none selected)
- Generate button with progress indicator
- Result summary showing hooks, scripts, and content items created
- Link to experiment detail page

## Key Files

| File | Purpose |
|------|---------|
| `app/api/admin/experiments/auto-generate/route.ts` | API endpoint |
| `app/admin/opportunity-feed/page.tsx` | Feed page with experiment modal |
| `lib/campaigns/generate-campaign.ts` | Underlying campaign generation engine |
| `lib/campaigns/types.ts` | CampaignGenerateRequest interface |

## Limitations

- Generation can take up to 2 minutes for 10 variants (maxDuration=120)
- Maximum 10 variants per experiment
- Maximum 5 angles per experiment
- Uses the campaign engine's existing AI generation (Claude Sonnet for scripts)
