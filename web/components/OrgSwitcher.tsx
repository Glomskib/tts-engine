'use client';

/**
 * OrgSwitcher — dropdown to flip between organizations.
 *
 * Hidden entirely when ENABLE_MULTI_TENANCY is off OR the user only has
 * one org (their personal one). Setting the active org writes to a cookie
 * read by `lib/auth/current-org.ts` on the server side.
 */
import { useEffect, useState } from 'react';
import { ChevronDown, Building, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface OrgSummary {
  id: string;
  name: string;
  type: 'creator' | 'brand' | 'agency';
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  is_personal: boolean;
}

interface OrgSwitcherProps {
  /** Pulled from public env on the client to avoid an extra round-trip. */
  multiTenancyEnabled: boolean;
}

export function OrgSwitcher({ multiTenancyEnabled }: OrgSwitcherProps) {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!multiTenancyEnabled) return;
    fetch('/api/orgs/me')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { orgs: OrgSummary[]; active_org_id: string }) => {
        setOrgs(data.orgs || []);
        setActiveId(data.active_org_id);
      })
      .catch(() => { /* hide on error */ });
  }, [multiTenancyEnabled]);

  if (!multiTenancyEnabled || orgs.length <= 1) {
    return null;
  }

  const active = orgs.find((o) => o.id === activeId) || orgs[0];

  async function handleSelect(orgId: string) {
    setOpen(false);
    if (orgId === activeId) return;
    const res = await fetch('/api/orgs/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    if (res.ok) {
      setActiveId(orgId);
      router.refresh();
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/60 border border-white/10 hover:border-white/20 transition-colors text-sm"
      >
        <Building className="w-4 h-4 text-zinc-400" />
        <span className="text-zinc-100 truncate max-w-[120px]">{active.name}</span>
        <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-64 rounded-lg bg-zinc-900 border border-white/10 shadow-2xl z-50 py-1">
          {orgs.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => handleSelect(o.id)}
              className={`w-full text-left px-3 py-2 hover:bg-white/5 flex items-start gap-2 ${
                o.id === activeId ? 'bg-teal-500/10' : ''
              }`}
            >
              <Building className="w-4 h-4 mt-0.5 text-zinc-500" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-100 truncate">{o.name}</div>
                <div className="text-xs text-zinc-500">
                  {o.type} · {o.role}
                  {o.is_personal && ' · personal'}
                </div>
              </div>
            </button>
          ))}
          <div className="border-t border-white/5 mt-1">
            <button
              type="button"
              onClick={() => { setOpen(false); router.push('/admin/organization'); }}
              className="w-full text-left px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Manage organizations
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
