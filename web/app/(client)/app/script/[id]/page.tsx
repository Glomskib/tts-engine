'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, ExternalLink, Film, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { MpScript, ScriptAsset } from '@/lib/marketplace/types';
import { SCRIPT_STATUS_LABELS, SCRIPT_STATUS_COLORS } from '@/lib/marketplace/types';

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function ScriptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [script, setScript] = useState<MpScript | null>(null);
  const [assets, setAssets] = useState<ScriptAsset[]>([]);
  const [brollPack, setBrollPack] = useState<{ notes: string | null; recommended_for: string | null; asset: { source_type: string; prompt: string | null } }[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [generatingBroll, setGeneratingBroll] = useState(false);
  const [form, setForm] = useState({ title: '', script_text: '', notes: '', broll_suggestions: '', keep_verbatim: '' });
  const [newAssetUrl, setNewAssetUrl] = useState('');
  const [newAssetType, setNewAssetType] = useState('raw_folder');
  const [urlError, setUrlError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/scripts/${id}`);
      const data = await res.json();
      if (data.script) {
        setScript(data.script);
        setAssets(data.assets || []);
        setForm({
          title: data.script.title || '',
          script_text: data.script.script_text || '',
          notes: data.script.notes || '',
          broll_suggestions: data.script.broll_suggestions || '',
          keep_verbatim: data.script.keep_verbatim || '',
        });
      }
      if (data.job_id) setJobId(data.job_id);
      if (data.broll_pack) setBrollPack(data.broll_pack);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/marketplace/scripts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setEditing(false);
      await fetchData();
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(action: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/marketplace/scripts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Action failed');
      }
      await fetchData();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAsset() {
    if (!newAssetUrl.trim()) return;
    if (!isValidUrl(newAssetUrl)) {
      setUrlError('Please enter a valid HTTPS URL');
      return;
    }
    setUrlError('');
    setSaving(true);
    try {
      await fetch(`/api/marketplace/scripts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_asset', asset_type: newAssetType, url: newAssetUrl, label: newAssetType }),
      });
      setNewAssetUrl('');
      await fetchData();
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateBroll() {
    setGeneratingBroll(true);
    try {
      const res = await fetch(`/api/marketplace/scripts/${id}/broll`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'B-roll generation failed');
      }
      await fetchData();
    } finally {
      setGeneratingBroll(false);
    }
  }

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading...</div>;
  if (!script) return <div className="text-red-400 text-sm py-12 text-center">Script not found</div>;

  const isDraft = script.status === 'draft';
  const isRecorded = script.status === 'recorded';
  const isReadyToRecord = script.status === 'ready_to_record';
  const rawAssets = assets.filter(a => a.asset_type === 'raw_folder' || a.asset_type === 'raw_video');
  const refAssets = assets.filter(a => a.asset_type === 'reference');
  const hasJob = ['queued', 'editing', 'in_review', 'changes_requested', 'approved', 'posted'].includes(script.status);

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => router.push('/app/pipeline')} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Pipeline
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{script.title}</h1>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-2 ${SCRIPT_STATUS_COLORS[script.status]}`}>
            {SCRIPT_STATUS_LABELS[script.status]}
          </span>
        </div>
        <div className="flex gap-2">
          {isDraft && !editing && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
          {isDraft && <Button size="sm" onClick={() => handleAction('mark_ready')} loading={saving}>Mark Ready to Record</Button>}
          {isReadyToRecord && <Button size="sm" onClick={() => handleAction('mark_recorded')} loading={saving}>Mark Recorded</Button>}
          {isRecorded && <Button size="sm" onClick={() => handleAction('queue_for_edit')} loading={saving} disabled={rawAssets.length === 0}>Queue for Editing</Button>}
          {script.status === 'approved' && <Button size="sm" onClick={() => handleAction('mark_posted')} loading={saving}>Mark Posted</Button>}
        </div>
      </div>

      <div className="grid gap-6">
        {/* Script Text */}
        <Card>
          <CardHeader><CardTitle>Script</CardTitle></CardHeader>
          <CardContent>
            {editing && isDraft ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Title</label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Script Text</label>
                  <textarea value={form.script_text} onChange={e => setForm(f => ({ ...f, script_text: e.target.value }))} rows={10} className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Keep Verbatim</label>
                  <textarea value={form.keep_verbatim} onChange={e => setForm(f => ({ ...f, keep_verbatim: e.target.value }))} rows={3} className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Notes for Editor</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={4} className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">B-roll Suggestions</label>
                  <textarea value={form.broll_suggestions} onChange={e => setForm(f => ({ ...f, broll_suggestions: e.target.value }))} rows={3} className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} loading={saving}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {script.script_text ? (
                  <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-mono leading-relaxed bg-zinc-800/50 rounded-lg p-4">
                    {script.script_text.split('\n').map((line, i) => (
                      <div key={i}><span className="text-zinc-600 select-none mr-4">{String(i + 1).padStart(3)}</span>{line}</div>
                    ))}
                  </pre>
                ) : <p className="text-zinc-500 text-sm italic">No script text yet</p>}
                {script.keep_verbatim && (
                  <div><h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Keep Verbatim</h4><p className="text-sm text-amber-300 bg-amber-900/20 rounded-lg p-3">{script.keep_verbatim}</p></div>
                )}
                {script.notes && (
                  <div><h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Notes</h4><p className="text-sm text-zinc-300">{script.notes}</p></div>
                )}
                {script.broll_suggestions && (
                  <div><h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-1">B-roll Suggestions</h4><p className="text-sm text-zinc-300">{script.broll_suggestions}</p></div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Raw Footage */}
        <Card>
          <CardHeader><CardTitle>Raw Footage</CardTitle></CardHeader>
          <CardContent>
            {rawAssets.length > 0 ? (
              <ul className="space-y-2">
                {rawAssets.map(a => (
                  <li key={a.id} className="flex items-center gap-3 text-sm">
                    <Film className="w-4 h-4 text-zinc-500" />
                    <span className="text-zinc-400">{a.label || a.asset_type}</span>
                    {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 flex items-center gap-1">Open <ExternalLink className="w-3 h-3" /></a>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-zinc-500 text-sm">No raw footage attached yet</p>}
            {(isRecorded || isReadyToRecord || isDraft) && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <select value={newAssetType} onChange={e => setNewAssetType(e.target.value)} className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="raw_folder">Drive Folder</option>
                    <option value="raw_video">Single Video</option>
                    <option value="reference">Reference</option>
                  </select>
                  <input type="url" placeholder="Paste HTTPS link..." value={newAssetUrl} onChange={e => { setNewAssetUrl(e.target.value); setUrlError(''); }}
                    className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  <Button size="sm" variant="secondary" onClick={handleAddAsset}><Plus className="w-4 h-4" /></Button>
                </div>
                {urlError && <p className="text-xs text-red-400">{urlError}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* References */}
        {refAssets.length > 0 && (
          <Card>
            <CardHeader><CardTitle>References</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {refAssets.map(a => (
                  <li key={a.id} className="flex items-center gap-3 text-sm">
                    <span className="text-zinc-400">{a.label || 'Reference'}</span>
                    {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 flex items-center gap-1">Open <ExternalLink className="w-3 h-3" /></a>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* B-roll Pack */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>B-roll Pack</CardTitle>
              {script.broll_suggestions && (
                <Button size="sm" variant="secondary" onClick={handleGenerateBroll} loading={generatingBroll}>
                  <Sparkles className="w-4 h-4 mr-1" /> Generate B-roll Pack
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {brollPack.length > 0 ? (
              <ul className="space-y-2">
                {brollPack.map((bl, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <Film className="w-4 h-4 text-purple-400" />
                    <span className="text-zinc-400">{bl.notes || bl.recommended_for || 'B-roll clip'}</span>
                    <span className="text-xs text-zinc-600">{bl.asset?.source_type}</span>
                    {bl.recommended_for && <span className="text-xs bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded">{bl.recommended_for}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-zinc-500 text-sm">No b-roll pack generated yet. Add b-roll suggestions and click Generate.</p>}
          </CardContent>
        </Card>

        {/* Job link */}
        {hasJob && jobId && (
          <Card>
            <CardHeader><CardTitle>Edit Job</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400 mb-3">This script has an active editing job.</p>
              <Button size="sm" variant="secondary" href={`/app/job/${jobId}`}>View Job Details</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
