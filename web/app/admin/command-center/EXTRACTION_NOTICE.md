# EXTRACTION NOTICE — this directory is scheduled to leave tts-engine

> If you're Bolt, Brandon, or future Claude reading this: **do not add new
> features here.** Add them to the `mission-control` private repo instead.
>
> See `~/Documents/Command-Center/ARCHITECTURAL_SEPARATION_2026-04-29.md` for
> the full extraction plan.

## What lives here today

The 12-page Command Center subsystem (`overview`, `usage`, `projects`, `jobs`,
`ideas`, `finance`, `agents`, `finops`, `feedback`, `research`, `ops-health`,
`marketing`) plus its `_components/CCSubnav.tsx` and `mmm/` subdirectory.

This is **operator infrastructure** — Brandon's personal ops surface — not a
FlashFlow Studio creator feature. It piggy-backs on tts-engine's Supabase + Vercel
deploy out of convenience, but it has no shared user/auth/billing semantics with
the FlashFlow product.

## Why it has to leave

- Mission Control bugs blast-radius into FlashFlow customer flows.
- Operator-only data (`mc_operator_feed`, `mc_glance_dashboard`) lives in the
  same Supabase as creator data — wrong scope of access.
- Every change here triggers a full FlashFlow Vercel rebuild.
- Owner-gated nav surfaces clutter the data structure even when filtered out at
  render time.

## Where new work should go

| If you're working on... | Target it here instead |
|---|---|
| Anything `/admin/command-center/*` (except `mmm/`) | `mission-control` private repo, will activate to deploy at `mc.flashflowai.com` |
| Anything in `command-center/mmm/*` | `mmm-event-os` repo (Bolt: repoint your WIP feature branch there) |
| Daily-intel agents (cycling-agent, zebby-agent, weekly-digest) | Mission Control repo, OR a dedicated `agents` mini-repo |
| FinOps reporting | Mission Control repo |

## What to do as a maintainer right now

1. **Don't add new files here.**
2. **Don't add new tables to the FlashFlow Supabase that are MC-only.** Use the
   MC Supabase project once it's stood up.
3. **Bug fixes in this directory are OK** — fix-forward is fine. Just don't
   build new features here.
4. **If you're tempted to add a FlashFlow nav link to a Command Center page**,
   stop. Use the single "Mission Control" entry in the ADMIN section of
   `lib/navigation.ts` and put your new page on `mc.flashflowai.com`.

## Phase plan

- **Phase A — done (2026-04-29):** removed the 12-item Command Center section
  from the FlashFlow sidebar; collapsed to one "Mission Control" link.
- **Phase B (next 1-2 weeks):** activate the existing `mission-control` private
  repo, copy these files there, smoke-test. DNS still points to old URLs.
- **Phase C (parallel):** Bolt's MMM CC WIP repointed to `mmm-event-os` feature
  branch — never lands in tts-engine.
- **Phase D (after B):** flip DNS, delete from tts-engine, drop migrations.

— Claude
2026-04-29
