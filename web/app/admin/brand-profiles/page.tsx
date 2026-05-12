'use client';

/**
 * /admin/brand-profiles — manage per-user brand voice profiles.
 *
 * This is what the hook ranker reads to score clips through YOUR voice
 * instead of a generic curve. Each user can have multiple profiles
 * (one personal + one per brand collab/client they manage).
 *
 * Most important field: sample_posts — paste 3-5 real posts you've written.
 * The system learns cadence, vocabulary, and energy from those.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Loader2, AlertTriangle, ArrowLeft, Sparkles, Trash2 } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  tone_descriptor: string | null;
  sample_posts_json: string | null;
  style_notes: string | null;
  prohibited_phrases: string | null;
  preferred_phrases: string | null;
  brand_color: string | null;
  brand_font: string | null;
  active: boolean;
}

export default function BrandProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleText, setSampleText] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/create/brand-profiles', { cache: 'no-store' });
      const d = await r.json();
      if (d?.ok) setProfiles(d.profiles || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const openNew = () => {
    setEditing({
      id: '',
      name: '',
      tone_descriptor: '',
      sample_posts_json: null,
      style_notes: '',
      prohibited_phrases: '',
      preferred_phrases: '',
      brand_color: '',
      brand_font: '',
      active: true,
    });
    setSampleText('');
  };

  const openEdit = (p: Profile) => {
    setEditing(p);
    try {
      const samples = p.sample_posts_json ? JSON.parse(p.sample_posts_json) : [];
      setSampleText(Array.isArray(samples) ? samples.join('\n\n---\n\n') : '');
    } catch {
      setSampleText('');
    }
  };

  const save = useCallback(async () => {
    if (!editing) return;
    setError(null);
    if (!editing.name.trim()) { setError('Give it a name.'); return; }
    setBusy(true);
    try {
      const samples = sampleText
        .split(/\n\s*---\s*\n/g)
        .map((s) => s.trim())
        .filter(Boolean);
      const body = {
        name: editing.name,
        tone_descriptor: editing.tone_descriptor || null,
        prohibited_phrases: editing.prohibited_phrases || null,
        preferred_phrases: editing.preferred_phrases || null,
        style_notes: editing.style_notes || null,
        brand_color: editing.brand_color || null,
        brand_font: editing.brand_font || null,
        sample_posts: samples,
        active: editing.active,
      };
      const method = editing.id ? 'PATCH' : 'POST';
      const url = editing.id ? `/api/create/brand-profiles?id=${editing.id}` : '/api/create/brand-profiles';
      const r = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || 'Save failed.');
      } else {
        setEditing(null);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [editing, sampleText, refresh]);

  const seedBrandonDefault = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/create/brand-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'My Default Voice',
          tone_descriptor: 'Plain language. No jargon. Direct. Friend texting a friend, not a brand posting to a feed.',
          style_notes: 'Lead with a specific number or specific person. End with the ask. Keep it real.',
          prohibited_phrases: 'leverage, synergy, ecosystem, AI-powered, world-class, journey, passionate, deep dive, circle back, low-hanging fruit, game-changer, disrupt, paradigm',
          preferred_phrases: 'we, our, here\'s what, look —, basically, the point is, real talk',
          sample_posts: [
            'Paste a real post you have written here. The more posts you add, the better the hook ranker learns your voice.',
          ],
          active: true,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) setError(d.error || 'Could not seed default.');
      else await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  // ── EDIT MODE ───────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button
            onClick={() => setEditing(null)}
            className="text-sm text-gray-400 hover:text-white flex items-center gap-1 mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <h1 className="text-3xl font-bold mb-1">
            {editing.id ? 'Edit brand profile' : 'New brand profile'}
          </h1>
          <p className="text-sm text-gray-400 mb-6">
            The system reads this to score clips through YOUR voice instead of a generic curve.
          </p>

          {error && (
            <div className="mb-4 bg-red-950/40 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
            </div>
          )}

          <div className="space-y-4">
            <Field label="Name" hint="What you call this voice. E.g. 'My personal' or 'Client X — Acme Corp'.">
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500"
                placeholder="My personal"
              />
            </Field>

            <Field label="Tone descriptor" hint="One or two sentences describing how you sound.">
              <textarea
                value={editing.tone_descriptor || ''}
                onChange={(e) => setEditing({ ...editing, tone_descriptor: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500 resize-none"
                placeholder="Warm but not gushy. Direct. Friend texting a friend, not a brand posting to a feed."
              />
            </Field>

            <Field
              label="Sample posts"
              hint="Paste 3-5 real posts you've written. Separate each with --- on its own line. THIS IS THE MOST IMPORTANT FIELD."
            >
              <textarea
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500 resize-none text-sm font-mono"
                placeholder={'Post one — paste it raw\n\n---\n\nPost two\n\n---\n\nPost three'}
              />
            </Field>

            <Field label="Style notes" hint="Quick rules the system must follow.">
              <textarea
                value={editing.style_notes || ''}
                onChange={(e) => setEditing({ ...editing, style_notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500 resize-none"
                placeholder="Always lead with a specific number or person. End with the ask. Plain language only. No hype."
              />
            </Field>

            <Field label="Phrases to NEVER use" hint="The AI-y junk that signals 'this is a template.' Comma-separated.">
              <textarea
                value={editing.prohibited_phrases || ''}
                onChange={(e) => setEditing({ ...editing, prohibited_phrases: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500 resize-none text-sm"
                placeholder="leverage, synergy, ecosystem, journey, passionate, deep dive, circle back"
              />
            </Field>

            <Field label="Phrases you actually use" hint="Your real idioms, hooks, sign-offs.">
              <textarea
                value={editing.preferred_phrases || ''}
                onChange={(e) => setEditing({ ...editing, preferred_phrases: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500 resize-none text-sm"
                placeholder="we, our, real talk, here's what, look —, basically"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Brand color (hex)" hint="Optional. Drives caption color if set.">
                <input
                  type="text"
                  value={editing.brand_color || ''}
                  onChange={(e) => setEditing({ ...editing, brand_color: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500"
                  placeholder="#f59e0b"
                />
              </Field>
              <Field label="Brand font" hint="Optional. Used for custom caption font on Pro tier.">
                <input
                  type="text"
                  value={editing.brand_font || ''}
                  onChange={(e) => setEditing({ ...editing, brand_font: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-teal-500"
                  placeholder="Inter"
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              <span>Active (show in /create's Brand dropdown)</span>
            </label>
          </div>

          <div className="flex gap-2 mt-8">
            <button
              onClick={save}
              disabled={busy}
              className="flex-1 py-3 bg-teal-500 hover:bg-teal-600 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:bg-gray-700"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Save
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST MODE ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Sparkles className="w-7 h-7 text-teal-400" />
              Brand profiles
            </h1>
            <p className="text-sm text-gray-400 mt-1">Teach the system to sound like you, not like a generic AI.</p>
          </div>
          <div className="flex gap-2">
            {profiles.length === 0 && (
              <button
                onClick={seedBrandonDefault}
                disabled={busy}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium"
              >
                Seed a default
              </button>
            )}
            <button
              onClick={openNew}
              className="px-4 py-2 bg-teal-500 hover:bg-teal-600 rounded-lg text-sm font-medium flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> New
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-12 bg-gray-900 border border-gray-800 rounded-xl">
            <Sparkles className="w-10 h-10 mx-auto text-gray-600 mb-3" />
            <h2 className="text-lg font-semibold mb-1">No brand profiles yet</h2>
            <p className="text-sm text-gray-400 mb-4">
              Create your first one — even a rough draft beats no voice profile.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={seedBrandonDefault}
                disabled={busy}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium"
              >
                Seed a starter profile
              </button>
              <button
                onClick={openNew}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-600 rounded-lg text-sm font-medium flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> New
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => openEdit(p)}
                className="w-full text-left p-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{p.name}</div>
                  {p.active ? (
                    <span className="text-xs px-2 py-1 bg-teal-900/40 text-teal-300 rounded-full">Active</span>
                  ) : (
                    <span className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded-full">Off</span>
                  )}
                </div>
                {p.tone_descriptor && (
                  <div className="text-sm text-gray-400 mt-1 line-clamp-2">{p.tone_descriptor}</div>
                )}
              </button>
            ))}
          </div>
        )}

        <Link href="/create" className="block mt-6 text-sm text-teal-400 hover:text-teal-300">
          ← Back to /create
        </Link>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-200 mb-1">{label}</label>
      {hint && <div className="text-xs text-gray-500 mb-2">{hint}</div>}
      {children}
    </div>
  );
}
