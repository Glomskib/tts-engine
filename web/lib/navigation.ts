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
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  showFor?: ('free' | 'starter' | 'pro' | 'agency' | 'admin')[];
}

// Navigation structure - the single source of truth
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'CONTENT CREATION',
    items: [
      { name: 'Content Studio', href: '/admin/content-studio', icon: Sparkles },
      { name: 'B-Roll Generator', href: '/admin/b-roll', icon: Image },
      { name: 'Script Library', href: '/admin/skit-library', icon: FileText },
      { name: 'Templates', href: '/admin/templates', icon: LayoutTemplate },
      { name: 'Winners Bank', href: '/admin/winners', icon: Trophy },
    ],
  },
  {
    title: 'AUDIENCE',
    items: [
      { name: 'Personas', href: '/admin/audience', icon: Users },
    ],
  },
  {
    title: 'PRODUCTS',
    items: [
      { name: 'Products', href: '/admin/products', icon: Package },
      { name: 'Brands', href: '/admin/brands', icon: Building },
    ],
  },
  {
    title: 'VIDEO PRODUCTION',
    showFor: ['agency', 'admin'],
    items: [
      { name: 'Video Pipeline', href: '/admin/pipeline', icon: Video },
      { name: 'Calendar', href: '/admin/calendar', icon: Calendar },
      { name: 'Performance', href: '/admin/analytics', icon: BarChart },
      { name: 'Activity Log', href: '/admin/activity', icon: Activity },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { name: 'Account', href: '/admin/settings', icon: Settings },
      { name: 'Billing', href: '/upgrade', icon: CreditCard },
    ],
  },
  {
    title: 'ADMIN',
    showFor: ['admin'],
    items: [
      { name: 'System Health', href: '/admin/ops', icon: Server },
      { name: 'Team Members', href: '/admin/users', icon: Users },
      { name: 'System Settings', href: '/admin/status', icon: Shield },
    ],
  },
];

// Filter sections based on user type
export function getFilteredNavSections(options: {
  planId?: string | null;
  isAdmin: boolean;
}): NavSection[] {
  const { planId, isAdmin } = options;

  // Determine user tier
  let userTier: 'free' | 'starter' | 'pro' | 'agency' | 'admin' = 'free';
  if (isAdmin) {
    userTier = 'admin';
  } else if (planId) {
    if (planId.includes('agency')) userTier = 'agency';
    else if (planId.includes('pro')) userTier = 'pro';
    else if (planId.includes('starter')) userTier = 'starter';
  }

  return NAV_SECTIONS.filter((section) => {
    if (!section.showFor) return true;
    if (userTier === 'admin') return true; // Admin sees everything
    return section.showFor.includes(userTier);
  });
}

// Helper to check if a nav item is active
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/admin/skit-generator') {
    return pathname === '/admin/skit-generator';
  }
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
