'use client';

import AdminNav from './AdminNav';
import IncidentBanner from './IncidentBanner';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/Breadcrumbs';

interface AdminPageLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  isAdmin?: boolean;
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

/**
 * Shared layout wrapper for admin pages.
 * Provides consistent spacing, typography, and structure.
 * Uses dark theme to match the main admin layout.
 */
export default function AdminPageLayout({
  children,
  title,
  subtitle,
  isAdmin = true,
  showNav = false,
  maxWidth = 'xl',
  headerActions,
  breadcrumbs,
}: AdminPageLayoutProps) {
  return (
    <div className="min-h-screen bg-[#09090b]">
      <div className={`${MAX_WIDTH_CLASSES[maxWidth]} mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-6 overflow-x-hidden`}>
        {/* Incident Banner */}
        <IncidentBanner />

        {/* Navigation */}
        {showNav && <AdminNav isAdmin={isAdmin} />}

        {/* Breadcrumbs */}
        {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}

        {/* Page Header */}
        <div className="mb-6 flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
            )}
          </div>
          {headerActions && (
            <div className="flex items-center gap-2">{headerActions}</div>
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
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <div className="bg-zinc-900/50 rounded-xl border border-white/10 overflow-hidden">
      {title && (
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>
            )}
          </div>
          {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
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
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
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
}: {
  label: string;
  value: string | number;
  trend?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const variantClasses = {
    default: 'bg-zinc-800/50 border-white/10',
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
    <div className={`px-4 py-3 rounded-xl border ${variantClasses[variant]}`}>
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-xl font-semibold ${valueColors[variant]}`}>{value}</div>
      {trend && <div className="text-xs text-zinc-500 mt-0.5">{trend}</div>}
    </div>
  );
}
