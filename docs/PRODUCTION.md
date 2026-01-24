# Production Deployment Guide

This document describes how to deploy the TTS Engine web application to staging and production environments.

## Environment Variable Checklist

### Required (must be set for the app to function)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://abc123.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) key | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) | `eyJhbGciOi...` |

### Optional (enhance functionality)

| Variable | Description | When Required |
|----------|-------------|---------------|
| `SENDGRID_API_KEY` | SendGrid API key for email notifications | If EMAIL_ENABLED=true |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL | If SLACK_ENABLED=true |
| `OPS_EMAIL_TO` | Email address for ops alerts | For admin email notifications |
| `DEFAULT_ADMIN_EMAIL` | Default admin email for bootstrapping | For initial setup |
| `DEFAULT_RECORDER_USER_ID` | UUID for default recorder auto-assignment | For auto-handoff |
| `DEFAULT_EDITOR_USER_ID` | UUID for default editor auto-assignment | For auto-handoff |
| `DEFAULT_UPLOADER_USER_ID` | UUID for default uploader auto-assignment | For auto-handoff |

### Runtime-Configurable Settings

These settings can be changed at runtime via the Admin Settings page (`/admin/settings`) without redeploying:

- `SUBSCRIPTION_GATING_ENABLED` - Enable/disable Pro subscription requirement
- `EMAIL_ENABLED` - Enable/disable email notifications
- `SLACK_ENABLED` - Enable/disable Slack notifications
- `ASSIGNMENT_TTL_MINUTES` - Default assignment duration (1-10080)
- `ANALYTICS_DEFAULT_WINDOW_DAYS` - Default analytics window (7, 14, or 30)
- `INCIDENT_MODE_ENABLED` - Show maintenance banner
- `INCIDENT_MODE_MESSAGE` - Maintenance banner message
- `INCIDENT_MODE_READ_ONLY` - Block write operations (except admins)
- `INCIDENT_MODE_ALLOWLIST_USER_IDS` - UUIDs that bypass read-only mode

## Staging vs Production Supabase Projects

We recommend using **separate Supabase projects** for staging and production:

1. **Staging Project**: Used for testing new features and migrations
   - Apply migrations here first
   - Use test data that can be reset
   - Point staging deployment to this project

2. **Production Project**: Used for live data
   - Only apply verified migrations
   - Contains real user data
   - Point production deployment to this project

### Setting Up a New Environment

1. Create a new Supabase project at https://supabase.com/dashboard
2. Go to Project Settings > API
3. Copy the Project URL → `NEXT_PUBLIC_SUPABASE_URL`
4. Copy the anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Copy the service_role key → `SUPABASE_SERVICE_ROLE_KEY`
6. Apply migrations from `web/supabase/migrations/` in order

## First Admin Bootstrap

After initial deployment, follow these steps to set up the first admin:

### 1. Create Admin User in Supabase

1. Go to Supabase Dashboard > Authentication > Users
2. Click "Add user" or have the user sign up
3. Note the user's UUID

### 2. Set Admin Role

In Supabase SQL Editor, run:

```sql
INSERT INTO user_roles (user_id, role)
VALUES ('USER_UUID_HERE', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
```

### 3. Configure Initial Settings

As the admin user, visit `/admin/settings` and configure:

1. **Subscription Gating**: Set to `false` initially to allow all users
2. **Email/Slack**: Configure notification channels if API keys are set
3. **Assignment TTL**: Set default assignment duration (240 minutes recommended)
4. **Incident Mode**: Keep disabled unless maintenance is needed

### 4. Set Up Team Member Plans

If subscription gating is enabled later:

1. Visit `/admin/users`
2. Set each team member to "pro" plan
3. Users can self-request upgrades via `/upgrade`

## Release Checklist

Before deploying a new release:

### Pre-Deploy Verification

```powershell
# 1. Run full verification suite
cd C:\path\to\tts-engine
powershell -ExecutionPolicy Bypass -File scripts\verify_all.ps1

# 2. Run production smoke test
powershell -ExecutionPolicy Bypass -File scripts\smoke_prod.ps1
```

All tests must pass before deploying.

### Deployment Steps

1. **Pull latest code**
   ```bash
   git pull origin master
   ```

2. **Install dependencies** (if package.json changed)
   ```bash
   cd web
   npm install
   ```

3. **Build the application**
   ```bash
   npm run build
   ```

4. **Deploy** (platform-specific)
   - Vercel: Push to main branch or `vercel --prod`
   - Other: Follow platform's deployment guide

### Post-Deploy Verification

1. **Health Check**: Visit `/api/health`
   - Verify `ok: true`
   - Check `env_report.env_ok: true`
   - Confirm `required_present` equals `required_total`

2. **Smoke Test Against Production**
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\smoke_prod.ps1 -BaseUrl "https://your-domain.com"
   ```

3. **Manual Smoke Workflow**

   Perform a complete video lifecycle test:

   a. **Recorder Flow**
      - Log in as recorder role
      - Click "Get Next Task" on recorder dashboard
      - Open assigned video
      - Mark as "Recorded"

   b. **Editor Flow**
      - Log in as editor role
      - Verify video appeared in editor queue
      - Mark as "Edited", then "Ready to Post"

   c. **Uploader Flow**
      - Log in as uploader role
      - Verify video appeared in uploader queue
      - Enter posted URL and platform
      - Mark as "Posted"

   d. **Verify Completion**
      - Check video status is "POSTED" in pipeline
      - Verify video_events audit trail

4. **Admin Status Check**
   - Visit `/admin/status` as admin
   - Verify health check shows green
   - Confirm notification channels are correctly configured
   - Check incident mode is inactive (unless intentional)

## Incident Response

### Enabling Maintenance Mode

1. Go to `/admin/settings`
2. Set `INCIDENT_MODE_ENABLED` to `true`
3. Set `INCIDENT_MODE_MESSAGE` to describe the issue
4. If blocking writes: Set `INCIDENT_MODE_READ_ONLY` to `true`
5. Add any essential user UUIDs to `INCIDENT_MODE_ALLOWLIST_USER_IDS`

### Disabling Maintenance Mode

1. Go to `/admin/settings`
2. Set `INCIDENT_MODE_ENABLED` to `false`
3. (Optional) Clear `INCIDENT_MODE_READ_ONLY` and allowlist

## Monitoring

### Health Endpoints

- `/api/health` - Basic health check with env validation
- `/api/observability/queue-summary` - Queue status counts
- `/api/observability/claimed` - Currently claimed videos
- `/api/observability/recent-events` - Recent audit events

### Admin Dashboards

- `/admin/status` - System status overview
- `/admin/analytics` - SLA and throughput metrics
- `/admin/events` - Event explorer and audit trail
- `/admin/assignments` - Active assignment management

## Troubleshooting

### Common Issues

**Health check shows missing required env vars**
- Verify all required environment variables are set
- Check for typos in variable names
- Ensure service role key is the server-side secret, not anon key

**Admin pages redirect to login**
- Verify user exists in Supabase Auth
- Check user_roles table has admin role for user

**Notifications not sending**
- Check `EMAIL_ENABLED` / `SLACK_ENABLED` in settings
- Verify API keys are set in environment
- Check email-notifications.ts for cooldown (5 min default)

**Assignment dispatch returns "no work available"**
- Check videos exist in correct recording_status
- Verify videos have script_locked_text (required for recording)
- Check for expired assignments that need reclaiming

## Support

For issues, open a ticket at: https://github.com/your-org/tts-engine/issues
