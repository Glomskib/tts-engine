# FlashFlow AI — Complete Freemium System

A production-ready landing page and credits-based subscription system for your TTS Engine webapp.

## What's Included

```
flashflow-complete/
├── app/
│   ├── page.tsx                    # Landing page with pricing
│   ├── pricing/
│   │   └── page.tsx                # Standalone pricing page
│   └── api/
│       ├── credits/
│       │   └── route.ts            # Credits API (get balance, deduct)
│       ├── checkout/
│       │   └── route.ts            # Stripe checkout sessions
│       └── webhooks/
│           └── stripe/
│               └── route.ts        # Stripe webhook handler
├── components/
│   ├── CreditsBadge.tsx            # Credits display components
│   └── FeatureGate.tsx             # Feature gating components
├── hooks/
│   └── useCredits.ts               # React hook for credits
├── migrations/
│   └── 001_subscriptions_and_credits.sql   # Database schema
└── README.md                       # This file
```

---

## Quick Start

### 1. Run Database Migration

Copy the contents of `migrations/001_subscriptions_and_credits.sql` and run in Supabase SQL Editor.

This creates:
- `subscription_plans` — Plan definitions (Free, Starter, Pro, Team)
- `user_subscriptions` — User subscription status
- `user_credits` — Credit balances
- `credit_transactions` — Audit log
- Auto-initialization trigger for new signups

### 2. Copy Files to Your Project

```bash
# From your tts-engine/web directory:

# Copy landing page
cp flashflow-complete/app/page.tsx app/page.tsx

# Copy pricing page
mkdir -p app/pricing
cp flashflow-complete/app/pricing/page.tsx app/pricing/page.tsx

# Copy API routes
mkdir -p app/api/credits app/api/checkout app/api/webhooks/stripe
cp flashflow-complete/app/api/credits/route.ts app/api/credits/route.ts
cp flashflow-complete/app/api/checkout/route.ts app/api/checkout/route.ts
cp flashflow-complete/app/api/webhooks/stripe/route.ts app/api/webhooks/stripe/route.ts

# Copy components
cp flashflow-complete/components/CreditsBadge.tsx components/CreditsBadge.tsx
cp flashflow-complete/components/FeatureGate.tsx components/FeatureGate.tsx

# Copy hooks
cp flashflow-complete/hooks/useCredits.ts hooks/useCredits.ts
```

### 3. Add Environment Variables

Add to `.env.local`:

```env
# Stripe (get from dashboard.stripe.com)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (create in Stripe dashboard)
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...
STRIPE_PRICE_TEAM_YEARLY=price_...
```

### 4. Set Up Stripe Products

In Stripe Dashboard:

1. **Create Products**:
   - Starter ($29/mo, $276/yr)
   - Pro ($79/mo, $756/yr)
   - Team ($199/mo, $1908/yr)

2. **Copy Price IDs** to your env vars

3. **Set up Webhook**:
   - Go to Developers → Webhooks
   - Add endpoint: `https://your-domain.com/api/webhooks/stripe`
   - Select events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`

---

## Integration Guide

### Add Credits Badge to Header

```tsx
// In your admin layout or header component
import { CreditsBadge } from '@/components/CreditsBadge';

export function Header() {
  return (
    <header className="...">
      {/* ... other header content */}
      <CreditsBadge showPlan />
    </header>
  );
}
```

### Gate Features by Plan

```tsx
import { FeatureGate } from '@/components/FeatureGate';

// Only show to Pro+ users
<FeatureGate requiredPlan="pro">
  <AudiencePersonasSection />
</FeatureGate>

// Only show if user has credits
<FeatureGate requireCredits>
  <GenerateButton />
</FeatureGate>
```

### Deduct Credits on Generation

Update your `generate-skit` API route:

```tsx
// app/api/ai/generate-skit/route.ts
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  
  // Get user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check and deduct credit BEFORE generating
  const { data: creditResult } = await supabase.rpc('deduct_credit', {
    p_user_id: user.id,
    p_description: 'Skit generation',
  });

  const result = creditResult?.[0];
  if (!result?.success) {
    return NextResponse.json({
      error: 'No credits remaining',
      creditsRemaining: result?.credits_remaining || 0,
    }, { status: 402 });
  }

  // Continue with generation...
  // ... your existing generation code ...

  return NextResponse.json({
    skit: generatedSkit,
    creditsRemaining: result.credits_remaining,
  });
}
```

### Handle No Credits in UI

```tsx
import { useCredits } from '@/hooks/useCredits';
import { NoCreditsModal, useNoCreditsModal } from '@/components/FeatureGate';

function SkitGenerator() {
  const { hasCredits, deductCredit } = useCredits();
  const noCreditsModal = useNoCreditsModal();

  const handleGenerate = async () => {
    if (!hasCredits) {
      noCreditsModal.open();
      return;
    }

    // Call your generate API
    const response = await fetch('/api/ai/generate-skit', { ... });
    
    if (response.status === 402) {
      // No credits - show modal
      noCreditsModal.open();
      return;
    }

    // Handle success...
  };

  return (
    <>
      <button onClick={handleGenerate}>Generate</button>
      <NoCreditsModal isOpen={noCreditsModal.isOpen} onClose={noCreditsModal.close} />
    </>
  );
}
```

---

## Free Tier Behavior

New users automatically get:
- 5 free credits (lifetime, not monthly)
- Access to basic features
- Limited skit storage (3 skits)
- Basic character presets

When credits run out:
- NoCreditsModal prompts upgrade
- Generate button still visible but blocked
- CreditsBadge shows warning state

---

## Pricing Tiers

| Plan | Price | Credits | Products | Team |
|------|-------|---------|----------|------|
| Free | $0 | 5 total | 3 | 1 |
| Starter | $29/mo | 100/mo | 10 | 1 |
| Pro | $79/mo | 500/mo | Unlimited | 1 |
| Team | $199/mo | 2,000/mo | Unlimited | 10 |

**Yearly discount:** 20% off all paid plans

---

## Video Production Services

The landing page includes a CTA for "Video Production Services" — this is positioned as a separate retainer-based offering:

- End-to-end video production
- Filming and editing
- Performance tracking
- Custom pricing via sales contact

Update the `/contact` link to your preferred contact method.

---

## Customization

### Adjust Pricing

1. Update `migrations/001_subscriptions_and_credits.sql` (the INSERT statement)
2. Run: `UPDATE subscription_plans SET price_monthly = X WHERE id = 'plan_id'`
3. Update `app/page.tsx` and `app/pricing/page.tsx` UI

### Add/Remove Features

Edit the `features` JSONB column in `subscription_plans`:

```sql
UPDATE subscription_plans 
SET features = '["Feature 1", "Feature 2"]'::jsonb
WHERE id = 'starter';
```

### Change Credit Allocation

```sql
UPDATE subscription_plans 
SET credits_per_month = 200
WHERE id = 'starter';
```

---

## Troubleshooting

### Credits not deducting
- Check the `credit_transactions` table for logs
- Verify RLS policies are working
- Check that `deduct_credit` function exists

### Stripe webhook errors
- Verify webhook secret matches env var
- Check Stripe dashboard for failed webhook attempts
- Ensure endpoint is publicly accessible

### New users not getting free credits
- Check the `on_auth_user_created_init_credits` trigger exists
- Manually insert credits:
  ```sql
  INSERT INTO user_credits (user_id, credits_remaining, free_credits_total)
  VALUES ('user-uuid', 5, 5);
  ```

---

## Next Steps

After integration:

1. Test the full signup → free trial → upgrade flow
2. Verify webhook events in Stripe dashboard
3. Add credits badge to your existing admin header
4. Update your generate API to deduct credits
5. Configure Stripe tax settings if needed
6. Set up Stripe customer portal for subscription management

---

Built for FlashFlow AI by Claude.
