/**
 * DynamicNav - Navigation component that adapts based on subscription type.
 * Shows different navigation for SaaS users vs video editing clients.
 */

'use client';

import { useSubscription } from '@/hooks/useFeatureAccess';
import { AppSidebar } from '@/components/AppSidebar';

interface DynamicNavProps {
  isAdmin: boolean;
  unreadNotifications?: number;
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

export function DynamicNav({
  isAdmin,
  unreadNotifications = 0,
  isOpen,
  onClose,
  isMobile,
}: DynamicNavProps) {
  const { planId, subscriptionType, loading } = useSubscription();

  // Don't render while loading to prevent flash
  if (loading) {
    return (
      <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-zinc-950 border-r border-white/10 lg:static">
        <div className="p-4 border-b border-white/10">
          <div className="h-8 w-32 bg-zinc-800 rounded animate-pulse" />
        </div>
        <nav className="py-4 space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="px-4 space-y-2">
              <div className="h-3 w-20 bg-zinc-800 rounded animate-pulse" />
              <div className="h-8 w-full bg-zinc-800/50 rounded animate-pulse" />
              <div className="h-8 w-full bg-zinc-800/50 rounded animate-pulse" />
            </div>
          ))}
        </nav>
      </aside>
    );
  }

  return (
    <AppSidebar
      isAdmin={isAdmin}
      planId={planId}
      subscriptionType={subscriptionType || 'saas'}
      unreadNotifications={unreadNotifications}
      isOpen={isOpen}
      onClose={onClose}
      isMobile={isMobile}
    />
  );
}

export default DynamicNav;
