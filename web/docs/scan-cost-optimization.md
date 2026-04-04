# Scan Cost Optimization: Cheap Probe + Hash-Based Change Detection

## Overview

Two-stage scan architecture that reduces creator scanning costs by making most scans cheap "did anything change?" checks, and only running full fetch/parsing when a creator's product state actually changed.

## Architecture

```
Scheduler picks due sources
  → Stage A: Cheap Probe (if fingerprint exists)
     → OpenClaw /api/scan/probe
     → Compare fingerprint
     → If unchanged: log probe_unchanged, update timestamps, STOP
     → If changed: continue to Stage B
  → Stage B: Full Fetch
     → OpenClaw /api/scan/creator (existing path)
     → Compute fingerprint from products
     → Compare with stored fingerprint
     → If unchanged: log no_change, STOP (hash-based short-circuit)
     → If changed: ingest → score → cluster → alert
     → Update stored fingerprint
```

## Fingerprint Design

### Product Fingerprint

SHA-256 hash (truncated to 32 chars) of sorted, normalized product data:

```
sort([
  "product_name|product_url|confidence|creator_has_posted",
  ...
]).join("::")
```

Properties:
- **Deterministic**: same products → same hash
- **Stable**: order-independent (sorted)
- **Case-insensitive**: names lowercased
- **Cheap**: simple string concatenation + SHA-256
- **Sensitive**: detects changes in name, URL, confidence, and posted status

### Probe Fingerprint

For lightweight probe responses (count + IDs):

```
"count:N|ids:sorted_ids"
```

## Probe Protocol

### Request (FlashFlow → OpenClaw)

```json
POST /api/scan/probe
{
  "creator_handle": "string",
  "platform": "tiktok",
  "creator_source_id": "uuid",
  "mode": "probe",
  "last_fingerprint": "abc123..." // previous fingerprint for server-side comparison
}
```

### Response (OpenClaw → FlashFlow)

```json
{
  "ok": true,
  "changed": false,
  "fingerprint": "abc123...",
  "product_count": 5,
  "products": [...] // optional, included if changed=true
}
```

### Fallback Behavior

If OpenClaw's probe endpoint returns 404 (not yet implemented), the system falls back to a full fetch scan. No manual intervention needed.

## Scan Logging

Each scan log entry now includes:

| Field | Type | Description |
|-------|------|-------------|
| `scan_mode` | TEXT | `probe`, `full_fetch`, or `legacy` |
| `changed` | BOOLEAN | Whether products changed |
| `fingerprint` | TEXT | Hash at time of scan |
| `observations_updated` | INTEGER | Count of updated (not just created) observations |

### Scan Log Statuses

| Status | Meaning |
|--------|---------|
| `probe_unchanged` | Probe found no changes — full fetch skipped |
| `probe_changed` | Probe detected changes — triggers full fetch |
| `probe_error` | Probe failed — falls back to full fetch |
| `no_change` | Full fetch ran but fingerprint matched |
| `new_products` | New products detected and ingested |
| `updated` | Existing products updated with new data |

## Source State Fields

New fields on `creator_sources`:

| Field | Type | Purpose |
|-------|------|---------|
| `last_probe_at` | TIMESTAMPTZ | When last probe ran |
| `last_probe_status` | TEXT | none, unchanged, changed, error, unsupported |
| `last_source_fingerprint` | TEXT | Current product state hash |
| `last_full_fetch_at` | TIMESTAMPTZ | When last full fetch ran |
| `consecutive_no_change` | INTEGER | How many scans in a row found no change |
| `total_probes` | INTEGER | Lifetime probe count |
| `total_full_fetches` | INTEGER | Lifetime full fetch count |
| `total_probe_savings` | INTEGER | Times a probe saved a full fetch |

## Targeted Recompute

When no change is detected (probe or hash match):
- No ingestion runs
- No observations created or updated
- No opportunities rescored
- No clusters rescored
- Only timestamps and counters updated

When change is detected:
- Only the affected observations are created/updated
- Only linked opportunities are rescored
- Only affected clusters are rescored
- No broad rescan of all clusters

## Adaptive Scheduling Hooks

The `consecutive_no_change` counter enables future adaptive scheduling:
- Creators with 5+ consecutive no-change scans → relax cadence (e.g., 2x interval)
- Creators with frequent changes → keep fast cadence
- Repeated failures → automatic backoff (10+ errors → monitoring_status='error')

These are scaffolded but NOT auto-implemented yet. The counters are tracked, and the scheduling logic can use them when ready.

## Operator Visibility

The scan-ops API (`GET /api/admin/opportunity-radar/scan-ops`) now returns:
- `probes_today` — count of probe scans today
- `full_fetches_today` — count of full fetch scans today
- `total_probe_savings` — all-time probe savings across all sources
- Per-scan: `scan_mode`, `changed`, `consecutive_no_change`
- Per-source: `has_fingerprint`, `consecutive_no_change`

## Cost Reduction Assessment

**Expected savings: 60-80% of full fetch costs** in steady-state operation.

Rationale:
- Most creators don't change their product showcase daily
- After initial scan, most subsequent scans will find no change
- Probe cost is ~10% of full fetch cost (no page rendering/parsing)
- The hash-based short-circuit in the full fetch path provides a second layer of savings even when probes aren't available

**Conservative estimate**: If 70% of scans find no change and probes cost 10% of full scans:
- Old cost: 100 scans × $1 = $100
- New cost: 70 probes × $0.10 + 30 full scans × $1 = $7 + $30 = $37
- **63% reduction**

## Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260417100000_scan_cost_optimization.sql` | Schema changes |
| `lib/opportunity-radar/fingerprint.ts` | Fingerprint computation |
| `lib/opportunity-radar/fingerprint.test.ts` | Fingerprint tests |
| `lib/openclaw/client.ts` | Probe request/response types + `probeCreator()` |
| `lib/jobs/handlers.ts` | Two-stage scan_creator handler |
| `lib/opportunity-radar/scheduler.ts` | `logProbeResult()` + enhanced stats |
| `app/api/webhooks/openclaw/scan-result/route.ts` | Hash comparison on webhook path |
| `app/api/admin/opportunity-radar/scan-ops/route.ts` | Enhanced operator visibility |

## Current Limitations

- Probe endpoint must be implemented on OpenClaw side for Stage A to work (falls back gracefully)
- First scan for any creator always runs full fetch (no fingerprint to compare)
- Adaptive scheduling not yet auto-implemented (counters tracked but not acted on)
- Fingerprint only covers product name, URL, confidence, and posted status — other metadata changes won't trigger
