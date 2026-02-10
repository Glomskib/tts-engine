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
  type LucideIcon,
} from 'lucide-react';

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
    title: 'CONTENT',
    subscriptionType: 'saas',
    items: [
      { name: 'Content Studio', href: '/admin/content-studio', icon: Sparkles, featureKey: 'skit_generator' },
      { name: 'Script Library', href: '/admin/skit-library', icon: FileText, featureKey: 'save_skits' },
      { name: 'Winners Bank', href: '/admin/winners', icon: Trophy, featureKey: 'winners_bank' },
      { name: 'Import', href: '/admin/winners/import', icon: Upload },
    ],
  },
  {
    title: 'PIPELINE',
    subscriptionType: 'saas',
    items: [
      { name: 'Video Pipeline', href: '/admin/pipeline', icon: Video },
      { name: 'Content Calendar', href: '/admin/calendar', icon: Calendar },
      { name: 'VA Dashboard', href: '/va', icon: Users, external: true },
    ],
  },
  {
    title: 'ANALYTICS',
    subscriptionType: 'saas',
    items: [
      { name: 'Analytics', href: '/admin/analytics', icon: BarChart },
      { name: 'Video Performance', href: '/admin/videos', icon: Play },
      { name: 'Quality', href: '/admin/quality', icon: FlaskConical },
      { name: 'Competitors', href: '/admin/competitors', icon: Search },
      { name: 'A/B Tests', href: '/admin/ab-tests', icon: FlaskConical },
      { name: 'Trends', href: '/admin/trends', icon: Hash },
      { name: 'Revenue', href: '/admin/revenue', icon: DollarSign },
    ],
  },
  {
    title: 'MANAGEMENT',
    subscriptionType: 'saas',
    items: [
      { name: 'Products', href: '/admin/products', icon: Package, featureKey: 'product_catalog' },
      { name: 'Accounts', href: '/admin/accounts', icon: Building },
      { name: 'Audiences', href: '/admin/audience', icon: Users, featureKey: 'audience_intelligence' },
    ],
  },
  {
    title: 'SYSTEM',
    subscriptionType: 'saas',
    showFor: ['agency', 'admin'],
    items: [
      { name: 'Automation', href: '/admin/automation', icon: Zap },
      { name: 'Second Brain', href: '/admin/second-brain', icon: BookOpen },
      { name: 'Voice Agent', href: '/admin/voice', icon: Mic },
      { name: 'Settings', href: '/admin/settings', icon: Settings },
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

// Filter sections based on user type and subscription
export function getFilteredNavSections(options: {
  planId?: string | null;
  isAdmin: boolean;
  subscriptionType?: SubscriptionType;
}): NavSection[] {
  const { planId, isAdmin, subscriptionType = 'saas' } = options;

  // Determine user tier
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

  return NAV_SECTIONS.filter((section) => {
    // Admin sees everything
    if (isAdmin) return true;

    // Check subscription type filter
    if (section.subscriptionType && section.subscriptionType !== subscriptionType) {
      return false;
    }

    // Check plan tier filter
    if (section.showFor && !section.showFor.includes(userTier)) {
      return false;
    }

    return true;
  });
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
  Upload,
  Play,
  HelpCircle,
  Wallet,
  Clapperboard,
  FlaskConical,
  Mic,
  Search,
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
