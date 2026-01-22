# Phase 8: Video Pipeline Contract

## Video Statuses

| Status | Description |
|--------|-------------|
| `needs_edit` | Video created, awaiting editor work |
| `ready_to_upload` | Edited and approved, ready for posting |
| `posted` | Published to platform |
| `blocked` | Cannot be posted (compliance/policy) |
| `needs_revision` | Returned for re-edit |

## Required Fields by Status

| Status | Required Fields |
|--------|-----------------|
| `needs_edit` | `variant_id`, `account_id`, `google_drive_url` |
| `ready_to_upload` | above + `final_video_url` |
| `posted` | above + `posted_at`, `platform_video_id` |
| `blocked` | above + `block_reason` |
| `needs_revision` | above + `revision_notes` |

## Allowed Status Transitions

```
needs_edit → ready_to_upload
needs_edit → blocked
ready_to_upload → posted
ready_to_upload → needs_revision
ready_to_upload → blocked
needs_revision → ready_to_upload
needs_revision → blocked
posted → (terminal)
blocked → (terminal, unless unblocked manually)
```

## Idempotency Rules

1. **POST /api/videos**: If `variant_id` + `account_id` already exists with status in (`needs_edit`, `ready_to_upload`, `needs_revision`), return existing record instead of creating duplicate.

2. **PATCH /api/videos/[id]**: Status transitions must follow allowed paths. Reject invalid transitions with 400.

3. **Duplicate prevention**: No two videos with same `variant_id` + `account_id` in queue states (`needs_edit`, `ready_to_upload`, `needs_revision`).

## Standard API Error Format

All endpoints return:

```json
{
  "ok": false,
  "error": "Human-readable error message",
  "code": "OPTIONAL_ERROR_CODE"
}
```

HTTP status codes:
- `400` - Bad request (validation, invalid transition)
- `404` - Resource not found
- `409` - Conflict (duplicate, invalid state)
- `500` - Internal server error

## Claim Workflow

### POST /api/videos/[id]/claim

Claim a queue video for editing. Only videos in queue statuses (`needs_edit`, `ready_to_post`) can be claimed.

**Request body:**
```json
{
  "claimed_by": "editor_username",
  "ttl_minutes": 120
}
```

- `claimed_by` (required): Non-empty string identifying the editor
- `ttl_minutes` (optional): Claim expiration time in minutes (default: 120)

**Success response (200):**
```json
{
  "ok": true,
  "data": {
    "id": "...",
    "claimed_by": "editor_username",
    "claimed_at": "2026-01-21T...",
    "claim_expires_at": "2026-01-21T...",
    ...
  },
  "correlation_id": "vid_..."
}
```

**Error response (400) - Missing claimed_by:**
```json
{
  "ok": false,
  "error": "claimed_by is required and must be a non-empty string",
  "code": "BAD_REQUEST",
  "correlation_id": "vid_..."
}
```

**Error response (409) - Already claimed:**
```json
{
  "ok": false,
  "error": "Video is already claimed",
  "code": "BAD_REQUEST",
  "details": {
    "claimed_by": "other_editor",
    "claim_expires_at": "2026-01-21T..."
  },
  "correlation_id": "vid_..."
}
```

### POST /api/videos/[id]/release

Release a claim on a video.

**Request body:**
```json
{
  "claimed_by": "editor_username",
  "force": false
}
```

- `claimed_by` (required): Must match current claimer unless `force=true`
- `force` (optional): If true, allows release regardless of current claimer

## Invariants (Enforced by Tests)

1. Every video has a valid status from the enum
2. No duplicate `variant_id` + `account_id` in queue states
3. `account_id` is always set (required field)
4. Status transitions follow the allowed graph
5. Queue videos must be claimed before status transitions