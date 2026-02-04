# Deployment Guide

## Prerequisites

- Node.js 18+
- Vercel account (or similar Node.js hosting)
- Supabase project
- Stripe account
- Anthropic API key (for AI script generation)

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude AI |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `NEXT_PUBLIC_APP_URL` | Public URL of the deployed app |

### Optional

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (fallback AI provider) |
| `REPLICATE_API_TOKEN` | Replicate API token (image generation) |
| `ADMIN_USERS` | Comma-separated admin email addresses |
| `UPLOADER_USERS` | Comma-separated uploader email addresses |
| `ADMIN_UI_ENABLED` | Set to "true" to enable admin UI in production |

## Database Setup

1. Create a Supabase project at https://supabase.com
2. Run all migrations in `web/supabase/migrations/` in order
3. Verify RLS policies are active on all tables

## Deployment Steps

### Vercel (Recommended)

1. Push code to GitHub
2. Connect the repository to Vercel
3. Set the root directory to `web`
4. Add all environment variables in Vercel project settings
5. Deploy

### Manual

```bash
cd web
npm install
npm run build
npm start
```

## Post-Deployment Checklist

1. **Stripe Webhook**: Configure webhook endpoint at `https://your-domain.com/api/webhooks/stripe`
   - Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
2. **Supabase Auth**: Configure redirect URLs in Supabase dashboard to include your production domain
3. **Test Authentication**: Sign up a test user and verify email flow
4. **Test Payments**: Run a test checkout in Stripe test mode
5. **Set Admin Users**: Add admin email addresses to `ADMIN_USERS` environment variable
6. **Health Check**: Verify `https://your-domain.com/api/health` returns 200
7. **SSL**: Ensure HTTPS is configured (automatic on Vercel)

## Monitoring

- Application errors are logged to the console
- API routes include correlation IDs for tracing
- Supabase dashboard provides database monitoring
- Stripe dashboard provides payment monitoring
