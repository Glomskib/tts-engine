# Video Engine (V1)

Affiliate-first automated short-form video pipeline with a Mode abstraction
that supports `affiliate` (default) and `nonprofit` without forking the engine.

> **Mode is a top-level parameter on `ve_runs`.** It swaps scoring weights,
> templates, and CTAs only. The pipeline (ingest → transcribe → analyze →
> assemble → render) is identical for every mode.

## Pipeline

```
upload → /api/creator/upload-urls (presigned URL)
       → /api/video-engine/runs    (create ve_run + ve_asset)
       → /api/cron/video-engine-tick (every minute)
            → stageTranscribe   (Whisper → ve_transcripts + ve_transcript_chunks)
            → stageAnalyze      (deterministic scoring → ve_clip_candidates)
            → stageAssemble     (templates → ve_rendered_clips + ff_render_jobs)
            → stageRendering    (poll ff_render_jobs → mark complete)
       → results UI polls /api/video-engine/runs/[id]
```

Renders are dispatched through the existing **`ff_render_jobs`** queue. The
M4 worker fleet picks them up and writes back `output_url`. The engine never
calls Shotstack directly from this layer.

## Mode anatomy

A mode is a `ModeConfig` (see `lib/video-engine/modes.ts`) that defines:

- **`scoreWeights`** — how much each deterministic feature contributes to a
  candidate's final score. Setting `productMention: 0` makes a mode
  actively ignore product talk; setting `testimonialPhrase: 1.4` makes
  testimonials surface to the top.
- **`defaultTemplateKeys`** — which templates to render when the user does
  not pin a specific preset list.
- **`defaultCTAKey`** — the fallback CTA key (overridden by templates).

Adding a mode is one file edit (`modes.ts`) plus registering templates and
CTAs in their respective registries.

## Files

| Layer        | Path                                                        |
|--------------|-------------------------------------------------------------|
| Schema       | `supabase/migrations/20260503000000_video_engine_v1.sql`    |
| Types        | `lib/video-engine/types.ts`                                 |
| Mode registry| `lib/video-engine/modes.ts`                                 |
| Scoring      | `lib/video-engine/scoring.ts`                               |
| Transcribe   | `lib/video-engine/transcribe.ts`                            |
| Templates    | `lib/video-engine/templates/{shared,affiliate,nonprofit,index}.ts` |
| CTAs         | `lib/video-engine/ctas.ts`                                  |
| State machine| `lib/video-engine/pipeline.ts`                              |
| API          | `app/api/video-engine/{modes,runs}/...`                     |
| Cron         | `app/api/cron/video-engine-tick/route.ts`                   |
| UI pages     | `app/(app)/video-engine/{page,[id]/page,[id]/compare/page}.tsx` |
| UI components| `components/video-engine/*.tsx`                             |

## Env

All required keys exist in production today:

- `OPENAI_API_KEY`            — Whisper transcription
- `NEXT_PUBLIC_SUPABASE_URL`  — Storage download for transcribe
- `SUPABASE_SERVICE_ROLE_KEY` — DB writes (via supabaseAdmin)
- `SHOTSTACK_*`               — used by the worker that drains `ff_render_jobs`
- `CRON_SECRET`               — protects the tick cron

No new env vars introduced.

## Setup

```bash
# Apply the migration
cd web && supabase db push    # or your usual migration runner

# Add the cron entry (already added to vercel.json):
#   { "path": "/api/cron/video-engine-tick", "schedule": "* * * * *" }
```

## Test plan

1. **Auth** — log in.
2. **Upload (affiliate)** — visit `/video-engine`, leave Mode = Affiliate,
   pick a 30-90s video with a clear product hook, click Upload. You should
   land on `/video-engine/[runId]` with the progress track moving through
   `transcribing → analyzing → assembling → rendering`.
3. **Verify candidates** — once `analyzing` completes, the candidates list
   shows 3-6 picks with scores. Affiliate mode should heavily favor clips
   with product/benefit/CTA language.
4. **Verify rendered output** — once `rendering` completes, three template
   variants (TikTok Shop / UGC Review / Talking Head) appear with playable
   MP4s, captions burned in, and a CTA card at the end.
5. **Switch to nonprofit on the same asset** — click "Run in nonprofit
   mode" on the run detail page. This creates a new run from the same
   storage path. Wait for it to finish.
6. **Side-by-side compare** — go to `/video-engine/[runId]/compare`.
   Both mode runs render in two columns. Confirm:
    - Affiliate run picked product/CTA-heavy moments
    - Nonprofit run picked emotion/group/celebration moments
    - Affiliate templates show shop-style headlines + magenta accents
    - Nonprofit templates show event/mission headlines + register/donate CTAs
7. **Failure surface** — upload a video with no audible speech; the run
   should land in `failed` with `error_message` populated, visible in UI.
8. **Credit gating** — as a non-admin free user with 0 credits, the run
   creation should 402 with `INSUFFICIENT_CREDITS`.

## Honest scope — complete vs deferred

### Complete (V1)

- Mode abstraction with `affiliate` + `nonprofit` registered
- Six DB tables, RLS, triggers
- Whisper transcription of Supabase Storage assets
- Deterministic scoring with mode-aware weights and clip-type classifier
- Three affiliate templates: TikTok Shop Seller, UGC Product Review, Talking Head
- Five nonprofit templates: Event Recap Hype, Join Us, Why This Matters,
  Sponsor Highlight, Testimonial
- Eight CTAs across both modes
- Render dispatch through existing `ff_render_jobs` worker queue
- Cron-driven state machine with retry/failure tracking
- Upload page with Mode selector (defaulting to affiliate, switchable
  before processing)
- Processing page with live progress + selected candidates
- Results grid with playable MP4s, template/CTA labels, and downloads
- Side-by-side comparison view
- Credit gating (1 credit per run, admin bypass)
- Source duration cap (30 minutes)

### Deferred (V2)

- **LLM enrichment of top candidates.** The deterministic scorer is fast
  and predictable. A second pass with Claude could re-rank the top ~10
  candidates and rewrite hook lines. Hooks already exist:
  `scoring.ts::scoreChunks` returns full breakdowns ready to feed into a
  prompt. Add `lib/video-engine/scoring-llm.ts`.
- **Visual signal scoring** for nonprofit (smiling faces, scenic shots,
  group moments, celebration). Today the nonprofit scorer uses transcript
  signals only. The `ChunkFeatures` interface intentionally already
  includes `scenicLanguage`, `groupLanguage`, and `celebrationLanguage`
  so the integration point is clear; visual scoring would set
  `features_json.visual.*` on chunks during a separate "frames" stage.
  Consider Replicate (already wired) for a face/scene model.
- **Real punch-in keyframes.** `videoClip()` currently sets a fixed
  `scale: 1.12` for templates that opt in. Shotstack supports keyframed
  scale animation — wire it through `templates/shared.ts::videoClip` for
  emphasis at the hook line.
- **Music bed selection** per template/mode.
- **B-roll insertion** between dialogue beats.
- **Auto-posting** to the existing `marketing_posts` queue. Add a
  "Send to draft" button on rendered clips that POSTs to
  `/api/marketing/enqueue`.
- **Product feed integration** for affiliate context (pull from a Shopify
  / TikTok Shop catalog by URL, populate `context_json.product_*`).
- **A/B variant generation** — render the same candidate with two
  different hook headlines or CTAs, track CTR.
- **Template marketplace** — DB-backed `ve_style_presets` table so users
  can save/share custom templates.
- **Editor review queue** — flag low-confidence candidates for human
  review before render.
- **Brand kits** — per-user font/color/logo overrides applied to all
  templates.
- **Team workflows** — workspace-level runs and approvals (today single
  workspace = single user).
- **Multi-clip ingestion** — the schema already allows multiple
  `ve_assets` per `ve_run`; the pipeline currently uses only the first.
- **Whisper-word-level captions** — bumping `timestamp_granularities` to
  `['segment','word']` and chunking captions per word would make captions
  feel native to TikTok/Reels.
- **Worker observability** — the worker side of `ff_render_jobs` is
  out-of-scope for this layer; ensure `ffmpeg_log` is surfaced to
  `ve_rendered_clips.error_message` on failure.

## Why this isn't two products

The codebase contains **one** scoring function, **one** template
build-input contract, **one** CTA shape, **one** state machine, and
**one** UI flow. `mode` is a single string parameter that selects which
weights/templates/CTAs apply. Removing the `nonprofit` entries from
`modes.ts`, `templates/`, and `ctas.ts` would leave a fully working
affiliate-only product — no engine code would change.
