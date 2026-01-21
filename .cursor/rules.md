# Non-negotiable workflow rules

## 1) NEVER OVERWRITE FILES
- Do not rewrite entire files.
- Do not replace files wholesale.
- All changes must be applied as unified diff patches only.

## 2) ALWAYS GENERATE REAL PATCHES (NO PLACEHOLDERS)
- Every change request must produce a complete unified diff:
  - Must include: `--- a/...` and `+++ b/...`
  - Must include real hunks with `@@`
  - Must include context lines and actual `-`/`+` lines
- Never output placeholders like "<PASTE DIFF HERE>".

## 3) APPLY THE PATCH YOURSELF
- After generating the diff, apply it automatically using Cursor's built-in apply/patch capability.
- Do not ask the user to apply edits manually.

## 4) MINIMAL, SAFE EDITS ONLY
- Touch the minimum number of lines required.
- No formatting-only changes.
- No unrelated refactors.
- Preserve existing behavior unless explicitly requested.

## 5) VERIFY
- After applying, provide:
  - files changed
  - a short summary of what changed
  - exact commands to verify (PowerShell commands for Windows)
