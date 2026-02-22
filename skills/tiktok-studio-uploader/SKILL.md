# TikTok Studio Uploader

Browser automation module that uploads videos to TikTok Shop via TikTok Studio web UI, using an Upload Pack as input. Supports draft-only (default) and post mode.

## Architecture

Modular Playwright functions, each handling one step of the upload flow:

```
skills/tiktok-studio-uploader/
  index.ts            # Re-exports + runUploadToDraft() orchestrator with retry logic
  types.ts            # StudioUploadInput, StudioUploadResult, config, getLaunchOptions()
  selectors.ts        # All TikTok Studio selectors (role/text-based)
  browser.ts          # openUploadStudio() — persistent profile, fail-fast login, captcha/2FA detection
  upload.ts           # uploadVideoFile() — set file input, wait for processing (20min timeout)
  description.ts      # fillDescription() — clear + type into contenteditable
  product.ts          # attachProductByID() — two-step modal: Add link → product search → select → confirm
  draft.ts            # saveDraft() / publishPost() — save or post, with force-click overlay bypass
  status-callback.ts  # reportStatus() — mark-posted API call for posts, local log for drafts
```

## Session Persistence

Uses `chromium.launchPersistentContext(profileDir)` — the entire Chromium profile (cookies, localStorage, IndexedDB) survives across runs. User logs in once via bootstrap; no daily phone approval needed.

**Stable fingerprint** across all runs:
- Viewport: 1280x900
- Locale: en-US
- Timezone: America/Los_Angeles
- User agent: Pinned Chrome 131 UA string
- Automation flags disabled

## Quick Start

```bash
cd ~/tts-engine/web

# 1. One-time login — opens headed browser for phone approval
npm run tiktok:bootstrap

# 2. Verify session
npm run tiktok:check-session

# 3. Upload from video ID (fetches pack from API, saves as draft)
npm run tiktok:upload-pack -- --video-id <uuid>

# 4. Upload from local pack directory
npm run tiktok:upload-pack -- ~/FlashFlowUploads/2026-02-22/skeptic/product-slug

# 5. Post immediately instead of draft
npm run tiktok:upload-pack -- --video-id <uuid> --mode post

# 6. Dry run — check selectors and login without uploading
npm run tiktok:upload-pack -- --dry-run
```

Or via the pack-dir script:

```bash
npm run tiktok:upload -- --pack-dir ~/FlashFlowUploads/2026-02-22/skeptic/product-slug
npm run tiktok:upload -- --pack-dir <dir> --post
```

## npm Scripts

| Script | Description |
|--------|-------------|
| `tiktok:bootstrap` | One-time interactive login (headed browser, phone approval) |
| `tiktok:check-session` | Verify persistent login is still valid (exit 0=yes, 2=no) |
| `tiktok:upload-pack` | Upload from pack dir or --video-id (main runner) |
| `tiktok:upload` | Upload from --pack-dir (alternative entry point) |
| `publish:pack` | Generate upload pack from video ID (writes files to disk) |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TIKTOK_STUDIO_UPLOAD_URL` | `https://www.tiktok.com/tiktokstudio/upload` | Upload page URL |
| `TIKTOK_BROWSER_PROFILE` | `data/sessions/tiktok-studio-profile` | Persistent Chromium profile dir |
| `TIKTOK_HEADLESS` | `false` | Headless mode (login must already be cached) |
| `POST_MODE` | `draft` | `draft` or `post` — whether to save as draft or publish |
| `POST_NOW` | `false` | Set to `true` to override POST_MODE to `post` |
| `FF_API_URL` | `http://localhost:3000` | FlashFlow API base URL for status callbacks |
| `FF_API_TOKEN` | _(empty)_ | FlashFlow API token for status callbacks |

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| **0** | Success (drafted or posted) | None |
| **1** | Generic error (timeout, selector miss, etc.) | May retry on next run |
| **42** | **Session invalid — needs manual login** | **Stop retrying.** Run `npm run tiktok:bootstrap` |

## Fail-Fast Behavior

**Non-negotiable**: The uploader NEVER retries login attempts. If the session is expired:

1. Prints: `TikTok session expired — run npm run tiktok:bootstrap (one-time phone approval).`
2. Saves error report to `data/tiktok-errors/<timestamp>/` (once per cooldown window)
3. Sets cooldown lockfile to suppress repeated alerts (default: 6 hours)
4. **Exits with code 42** — callers must treat this as a hard stop, not a retryable error

Only the bootstrap script (`tiktok:bootstrap`) runs in interactive mode where human intervention is allowed.

### Cooldown Guardrail

After the first exit-42 event, subsequent runs within `SESSION_INVALID_COOLDOWN_HOURS` (default 6) exit silently with code 42 — no error report, no noise. Clear with: `rm data/sessions/.session-invalid.lock`

## Upload Pack Input

The uploader reads from a local directory with these files:

```
~/FlashFlowUploads/2026-02-22/<lane>/<slug>/
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

### `openUploadStudio(opts?)`
Opens Chromium with persistent profile. Navigates to upload page. Detects captcha, 2FA, and other blockers.
- `opts.interactive = false` (default): fail-fast, no human intervention
- `opts.interactive = true` (bootstrap only): pauses for manual resolution
Returns `StudioSession | null`.

### `getLaunchOptions(opts?)`
Returns consistent Playwright launch options with stable fingerprint (viewport, locale, timezone, UA).

### `uploadVideoFile(page, videoPath)`
Sets the video file on the hidden `<input type="file">`. Waits for caption editor to appear (20 min timeout). Throws on timeout.

### `fillDescription(page, description)`
Finds contenteditable editor, clears it, types full description (caption + hashtags) line by line.

### `attachProductByID(page, productId)`
Handles TikTok Studio's two-step product linking modal:
1. Clicks "Add link" → "Add link" modal appears with "Link type: Products"
2. Clicks "Next" → product search panel opens inside floating portal
3. Searches by product ID → selects **first result only** → clicks "Next" to confirm
4. Dismisses lingering modal overlays after confirmation

All clicks use `force:true` to bypass TikTok's `product-table-container` and `TUXModal-overlay` elements that intercept pointer events. Returns `{ linked, errors }`.

### `saveDraft(page)` / `publishPost(page)`
Clicks "Save as draft" or "Post" with escalating click strategy (normal → force → JS click) to bypass lingering modal overlays. Waits for success. Extracts `tiktok_draft_id` from URL. Returns `{ saved, tiktok_draft_id?, url?, errors }`.

### `reportStatus({ video_id, result })`
Non-blocking callback to FlashFlow API:
- **posted**: calls `POST /api/videos/[id]/mark-posted` with `{ posted_url, platform: "tiktok" }` — transitions video to "posted" status
- **drafted**: logs locally only — video stays "ready_to_post" until actually published

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

## Retry Logic

The orchestrator retries up to 2 times for transient errors (timeouts, navigation failures, missing selectors). Non-retryable errors (login required, success) return immediately. 3-second delay between retries.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "TikTok session expired" | Session cookie expired | Run `npm run tiktok:bootstrap` |
| Keeps opening login page | Profile dir mismatch or session expired | Check `TIKTOK_BROWSER_PROFILE`, re-run bootstrap |
| Video processing never completes | Large video / slow connection | Wait — timeout is 20 minutes. Check video format (MP4 required) |
| Product search returns none | Wrong product ID | Verify `tiktok_product_id` in FlashFlow matches TikTok Shop |
| Captcha/2FA in automated run | TikTok anti-automation triggered | Run bootstrap again to clear, solve manually |
| "File input not found" | TikTok Studio UI changed | Run `--dry-run` to audit selectors, update `selectors.ts` |

## Limitations

- **Selector fragility**: TikTok Studio UI changes may break selectors. Run `--dry-run` to verify.
- **No credential storage**: User logs in once in the persistent browser profile.
- **No CAPTCHA bypass**: User completes captchas manually during bootstrap only.
- **Drafts are device-local**: TikTok drafts saved via browser are only visible on this Mac.
- **Cover text**: Not yet automated (TikTok Studio cover editor is complex). Set manually if needed.
- **Headed mode required**: Default is non-headless to avoid TikTok Cloudflare detection.
