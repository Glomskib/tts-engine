import { requireVaAuth } from '@/lib/marketplace/auth';
import { VaLayoutShell } from './VaLayoutShell';

export default async function VaLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireVaAuth();

  if (auth === 'not-provisioned') {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">Account Not Provisioned</h1>
          <p className="text-zinc-400 mb-6">
            Your account has not been set up as a VA editor.
            Please contact your administrator to provision your account.
          </p>
          <p className="text-xs text-zinc-600">
            Admins: run <code className="bg-zinc-800 px-1.5 py-0.5 rounded">npx tsx scripts/mp-bootstrap.ts</code> to set up a VA.
          </p>
        </div>
      </div>
    );
  }

  return <VaLayoutShell auth={auth}>{children}</VaLayoutShell>;
}
