// =============================================================================
// lib/navigation.ts — CANONICAL nav structure for the FlashFlow admin shell.
//
//   ⚠️  DO NOT inline nav arrays inside any /admin layout, page, or component.
//   ⚠️  All sidebar surfaces (AdminSidebar, MobileNavSheet, command palette,
//       bottom-bar) MUST read from NAV_SECTIONS / getFilteredNavSections.
//
// History:
//   2026-04-29 — restructured 8 cramped groups -> 5 (HOME/CREATE/PIPELINE/GROW/
//                MANAGE) per Brandon's "H10-style nav, mobile first" directive.
//   2026-05-01 — collapsed three drift-prone inline sidebars (admin/layout.tsx
//                desktop+mobile, AppSidebar) into one AdminSidebar component.
//                Removed the section-level `subscriptionType: 'saas'` *gate* so
//                creator-side users on a video_editing plan still see the
//                unified creator nav. Plan gating now lives on individual items
//                via `minPlan` (preferred). The `subscriptionType` field still
//                exists for the dedicated VIDEO PORTAL and ACCOUNT sections —
//                those are surfaced *additionally* for video clients, not as a
//                replacement for the creator surface.
//
// If you need to add a new tool, add it to the appropriate section here. Do
// NOT mirror the entry into a layout/page — the renderers pick it up
// automatically. Period.
// =============================================================================
import {
  Sparkles,
  Image,
  FileText,
  LayoutTemplate,
  Trophy,
  Users,
  Package,
  Building,
  Video,
  Calendar,
  BarChart,
  Activity,
  Anchor,
  BarChart3,
  Settings,
  CreditCard,
  Bell,
  Server,
  Shield,
  Menu,
  X,
  User,
  LogOut,
  ChevronDown,
  Upload,
  Play,
  HelpCircle,
  Wallet,
  Clapperboard,
  FlaskConical,
  Zap,
  BookOpen,
  Mic,
  Search,
  Hash,
  DollarSign,
  Lightbulb,
  Send,
  Sun,
  Camera,
  GraduationCap,
  UserCheck,
  Link2,
  Ticket,
  ListTodo,
  Eye,
  MessageSquare,
  Plug,
  Gift,
  Target,
  Download,
  Youtube,
  Gauge,
  Briefcase,
  Film,
  Radar,
  Rocket,
  Pickaxe,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { meetsMinPlan, migrateOldPlanId, getPlanByStringId } from '@/lib/plans';

export type SubscriptionType = 'saas' | 'video_editing';
export type PlanTier = 'free' | 'starter' | 'creator' | 'business' | 'pro' | 'agency' | 'video_client' | 'admin';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  /** Short description shown on hover or below the label */
  subtitle?: string;
  /** Feature key for gating (optional) */
  featureKey?: string;
  /** External link (opens in same tab but not under admin layout) */
  external?: boolean;
  /** Only visible to admin users */
  adminOnly?: boolean;
  /** Only visible to owner (OWNER_EMAILS allowlist) — hidden + 404 for everyone else */
  ownerOnly?: boolean;
  /** Minimum plan required to access (shown locked if user doesn't meet it) */
  minPlan?: 'free' | 'creator_lite' | 'creator_pro' | 'brand' | 'agency';
  /** data-tour attribute value for guided walkthrough targeting */
  tourId?: string;
  /** Optional badge shown next to the item name (e.g. 'Beta', 'New') */
  badge?: 'Beta' | 'New' | 'Internal';
}

/** Nav item with resolved lock state for rendering */
export interface NavItemResolved extends NavItem {
  locked?: boolean;
  requiredPlanName?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  showFor?: PlanTier[];
  /** Only show for specific subscription types */
  subscriptionType?: SubscriptionType;
}

// ===========================================================================
// Navigation structure — single source of truth for the FlashFlow Studio app
// nav. RESTRUCTURED 2026-04-29 from 8 cramped sections down to 5 clean groups
// per Brandon's directive: "Too cramped and somehow spreadout and everything
// hidden. Related things should be easy to navigate one to the next. Think
// H10 or other big saas Nav. Mobile first is a must."
//
// Design principles:
//   1. ≤5 visible sections per user — reduces decision fatigue.
//   2. ≤7 items per section — within Miller's chunking limit.
//   3. Related actions live next to each other (Create/Plan/Publish flow).
//   4. Admin/owner/operator items move to a single "Admin" section that only
//      shows for admins/owners — no Internal-badge clutter for normal users.
//   5. Owner-only Command Center collapses into one "Mission Control" entry
//      that links to its own dedicated route group. Detail pages live there,
//      not in the sidebar.
// ===========================================================================
export const NAV_SECTIONS: NavSection[] = [
  // ========================
  // SAAS SECTIONS — the FlashFlow Studio creator surface
  // ========================
  {
    title: 'HOME',
    subscriptionType: 'saas',
    items: [
      { name: 'Today', href: '/admin/today', icon: Sparkles, subtitle: 'Daily briefing + missions' },
      { name: 'Creator Dashboard', href: '/admin/creator', icon: Clapperboard, subtitle: 'Your KPIs at a glance', tourId: 'nav-creator' },
    ],
  },
  {
    // CREATE — every "make something new" tool. Removed the old "Create" /
    // "Research & Analytics" split because hooks + scripts + breakdowns are
    // all create-side. Removed Comment Replies as a separate item (lives
    // under Comment Miner now). Pack/Pack Library merge in the Studio detail.
    title: 'CREATE',
    subscriptionType: 'saas',
    items: [
      { name: 'AI Video Editor', href: '/admin/editor', icon: Clapperboard, subtitle: 'Auto-cut silence, add captions, ship vertical video in minutes', badge: 'New', tourId: 'nav-autoedit' },
      { name: 'Content Studio', href: '/admin/content-studio', icon: Sparkles, subtitle: 'Generate scripts, hooks, and full content packs from one prompt', featureKey: 'skit_generator', tourId: 'nav-content-studio' },
      { name: 'Opportunities', href: '/admin/opportunities', icon: Lightbulb, subtitle: 'Personalized daily content ideas based on your niche and trends', minPlan: 'creator_lite' },
      { name: 'Hooks', href: '/admin/hook-generator', icon: Zap, subtitle: 'Generate scroll-stopping hooks for TikTok, Reels, and Shorts' },
      { name: 'Comment Miner', href: '/admin/comment-miner', icon: Pickaxe, subtitle: 'Find viral comments across creators and turn them into content ideas' },
      { name: 'Affiliate Hub', href: '/admin/affiliate', icon: DollarSign, subtitle: 'Discover TT Shop products, request samples, track commissions', badge: 'New' },
      { name: 'Transcriber', href: '/admin/transcribe', icon: Mic, subtitle: 'Transcribe video and audio to text in seconds with AI', tourId: 'nav-transcriber' },
      { name: 'Saved Scripts', href: '/admin/script-library', icon: FileText, subtitle: 'Your reusable library of scripts, hooks, and angles', featureKey: 'save_skits', minPlan: 'creator_lite', tourId: 'nav-script-library' },
    ],
  },
  {
    // PIPELINE — the path from "I have an idea" to "it's posted." Single line:
    // capture footage → schedule → post. AutoEdit moved up to CREATE so it's
    // visible without hunting (was hidden in PIPELINE before — Brandon
    // 2026-04-30: "I don't see auto edit or anything related to editing
    // anywhere"). Footage Hub stays here as the upload surface.
    title: 'PIPELINE',
    subscriptionType: 'saas',
    items: [
      { name: 'Footage Hub', href: '/admin/footage', icon: Film, subtitle: 'Upload, organize, and search every piece of raw footage you film', minPlan: 'creator_pro' },
      { name: 'Content Items', href: '/admin/content-items', icon: ListTodo, subtitle: 'Every script, draft, and finished video in one searchable list', tourId: 'nav-content-items' },
      { name: 'Production Board', href: '/admin/pipeline', icon: Video, subtitle: 'Kanban board for tracking videos from idea to posted', minPlan: 'creator_pro', tourId: 'nav-pipeline' },
      { name: 'Content Planner', href: '/admin/calendar', icon: Calendar, subtitle: 'Plan, schedule, and hit posting goals across every platform', minPlan: 'creator_pro', tourId: 'nav-content-planner' },
      { name: 'Posting Queue', href: '/admin/posting-queue', icon: Send, subtitle: 'Auto-publish to TikTok, Reels, Shorts at the best time', minPlan: 'creator_pro', tourId: 'nav-posting-queue' },
    ],
  },
  {
    // GROW — analytics + intelligence. Replaces the old "Research & Analytics"
    // section. AI Insights + Performance Loop + Winners Bank + Audience are
    // the canonical "what's working / who's it for" tools.
    title: 'GROW',
    subscriptionType: 'saas',
    items: [
      { name: 'AI Insights', href: '/admin/performance', icon: BarChart3, subtitle: 'AI analysis of what is and isn\'t working in your content', minPlan: 'creator_pro', badge: 'Beta' },
      { name: 'Performance Loop', href: '/admin/performance-loop', icon: TrendingUp, subtitle: 'Close the loop between posting, analyzing, and improving' },
      { name: 'Winners Bank', href: '/admin/winners-bank', icon: Trophy, subtitle: 'Browse viral videos and break down what made them work', minPlan: 'creator_pro', tourId: 'nav-winners' },
      { name: 'Hook Library', href: '/admin/hooks', icon: Anchor, subtitle: 'Your private library of proven hook patterns to remix', minPlan: 'creator_pro' },
      { name: 'Audience', href: '/admin/audience', icon: UserCheck, subtitle: 'Build a clear ICP and speak directly to the right viewer' },
    ],
  },
  {
    // MANAGE — your business inputs (products, brands, briefs, retainers,
    // campaigns, settings, billing). Anything you set up once and reuse lives
    // here. Avoids burying Settings 5 sections deep.
    title: 'MANAGE',
    subscriptionType: 'saas',
    items: [
      { name: 'Products', href: '/admin/products', icon: Package, subtitle: 'Catalog the products you promote so AI can write better scripts', featureKey: 'product_catalog', tourId: 'nav-products' },
      { name: 'Brands', href: '/admin/brands', icon: Building, subtitle: 'Manage every brand workspace from a single FlashFlow login', minPlan: 'creator_pro' },
      { name: 'Briefs', href: '/admin/briefs', icon: FileText, subtitle: 'Track brand deliverables, briefs, and creative requirements', minPlan: 'creator_pro' },
      { name: 'Retainers', href: '/admin/retainers', icon: Target, subtitle: 'Monitor monthly brand-deal deliverables and renewal risk', minPlan: 'creator_pro', badge: 'Beta' },
      { name: 'Campaigns', href: '/admin/campaigns', icon: Rocket, subtitle: 'Plan and run bulk content campaigns across multiple posts' },
      { name: 'Organization', href: '/admin/organization', icon: Building, subtitle: 'Invite teammates and manage roles', minPlan: 'brand' },
      { name: 'Settings', href: '/admin/settings', icon: Settings, subtitle: 'Account, billing, and connected platform integrations' },
      { name: 'Referrals', href: '/admin/referrals', icon: Link2, subtitle: 'Share your link and earn recurring commission on referrals', minPlan: 'creator_lite' },
    ],
  },
  // ========================
  // ADMIN / OWNER — collapsed into ONE section instead of two. Hidden from
  // normal users entirely. The COMMAND CENTER moved out of the sidebar to
  // its own route group at /admin/command-center (linked from here).
  // ========================
  {
    title: 'ADMIN',
    subscriptionType: 'saas',
    items: [
      { name: 'Mission Control', href: '/admin/command-center', icon: Activity, ownerOnly: true, subtitle: 'Operator dashboard for ops + revenue + agents' },
      { name: 'Launch Check', href: '/admin/launch-check', icon: Rocket, adminOnly: true, badge: 'Internal' },
      { name: 'Render Jobs', href: '/admin/render-jobs', icon: Server, adminOnly: true, badge: 'Internal' },
      { name: 'System Status', href: '/admin/settings/system-status', icon: Activity, adminOnly: true, badge: 'Internal' },
      { name: 'Feedback Inbox', href: '/admin/feedback', icon: MessageSquare, adminOnly: true, badge: 'Internal' },
      { name: 'Users', href: '/admin/settings/users', icon: Users, adminOnly: true, badge: 'Internal' },
      { name: 'Integrations', href: '/admin/settings/integrations', icon: Plug, adminOnly: true, badge: 'Internal' },
      { name: 'API Docs', href: '/admin/api-docs', icon: BookOpen, ownerOnly: true, badge: 'Internal' },
    ],
  },
  // ========================
  // VIDEO EDITING CLIENT SECTIONS
  // ========================
  {
    title: 'VIDEO PORTAL',
    subscriptionType: 'video_editing',
    items: [
      { name: 'Dashboard', href: '/client', icon: BarChart },
      { name: 'Submit Video', href: '/client/requests/new', icon: Upload },
      { name: 'My Videos', href: '/client/videos', icon: Play },
      { name: 'All Requests', href: '/client/requests', icon: FileText },
      { name: 'Analytics', href: '/client/analytics', icon: BarChart },
      { name: 'Content Studio', href: '/admin/content-studio', icon: Sparkles },
      { name: 'Comment Reply Creator', href: '/admin/tools/tok-comment', icon: MessageSquare },
      { name: 'Winners Bank', href: '/admin/winners-bank', icon: Trophy },
    ],
  },
  {
    title: 'ACCOUNT',
    subscriptionType: 'video_editing',
    items: [
      { name: 'Billing', href: '/client/billing', icon: Wallet },
      { name: 'Support', href: '/client/support', icon: HelpCircle },
    ],
  },
  // CLIENT SERVICES section removed — pages still exist but hidden from nav
  // ========================
  // OWNER-ONLY: COMMAND CENTER
  // (REMOVED FROM SIDEBAR 2026-04-29) — the 12-item Command Center section
  // moved out of the sidebar entirely. The "Mission Control" link in the
  // ADMIN section above lands at /admin/command-center, where its own
  // sub-nav (CCSubnav.tsx) handles the 12 detail pages — they don't belong
  // in the global sidebar. Keeps the Brandon-only operator surface from
  // bloating every user's view (even though they were ownerOnly, they
  // showed up in the data structure and were a maintenance drag).
  // To restore the old surface, see git history.
  // ========================
];

/** Resolved section with lock state per item */
export interface NavSectionResolved {
  title: string;
  items: NavItemResolved[];
  showFor?: PlanTier[];
  subscriptionType?: SubscriptionType;
}

// Filter sections based on user type and subscription
export function getFilteredNavSections(options: {
  planId?: string | null;
  isAdmin: boolean;
  isOwner?: boolean;
  subscriptionType?: SubscriptionType;
}): NavSectionResolved[] {
  const { planId, isAdmin, isOwner = false, subscriptionType = 'saas' } = options;

  // Resolve user's actual plan ID (handles old plan IDs)
  const resolvedPlanId = planId ? migrateOldPlanId(planId) : 'free';

  // Determine user tier (for section-level showFor)
  let userTier: PlanTier = 'free';
  if (isAdmin) {
    userTier = 'admin';
  } else if (subscriptionType === 'video_editing') {
    userTier = 'video_client';
  } else if (planId) {
    if (planId.includes('agency') || planId.includes('video_agency')) userTier = 'agency';
    else if (planId.includes('business')) userTier = 'business';
    else if (planId.includes('creator')) userTier = 'creator';
    else if (planId.includes('pro') || planId.includes('video_scale') || planId.includes('video_growth')) userTier = 'pro';
    else if (planId.includes('starter') || planId.includes('video_starter')) userTier = 'starter';
  }

  return NAV_SECTIONS
    .filter((section) => {
      // Admin sees everything
      if (isAdmin) return true;

      // Subscription-type rules:
      //   - Sections marked saas are the canonical creator surface — show to
      //     EVERY signed-in user regardless of plan. Removed the previous
      //     "hide unless subscriptionType==='saas'" filter (2026-05-01) that
      //     was making video_editing clients see a totally different nav with
      //     no AI Video Editor entry.
      //   - Sections marked video_editing are additive: only shown when the
      //     user actually has a video_editing subscription.
      if (section.subscriptionType === 'video_editing' && subscriptionType !== 'video_editing') {
        return false;
      }

      // Check plan tier filter (section-level)
      if (section.showFor && !section.showFor.includes(userTier)) {
        return false;
      }

      return true;
    })
    .map((section) => {
      // Admin sees everything unlocked (but filter ownerOnly items if not owner)
      if (isAdmin) {
        return {
          ...section,
          items: section.items
            .filter(item => !item.ownerOnly || isOwner)
            .map(item => ({ ...item })),
        };
      }

      // Filter out adminOnly and ownerOnly items, mark minPlan-gated items as locked
      const resolvedItems: NavItemResolved[] = section.items
        .filter((item) => !item.adminOnly && !(item.ownerOnly && !isOwner))
        .map((item) => {
          if (item.minPlan && !meetsMinPlan(resolvedPlanId, item.minPlan)) {
            const requiredPlan = getPlanByStringId(item.minPlan);
            return {
              ...item,
              locked: true,
              requiredPlanName: requiredPlan?.name || item.minPlan,
            };
          }
          return { ...item };
        });

      return { ...section, items: resolvedItems };
    })
    .filter((section) => section.items.length > 0);
}

// Get navigation for video editing clients
export function getVideoClientNavSections(): NavSection[] {
  return NAV_SECTIONS.filter(section =>
    section.subscriptionType === 'video_editing' ||
    section.title === 'ADMIN'
  );
}

// Helper to check if a nav item is active
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/admin/content-studio') {
    return pathname === '/admin/content-studio';
  }
  // Exact match for short paths
  if (href === '/va') return pathname === '/va';
  return pathname === href || pathname.startsWith(href + '/');
}

// Export icons for use in components
export const Icons = {
  Menu,
  Close: X,
  User,
  LogOut,
  ChevronDown,
  Bell,
  Sparkles,
  Image,
  FileText,
  LayoutTemplate,
  Trophy,
  Users,
  Package,
  Building,
  Video,
  Calendar,
  BarChart,
  Activity,
  Settings,
  CreditCard,
  Server,
  Shield,
  Eye,
  Upload,
  Play,
  HelpCircle,
  Wallet,
  Clapperboard,
  FlaskConical,
  Mic,
  Search,
  MessageSquare,
  Lightbulb,
  Youtube,
};

// Constants
export const SIDEBAR_WIDTH = 256;
export const MOBILE_BREAKPOINT = 768;
export const SIDEBAR_STORAGE_KEY = 'ffai-sidebar-open';

// Brand config
export const BRAND = {
  name: 'FlashFlow AI',
  logo: '/logo.svg',
};
