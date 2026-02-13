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

### POST /desktop/adobe-sync
Trigger Adobe Character Animator to lip-sync audio to a character puppet.
```
curl -X POST http://<MAC_MINI_IP>:8100/desktop/adobe-sync \
  -H "x-service-key: bsk_flashflow_2026" \
  -H "Content-Type: application/json" \
  -d '{
    "audioPath": "/path/to/audio.wav",
    "characterName": "MyCharacter",
    "outputPath": "/path/to/output.mp4"
  }'
```
**Body:**
- `audioPath` — absolute path to the audio file on the Mac Mini
- `characterName` — name of the puppet in Character Animator
- `outputPath` — absolute path for the exported video

**Response:** `{ "ok": true, "outputPath": "/path/to/output.mp4" }`

## Error Handling
All endpoints return `{ "error": "message" }` with a 500 status on failure, or 401 if the service key is missing/wrong.

## Notes
- The service runs Chromium in headed mode (visible window) on the Mac Mini.
- Screenshots are saved to `/tmp/screenshots/` on the Mac Mini.
- Bolt can reach the service via Tailscale at the Mac Mini's IP.
