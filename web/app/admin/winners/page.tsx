import { redirect } from 'next/navigation';

// Phase 2: /admin/winners consolidated into /admin/winners-bank as the
// canonical Winners Bank user-facing page. This file is intentionally a
// thin redirect — the previous full implementation has been retired.
// Sub-routes (/admin/winners/import, /admin/winners/patterns) are unaffected.
export default function WinnersRedirectPage() {
  redirect('/admin/winners-bank');
}
