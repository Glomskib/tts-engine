# Contributing Guidelines

## Absolute Rules

### 1. Never Overwrite Files
- All code changes must be applied as **unified diff patches only**
- Do not rewrite entire files
- Do not replace files wholesale
- Minimal, line-level edits only

### 2. Always Run Commands from Correct Directory
- **Dev server, build, and npm commands**: Run from `/web`
- **Verification scripts**: Run from repo root

## Verification

Start dev server (from repo root):

```powershell
cd C:\Users\Brandon\tts-engine
.\scripts\dev_web.ps1
```

Run Phase 7 verification (in a new terminal):

```powershell
cd C:\Users\Brandon\tts-engine
.\scripts\verify_phase7.ps1
```

Install the pre-commit hook (from repo root):

```powershell
cd C:\Users\Brandon\tts-engine
.\scripts\install_git_hooks.ps1
```

Test the hook (dry run):

```powershell
cd C:\Users\Brandon\tts-engine
git add CONTRIBUTING.md
git commit --dry-run -m "test hook"
```

## Directory Structure

```
tts-engine/
├── web/                    # Next.js app (run npm here)
├── scripts/                # Helper scripts (run from repo root)
│   ├── dev_web.ps1         # Start dev server
│   └── verify_phase7.ps1   # Run Phase 7 smoke test
├── CONTRIBUTING.md         # This file
└── .cursor/rules.md        # Agent workflow rules
```

## Workflow

1. Make changes via unified diff patches
2. Start dev server: `.\scripts\dev_web.ps1`
3. Verify: `.\scripts\verify_phase7.ps1`

## Pre-commit Enforcement

Install the pre-commit hook (one-time setup):
```powershell
.\scripts\install_git_hooks.ps1
```

The hook validates:
- Balanced markdown fences in CONTRIBUTING.md
- No merged-lines corruption
- Correct line endings (.ps1=CRLF, .md=LF)
- No large file overwrites (>300 lines added+deleted)

## Questions?
Open an issue or ask in the PR.
