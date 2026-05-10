# Infrastructure — repos, URLs, services, env

## Public URLs

- **Mission Control:** https://mc.flashflowai.com (currently stuck on old version due to deploy pipe)
- **MC home:** https://mc.flashflowai.com/admin
- **MC tasks:** /admin/tasks
- **MC fleet:** /admin/fleet
- **MC bookshelf (when deploy unsticks):** /mc
- **FlashFlow:** https://flashflowai.com
- **MMM hub:** https://makingmilesmatter.org
- **HHH event:** Shopify store (URL TBD)
- **Zebby's:** verifying deploy URL

## API URLs (versioned via /api/health)

- `https://mc.flashflowai.com/api/health` — returns `{ version: "7-char-sha", db: { connected, latency_ms, schema_version }, tasks, agents }`
- `https://flashflowai.com/api/health` (when present)

## Repos (Glomskib)

| # | Repo | Vis | Local path | Purpose |
|---|---|---|---|---|
| 1 | tts-engine | Public | `~/tts-engine` | FlashFlow AI |
| 2 | mmm-event-os | Public | `~/projects/mmm-event-os` | MMM Event OS |
| 3 | mission-control | Private | `~/mission-control` | MC / OpenClaw |
| 4 | brandons-second-brain-feed | Private | `~/projects/brandons-second-brain-feed` | Decision feed |
| 5 | zebbys-world | Private | `~/projects/zebbys-world` | Zebby's app |
| 6 | nonprofit-starter | Private | `~/projects/nonprofit-starter` | White-label template |
| 7 | craps-app | Private | `~/projects/craps-app` | Craps social game |
| 8 | buybackos | Private | `~/projects/buybackos` | BuyBackOS SaaS |
| 9 | tcg-scan-pro | Private | `~/projects/tcg-scan-pro` | Card scanner Flutter |
| 10 | openclaw-config | Private | `~/projects/openclaw-config` | OpenClaw config |
| 11 | porchlight | Private | `~/projects/porchlight` | Trades CRM |
| 12 | openclaw-workspace | Private | `~/projects/openclaw-workspace` | Agent memory |
| 13 | ZebbyBrain | Public | `~/projects/ZebbyBrain` | Replit Zebby export |
| 14 | fleet-mailbox | Private | `~/projects/fleet-mailbox` | Brief queue |

## External services in use

- **Vercel** — hosting MC, FF, MMM hub, Zebby's
- **Supabase** — Postgres + Storage. TTS Video Machine project = Pro. Others vary.
- **Turso (libsql)** — MC's main DB
- **Stripe** — payments for FF, MMM, HHH, TCG
- **Resend** — transactional email
- **Tailscale** — fleet networking. Tailnet `tail5646cc.ts.net`
- **Shopify** — HHH event store + endurance theme
- **GitHub** — source. Glomskib org.
- **Late.dev** — social posting pipeline
- **ElevenLabs** — voice for FF
- **Cobalt** — video downloading for FF (Cloudflare tunnel deployment)
- **Anthropic** — Claude API (sonnet-4-5 + haiku-4-5 fallback)
- **OpenAI** — fallback in some places (being removed where possible — vendor leaks were a problem)
- **GoDaddy** — domains

## Vault structure

`~/Documents/MacBook Pro VAULT/` (mirror at `mini:~/openclaw-workspace/vault/`)

```
vault/
├── 00-System/        — goals.yaml, CLAUDE-BOOTSTRAP.md, SESSION-BRIEF.md
├── 10-Projects/      — per-project notes (HHH-2026-master-brief, sponsor-research, etc.)
├── 20-Areas/         — recurring areas
├── 30-Resources/     — reference material
├── 40-Archive/       — done/closed
├── 50-Reference/     — gpt-export, etc.
```

## Mounted folders in Cowork sessions (typical)

- `/Users/makingmilesmatter/Documents/Claude/Projects/Mac Takeover` — daily working files
- `/Users/makingmilesmatter/tts-engine` — FF source
- `/Users/makingmilesmatter/mission-control` — MC source
- `/Users/makingmilesmatter/projects/...` — other repos
- `/Users/makingmilesmatter/Documents/Command-Center` — `.command` scripts
- `/Users/makingmilesmatter/Documents/MacBook Pro VAULT` — vault
- `/Users/makingmilesmatter/mission-control` — MC

## Critical env vars (locations only — never print values)

- `~/tts-engine/web/.env.local` — FF Supabase/Stripe/Anthropic keys
- `~/mission-control/.env.local` — Vercel OIDC token (other env on Vercel)
- Vercel project env vars for both MC + FF (set via dashboard)
- `MISSION_CONTROL_TOKEN` / `MISSION_CONTROL_AGENT_TOKEN` — for inter-agent auth
