# NEXT SESSION OPENER — written 2026-06-11 by cowork session (read me FIRST)

Yesterday (2026-06-10) was a 17-fix day. Prod is healthy on 77143090+.
This file is the fresh-chat bootstrap: state, build order, and the
operational tricks that make this codebase fast to work on.

## BUILD ORDER (Brandon-approved "do what is best")

1. **Render QUEUE + EDIT RECEIPT (start here — same surface, build together)**
   - Queue: team-visible "Your videos" strip — every job's stage
     (uploading → transcribing → editing → rendering → done). Data: ve_runs.status
     + ff_render_jobs.status, poll like /studio/oneprompt does. Surface on
     /create (JobProgress exists) + /home.
   - Receipt: after render show "Cut 4 pauses (6.2s) · 2 retakes · 3 filler
     words · 2 B-roll cutaways". Data already exists at assemble time
     (keep_ranges + dedupe cut reasons in lib/video-engine/pipeline.ts
     "post edit-plan" block) — persist a summary into ve_rendered_clips or
     run context, render in JobProgress + clip detail. One-tap re-edit row:
     [Fewer cuts] [No zooms] [Re-render] → flags already exist
     (enable_jump_cuts / enable_punch_ins in context_json).
2. **Mode unification** — ve_runs.mode is legacy 'affiliate' for ALL /create
   jobs; real mode in context_json.mode. Patched gates live in pipeline.ts
   (grep uiModeAnalyze/uiModeAssemble) but scoring.ts:280,288 +
   packaging.ts:61-74 still branch on dead values. One getUiMode(run) helper
   everywhere, or write real mode into ve_runs.mode going forward.
3. **One-pass instruction engine** — /create instructions → full edit plan
   (cuts/zooms/captions/broll/music). REUSE lib/editing/* (build-edit-plan,
   validate-edit-plan, dedupe-takes, edit-plan types) — exported, unwired,
   80% of the skeleton. Output feeds the existing keep_ranges slice spec.
4. **Best-take picker** — /create accepts 5 takes, renders only take #1
   (pipeline uses primary; additional_sources stashed in context). Score
   takes via transcript, pick best.
5. Silent-error sweep (.catch(()=>{}) list) + /api/health schema guard +
   server-side ff-create-defaults sync. Full detail: PRODUCT_AUDIT_2026-06-10.md.

## STATE (what shipped 2026-06-10 — all deployed + verified)

- Prod DB caught up: footage_items/footage_events/v1_clip_sets/
  v1_generation_events created; concepts.user_id added, product_id nullable.
  Recorded in web/supabase/migrations/20260610000000_audit_prod_catchup.sql.
  NOTE: web/supabase/migrations/MISSING_TABLES_CONSOLIDATED.sql lists 19
  tables — only 3-4 verified today, check the rest vs prod.
- Editing engine (THE product now): silence jump cuts (0.6s gap) + retake
  dedupe (last take wins) + filler-word cuts (um/uh; word-level Whisper
  timestamps stored in ve_transcripts.raw_json.words since today) +
  alternating 1.08x punch-ins + B-roll overlays + ducked music + captions
  remapped to the stitched cut. All via keep_ranges in the slice spec →
  scripts/render-node/slice-worker.mjs concat filtergraph on the mini.
- /create: Smart cuts toggle (default ON), settings group persists
  (localStorage ff-create-defaults), drag-and-drop fixed, camera preview
  mirrored + auto-starts, honest hero copy.
- Brand voice in /script-generator (brands table; Brands open to all plans:
  free 1 / lite 3 / pro ∞). My Clips in TopNav slot 2. Footage auto-edit
  toggle (default ON). Admins added: katlynglom@gmail.com,
  brandon@communitycorewholesale.com (app_metadata.role).

## OPERATIONAL TRICKS (save yourself an hour)

- **Push**: sandbox can't SSH. Use ~/tts-engine/push-audit-2026-06-10.command
  (push only) or push-broll-fix-2026-06-10.command (push + mini git pull)
  via computer-use: open Finder → cmd+shift+G → path → Return → double-click
  file. Terminal is click-tier (no typing). After EVERY push verify
  https://flashflowai.com/api/health version == git short HEAD (~90s build).
- **Mini worker**: restart-slice-worker.command (PATH-safe pm2 restart; it
  does NOT git pull). Worker = scripts/render-node/slice-worker.mjs, pm2
  name ff-slice-worker. Restart needed only when that file changes.
- **Prod SQL**: Supabase dashboard (project qqyrwwvtxzrwbyqegpme, "TTS Video
  Machine") via Claude-in-Chrome, browser deviceId 63948688-... ("Browser 1"
  label). SQL editor traps: wait for full load before typing (else keystrokes
  create junk snippets), NEVER type a bare `?` (opens shortcuts panel —
  use jsonb_exists()), destructive queries pop a confirm dialog.
- **Two Chrome browsers** connect; Brandon's logged-in FlashFlow session was
  not in either at the end — endpoint tests needing auth may require asking
  Brandon to log in, or test via Supabase data instead.
- Bash sandbox: repo at /sessions/<name>/mnt/tts-engine; git lock files may
  need mcp__cowork__allow_cowork_file_delete once.

## BRANDON'S PLATE (remind gently)
- Retest: drag-drop a file on /create AND record a take with pauses, one
  flub-and-repeat, a few "um"s → the output should be visibly edited.
- Other-org Supabase invoice still unpaid (banner).
- Katlyn + CCW accounts: log out/in to activate admin.
