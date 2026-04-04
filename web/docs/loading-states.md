# Loading States System

## Overview

Branded loading state system that replaces raw text/spinner loading with consistent FlashFlow-branded components. Two goals: (1) loading states feel premium and intentional, (2) avoid unnecessary loading delays.

## Components

### BrandedLoader (`components/ui/BrandedLoader.tsx`)

New shared component library with six variants:

| Component | Use Case | Size |
|-----------|----------|------|
| `FullPageLoader` | Page-level loading (replaces min-h-60vh spinners) | Large, centered |
| `SectionLoader` | Content section loading (replaces "Loading..." text) | Medium, centered |
| `InlineLoader` | Button/card-level loading | Compact, inline |
| `CardLoader` | Placeholder for card grids | Grid of skeleton cards |
| `TableLoader` | Placeholder for data tables | Rows + columns skeleton |
| `StatsLoader` | Placeholder for stat cards | Grid of stat skeletons |

All use the FlashFlow logo (`/logo.svg`) with a pulse animation and subtle teal ping ring.

### SkeletonAuthCheck (upgraded)

The existing `SkeletonAuthCheck` in `components/ui/Skeleton.tsx` was upgraded from a plain spinning circle to a branded logo animation with a configurable message.

**Before:**
```tsx
<div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
<span>Verifying access...</span>
```

**After:**
```tsx
<img src="/logo.svg" ... className="animate-pulse" />
<div className="animate-ping border-teal-500/20" />
<p>Verifying access...</p>
```

This automatically upgrades all 10 pages that use `<SkeletonAuthCheck />`.

## Pages Upgraded

| Page | Before | After |
|------|--------|-------|
| 10 admin pages (alerts, creator-profile, etc.) | `SkeletonAuthCheck` (plain spinner) | `SkeletonAuthCheck` (branded logo) |
| `/admin/marketing` | `"Loading..."` text | `SkeletonAuthCheck` |
| `/admin/hook-bank` | `"Checking access..."` text | `SkeletonAuthCheck` |
| `/admin/affiliates` | `Loader2` spinner | `SkeletonAuthCheck` |
| `/admin/billing` | `Loader2` spinner | `FullPageLoader` |
| `/admin/intake` (3 sections) | `"Loading settings/usage/approvals..."` text | `SectionLoader` |

## Usage Guide

```tsx
// Full page (route-level loading)
import { FullPageLoader } from '@/components/ui/BrandedLoader';
if (loading) return <FullPageLoader message="Loading dashboard..." />;

// Section loading
import { SectionLoader } from '@/components/ui/BrandedLoader';
if (loading) return <SectionLoader message="Fetching data..." />;

// Auth check (existing pattern, now branded)
import { SkeletonAuthCheck } from '@/components/ui/Skeleton';
if (authLoading) return <SkeletonAuthCheck />;

// Card placeholders
import { CardLoader } from '@/components/ui/BrandedLoader';
if (loading) return <CardLoader count={6} />;

// Table placeholder
import { TableLoader } from '@/components/ui/BrandedLoader';
if (loading) return <TableLoader rows={8} columns={5} />;
```

## Design Decisions

- **Logo-based, not spinner-based**: The FlashFlow logo with pulse animation feels more premium than a generic circular spinner
- **Subtle ping ring**: A teal-tinted ping effect adds visual interest without being distracting
- **Staggered animation**: Table skeleton rows have staggered delays for a natural loading feel
- **No Next.js Image for auth**: SkeletonAuthCheck uses `<img>` instead of `<Image>` to avoid the Image component's own loading behavior during auth checks
- **Backward compatible**: SkeletonAuthCheck upgrade is a drop-in replacement — no import changes needed for existing consumers
