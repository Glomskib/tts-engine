/**
 * FlashFlow AI Brand Configuration
 *
 * Centralized branding for consistent styling across the app.
 */

export const BRAND = {
  name: 'FlashFlow AI',
  tagline: 'Ideas move faster here',
  logo: '/FFAI.png',
  supportEmail: 'support@flashflow.ai',

  colors: {
    // Dark theme backgrounds
    background: '#09090b',
    backgroundAlt: '#18181b',
    surface: '#27272a',
    surfaceHover: '#3f3f46',

    // Borders
    border: 'rgba(255,255,255,0.1)',
    borderHover: 'rgba(255,255,255,0.2)',

    // Text
    textPrimary: '#fafafa',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',

    // Accents
    primary: '#3b82f6', // blue-500
    primaryHover: '#2563eb', // blue-600
    secondary: '#8b5cf6', // violet-500
    gradient: 'linear-gradient(to right, #3b82f6, #8b5cf6)',

    // Status
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
  },

  // Tailwind class shortcuts for consistent styling
  tw: {
    // Backgrounds
    bgPage: 'bg-[#09090b]',
    bgCard: 'bg-zinc-900/50',
    bgSurface: 'bg-zinc-800',
    bgSurfaceHover: 'hover:bg-zinc-700',

    // Borders
    border: 'border border-white/10',
    borderHover: 'hover:border-white/20',

    // Text
    textHeading: 'text-zinc-100',
    textBody: 'text-zinc-400',
    textMuted: 'text-zinc-500',

    // Buttons
    btnPrimary: 'bg-white text-zinc-900 hover:bg-zinc-100',
    btnSecondary: 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-white/10',
    btnGhost: 'text-zinc-400 hover:text-white hover:bg-white/5',

    // Inputs
    input: 'bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent',

    // Cards
    card: 'bg-zinc-900/50 border border-white/10 rounded-xl',
  },
} as const;

// Legacy exports for backwards compatibility
export const brandName = BRAND.name;
export const accentColorClass = 'bg-teal-600';
export const accentTextClass = 'text-teal-500';
export const logoText = 'FF';
export const supportEmail = BRAND.supportEmail;

// Plan-based user type detection
export type UserType = 'creator' | 'agency' | 'admin';

/**
 * Determine the user type based on plan and admin status.
 * @param planId - User's subscription plan ID
 * @param isAdmin - Whether the user is an admin
 * @returns 'admin', 'agency', or 'creator'
 */
export function getUserType(planId: string | undefined, isAdmin: boolean): UserType {
  if (isAdmin) return 'admin';
  if (planId === 'team') return 'agency';
  return 'creator';
}

/**
 * Check if a user has access to video production features.
 * Only admins and team plan users have access.
 */
export function hasVideoProductionAccess(planId: string | undefined, isAdmin: boolean): boolean {
  return isAdmin || planId === 'team';
}
