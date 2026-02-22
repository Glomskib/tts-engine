# TikTok Session Ops Runbook

Operational guide for maintaining TikTok Studio browser sessions on the Mac runner.
Covers bootstrap login, autonomous runs, session rotation, and troubleshooting.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [File Paths](#file-paths)
3. [Bootstrap Login (One-Time)](#bootstrap-login-one-time)
4. [Normal Autonomous Runs (Headless)](#normal-autonomous-runs-headless)
5. [Session Health Check](#session-health-check)
6. [Exit Codes](#exit-codes)
7. [Cooldown Guardrail](#cooldown-guardrail)
8. [Troubleshooting: Session Invalid](#troubleshooting-session-invalid)
9. [Rotate / Rebootstrap Session](#rotate--rebootstrap-session)
10. [Backup & Restore](#backup--restore)
11. [Safety Notes](#safety-notes)
12. [Orchestrator / Caller Behavior](#orchestrator--caller-behavior)
13. [Mission Control & Telegram](#mission-control--telegram)
14. [Overnight Autonomy Readiness Checklist](#overnight-autonomy-readiness-checklist)

---

## Architecture Overview

```
                  ┌─────────────────────────┐
                  │  OpenClaw / Cron / CLI   │
                  └────────────┬────────────┘
                               │
                  ┌────────────▼────────────┐
                  │  upload-from-pack.ts     │
                  │  (entry point)           │
                  │  exit 0 / 1 / 42        │
                  └────────────┬────────────┘
                               │
                  ┌────────────▼────────────┐
                  │  runUploadToDraft()      │  skills/tiktok-studio-uploader/index.ts
                  │  (retry logic, max 2)    │
                  └────────────┬────────────┘
                               │
                  ┌────────────▼────────────┐
                  │  openUploadStudio()      │  skills/tiktok-studio-uploader/browser.ts
                  │  persistent Chromium     │
                  │  fail-fast if no session │
                  └────────────┬────────────┘
                               │
                  ┌────────────▼────────────┐
                  │  Persistent Profile Dir  │
                  │  data/sessions/          │
                  │  tiktok-studio-profile/  │
                  └─────────────────────────┘
```

Session persistence uses Playwright's `launchPersistentContext` — cookies,
localStorage, and IndexedDB survive across process restarts. No storageState
injection needed; the browser profile directory **is** the session.

---

## File Paths

| Item | Path |
|------|------|
| **Browser profile** (the session) | `~/tts-engine/web/data/sessions/tiktok-studio-profile/` |
| **StorageState backup** | `~/tts-engine/web/data/sessions/tiktok-studio.storageState.json` |
| **Session meta** | `~/tts-engine/web/data/sessions/tiktok-studio.meta.json` |
| **Secondary storageState copy** | `~/.flashflow/tiktok-studio.storageState.json` |
| **Cooldown lockfile** | `~/tts-engine/web/data/sessions/.session-invalid.lock` |
| **Error reports** | `~/tts-engine/web/data/tiktok-errors/<timestamp>/` |
| **Bootstrap script** | `web/scripts/publish/tiktok-studio/bootstrap-session.ts` |
| **Check-session script** | `web/scripts/publish/tiktok-studio/check-session.ts` |
| **Upload runner** | `web/scripts/tiktok-studio/upload-from-pack.ts` |

**Recommended storage location on Mac mini:** Keep defaults (all under
`~/tts-engine/web/data/sessions/`). This is on the local SSD, which is
faster and avoids NFS issues. Do NOT put the profile on an external/network drive.

---

## Bootstrap Login (One-Time)

Run this **once** on the Mac, with a display (headed browser). Requires
human interaction to complete TikTok's phone-code login.

```bash
cd ~/tts-engine/web && pnpm run tiktok:bootstrap
```

**What happens:**
1. Opens a headed Chromium window at `tiktok.com/tiktokstudio/upload`
2. If not logged in, displays a prompt: "LOG IN TO TIKTOK in the browser window."
3. You log in manually (phone code, QR, etc.)
4. Script auto-detects login, saves storageState backup + meta
5. Press Enter if auto-detect doesn't fire

**After bootstrap, verify:**
```bash
cd ~/tts-engine/web && pnpm run tiktok:check-session
```

Expected output: `LOGGED_IN=true`

---

## Normal Autonomous Runs (Headless)

Once bootstrapped, uploads run headless with no human interaction.

### Upload from a local pack directory

```bash
cd ~/tts-engine/web && TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- /path/to/pack
```

### Upload by video ID (fetches pack from FlashFlow API)

```bash
cd ~/tts-engine/web && TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --video-id <UUID>
```

### Post immediately (instead of draft)

```bash
cd ~/tts-engine/web && TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --video-id <UUID> --mode post
```

### Dry-run (check selectors without uploading)

```bash
cd ~/tts-engine/web && TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --dry-run
```

---

## Session Health Check

Quick non-destructive check (opens browser, checks login, exits):

```bash
cd ~/tts-engine/web && pnpm run tiktok:check-session
```

| Exit Code | Meaning |
|-----------|---------|
| 0 | Logged in |
| 1 | Error (couldn't open browser, profile dir missing, etc.) |
| 2 | NOT logged in (session expired) |

Use in a wrapper script:
```bash
cd ~/tts-engine/web && pnpm run tiktok:check-session
rc=$?
if [ $rc -eq 2 ]; then
  echo "Session expired — needs bootstrap"
fi
```

---

## Exit Codes

The upload runner (`upload-from-pack.ts`) uses these exit codes:

| Code | Meaning | Action |
|------|---------|--------|
| **0** | Success (drafted or posted) | None — all good |
| **1** | Generic error (timeout, selector miss, etc.) | May be retried on next run |
| **42** | **Session invalid — needs manual login** | **Stop retrying.** Run `tiktok:bootstrap`. |

Callers (cron, OpenClaw, wrapper scripts) **must** check for exit 42 and
treat it as a hard precondition failure. Do NOT retry the upload — it will
fail the same way every time until a human re-bootstraps.

### Wrapper script example

```bash
#!/bin/bash
cd ~/tts-engine/web

TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --video-id "$1"
rc=$?

case $rc in
  0) echo "Upload succeeded" ;;
  42)
    echo "SESSION EXPIRED — manual login needed"
    # Optional: send one-time alert (Telegram, email, etc.)
    exit 42
    ;;
  *)
    echo "Upload error (exit $rc) — may retry"
    exit $rc
    ;;
esac
```

---

## Cooldown Guardrail

**Problem:** If the session expires and a cron/scheduler keeps invoking
uploads, every invocation would emit an error report and log noise.

**Solution:** A lockfile-based cooldown prevents repeated alerts.

| Env Var | Default | Description |
|---------|---------|-------------|
| `SESSION_INVALID_COOLDOWN_HOURS` | `6` | Hours to suppress repeated session-invalid alerts |

### How it works

1. First upload that detects `login_required`:
   - Writes an error report to `data/tiktok-errors/`
   - Logs `SESSION INVALID — exit 42` to stderr
   - Creates lockfile at `data/sessions/.session-invalid.lock`
   - Exits with code 42

2. Subsequent uploads within the cooldown window:
   - Detects lockfile is fresh
   - Logs `Session-invalid cooldown active (reported Xh ago)` to stderr
   - Exits with code 42 — **no error report, no noise**

3. After cooldown expires:
   - Lockfile is stale → deleted automatically
   - Next failure re-emits the alert and creates a fresh lockfile

### Clear cooldown manually

To force re-emission of the alert (e.g., after you've been notified and
want to test):

```bash
rm ~/tts-engine/web/data/sessions/.session-invalid.lock
```

### Adjust cooldown window

```bash
# Suppress for 12 hours instead of 6
export SESSION_INVALID_COOLDOWN_HOURS=12
```

---

## Troubleshooting: Session Invalid

When you see exit code 42 or `SESSION INVALID` in logs:

### Step 1: Verify

```bash
cd ~/tts-engine/web && pnpm run tiktok:check-session
```

If exit code is 2 → session is genuinely expired.

### Step 2: Re-bootstrap

```bash
cd ~/tts-engine/web && pnpm run tiktok:bootstrap
```

Log in via the headed browser. Wait for "Login confirmed."

### Step 3: Verify again

```bash
cd ~/tts-engine/web && pnpm run tiktok:check-session
# Should print LOGGED_IN=true and exit 0
```

### Step 4: Clear cooldown and resume

```bash
rm -f ~/tts-engine/web/data/sessions/.session-invalid.lock
```

Now autonomous uploads will work again.

### Common causes of session expiry

| Cause | Typical interval | Notes |
|-------|-----------------|-------|
| TikTok server-side token expiry | 7–30 days | Most common |
| IP change (VPN, router restart) | Immediate | TikTok may invalidate session |
| TikTok security challenge | Random | Captcha or 2FA triggered |
| Browser profile corruption | Rare | Usually from a crash mid-write |

---

## Rotate / Rebootstrap Session

### Force rebootstrap (same profile)

This re-uses the existing profile directory — just re-logs in:

```bash
cd ~/tts-engine/web && pnpm run tiktok:bootstrap
```

### Fresh profile (nuclear option)

If the profile is corrupted, start from scratch:

```bash
# 1. Ensure no browser is running against this profile
# 2. Backup existing profile (just in case)
mv ~/tts-engine/web/data/sessions/tiktok-studio-profile \
   ~/tts-engine/web/data/sessions/tiktok-studio-profile.bak.$(date +%Y%m%d)

# 3. Bootstrap creates a fresh profile
cd ~/tts-engine/web && pnpm run tiktok:bootstrap

# 4. Verify
cd ~/tts-engine/web && pnpm run tiktok:check-session

# 5. Clear cooldown
rm -f ~/tts-engine/web/data/sessions/.session-invalid.lock

# 6. Clean up old backup after a few days
rm -rf ~/tts-engine/web/data/sessions/tiktok-studio-profile.bak.*
```

### Use a different profile directory

```bash
export TIKTOK_BROWSER_PROFILE=~/tts-engine/web/data/sessions/tiktok-studio-profile-v2
cd ~/tts-engine/web && pnpm run tiktok:bootstrap
```

---

## Backup & Restore

### What to back up

The **profile directory** is the authoritative session source:
```
~/tts-engine/web/data/sessions/tiktok-studio-profile/
```

The **storageState JSON** is a supplementary backup (saved by bootstrap):
```
~/tts-engine/web/data/sessions/tiktok-studio.storageState.json
```

### Create a backup

```bash
# While NO upload is running:
tar czf ~/backups/tiktok-session-$(date +%Y%m%d-%H%M).tar.gz \
  -C ~/tts-engine/web/data/sessions \
  tiktok-studio-profile \
  tiktok-studio.storageState.json \
  tiktok-studio.meta.json
```

### Restore from backup

```bash
# 1. Stop any running uploads
# 2. Remove current (corrupted) profile
rm -rf ~/tts-engine/web/data/sessions/tiktok-studio-profile

# 3. Restore
tar xzf ~/backups/tiktok-session-YYYYMMDD-HHMM.tar.gz \
  -C ~/tts-engine/web/data/sessions/

# 4. Verify
cd ~/tts-engine/web && pnpm run tiktok:check-session

# 5. Clear cooldown
rm -f ~/tts-engine/web/data/sessions/.session-invalid.lock
```

---

## Safety Notes

1. **Do NOT delete the profile directory during an active run.**
   Playwright holds a lock on the profile. Deleting it mid-run will crash
   the browser and may corrupt state. Always stop uploads first.

2. **Do NOT run two uploads against the same profile concurrently.**
   Chromium persistent context is single-instance. The second launch will
   fail with a profile lock error. The stale-lock cleanup handles crashes,
   not concurrent access.

3. **Do NOT commit the profile directory to git.** It contains cookies and
   session tokens. It's already in `.gitignore` under `data/`.

4. **Do NOT share the profile between machines.** Chromium profiles are
   not portable across OS or architecture. Each Mac mini gets its own
   bootstrap.

5. **Headless requires a prior headed bootstrap.** You cannot log in
   headless — TikTok requires visual interaction for login. Always
   bootstrap in headed mode first, then switch to `TIKTOK_HEADLESS=true`.

6. **The storageState JSON is a backup, not the source of truth.**
   The persistent profile directory is what Playwright actually uses.
   StorageState is saved by bootstrap for emergency restore scenarios.

---

## Orchestrator / Caller Behavior

Any system that invokes the upload scripts **must** handle exit 42 correctly.
This section documents how each caller type should behave.

### All Entry Points Emit Exit 42

| Script | npm Command | Exit 42 |
|--------|-------------|---------|
| `upload-from-pack.ts` | `tiktok:upload-pack` | Yes (+ cooldown) |
| `upload.ts` | `tiktok:upload` | Yes |
| `check-session.ts` | `tiktok:check-session` | Exit 2 (not 42 — check-only, no upload) |

### Cron / Launchd

```bash
# Correct: halt on exit 42, do not retry
0 20 * * * cd ~/tts-engine/web && TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --video-id "$VID" >> /tmp/tiktok.log 2>&1; [ $? -eq 42 ] && echo "[$(date)] SESSION EXPIRED" >> /tmp/tiktok-blocked.log
```

**Do NOT** add retry loops around the upload command. Exit 42 means every
subsequent attempt will fail identically until a human bootstraps.

### OpenClaw Agent (Flash)

The Flash agent invokes upload via Telegram skill phrases ("upload video X").
The agent receives the CLI exit code and should:

1. **Exit 0** → report success to user
2. **Exit 1** → report error, may suggest retry
3. **Exit 42** → report "Session expired. Run `npm run tiktok:bootstrap` on the Mac." **Do not retry.**

The SKILL.md files document this behavior for the agent.

### Shell Wrapper Scripts

```bash
#!/bin/bash
set -euo pipefail
cd ~/tts-engine/web

TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- "$@"
rc=$?

case $rc in
  0)  echo "OK" ;;
  42) echo "BLOCKED: session expired — needs manual bootstrap"
      exit 42 ;;
  *)  echo "ERROR: exit $rc"
      exit $rc ;;
esac
```

### Batch / Multi-Video Loops

If processing multiple videos in a loop, **stop the entire batch** on exit 42:

```bash
for vid in "${VIDEO_IDS[@]}"; do
  TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --video-id "$vid"
  rc=$?
  if [ $rc -eq 42 ]; then
    echo "Session expired after $vid — stopping batch."
    exit 42
  fi
done
```

### Summary: Exit Code Contract

```
┌──────────────────────────┐
│  Caller invokes upload   │
└────────────┬─────────────┘
             │
     ┌───────▼───────┐
     │  exit code?    │
     └───┬───┬───┬───┘
         │   │   │
    0    │   │   │  42
  ┌──────┘   │   └──────────┐
  │     1    │              │
  │   ┌──────┘              │
  ▼   ▼                     ▼
 OK  Error               BLOCKED
      │                     │
      │ may retry           │ DO NOT retry
      │ next scheduled      │ emit one alert
      │ run                 │ stop batch
      │                     │ wait for human
      ▼                     ▼
```

---

## Mission Control & Telegram

**No changes needed.** MC and Telegram operate in polling-only mode:

- **Telegram bot** uses long-polling via OpenClaw (`getUpdates`).
  There is no webhook registered. (See `web/CLAUDE.md` for webhook safety.)
- **Mission Control** is an HTTP API on `127.0.0.1:3100` that the agent
  calls (`mc event`, `mc claim`, `mc heartbeat`). It does not auto-trigger uploads.
- **Cron** is empty (`~/.openclaw/cron/jobs.json` has no scheduled jobs).
- **Upload triggers** are user-initiated via Telegram skill phrases
  ("upload video X", "post to tiktok") or direct CLI invocation.

The session guardrails (exit 42, cooldown) are entirely within
`upload-from-pack.ts` and do not affect MC, Telegram, or polling behavior.

---

## Overnight Autonomy Readiness Checklist

Complete this checklist before leaving the system to run overnight.

| # | Item | Command / Check | Pass |
|---|------|----------------|------|
| 1 | Session is valid | `pnpm run tiktok:check-session` exits 0 | [ ] |
| 2 | Bootstrap was done recently (< 7 days) | Check `data/sessions/tiktok-studio.meta.json` → `saved_at` | [ ] |
| 3 | No stale cooldown lockfile | `ls data/sessions/.session-invalid.lock` → should not exist | [ ] |
| 4 | `TIKTOK_HEADLESS=true` is set in `.env.local` or runner env | `grep TIKTOK_HEADLESS .env.local` | [ ] |
| 5 | No browser running against profile | `ps aux \| grep -i chromium \| grep tiktok-studio-profile` → empty | [ ] |
| 6 | Disk space > 2 GB free | `df -h .` | [ ] |
| 7 | FlashFlow API is reachable | `curl -s http://localhost:3000/api/health` | [ ] |
| 8 | `FF_API_TOKEN` is set (if using `--video-id` mode) | `grep FF_API_TOKEN .env.local` | [ ] |
| 9 | Dry-run succeeds | `TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --dry-run` exits 0 | [ ] |
| 10 | Error directory is writable | `touch data/tiktok-errors/.write-test && rm data/tiktok-errors/.write-test` | [ ] |
| 11 | Session cooldown window is acceptable | `echo $SESSION_INVALID_COOLDOWN_HOURS` → 6 (or your preference) | [ ] |
| 12 | Recent backup exists | `ls ~/backups/tiktok-session-*.tar.gz` | [ ] |

### Quick pre-flight script

```bash
#!/bin/bash
cd ~/tts-engine/web
echo "=== Overnight Pre-Flight ==="

# 1. Session check
pnpm run tiktok:check-session 2>/dev/null
if [ $? -ne 0 ]; then echo "FAIL: Session invalid"; exit 1; fi
echo "OK: Session valid"

# 2. No stale lockfile
if [ -f data/sessions/.session-invalid.lock ]; then
  echo "WARN: Stale cooldown lockfile exists — removing"
  rm data/sessions/.session-invalid.lock
fi
echo "OK: No cooldown lockfile"

# 3. Dry run
TIKTOK_HEADLESS=true pnpm run tiktok:upload-pack -- --dry-run 2>/dev/null
if [ $? -ne 0 ]; then echo "FAIL: Dry run failed"; exit 1; fi
echo "OK: Dry run passed"

# 4. Disk space
avail=$(df -m . | tail -1 | awk '{print $4}')
if [ "$avail" -lt 2048 ]; then echo "WARN: Low disk space (${avail}MB)"; fi
echo "OK: Disk space ${avail}MB available"

echo "=== All checks passed ==="
```
