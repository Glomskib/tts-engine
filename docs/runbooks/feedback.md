# Feedback System Runbook

## Architecture

Feedback flows through two systems:

1. **FlashFlow Web** (`flashflowai.com`) — where users submit feedback
2. **Mission Control** (`mc.flashflowai.com`) — where admins view and triage feedback

### Data Flow

```
User submits feedback (FlashFlow web)
  → POST /api/feedback (multipart form)
  → Saves to `user_feedback` table (per-user, has screenshot support)
  → Fire-and-forget insert to `ff_feedback_items` (shared MC inbox)
  → Telegram notification to ops channel
  → Issue intake (fingerprint dedup + AI triage)

Admin views feedback (Mission Control)
  → GET /api/feedback (reads ff_feedback_items)
  → PATCH /api/feedback/[id] (update status/priority/assignee/tags)
```

## Tables

### `user_feedback` (FlashFlow web — per-user)
- `id`, `user_id`, `email`, `type`, `title`, `description`
- `screenshot_url`, `page_url`, `user_agent`, `plan_id`
- `status` (new → triaged → in_progress → shipped)
- `priority`, `admin_notes`

### `ff_feedback_items` (Mission Control — shared inbox)
- `id`, `source` (web/telegram/api), `type`, `title`, `description`
- `page`, `device`, `reporter_email`, `reporter_user_id`
- `status` (new/triaged/in_progress/shipped/wontfix)
- `priority` (1-5, lower = higher), `assignee`, `tags`, `notes`
- `raw_json`, `user_feedback_id` (FK back to user_feedback)

## Endpoints

### FlashFlow Web (`flashflowai.com`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/feedback` | User session | Submit feedback (multipart form) |
| GET | `/api/feedback` | User session | List own feedback |
| GET | `/api/feedback?admin=true` | Admin session | List all feedback with stats |
| POST | `/api/feedback` (JSON, action=update) | Admin session | Update status/notes |

### Mission Control (`mc.flashflowai.com`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/feedback` | MC token | List all feedback items |
| POST | `/api/feedback` | MC token | Ingest new feedback from external services |
| PATCH | `/api/feedback/[id]` | MC token | Update status/priority/assignee/tags/notes |

## Testing

### Submit test feedback via FlashFlow web
1. Log in to flashflowai.com
2. Use the feedback widget (bottom-right button on any page)
3. Fill out type, title, description
4. Submit → check Telegram for notification

### Submit test feedback via Mission Control API
```bash
curl -X POST https://mc.flashflowai.com/api/feedback \
  -H "Authorization: Bearer $MISSION_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test feedback","description":"Testing ingestion","type":"other","source":"api"}'
```

### Verify in Mission Control dashboard
1. Go to https://mc.flashflowai.com/feedback
2. Check that the item appears in the inbox
3. Use the status buttons (Triage → Start → Ship) to update

## Monitoring

- Telegram notifications are sent on every feedback submission
- The `ff_feedback_items` table is the source of truth for Mission Control
- The `user_feedback` table has per-user records for user-facing feedback history
