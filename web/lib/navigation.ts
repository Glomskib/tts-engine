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
  Send,
  Sun,
  Camera,
  UserCheck,
  Link2,
  Ticket,
  ListTodo,
  Eye,
  MessageSquare,
  Plug,
  type LucideIcon,
} from 'lucide-react';
import { meetsMinPlan, migrateOldPlanId, getPlanByStringId } from '@/lib/plans';

export type SubscriptionType = 'saas' | 'video_editing';
export type PlanTier = 'free' | 'starter' | 'creator' | 'business' | 'pro' | 'agency' | 'video_client' | 'admin';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  /** Feature key for gating (optional) */
  featureKey?: string;
  /** External link (opens in same tab but not under admin layout) */
  external?: boolean;
  /** Only visible to admin users */
  adminOnly?: boolean;
  /** Minimum plan required to access (shown locked if user doesn't meet it) */
  minPlan?: 'free' | 'creator_lite' | 'creator_pro' | 'brand' | 'agency';
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
    title: 'CREATE',
    subscriptionType: 'saas',
    items: [
      { name: 'Content Studio', href: '/admin/content-studio', icon: Sparkles, featureKey: 'skit_generator' },
      { name: 'Script Library', href: '/admin/skit-library', icon: FileText, featureKey: 'save_skits' },
    ],
  },
  {
    title: 'PIPELINE',
    subscriptionType: 'saas',
    items: [
      { name: 'Production Board', href: '/admin/pipeline', icon: Video },
      { name: 'Review', href: '/admin/review', icon: Eye },
      { name: 'Content Calendar', href: '/admin/calendar', icon: Calendar, minPlan: 'creator_pro' },
      { name: 'Posting Queue', href: '/admin/posting-queue', icon: Send, minPlan: 'creator_pro' },
      { name: 'VA Dashboard', href: '/va', icon: Users, external: true, minPlan: 'brand' },
    ],
  },
  {
    title: 'INSIGHTS',
    subscriptionType: 'saas',
    items: [
      { name: 'Winners Bank', href: '/admin/winners', icon: Trophy, featureKey: 'winners_bank' },
      { name: 'Transcriber', href: '/admin/transcribe', icon: Mic },
      { name: 'Customer Archetypes', href: '/admin/audience', icon: UserCheck },
      { name: 'Patterns', href: '/admin/winners/patterns', icon: Activity, minPlan: 'creator_pro' },
    ],
  },
  {
    title: 'PRODUCTS',
    subscriptionType: 'saas',
    items: [
      { name: 'Products', href: '/admin/products', icon: Package, featureKey: 'product_catalog' },
      { name: 'Brands', href: '/admin/brands', icon: Building, minPlan: 'brand' },
    ],
  },
  {
    title: 'SETTINGS',
    subscriptionType: 'saas',
    items: [
      { name: 'Notifications', href: '/admin/notifications', icon: Bell },
      { name: 'Referrals', href: '/admin/referrals', icon: Link2, minPlan: 'creator_lite' },
      { name: 'Billing', href: '/admin/billing', icon: Wallet },
      { name: 'Credits', href: '/admin/credits', icon: CreditCard },
    ],
  },
  {
    title: 'SYSTEM',
    subscriptionType: 'saas',
    items: [
      { name: 'Automation', href: '/admin/automation', icon: Zap, adminOnly: true },
      { name: 'Second Brain', href: '/admin/second-brain', icon: BookOpen, adminOnly: true },
      { name: 'Voice Agent', href: '/admin/voice', icon: Mic, adminOnly: true },
      { name: 'Task Queue', href: '/admin/tasks', icon: ListTodo, adminOnly: true },
      { name: 'System Status', href: '/admin/settings/system-status', icon: Activity, adminOnly: true },
      { name: 'API Docs', href: '/admin/api-docs', icon: BookOpen, minPlan: 'agency' },
      { name: 'Feedback', href: '/admin/feedback', icon: MessageSquare, adminOnly: true },
      { name: 'Users', href: '/admin/settings/users', icon: Users, adminOnly: true },
      { name: 'Integrations', href: '/admin/settings/integrations', icon: Plug, adminOnly: true },
      { name: 'Settings', href: '/admin/settings', icon: Settings, adminOnly: true },
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
      { name: 'Review', href: '/client/review', icon: Shield },
      { name: 'Analytics', href: '/client/analytics', icon: BarChart },
      { name: 'Content Studio', href: '/admin/content-studio', icon: Sparkles },
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
  // ========================
  // SHARED SECTIONS
  // ========================
  {
    title: 'CLIENT SERVICES',
    showFor: ['admin'],
    items: [
      { name: 'Video Editing Queue', href: '/admin/video-editing', icon: Clapperboard },
      { name: 'Client Management', href: '/admin/clients', icon: Building },
      { name: 'Editor Management', href: '/admin/client-management', icon: Users },
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
  subscriptionType?: SubscriptionType;
}): NavSectionResolved[] {
  const { planId, isAdmin, subscriptionType = 'saas' } = options;

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
      // Admin sees everything unlocked
      if (isAdmin) return { ...section, items: section.items.map(item => ({ ...item })) };

      // Filter out adminOnly items, mark minPlan-gated items as locked
      const resolvedItems: NavItemResolved[] = section.items
        .filter((item) => !item.adminOnly)
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
  if (href === '/admin/skit-generator') {
    return pathname === '/admin/skit-generator';
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
};

// Constants
export const SIDEBAR_WIDTH = 256;
export const MOBILE_BREAKPOINT = 768;
export const SIDEBAR_STORAGE_KEY = 'ffai-sidebar-open';

// Brand config
export const BRAND = {
  name: 'FlashFlow AI',
  logo: '/FFAI.png',
};
