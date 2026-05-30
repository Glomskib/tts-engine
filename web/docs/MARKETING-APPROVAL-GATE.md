# Marketing approval gate

Created 2026-05-30 after Facebook posts shipped without Brandon's approval.

## TL;DR

Nothing posts to social until Brandon explicitly approves it. Two stacked
guards in the `marketing-scheduler` cron enforce this:

1. **Env kill-switch** — `MARKETING_AUTOPUBLISH` must equal `on`. Default
   off → the cron no-ops every run.
2. **Per-post approval flag** — `marketing_posts.meta.approved=true`.
   Unapproved rows are skipped even when the env is on.

Both must be true. Belt-and-suspenders.

## How posts get created (unchanged)

| Source | What it does |
|---|---|
| `cron/hhh-daily-content` | Generates one HHH FB post per day, inserts as `pending`. |
| `scripts/daily-intel/run.ts` + cycling/zebby/weekly agents | Enqueue social drafts via `lib/marketing/queue.ts::enqueue()`. |
| `api/marketing/enqueue` (POST) | Manual front-door for mc-post CLI, Telegram bots, Mission Control. |
| `api/marketing/repurpose` | Repurpose pipeline. |

Every path lands rows as `status='pending'` with `meta.approved` absent →
they all wait for approval now.

## How Brandon approves

### From his phone / anywhere — `mc-post` CLI

```bash
mc-post pending             # see what's waiting
mc-post approve <id>        # ship it (on next 15-min cron)
mc-post reject  <id> --reason "off voice"
```

The CLI lives at `bin/mc-post` in this repo. To install:

```bash
ln -s "$(pwd)/bin/mc-post" ~/.local/bin/mc-post
```

It needs two env vars in `~/.zshrc`:

```bash
export MISSION_CONTROL_TOKEN="..."     # same value Vercel uses
export FLASHFLOW_BASE_URL="https://flashflowai.com"   # optional
```

### From any HTTP client

```
POST https://flashflowai.com/api/marketing/posts/<id>/approve
Authorization: Bearer <MISSION_CONTROL_TOKEN>
{ "approver": "brandon", "note": "optional" }
```

```
POST https://flashflowai.com/api/marketing/posts/<id>/reject
Authorization: Bearer <MISSION_CONTROL_TOKEN>
{ "reason": "off voice" }
```

```
GET  https://flashflowai.com/api/marketing/pending
Authorization: Bearer <MISSION_CONTROL_TOKEN>
```

### From the admin queue page

`/admin/marketing/queue` already exists for browser approvals.

## How to actually turn publishing back on

After Brandon trusts the approval gate (probably right away — try a real
post first), set the env in Vercel:

```
MARKETING_AUTOPUBLISH=on
```

From that moment, approved posts will ship on the next 15-min cron.
Without that env, even approved posts will sit (the cron stays paused).

## The publish-now bypass

`POST /api/marketing/enqueue { publishNow: true }` skips the cron and
hits Late.dev directly. This still goes through claim-risk, but it does
NOT require `meta.approved`. Only Brandon's authenticated tools can call
it (owner session or `MISSION_CONTROL_TOKEN`), so it's not a public
hole — but if you want to lock it down too, gate it on a separate env
like `MARKETING_PUBLISH_NOW_ALLOWED`.

## Files touched

- `web/app/api/cron/marketing-scheduler/route.ts` — added env + approval check
- `web/app/api/marketing/posts/[id]/approve/route.ts` — new
- `web/app/api/marketing/posts/[id]/reject/route.ts` — new
- `web/app/api/marketing/pending/route.ts` — new
- `bin/mc-post` — new CLI
