'use client';

/**
 * AdminSidebar — single source of truth for the /admin app shell sidebar.
 *
 * 2026-05-01: replaces three drift-prone inline sidebar implementations
 * (admin/layout.tsx desktop+mobile, AppSidebar.tsx, MobileNavSheet) for the
 * /admin surface. Reads sections from `web/lib/navigation.ts` — never inline.
 *
 * Surfaces:
 *   - Desktop expanded (default, 18rem wide)
 *   - Desktop collapsed (icon-only, 4rem wide)
 *   - Mobile hamburger -> drawer (slide-in left, blurred backdrop, focus trap,
 *     swipe-left or tap-outside to dismiss, auto-dismiss on route change)
 *
 * Per CLAUDE.md / Phase-1 brief:
 *   - No localStorage (server/SSR-safe).
 *   - No new npm deps.
 *   - TypeScript strict — no `any`.
 *   - Existing visual language: zinc palette, teal accents.
 *   - Section titles + tour IDs + badges + subtitles preserved verbatim.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  X,
  Menu,
  Lock,
  ChevronsLeft,
  ChevronsRight,
  Bell,
} from 'lucide-react';
import {
  getFilteredNavSections,
  isNavItemActive,
  BRAND,
  type NavItemResolved,
  type NavSectionResolved,
  type SubscriptionType,
} from '@/lib/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminSidebarProps {
  /** True when current user is an admin (sees Internal-badged items + ADMIN section). */
  isAdmin: boolean;
  /** True when current user is an owner (NEXT_PUBLIC_OWNER_EMAILS). */
  isOwner?: boolean;
  /** Resolved plan id (e.g. 'free', 'creator_pro', 'agency'). */
  planId?: string | null;
  /**
   * Subscription class — historically filtered the entire saas vs video_editing
   * surface. Kept for backwards-compat with `getFilteredNavSections`, but the
   * filter is now opt-in (default 'saas') so creator-side users on a
   * `video_editing` plan still see the unified creator nav.
   */
  subscriptionType?: SubscriptionType;
  /** Notifications badge count for the footer Bell. */
  unreadNotifications?: number;
  /** Optional per-href badge counts (e.g. /admin/feedback => 5 new). */
  badgeCounts?: Record<string, number>;
  /** Optional callback fired when any nav link is clicked (e.g. close mobile drawer in parent). */
  onNavigate?: () => void;
  /** Optional footer node (e.g. upgrade card) shown at the very bottom on desktop. */
  desktopFooter?: ReactNode;
  /**
   * If true, hide the built-in floating hamburger trigger. Useful when the
   * parent layout already supplies a header with its own hamburger button —
   * the parent should instead dispatch the `flashflow:open-admin-sidebar`
   * window event (or call AdminSidebar.open() in the future).
   */
  hideMobileHamburger?: boolean;
}

// ---------------------------------------------------------------------------
// Hook: useMediaQuery — SSR-safe, no localStorage.
// ---------------------------------------------------------------------------

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

// ---------------------------------------------------------------------------
// Item rendering
// ---------------------------------------------------------------------------

function BadgePill({ kind }: { kind: NonNullable<NavItemResolved['badge']> }) {
  const cls =
    kind === 'Beta'
      ? 'bg-amber-500/15 text-amber-400'
      : kind === 'New'
      ? 'bg-teal-500/15 text-teal-400'
      : 'bg-zinc-500/15 text-zinc-400';
  return (
    <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-medium rounded shrink-0 ${cls}`}>
      {kind}
    </span>
  );
}

interface NavLinkProps {
  item: NavItemResolved;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  badgeCount?: number;
  onLockedClick: (item: NavItemResolved) => void;
}

function NavLink({ item, active, collapsed, onClick, badgeCount, onLockedClick }: NavLinkProps) {
  const Icon = item.icon;

  if (item.locked) {
    return (
      <button
        type="button"
        onClick={() => onLockedClick(item)}
        title={
          collapsed
            ? `${item.name} — requires ${item.requiredPlanName ?? 'upgrade'}`
            : item.subtitle ?? `Requires ${item.requiredPlanName ?? 'upgrade'}`
        }
        aria-label={`${item.name} (locked — requires ${item.requiredPlanName ?? 'upgrade'})`}
        className={`group flex items-center gap-3 mx-2 rounded-lg px-3 py-2.5 text-left text-zinc-600 transition-colors hover:bg-white/[0.02] ${
          collapsed ? 'justify-center w-[calc(100%-16px)]' : 'w-[calc(100%-16px)]'
        }`}
      >
        <Icon size={18} className="opacity-50 shrink-0" />
        {!collapsed && (
          <>
            <span className="text-sm font-medium flex-1 truncate">{item.name}</span>
            <Lock size={14} className="opacity-40 shrink-0" />
          </>
        )}
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onClick}
      data-tour={item.tourId ?? undefined}
      title={collapsed ? item.name : item.subtitle ?? undefined}
      className={`flex items-center gap-3 mx-2 rounded-lg px-3 py-2.5 transition-colors ${
        collapsed ? 'justify-center' : ''
      } ${
        active
          ? 'bg-teal-500/15 text-teal-300'
          : 'text-zinc-400 hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon
        size={18}
        className={`shrink-0 ${active ? 'text-teal-300' : ''}`}
      />
      {!collapsed && (
        <>
          <span className="text-sm font-medium truncate">{item.name}</span>
          {item.badge ? (
            <BadgePill kind={item.badge} />
          ) : badgeCount && badgeCount > 0 ? (
            <span className="ml-auto px-2 py-0.5 text-[10px] font-medium bg-red-500 text-white rounded-full shrink-0">
              {badgeCount}
            </span>
          ) : null}
        </>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Sidebar contents (shared between desktop pane + mobile drawer)
// ---------------------------------------------------------------------------

interface SidebarContentsProps {
  sections: NavSectionResolved[];
  pathname: string;
  collapsed: boolean;
  badgeCounts?: Record<string, number>;
  onItemClick: () => void;
  onLockedClick: (item: NavItemResolved) => void;
  unreadNotifications?: number;
}

function SidebarContents({
  sections,
  pathname,
  collapsed,
  badgeCounts,
  onItemClick,
  onLockedClick,
  unreadNotifications,
}: SidebarContentsProps) {
  return (
    <>
      <nav
        aria-label="Main navigation"
        className="flex-1 overflow-y-auto py-4"
      >
        {sections.map((section) => (
          <div key={section.title} className="mb-6">
            {!collapsed && (
              <div className="px-4 mb-2 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                {section.title}
              </div>
            )}
            {collapsed && <div className="mx-3 mb-2 h-px bg-white/5" />}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={!item.locked && isNavItemActive(pathname, item.href)}
                  collapsed={collapsed}
                  onClick={onItemClick}
                  badgeCount={badgeCounts?.[item.href]}
                  onLockedClick={onLockedClick}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: Notifications */}
      <div className="border-t border-white/10 p-2">
        <Link
          href="/admin/notifications"
          onClick={onItemClick}
          title={collapsed ? 'Notifications' : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <Bell size={18} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="text-sm">Notifications</span>
              {unreadNotifications && unreadNotifications > 0 ? (
                <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white">
                  {unreadNotifications}
                </span>
              ) : null}
            </>
          )}
        </Link>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mobile drawer with focus trap + swipe-to-dismiss
// ---------------------------------------------------------------------------

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  // Body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus trap (basic): focus first focusable on open, trap Tab within.
  useEffect(() => {
    if (!open) return;
    const root = panelRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable[0]?.focus();
  }, [open]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  // Swipe-left to dismiss
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartXRef.current;
    touchStartXRef.current = null;
    if (start === null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    if (start - end > 60) {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
      className="fixed inset-0 z-[60] md:hidden"
      onKeyDown={onKeyDown}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
      />

      {/* Drawer */}
      <div
        ref={panelRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="absolute inset-y-0 left-0 flex w-[85vw] max-w-[320px] translate-x-0 flex-col border-r border-white/10 bg-zinc-950 shadow-2xl transition-transform duration-200 ease-out animate-[slide-in-left_0.2s_ease-out]"
        style={{ animation: 'slide-in-left 200ms ease-out' }}
      >
        {children}
      </div>
      {/* Inline keyframes — keeps the animation self-contained without
          touching globals.css. */}
      <style jsx>{`
        @keyframes slide-in-left {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdminSidebar({
  isAdmin,
  isOwner = false,
  planId,
  subscriptionType = 'saas',
  unreadNotifications = 0,
  badgeCounts,
  onNavigate,
  desktopFooter,
  hideMobileHamburger = false,
}: AdminSidebarProps) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();

  const isMobile = useMediaQuery('(max-width: 767px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Auto-dismiss drawer when route changes (DO NOT touch on every render —
  // only when the pathname truly changes).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Imperative open via custom event — used by the onboarding tour
  // ("flashflow:open-admin-sidebar") so that the tour can surface the nav
  // without owning the drawer state itself.
  useEffect(() => {
    const onOpen = () => setDrawerOpen(true);
    window.addEventListener('flashflow:open-admin-sidebar', onOpen);
    return () => window.removeEventListener('flashflow:open-admin-sidebar', onOpen);
  }, []);

  const sections = getFilteredNavSections({
    planId,
    isAdmin,
    isOwner,
    subscriptionType,
  });

  const handleItemClick = useCallback(() => {
    onNavigate?.();
    if (isMobile) setDrawerOpen(false);
  }, [isMobile, onNavigate]);

  const handleLockedClick = useCallback(
    (item: NavItemResolved) => {
      router.push(`/admin/billing?required=${encodeURIComponent(item.minPlan ?? '')}`);
      if (isMobile) setDrawerOpen(false);
    },
    [isMobile, router],
  );

  const widthClass = collapsed ? 'w-16' : 'w-72';

  return (
    <>
      {/* ============================================================
          Mobile hamburger trigger (visible <md only) — opt-out via prop
          when the parent layout provides its own button that dispatches
          the `flashflow:open-admin-sidebar` window event.
          ============================================================ */}
      {!hideMobileHamburger && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls="admin-sidebar-drawer"
          className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-zinc-900/80 text-zinc-300 backdrop-blur md:hidden"
        >
          <Menu size={20} />
        </button>
      )}

      {/* ============================================================
          Desktop sidebar (visible md and up)
          ============================================================ */}
      <aside
        aria-label="Primary"
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:z-30 ${widthClass} border-r border-white/10 bg-zinc-950 transition-[width] duration-200`}
      >
        {/* Brand header */}
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-4">
          <Link
            href="/admin"
            onClick={handleItemClick}
            className={`flex items-center gap-2.5 text-zinc-100 no-underline ${
              collapsed ? 'justify-center w-full' : ''
            }`}
            title={BRAND.name}
          >
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={32}
              height={32}
              className="rounded-lg shrink-0"
            />
            {!collapsed && (
              <span className="font-semibold text-[15px] tracking-tight truncate">
                {BRAND.name}
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
            >
              <ChevronsLeft size={16} />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="mx-auto my-2 flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          >
            <ChevronsRight size={16} />
          </button>
        )}

        <SidebarContents
          sections={sections}
          pathname={pathname}
          collapsed={collapsed}
          badgeCounts={badgeCounts}
          onItemClick={handleItemClick}
          onLockedClick={handleLockedClick}
          unreadNotifications={unreadNotifications}
        />
        {!collapsed && desktopFooter ? (
          <div className="border-t border-white/10">{desktopFooter}</div>
        ) : null}
      </aside>

      {/* ============================================================
          Mobile drawer (visible <md only, when opened)
          ============================================================ */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <Link
            href="/admin"
            onClick={handleItemClick}
            className="flex items-center gap-2.5 text-zinc-100 no-underline"
          >
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="font-semibold text-[15px] tracking-tight truncate">
              {BRAND.name}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <SidebarContents
          sections={sections}
          pathname={pathname}
          collapsed={false}
          badgeCounts={badgeCounts}
          onItemClick={handleItemClick}
          onLockedClick={handleLockedClick}
          unreadNotifications={unreadNotifications}
        />
      </MobileDrawer>
    </>
  );
}

export default AdminSidebar;
