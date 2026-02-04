# FlashFlow AI - Quick Start

## For New Users

1. **Sign Up** - Create your account at the app URL
2. **Create a Brand** - Go to **Brands** and add your brand name, colors, and voice guidelines
3. **Add a Product** - Go to **Products** and add a product you want to promote
4. **Generate a Script** - Go to **Content Studio**, select your product, choose a content type, and generate
5. **Save & Iterate** - Save scripts you like to your library, remix winners, track performance

## For Developers

### Prerequisites

- Node.js 18+
- Supabase project (PostgreSQL)
- Stripe account (for billing)
- Anthropic API key (for AI generation)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd web
npm install

# Configure environment
cp .env.example .env.local
# Fill in required variables (see below)

# Run migrations
# Copy each file from supabase/migrations/ to Supabase SQL Editor
# Or use: npx supabase db push

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Required Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=         # Your Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY=        # Supabase service role key
ANTHROPIC_API_KEY=                # Claude API key for AI generation
```

### Optional Environment Variables

```env
STRIPE_SECRET_KEY=                # Stripe payments
STRIPE_WEBHOOK_SECRET=            # Stripe webhook verification
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
REPLICATE_API_TOKEN=              # Image generation
OPENAI_API_KEY=                   # Alternative AI provider
NEXT_PUBLIC_APP_URL=              # Production URL
```

### Useful Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
npm run type-check   # TypeScript check (tsc --noEmit)
```

### Verification

```bash
# Run API smoke test (requires dev server running)
node scripts/api-smoke-test.mjs

# Run skit generator smoke test
node scripts/smoke_generate_skit.mjs

# Verify database migrations
# Copy scripts/verify-migrations.sql to Supabase SQL Editor
```

## Key Features

| Feature | Path | Description |
|---------|------|-------------|
| Content Studio | `/admin/content-studio` | AI-powered script generation |
| Skit Generator | `/admin/skit-generator` | Advanced skit creation with personas |
| Products | `/admin/products` | Product catalog management |
| Brands | `/admin/brands` | Brand guidelines and voice |
| Winners Bank | `/admin/winners-bank` | Track best-performing content |
| Video Pipeline | `/admin/pipeline` | Video production workflow |
| Analytics | `/admin/analytics` | Performance metrics and trends |
| Client Portal | `/client` | Client-facing video tracking |
| Billing | `/admin/billing` | Subscription and credit management |

## Architecture

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL + Auth + Storage)
- **AI:** Anthropic Claude (script generation, scoring, analysis)
- **Payments:** Stripe (subscriptions + one-time credits)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel
