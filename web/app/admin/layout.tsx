'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { X, ChevronDown, User, LogOut, Zap, Search, Sun, Moon, ArrowLeft, Sparkles } from 'lucide-react';
import { useCredits } from '@/hooks/useCredits';
import { getFilteredNavSections } from '@/lib/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminMobileHeader } from '@/components/admin/AdminMobileHeader';
import { CreditsBadge } from '@/components/CreditsBadge';
import { ClawbotStatus } from '@/components/ClawbotStatus';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileNavSheet } from '@/components/MobileNavSheet';
import { ToastProvider } from '@/contexts/ToastContext';
import { UpgradeModalProvider } from '@/contexts/UpgradeModalContext';
import { UpgradeModal } from '@/components/UpgradeModal';
import { FirstWinBanner } from '@/components/FirstWinBanner';
import { OfflineIndicator } from '@/components/ui/OfflineIndicator';
import { MobileTestChecklist } from '@/components/dev/MobileTestChecklist';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SkipLink } from '@/components/ui/SkipLink';
import { AriaLiveProvider } from '@/components/ui/AriaLive';
import { PlanDebugBanner } from '@/components/PlanDebugBanner';
import dynamic from 'next/dynamic';
const MainOnboardingTour = dynamic(() => import('@/components/onboarding/MainOnboardingTour').then(m => ({ default: m.MainOnboardingTour })), { ssr: false });

const KeyboardShortcutsModal = dynamic(() => import('@/components/KeyboardShortcutsModal').then(m => ({ default: m.KeyboardShortcutsModal })), { ssr: false });
const NotificationsBell = dynamic(() => import('@/components/NotificationsBell'), { ssr: false });
import { LowCreditBanner } from '@/components/LowCreditBanner';
import { CreditMilestoneBanner, ReferralPromptBanner } from '@/components/UpgradePrompts';
import { CommandPalette } from '@/components/CommandPalette';
import { FeedbackWidget } from '@/components/FeedbackWidget';
import { ThemeProvider, useTheme } from '@/app/components/ThemeProvider';
import { GuidedModeProvider } from '@/contexts/GuidedModeContext';
import { GuidedModeBanner } from '@/components/guided-mode/GuidedModeBanner';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

function ThemeToggle() {
  const { theme, toggleTheme, isDark } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="p-2 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] rounded-lg transition-colors"
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { subscription } = useCredits();
  const { loading: authLoading, authenticated, user, isAdmin, role } = useAuth();

  const auth = {
    loading: authLoading,
    authenticated,
    userId: user?.id || null,
    userEmail: user?.email || null,
    isAdmin,
    role: role || null,
  };

  // Note: the legacy `sidebarOpen` state was removed when AdminSidebar took
  // over ownership of the mobile drawer (2026-05-02). Onboarding fires the
  // `flashflow:open-admin-sidebar` window event instead.
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [customizeNavOpen, setCustomizeNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(true); // Default to mobile to prevent flash
  const [unreadCount, setUnreadCount] = useState(0);
  const [feedbackCount, setFeedbackCount] = useState(0);

  // Set page title based on pathname
  useEffect(() => {
    const PAGE_TITLES: Record<string, string> = {
      '/admin': 'Command Center',
      '/admin/content-studio': 'Content Studio',
      '/admin/script-library': 'Script Library',
      '/admin/pipeline': 'Production Board',
      '/admin/launch-sync': 'LaunchSync',
      '/admin/calendar': 'Content Planner',
      '/admin/posting-queue': 'Posting Queue',
      '/admin/winners-bank': 'Winners Bank',
      '/admin/audience': 'Customer Archetypes',
      '/admin/demographics': 'Demographics',
      '/admin/winners/patterns': 'Patterns',
      '/admin/products': 'Products',
      '/admin/brands': 'Brands',
      '/admin/notifications': 'Notifications',
      '/admin/referrals': 'Referrals',
      '/admin/billing': 'Billing',
      '/admin/credits': 'Credits',
      '/admin/tasks': 'Task Queue',
      '/admin/automation': 'Automation',
      '/admin/settings': 'Settings',
      '/admin/feedback': 'User Feedback',
      '/admin/api-docs': 'API Docs',
      '/admin/transcribe': 'Transcriber',
      '/admin/youtube-transcribe': 'YouTube Transcriber',
      '/admin/help': 'Help',
      '/admin/support': 'Support',
      '/admin/settings/system-status': 'System Status',
      '/admin/launch-check': 'Launch Check',
      '/admin/command-center': 'Command Center',
      '/admin/command-center/usage': 'API Usage',
      '/admin/command-center/projects': 'Campaigns',
      '/admin/command-center/jobs': 'Jobs',
      '/admin/command-center/ideas': 'Idea Dump',
      '/admin/command-center/finance': 'Finance',
      '/admin/command-center/agents': 'Agent Scoreboard',
      '/admin/command-center/finops': 'FinOps',
      '/admin/video-editing': 'Editing Pipeline',
      '/admin/hooks': 'Hook Library',
      '/admin/revenue-mode': 'Revenue Mode',
      '/admin/studio': 'Creator Studio',
    };
    let title = PAGE_TITLES[pathname];
    if (!title && pathname.startsWith('/admin/video-editing/')) title = 'Editing Request';
    if (!title && pathname.startsWith('/admin/record/')) title = 'Recording Kit';
    if (!title && pathname.startsWith('/admin/post/')) title = 'Post Content';
    document.title = `${title || 'Admin'} | FlashFlow AI`;
  }, [pathname]);

  // Detect screen size with JavaScript
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    // Check immediately
    checkMobile();

    // Add resize listener
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Note: /admin/ is the authenticated app area, not admin-only.
  // Nav filtering + plan gating handles per-page access control.
  // Command Center routes are owner-gated separately.

  // Close auxiliary panels (bottom-bar nav sheet + user menu) on route change.
  // The AdminSidebar owns its own drawer state and auto-dismisses internally.
  useEffect(() => {
    setNavSheetOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!auth.loading && !auth.authenticated) {
      router.replace('/login');
    }
  }, [auth.loading, auth.authenticated, router]);

  // Fetch notifications + feedback count
  useEffect(() => {
    if (!auth.authenticated) return;
    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications?unread_only=true&limit=1');
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.data?.unread_count || data.meta?.unread_count || 0);
        }
      } catch {
        // ignore
      }
    };
    const fetchFeedbackCount = async () => {
      if (!auth.isAdmin) return;
      try {
        const res = await fetch('/api/feedback?admin=true&status=new');
        if (res.ok) {
          const data = await res.json();
          setFeedbackCount(data.stats?.new || 0);
        }
      } catch {
        // ignore
      }
    };
    fetchNotifications();
    fetchFeedbackCount();
    const interval = setInterval(() => { fetchNotifications(); fetchFeedbackCount(); }, 30000);
    return () => clearInterval(interval);
  }, [auth.authenticated, auth.isAdmin]);

  const handleLogout = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.push('/');
    } catch {
      // ignore
    }
  };

  // Loading state
  if (auth.loading) {
    return (
      <ToastProvider>
        <div className="flex items-center justify-center min-h-screen bg-[var(--bg)] text-[var(--text-muted)]">
          <div className="flex items-center gap-3 text-lg">
            <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            Loading...
          </div>
        </div>
      </ToastProvider>
    );
  }

  if (!auth.authenticated) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  // Owner check for Command Center visibility
  const ownerEmails = (process.env.NEXT_PUBLIC_OWNER_EMAILS || 'spiderbuttons@gmail.com').split(',').map(s => s.trim().toLowerCase());
  const isOwner = !!auth.userEmail && ownerEmails.includes(auth.userEmail.toLowerCase());
  const navSections = getFilteredNavSections({ planId: subscription?.planId, isAdmin: auth.isAdmin, isOwner });

  // Sidebar is now a single, canonical component (AdminSidebar). Inline nav
  // arrays are forbidden in /admin pages — see web/lib/navigation.ts header.
  const badgeCounts: Record<string, number> = {
    '/admin/notifications': unreadCount,
    '/admin/feedback': feedbackCount,
  };

  // Sidebar upgrade prompt for free users (desktop only)
  const SidebarUpgradeCard = () => {
    if (subscription?.planId && subscription.planId !== 'free') return null;
    return (
      <div className="px-3 py-4 border-t border-[var(--border)]">
        <div className="rounded-xl bg-gradient-to-br from-teal-500/10 to-violet-500/10 border border-teal-500/20 p-3">
          <p className="text-xs font-medium text-zinc-200 mb-1">Free plan</p>
          <p className="text-[10px] text-zinc-500 mb-2.5 leading-relaxed">Unlock unlimited scripts, all personas, and priority generation.</p>
          <Link href="/upgrade" className="block text-center text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg py-1.5 transition-colors">
            Upgrade
          </Link>
        </div>
      </div>
    );
  };

  return (
    <GuidedModeProvider>
    <ThemeProvider>
    <ToastProvider>
    <UpgradeModalProvider>
    <AriaLiveProvider>
    <SkipLink />
    <OfflineIndicator />
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">

      {/* Single unified sidebar — desktop pane + mobile drawer in one component. */}
      <AdminSidebar
        isAdmin={auth.isAdmin}
        isOwner={isOwner}
        planId={subscription?.planId}
        unreadNotifications={unreadCount}
        badgeCounts={badgeCounts}
        desktopFooter={<SidebarUpgradeCard />}
        hideMobileHamburger
      />

      {/* ============================================================
          MOBILE LAYOUT - Only rendered when isMobile is true
          ============================================================ */}
      {isMobile && (
        <>
          {/* Mobile Header — extracted into AdminMobileHeader (2026-05-02). */}
          <AdminMobileHeader
            userEmail={auth.userEmail}
            onUserMenuOpen={() => setUserMenuOpen(true)}
            rightSlot={<CreditsBadge compact />}
          />

          {/* Mobile sidebar drawer is owned by <AdminSidebar /> below. */}

          {/* Mobile User Menu - Larger touch targets */}
          {userMenuOpen && (
            <div className="fixed inset-0 z-50" role="dialog" aria-label="User menu">
              <div className="absolute inset-0 bg-black/80" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute bottom-0 left-0 right-0 bg-[var(--surface)] rounded-t-3xl p-6 pb-12 safe-bottom">
                <div className="w-14 h-1.5 bg-[var(--surface2)] rounded-full mx-auto mb-6" />

                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[var(--border)]">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-teal-500 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
                    {auth.userEmail?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-medium text-[var(--text)] truncate">{auth.userEmail}</p>
                    <p className="text-[17px] text-[var(--text-muted)]">{subscription?.planName || 'Free'} Plan</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Link
                    href="/admin/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-4 px-5 py-5 text-[17px] text-[var(--text-muted)] hover:bg-[var(--surface2)] rounded-xl transition-colors min-h-[56px]"
                  >
                    <User className="w-7 h-7" />
                    Account Settings
                  </Link>
                  <Link
                    href="/admin/billing"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-4 px-5 py-5 text-[17px] text-[var(--text-muted)] hover:bg-[var(--surface2)] rounded-xl transition-colors min-h-[56px]"
                  >
                    <Zap className="w-7 h-7" />
                    Upgrade Plan
                  </Link>
                  <button type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-4 w-full px-5 py-5 text-[17px] text-red-400 hover:bg-[var(--surface2)] rounded-xl transition-colors min-h-[56px]"
                  >
                    <LogOut className="w-7 h-7" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Customize Mobile Nav Modal */}
          {customizeNavOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] max-w-md w-full max-h-[80vh] overflow-y-auto">
                <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] p-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[var(--text)]">Customize Bottom Nav</h3>
                  <button
                    onClick={() => setCustomizeNavOpen(false)}
                    className="p-2 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4">
                  <p className="text-sm text-zinc-400 mb-4">
                    Home and Menu are fixed. Select 3 items for the middle slots.
                  </p>
                  <p className="text-xs text-zinc-500 mb-4">
                    Changes are saved automatically to your browser.
                  </p>
                  <div className="bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-400">
                    <p>To customize, edit localStorage key:</p>
                    <code className="block mt-2 text-teal-400 font-mono">flashflow_bottom_nav</code>
                    <p className="mt-2">Example value (3 item IDs):</p>
                    <code className="block mt-1 text-teal-400 font-mono break-all">
                      ["content-studio", "transcribe", "script-library"]
                    </code>
                    <p className="mt-2">Available IDs:</p>
                    <code className="block mt-1 text-teal-400 font-mono text-[10px] break-all">
                      content-studio, transcribe, script-library, pipeline, calendar, winners, analytics, brands
                    </code>
                  </div>
                </div>
                <div className="sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border)] p-4">
                  <button
                    onClick={() => setCustomizeNavOpen(false)}
                    className="w-full py-3 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Main Content - FULL WIDTH with padding for header and bottom nav */}
          <main id="main-content" className="pt-16 pb-[calc(80px+env(safe-area-inset-bottom,0px))] min-h-[100dvh] overflow-x-hidden">
            <GuidedModeBanner />
            <div className="max-w-full">
              <AdvancedWorkspaceBridge />
              <Link
                href="/create"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] mb-3 px-4 no-underline"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to FlashFlow
              </Link>
              <LowCreditBanner className="mb-4" />
              <ReferralPromptBanner />
              <div className="px-4"><FirstWinBanner /></div>
              <ErrorBoundary>{children}</ErrorBoundary>
            </div>
          </main>
          <CreditMilestoneBanner />

          {/* Mobile Bottom Navigation */}
          <MobileBottomNav
            onMoreClick={() => setNavSheetOpen(true)}
            unreadCount={unreadCount}
          />

          {/* Mobile Nav Sheet (grouped accordion) */}
          <MobileNavSheet
            open={navSheetOpen}
            onClose={() => setNavSheetOpen(false)}
            navSections={navSections}
            pathname={pathname}
            isAdmin={auth.isAdmin}
          />

          {/* Development Test Checklist */}
          <MobileTestChecklist />

        </>
      )}

      {/* ============================================================
          DESKTOP LAYOUT - Only rendered when isMobile is false
          ============================================================ */}
      {!isMobile && (
        <>
          {/* Desktop Sidebar — unified canonical AdminSidebar (see web/lib/navigation.ts header). */}
          {/* Desktop Header */}
          <header className="fixed top-0 left-72 right-0 z-30 bg-[var(--bg)] border-b border-[var(--border)]">
            <div className="flex items-center justify-end px-6 h-16">
              <div className="flex items-center gap-4">
                {/* Search trigger */}
                <button
                  onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                  aria-label="Search (Cmd+K)"
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] rounded-lg transition-colors"
                >
                  <Search className="w-4 h-4" />
                  <span className="hidden xl:inline">Search...</span>
                  <kbd className="hidden xl:inline ml-2 px-1.5 py-0.5 text-[10px] bg-[var(--surface2)] border border-[var(--border)] rounded font-mono">⌘K</kbd>
                </button>
                <ThemeToggle />
                {auth.isAdmin && <ClawbotStatus compact />}
                <NotificationsBell />
                <CreditsBadge />

                {/* User menu */}
                <div className="relative">
                  <button type="button"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    aria-label="User menu"
                    aria-expanded={userMenuOpen}
                    className="flex items-center gap-2 px-3 py-2 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] rounded-lg transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-teal-500 flex items-center justify-center text-white text-sm font-bold">
                      {auth.userEmail?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <span className="text-sm max-w-[150px] truncate">{auth.userEmail}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  {userMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-56 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl py-2 z-50">
                        <div className="px-4 py-2 border-b border-[var(--border)]">
                          <p className="text-sm font-medium text-[var(--text)] truncate">{auth.userEmail}</p>
                          <p className="text-xs text-[var(--text-muted)]">{subscription?.planName || 'Free'} Plan</p>
                        </div>
                        <div className="py-1">
                          <Link
                            href="/admin/settings"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
                          >
                            <User className="w-4 h-4" />
                            Account Settings
                          </Link>
                          <Link
                            href="/admin/billing"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
                          >
                            <Zap className="w-4 h-4" />
                            Upgrade Plan
                          </Link>
                        </div>
                        <div className="border-t border-[var(--border)] pt-1">
                          <button type="button"
                            onClick={handleLogout}
                            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-[var(--surface2)] transition-colors"
                          >
                            <LogOut className="w-4 h-4" />
                            Logout
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Desktop Main Content - Offset by sidebar */}
          <main id="main-content" className="ml-72 pt-16 min-h-screen">
            <GuidedModeBanner />
            <div className="p-6">
              <AdvancedWorkspaceBridge />
              <Link
                href="/create"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] mb-4 no-underline"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to FlashFlow
              </Link>
              <LowCreditBanner className="mb-6" />
              <ReferralPromptBanner />
              <FirstWinBanner />
              <ErrorBoundary>{children}</ErrorBoundary>
            </div>
          </main>
          <CreditMilestoneBanner />
        </>
      )}

    </div>
    <MainOnboardingTour
      isMobile={isMobile}
      onOpenSidebar={() => window.dispatchEvent(new CustomEvent('flashflow:open-admin-sidebar'))}
    />
    <FeedbackWidget />
    <CommandPalette />
    <KeyboardShortcutsModal />
    <PlanDebugBanner />
    <UpgradeModal />
    </AriaLiveProvider>
    </UpgradeModalProvider>
    </ToastProvider>
    </ThemeProvider>
    </GuidedModeProvider>
  );
}

function AdvancedWorkspaceBridge() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem('ff_admin_bridge_seen') === '1');
    } catch {
      setDismissed(true);
    }
  }, []);

  if (dismissed !== false) return null;

  function handleDismiss() {
    try { localStorage.setItem('ff_admin_bridge_seen', '1'); } catch {}
    setDismissed(true);
  }

  return (
    <div className="mx-4 md:mx-0 mb-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-amber-400/15 border border-amber-400/30 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4 text-amber-300" />
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-semibold text-[var(--text)]">This is the advanced workspace</div>
        <p className="text-[var(--text-muted)] text-[12.5px] mt-0.5 leading-relaxed">
          Power tools for managing your whole pipeline. You can always return to the creator flow with <span className="text-zinc-200">Back to FlashFlow</span>.
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] rounded-md flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
