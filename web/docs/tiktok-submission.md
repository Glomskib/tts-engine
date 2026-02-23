# TikTok Developer App Submission

Scope document for TikTok developer app review. Covers all three integrations: Login Kit, Content Posting, and Shop.

---

## Scopes Requested

### Login Kit
- `user.info.basic` — Read basic profile (display_name, avatar_url, open_id)

### Content Posting API
- `video.publish` — Publish videos to user's TikTok account
- `video.upload` — Upload video files for publishing

### Shop API
- `product.read` — Read product catalog from TikTok Shop
- `shop.read` — Read shop metadata (name, region, seller info)

---

## Data Stored

| Integration | Field | Source | PII |
|---|---|---|---|
| Login Kit | `open_id` | TikTok OAuth response | Pseudonymous ID |
| Login Kit | `display_name` | TikTok user profile | Yes |
| Login Kit | `avatar_url` | TikTok user profile | Yes |
| Login Kit | `access_token`, `refresh_token` | OAuth token exchange | Credential |
| Login Kit | `token_expires_at` | OAuth token exchange | No |
| Shop | `shop_id` | TikTok Shop auth | Business ID |
| Shop | `shop_name` | TikTok Shop metadata | Business data |
| Shop | `seller_name`, `seller_region` | TikTok Shop metadata | Business data |
| Shop | `access_token`, `refresh_token` | OAuth token exchange | Credential |
| Content Posting | `open_id` | TikTok OAuth response | Pseudonymous ID |
| Content Posting | `display_name` | TikTok user profile | Yes |
| Content Posting | `privacy_level` | TikTok creator info | No |
| Content Posting | `access_token`, `refresh_token` | OAuth token exchange | Credential |

**Storage:** All data is stored in a Supabase (PostgreSQL) database. Tokens are stored server-side only and never exposed to the client.

---

## Data Retention Policy

- **Access tokens:** Expire per TikTok's schedule (typically 24 hours for Login Kit). Automatically refreshed via refresh token when needed.
- **Refresh tokens:** Stored until disconnect or explicit deletion. Cleared (set to empty string) on disconnect.
- **Profile data:** Display names, avatar URLs, shop names, and seller info are retained until the user disconnects the integration or requests data deletion.
- **On disconnect:** Tokens are cleared and status is set to `disconnected`. Profile data is retained but no longer updated.
- **On data deletion:** All tokens are cleared, all profile/PII fields are nulled, and all integrations are disconnected. This is irreversible.
- **No third-party sharing:** Data is never shared with third parties.

---

## User Data Controls

### Disconnect (per integration)

| Integration | UI Location | API Endpoint |
|---|---|---|
| Login Kit | TikTok Login section → Disconnect button | `POST /api/tiktok/disconnect` |
| Shop | Connection Status section → Disconnect button | `POST /api/tiktok-shop/disconnect` |
| Content Posting | Content Posting section → Unlink button per account | `POST /api/tiktok-content/disconnect` |

### Bulk Data Deletion

- **UI:** TikTok Data Controls section → "Delete All TikTok Data" button
- **API:** `POST /api/tiktok/delete-data`
- **Behavior:** Clears all tokens, nulls all PII fields, sets all connections to `disconnected` across all three tables (`tiktok_login_connections`, `tiktok_shop_connections`, `tiktok_content_connections`)
- **Confirmation:** User must confirm via browser dialog before deletion proceeds

---

## Review Mode

Set the environment variable:

```
NEXT_PUBLIC_TIKTOK_REVIEW_MODE=true
```

When enabled:
- An amber banner appears at the top of the TikTok settings page indicating review mode is active
- A "Review Checklist" button appears in the page header, linking to `/admin/settings/tiktok/review-checklist`
- The checklist page provides a step-by-step guide for recording the Loom demo

---

## Loom Demo Checklist

Record a Loom walkthrough covering these 7 steps:

1. **Demo Login Kit Connect** — Click "Connect TikTok", complete OAuth, show connected badge with display name and avatar
2. **Show Connected Status (All 3)** — Pan across Login Kit, Shop, and Content Posting sections all in connected state
3. **Sync Products from Shop** — Click "Sync Products", show the sync result banner and product table
4. **Show Content Posting Section** — Show connected accounts with handles, privacy levels, token expiry
5. **Show Data Controls Panel** — Show stored data table, disable instructions, retention policy, and deletion button
6. **Demo Disconnect Flow** — Disconnect an integration, show confirmation dialog and status change
7. **Demo Data Deletion** — Click "Delete All TikTok Data", show confirmation dialog (cancel or proceed on test account)

**Tips:**
- Keep the recording under 5 minutes
- Use a test/staging environment
- Narrate each step clearly
- Pause on the Data Controls section
