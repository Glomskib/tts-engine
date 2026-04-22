/**
 * Edit Builder — project list page.
 *
 * Server component: fetches the current user's edit_projects via the
 * shared server Supabase client and renders a simple card list.
 *
 * Phase 1 scope: list + "new project" button (POSTs to
 * /api/edit-builder/projects). Deliberately plain — no design system
 * components yet so it doesn't couple to the existing dashboard shell.
 */
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { EditProjectRow } from '@/lib/edit-builder/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EditBuilderIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: projects } = await supabase
    .from('edit_projects')
    .select('id,title,status,aspect_ratio,target_platform,created_at,updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (projects ?? []) as EditProjectRow[];

  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Edit Builder</h1>
        <form action="/api/edit-builder/projects" method="post">
          <button
            type="submit"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 6,
              background: '#111',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            New project
          </button>
        </form>
      </header>

      {rows.length === 0 ? (
        <p style={{ color: '#666' }}>No edit projects yet. Create your first one above.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                href={`/dashboard/edit-builder/${p.id}`}
                style={{
                  display: 'block',
                  padding: '1rem',
                  border: '1px solid #e5e5e5',
                  borderRadius: 8,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{p.title}</strong>
                  <span style={{ fontSize: 12, color: '#888' }}>{p.status}</span>
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                  {p.aspect_ratio} · {p.target_platform} · {new Date(p.created_at).toLocaleDateString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
