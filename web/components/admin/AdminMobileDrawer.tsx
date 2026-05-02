'use client';

/**
 * AdminMobileDrawer — slide-in mobile nav drawer for the /admin app shell.
 *
 * 2026-05-02: extracted as a thin standalone component per Phase-1 nav
 * unification brief. The drawer logic itself lives inside `AdminSidebar`
 * (which owns the desktop pane + mobile drawer in one render so they share
 * the same `getFilteredNavSections` call). This component is the ergonomic
 * surface other parts of the app reach for when they want to render the
 * drawer directly — e.g. an explicit `<AdminMobileDrawer />` in a layout —
 * without having to remember the implementation detail that AdminSidebar
 * already includes the drawer.
 *
 * Behaviour:
 *   - Opened by dispatching `flashflow:open-admin-sidebar` window event,
 *     OR by passing `open={true}` (controlled) and `onOpenChange`.
 *   - Backdrop click / swipe-left / Escape / route-change all dismiss it.
 *   - Reads from lib/navigation.ts via AdminSidebar (single source of truth).
 *   - No new npm deps (uses CSS keyframes baked into AdminSidebar).
 *
 * Usage (uncontrolled — recommended):
 *   <AdminMobileDrawer
 *     isAdmin={isAdmin} isOwner={isOwner} planId={planId}
 *     unreadNotifications={unreadCount} badgeCounts={badgeCounts}
 *   />
 *   // …elsewhere in your header:
 *   <button onClick={() => window.dispatchEvent(new CustomEvent('flashflow:open-admin-sidebar'))} />
 *
 * Why we re-export the AdminSidebar drawer instead of duplicating it:
 *   - The drawer + desktop sidebar share state (collapsed, sections, lock
 *     handling, route auto-dismiss). Splitting them caused 3 sidebars in
 *     April — the bug Brandon called out. One renderer = one source of
 *     truth.
 *   - Anything we add here MUST be a wrapper, never a re-implementation.
 */

import { AdminSidebar, type AdminSidebarProps } from './AdminSidebar';

export type AdminMobileDrawerProps = Omit<AdminSidebarProps, 'hideMobileHamburger'> & {
  /**
   * If true, the parent owns the hamburger button (e.g. AdminMobileHeader)
   * and AdminSidebar should not render its floating fallback hamburger.
   * Defaults to true — most callers wire this drawer next to a header.
   */
  hideBuiltInHamburger?: boolean;
};

/**
 * Renders the mobile drawer (and, on >=md, the desktop sidebar) by delegating
 * to the canonical AdminSidebar. Keep this component dumb — any new logic
 * belongs in AdminSidebar so the desktop pane stays in lockstep with the
 * drawer it shares state with.
 */
export function AdminMobileDrawer({
  hideBuiltInHamburger = true,
  ...rest
}: AdminMobileDrawerProps) {
  return <AdminSidebar {...rest} hideMobileHamburger={hideBuiltInHamburger} />;
}

export default AdminMobileDrawer;
