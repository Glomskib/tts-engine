# Product Audit + Betterment Brief — 2026-06-10 (evening sweep)

Companion to today's session (commits b8793fc2..4df29f45). Agent-swept the
whole codebase for the same bug classes we fixed live. Execute top-down.

## P0 — broken or lying right now

1. **Dead mode gates everywhere** — ve_runs.mode is hardcoded 'affiliate' for
   ALL /create jobs (app/api/create/jobs/route.ts:198); real mode lives in
   context_json.mode. Today's fix patched pipeline.ts gates, but
   **scoring.ts:280,288** and **packaging.ts:61-74** still branch on
   run.mode values that can never match. Fix properly: write the real mode
   into ve_runs.mode (migration: nothing depends on 'affiliate' except
   legacyEnrich) or one helper `getUiMode(run)` used EVERYWHERE. ~4h.
2. **incrementUsage silently swallowed** (api/editor/jobs/[id]/start/route.ts:97)
   — plan limits don't track when it fails. Same class: upload-url:80 bucket
   errors, feedback route logIssueAction, from-youtube storage cleanup,
   edit-builder/render body-parse. Sweep all `.catch(() => {})` / empty
   catches in app/api/**: log + surface. ~3h.
3. **MISSING_TABLES_CONSOLIDATED.sql lists 19 tables** that were missing in
   prod at some point. We applied footage/v1/concepts today — run the full
   list against prod information_schema and apply the rest. Then add the
   guard: extend /api/health with a schema check (expected tables/columns vs
   information_schema) so drift alarms instead of 500ing. ~3h.

## P1 — lying UI (creators notice)

4. **"Beat-sync the cuts"** (create/page.tsx headline) — no beat detection
   exists; we do silence-gap cuts. Either reword ("cuts the dead air") TODAY
   or build real beat-sync (onset detection on the music bed, snap cut points
   to beats — pairs beautifully with the music feature). Copy fix 10 min.
5. **"Hook polish"** — promised, undefined. Cheapest honest version: the
   hook-ranker already scores hooks; surface "we picked your strongest
   opening" in the result UI. Or reword.
6. **Edit transparency (NEW, biggest trust win):** after render, show the
   receipt: "Cut 4 pauses (6.2s), removed 2 retakes, 3 filler words,
   added 2 B-roll cutaways." All data already exists in keep_ranges +
   dedupe reasons. Creators TRUST an editor that shows its work, and it
   converts the invisible edit into perceived value. ~4h. DO THIS.

## P2 — debt

7. lib/editing/{build-edit-plan,render-plan,analyzeTranscript,validate-edit-plan}
   exported, never imported. Decide: wire into the instruction engine (they're
   80% of it!) or delete. NOTE: build-edit-plan + dedupe-takes are the natural
   skeleton for the one-pass instruction engine — reuse, don't rewrite.
8. Client pages that ignore !res.ok — sweep after the API error sweep.

## Product betterment (creator lens, beyond bugfixes)

A. **Instruction engine** (locked headline): one LLM pass: instructions +
   transcript → edit-plan JSON (cuts, zooms, captions, broll subjects, music).
   Reuse lib/editing edit-plan types (#7). Expose an "Instructions" field on
   /create that actually does what it says.
B. **Best-take picker for multi-take**: we accept 5 takes but render take #1.
   Score takes (transcript quality, energy, length) and pick/merge the best —
   that's the "record, make another, keep recording" promise completed.
C. **The receipt (see #6)** + a "re-edit with one tap" row: "too choppy?
   [Fewer cuts] [No zooms] [Re-render]" — params already exist as flags.
D. **Publish loop**: clips die in My Clips. Wire the existing calendar/
   posting-accounts tables into a "Schedule" button on every finished clip.
E. **First-render time-to-wow**: measure upload→done; if >90s, show the
   edit receipt progressively while rendering ("found 3 retakes...").

## Suggested order
1 (#1 mode unification) → 6 (#receipt) → 4/5 (copy honesty, 30 min) →
2 (#silent errors) → 3 (#schema guard) → A (instruction engine, reusing #7)
→ B → D.
