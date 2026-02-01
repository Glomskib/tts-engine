// lib/navigation.ts - Single source of truth for app navigation
// All layouts and sidebars should import from here

import { ReactNode } from 'react';

export interface NavItem {
  label: string;
  href: string;
  iconName: IconName;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  showFor?: ('creator' | 'agency' | 'admin')[];
}

// Icon names that map to the Icons object
export type IconName =
  | 'Zap'
  | 'Sparkles'
  | 'FileText'
  | 'Layout'
  | 'Trophy'
  | 'Users'
  | 'Package'
  | 'Building'
  | 'Video'
  | 'Calendar'
  | 'BarChart'
  | 'Activity'
  | 'Settings'
  | 'CreditCard'
  | 'Server'
  | 'Shield'
  | 'Bell'
  | 'Menu'
  | 'Close'
  | 'User'
  | 'LogOut'
  | 'ChevronDown'
  | 'Image';

// Navigation structure - the single source of truth
export function getNavSections(options: {
  isAgencyUser: boolean;
  isAdmin: boolean;
}): NavSection[] {
  const { isAgencyUser, isAdmin } = options;
  const sections: NavSection[] = [];

  // Content Creation - always visible
  sections.push({
    title: 'Content Creation',
    items: [
      { label: 'Content Studio', href: '/admin/content-studio', iconName: 'Sparkles' },
      { label: 'B-Roll Generator', href: '/admin/b-roll', iconName: 'Image' },
      { label: 'Script Library', href: '/admin/skit-library', iconName: 'FileText' },
      { label: 'Templates', href: '/admin/templates', iconName: 'Layout' },
      { label: 'Winners Bank', href: '/admin/winners', iconName: 'Trophy' },
    ],
  });

  // Audience - always visible
  sections.push({
    title: 'Audience',
    items: [
      { label: 'Personas', href: '/admin/audience', iconName: 'Users' },
    ],
  });

  // Products - always visible
  sections.push({
    title: 'Products',
    items: [
      { label: 'Products', href: '/admin/products', iconName: 'Package' },
      { label: 'Brands', href: '/admin/brands', iconName: 'Building' },
    ],
  });

  // Video Production - only for agency/admin users
  if (isAgencyUser) {
    sections.push({
      title: 'Video Production',
      showFor: ['agency', 'admin'],
      items: [
        { label: 'Video Pipeline', href: '/admin/pipeline', iconName: 'Video' },
        { label: 'Calendar', href: '/admin/calendar', iconName: 'Calendar' },
        { label: 'Performance', href: '/admin/analytics', iconName: 'BarChart' },
        { label: 'Activity', href: '/admin/activity', iconName: 'Activity' },
      ],
    });
  }

  // Settings - always visible
  sections.push({
    title: 'Settings',
    items: [
      { label: 'Account', href: '/admin/settings', iconName: 'Settings' },
      { label: 'Billing', href: '/upgrade', iconName: 'CreditCard' },
    ],
  });

  // Admin Tools - only for admins
  if (isAdmin) {
    sections.push({
      title: 'Admin Tools',
      showFor: ['admin'],
      items: [
        { label: 'System Health', href: '/admin/ops', iconName: 'Server' },
        { label: 'Team Members', href: '/admin/users', iconName: 'Users' },
        { label: 'System Settings', href: '/admin/status', iconName: 'Shield' },
      ],
    });
  }

  return sections;
}

// Helper to check if a nav item is active
export function isNavItemActive(pathname: string, href: string): boolean {
  // Special case for skit-generator - exact match only
  if (href === '/admin/skit-generator') {
    return pathname === '/admin/skit-generator';
  }
  // Default: exact match or starts with href/
  return pathname === href || pathname.startsWith(href + '/');
}

// Constants
export const SIDEBAR_WIDTH = 256; // 16rem = 256px
export const MOBILE_BREAKPOINT = 768;
export const SIDEBAR_STORAGE_KEY = 'ffai-sidebar-open';
