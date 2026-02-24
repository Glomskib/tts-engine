import { requireClientAuth } from '@/lib/marketplace/auth';
import { ClientLayoutShell } from './ClientLayoutShell';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireClientAuth();

  if (auth === 'not-provisioned') {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">Account Not Provisioned</h1>
          <p className="text-zinc-400 mb-6">
            Your account has not been set up for the editing marketplace yet.
            Please contact your administrator to provision your account.
          </p>
          <p className="text-xs text-zinc-600">
            Admins: run <code className="bg-zinc-800 px-1.5 py-0.5 rounded">npx tsx scripts/mp-bootstrap.ts</code> to set up a client.
          </p>
        </div>
      </div>
    );
  }

  return <ClientLayoutShell auth={auth}>{children}</ClientLayoutShell>;
}
