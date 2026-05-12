/**
 * /admin/content-studio — LEGACY (was 5,603 lines). Now redirects to /create.
 *
 * Replaced 2026-05-12. The god-page is gone. /create is the canonical
 * surface. Everything that was buried in tabs here lives at /create or
 * its sub-routes now.
 */
import { redirect } from 'next/navigation';

export default function LegacyContentStudioRedirect() {
  redirect('/create?from=legacy_content_studio');
}
