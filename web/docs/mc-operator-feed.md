# Mission Control — Operator Feed (Bolt relay)

The operator feed is the "On your plate" zone on `/admin/command-center`.
Any MC-authenticated service (Bolt, schedulers, watchdogs) can POST items
into it. The owner can read / dismiss / act via the same endpoint.

## Endpoint

`https://flashflowai.com/api/mc/operator-feed`

## Auth

- **Service (Bolt, scripts):** send `MISSION_CONTROL_TOKEN` as one of:
  - `Authorization: Bearer <token>`
  - `x-mc-token: <token>`
  - `x-service-token: <token>`
- **Owner (browser):** normal owner session cookie.

## POST — push an item onto the plate

```json
{
  "kind": "email | calendar | approval | flag | fyi",
  "urgency": "low | normal | high | urgent",
  "title": "1-200 chars, required",
  "one_line": "short preview (≤ 400 chars)",
  "action_url": "https://... (optional)",
  "action_label": "Reply | Open | Review | …",
  "lane": "FlashFlow | MMM | Zebby's World | Personal | …",
  "source_agent": "bolt | calendar-watcher | …",
  "expires_at": "ISO timestamp — auto-hides after this",
  "metadata": { "any": "extra context" }
}
```

Response: `{ "ok": true, "id": "<uuid>" }`

### Quick examples

Email that needs a reply:

```json
{
  "kind": "email",
  "urgency": "high",
  "title": "Shotstack support re: production credits",
  "one_line": "They asked for our account ID before they can top up.",
  "action_url": "https://mail.google.com/mail/u/0/#inbox/abc123",
  "action_label": "Reply",
  "lane": "FlashFlow",
  "source_agent": "bolt"
}
```

Calendar heads-up:

```json
{
  "kind": "calendar",
  "urgency": "normal",
  "title": "Investor call — 2:30pm today",
  "one_line": "15 min. They want Q1 numbers.",
  "expires_at": "2026-04-15T20:00:00Z",
  "source_agent": "calendar-watcher"
}
```

Approval gate (Bolt wants a green light):

```json
{
  "kind": "approval",
  "urgency": "high",
  "title": "Spend $120 on Late.dev annual plan?",
  "one_line": "Saves $40/mo vs monthly. Auto-renews Apr 2027.",
  "action_url": "https://flashflowai.com/admin/command-center/approvals/42",
  "action_label": "Approve",
  "lane": "OpenClaw",
  "source_agent": "bolt"
}
```

## GET — list active items (owner only)

Returns items that are not dismissed, not acted, and not expired,
ordered urgency → recency. Used by the Glance dashboard directly.

## PATCH — mark an item

```json
{ "id": "<uuid>", "action": "acted" }   // ✓ done
{ "id": "<uuid>", "action": "dismiss" } // ✕ hide
```

## Design rules

1. **Every item should cost < 30 seconds of operator time.** If it takes
   longer, link out to the thing that does the work.
2. **Use urgency honestly.** `urgent` should page the owner; `normal`
   is for the evening review.
3. **Set `expires_at` for anything time-boxed** (meetings, deadlines).
   The plate auto-clears so it doesn't become a graveyard.
4. **Prefer `fyi` over silence** when Bolt takes an autonomous action
   the owner should know about but doesn't need to approve.
