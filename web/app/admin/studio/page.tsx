/**
 * /admin/studio — LEGACY. Now redirects to /create.
 *
 * Replaced 2026-05-12. The new /create page consolidates Studio, Editor,
 * Clipper, Video-Editing, and Content-Studio into one canonical surface.
 */
import { redirect } from 'next/navigation';

export default function LegacyStudioRedirect() {
  redirect('/create?from=legacy_studio');
}
