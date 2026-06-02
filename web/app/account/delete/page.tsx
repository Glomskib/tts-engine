'use client';

/**
 * /account/delete — Danger Zone. GDPR / CCPA "Right to be Forgotten" trigger.
 *
 * UI shell for the /api/account/delete-everything endpoint. Intentional
 * friction: user must type the confirmation string. After deletion the
 * session is invalid and they're redirected to /.
 */
import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, ArrowLeft } from 'lucide-react';

const CONFIRM_STRING = 'DELETE EVERYTHING';

export default function DeleteAccountPage() {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message?: string; stats?: Record<string, unknown> } | null>(null);

  const matches = confirm === CONFIRM_STRING;

  const submit = async () => {
    if (!matches) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch('/api/account/delete-everything', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: CONFIRM_STRING }),
      });
      const j = await r.json();
      setResult(j);
      if (j.ok) {
        // Force a sign-out + redirect after a moment so they see the success
        setTimeout(() => { window.location.href = '/'; }, 3500);
      }
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-xl mx-auto px-4 py-10">
        <Link href="/account" className="text-sm text-gray-400 hover:text-white flex items-center gap-1 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to account
        </Link>

        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-7 h-7 text-red-500" />
          <h1 className="text-3xl font-bold">Delete everything</h1>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          This is the &ldquo;Right to be Forgotten&rdquo; flow. Permanent and irreversible. Read what happens before you do it.
        </p>

        {!result?.ok && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold mb-3 text-gray-200">What gets deleted:</h2>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>· Every source you&apos;ve uploaded (originals in storage)</li>
              <li>· Every video we&apos;ve made for you (rendered outputs)</li>
              <li>· Every brand voice profile you&apos;ve created</li>
              <li>· Your subscription record + remaining credits (no refund issued automatically — cancel first if you want a refund)</li>
              <li>· Your transcripts, analysis, hook scores, all derived data</li>
              <li>· Your login account itself</li>
            </ul>
            <h2 className="text-sm font-semibold mt-5 mb-2 text-gray-200">What we keep:</h2>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>· An anonymized record (hashed only — no PII) that a deletion happened. Required by law for our audit trail.</li>
            </ul>
            <h2 className="text-sm font-semibold mt-5 mb-2 text-red-400">What we can&apos;t do:</h2>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>· Undo this. There is no recovery. Make sure your videos are downloaded first if you want to keep any.</li>
            </ul>
          </div>
        )}

        {result?.ok ? (
          <div className="bg-green-950/40 border border-green-700 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-2">✓ Done</h2>
            <p className="text-sm text-gray-300 mb-3">{result.message || 'Your account and all data has been deleted.'}</p>
            <p className="text-xs text-gray-500">Redirecting you to the homepage in a few seconds.</p>
          </div>
        ) : result && !result.ok ? (
          <div className="bg-red-950/40 border border-red-700 rounded-xl p-5 mb-4">
            <h2 className="text-sm font-semibold mb-1">Couldn&apos;t finish</h2>
            <p className="text-sm text-red-200">{result.message || 'Something went wrong.'}</p>
            <p className="text-xs text-gray-400 mt-2">If this keeps happening, email miles@makingmilesmatter.com and we&apos;ll do it manually.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <div className="text-sm font-medium text-gray-200 mb-1">
                Type <code className="px-1.5 py-0.5 bg-gray-800 rounded text-xs">{CONFIRM_STRING}</code> to confirm:
              </div>
              <input
                type="text"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={CONFIRM_STRING}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-red-500 text-sm font-mono"
                disabled={busy}
              />
            </label>

            <button
              onClick={submit}
              disabled={!matches || busy}
              className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                matches && !busy
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-gray-800 cursor-not-allowed text-gray-500'
              }`}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              {busy ? 'Deleting everything…' : matches ? 'Delete my account permanently' : 'Type the confirmation string above'}
            </button>

            <Link href="/account" className="block text-center text-sm text-gray-400 hover:text-white">
              Take me back — I changed my mind
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
