# FlashFlow AI

AI-powered video script generator and content production pipeline.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Payments**: Stripe
- **Auth**: Supabase Auth

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project
- Stripe account (for payments)

### Environment Setup

Copy `.env.example` to `.env.local` and fill in the required values:

```bash
cp .env.example .env.local
```

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `OPENAI_API_KEY` - OpenAI API key for script generation
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## Project Structure

```
web/
├── app/                    # Next.js App Router pages
│   ├── admin/              # Admin dashboard pages
│   ├── api/                # API routes
│   ├── onboarding/         # Onboarding flows
│   └── upgrade/            # Subscription pages
├── components/             # React components
│   └── ui/                 # Reusable UI components
├── hooks/                  # Custom React hooks
├── lib/                    # Utilities and helpers
└── public/                 # Static assets
```

## Key Features

- **Script Generation**: AI-powered script generation for TikTok/Reels
- **Video Pipeline**: Track videos from script to published
- **Credit System**: Usage-based credits with subscription tiers
- **Admin Dashboard**: Manage users, content, and analytics

## Available Hooks

- `useForm` - Form state management with validation
- `useFetch` - Data fetching with caching and retry
- `useDebounce` / `useDebouncedCallback` - Debounced values and callbacks
- `usePagination` - Pagination state management
- `useRetry` - Retry logic with exponential backoff
- `useFocusTrap` - Focus trap for modals
- `useKeyboardShortcuts` - Keyboard shortcut handling

## UI Components

- `ErrorBoundary` - React error boundary
- `Skeleton` - Loading skeletons
- `Pagination` - Pagination controls
- `ConfirmDialog` - Confirmation dialogs
- `FormInput` / `FormTextarea` / `FormSelect` - Form inputs with validation

## API Routes

- `GET /api/health` - Health check endpoint
- `POST /api/scripts/generate` - Generate scripts
- `POST /api/subscriptions/checkout` - Create checkout session
- `POST /api/webhooks/stripe` - Stripe webhook handler

## Deployment

Deploy to Vercel:

```bash
vercel
```

Make sure to set all environment variables in your Vercel project settings.

## License

Proprietary - All rights reserved.
