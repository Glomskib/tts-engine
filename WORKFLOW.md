# Verification Workflow

## Run All Verifications

```powershell
.\scripts\verify_all.ps1
```

This script:
- Auto-starts the dev server if not running
- Runs Phase 7 and Phase 8 verifications
- Stops the dev server if it started one
- Exits with code 0 on success, 1 on failure

## If Verification Fails

Run Claude with the standard prompt:

```
claude "Follow CLAUDE.md exactly. Goal: make scripts\\verify_all.ps1 pass.
1) Run .\\scripts\\verify_all.ps1 and capture the first failing check output.
2) Identify whether the failure is due to script assumptions, API behavior, or missing migration.
3) Produce the minimal unified diff patch to fix the root cause (no refactors).
4) Re-run .\\scripts\\verify_all.ps1 and confirm PASS.
Output: Files changed, unified diff patch, verification commands."
```

## Rules

- Do NOT manually edit verification scripts
- Do NOT skip phases
- Always commit after a passing verification
