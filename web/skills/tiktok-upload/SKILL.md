# TikTok Upload Skill

Upload a video to TikTok Shop with product linking — fully automated via browser automation.

## Prerequisites

- Video must be in `ready_to_post` status
- Video must have a `final_video_url`
- A TikTok product ID must be resolvable (see Product Linking below)
- One-time TikTok login via bootstrap (see Setup below)

## Setup (One-Time)

```bash
cd ~/tts-engine/web

# 1. Bootstrap — log in to TikTok once with phone approval
npm run tiktok:bootstrap

# 2. Verify session is valid
npm run tiktok:check-session
```

After bootstrap, the persistent Chromium profile stores your session.
Subsequent runs reuse it — no daily phone approval needed.

## Automated Workflow

```bash
cd ~/tts-engine/web

# Generate upload pack (fetches video, caption, hashtags, product ID)
npm run publish:pack -- --video-id <uuid>

# Upload to TikTok as draft (default, recommended for review)
npm run tiktok:upload-pack -- --video-id <uuid>
npm run tiktok:upload-pack -- --video-id <uuid> --mode draft

# Upload and post immediately
npm run tiktok:upload-pack -- --video-id <uuid> --mode post

# Upload from local pack directory
npm run tiktok:upload-pack -- ~/FlashFlowUploads/2026-02-22/skeptic/product-slug

# Upload using the pack-dir based script
npm run tiktok:upload -- --pack-dir ~/FlashFlowUploads/2026-02-22/skeptic/product-slug

# Dry run — verify selectors without uploading
npm run tiktok:upload-pack -- --dry-run
```

## Nightly Cron (Example)

```bash
# Crontab entry — upload at 8 PM Pacific
0 20 * * * cd ~/tts-engine/web && npm run tiktok:upload-pack -- --video-id <uuid> --mode draft >> /tmp/tiktok-upload.log 2>&1
```

## Product Linking

The upload pack resolves `tiktok_product_id` in this order:

1. **Direct on video/script** — `script_locked_json.tiktok_product_id`
2. **Products table** — `video.product_id` -> `products.tiktok_product_id`
3. **FF Products lookup** — `script_locked_json.product_key` -> `ff_products.key` -> `tiktok_product_id`

If none resolve, the pack returns `missing_product_id` error.

### Managing FF Products

```bash
# Create / update a product mapping
curl -X POST /api/flashflow/products \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"key":"mushroom-gummies","display_name":"Mushroom Gummies","tiktok_product_id":"123456789"}'

# Search products
curl "/api/flashflow/products?q=mushroom" \
  -H "Authorization: Bearer $TOKEN"
```

## Files in Upload Pack

| File | Contents |
|------|----------|
| `video.mp4` | The final video file |
| `caption.txt` | TikTok caption text |
| `hashtags.txt` | Hashtags (space-separated) |
| `hook.txt` | Opening hook line |
| `cta.txt` | Call to action |
| `cover.txt` | Cover/thumbnail text overlay |
| `product.txt` | Product display name + TikTok product ID |
| `checklist.md` | Step-by-step upload checklist |
| `metadata.json` | Full upload pack as JSON (includes product block) |

## Session Recovery

If the session expires (typically 7+ days):

```bash
# Re-run bootstrap — one-time phone approval
npm run tiktok:bootstrap

# Verify
npm run tiktok:check-session
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "TikTok session expired" error | Session cookie expired or profile dir not used | Run `npm run tiktok:bootstrap` |
| Keeps opening login page | Profile directory mismatch | Check `TIKTOK_BROWSER_PROFILE` env var |
| Video processing never completes | Large video or slow upload | Increase timeout (default: 20 min), check video format |
| Product search returns no results | Wrong product ID | Verify `tiktok_product_id` in FlashFlow matches TikTok Shop |
| Captcha/2FA detected | TikTok anti-automation | Run bootstrap in headed mode, solve manually |
| "File input not found" | TikTok UI changed | Run `--dry-run` to check selectors, update `selectors.ts` |

## Important Notes

- **Drafts are device-bound**: TikTok drafts saved via browser are only visible on the Mac where they were created
- **This Mac is the target device**: Automation runs locally, can be cron-triggered
- **No headless for production**: Default is headed (`TIKTOK_HEADLESS=false`) to avoid detection
- **Error screenshots**: Saved to `data/tiktok-errors/<timestamp>/` on failure
