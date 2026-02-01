# FlashFlow AI - Launch Checklist

**Last Updated:** February 1, 2026

This is a streamlined checklist for launching FlashFlow AI to production.

---

## Pre-Launch (Complete Before Going Live)

### 1. Environment Variables

Copy all required variables to Vercel Dashboard:

**Supabase (Required):**
```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**AI Services (Required):**
```
ANTHROPIC_API_KEY=your_claude_key
REPLICATE_API_TOKEN=your_replicate_token
```

**Stripe (Required for Payments):**
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...
STRIPE_PRICE_TEAM_YEARLY=price_...
```

**Admin (Required):**
```
ADMIN_USERS=admin@yourdomain.com,admin2@yourdomain.com
ADMIN_UI_ENABLED=true
```

**Optional:**
```
SENDGRID_API_KEY=your_sendgrid_key
EMAIL_FROM=no-reply@yourdomain.com
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

### 2. Database Setup

Run migrations in Supabase SQL editor or via CLI:
```bash
# Run all migrations in order
supabase db push
```

Key tables that must exist:
- `user_credits`, `user_subscriptions`, `credit_transactions`
- `products`, `saved_skits`, `hooks`
- `audience_personas`, `pain_points`
- `showcase_videos`, `video_service_inquiries` (new)

### 3. Stripe Configuration

1. **Create Products in Stripe Dashboard:**
   - Starter Plan ($29/mo, $276/yr)
   - Pro Plan ($79/mo, $756/yr)
   - Team Plan ($199/mo, $1908/yr)

2. **Add Webhook Endpoint:**
   - URL: `https://your-domain.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`

3. **Copy Price IDs** to environment variables

### 4. Deploy to Vercel

```bash
# From project root
vercel --prod
```

Or push to main branch if auto-deploy is configured.

---

## Post-Launch Verification

### Immediate Checks

- [ ] Landing page loads at production URL
- [ ] Login/signup flows work
- [ ] Admin dashboard accessible for admin users
- [ ] Health check returns OK: `curl https://your-domain.com/api/health`

### User Flow Tests

- [ ] New user signup → receives 5 free credits
- [ ] Script generation works → deducts 1 credit
- [ ] Upgrade flow → Stripe checkout → subscription active
- [ ] Admin user → unlimited credits (bypass)

### Video Service Tests

- [ ] Video Services section visible on landing page
- [ ] Contact modal opens and submits
- [ ] Inquiries appear in database

---

## First-Time Admin Tasks

After first login as admin:

1. **Add Sample Data:**
   - Go to `/admin/products` → Add 1-2 products
   - Go to `/admin/audience` → Add 1-2 personas
   - Go to `/admin/brands` → Add your brand(s)

2. **Test Content Studio:**
   - Go to `/admin/content-studio`
   - Select a product, persona, content type
   - Generate a script
   - Verify it appears in saved skits

3. **Configure Settings:**
   - Go to `/admin/settings`
   - Review default configurations

---

## Monitoring

### Key Metrics to Watch

- Credit transactions (`credit_transactions` table)
- Failed payments (Stripe dashboard)
- API errors (Vercel logs)
- User signups (`auth.users` table)

### Alerts (If Configured)

- Slack notifications for errors
- Email alerts for payment failures

---

## Rollback Plan

If issues occur:

1. **Revert Deployment:**
   ```bash
   vercel rollback
   ```

2. **Database Issues:**
   - Supabase has point-in-time recovery
   - Contact Supabase support for restoration

3. **Stripe Issues:**
   - Refund affected customers via Stripe dashboard
   - Disable webhook temporarily if needed

---

## Support Contacts

- **Technical Issues:** Check Vercel logs, Supabase logs
- **Payment Issues:** Stripe dashboard
- **AI Issues:** Anthropic/Replicate status pages

---

*This checklist is a living document. Update as needed after launch.*
