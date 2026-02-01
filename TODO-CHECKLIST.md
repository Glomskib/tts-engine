# FlashFlow AI - Deployment & Setup Checklist

Generated: February 1, 2026 (Updated)

This checklist contains all manual tasks required to fully deploy and configure the application.

---

## PART 1: ENVIRONMENT VARIABLES (Vercel Dashboard)

### Required - Core Functionality

| Variable | Status | Description |
|----------|--------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | [ ] Set | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | [ ] Set | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | [ ] Set | Supabase service role key (secret) |

### Required - AI Services (need at least one)

| Variable | Status | Description |
|----------|--------|-------------|
| `ANTHROPIC_API_KEY` | [ ] Set | Claude AI for script generation (recommended) |
| `OPENAI_API_KEY` | [ ] Optional | GPT fallback/alternative |
| `REPLICATE_API_TOKEN` | [ ] Set | For B-Roll image generation (Flux/SDXL) |

### Required - Payments (Stripe)

| Variable | Status | Description |
|----------|--------|-------------|
| `STRIPE_SECRET_KEY` | [ ] Set | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | [ ] Set | Stripe webhook signing secret |
| `STRIPE_PRICE_STARTER_MONTHLY` | [ ] Set | Stripe Price ID for Starter monthly |
| `STRIPE_PRICE_STARTER_YEARLY` | [ ] Set | Stripe Price ID for Starter yearly |
| `STRIPE_PRICE_PRO_MONTHLY` | [ ] Set | Stripe Price ID for Pro monthly |
| `STRIPE_PRICE_PRO_YEARLY` | [ ] Set | Stripe Price ID for Pro yearly |
| `STRIPE_PRICE_TEAM_MONTHLY` | [ ] Set | Stripe Price ID for Team monthly |
| `STRIPE_PRICE_TEAM_YEARLY` | [ ] Set | Stripe Price ID for Team yearly |

### Optional - Notifications

| Variable | Status | Description |
|----------|--------|-------------|
| `SENDGRID_API_KEY` | [ ] Optional | Email notifications via SendGrid |
| `EMAIL_FROM` | [ ] Optional | From address (default: no-reply@tts-engine.local) |
| `OPS_EMAIL_TO` | [ ] Optional | Operations team alert email |
| `SLACK_WEBHOOK_URL` | [ ] Optional | Slack incoming webhook for alerts |

### Optional - Admin Configuration

| Variable | Status | Description |
|----------|--------|-------------|
| `ADMIN_USERS` | [ ] Set | Comma-separated admin email addresses |
| `ADMIN_UI_ENABLED` | [ ] Set to `true` | Enable admin dashboard in production |
| `PRO_USER_IDS` | [ ] Optional | Comma-separated user IDs for pro bypass |

---

## PART 2: SUPABASE SETUP

### Database Tables Required (50+ tables)

Run the migration scripts or verify these key tables exist:

**Core Tables:**
- [ ] `videos` - Main video storage
- [ ] `video_events` - Video lifecycle tracking
- [ ] `scripts` - Script content
- [ ] `products` - Product catalog
- [ ] `saved_skits` - Saved script variations
- [ ] `hooks` - Hook library

**User & Auth Tables:**
- [ ] `user_roles` - RBAC roles
- [ ] `user_profiles` - Extended profiles
- [ ] `user_credits` - Credit balance
- [ ] `user_subscriptions` - Subscription status
- [ ] `credit_transactions` - Credit audit log

**Audience Intelligence:**
- [ ] `audience_personas` - Target personas
- [ ] `pain_points` - Pain point library
- [ ] `language_patterns` - Language guidelines

**Admin/System:**
- [ ] `audit_log` - System audit log
- [ ] `notifications` - User notifications
- [ ] `subscription_plans` - Available plans

**Video Editing Service (NEW - Migration 057):**
- [ ] `showcase_videos` - Public video portfolio
- [ ] `video_editing_clients` - Editing service clients
- [ ] `video_editing_requests` - Video production requests
- [ ] `video_service_inquiries` - Contact form submissions

### Row Level Security (RLS)

Ensure RLS is enabled and policies are set for:
- [ ] User-scoped tables (credits, subscriptions, saved content)
- [ ] Admin-only tables (audit_log, system settings)
- [ ] Public read tables (subscription_plans, personas)

---

## PART 3: STRIPE SETUP

### Products & Prices

Create these products in Stripe Dashboard:

1. **Starter Plan**
   - [ ] Create product "Starter Plan"
   - [ ] Create monthly price -> copy ID to `STRIPE_PRICE_STARTER_MONTHLY`
   - [ ] Create yearly price -> copy ID to `STRIPE_PRICE_STARTER_YEARLY`
   - Credits: 100/month

2. **Pro Plan**
   - [ ] Create product "Pro Plan"
   - [ ] Create monthly price -> copy ID to `STRIPE_PRICE_PRO_MONTHLY`
   - [ ] Create yearly price -> copy ID to `STRIPE_PRICE_PRO_YEARLY`
   - Credits: 500/month

3. **Team Plan**
   - [ ] Create product "Team Plan"
   - [ ] Create monthly price -> copy ID to `STRIPE_PRICE_TEAM_MONTHLY`
   - [ ] Create yearly price -> copy ID to `STRIPE_PRICE_TEAM_YEARLY`
   - Credits: 2000/month

### Webhook Configuration

1. [ ] Go to Stripe Dashboard > Developers > Webhooks
2. [ ] Add endpoint: `https://YOUR_DOMAIN/api/webhooks/stripe`
3. [ ] Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. [ ] Copy signing secret to `STRIPE_WEBHOOK_SECRET`

---

## PART 4: EXTERNAL SERVICE SETUP

### Anthropic (Claude AI)

1. [ ] Go to https://console.anthropic.com
2. [ ] Create API key
3. [ ] Copy to `ANTHROPIC_API_KEY`
4. [ ] Verify billing is set up

### Replicate (Image Generation)

1. [ ] Go to https://replicate.com
2. [ ] Create account and get API token
3. [ ] Copy to `REPLICATE_API_TOKEN`
4. [ ] Models used: flux-schnell, flux-dev, sdxl

### SendGrid (Optional - Email)

1. [ ] Go to https://sendgrid.com
2. [ ] Create API key with "Mail Send" permission
3. [ ] Copy to `SENDGRID_API_KEY`
4. [ ] Set `EMAIL_FROM` to verified sender

### Slack (Optional - Alerts)

1. [ ] Create Slack App or Incoming Webhook
2. [ ] Copy webhook URL to `SLACK_WEBHOOK_URL`

---

## PART 5: POST-DEPLOYMENT VERIFICATION

### Health Checks

After deployment, verify these endpoints:

```bash
# Health check (shows env var status)
curl https://YOUR_DOMAIN/api/health

# Auth check (requires login)
curl https://YOUR_DOMAIN/api/auth/me

# Admin check
curl https://YOUR_DOMAIN/api/admin/enabled
```

### Functionality Tests

- [ ] User can sign up and log in
- [ ] Admin can access /admin dashboard
- [ ] Content Studio loads with products/personas
- [ ] Script generation works (uses credits)
- [ ] B-Roll image generation works
- [ ] Stripe checkout flow completes
- [ ] Webhook updates subscription status

---

## PART 6: FIRST-TIME ADMIN TASKS

Once deployed and logged in as admin:

1. **Initialize System**
   - [ ] Go to /admin/settings
   - [ ] Configure default settings

2. **Create Sample Data**
   - [ ] Add 1-2 brands at /admin/brands
   - [ ] Add 1-2 products at /admin/products
   - [ ] Create 1-2 audience personas at /admin/audience

3. **Test Content Studio**
   - [ ] Go to /admin/content-studio
   - [ ] Select a content type and product
   - [ ] Generate a test script
   - [ ] Save to library

4. **Test B-Roll Generator**
   - [ ] Go to /admin/b-roll
   - [ ] Enter a prompt
   - [ ] Generate test images

---

## RECENT COMMITS (This Session)

```
5837eef Fix: Update broken /admin/workbench link to /admin/content-studio
f21b137 Feature: Add top-level category tabs to Content Studio
48bd7ab Fix: products and personas data fetching in Content Studio
54b1a74 Feature: integrate content types and presentation styles into Content Studio UI
e43b318 Feature: Unified navigation, B-Roll generator styles, content type system
```

---

## KNOWN ISSUES / NOTES

1. **Missing Pages**: `/contact`, `/privacy`, `/terms` are referenced but may be external links
2. **Role Workbenches**: `/admin/editor/workbench`, `/admin/recorder/workbench`, `/admin/uploader/workbench` exist for role-specific workflows
3. **Debug Mode**: Ensure `DEBUG_AI` is NOT set in production (exposes prompts in logs)

---

## QUICK REFERENCE

**Application URL**: Set in Vercel automatically via `VERCEL_URL`

**Key Admin Pages**:
- Content Studio: `/admin/content-studio`
- Products: `/admin/products`
- Audience Personas: `/admin/audience`
- B-Roll Generator: `/admin/b-roll`
- System Health: `/admin/ops`
- Users: `/admin/users`

**API Health Check**: `/api/health`
**Stripe Webhook**: `/api/webhooks/stripe`

---

*This checklist was auto-generated during the comprehensive audit. Delete this file after completing all tasks.*
