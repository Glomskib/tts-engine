/**
 * /admin/auth-debug — Auth Diagnostics Page
 *
 * Server-rendered. Shows current session state, role source, cookie names,
 * session expiry, host, and protocol. Admin-only. Safe to screenshot.
 */
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { isAdmin, getAdminRoleSource } from '@/lib/isAdmin';
import { SUPABASE_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options';

async function getAuthDiagnostics() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  // getSession returns the decoded session (not server-verified) — fine for debug info
  const { data: { session } } = await supabase.auth.getSession();

  const allCookies = cookieStore.getAll();
  const sbCookies = allCookies.filter((c) => c.name.startsWith('sb-')).map((c) => c.name);

  const host = headerStore.get('host') ?? 'unknown';
  const proto = headerStore.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  // Session expiry from the JWT
  const expiresAt = session?.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : null;
  const expiresIn = session?.expires_at
    ? Math.floor((session.expires_at * 1000 - Date.now()) / 1000)
    : null;

  return {
    authenticated: !!user,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    isAdminUser: isAdmin(user),
    roleSource: getAdminRoleSource(user),
    sbCookieNames: sbCookies,
    hasSbCookie: sbCookies.length > 0,
    sessionExpiresAt: expiresAt,
    sessionExpiresInSec: expiresIn,
    host,
    protocol: proto,
    nodeEnv: process.env.NODE_ENV,
    supabaseProjectRef: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/\/\/([^.]+)\./)?.[1] ?? 'unknown',
  };
}

function DiagRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  const cls = ok === true ? 'text-green-400' : ok === false ? 'text-red-400' : 'text-zinc-100';
  return (
    <tr className="border-b border-zinc-800 last:border-0">
      <td className="py-2 pr-8 text-zinc-400 text-sm font-medium whitespace-nowrap">{label}</td>
      <td className={`py-2 text-sm font-mono ${cls}`}>{value}</td>
    </tr>
  );
}

export default async function AuthDebugPage() {
  const d = await getAuthDiagnostics();

  if (!d.authenticated || !d.isAdminUser) {
    redirect('/login');
  }

  const expiryLabel = d.sessionExpiresInSec !== null
    ? `${d.sessionExpiresAt} (${d.sessionExpiresInSec > 0 ? `${Math.floor(d.sessionExpiresInSec / 60)}m remaining` : 'EXPIRED'})`
    : '—';

  const isHttpsOk = d.protocol === 'https' || d.host.startsWith('localhost');

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-1">Auth Diagnostics</h1>
      <p className="text-xs text-zinc-500 mb-6">
        Server-side session state for this request. Refresh to re-check.
        No tokens are exposed — safe to screenshot.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Session</p>
        <table className="w-full">
          <tbody>
            <DiagRow label="Authenticated" value={d.authenticated ? 'yes' : 'no'} ok={d.authenticated} />
            <DiagRow label="User ID" value={d.userId ?? '—'} />
            <DiagRow label="Email" value={d.email ?? '—'} />
            <DiagRow label="Is Admin" value={d.isAdminUser ? 'yes' : 'no'} ok={d.isAdminUser} />
            <DiagRow label="Role Source" value={d.roleSource} ok={d.roleSource !== 'none'} />
            <DiagRow
              label="Session Expiry"
              value={expiryLabel}
              ok={d.sessionExpiresInSec !== null && d.sessionExpiresInSec > 0}
            />
          </tbody>
        </table>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Cookies</p>
        <table className="w-full">
          <tbody>
            <DiagRow
              label="Supabase Cookie"
              value={d.hasSbCookie ? 'present' : 'MISSING'}
              ok={d.hasSbCookie}
            />
            <DiagRow label="Cookie Names" value={d.sbCookieNames.join(', ') || '—'} />
            <DiagRow label="Expected Prefix" value={`sb-${d.supabaseProjectRef}`} />
          </tbody>
        </table>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Request Context</p>
        <table className="w-full">
          <tbody>
            <DiagRow label="Host" value={d.host} />
            <DiagRow label="Protocol" value={d.protocol} ok={isHttpsOk} />
            <DiagRow label="Node Env" value={d.nodeEnv ?? 'unknown'} />
          </tbody>
        </table>
      </div>

      {!d.hasSbCookie && (
        <div className="mt-4 p-4 bg-red-950/50 border border-red-800 rounded-xl text-sm text-red-300">
          <strong>No Supabase cookie detected.</strong> This is why mobile auth fails.
          Check that the login flow sets cookies before navigating here.
        </div>
      )}
      {d.sessionExpiresInSec !== null && d.sessionExpiresInSec <= 0 && (
        <div className="mt-4 p-4 bg-yellow-950/50 border border-yellow-800 rounded-xl text-sm text-yellow-300">
          <strong>Session is expired.</strong> Refresh the session or log in again.
        </div>
      )}
    </div>
  );
}
