# The fleet — hardware + agents

Brandon owns multiple machines specifically to run autonomous AI workloads. All on Tailscale tailnet `tail5646cc.ts.net`.

## Hardware

| Machine | Hostname | Role | Status | Notes |
|---|---|---|---|---|
| MBP | Brandons-MacBook-Pro | Command center | Active | Brandon's primary. This is where you usually have Cowork sessions. |
| mini | brandons-mac-mini | Execution worker | 24/7 | Polls MC `/api/bolt/queue` every 60s. Tailscale: `100.109.132.69`. |
| mbp-2 | brandons-mpb-2 | Second worker | Onboarding | Saturday's MacBook. `mbp-2016-bootstrap.command` runs on first wake. |
| HP | (windows hostname) | Playwright/Windows | Onboarding | Polling install in progress. Browser automation tasks. |

## Agents (per-venture sub-agents in MC)

- **chief-of-staff** — Bolt's brain. Lives at `mission-control/src/lib/agents/chief-of-staff/run.ts`. Gets Telegram via Bolt AI Assistant.
- **mmm-customer-service** — Polls miles@ Gmail every 15 min, classifies (sponsor/volunteer/donor/rider/press/spam), drafts in Brandon's voice, saves to Drafts (NEVER auto-sends), Telegram nudges Brandon to approve.
- **mc-poller** (mini) — Pulls work from MC's queue, executes briefs, posts results.
- **fleet-health-sweep** — Cron every 5 min, marks devices stale/offline, alerts Brandon.
- **auto-decomposer** — Cron every 30 min, reads goals.yaml, emits new fleet tasks targeting lowest-progress venture.
- **flashflow-support** — Planned. Per-venture customer service for FF.
- **zebbys-empath** — Planned. Spoonie-native Zebby's responses (gated on Katlyn approval).
- **hhh-event-ops** — Planned. Event-day operations agent.

## Fleet-mailbox (git-based brief queue)

Path: `~/projects/fleet-mailbox` (Glomskib/fleet-mailbox)

Pattern: drop a brief into `fleet/queued/<id>--<device>.md`. The target device's claude-code watcher pulls it, executes, writes results. Used when MC's queue isn't suitable.

## Communication

- **Telegram bot routing:**
  - Revenue Lab → Bolt AI Assistant (Brandon's main thread)
  - Making Miles Matter Inc → MMM-specific
  - Recommended (not yet split): Claude/Test-Queue, Claude/Fleet-Status, Claude/Auto-Spawn

- **Bolt invocation:** Brandon sends Telegram messages → Bolt's webhook (`/api/webhooks/telegram-chief`) → chief-of-staff agent runs → response back as Telegram message.

## Heartbeats

Each machine pings `/api/fleet/heartbeat` every 5 min via launchd (`com.brandon.mc-heartbeat`). MC marks machines healthy/stale/offline. Fleet visualizer at `/mc` shows status.

## When something on the fleet is broken

1. Heartbeat fails → fleet-health-sweep alerts Brandon's Telegram
2. Brief stuck in `queued/` for >2h → check the target device's watcher
3. Bolt unresponsive → check chief-of-staff Anthropic API errors
4. MC unreachable → check Vercel deploy + Turso DB
