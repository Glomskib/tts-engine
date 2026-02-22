# TikTok Studio Uploader

Browser automation module that uploads videos to TikTok Shop via TikTok Studio web UI, using an Upload Pack as input. Supports draft-only (default) and post mode.

## Architecture

Modular Playwright functions, each handling one step of the upload flow:

```
skills/tiktok-studio-uploader/
  index.ts            # Re-exports + runUploadToDraft() orchestrator with retry logic
  types.ts            # StudioUploadInput, StudioUploadResult, config
  selectors.ts        # All TikTok Studio selectors (role/text-based)
  browser.ts          # openUploadStudio() — persistent profile, login check, captcha/2FA detection
  upload.ts           # uploadVideoFile() — set file input, wait for processing
  description.ts      # fillDescription() — clear + type into contenteditable
  product.ts          # attachProductByID() — search → select first → confirm
  draft.ts            # saveDraft() / publishPost() — save or post, detect success, extract ID
  status-callback.ts  # reportStatus() — call FlashFlow API to record drafted/posted status
```

## Quick Start

```bash
cd /Users/brandonglomski/tts-engine/web

# 1. First run — log in manually (browser opens headed)
npx tsx scripts/tiktok-studio/upload-from-pack.ts --dry-run

# 2. Upload from local pack directory (draft-only, default)
npx tsx scripts/tiktok-studio/upload-from-pack.ts ~/FlashFlowUploads/2026-02-21/skeptic/product-slug

# 3. Upload via video_id (fetches pack from API)
npx tsx scripts/tiktok-studio/upload-from-pack.ts --video-id abc123

# 4. Post immediately instead of saving as draft
POST_MODE=post npx tsx scripts/tiktok-studio/upload-from-pack.ts ~/FlashFlowUploads/2026-02-21/skeptic/product-slug

# 5. Post immediately (alternative env var)
POST_NOW=true npx tsx scripts/tiktok-studio/upload-from-pack.ts --video-id abc123

# 6. Dry run — check selectors and blocker detection
npx tsx scripts/tiktok-studio/upload-from-pack.ts --dry-run
```

Or via npm scripts:

```bash
npm run tiktok:upload-pack -- ~/FlashFlowUploads/2026-02-21/skeptic/product-slug
npm run tiktok:upload-pack -- --video-id abc123
npm run tiktok:upload-pack -- --dry-run
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TIKTOK_STUDIO_UPLOAD_URL` | `https://www.tiktok.com/tiktokstudio/upload` | Upload page URL |
| `TIKTOK_BROWSER_PROFILE` | `~/.openclaw/browser-profiles/tiktok-studio` | Persistent Chromium profile dir |
| `TIKTOK_HEADLESS` | `false` | Headless mode (login must already be cached) |
| `POST_MODE` | `draft` | `draft` or `post` — whether to save as draft or publish |
| `POST_NOW` | `false` | Set to `true` to override POST_MODE to `post` |
| `FF_API_URL` | `http://localhost:3000` | FlashFlow API base URL for status callbacks |
| `FF_API_TOKEN` | _(empty)_ | FlashFlow API token for status callbacks |

## Upload Pack Input

The uploader reads from a local directory with these files:

```
~/FlashFlowUploads/2026-02-21/<lane>/<slug>/
├── video.mp4         # Video file (required)
├── caption.txt       # TikTok caption text (required)
├── hashtags.txt      # Hashtags, one per line or space-separated (required)
├── product.txt       # Product ID (line: "TikTok Product ID: <id>")
├── metadata.json     # Full UploadPack JSON (has product.tiktok_product_id, video_id)
├── cover.txt         # Thumbnail overlay text
├── hook.txt          # First-line hook
├── cta.txt           # Call to action
└── checklist.md      # Human review checklist
```

Or via `--video-id <id>` which fetches the pack from the FlashFlow API and downloads the video.

## Functions

### `runUploadToDraft(input, shouldPost?)`
Full pipeline orchestrator with retry logic (up to 2 retries for timeout/navigation errors).

### `openUploadStudio()`
Opens Chromium with persistent profile. Navigates to upload page. Detects captcha, 2FA, and other blockers. In headed mode, pauses for human intervention. Returns `StudioSession | null`.

### `uploadVideoFile(page, videoPath)`
Sets the video file on the hidden `<input type="file">`. Waits for caption editor to appear. Throws on timeout.

### `fillDescription(page, description)`
Finds contenteditable editor, clears it, types full description (caption + hashtags) line by line.

### `attachProductByID(page, productId)`
Clicks "Add product" → fills search → selects **first result only** → confirms. Returns `{ linked, errors }`.

### `saveDraft(page)` / `publishPost(page)`
Clicks "Save as draft" or "Post". Waits for success. Extracts `tiktok_draft_id` from URL. Returns `{ saved, tiktok_draft_id?, url?, errors }`.

### `reportStatus({ video_id, result })`
Non-blocking callback to FlashFlow API:
- **posted**: calls `POST /api/videos/[id]/mark-posted` with `{ posted_url, platform: "tiktok" }`
- **drafted**: calls `PATCH /api/videos/[id]/execution` to record a `tiktok_draft_saved` event

## Output

```json
{
  "status": "drafted",
  "tiktok_draft_id": "7340012345678901234",
  "product_id": "12345",
  "video_file": "video.mp4",
  "url": "https://www.tiktok.com/tiktokstudio/post/7340012345678901234",
  "errors": []
}
```

Status values: `drafted` | `posted` | `login_required` | `error`

## Blocker Detection

The uploader detects and handles:
- **Captcha**: iframe/element-based captcha detection
- **2FA**: Two-factor authentication prompts
- **Blockers**: Rate limits, account suspension, error pages
- **Login**: Not-logged-in state

In headed mode (`TIKTOK_HEADLESS=false`, the default), the script pauses and waits for the user to resolve the blocker manually. In headless mode, it fails with a clear error message.

## Browser Profile

Persistent Chromium profile at `~/.openclaw/browser-profiles/tiktok-studio`. User logs in once manually in headed mode; session persists across runs.

## Retry Logic

The orchestrator retries up to 2 times for transient errors (timeouts, navigation failures, missing selectors). Non-retryable errors (login required, success) return immediately.

## Limitations

- **Selector fragility**: TikTok Studio UI changes may break selectors. Run `--dry-run` to verify.
- **No credential storage**: User logs in once in the persistent browser profile.
- **No CAPTCHA bypass**: User completes captchas manually in headed mode.
- **Drafts are device-local**: TikTok drafts saved via browser are only visible on that device.
- **Cover text**: Not yet automated (TikTok Studio cover editor is complex). Set manually if needed.
