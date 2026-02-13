# Browser Service — Bolt Integration

Brandon's Mac Mini runs a browser service at `http://<MAC_MINI_IP>:8100`.
All POST endpoints require the header `x-service-key: bsk_flashflow_2026`.

## Endpoints

### GET /health
No auth required. Returns `{ ok: true }` if the service is running.

### POST /browser/screenshot
Take a full-page screenshot of any URL.
```
curl -X POST http://<MAC_MINI_IP>:8100/browser/screenshot \
  -H "x-service-key: bsk_flashflow_2026" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://flashflowai.com"}'
```
**Body:** `{ "url": "https://..." }` — defaults to the FlashFlow pipeline if omitted.
**Response:** `{ "ok": true, "path": "/tmp/screenshots/shot-<timestamp>.png" }`

### POST /browser/review-video
Screenshot a video. Supports YouTube URLs and direct video file URLs.
```
curl -X POST http://<MAC_MINI_IP>:8100/browser/review-video \
  -H "x-service-key: bsk_flashflow_2026" \
  -H "Content-Type: application/json" \
  -d '{"videoUrl": "https://www.youtube.com/watch?v=XXXX"}'
```
**Body:** `{ "videoUrl": "https://..." }`
**Response:** `{ "ok": true, "path": "/tmp/screenshots/video-review-<timestamp>.png" }`

### POST /browser/pipeline-status
Screenshot the FlashFlow pipeline page (auto-logs in).
```
curl -X POST http://<MAC_MINI_IP>:8100/browser/pipeline-status \
  -H "x-service-key: bsk_flashflow_2026" \
  -H "Content-Type: application/json"
```
**Response:** `{ "ok": true, "path": "/tmp/screenshots/pipeline-<timestamp>.png" }`

### POST /adobe/create-animated-video
Create an animated character video from audio using Adobe Express. The character, category, and background use whatever is currently configured in the Adobe Express PWA on the Mac Mini.
```
curl -X POST http://<MAC_MINI_IP>:8100/adobe/create-animated-video \
  -H "x-service-key: bsk_flashflow_2026" \
  -H "Content-Type: application/json" \
  -d '{
    "audioPath": "/tmp/brian-milkthistle.mp3",
    "outputPath": "/tmp/output/video.mp4"
  }'
```
**Body:**
- `audioPath` — (required) absolute path to an audio file on the Mac Mini (MP3, WAV, MP4 — 2 min / 1GB max)
- `outputPath` — (optional) absolute path for the output video, defaults to `/tmp/screenshots/animated-<timestamp>.mp4`

**Response:** `{ "ok": true, "outputPath": "/tmp/output/video.mp4", "size": 22916997, "downloadedFrom": "...", "screenshots": { ... } }`

**Timing:** Rendering takes ~60-120 seconds depending on audio length. The endpoint blocks until complete (up to 3 min timeout).

### POST /desktop/adobe-sync
Proxy to HP Worker for Adobe Character Animator lip-sync (HP Worker must be running).
```
curl -X POST http://<MAC_MINI_IP>:8100/desktop/adobe-sync \
  -H "x-service-key: bsk_flashflow_2026" \
  -H "Content-Type: application/json" \
  -d '{
    "audioPath": "/path/to/audio.wav",
    "characterName": "Gwyneth",
    "outputPath": "/path/to/output.mp4"
  }'
```
**Body:**
- `audioPath` — absolute path to audio file on the HP Worker
- `characterName` — Character Animator puppet name
- `outputPath` — absolute path for exported video on the HP Worker

**Response:** `{ "ok": true, "outputPath": "...", "exported": true }`

### Desktop Control (Adobe Express PWA)
These endpoints control the Adobe Express PWA running in Chrome on the Mac Mini.

- **GET /desktop/adobe-express-status** — Returns current URL and title of the Chrome PWA tab
- **POST /desktop/adobe-express-navigate** — Navigate PWA to a URL. Body: `{ "url": "..." }`
- **POST /desktop/adobe-express-exec** — Execute JS in the PWA tab. Body: `{ "js": "..." }`
- **POST /desktop/adobe-express-screenshot** — Take native macOS screenshot of the Chrome window

## Error Handling
All endpoints return `{ "error": "message" }` with a 500 status on failure, or 401 if the service key is missing/wrong. Adobe endpoints may also return a `screenshots` object with paths to debug screenshots.

## Notes
- The service runs Chromium in headed mode (visible window) on the Mac Mini for Playwright-based screenshots.
- Adobe Express automation uses the existing Chrome PWA session (already logged in). NEVER use Playwright for Google/Adobe login.
- Screenshots are saved to `/tmp/screenshots/` on the Mac Mini.
- Bolt can reach the service via Tailscale at the Mac Mini's IP.
- To change the animated character, category, or background: use `/desktop/adobe-express-navigate` to go to the animate-from-audio page and manually configure, or use `/desktop/adobe-express-exec` to interact with the UI.
- Set `HP_WORKER_URL` in .env to the HP Worker's Tailscale IP for `/desktop/adobe-sync`.
