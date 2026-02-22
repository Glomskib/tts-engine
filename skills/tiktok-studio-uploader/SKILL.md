# TikTok Studio Uploader

Playwright-based bot that uploads videos to TikTok Shop via the TikTok Studio web UI, using an Upload Pack as input.

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| Upload Pack folder path | One of these | Local directory containing `video.mp4`, `caption.txt`, `hashtags.txt`, `product.txt` or `metadata.json`, and optionally `cover.txt` |
| `--video-id <id>` | One of these | Video ID — the script calls `POST /api/publish/upload-pack` to fetch the pack, then downloads the video locally before uploading |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TIKTOK_STUDIO_UPLOAD_URL` | `https://www.tiktok.com/tiktokstudio/upload` | TikTok Studio upload page URL |
| `TIKTOK_POST_MODE` | `draft` | `draft` or `post` — whether to save as draft or publish immediately |
| `TIKTOK_BROWSER_PROFILE` | `~/.openclaw/browser-profiles/tiktok-studio` | Persistent Chromium profile directory (keeps login session) |
| `TIKTOK_HEADLESS` | `false` | Set to `true` for headless mode (login must already be cached) |

## Upload Pack Directory Layout

```
upload-pack/
  video.mp4              # Required — the video file
  caption.txt            # Required — TikTok caption text (without hashtags)
  hashtags.txt           # Required — one hashtag per line or space-separated
  product.txt            # Required* — TikTok Shop product ID (plain text)
  metadata.json          # Required* — { "product": { "tiktok_product_id": "..." } }
  cover.txt              # Optional — cover/thumbnail overlay text
```

\* Either `product.txt` or `metadata.json` with `product.tiktok_product_id` must be present.

## Steps

1. **Parse inputs** — Read upload pack directory or fetch via API using `--video-id`.
2. **Login check** — Open TikTok Studio in a persistent browser profile. If not logged in (detected by redirect to login page or login modal), stop with a clear message instructing the user to log in manually once in that profile.
3. **Upload video** — Set the video file on the hidden file input on the upload page. Wait for processing to complete.
4. **Paste caption + hashtags** — Fill the description field with `caption + \n + hashtags` (space-separated, each prefixed with `#`).
5. **Add product link** — Click "Add product" / product link area → paste product ID into search → select first matching row → confirm.
6. **Choose mode** — Click "Post" or "Save as draft" based on `TIKTOK_POST_MODE`.
7. **Confirm success** — Wait for success indicator (toast, redirect, or status change).
8. **Emit JSON summary** — Print to stdout:
   ```json
   {
     "ok": true,
     "mode": "draft",
     "product_id": "123456",
     "video_file": "video.mp4",
     "errors": []
   }
   ```

## Dry-Run Mode

Pass `--dry-run` to:
- Open the upload page
- Verify login status
- Check that key selectors are present (file input, caption field, product link area, post/draft buttons)
- Report findings without uploading anything

## Limitations

- Does **not** store credentials — user must log in once manually in the persistent browser profile.
- Does **not** bypass CAPTCHAs or 2FA — if prompted, the user must complete them manually.
- TikTok Studio UI changes may break selectors — use `--dry-run` to verify before uploading.

## Usage

```bash
# From the web/ directory:

# Upload from a local pack directory
npm run tiktok:upload-pack -- /path/to/upload-pack

# Upload using a video_id (fetches pack via API)
npm run tiktok:upload-pack -- --video-id abc123

# Dry run — check selectors without uploading
npm run tiktok:upload-pack -- /path/to/upload-pack --dry-run

# Post immediately instead of saving as draft
TIKTOK_POST_MODE=post npm run tiktok:upload-pack -- /path/to/upload-pack
```
