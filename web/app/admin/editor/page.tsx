/**
 * /admin/editor — LEGACY. Now redirects to /create.
 *
 * Replaced 2026-05-12 by the canonical /create page which consolidates the
 * five legacy editor surfaces (editor, clipper, studio, video-editing,
 * content-studio) into one. Anything that links here lands on the new tool
 * with the same intent.
 */
import { redirect } from 'next/navigation';

export default function LegacyEditorRedirect() {
  redirect('/create?from=legacy_editor');
}
