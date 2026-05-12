/**
 * /admin/video-editing — LEGACY. Now redirects to /create.
 *
 * Replaced 2026-05-12. All video-editing workflows now happen on /create
 * with the consolidated record/upload/link entry + describe + vibe pipeline.
 */
import { redirect } from 'next/navigation';

export default function LegacyVideoEditingRedirect() {
  redirect('/create?from=legacy_video_editing');
}
