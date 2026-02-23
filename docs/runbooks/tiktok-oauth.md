# TikTok OAuth Debugging Runbook

## Architecture

FlashFlow uses 4 separate TikTok integrations, each with its own credentials:

| Integration     | Env Prefix              | Scopes                        |
|-----------------|-------------------------|-------------------------------|
| Login Kit       | `TIKTOK_CLIENT_*`       | `user.info.basic`             |
| Partner API     | `TIKTOK_PARTNER_CLIENT_*` | `user.info.basic,video.list` |
| Shop            | `TIKTOK_SHOP_APP_*`     | Shop-specific scopes          |
| Content Posting | `TIKTOK_CONTENT_APP_*`  | `video.upload,video.publish`  |

The **Partner API** connect flow is at `/api/tiktok/auth` → TikTok → `/api/tiktok/callback`.

## Env Vars Required (Partner API)

```
TIKTOK_PARTNER_CLIENT_KEY    # From TikTok Developer Portal (NOT the same as Login Kit app)
TIKTOK_PARTNER_CLIENT_SECRET # Corresponding secret
TIKTOK_REDIRECT_URI          # Must EXACTLY match portal config (including trailing slash)
```

## Common "client_key" Error Causes

1. **Wrong client_key value** — verify in Vercel env vars. Use the debug endpoint (below) to inspect.
2. **Scope comma encoding** — TikTok expects literal commas (`user.info.basic,video.list`), NOT URL-encoded `%2C`. Fixed in the auth route.
3. **Redirect URI mismatch** — must exactly match what's configured in the TikTok Developer Portal. Check trailing slashes.
4. **App not approved** — the TikTok developer app must be approved for the requested scopes.
5. **Whitespace in env var** — the auth route trims whitespace, but double-check in Vercel.
6. **Using wrong app's key** — the Partner API uses a different app than Login Kit.

## Debug Endpoint

**`GET /api/tiktok/debug-auth`** (admin only)

Returns masked diagnostic information:
- `client_key_raw` / `client_key_trimmed`: length, preview (first2+last4), whitespace, char codes
- `client_secret`: whether set, length, whitespace
- `redirect_uri`: preview (domain+path only)
- `auth_url_masked`: the full auth URL with masked client_key
- `scope`: the scope string being sent

### How to use

```bash
# Requires admin session cookie — open in browser while logged in as admin
https://flashflowai.com/api/tiktok/debug-auth
```

Check:
1. `client_key_raw.length` > 0 and `matchesAlphanumeric` = true
2. `client_key_raw.hasWhitespace` = false
3. `redirect_uri.preview` matches what's in the TikTok Developer Portal exactly
4. `client_secret.set` = true
5. `client_key_trimmed.differs_from_raw` = false (no trimming needed)

## TikTok Developer Portal Checklist

When setting up or fixing the Partner API app:

- [ ] App type: **Web** (not Mobile)
- [ ] Platform URL: `https://flashflowai.com`
- [ ] Redirect URI: `https://flashflowai.com/api/tiktok/callback` (exact match, no trailing slash)
- [ ] Requested scopes: `user.info.basic`, `video.list`
- [ ] App status: **Live** (not sandbox/draft)
- [ ] Correct app selected (Partner API app, not Login Kit or Content Posting app)

## Callback Flow

1. `/api/tiktok/auth` builds auth URL and sets `tiktok_oauth_state` cookie
2. User authorizes on TikTok
3. TikTok redirects to `/api/tiktok/callback?code=...&state=...`
4. Callback verifies state, exchanges code for tokens, upserts to `tiktok_connections` table
5. Redirects to `/admin/settings/tiktok?partner_connected=true`

## Token Refresh

Tokens are stored in `tiktok_connections` table. Refresh is handled by `lib/tiktok-partner.ts` → `refreshPartnerToken()`. If refresh fails, the connection status is set to `expired`.
