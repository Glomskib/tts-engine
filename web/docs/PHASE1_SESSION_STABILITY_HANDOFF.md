# Phase 1: Session Stability — Operator Handoff

Single-page reference for running FlashFlow TikTok uploads overnight without guesswork.

---

## What Phase 1 Achieved

- **Persistent browser session** — Playwright persistent Chromium profile survives across process restarts. Bootstrap once, upload many times.
- **Fail-fast guardrails** — session-invalid exits immediately with code 42. No login retry loops. No human intervention in automated runs.
- **Cooldown suppression** — first session failure emits one alert + error report, then suppresses duplicates for 6 hours (configurable).
- **Healthcheck script** — single command validates session, lockfiles, and selectors before leaving the system overnight.
- **Backup & rotate scripts** — timestamped backups with auto-pruning; safe rotation with lock detection.

---

## Commands

All commands run from `~/tts-engine/web`.

```bash
cd ~/tts-engine/web
```

### Bootstrap (one-time, headed)
```bash
pnpm run tiktok:bootstrap
```
Opens a browser window. Log in to TikTok manually. Session auto-saves.

### Verify session
```bash
pnpm run tiktok:check-session
```

### Healthcheck (pre-flight)
```bash
pnpm run tiktok:healthcheck
```
Checks profile, lockfiles, storageState age, and runs regression harness headless.

### Normal headless upload
```bash
TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --video-id <UUID>
TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --video-id <UUID> --mode post
TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- /path/to/pack-dir
```

### Dry run (check selectors, no upload)
```bash
TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --dry-run
```

### Backup session
```bash
pnpm run tiktok:backup
```
Creates `data/sessions/backups/tiktok-session-<timestamp>.tar.gz`. Keeps last 10.

### Rotate session (nuclear reset)
```bash
pnpm run tiktok:rotate
# Then re-bootstrap:
pnpm run tiktok:bootstrap
```

---

## Exit Codes

Every upload and session script uses these codes:

| Code | Meaning | What to do |
|------|---------|------------|
| **0** | Success | Nothing — video drafted or posted |
| **1** | Error (timeout, selector miss, API failure) | Check logs. May succeed on next run. |
| **42** | **Session invalid — needs manual login** | **Stop retrying.** Run `pnpm run tiktok:bootstrap` on the Mac. |

**Exit 42 is a hard stop.** Every subsequent attempt will fail identically until a human bootstraps. The cooldown guardrail ensures only one alert per 6-hour window.

---

## Overnight Autonomy Checklist

Run through before leaving the system unattended.

| # | Check | Command | Pass |
|---|-------|---------|------|
| 1 | Healthcheck passes | `pnpm run tiktok:healthcheck` → exit 0 | [ ] |
| 2 | Bootstrap is recent (< 7 days) | Check `data/sessions/tiktok-studio.meta.json` | [ ] |
| 3 | No cooldown lockfile | `ls data/sessions/.session-invalid.lock` → not found | [ ] |
| 4 | TIKTOK_HEADLESS=true is set | `grep TIKTOK_HEADLESS .env.local` | [ ] |
| 5 | No browser running on profile | `ps aux \| grep chromium \| grep tiktok-studio` → empty | [ ] |
| 6 | Disk space > 2 GB | `df -h .` | [ ] |
| 7 | FlashFlow API reachable | `curl -s localhost:3000/api/health` | [ ] |
| 8 | FF_API_TOKEN set (if using --video-id) | `grep FF_API_TOKEN .env.local` | [ ] |
| 9 | Dry run passes | `TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --dry-run` → exit 0 | [ ] |
| 10 | Recent backup exists | `ls data/sessions/backups/` | [ ] |

**Shortcut:** `pnpm run tiktok:healthcheck` covers items 1–4 and 9.

---

## Troubleshooting Decision Tree

```
Upload failed — what happened?
│
├─ Exit 42: "Session invalid"
│  │
│  ├─ Is cooldown lockfile present?
│  │  ├─ Yes, < 6h old → Already reported. Wait or bootstrap now.
│  │  └─ Yes, > 6h old → Stale. Will auto-clear on next run.
│  │
│  └─ Fix:
│     1. pnpm run tiktok:bootstrap     (log in manually)
│     2. pnpm run tiktok:check-session  (verify)
│     3. rm -f data/sessions/.session-invalid.lock
│
├─ Exit 1: "Error"
│  │
│  ├─ Check data/tiktok-errors/<latest>/error-report.json
│  │
│  ├─ "timeout" or "navigation" → Transient. Will auto-retry (max 2).
│  ├─ "File input not found" → TikTok UI changed. Run --dry-run to audit selectors.
│  ├─ "Product not found" → Verify tiktok_product_id in FlashFlow.
│  └─ "Captcha/2FA detected" → Run bootstrap to solve manually.
│
├─ Browser won't launch (profile lock)
│  │
│  ├─ Is another upload running?
│  │  ├─ Yes → Wait for it to finish.
│  │  └─ No → Stale lock from crash. Auto-cleaned on next run.
│  │
│  └─ Nuclear: pnpm run tiktok:rotate && pnpm run tiktok:bootstrap
│
└─ StorageState corrupt / profile corrupt
   │
   ├─ Restore from backup:
   │  ls data/sessions/backups/
   │  tar xzf data/sessions/backups/tiktok-session-LATEST.tar.gz \
   │    -C data/sessions/
   │  pnpm run tiktok:check-session
   │
   └─ No backup? Rotate and re-bootstrap:
      pnpm run tiktok:rotate
      pnpm run tiktok:bootstrap
```

---

## Key Paths & References

| Resource | Location |
|----------|----------|
| **Full runbook** | `web/docs/TIKTOK_SESSION_OPS.md` |
| **Browser profile** | `web/data/sessions/tiktok-studio-profile/` |
| **StorageState backup** | `web/data/sessions/tiktok-studio.storageState.json` |
| **Cooldown lockfile** | `web/data/sessions/.session-invalid.lock` |
| **Session backups** | `web/data/sessions/backups/` |
| **Error reports** | `web/data/tiktok-errors/<timestamp>/` |
| **Regression reports** | `web/var/run-reports/<timestamp>/` |
| **Healthcheck script** | `web/scripts/tiktok-studio/session-healthcheck.sh` |
| **Backup script** | `web/scripts/tiktok-studio/backup-tiktok-session.sh` |
| **Rotate script** | `web/scripts/tiktok-studio/rotate-tiktok-session.sh` |
| **Session status API** | `GET /api/onboarding/tour` (Supabase session TTL) |

### npm Scripts

| Script | Description |
|--------|-------------|
| `tiktok:bootstrap` | One-time headed login |
| `tiktok:check-session` | Quick session validity check |
| `tiktok:healthcheck` | Comprehensive pre-flight |
| `tiktok:upload-pack` | Main upload runner |
| `tiktok:upload` | Alternative upload (--pack-dir) |
| `tiktok:regression` | Selector regression harness |
| `tiktok:backup` | Backup session to tar.gz |
| `tiktok:rotate` | Archive + reset session |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TIKTOK_HEADLESS` | `false` | Must be `true` for overnight runs |
| `TIKTOK_BROWSER_PROFILE` | `data/sessions/tiktok-studio-profile` | Profile directory |
| `SESSION_INVALID_COOLDOWN_HOURS` | `6` | Suppress repeated alerts |
| `TIKTOK_BACKUP_KEEP` | `10` | Number of backups to retain |
| `FF_API_URL` | `http://localhost:3000` | FlashFlow API for callbacks |
| `FF_API_TOKEN` | _(empty)_ | Required for --video-id uploads |
