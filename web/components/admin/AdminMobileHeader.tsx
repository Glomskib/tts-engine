'use client';

/**
 * AdminMobileHeader — sticky top bar for the /admin shell on mobile only.
 *
 * 2026-05-02: extracted from web/app/admin/layout.tsx as part of the Phase-1
 * nav unification (task #27). The previous inline header in admin/layout.tsx
 * is replaced by this component so the layout stays declarative and so any
 * /admin-flavoured surface that wants the same hamburger + brand + avatar
 * strip can drop it in without copy-pasting JSX.
 *
 * Surfaces:
 *   - Visible only <md (`md:hidden`).
 *   - Left: hamburger button -> dispatches `flashflow:open-admin-sidebar`
 *     window event so AdminSidebar's drawer opens (single source of truth).
 *   - Center/left-of-center: FlashFlow logo + brand name (linked to /admin).
 *   - Right: optional Credits badge slot + avatar button that opens the
 *     parent-owned user menu via `onUserMenuOpen`.
 *
 * Why the hamburger fires a custom event instead of accepting a prop:
 *   - Mirrors the existing pattern in web/app/admin/layout.tsx and the
 *     onboarding tour (`MainOnboardingTour.onOpenSidebar`). Keeps the drawer
 *     state isolated inside AdminSidebar — no prop drilling, no setState
 *     leaks across the layout tree.
 *
 * Constraints:
 *   - No new npm deps.
 *   - TypeScript strict.
 *   - Tailwind tokens only (var(--bg) / var(--border) / var(--surface2) /
 *     var(--text) / var(--text-muted) — same as the previous inline header).
 *   - Logo size + heights match the prior inline implementation exactly so
 *     the swap is a no-op visually.
 */

import { type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import { BRAND } from '@/lib/navigation';

export interface AdminMobileHeaderProps {
  /** User email — first letter shown as avatar fallback. */
  userEmail?: string | null;
  /** Called when the avatar is tapped (parent owns the user menu sheet). */
  onUserMenuOpen: () => void;
  /**
   * Optional right-side slot rendered between the credits area and the
   * avatar. Currently used for the CreditsBadge in the admin layout but
   * intentionally generic so callers can swap in any compact element.
   */
  rightSlot?: ReactNode;
  /**
   * Optional override for the hamburger handler. Defaults to dispatching
   * the `flashflow:open-admin-sidebar` window event, which AdminSidebar
   * listens for. Override only if you're hosting a custom drawer.
   */
  onMenuOpen?: () => void;
  /** Optional label override — defaults to BRAND.name. */
  title?: string;
}

const DEFAULT_OPEN_EVENT = 'flashflow:open-admin-sidebar';

export function AdminMobileHeader({
  userEmail,
  onUserMenuOpen,
  rightSlot,
  onMenuOpen,
  title,
}: AdminMobileHeaderProps) {
  const handleMenuOpen = () => {
    if (onMenuOpen) {
      onMenuOpen();
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(DEFAULT_OPEN_EVENT));
    }
  };

  return (
    <header
      className="
        fixed top-0 left-0 right-0 h-14 z-40
        bg-[var(--bg)] border-b border-[var(--border)]
        flex items-center justify-between px-3 gap-2
        md:hidden
      "
      aria-label="Admin top bar"
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={handleMenuOpen}
          className="
            flex h-10 w-10 items-center justify-center rounded-lg
            text-[var(--text-muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]
            transition-colors flex-shrink-0
          "
        >
          <Menu className="w-6 h-6" />
        </button>
        <Link
          href="/admin"
          className="flex items-center gap-2 flex-shrink-0 min-w-0"
          title="FlashFlow home"
        >
          <Image
            src={BRAND.logo}
            alt={BRAND.name}
            width={32}
            height={32}
            className="rounded-lg flex-shrink-0"
          />
          <span className="font-semibold text-base truncate">
            {title ?? BRAND.name}
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {rightSlot}
        <button
          type="button"
          onClick={onUserMenuOpen}
          aria-label="Open user menu"
          className="
            w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-500
            flex items-center justify-center text-white font-bold text-lg flex-shrink-0
          "
        >
          {userEmail?.charAt(0).toUpperCase() || 'U'}
        </button>
      </div>
    </header>
  );
}

export default AdminMobileHeader;
