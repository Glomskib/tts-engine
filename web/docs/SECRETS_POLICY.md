# Secrets Policy — FlashFlow / OpenClaw

## Rule #1: No secrets in git. Ever.

Credentials, API keys, OAuth tokens, service account files, and any value
you'd rotate if exposed must NEVER be committed to any repository.

---

## Where to store local-only keys

| Context | Location | Notes |
|---|---|---|
| FlashFlow / tts-engine | `tts-engine/web/.env.local` | Already in .gitignore via `.env*` |
| OpenClaw workspace | Shell environment or pass(1) | NOT in workspace files |
| Mission Control | `mission-control/.env.local` | Never `.env` (committed by default in some configs) |
| CI / Vercel | Vercel Environment Variables UI | Never in repo |

## OpenClaw workspace rules

The workspace at `~/.openclaw/workspace/` is a git repo synced to GitHub.
The `.gitignore` there blocks `*.txt`, `*.json`, `.env*` — but be aware:

- `brave_api_key.txt`, `late_api_key.txt`, `service-account-key.json` already exist
  as untracked files. They are blocked by `.gitignore` as of 2026-03-05.
- If you need these values in a script, read them from env vars at runtime:
  ```bash
  export BRAVE_API_KEY=$(cat ~/.openclaw/workspace/brave_api_key.txt)
  ```
- Better: store in your shell profile (`~/.zshrc`) or use `pass` / macOS Keychain.

## Credential file inventory

| File | Contains | Risk if leaked | Action |
|---|---|---|---|
| `~/.openclaw/workspace/brave_api_key.txt` | Brave Search API key | Low (rate-limit impact) | Move to env var |
| `~/.openclaw/workspace/late_api_key.txt` | Late.dev API key (`sk_...`) | High (social media posts) | Rotate + move to env var |
| `~/.openclaw/workspace/service-account-key.json` | Google service account | Critical (full Drive access) | Rotate + store as Vercel secret |

## If credentials are leaked

1. **Rotate immediately** — don't wait to confirm exposure.
2. Check git log: `git log --all --full-history -- filename` to confirm if ever committed.
3. If committed: use `git filter-repo` or BFG to purge history, then force-push.
4. Notify affected services (Google, Late.dev, Brave) via their developer consoles.

## Pre-commit checklist

Before any `git add` / `git commit`:
```bash
# Check for common secret patterns
git diff --cached | grep -E "(api_key|secret|password|token|sk_|pk_)" | grep "^\+" | grep -v "# " | grep -v "placeholder"
```

Or install `git-secrets` / `gitleaks` as a pre-commit hook.

---

*This policy was established following the FlashFlow backend audit on 2026-03-05.*
*See `docs/audits/backend-audit-2026-03-05.md` finding FF-AUD-001 for details.*
