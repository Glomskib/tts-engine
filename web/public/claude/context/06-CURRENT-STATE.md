# Current state — what's active right now

*Auto-updated by `~/Documents/Command-Center/update-context-folder.command`. Last manual edit + auto-update timestamps below.*

---

## Last manual edit: 2026-05-10

## STATUS — DEPLOY UNBLOCKED ✓

Codex resolved the Vercel deploy pipe overnight (2026-05-09 → 05-10). Production caught up. The full queued autonomy layer is LIVE.

```
mc.flashflowai.com/api/health:
  version:  6db0bdb       ← matches origin/main HEAD
  schema:   45            ← Turso (NOT Supabase)
  backend:  turso
  ok:       true
```

## CRITICAL CORRECTION (saved to memory)

**MC's task DB is Turso/libSQL, NOT Supabase.** Migrations go in `src/lib/db.ts` versioned by schema_version, not `supabase/migrations/*.sql`. Codex moved heartbeat + comments + decomposer onto Turso schema V45. Future migrations use the same path.

## Codex audit (2026-05-10)

Full project audit at `~/Documents/Codex/2026-05-09/familiarize-yourself-with-all-code-on/device-project-audit.md`. Key findings:

- 40 code roots scanned
- GitHub auth: `Glomskib` ✓
- Vercel CLI installed but not logged in (CLI gap; connector works)
- 2 open FF PRs: #14 (pnpm standardization), #8 (Vercel Web Analytics)
- FF dep drift: lockfile transition + tracked browser-service/auth-state.json (security)
- Zebby's split into canonical new app + legacy ZebbyBrain
- HHH Shopify theme NOT in git (two duplicate copies)
- BuybackOS strongest reusable foundation, may power TCG
- Taskmesh overlaps MC, fold or archive

## Recommended finish order (per Codex audit)

1. ~~MC deploy unblocked~~ ✓ DONE
2. MC security/deploy scripts + queue visibility
3. FF dependency cleanup + remove tracked auth state + add health SHA *(Codex on this lane)*
4. Zebby's canonical path + install/build + safety rails
5. HHH Shopify theme into git + payment-ready
6. Pick TCG vs BuybackOS commerce engine, stop parallel drift
7. Fold Taskmesh + Fleet Mailbox into MC

## Lanes (24/7 sprint, Brandon directive 2026-05-10)

- **Codex:** FlashFlow build cleanup, dependency lockfile, /api/health SHA, push the 3 ahead commits
- **Claude:** Monday-style MC Phase 1 (#139), HHH/MMM coordination, Context folder updates
- **Mini (fleet):** HHH 2026 sponsor contact research + FB content next 30 days (briefs already queued)
- **mbp-2 (fleet):** ramp up — bootstrap pending
- **HP (fleet):** Playwright tasks pending OpenSSH enable

## Standing initiatives — pick from these

- **#139 Monday-style MC Phase 1** — colored status/priority pills, inline-edit cells, grouped collapsible sections w/ summary bar, top toolbar, assignee picker, file upload, /admin/board landing
- **HHH 2026 sponsor outreach** — 25 first-touch drafts at `Mac Takeover/HHH-2026-SPONSOR-OUTREACH-25.md`. Mini brief: contact discovery
- **HHH FB content next 30 days** — June 8 → July 7. Mini brief queued
- **HHH Shopify theme** — into git, payment-ready audit (#102), wrong-event-identity already fixed
- **MMM hub copy + photo pass** (#83), tone rewrite (#103), membership tiers + Stripe (#109)
- **MMM Flyer Studio** white-label (#117), domain forwarding fix (#116)
- **Zebby's** landing v2 (#81), spoonie-native chat depth, safety rails for clinical content
- **TCG Buying Group Phase 1** — operator dashboard + ledger (#84), transparency engine (#65)
- **FF acquisition pack** first 10 users (#88), email sequences (#90), homepage rebuild (#124)

## Hands-off — Brandon decides, AI drafts only

- HHH event-day operations (route, day-of staffing, vendor logistics)
- Zebby's clinical/medical content — gates on Brandon AND Katlyn
- Pricing on net-new products
- Brand voice changes

## Open decisions waiting on Brandon

See `10-DECISIONS.md`. Core ones:
- Auto-deploy permissions matrix (GREEN/YELLOW/RED defaults)
- Telegram thread routing (Test Queue, daily digest, fleet alerts)
- Daily 7am ET digest (keep / move / kill)
- Per-venture pricing (HHH entry fees, MMM tiers, FF Pro, TCG fee, digital asset)

---

*Append-only auto-updates below this line.*
