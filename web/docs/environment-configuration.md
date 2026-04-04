# Environment Configuration

## Quick Start

```bash
cp .env.example .env.local
# Fill in at minimum the REQUIRED_AT_BOOT vars
```

## Classification

| Classification | Meaning | Count |
|---------------|---------|-------|
| `REQUIRED_AT_BOOT` | App cannot function without these | 7 |
| `FEATURE_REQUIRED` | Needed when a specific integration is used | ~60 |
| `OPTIONAL` | Enhances functionality, not critical | ~20 |

## Required at Boot (Must Set)

| Variable | System | Description |
|----------|--------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Anonymous key (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Service role key (bypasses RLS) |
| `NEXT_PUBLIC_APP_URL` | App | Public-facing app URL |
| `ANTHROPIC_API_KEY` | AI | Claude API key (powers all AI features) |
| `ADMIN_USERS` | Auth | Comma-separated admin email allowlist |
| `CRON_SECRET` | Cron | Bearer token for Vercel cron authentication |

## Integration Systems

Each system has a set of env vars. If any `FEATURE_REQUIRED` var is missing, that integration reports as "not configured" rather than crashing.

### Core AI
| Variable | Required | Notes |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | Boot | Powers script generation, scoring, analysis |
| `OPENAI_API_KEY` | Feature | Whisper transcription, embeddings |
| `ELEVENLABS_API_KEY` | Feature | Text-to-speech for avatar videos |
| `REPLICATE_API_TOKEN` | Feature | AI image generation (b-roll) |

### Stripe Billing
| Variable | Required | Notes |
|----------|----------|-------|
| `STRIPE_SECRET_KEY` | Feature | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Feature | Webhook signature validation |
| `STRIPE_PRICE_CREATOR_LITE` | Feature | Price ID for Creator Lite plan |
| `STRIPE_PRICE_CREATOR_PRO` | Feature | Price ID for Creator Pro plan |
| `STRIPE_PRICE_BUSINESS` | Feature | Price ID for Business plan |

### TikTok (Login Kit)
| Variable | Required | Notes |
|----------|----------|-------|
| `TIKTOK_CLIENT_KEY` | Feature | OAuth app client key |
| `TIKTOK_CLIENT_SECRET` | Feature | OAuth app client secret |
| `TIKTOK_REDIRECT_URI` | Feature | OAuth redirect URI |

### TikTok Content Posting
| Variable | Required | Notes |
|----------|----------|-------|
| `TIKTOK_CONTENT_APP_KEY` | Feature | Content Posting app key |
| `TIKTOK_CONTENT_APP_SECRET` | Feature | Content Posting app secret |

### TikTok Shop
| Variable | Required | Notes |
|----------|----------|-------|
| `TIKTOK_SHOP_APP_KEY` | Feature | Shop app key |
| `TIKTOK_SHOP_APP_SECRET` | Feature | Shop app secret |

### Google Drive Intake
| Variable | Required | Notes |
|----------|----------|-------|
| `GOOGLE_DRIVE_CLIENT_ID` | Feature | OAuth client ID |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Feature | OAuth client secret |
| `GOOGLE_DRIVE_REDIRECT_URI` | Feature | OAuth redirect URI |
| `DRIVE_TOKEN_ENCRYPTION_KEY` | Feature | AES key for token encryption at rest |

### HeyGen
| Variable | Required | Notes |
|----------|----------|-------|
| `HEYGEN_API_KEY` | Feature | API key for avatar video generation |

### Shotstack
| Variable | Required | Notes |
|----------|----------|-------|
| `SHOTSTACK_PRODUCTION_KEY` | Feature | Production API key for video rendering |

### OpenClaw
| Variable | Required | Notes |
|----------|----------|-------|
| `OPENCLAW_API_URL` | Feature | API base URL |
| `OPENCLAW_API_KEY` | Feature | API key for TikTok data |

### Telegram
| Variable | Required | Notes |
|----------|----------|-------|
| `TELEGRAM_BOT_TOKEN` | Feature | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Feature | Chat ID for notifications |

### Email
| Variable | Required | Notes |
|----------|----------|-------|
| `RESEND_API_KEY` | Feature | Resend for transactional email |
| `SENDGRID_API_KEY` | Feature | SendGrid (legacy email) |

## Feature Degradation

When env vars for a feature are missing, FlashFlow degrades gracefully:

| Feature | Behavior when missing |
|---------|----------------------|
| Telegram | Logs skip message, no notification sent |
| Email (Resend/SendGrid) | Returns `{ success: false, error: 'RESEND_API_KEY not configured' }` |
| Slack | Returns `{ status: 'skipped_no_config' }` |
| OpenClaw | Returns `{ ok: false, error: 'OPENCLAW_API_URL not configured' }` |
| HeyGen | Feature entry point returns error message |
| TikTok Research | Callers fall back to count-only mode |
| Stripe | Billing features disabled, free tier only |

## Security Rules

1. **`NEXT_PUBLIC_*` variables** are exposed to the browser. Only use for non-secret values (URLs, feature flags).
2. **All API keys and secrets** must NOT have the `NEXT_PUBLIC_` prefix.
3. **Server-only secrets** are only accessible in API routes, server components, and middleware.
4. The `lib/env-validation.ts` registry marks each var as `secret: true` or `clientSafe: true`.

## Diagnostics

**Admin page:** `/admin/settings/diagnostics` — shows all env vars, integration status, database health.

**API endpoint:** `GET /api/diagnostics` (admin-only) — returns full diagnostic report.

**Health check:** `GET /api/health` — returns boot env status summary.

**Programmatic check:**
```typescript
import { checkFeatureConfig, requireFeature } from '@/lib/env-validation';
import { getSystemConfigStatus } from '@/lib/config-status';

// Check if a specific integration is ready
const heygen = requireFeature('HeyGen');
if (!heygen.configured) {
  return { error: heygen.message };
  // → "HeyGen integration disabled: HEYGEN_API_KEY missing"
}

// Get full system status
const status = getSystemConfigStatus();
console.log(`${status.summary.configured}/${status.summary.total} integrations configured`);
```

## Validation

Boot validation runs at startup and logs warnings for missing required vars:

```
[env] MISSING REQUIRED: CRON_SECRET — Bearer token for Vercel cron job authentication
[env] 1 required env var(s) missing. Some features may fail.
```

To validate manually:
```typescript
import { validateBootEnvVars } from '@/lib/env-validation';
const { ok, missing } = validateBootEnvVars();
```
