# FlashFlow AI

AI-powered video script generator and content production pipeline for TikTok, Instagram Reels, and YouTube Shorts.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL + Row Level Security)
- **AI**: Anthropic Claude (script generation)
- **Payments**: Stripe (subscriptions + credits)
- **Auth**: Supabase Auth
- **Image Generation**: Replicate (optional)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project
- Stripe account (for payments)
- Anthropic API key (for AI script generation)

### Environment Setup

Copy `.env.example` to `.env.local` and fill in the required values:

```bash
cp .env.example .env.local
```

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude AI
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- `NEXT_PUBLIC_APP_URL` - Public URL of the deployed app

Optional:
- `OPENAI_API_KEY` - OpenAI API key (fallback AI provider)
- `REPLICATE_API_TOKEN` - Replicate API token (image generation)
- `ADMIN_USERS` - Comma-separated admin email addresses
- `ADMIN_UI_ENABLED` - Set to "true" to enable admin UI in production

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm start            # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript type checking
```

## Project Structure

```
web/
├── app/                    # Next.js App Router
│   ├── admin/              # Admin dashboard (53 pages)
│   ├── api/                # API routes (231 endpoints)
│   ├── client/             # Client portal (12 pages)
│   ├── onboarding/         # Onboarding wizard
│   └── upgrade/            # Subscription upgrade
├── components/             # React components (75+)
│   ├── ui/                 # Reusable UI primitives
│   ├── analytics/          # Analytics charts
│   └── charts/             # Data visualizations
├── hooks/                  # Custom React hooks
├── lib/                    # Utilities and business logic
│   ├── ai/                 # AI prompt building and post-processing
│   ├── analytics/          # Analytics calculations
│   ├── supabase/           # Supabase client configuration
│   └── winners/            # Winners bank logic
├── public/                 # Static assets
└── supabase/
    └── migrations/         # Database migrations (75 files)
```

## Key Features

- **Content Studio** - AI script generation for 7 content types (Skit, TOF, Story, MOF, Testimonial, Educational, BOF)
- **Products & Brands** - Product catalog with multi-brand support and brand guidelines
- **Video Pipeline** - 6-state video workflow with claim system and role-based assignments
- **Winners Bank** - Store and analyze winning videos, extract hook patterns
- **Analytics Dashboard** - Performance metrics, trends, AI recommendations
- **Content Calendar** - Schedule and plan content publishing
- **Billing & Credits** - Stripe-integrated freemium model with 4 SaaS + 4 video editing tiers
- **Client Portal** - White-labeled portal with video requests, project tracking, billing
- **Agency Features** - Multi-tenant with roles (Admin, Editor, Recorder, Uploader, Client)
- **Audience Intelligence** - Persona management, pain point analysis, language analysis

## Documentation

- [API Reference](../docs/API_REFERENCE.md) - All 231 API endpoints
- [Database Schema](../docs/DATABASE_SCHEMA.md) - Tables, relationships, RLS policies
- [Components](../docs/COMPONENTS.md) - Component inventory
- [Features](../docs/FEATURES.md) - Feature documentation
- [Deployment](../docs/DEPLOYMENT.md) - Deployment guide
- [Launch Status](../docs/LAUNCH_STATUS.md) - Launch readiness report

## Deployment

See [Deployment Guide](../docs/DEPLOYMENT.md) for full instructions.

Quick deploy to Vercel:

1. Push code to GitHub
2. Connect repository to Vercel
3. Set root directory to `web`
4. Add all environment variables
5. Deploy

## License

Proprietary - All rights reserved.
