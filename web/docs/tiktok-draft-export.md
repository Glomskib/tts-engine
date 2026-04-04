# TikTok Draft Export

## Overview

FlashFlow's TikTok integration sends rendered videos to the creator's TikTok inbox as drafts. The creator then opens TikTok, attaches TikTok Shop products manually if needed, reviews, and publishes.

## Workflow

```
FlashFlow renders video → Operator clicks "Send to TikTok Draft"
  → Validates rendered video URL
  → Resolves TikTok Content Posting connection
  → Refreshes access token if expired
  → Calls TikTok Content Posting API (PULL_FROM_URL → inbox)
  → Stores publish_id and status on content_item
  → Polls for completion via getPublishStatus
```

## Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `TIKTOK_PARTNER_CLIENT_KEY` or `TIKTOK_CLIENT_KEY` | TikTok app client key |
| `TIKTOK_PARTNER_CLIENT_SECRET` or `TIKTOK_CLIENT_SECRET` | TikTok app client secret |
| `TIKTOK_REDIRECT_URI` | OAuth callback URL (e.g. `https://app.example.com/api/tiktok/callback`) |
| `DRIVE_TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for encrypting OAuth tokens (32 bytes, base64) |

## OAuth / Account Connection

### Connect Flow

1. User navigates to `/admin/settings/tiktok`
2. Clicks "Connect TikTok"
3. `GET /api/tiktok/auth` redirects to TikTok OAuth with:
   - Scopes: `user.info.basic,video.list`
   - CSRF state stored in httpOnly cookie
4. TikTok redirects to `GET /api/tiktok/callback`
5. Callback exchanges code for tokens
6. Connection stored in `tiktok_connections` table (upsert on user_id + open_id)

### Content Posting Connection

For draft export, a separate `tiktok_content_connections` table stores:
- `access_token`, `refresh_token`, `token_expires_at`
- `account_id` (posting account reference)
- `status` (active / disconnected / error)

Token refresh happens automatically when within 1 minute of expiry.

## Draft Export

### Trigger

`POST /api/content-items/[id]/tiktok-draft` with `{ account_id: string }`

### Status Lifecycle

| Status | Meaning |
|--------|---------|
| (null) | Not exported |
| `pending` | Export requested |
| `processing` | Sending to TikTok |
| `sent` | Successfully in TikTok inbox |
| `failed` | Export failed (error stored) |

### Content Item Fields

| Field | Purpose |
|-------|---------|
| `tiktok_draft_status` | Current export status |
| `tiktok_draft_publish_id` | TikTok's publish ID for status polling |
| `tiktok_draft_account_id` | Which TikTok account was used |
| `tiktok_draft_error` | Error message if failed |
| `tiktok_draft_requested_at` | When export was triggered |
| `tiktok_draft_completed_at` | When export succeeded |

### Export Payload

Built from content item fields:
- **Video**: `rendered_video_url` (required)
- **Title/Caption**: caption → primary_hook → title (fallback chain)
- **Hashtags**: appended to title if present
- **Title limit**: 2200 characters (TikTok maximum)

## After Export (Manual Steps)

1. Open TikTok app
2. Find the video in Drafts
3. Attach TikTok Shop product if needed
4. Review caption and hashtags
5. Publish

Product attachment requires manual action — automated TikTok Shop product linking is not supported in this version.

## UI Surfaces

The "Send to TikTok Draft" button appears on:
- **Content item detail** (`/admin/content-items/[id]`) — after the rendered video section
- **Post page** (`/admin/post/[contentItemId]`) — below the video preview

The component (`app/admin/components/TikTokDraftExport.tsx`):
- Auto-detects connected TikTok accounts
- Hides entirely if TikTok Content Posting is not configured
- Shows account picker if multiple accounts
- Polls for status updates every 5 seconds while pending/processing
- Shows post-export next steps on success

TikTok settings page (`/admin/settings/tiktok`) includes:
- Integration overview with all 4 TikTok integrations
- Content Posting connection management
- Draft Export Workflow "How it works" section
- Data controls and setup instructions

## Key Files

| File | Purpose |
|------|---------|
| `lib/tiktok-draft-export.ts` | Core export + polling service |
| `lib/tiktok-content.ts` | TikTok Content API client |
| `app/admin/components/TikTokDraftExport.tsx` | Reusable draft export UI component |
| `app/api/tiktok/auth/route.ts` | OAuth initiation |
| `app/api/tiktok/callback/route.ts` | OAuth callback |
| `app/api/content-items/[id]/tiktok-draft/route.ts` | Draft export API |
| `app/api/tiktok-content/callback/route.ts` | Content posting OAuth callback |
| `app/api/tiktok-content/status/route.ts` | Connection status check |
| `app/api/tiktok-content/disconnect/route.ts` | Disconnect account |
| `app/admin/settings/tiktok/page.tsx` | Full TikTok settings page |

## Limitations

- No automated TikTok Shop product attachment
- Token refresh relies on TikTok's refresh token being valid (typically 365 days)
- Draft export is PULL_FROM_URL — TikTok must be able to access the rendered video URL
- Rate limits apply per TikTok's API quotas
- Requires TikTok Content Posting API access (developer application required)

## What Still Requires TikTok Credentials/Approval

- The OAuth flow requires valid `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`
- Content Posting API requires TikTok developer application approval
- Video-level scopes may require additional permissions depending on TikTok's approval tier
