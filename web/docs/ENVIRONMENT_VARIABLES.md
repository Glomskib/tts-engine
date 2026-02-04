# Environment Variables

Complete reference for all environment variables used in the FlashFlow AI application. Copy `.env.example` to `.env.local` and configure the values for your environment.

> **Never commit `.env.local` to version control.** It is already included in `.gitignore`.

---

## Required for Production

### Supabase

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client (public) | **Yes** | Supabase project URL. Found in your Supabase project settings under API. Used by both client-side and server-side Supabase clients. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client (public) | **Yes** | Supabase anonymous/public API key. Found in your Supabase project settings under API. Used to initialize the Supabase client for unauthenticated and row-level-security-gated requests. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | **Yes** | Supabase service role key. Bypasses Row Level Security -- treat as a secret. Used by `supabaseAdmin` for server-side operations that need elevated privileges (schema checks, admin queries, etc.). |

### AI Services

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Server-only | **Yes** | Anthropic API key for Claude models. Used for skit generation, skit scoring, skit refinement, winner analysis, script generation/rewriting, audience analysis, video brief drafting, AI chat, variant scaling, content generation, and hook generation. Obtain from [console.anthropic.com](https://console.anthropic.com). |
| `OPENAI_API_KEY` | Server-only | No (fallback) | OpenAI API key for GPT models. Serves as an optional fallback when Anthropic is unavailable for script generation, hook generation, winner extraction, video brief drafting, AI chat, and variant scaling. Also checked by the admin health endpoint. Obtain from [platform.openai.com](https://platform.openai.com). |
| `REPLICATE_API_TOKEN` | Server-only | **Yes** | Replicate API token for AI image generation (B-Roll Generator). Powers the Flux and SDXL image models. Obtain from [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens). |
| `ELEVENLABS_API_KEY` | Server-only | No | ElevenLabs API key for text-to-speech. Checked by the admin health endpoint. Obtain from [elevenlabs.io](https://elevenlabs.io). |

### Application

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Client (public) | **Yes** | The application's canonical public URL (e.g., `https://app.flashflow.ai`). Used for email links, Stripe callback URLs, client portal URLs, pipeline notification links, subscription portal return URLs, weekly digest links, and invite URLs. |

---

## Stripe (Payments & Subscriptions)

Required if you want subscription billing and credit purchases.

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Server-only | Conditional | Stripe secret API key. Required for checkout sessions, subscription management, credit purchases, and webhook verification. Obtain from the Stripe dashboard. |
| `STRIPE_WEBHOOK_SECRET` | Server-only | Conditional | Stripe webhook signing secret (`whsec_...`). Required to verify incoming Stripe webhook events. Set up via Stripe dashboard > Webhooks. |
| `STRIPE_PRICE_STARTER_MONTHLY` | Server-only | Conditional | Stripe Price ID for the Starter plan (monthly billing). |
| `STRIPE_PRICE_STARTER_YEARLY` | Server-only | Conditional | Stripe Price ID for the Starter plan (yearly billing). |
| `STRIPE_PRICE_PRO_MONTHLY` | Server-only | Conditional | Stripe Price ID for the Pro plan (monthly billing). |
| `STRIPE_PRICE_PRO_YEARLY` | Server-only | Conditional | Stripe Price ID for the Pro plan (yearly billing). |
| `STRIPE_PRICE_TEAM_MONTHLY` | Server-only | Conditional | Stripe Price ID for the Team plan (monthly billing). |
| `STRIPE_PRICE_TEAM_YEARLY` | Server-only | Conditional | Stripe Price ID for the Team plan (yearly billing). |

> **Conditional**: Required only if Stripe payments are enabled. The app runs without Stripe but billing features will be unavailable.

---

## Email (SendGrid)

Required if you want email notifications (status updates, client portal notifications, weekly digests).

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `SENDGRID_API_KEY` | Server-only | Conditional | SendGrid API key for transactional email. If set and `EMAIL_ENABLED` is not explicitly `false`, email sending is automatically enabled. |
| `EMAIL_ENABLED` | Server-only | No | Explicit toggle for email sending. Accepts `true` or `1` to enable, `false` or `0` to disable. Defaults to `true` if `SENDGRID_API_KEY` is present, `false` otherwise. Can also be overridden via the system settings table. |
| `EMAIL_FROM` | Server-only | No | Sender email address for outgoing emails. Defaults to `no-reply@tts-engine.local`. |
| `OPS_EMAIL_TO` | Server-only | No | Operations team email address. Used as the primary recipient for admin/ops notifications and audit alerts. Takes priority over `DEFAULT_ADMIN_EMAIL`. |
| `DEFAULT_ADMIN_EMAIL` | Server-only | No | Fallback admin email address. Used when `OPS_EMAIL_TO` is not set. |

---

## Slack Notifications

Required if you want Slack notifications for pipeline events and system alerts.

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `SLACK_WEBHOOK_URL` | Server-only | Conditional | Slack incoming webhook URL (`https://hooks.slack.com/services/...`). If set and `SLACK_ENABLED` is not explicitly `false`, Slack notifications are automatically enabled. |
| `SLACK_ENABLED` | Server-only | No | Explicit toggle for Slack notifications. Accepts `true` or `1` to enable, `false` or `0` to disable. Defaults to `true` if `SLACK_WEBHOOK_URL` is present, `false` otherwise. Can also be overridden via the system settings table. |

---

## Admin & User Configuration

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `ADMIN_USERS` | Server-only | No | Comma-separated list of admin user emails or UUIDs. Users in this list receive elevated admin privileges throughout the application (API auth, admin panel access, bypass subscription gating). Example: `admin@example.com,550e8400-e29b-41d4-a716-446655440000`. |
| `UPLOADER_USERS` | Server-only | No | Comma-separated list of user UUIDs who have the uploader role. Grants video upload permissions via the API auth layer. |
| `DEFAULT_RECORDER_USER_ID` | Server-only | No | UUID of the default user to auto-assign when a video enters the recording stage. Used by the pipeline execution/handoff system. |
| `DEFAULT_EDITOR_USER_ID` | Server-only | No | UUID of the default user to auto-assign when a video enters the editing stage. Used by the pipeline execution/handoff system. |
| `DEFAULT_UPLOADER_USER_ID` | Server-only | No | UUID of the default user to auto-assign when a video enters the upload stage. Used by the pipeline execution/handoff system. |

---

## Feature Flags

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `ADMIN_UI_ENABLED` | Server-only | No | Set to `true` to enable the admin UI in production. In development mode the admin UI is always accessible. Checked by `/api/admin/enabled` and `/api/videos/release-stale`. |
| `SUBSCRIPTION_GATING_ENABLED` | Server-only | No | Set to `true` or `1` to enable subscription/plan gating for premium features. Defaults to enabled if `PRO_USER_IDS` is configured, otherwise disabled (fail-safe: all users allowed). Can also be overridden via the system settings table. |
| `PRO_USER_IDS` | Server-only | No | Comma-separated list of user UUIDs that should be treated as Pro plan subscribers. Bypasses subscription checks. Also implicitly enables subscription gating if `SUBSCRIPTION_GATING_ENABLED` is not explicitly set. |
| `ENABLE_TEST_IDS` | Server-only | No | Set to any truthy value to enable test data-testid attributes in production builds. By default, test IDs are stripped in production for cleaner DOM output. |

---

## Winner/Performance Thresholds

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `WINNER_MIN_VIEWS` | Server-only | No | Minimum view count for a video to qualify in the winner quality check. Parsed as an integer. Defaults to `100`. |
| `WINNER_MIN_ORDERS` | Server-only | No | Minimum order count for a video to qualify in the winner quality check. Parsed as an integer. Defaults to `1`. |

---

## Debug Settings

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `DEBUG_AI` | Server-only | No | Enable verbose AI debug logging. Set to `true` or `1` to log full prompts, responses, and budget calculations for AI routes (skit budget, winner analysis, video brief drafting, image generation). |

---

## Application Metadata

| Variable | Exposure | Required | Description |
|---|---|---|---|
| `NEXT_PUBLIC_APP_VERSION` | Client (public) | No | Application version string displayed on the admin health page. Defaults to `1.0.0` if not set. |
| `NEXT_PUBLIC_BASE_URL` | Client (public) | No | Alternative base URL used as a fallback in checkout and subscription routes when `NEXT_PUBLIC_APP_URL` is not available. Typically not needed if `NEXT_PUBLIC_APP_URL` is set. |

---

## Automatic (Set by Platform)

These variables are set automatically by the hosting platform or Node.js runtime. **Do not set them manually.**

| Variable | Exposure | Description |
|---|---|---|
| `NODE_ENV` | Server-only | Set automatically to `development` or `production` by Next.js. Controls debug output, dev tool visibility, service worker registration, error detail exposure, and admin UI defaults. |
| `VERCEL_URL` | Server-only | Set automatically by Vercel during deployment. Contains the deployment URL (without protocol). Used as a fallback for constructing absolute URLs when `NEXT_PUBLIC_APP_URL` is not available. |

---

## Quick Reference: Client vs. Server Variables

Next.js exposes variables prefixed with `NEXT_PUBLIC_` to the browser bundle. All other variables are server-only and never sent to the client.

| Prefix | Accessible From | Security |
|---|---|---|
| `NEXT_PUBLIC_*` | Client + Server | Safe for public exposure. Do not store secrets here. |
| No prefix | Server only | Never reaches the browser. Use for API keys and secrets. |

**Client-exposed variables in this project:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_VERSION`
- `NEXT_PUBLIC_BASE_URL`

---

## Files Reference

- **`.env.example`** -- Template with all variables and comments. Copy to `.env.local` to get started.
- **`.env.local`** -- Your local configuration (git-ignored). This is what Next.js reads at runtime.
- **`lib/supabaseClient.ts`** -- Client-side Supabase initialization.
- **`lib/supabaseAdmin.ts`** -- Server-side Supabase admin client (uses service role key).
- **`lib/email.ts`** -- SendGrid email configuration and sending.
- **`lib/slack.ts`** -- Slack webhook configuration and sending.
- **`lib/subscription.ts`** -- Subscription gating and pro user checks.
- **`lib/replicate.ts`** -- Replicate AI image generation client.
- **`app/api/checkout/route.ts`** -- Stripe checkout with price ID mapping.
- **`app/api/webhooks/stripe/route.ts`** -- Stripe webhook handler.
- **`app/api/admin/health/route.ts`** -- Health checks for all external services.
