'use client';

/**
 * /admin/organization — manage the active organization (members, invites).
 *
 * Hidden in nav until ENABLE_MULTI_TENANCY is set, but the route exists
 * and is safe to visit even when the flag is off (single-member view).
 */
import { useEffect, useState } from 'react';
import { Mail, UserPlus, Shield, Trash2 } from 'lucide-react';

interface Member {
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  joined_at: string;
}

interface OrgInfo {
  id: string;
  name: string;
  type: 'creator' | 'brand' | 'agency';
  plan_tier: string;
  is_personal: boolean;
  multi_tenancy_enabled: boolean;
}

export default function OrgSettingsPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/orgs/current');
      const data = await r.json();
      if (r.ok) {
        setOrg(data.org);
        setMembers(data.members || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setBusy(true); setMessage(null);
    try {
      const r = await fetch('/api/orgs/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await r.json();
      if (r.ok) {
        setMessage({ kind: 'ok', text: `Invited ${inviteEmail.trim()}.` });
        setInviteEmail('');
        await load();
      } else {
        setMessage({ kind: 'err', text: data.error || `HTTP ${r.status}` });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(userId: string, role: Member['role']) {
    const r = await fetch('/api/orgs/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role }),
    });
    if (r.ok) await load();
  }

  async function handleRemove(userId: string) {
    if (!confirm('Remove this member?')) return;
    const r = await fetch('/api/orgs/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    if (r.ok) await load();
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-zinc-100">Organization</h1>
      {loading && <p className="text-zinc-500 mt-4">Loading…</p>}
      {!loading && org && (
        <>
          {!org.multi_tenancy_enabled && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
              Multi-tenancy is currently disabled (ENABLE_MULTI_TENANCY env flag).
              You can still view your personal workspace, but invites won&apos;t be
              activated until Brandon flips the flag.
            </div>
          )}

          <div className="mt-4 p-4 rounded-xl bg-zinc-900/60 border border-white/5">
            <div className="text-xs uppercase text-zinc-500 tracking-wider">Workspace</div>
            <div className="text-xl font-semibold text-zinc-100 mt-1">{org.name}</div>
            <div className="text-sm text-zinc-500 mt-1">
              {org.type} · {org.plan_tier} {org.is_personal && '· personal'}
            </div>
          </div>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-100 mb-3 flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Invite by email
            </h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-4 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'editor' | 'viewer')}
                className="px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                onClick={handleInvite}
                disabled={busy || !inviteEmail.trim()}
                className="px-5 py-2 rounded-lg bg-teal-500 text-white font-medium hover:bg-teal-400 disabled:opacity-50"
              >
                {busy ? 'Inviting…' : 'Invite'}
              </button>
            </div>
            {message && (
              <p className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
                {message.text}
              </p>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-100 mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5" /> Members
            </h2>
            <ul className="divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between p-3 bg-zinc-900/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <Mail className="w-4 h-4 text-zinc-500 shrink-0" />
                    <span className="text-sm text-zinc-100 truncate">{m.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.role !== 'owner' ? (
                      <>
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.user_id, e.target.value as Member['role'])}
                          className="px-2 py-1 rounded bg-zinc-900 border border-white/10 text-xs text-zinc-300"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRemove(m.user_id)}
                          className="p-1.5 rounded text-zinc-500 hover:text-red-400"
                          aria-label="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-xs">Owner</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
