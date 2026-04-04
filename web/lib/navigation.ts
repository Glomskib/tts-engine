// lib/navigation.ts - Single source of truth for app navigation
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

// Navigation structure - the single source of truth
export const NAV_SECTIONS: NavSection[] = [
  // ========================
  // SAAS SECTIONS
  // ========================
  {
    title: 'HOME',
    subscriptionType: 'saas',
    items: [
      { name: 'Today', href: '/admin/today', icon: Sparkles, subtitle: 'Your daily briefing' },
      { name: 'Command Center', href: '/admin', icon: Gauge },
      { name: 'Creator Dashboard', href: '/admin/creator', icon: Clapperboard, tourId: 'nav-creator' },
    ],
  },
  {
    title: 'CREATE',
    subscriptionType: 'saas',
    items: [
      { name: 'Opportunities', href: '/admin/opportunities', icon: Lightbulb, subtitle: 'What to make right now', minPlan: 'creator_lite' },
      { name: 'Campaigns', href: '/admin/campaigns', icon: Rocket, subtitle: 'Launch bulk content campaigns' },
      { name: 'Content Studio', href: '/admin/content-studio', icon: Sparkles, featureKey: 'skit_generator', tourId: 'nav-content-studio' },
      { name: 'Content Pack', href: '/admin/content-pack', icon: Package, subtitle: 'Hooks + script + visuals in one shot' },
      { name: 'Pack Library', href: '/admin/content-packs', icon: Package, subtitle: 'Browse saved packs' },
      { name: 'Hooks', href: '/admin/hook-generator', icon: Zap },
      { name: 'Saved Scripts', href: '/admin/script-library', icon: FileText, featureKey: 'save_skits', minPlan: 'creator_lite', tourId: 'nav-script-library' },
      { name: 'Comment Miner', href: '/admin/comment-miner', icon: Pickaxe, subtitle: 'Turn comments into content ideas' },
      { name: 'Comment Replies', href: '/admin/tools/tok-comment', icon: MessageSquare },
      { name: 'Video Breakdown', href: '/admin/transcribe', icon: Mic, subtitle: 'Analyze any video and recreate it', tourId: 'nav-transcriber' },
    ],
  },
  {
    title: 'PIPELINE',
    subscriptionType: 'saas',
    items: [
      { name: 'Production Console', href: '/admin/production', icon: Gauge, subtitle: 'What to work on right now', minPlan: 'creator_pro', tourId: 'nav-production' },
      { name: 'Content Items', href: '/admin/content-items', icon: ListTodo, subtitle: 'All content in one place', tourId: 'nav-content-items' },
      { name: 'Content Planner', href: '/admin/calendar', icon: Calendar, subtitle: 'Schedule and plan ahead', minPlan: 'creator_pro', tourId: 'nav-content-planner' },
      { name: 'Production Board', href: '/admin/pipeline', icon: Video, subtitle: 'Track progress across stages', minPlan: 'creator_pro', tourId: 'nav-pipeline' },
      { name: 'Drive Intake', href: '/admin/intake', icon: Download, subtitle: 'Import from Google Drive', minPlan: 'creator_pro' },
      { name: 'Posting Queue', href: '/admin/posting-queue', icon: Send, subtitle: 'Ready to publish', minPlan: 'creator_pro', tourId: 'nav-posting-queue' },
    ],
  },
  {
    title: 'RESEARCH & ANALYTICS',
    subscriptionType: 'saas',
    items: [
      { name: 'Performance Loop', href: '/admin/performance-loop', icon: TrendingUp, subtitle: 'What works for you — learn and improve' },
      { name: 'Speak To Your Audience', href: '/admin/audience', icon: UserCheck },
      { name: 'Winners Bank', href: '/admin/winners', icon: Trophy, minPlan: 'creator_pro', tourId: 'nav-winners' },
      { name: 'Winner Patterns', href: '/admin/intelligence/winners-bank', icon: Activity, minPlan: 'creator_pro', badge: 'Beta' },
      { name: 'Hook Library', href: '/admin/hooks', icon: Anchor, minPlan: 'creator_pro' },
      { name: 'Hook Performance', href: '/admin/intelligence/hooks', icon: Zap, minPlan: 'creator_pro', badge: 'Beta' },
      { name: 'Performance', href: '/admin/performance', icon: BarChart3, minPlan: 'creator_pro', badge: 'Beta' },
      { name: 'Clip Index', href: '/admin/clip-index', icon: Film, minPlan: 'creator_pro', badge: 'Beta' },
    ],
  },
  {
    title: 'PRODUCTS',
    subscriptionType: 'saas',
    items: [
      { name: 'Products', href: '/admin/products', icon: Package, featureKey: 'product_catalog', tourId: 'nav-products' },
      { name: 'Brands', href: '/admin/brands', icon: Building, minPlan: 'creator_pro' },
      { name: 'Briefs', href: '/admin/briefs', icon: FileText, minPlan: 'creator_pro' },
      { name: 'Experiments', href: '/admin/experiments', icon: FlaskConical, minPlan: 'creator_pro', badge: 'Beta' },
      { name: 'Retainers & Bonuses', href: '/admin/retainers', icon: Target, minPlan: 'creator_pro', badge: 'Beta' },
      { name: 'Opportunity Radar', href: '/admin/opportunity-radar', icon: Radar, adminOnly: true },
    ],
  },
  {
    title: 'SETTINGS',
    subscriptionType: 'saas',
    items: [
      { name: 'Settings', href: '/admin/settings', icon: Settings },
      { name: 'Referrals', href: '/admin/referrals', icon: Link2, minPlan: 'creator_lite' },
      { name: 'Export & Reports', href: '/admin/export', icon: Download },
    ],
  },
  {
    title: 'SYSTEM',
    subscriptionType: 'saas',
    items: [
      { name: 'Launch Check', href: '/admin/launch-check', icon: Rocket, adminOnly: true },
      { name: 'System Status', href: '/admin/settings/system-status', icon: Activity, adminOnly: true },
      { name: 'API Docs', href: '/admin/api-docs', icon: BookOpen, ownerOnly: true },
      { name: 'Feedback', href: '/admin/feedback', icon: MessageSquare, adminOnly: true },
      { name: 'Support', href: '/admin/support', icon: HelpCircle, adminOnly: true },
      { name: 'Users', href: '/admin/settings/users', icon: Users, adminOnly: true },
      { name: 'Integrations', href: '/admin/settings/integrations', icon: Plug, adminOnly: true },
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
      { name: 'Winners Bank', href: '/admin/winners', icon: Trophy },
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
  // ========================
  {
    title: 'COMMAND CENTER',
    subscriptionType: 'saas',
    items: [
      { name: 'Overview', href: '/admin/command-center', icon: Activity, ownerOnly: true },
      { name: 'API Usage', href: '/admin/command-center/usage', icon: BarChart, ownerOnly: true },
      { name: 'Campaigns', href: '/admin/command-center/projects', icon: ListTodo, ownerOnly: true },
      { name: 'Jobs', href: '/admin/command-center/jobs', icon: Briefcase, ownerOnly: true },
      { name: 'Idea Dump', href: '/admin/command-center/ideas', icon: Lightbulb, ownerOnly: true },
      { name: 'Finance', href: '/admin/command-center/finance', icon: DollarSign, ownerOnly: true },
      { name: 'Agent Scoreboard', href: '/admin/command-center/agents', icon: Zap, ownerOnly: true },
      { name: 'FinOps', href: '/admin/command-center/finops', icon: Gauge, ownerOnly: true },
      { name: 'Feedback Inbox', href: '/admin/command-center/feedback', icon: MessageSquare, ownerOnly: true },
      { name: 'Research', href: '/admin/command-center/research', icon: Search, ownerOnly: true },
      { name: 'Ops Health', href: '/admin/command-center/ops-health', icon: Shield, ownerOnly: true },
      { name: 'Marketing', href: '/admin/marketing', icon: Send, ownerOnly: true },
    ],
  },
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

      // Check subscription type filter
      if (section.subscriptionType && section.subscriptionType !== subscriptionType) {
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
