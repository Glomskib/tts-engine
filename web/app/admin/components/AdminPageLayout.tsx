'use client';

import AdminNav from './AdminNav';
import IncidentBanner from './IncidentBanner';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/Breadcrumbs';

interface AdminPageLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Optional workflow stage label shown above the title */
  stage?: 'research' | 'create' | 'production' | 'analytics';
  isAdmin?: boolean;
  /**
   * @deprecated 2026-05-02 — renders the legacy horizontal `AdminNav` strip
   * which is one of the "3 sidebars" Brandon flagged. The unified
   * `AdminSidebar` (rendered once at the layout level) is the only nav
   * surface inside /admin. Existing callers were migrated; do not add new
   * uses. This prop is retained as a no-op-friendly default to avoid
   * breaking any downstream caller mid-migration.
   */
  showNav?: boolean;
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | 'full';
  headerActions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}

const MAX_WIDTH_CLASSES = {
  md: 'max-w-3xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  '2xl': 'max-w-7xl',
  full: 'max-w-full',
};

const STAGE_STYLES = {
  research: { label: 'Research', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  create: { label: 'Create', color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20' },
  production: { label: 'Production', color: 'text-teal-400', bg: 'bg-teal-400/10', border: 'border-teal-400/20' },
  analytics: { label: 'Analytics', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
};

/**
 * Shared layout wrapper for admin pages.
 * Provides consistent spacing, typography, and structure.
 * Uses dark theme to match the main admin layout.
 */
export default function AdminPageLayout({
  children,
  title,
  subtitle,
  stage,
  isAdmin = true,
  showNav = false,
  maxWidth = 'xl',
  headerActions,
  breadcrumbs,
}: AdminPageLayoutProps) {
  const stageStyle = stage ? STAGE_STYLES[stage] : null;

  return (
    <div className="min-h-screen bg-[#09090b]">
      <div className={`${MAX_WIDTH_CLASSES[maxWidth]} mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-6`}>
        {/* Incident Banner */}
        <IncidentBanner />

        {/* Navigation */}
        {showNav && <AdminNav isAdmin={isAdmin} />}

        {/* Breadcrumbs */}
        {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}

        {/* Page Header */}
        <div className="mb-8 flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            {stageStyle && (
              <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-widest ${stageStyle.color} ${stageStyle.bg} ${stageStyle.border} border rounded-full px-2.5 py-0.5 mb-2`}>
                {stageStyle.label}
              </span>
            )}
            <h1 className="text-2xl font-bold text-zinc-50 tracking-tight">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
            )}
          </div>
          {headerActions && (
            <div className="flex items-center gap-2 flex-shrink-0">{headerActions}</div>
          )}
        </div>

        {/* Page Content */}
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * Card component for consistent styling within admin pages.
 * Uses dark theme with subtle borders.
 */
export function AdminCard({
  children,
  title,
  subtitle,
  headerActions,
  noPadding,
  accent,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  noPadding?: boolean;
  /** Left accent color for the card header */
  accent?: 'teal' | 'violet' | 'amber' | 'blue' | 'red' | 'emerald';
}) {
  const accentColors = {
    teal: 'border-l-teal-500',
    violet: 'border-l-violet-500',
    amber: 'border-l-amber-500',
    blue: 'border-l-blue-500',
    red: 'border-l-red-500',
    emerald: 'border-l-emerald-500',
  };

  return (
    <div className={`bg-zinc-900/50 rounded-xl border border-white/[0.08] overflow-hidden ${accent ? `border-l-2 ${accentColors[accent]}` : ''}`}>
      {title && (
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-200 tracking-tight">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
            )}
          </div>
          {headerActions && <div className="flex items-center gap-2 flex-shrink-0">{headerActions}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4 sm:p-5'}>{children}</div>
    </div>
  );
}

/**
 * Section divider with label for grouping cards.
 */
export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">{label}</span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
}

/**
 * Empty state component for consistent messaging.
 * Uses dark theme styling.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 text-center">
      {icon && (
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-zinc-100 mb-1">{title}</h3>
      <p className="text-sm text-zinc-500 mb-4 max-w-sm mx-auto">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

/**
 * Standard button styles for admin pages.
 * Uses dark theme styling.
 */
export function AdminButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-violet-600 text-white hover:bg-violet-700 focus:ring-violet-500',
    secondary: 'bg-zinc-800 text-zinc-100 border border-white/10 hover:bg-zinc-700 focus:ring-zinc-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus:ring-zinc-500',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm min-h-[36px]',
    md: 'px-4 py-2 text-sm min-h-[44px]',
    lg: 'px-5 py-2.5 text-base',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`}
    >
      {children}
    </button>
  );
}

/**
 * Stat card for dashboard metrics.
 * Uses dark theme styling.
 */
export function StatCard({
  label,
  value,
  trend,
  variant = 'default',
  icon,
}: {
  label: string;
  value: string | number;
  trend?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  icon?: React.ReactNode;
}) {
  const variantClasses = {
    default: 'bg-zinc-800/50 border-white/[0.08]',
    success: 'bg-emerald-500/10 border-emerald-500/20',
    warning: 'bg-amber-500/10 border-amber-500/20',
    danger: 'bg-red-500/10 border-red-500/20',
  };

  const valueColors = {
    default: 'text-zinc-100',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-red-400',
  };

  return (
    <div className={`px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl border ${variantClasses[variant]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-zinc-600">{icon}</span>}
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold tabular-nums ${valueColors[variant]}`}>{value}</div>
      {trend && <div className="text-[11px] text-zinc-500 mt-0.5">{trend}</div>}
    </div>
  );
}

/**
 * Consistent status badge used across content items, pipeline, and calendar.
 */
export type ContentStatus = 'briefing' | 'scripted' | 'ready_to_record' | 'recorded' | 'editing' | 'scheduled' | 'ready_to_post' | 'posted';

const STATUS_BADGE_STYLES: Record<ContentStatus, { bg: string; text: string; dot: string; label: string }> = {
  briefing: { bg: 'bg-yellow-400/10', text: 'text-yellow-400', dot: 'bg-yellow-400', label: 'Briefing' },
  scripted: { bg: 'bg-orange-400/10', text: 'text-orange-400', dot: 'bg-orange-400', label: 'Scripted' },
  ready_to_record: { bg: 'bg-blue-400/10', text: 'text-blue-400', dot: 'bg-blue-400', label: 'Ready to Record' },
  recorded: { bg: 'bg-indigo-400/10', text: 'text-indigo-400', dot: 'bg-indigo-400', label: 'Recorded' },
  editing: { bg: 'bg-purple-400/10', text: 'text-purple-400', dot: 'bg-purple-400', label: 'Editing' },
  scheduled: { bg: 'bg-cyan-400/10', text: 'text-cyan-400', dot: 'bg-cyan-400', label: 'Scheduled' },
  ready_to_post: { bg: 'bg-teal-400/10', text: 'text-teal-400', dot: 'bg-teal-400', label: 'Ready to Post' },
  posted: { bg: 'bg-emerald-400/10', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Posted' },
};

export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: ContentStatus;
  size?: 'xs' | 'sm';
}) {
  const style = STATUS_BADGE_STYLES[status];
  if (!style) return null;

  const sizeClasses = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5 gap-1'
    : 'text-xs px-2 py-0.5 gap-1.5';

  return (
    <span className={`inline-flex items-center font-medium rounded-full ${sizeClasses} ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
