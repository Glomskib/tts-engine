# FlashFlow AI — Launch Checklist

## Pre-Launch (Do These First)

### Stripe Production Setup
- [ ] Switch to Stripe live keys in Vercel environment variables:
  - `STRIPE_SECRET_KEY` → live key (`sk_live_...`)
  - `STRIPE_WEBHOOK_SECRET` → create new webhook for production URL
- [ ] Set all 6 Stripe price IDs for production:
  - `STRIPE_PRICE_STARTER_MONTHLY`
  - `STRIPE_PRICE_STARTER_YEARLY`
  - `STRIPE_PRICE_PRO_MONTHLY`
  - `STRIPE_PRICE_PRO_YEARLY`
  - `STRIPE_PRICE_TEAM_MONTHLY`
  - `STRIPE_PRICE_TEAM_YEARLY`
- [ ] Configure Stripe webhook endpoint: `https://your-domain.com/api/webhooks/stripe`
- [ ] Set webhook events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- [ ] Test with a real $1 payment (refund after)

### Vercel Production Settings
- [ ] Set all environment variables in Vercel dashboard (see full list below)
- [ ] Set `NEXT_PUBLIC_APP_URL` to production domain (removes localhost fallback)
- [ ] Configure custom domain
- [ ] Enable Vercel Analytics (optional)

### Supabase Production Settings
- [ ] Verify RLS policies are enabled on all tables:
  ```sql
  SELECT schemaname, tablename, policyname
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
  ```
- [ ] Check database connection pooling settings
- [ ] Set up database backups (Supabase dashboard > Database > Backups)
- [ ] Verify service role key is never exposed client-side

### Domain Consistency
- [ ] Resolve domain references — codebase has both `app.flashflow.ai` and `app.tts-engine.com`
  - `web/app/layout.tsx` — metadata URL
  - `web/lib/pipeline-notifications.ts` — fallback link
  - `web/lib/weekly-digest-template.ts` — 4 fallback references

### Final Verification
- [ ] Test user signup flow (email + magic link)
- [ ] Test script generation (uses credits)
- [ ] Test subscription upgrade flow (checkout → webhook → credits granted)
- [ ] Test full workflow: Generate → Approve → Pipeline → Schedule → Calendar
- [ ] Test password reset flow
- [ ] Verify onboarding modal shows for new users

---

## Post-Launch Monitoring (First 24-48 Hours)

### Monitor
- [ ] Vercel deployment logs for errors
- [ ] Supabase logs for failed queries
- [ ] Stripe dashboard for payment issues
- [ ] User feedback channels

### Quick Fixes Ready
- [ ] Know how to rollback Vercel deployment if needed
- [ ] Have Supabase SQL editor bookmarked for quick fixes
- [ ] Stripe dashboard open for payment issues

---

## Environment Variables Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe (USE LIVE KEYS FOR PRODUCTION)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER_MONTHLY=
STRIPE_PRICE_STARTER_YEARLY=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_YEARLY=
STRIPE_PRICE_TEAM_MONTHLY=
STRIPE_PRICE_TEAM_YEARLY=

# AI Services
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
REPLICATE_API_TOKEN=
ELEVENLABS_API_KEY=

# Email
SENDGRID_API_KEY=
EMAIL_FROM=
EMAIL_ENABLED=
OPS_EMAIL_TO=

# Slack Notifications
SLACK_WEBHOOK_URL=
SLACK_ENABLED=

# Application
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
NEXT_PUBLIC_BASE_URL=
NEXT_PUBLIC_APP_VERSION=

# Admin & Access Control
ADMIN_USERS=
UPLOADER_USERS=
ADMIN_UI_ENABLED=
DEFAULT_ADMIN_EMAIL=

# Role Defaults
DEFAULT_RECORDER_USER_ID=
DEFAULT_EDITOR_USER_ID=
DEFAULT_UPLOADER_USER_ID=

# Feature Flags
SUBSCRIPTION_GATING_ENABLED=
PRO_USER_IDS=
ENABLE_TEST_IDS=
DEBUG_AI=

# Business Logic
WINNER_MIN_VIEWS=
WINNER_MIN_ORDERS=
```

---

## Rollback Plan

| Scenario | Action |
|----------|--------|
| Critical deployment bug | Redeploy previous working commit from Vercel dashboard |
| Database data issues | Restore from Supabase backup |
| Payment issues | Pause payouts from Stripe dashboard |
| Auth broken | Check Supabase Auth settings, verify redirect URLs |
