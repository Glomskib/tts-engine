# TikTok Studio Uploader — Phase 3

Browser automation module that uploads videos to TikTok Shop via TikTok Studio web UI, using an Upload Pack as input. **Draft-only mode** — never auto-publishes.

## Architecture

Modular Playwright functions, each handling one step of the upload flow:

```
skills/tiktok-studio-uploader/
  index.ts          # Re-exports + runUploadToDraft() orchestrator
  types.ts          # StudioUploadInput, StudioUploadResult, config
  selectors.ts      # All TikTok Studio selectors (role/text-based)
  browser.ts        # openUploadStudio() — persistent profile, login check
  upload.ts         # uploadVideoFile() — set file input, wait for processing
  description.ts    # fillDescription() — clear + type into contenteditable
  product.ts        # attachProductByID() — search → select first → confirm
  draft.ts          # saveDraft() — click draft, detect success, extract ID
```

## UploadPack Schema (extended)

```typescript
interface UploadPack {
  product_id: string;
  description: string;        // Full TikTok description (caption + hashtags)
  hashtags: string[];
  video_source:
    | { type: 'local'; local_path: string }
    | { type: 'google_drive'; google_drive_url: string };
  // ... other existing fields
}
```

## Functions

### `openUploadStudio()`
Opens Chromium with persistent profile at `~/.openclaw/browser-profiles/tiktok-studio`. Navigates to upload page. Returns `StudioSession` (context + page) or `null` if not logged in.

### `uploadVideoFile(page, videoPath)`
Locates the hidden `<input type="file">`, sets the video file. Waits for caption editor to appear (signals video accepted). Throws on timeout.

### `fillDescription(page, description)`
Finds the contenteditable editor, clears it, types the full description (caption + newline + hashtags) line by line.

### `attachProductByID(page, productId)`
Clicks "Add product" → fills search with product_id → selects **first result only** → confirms. Returns `{ linked, errors }`.

### `saveDraft(page)`
Clicks "Save as draft". Waits for success indicator or URL change. Extracts `tiktok_draft_id` from the post-save URL if detectable. Returns `{ saved, tiktok_draft_id?, url?, errors }`.

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

Status values: `drafted` | `login_required` | `error`

## Browser Profile

Persistent Chromium profile at `~/.openclaw/browser-profiles/tiktok-studio`. User logs in once manually in headed mode; session persists across runs.

| Env Variable | Default | Description |
|---|---|---|
| `TIKTOK_STUDIO_UPLOAD_URL` | `https://www.tiktok.com/tiktokstudio/upload` | Upload page URL |
| `TIKTOK_BROWSER_PROFILE` | `~/.openclaw/browser-profiles/tiktok-studio` | Profile directory |
| `TIKTOK_HEADLESS` | `false` | Headless mode (login must already be cached) |

## Usage

```bash
cd web

# First run — log in manually (browser opens headed)
npm run tiktok:upload-pack -- --dry-run

# Upload from local pack directory (draft-only)
npm run tiktok:upload-pack -- /path/to/upload-pack

# Upload via video_id (fetches pack from API, draft-only)
npm run tiktok:upload-pack -- --video-id abc123

# Dry run — check selectors without uploading
npm run tiktok:upload-pack -- /path/to/upload-pack --dry-run
```

## Limitations

- **Draft-only** — does not publish. Review and post manually in TikTok Studio.
- **No credential storage** — user logs in once in the persistent browser profile.
- **No CAPTCHA/2FA bypass** — user completes these manually if prompted.
- **Selector fragility** — TikTok Studio UI changes may break selectors. Run `--dry-run` to verify.
