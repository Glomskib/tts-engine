# Stub Registry

Tracked stub endpoints and functions that return placeholder responses.
All stubs use `lib/stubs.ts` → `stubResponse()` for a consistent shape.

## Active Stubs

| Feature | Location | Type | Notes |
|---------|----------|------|-------|
| AI Draft Reply | `app/api/support/draft-reply/route.ts` | API Route | Returns stub JSON. UI shows "Soon" badge. Will use Claude to draft replies from thread context + FAQs. |
| AI B-roll Generator | `lib/marketplace/broll-providers.ts` → `generateAiBroll()` | Function | Returns `null`. Awaiting Runway / Veo API integration. `AI_BROLL_AVAILABLE = false` flag. |
| Stock B-roll Fetcher | `lib/marketplace/broll-providers.ts` → `fetchStockBroll()` | Function | Returns `null`. Awaiting Pexels / Storyblocks integration. `STOCK_BROLL_AVAILABLE = false` flag. |

## Stub Response Shape

```ts
import { stubResponse } from "@/lib/stubs";

// API routes return:
NextResponse.json(stubResponse({
  feature: "Feature Name",
  reason: "Why it's stubbed",
  nextSteps: "What will change when implemented",
  eta: "Q3 2026",  // optional
}));

// Response body:
{
  ok: true,
  stub: true,          // ← client checks this flag
  feature: "...",
  reason: "...",
  nextSteps: "..." | null,
  eta: "..." | null,
}
```

## Client-Side Detection

```ts
import { isStubResponse } from "@/lib/stubs";

const json = await res.json();
if (isStubResponse(json)) {
  showToast("Coming soon");
  return;
}
```

## Removing a Stub

1. Implement the real logic in the route/function.
2. Remove the `stubResponse()` call (or `return null`).
3. Flip the availability flag (e.g. `AI_BROLL_AVAILABLE = true`).
4. Remove the "Soon" badge from the UI.
5. Delete the row from this table.
