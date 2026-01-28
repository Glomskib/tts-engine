# TTS Engine Ops Runbook

Internal operations guide for the TTS Engine video pipeline.

---

## Table of Contents

1. [Daily Health Checks](#daily-health-checks)
2. [Common Scenarios](#common-scenarios)
3. [Incident Response](#incident-response)
4. [API Reference](#api-reference)

---

## Daily Health Checks

### Queue Health Dashboard

The admin pipeline page displays a Queue Health card showing:

- **Aging buckets**: Videos grouped by time in current status
  - `<4h` (green) - healthy
  - `4-12h` (neutral) - monitor
  - `12-24h` (warning) - needs attention
  - `>24h` (danger) - stuck

- **Stuck items**: Count of videos in same status >24h

### Check via API

```bash
curl -X GET "https://your-domain.com/api/admin/queue-health" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "ok": true,
  "correlation_id": "vid_1234567890_abc123",
  "data": {
    "stuck_items": [
      {
        "video_id": "uuid",
        "video_code": "VID-001",
        "recording_status": "RECORDED",
        "hours_in_status": 36.5,
        "claimed_by": "user-id",
        "brand_name": "BrandX"
      }
    ],
    "aging_buckets": {
      "under_4h": 12,
      "h4_to_12h": 5,
      "h12_to_24h": 2,
      "over_24h": 1
    },
    "total_in_progress": 20,
    "generated_at": "2024-01-15T10:30:00Z"
  }
}
```

### Daily Checklist

1. Check queue health - any stuck items?
2. Review `>24h` bucket - investigate blockers
3. Release stale claims if needed (Maintenance menu)
4. Check for failed AI generations in logs

---

## Common Scenarios

### Bulk Mark Videos as Winners

Use when multiple videos have proven performance and should feed the winners bank.

**Via UI:**
1. Go to Admin Pipeline page
2. Check boxes next to videos to mark
3. Click "Mark Winner" in the bulk action bar

**Via API:**
```bash
curl -X POST "https://your-domain.com/api/admin/videos/bulk-winner" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "video_ids": ["uuid-1", "uuid-2", "uuid-3"],
    "winner_reason": "High CTR in Q1 campaign",
    "notes": "Batch from TikTok analytics review"
  }'
```

Response:
```json
{
  "ok": true,
  "correlation_id": "vid_1234567890_abc123",
  "data": {
    "total": 3,
    "success_count": 3,
    "error_count": 0,
    "results": [
      {
        "video_id": "uuid-1",
        "ok": true,
        "is_winner": true,
        "views": 15000,
        "orders": 45,
        "winning_hook": "You won't believe this trick..."
      }
    ]
  }
}
```

### Bulk Mark Videos as Underperforming

Use to provide negative signal for hooks that didn't work.

**Via UI:**
1. Go to Admin Pipeline page
2. Check boxes next to underperforming videos
3. Click "Mark Underperform" in the bulk action bar

**Via API:**
```bash
curl -X POST "https://your-domain.com/api/admin/videos/bulk-underperform" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "video_ids": ["uuid-1", "uuid-2"],
    "reason_code": "low_engagement",
    "notes": "Sub 1% CTR after 7 days"
  }'
```

### Quality Gate Override

When marking a winner, the system checks quality thresholds:
- Minimum views (default: 100)
- Minimum orders (default: 1)
- Hook text present
- Script locked

If checks fail, a warning modal appears. Admin can click "Save Anyway" to override.

**Check quality manually:**
```bash
curl -X POST "https://your-domain.com/api/admin/winners/quality-check" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"video_id": "uuid-here"}'
```

Response:
```json
{
  "ok": true,
  "data": {
    "video_id": "uuid-here",
    "passes": false,
    "issues": [
      {
        "code": "LOW_VIEWS",
        "message": "Video has 50 views (minimum: 100)",
        "severity": "warning"
      }
    ],
    "metrics": {
      "views": 50,
      "orders": 2,
      "has_hook": true,
      "has_script": true
    },
    "thresholds": {
      "min_views": 100,
      "min_orders": 1
    }
  }
}
```

---

## Incident Response

### Rate Limit Hit (429 Error)

**Symptoms:**
- API returns 429 status code
- `Retry-After` header indicates wait time
- Error: "Rate limit exceeded"

**Limits:**
- Per-user: 10 requests per 60 seconds
- Per-org: 50 requests per 60 seconds

**Response:**
1. Check the `Retry-After` header for wait time
2. Implement exponential backoff in clients
3. If legitimate high volume, consider:
   - Batching requests (use bulk endpoints)
   - Spreading requests over time

**Example error response:**
```json
{
  "ok": false,
  "error_code": "RATE_LIMITED",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "correlation_id": "vid_1234567890_abc123",
  "details": {
    "retry_after": 45,
    "limit_type": "per_user"
  }
}
```

### Single-Flight Conflict (409 Error)

**Symptoms:**
- API returns 409 status code
- Error: "Generation already in progress"
- Happens when same product_id triggers concurrent AI generations

**What it means:**
- Another request is already generating content for this product
- The system prevents duplicate work

**Response:**
1. Wait for the in-flight generation to complete
2. Poll the video status to see when it's ready
3. Do NOT retry immediately - let the first request finish

**Example error response:**
```json
{
  "ok": false,
  "error_code": "GENERATION_IN_PROGRESS",
  "message": "Generation already in progress for this product",
  "correlation_id": "vid_1234567890_abc123",
  "details": {
    "product_id": "uuid-here"
  }
}
```

### Stuck Video Investigation

When a video is stuck in a status for >24h:

1. **Check the video events:**
   ```bash
   curl "https://your-domain.com/api/videos/UUID/details"
   ```

2. **Common causes:**
   - Missing script (stuck in NEEDS_SCRIPT)
   - Missing final video URL (stuck in EDITED)
   - Claim expired and no one re-claimed
   - AI generation failed silently

3. **Resolution steps:**
   - For missing data: Use admin edit mode to fill fields
   - For expired claims: Release claim and re-assign
   - For AI failures: Check logs, retry generation
   - For blockers: Use force transitions if needed

---

## API Reference

### Error Response Format

All endpoints return standardized error responses:

```json
{
  "ok": false,
  "error_code": "ERROR_CODE",
  "message": "Human-readable message",
  "correlation_id": "vid_1234567890_abc123",
  "details": { }
}
```

The `correlation_id` is also returned in the `x-correlation-id` header for tracing.

### Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/queue-health` | GET | Queue health metrics and stuck items |
| `/api/admin/videos/bulk-winner` | POST | Mark multiple videos as winners |
| `/api/admin/videos/bulk-underperform` | POST | Mark multiple videos as underperforming |
| `/api/admin/winners/quality-check` | POST | Check video quality before marking winner |

### Authentication

All admin endpoints require:
1. Valid session token (via cookie or Bearer token)
2. User must have admin role

Requests without proper auth return:
- 401 Unauthorized - No valid session
- 403 Forbidden - User is not admin

### Rate Limits

| Endpoint Pattern | Per-User Limit | Per-Org Limit |
|-----------------|----------------|---------------|
| `/api/ai/*` | 10/60s | 50/60s |
| Other endpoints | No limit | No limit |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WINNER_MIN_VIEWS` | 100 | Minimum views for quality check |
| `WINNER_MIN_ORDERS` | 1 | Minimum orders for quality check |
| `ADMIN_USERS` | "admin" | Comma-separated admin user IDs |

---

## Contact

For issues not covered here, check:
- Application logs for correlation_id
- Audit log at `/admin/audit-log`
- GitHub issues for known bugs
