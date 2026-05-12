/**
 * /admin/clipper — LEGACY. Now redirects to /create.
 *
 * Consolidated into /create on 2026-05-12. The "Clipper" mode is now picked
 * via vibe + clip_count on the new page.
 */
import { redirect } from 'next/navigation';

export default function LegacyClipperRedirect() {
  redirect('/create?from=legacy_clipper');
}
