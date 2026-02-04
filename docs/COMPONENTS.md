# FlashFlow AI - Component Reference

## UI Components (`components/ui/`)

| Component | Description |
|-----------|-------------|
| `Button.tsx` | Styled button with variants |
| `Card.tsx` | Card container component |
| `ConfirmDialog.tsx` | Confirmation dialog modal |
| `EmptyState.tsx` | Empty state placeholder |
| `ErrorBoundary.tsx` | React error boundary wrapper |
| `ErrorMessage.tsx` | Inline error message display |
| `FormInput.tsx` | Form input with label and validation |
| `LazyImage.tsx` | Lazy-loaded image with fallback |
| `MobileInput.tsx` | Mobile-optimized input |
| `OfflineIndicator.tsx` | Offline status indicator |
| `Pagination.tsx` | Pagination controls |
| `PullToRefresh.tsx` | Pull-to-refresh gesture handler |
| `RetryButton.tsx` | Retry action button |
| `Skeleton.tsx` | Loading skeleton placeholders |
| `SkipLink.tsx` | Accessibility skip navigation link |
| `Toast.tsx` | Toast notification component |
| `AriaLive.tsx` | ARIA live region for screen readers |

## Layout & Navigation

| Component | Description |
|-----------|-------------|
| `AppHeader.tsx` | Main application header |
| `AppSidebar.tsx` | Admin sidebar navigation |
| `DynamicNav.tsx` | Dynamic navigation based on user role |
| `MobileNav.tsx` | Mobile navigation menu |
| `MobileBottomNav.tsx` | Mobile bottom tab navigation |
| `Footer.tsx` | Application footer |

## Script & Content

| Component | Description |
|-----------|-------------|
| `ScriptActions.tsx` | Script action buttons (copy, save, export) |
| `ScriptComments.tsx` | Comment thread on scripts |
| `ScoreBreakdown.tsx` | AI script score visualization |
| `ShareScriptModal.tsx` | Modal for sharing scripts |
| `VersionHistory.tsx` | Script version history viewer |
| `SmartSuggestions.tsx` | AI-powered content suggestions |

## Persona & Audience

| Component | Description |
|-----------|-------------|
| `PersonaCard.tsx` | Persona display card |
| `PersonaPreview.tsx` | Persona preview panel |
| `PersonaPreviewCard.tsx` | Compact persona preview |
| `PersonaSelector.tsx` | Persona selection dropdown |
| `CreatorPersonaSelector.tsx` | Creator persona picker |
| `PainPointSelector.tsx` | Pain point selection UI |
| `PainPointChecklist.tsx` | Pain point checklist |

## Video Pipeline

| Component | Description |
|-----------|-------------|
| `VideoCreationSheet.tsx` | Video creation bottom sheet |
| `VideoDetailSheet.tsx` | Video detail bottom sheet |
| `VideoQueueMobile.tsx` | Mobile video queue view |
| `VideoShowcase.tsx` | Video showcase display |
| `VideoServiceContact.tsx` | Video service inquiry form |

## Winners Bank

| Component | Description |
|-----------|-------------|
| `WinnerCard.tsx` | Winner video card display |
| `WinnerDetailModal.tsx` | Winner detail modal |
| `MarkAsWinnerModal.tsx` | Mark video as winner dialog |
| `AddExternalWinnerModal.tsx` | Add external winner form |
| `WinnersIntelligencePanel.tsx` | AI winners analysis panel |

## Analytics

| Component | Description |
|-----------|-------------|
| `analytics/StatCard.tsx` | Statistics card |
| `analytics/TrendsChart.tsx` | Performance trends chart |
| `analytics/TopPerformersCard.tsx` | Top performers display |
| `analytics/VideoLengthChart.tsx` | Video length distribution chart |
| `analytics/RecommendationCard.tsx` | AI recommendation card |
| `analytics/WinnersEmptyState.tsx` | Winners empty state |
| `charts/UsageChart.tsx` | Usage/credits chart |

## Billing & Credits

| Component | Description |
|-----------|-------------|
| `CreditsBadge.tsx` | Credits remaining badge |
| `LowCreditBanner.tsx` | Low credit warning banner |
| `UpgradePrompt.tsx` | Subscription upgrade prompt |
| `FeatureGate.tsx` | Feature gating by plan |

## Utility & System

| Component | Description |
|-----------|-------------|
| `Providers.tsx` | App providers wrapper (theme, auth, etc.) |
| `PWAProvider.tsx` | Progressive Web App provider |
| `Tooltip.tsx` | Tooltip component |
| `BottomSheet.tsx` | Mobile bottom sheet |
| `Toast.tsx` | Toast notification (root level) |
| `EmptyState.tsx` | Generic empty state (root level) |
| `NotificationsBell.tsx` | Notification bell icon with count |
| `NotificationBell.tsx` | Alternative notification bell |
| `OnboardingChecklist.tsx` | Onboarding progress checklist |
| `OnboardingModal.tsx` | Onboarding wizard modal |
| `GlobalSearch.tsx` | Global search bar |
| `KeyboardShortcutsModal.tsx` | Keyboard shortcuts reference |
| `DevTools.tsx` | Development tools panel |
| `ActivityWidget.tsx` | Recent activity widget |

## Batch Operations

| Component | Description |
|-----------|-------------|
| `BulkActions.tsx` | Bulk action buttons |
| `BulkActionBar.tsx` | Bulk action toolbar |
| `ExportDropdown.tsx` | Data export dropdown |
| `FilterSheet.tsx` | Filter panel |

---

## Admin Pages (`app/admin/`)

| Page | Description |
|------|-------------|
| `page.tsx` | Admin home/redirect |
| `content-studio/page.tsx` | AI script generator (main tool) |
| `skit-generator/page.tsx` | Standalone skit generator |
| `pipeline/page.tsx` | Video pipeline board |
| `pipeline/[id]/page.tsx` | Video pipeline detail |
| `products/page.tsx` | Products management |
| `brands/page.tsx` | Brands management |
| `winners-bank/page.tsx` | Winners bank + winning hooks |
| `winners/page.tsx` | Winners management |
| `analytics/page.tsx` | Analytics dashboard |
| `calendar/page.tsx` | Content calendar |
| `billing/page.tsx` | Billing management |
| `credits/page.tsx` | Credits management |
| `settings/page.tsx` | Settings (account, subscription, notifications, preferences) |
| `audience/page.tsx` | Audience intelligence |
| `dashboard/page.tsx` | Admin dashboard |
| `scripts/page.tsx` | Script library |
| `scripts/[id]/page.tsx` | Script detail |
| `scripts/templates/[id]/page.tsx` | Script template detail |
| `templates/page.tsx` | Templates overview |
| `skit-library/page.tsx` | Saved skit library |
| `collections/page.tsx` | Collections management |
| `activity/page.tsx` | Activity feed |
| `notifications/page.tsx` | Notifications center |
| `users/page.tsx` | User management |
| `clients/page.tsx` | Clients list |
| `clients/[id]/page.tsx` | Client detail |
| `client-orgs/page.tsx` | Client organizations |
| `requests/page.tsx` | Client requests |
| `video-editing/page.tsx` | Video editing service |
| `video-editing/[id]/page.tsx` | Video editing detail |
| `performance/page.tsx` | Performance dashboard |
| `usage/page.tsx` | Usage tracking |
| `hook-suggestions/page.tsx` | Hook suggestions review |
| `assignments/page.tsx` | Team assignments |
| `execution/page.tsx` | Execution tracking |
| `ops/page.tsx` | Operations dashboard |
| `audit-log/page.tsx` | Audit log viewer |
| `events/page.tsx` | Events viewer |
| `system-health/page.tsx` | System health monitor |
| `status/page.tsx` | Status page |
| `submit-video/page.tsx` | Submit video form |
| `test-center/page.tsx` | Test center |
| `upgrade-requests/page.tsx` | Upgrade requests |
| `ingestion/page.tsx` | Data ingestion |
| `ingestion/jobs/page.tsx` | Ingestion jobs list |
| `ingestion/jobs/[id]/page.tsx` | Ingestion job detail |
| `recorder/page.tsx` | Recorder workbench |
| `recorder/workbench/page.tsx` | Recorder task view |
| `editor/page.tsx` | Editor workbench |
| `editor/workbench/page.tsx` | Editor task view |
| `uploader/page.tsx` | Uploader workbench |
| `uploader/workbench/page.tsx` | Uploader task view |

## Client Portal Pages (`app/client/`)

| Page | Description |
|------|-------------|
| `page.tsx` | Client dashboard |
| `videos/page.tsx` | Client video list |
| `videos/[id]/page.tsx` | Client video detail |
| `my-videos/page.tsx` | My videos |
| `my-videos/[id]/page.tsx` | My video detail |
| `projects/page.tsx` | Projects list |
| `projects/[project_id]/page.tsx` | Project detail |
| `requests/page.tsx` | Requests list |
| `requests/new/page.tsx` | New request form |
| `requests/[request_id]/page.tsx` | Request detail |
| `billing/page.tsx` | Billing summary |
| `support/page.tsx` | Support page |
