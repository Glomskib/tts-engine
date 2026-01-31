# Deployment Guide

This guide covers deploying the FlashFlow AI web application to Vercel with Supabase.

## Vercel Deployment

### Project Configuration

1. **Import Project**: In Vercel dashboard, import from GitHub repository
2. **Root Directory**: Set to `web` (not the repository root)
3. **Framework Preset**: Next.js (auto-detected)
4. **Build Command**: `npm run build` (default)
5. **Output Directory**: `.next` (default)

### Required Environment Variables

Add these environment variables in Vercel project settings:

#### Core Supabase (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJhbGciOiJI...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) | `eyJhbGciOiJI...` |

#### User Authorization (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `ADMIN_USERS` | Comma-separated admin email addresses | `admin@example.com,ops@example.com` |
| `UPLOADER_USERS` | Comma-separated uploader email addresses | `uploader1@example.com` |

#### Application URL (Required for emails/invites)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Public URL of the deployed app | `https://your-app.vercel.app` |

#### AI Generation (Optional)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude-based generation |
| `OPENAI_API_KEY` | OpenAI API key for GPT-based generation |

#### Email Notifications (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `EMAIL_ENABLED` | Enable email sending | `false` |
| `SENDGRID_API_KEY` | SendGrid API key | - |
| `EMAIL_FROM` | Sender email address | `no-reply@tts-engine.local` |
| `OPS_EMAIL_TO` | Ops notification recipient | - |
| `DEFAULT_ADMIN_EMAIL` | Fallback admin email | - |

#### Slack Notifications (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `SLACK_ENABLED` | Enable Slack notifications | `false` |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL | - |

#### Feature Flags (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_UI_ENABLED` | Enable admin UI in production | `false` |
| `SUBSCRIPTION_GATING_ENABLED` | Enable subscription checks | `false` |
| `PRO_USER_IDS` | Comma-separated pro user IDs | - |

#### Default Assignees (Optional)

| Variable | Description |
|----------|-------------|
| `DEFAULT_RECORDER_USER_ID` | Default user ID for recorder assignments |
| `DEFAULT_EDITOR_USER_ID` | Default user ID for editor assignments |
| `DEFAULT_UPLOADER_USER_ID` | Default user ID for uploader assignments |

### Environment Variable Validation

The app validates required environment variables at startup:
- Missing `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` throws a clear error
- Missing `NEXT_PUBLIC_SUPABASE_ANON_KEY` causes client-side auth to fail with a visible error
- The `/api/health` endpoint reports env var status for debugging

## Supabase Configuration

### Authentication Settings

In Supabase Dashboard > Authentication > URL Configuration:

1. **Site URL**: Set to your production URL
   ```
   https://your-app.vercel.app
   ```

2. **Redirect URLs**: Add all valid redirect URLs (one per line):
   ```
   https://your-app.vercel.app/**
   https://your-app.vercel.app/login
   https://your-app.vercel.app/admin/pipeline
   ```

   For preview deployments, add:
   ```
   https://*.vercel.app/**
   ```

### Email Templates (Optional)

Customize email templates in Supabase Dashboard > Authentication > Email Templates:
- Confirm signup
- Reset password
- Magic link
- Invite user

Update the `{{ .SiteURL }}` references if using custom domain.

## Database Migrations

### Prerequisites

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

### Link Project

Link your local project to the remote Supabase project:

```bash
cd web
supabase link --project-ref YOUR_PROJECT_REF
```

Find your project ref in Supabase Dashboard > Project Settings > General.

### Push Migrations

Apply all migrations to production:

```bash
supabase db push
```

To see migration status:

```bash
supabase db status
```

To reset and reapply all migrations (WARNING: destroys data):

```bash
supabase db reset
```

### Migration Files

Migrations are located in `web/supabase/migrations/`. They are applied in order by filename prefix (001, 002, etc.).

## Post-Deployment Verification

### 1. Health Check

```bash
curl https://your-app.vercel.app/api/health
```

Expected response:
```json
{
  "status": "ok",
  "env": {
    "hasSupabaseUrl": true,
    "hasAnonKey": true,
    "hasServiceKey": true
  }
}
```

### 2. Auth Flow Test

1. Navigate to `/login`
2. Create a test account or sign in
3. Verify redirect to appropriate page based on role
4. Verify session persists across page refreshes

### 3. Admin Access Test

1. Add your email to `ADMIN_USERS` env var
2. Sign in at `/login`
3. Verify redirect to `/admin/pipeline`
4. Verify admin routes are accessible

### 4. Schema Compatibility Check

```bash
curl https://your-app.vercel.app/api/health/schema
```

This checks that all required database tables and columns exist.

## Troubleshooting

### "Missing Supabase configuration" Error

- Verify all `NEXT_PUBLIC_*` env vars are set in Vercel
- Redeploy after adding env vars (Next.js requires rebuild for env changes)

### Auth Redirects Not Working

- Verify Site URL in Supabase matches your deployment URL exactly
- Check Redirect URLs include your domain with wildcard: `https://your-domain.com/**`
- Ensure cookies are not blocked (check for SameSite issues)

### "CORS" Errors

- Verify `NEXT_PUBLIC_SUPABASE_URL` matches the Supabase project URL exactly
- Check Supabase Dashboard > API > API Settings for allowed origins

### Database Connection Errors

- Verify `SUPABASE_SERVICE_ROLE_KEY` is the service role key (not anon key)
- Check Supabase project is not paused (free tier pauses after inactivity)
- Run migrations if tables are missing

### Preview Deployments

For Vercel preview deployments:
1. Add `https://*.vercel.app/**` to Supabase Redirect URLs
2. Consider using Vercel environment variable scoping (Production vs Preview)
