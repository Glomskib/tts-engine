# Stripe Integration Setup

This guide explains how to configure Stripe for payments and subscriptions.

## Prerequisites

1. A Stripe account ([stripe.com](https://stripe.com))
2. Stripe API keys (test and/or live)

## Environment Variables

Add these to your `.env.local`:

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_...        # or sk_live_... for production
STRIPE_WEBHOOK_SECRET=whsec_...      # From Stripe Dashboard > Webhooks

# Price IDs (create products in Stripe Dashboard)
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...
STRIPE_PRICE_TEAM_YEARLY=price_...
```

## Creating Products in Stripe

1. Go to Stripe Dashboard > Products
2. Create products for each plan:

### Starter Plan
- Name: FlashFlow AI Starter
- Monthly Price: $29/month
- Yearly Price: $278/year (20% off)
- Metadata: `plan_id: starter`

### Pro Plan
- Name: FlashFlow AI Pro
- Monthly Price: $79/month
- Yearly Price: $758/year (20% off)
- Metadata: `plan_id: pro`

### Team Plan
- Name: FlashFlow AI Team
- Monthly Price: $199/month
- Yearly Price: $1,910/year (20% off)
- Metadata: `plan_id: team`

## Setting Up Webhooks

### Local Development

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login: `stripe login`
3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### Production

1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://app.flashflow.ai/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy the signing secret to your production environment

## Credit Allocation

When a subscription payment is successful, credits are allocated:

| Plan    | Credits/Month |
|---------|---------------|
| Starter | 100           |
| Pro     | 500           |
| Team    | 2,000         |

Credits reset at each billing cycle.

## Testing

Use Stripe test cards:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires auth: `4000 0025 0000 3155`

## API Endpoints

### Create Checkout Session
```
POST /api/checkout
Body: { "planId": "pro", "billingPeriod": "monthly" }
Response: { "ok": true, "url": "https://checkout.stripe.com/..." }
```

### Webhook Handler
```
POST /api/webhooks/stripe
(Receives Stripe webhook events)
```

## Database Tables

The integration uses these tables:
- `user_subscriptions` - Stores subscription status
- `user_credits` - Tracks credit balance
- `credit_transactions` - Audit log of credit usage

See `001_subscriptions_and_credits.sql` for schema.

## Troubleshooting

### Webhook Errors
- Check signature matches (local vs production secrets differ)
- Verify endpoint URL is correct
- Check Stripe Dashboard > Webhooks for failed events

### Credits Not Updating
- Verify `invoice.paid` event is being received
- Check database for subscription record
- Ensure `plan_id` metadata is set on subscription

### Customer Portal
To let users manage their subscription:
```typescript
const session = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: 'https://app.flashflow.ai/admin/settings',
});
// Redirect to session.url
```
