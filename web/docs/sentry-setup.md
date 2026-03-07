# Sentry Error Monitoring

## Overview

Sentry captures server-side and client-side errors with rich context:
user ID, workspace ID, content item ID, feature area, and route name.

All Sentry calls are no-ops when `SENTRY_DSN` is unset — safe to run locally without it.

## Environment Variables

| Variable | Required | Where | Purpose |
|---|---|---|---|
| `SENTRY_DSN` | Yes | Server | Server-side error capture |
| `NEXT_PUBLIC_SENTRY_DSN` | Yes | Client | Client-side error capture (same DSN is fine) |
| `SENTRY_ENVIRONMENT` | No | Server | `production`, `staging`, `development` |
| `SENTRY_AUTH_TOKEN` | No | Build | Source map upload (Vercel build only) |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | No | Client | Client environment label |

## Enabling Locally

1. Create a Sentry project at https://sentry.io (Next.js type)
2. Copy the DSN from Settings > Client Keys
3. Add to `web/.env.local`:
   ```
   SENTRY_DSN=https://your-key@o0.ingest.sentry.io/your-project-id
   NEXT_PUBLIC_SENTRY_DSN=https://your-key@o0.ingest.sentry.io/your-project-id
   SENTRY_ENVIRONMENT=development
   ```
4. Restart the dev server — errors will appear in your Sentry dashboard

## Enabling in Production (Vercel)

1. Add `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` to Vercel Environment Variables
2. Optionally add `SENTRY_AUTH_TOKEN` for source map uploads
3. Set `SENTRY_ENVIRONMENT=production`
4. Deploy — no code changes needed

## Architecture

```
sentry.client.config.ts    — Browser-side init (NEXT_PUBLIC_SENTRY_DSN)
sentry.server.config.ts    — Node.js server init (SENTRY_DSN)
sentry.edge.config.ts      — Edge runtime init (SENTRY_DSN)
instrumentation.ts         — Next.js hook that loads server/edge configs
next.config.ts             — withSentryConfig wrapper
lib/errorTracking.ts       — captureRouteError(), reportError(), etc.
lib/errors/withErrorCapture.ts  — Route handler wrapper
lib/errors/sentry-resolvers.ts  — User/workspace/content-item ID resolvers
```

## What Gets Tagged

Every error captured through `withErrorCapture` or `captureRouteError` includes:

| Sentry Tag | Source |
|---|---|
| `route` | Route path (e.g. `/api/content-items/[id]/render`) |
| `feature` | Feature area (e.g. `editing-engine`, `content-items`) |
| `user_id` | Authenticated user ID |
| `workspace_id` | Workspace/tenant ID |
| `content_item_id` | Content item ID (from route params) |

## Verifying

1. **Local**: Trigger an error (e.g. render with invalid plan) and check the Sentry dashboard
2. **Production**: Check Sentry > Issues for events tagged `feature:editing-engine`
3. **Search**: Filter by `content_item_id:xxx` or `workspace_id:xxx` in Sentry
