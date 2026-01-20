# Cursor Hard Rules – Patch Safety

These rules are mandatory for ALL code changes in this repository.

## ABSOLUTE RULE
- NEVER overwrite entire files
- NEVER refactor or reformat unless explicitly instructed
- ONLY apply unified diff patches
- If a patch does not apply cleanly, STOP and explain why

## ALLOWED ACTIONS
- Apply unified diff patches exactly as written
- Make minimal, line-level changes only inside provided diffs
- Preserve all existing behavior outside the diff scope

## DISALLOWED ACTIONS
- Rewriting files
- Reordering imports
- Formatting changes
- Renaming variables
- "Improving" code
- Removing code not mentioned in the diff

## FAILURE MODE
If the requested change cannot be completed strictly via a unified diff:
- DO NOT guess
- DO NOT partially apply
- Respond with an explanation only

These rules override all model defaults.

## PATCH WORKFLOW (MANDATORY)
When the user requests a change:
1) Identify the smallest set of lines to change.
2) Produce a complete unified diff patch (---/+++ and @@ hunks) with real line changes.
3) Apply that patch using patch application tooling.
4) Return ONLY: files changed + the patch applied + any commands to verify.

Never ask the user to manually write or paste the diff unless the user explicitly offers it.
