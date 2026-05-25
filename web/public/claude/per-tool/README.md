# PER-TOOL-BOOTSTRAP

The same brain, exposed to every surface in the format it actually accepts.

Every file here is a paste-in or drop-in for a specific AI surface. They all do the same thing: point the AI at this vault (or the hosted mirror at `flashflowai.com/claude/`) and load the standing rules.

## Files

| File | What it's for | How to use |
|---|---|---|
| `cowork-project-knowledge.md` | Claude Cowork desktop / mobile / web project setup | Paste into "Brandon Operations" project → Customize → Project instructions |
| `mobile-paste.md` | One-line opener for any ad-hoc mobile/web chat (Claude, ChatGPT, Gemini) | Copy → paste as first message in a new chat |
| `chatgpt-paste.md` | ChatGPT-specific (handles its inability to read filesystems) | Copy → paste as first message |
| `codex-cli-AGENTS.md` | Codex CLI / Codex Cloud automatic reader | `cp` to `~/.codex/AGENTS.md` (the routing script does this) |
| `claude-code-CLAUDE.md` | Claude Code automatic reader | `cp` to `~/.claude/CLAUDE.md` (the routing script does this) |

## Why these are here, not in the v2 brain

They live in `MacBook Pro VAULT/00-System/PER-TOOL-BOOTSTRAP/` because **MacBook Pro VAULT is the canonical brain** (see `00-CANONICAL.md` at the vault root). The v2 brain at `~/Documents/MBP-VAULT-V2/` was abandoned mid-install and is now a deprecation stub.

## Updating these

When you change the standing rules in `00-System/CLAUDE-BOOTSTRAP.md`, the per-tool files don't need to change — they all point back to the bootstrap. The only time you edit a per-tool file is when the surface itself changes (new model, new app behavior).

After editing any per-tool file, run `bash ~/Documents/Command-Center/publish-mega-context.command` to push to the hosted mirror.
