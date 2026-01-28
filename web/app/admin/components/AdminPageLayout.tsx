'use client';

import AdminNav from './AdminNav';
import IncidentBanner from './IncidentBanner';

interface AdminPageLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  isAdmin?: boolean;
  showNav?: boolean;
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | 'full';
  headerActions?: React.ReactNode;
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
 */
export default function AdminPageLayout({
  children,
  title,
  subtitle,
  isAdmin = true,
  showNav = false,
  maxWidth = 'xl',
  headerActions,
}: AdminPageLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`${MAX_WIDTH_CLASSES[maxWidth]} mx-auto px-4 sm:px-6 py-6`}>
        {/* Incident Banner */}
        <IncidentBanner />

        {/* Navigation */}
        {showNav && <AdminNav isAdmin={isAdmin} />}

        {/* Page Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
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
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      {title && (
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
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
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-slate-800 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 mb-4 max-w-sm mx-auto">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

/**
 * Standard button styles for admin pages.
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
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-slate-800 text-white hover:bg-slate-700 focus:ring-slate-500',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'text-slate-600 hover:bg-slate-100 focus:ring-slate-500',
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
    default: 'bg-slate-50 border-slate-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-amber-50 border-amber-200',
    danger: 'bg-red-50 border-red-200',
  };

  const valueColors = {
    default: 'text-slate-800',
    success: 'text-green-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
  };

  return (
    <div className={`px-4 py-3 rounded-lg border ${variantClasses[variant]}`}>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-xl font-semibold ${valueColors[variant]}`}>{value}</div>
      {trend && <div className="text-xs text-slate-400 mt-0.5">{trend}</div>}
    </div>
  );
}
