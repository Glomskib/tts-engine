# FlashFlow AI

> AI-powered script generation for creators, marketers, and teams.

FlashFlow AI helps you create engaging TikTok and short-form video scripts using AI. Generate authentic, audience-targeted content that converts.

## Tech Stack

- **Frontend:** Next.js 16, React 18, TypeScript
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **AI:** Anthropic Claude API
- **Payments:** Stripe (coming soon)

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Anthropic API key

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/flashflow-ai.git
cd flashflow-ai/web

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the app.

## Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic AI (Required for generation)
ANTHROPIC_API_KEY=your-anthropic-api-key

# Admin Access (comma-separated emails)
ADMIN_USERS=admin@example.com,your-email@example.com

# Stripe (Optional - for payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
```

### Getting API Keys

1. **Supabase**: Create a project at [supabase.com](https://supabase.com), find keys in Settings → API
2. **Anthropic**: Get API key at [console.anthropic.com](https://console.anthropic.com)
3. **Stripe**: Get test keys at [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)

## Database Setup

1. Go to your Supabase dashboard → SQL Editor
2. Run migrations in order from `web/supabase/migrations/`
3. Key migrations:
   - `001_products_schema.sql` - Core product tables
   - `041_saved_skits.sql` - Skit library
   - `046_audience_personas.sql` - Audience intelligence
   - See `web/docs/DATABASE_SCHEMA.md` for full schema

## Project Structure

```
web/
├── app/                    # Next.js App Router
│   ├── admin/              # Admin dashboard pages
│   │   ├── skit-generator/ # AI script generation
│   │   ├── skit-library/   # Saved scripts
│   │   ├── audience/       # Personas & pain points
│   │   ├── products/       # Product catalog
│   │   └── winners/        # Winners bank
│   ├── api/                # API routes
│   │   ├── ai/             # AI generation endpoints
│   │   ├── audience/       # Audience CRUD
│   │   └── credits/        # Credit system
│   └── page.tsx            # Landing page
├── components/             # Shared React components
├── lib/                    # Utilities and helpers
│   ├── supabase/           # Supabase client
│   ├── credits.ts          # Credit system
│   └── api-errors.ts       # Error handling
├── hooks/                  # Custom React hooks
└── docs/                   # Documentation
```

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set the root directory to `web`
3. Add all environment variables
4. Deploy

### Manual Deployment

```bash
npm run build
npm start
```

## Key Features

- **Skit Generator**: AI-powered script creation with product integration
- **Audience Personas**: Build target audience profiles
- **Pain Points Library**: Extract and store customer language
- **Winners Bank**: Analyze successful videos
- **Credit System**: Freemium model with subscription tiers

## Development

```bash
# Run development server
npm run dev

# Type check
npm run type-check

# Lint
npm run lint

# Build for production
npm run build
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests and type check
4. Submit a pull request

## License

Proprietary - All rights reserved.

## Support

- Documentation: `/docs`
- Issues: GitHub Issues
- Email: support@flashflow.ai
