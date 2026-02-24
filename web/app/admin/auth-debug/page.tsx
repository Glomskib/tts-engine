/**
 * /admin/auth-debug — Auth Diagnostics Page
 *
 * Shows the current session state, role source, cookie presence, and
 * host/protocol. Admin-only. Useful for verifying mobile session health.
 */
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { isAdmin, getAdminRoleSource } from '@/lib/isAdmin';

async function getAuthDiagnostics() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const allCookies = cookieStore.getAll();
  const sbCookies = allCookies.filter((c) => c.name.startsWith('sb-')).map((c) => c.name);
  const hasSbCookie = sbCookies.length > 0;

  const host = headerStore.get('host') ?? 'unknown';
  const protocol = headerStore.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  return {
    authenticated: !!user,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    isAdminUser: isAdmin(user),
    roleSource: getAdminRoleSource(user),
    hasSbCookie,
    sbCookieNames: sbCookies,
    host,
    protocol,
    nodeEnv: process.env.NODE_ENV,
  };
}

function DiagRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <tr className="border-b border-zinc-800">
      <td className="py-2 pr-6 text-zinc-400 text-sm font-medium whitespace-nowrap">{label}</td>
      <td className={`py-2 text-sm font-mono ${ok === true ? 'text-green-400' : ok === false ? 'text-red-400' : 'text-zinc-100'}`}>
        {value}
      </td>
    </tr>
  );
}

export default async function AuthDebugPage() {
  const diag = await getAuthDiagnostics();

  // Gate: admin only
  if (!diag.authenticated || !diag.isAdminUser) {
    redirect('/login');
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-1">Auth Diagnostics</h1>
      <p className="text-xs text-zinc-500 mb-6">Server-side session state for this request. Refresh to re-check.</p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <table className="w-full">
          <tbody>
            <DiagRow label="Authenticated" value={diag.authenticated ? 'yes' : 'no'} ok={diag.authenticated} />
            <DiagRow label="User ID" value={diag.userId ?? '—'} />
            <DiagRow label="Email" value={diag.email ?? '—'} />
            <DiagRow label="Is Admin" value={diag.isAdminUser ? 'yes' : 'no'} ok={diag.isAdminUser} />
            <DiagRow label="Role Source" value={diag.roleSource} ok={diag.roleSource !== 'none'} />
            <DiagRow label="Supabase Cookie" value={diag.hasSbCookie ? 'present' : 'MISSING'} ok={diag.hasSbCookie} />
            <DiagRow label="Cookie Names" value={diag.sbCookieNames.join(', ') || '—'} />
            <DiagRow label="Host" value={diag.host} />
            <DiagRow label="Protocol" value={diag.protocol} ok={diag.protocol === 'https'} />
            <DiagRow label="Node Env" value={diag.nodeEnv ?? 'unknown'} />
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11px] text-zinc-600">
        This page is safe to share in screenshots — no tokens are displayed.
      </p>
    </div>
  );
}
