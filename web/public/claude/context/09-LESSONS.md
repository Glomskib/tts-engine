# Lessons — what to repeat, what to never do again

Distilled from cumulative session memory. Read every session — these are paid in real wasted time.

## Operating with Brandon

- **He's the decider, you're the dev.** Don't push ops/build/test work to him. Wrap dev tasks in scripts; never tell him to "run pnpm install" or "open this file and edit it."
- **He had brain surgery.** Plain language. No jargon. Friend tone. Translate everything down before sending.
- **Hours not weeks.** Anything actionable now = hours, not weeks. He works 24/7.
- **Plan as if he can't access anything.** Every plan should execute end-to-end from your session via SSH/computer-use/APIs. He reads results, never clicks/pastes/opens devices.
- **Don't ask for clicks you can do yourself.** Open `.command` files via computer-use, don't punt routine clicks.
- **Definition of done = testable user path + URL/command + specific blocker if any.** "Builds" is not done.

## Verify, don't assume

- **After every push, check `/api/health` SHA matches git HEAD.** If stuck, STOP and diagnose pipe. Don't stack work on un-deployed commits. (Burned 5+ commits on this in May 2026.)
- **"Pushed" ≠ "deployed" ≠ "live".** Use precise vocabulary.
- **Test scripts on the actual environment.** macOS doesn't have `timeout` natively. Test commands exist before relying on them.
- **Read existing patterns first.** Before any new endpoint or component, read middleware + auth + 1-2 example routes. 30 seconds saves a follow-up commit cycle.
- **Diagnose before building.** 30-sec probe (auth vs refused vs unreachable) beats 20-min wrong fix.
- **When memory says X exists, verify** before recommending. Memory is point-in-time.

## Architecture

- **Build core right before stacking layers.** Don't ship bookshelf/autonomy on top of broken Monday-style core. Get fundamentals right first.
- **One bundled PR > many small ones for refactors.** Validated 2026-04 — splitting refactors creates churn. Bundle is right.
- **Integration tests use real DB**, not mocks. Mock/prod divergence has burned us (prior incident).

## Specific gotchas

- **Supabase Storage 50MB POST cap.** Standard POST hard-capped at ~50MB even on Pro. Bigger files MUST use TUS resumable via `@supabase/storage-js` `upload()`. Don't re-test 413 — switch the upload code path.
- **Vercel function 4.5MB body limit** — applies if upload goes via API route. Direct-to-Supabase signed URL bypasses it.
- **`_next/static` files** must NOT be in middleware matcher. Excluded by default but verify.
- **Bolt /health command** must bypass runChief — always responds even when Anthropic is dead.

## Don't repeat

- **Don't claim "complete" when only data flow works.** Brandon judges by USE.
- **Don't build the cool new thing on top of broken fundamentals** to feel productive.
- **Don't chase noise** when the underlying pipe is broken (e.g. don't keep testing 413 when the cap is documented).
- **Don't accept friction.** Every minute of back-and-forth = system gap. Ship the fix in-turn.

## Repeat

- **Auto-build features for him to test + push live.** That's autonomy.
- **Push back when you disagree.** He wants challenge.
- **Surface new opportunities.** Digital asset sales, productized agents, niche stores. Sunday auto-spawn pattern.
- **Action items table at top.** ≤4 asks. Time-bounded. Decisive.
