# Editing Engine Feature Roadmap

Last audited: 2026-04-06
Source of truth: actual codebase, not speculation.

## Status Legend

- **E2E** = schema + renderer + API + UI all wired
- **Partial** = some pieces exist, not fully wired
- **Missing** = no implementation

---

## Feature Matrix

| Feature | Status | Schema | Renderer | Plan Builder | UI | Notes |
|---|---|---|---|---|---|---|
| Raw video upload | E2E | `raw_video_url`, `raw_video_storage_path` on content_items | `resolveSourceUrl()` reads both fields | N/A | `RawVideoUpload` component on detail page | POST/DELETE `/api/content-items/[id]/raw-video` |
| Keep/Cut | E2E | `EditPlanActionSchema` cut + keep types | `resolveSegments()` handles both; cut-inversion logic | `buildEditPlan()` maps timeline `keep`/`cut` labels | N/A (plan-driven) | Segment extraction + concat pipeline |
| Text overlay | E2E | `text_overlay` action with text/position/timing | `drawtext` FFmpeg filter with `enable=between()` | `buildEditPlan()` maps timeline `text` labels | N/A | Supports top/center/bottom positions |
| Speed changes | E2E | `speed` action with factor 0.25-4x | `setpts` + chained `atempo` filters | Not auto-generated (manual plan only) | N/A | Audio tempo chain handles wide range |
| B-roll insertion | Partial | `broll` action with asset_url + prompt | Overlay compositing when `asset_url` present; skips when null | `buildEditPlan()` maps timeline `broll` + `broll_pack` | N/A | `broll_clips` library exists (`/api/broll/import`). Gap: no auto-fetch from library by prompt |
| Edit plan generation | Partial | `edit_plan_json` JSONB column | N/A | `buildEditPlan()` converts `EditorNotesJSON` to plan. Gap: ignores `editing_instructions` freetext; no LLM call | No UI to trigger plan generation | `editing_instructions` field exists but unused |
| End card | Missing | No schema type | No renderer support | No builder support | N/A | No existing code |
| Audio normalization | Missing | No schema type | No FFmpeg `loudnorm` filter | No builder support | N/A | No existing code |
| Auto captions | Missing | No schema type | No subtitle burn-in | No caption generation | N/A | Whisper infrastructure exists (`/api/transcribe`, `transcript-adapter.ts`) but not wired to editing engine |
| Pause cutting | Missing | No schema type | No silence detection | `analyzeTranscript.ts` detects pauses >1.2s as `cut_pause` suggestions but doesn't feed into edit plan | N/A | Transcript analyzer exists, not connected |
| Aspect ratio reframing | Missing | No schema type | No `scale`/`crop`/`pad` filters | N/A | N/A | `output.resolution` field exists in schema but renderer doesn't apply it |
| Keyword highlighting | Missing | No schema type | No renderer support | N/A | N/A | Would require word-level timestamps from Whisper |
| Watermark/branding | Missing | No schema type | No overlay filter | N/A | N/A | No existing code |
| Zoom punch | Missing | No schema type | No `zoompan` filter | N/A | N/A | No existing code |

---

## Existing Infrastructure (reusable)

| Component | Location | Reusable for |
|---|---|---|
| Whisper transcription | `/api/transcribe/route.ts`, `creator-style/transcript-adapter.ts` | Auto captions, pause cutting |
| Transcript analyzer | `lib/editing/analyzeTranscript.ts` | Pause cutting (already detects >1.2s gaps) |
| B-roll library | `/api/broll/import/route.ts`, `broll_clips` table | B-roll insertion (need prompt-to-clip lookup) |
| FFmpeg binary | `@ffmpeg-installer/ffmpeg` in package.json | All FFmpeg features |
| Editor notes pipeline | `lib/editing/generateEditorNotesJob.ts` + Claude | Plan generation from notes |
| Content item events | `logContentItemEvent()` in `lib/content-items/sync.ts` | All features (audit trail) |

---

## Recommended Execution Order

### Phase 1: Complete the core loop (make existing features usable)

1. **Raw video upload** - Already E2E (done)
2. **Editing panel UI** - Add workflow panel to content item detail page showing edit_status, plan preview, render controls
3. **Edit plan generation from instructions** - Strengthen `buildEditPlan()` to parse `editing_instructions` freetext, add defaults (hook overlay, normalize audio)

### Phase 2: High-value, low-risk FFmpeg additions

4. **Audio normalization** - FFmpeg `loudnorm` filter, default-on. Single filter addition to segment extraction step.
   - Dependency: types.ts schema update
5. **End card** - Generate a solid-color frame with CTA text via FFmpeg `color` + `drawtext`, append to concat.
   - Dependency: types.ts schema update
6. **Pause cutting** - Wire `analyzeTranscript.ts` cut_pause suggestions into `buildEditPlan()` as cut actions.
   - Dependency: transcript must exist on content item

### Phase 3: Transcript-dependent features

7. **Auto captions** - Whisper word-level timestamps + `drawtext` or ASS subtitle burn-in.
   - Dependency: Whisper transcription of raw video (infrastructure exists)
8. **Keyword highlighting** - Requires word-level timestamps, styled drawtext for specific words.
   - Dependency: auto captions (#7)

### Phase 4: Advanced visual effects

9. **Aspect ratio reframing** - Apply `output.resolution` via `scale`+`pad` filters. Need face detection for smart crop.
   - Dependency: None (basic) or face detection library (smart)
10. **B-roll auto-fetch** - Match broll action `prompt` to `broll_clips` library via embedding search.
    - Dependency: broll library populated, embedding search
11. **Watermark/branding** - Overlay PNG/SVG at fixed position. Need brand asset storage.
    - Dependency: Brand asset upload path
12. **Zoom punch** - FFmpeg `zoompan` filter for emphasis moments.
    - Dependency: None, but requires precise timing from transcript

---

## Dependencies Graph

```
raw_video_upload (done)
  -> edit_plan_generation -> render -> editing_panel_ui
  -> audio_normalization (no deps, add to render)
  -> end_card (no deps, append to render)
  -> pause_cutting (needs transcript)
  -> auto_captions (needs Whisper on raw video)
       -> keyword_highlighting
  -> aspect_ratio_reframing (standalone)
  -> broll_auto_fetch (needs library + embeddings)
  -> watermark (needs brand assets)
  -> zoom_punch (needs transcript timestamps)
```
