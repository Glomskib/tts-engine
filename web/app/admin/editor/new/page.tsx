'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AdminPageLayout from '../../components/AdminPageLayout';
import { Upload, ArrowLeft, Zap, Target, ShoppingBag, Mic } from 'lucide-react';

type Mode = 'quick' | 'hook' | 'ugc' | 'talking_head';

const MODES: { id: Mode; name: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'quick', name: 'Quick Edit', desc: 'Trim long silences. Straight cut concat. No captions.', icon: Zap },
  { id: 'hook', name: 'Hook-Focused', desc: 'Big yellow hook caption in first 3s, jump cuts, burned captions.', icon: Target },
  { id: 'ugc', name: 'UGC Product', desc: 'Silence trim + captions + product overlay + soft music bed.', icon: ShoppingBag },
  { id: 'talking_head', name: 'Talking Head Clean', desc: 'Aggressive silence trim + burned captions. No music.', icon: Mic },
];

export default function NewEditJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetJobId = searchParams.get('job');

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<Mode>('quick');
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [brollFiles, setBrollFiles] = useState<File[]>([]);
  const [productFile, setProductFile] = useState<File | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (rawFiles.length === 0) { setStatus('Please upload at least one raw footage file.'); return; }
    setSubmitting(true);
    setStatus('Creating job…');
    try {
      let jobId = presetJobId;
      if (!jobId) {
        const createRes = await fetch('/api/editor/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title || 'Untitled Edit', mode }),
        });
        if (!createRes.ok) throw new Error('Failed to create job');
        const j = await createRes.json();
        jobId = j.job.id;
      }

      setStatus('Uploading files…');
      const uploads: Array<{ kind: string; file: File }> = [
        ...rawFiles.map((f) => ({ kind: 'raw', file: f })),
        ...brollFiles.map((f) => ({ kind: 'broll', file: f })),
      ];
      if (productFile) uploads.push({ kind: 'product', file: productFile });
      if (musicFile) uploads.push({ kind: 'music', file: musicFile });

      for (const u of uploads) {
        const fd = new FormData();
        fd.append('file', u.file);
        fd.append('kind', u.kind);
        const r = await fetch(`/api/editor/jobs/${jobId}/upload`, { method: 'POST', body: fd });
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`Upload failed (${u.file.name}): ${txt}`);
        }
      }

      setStatus('Starting pipeline…');
      // Fire start and immediately navigate to detail page for polling.
      fetch(`/api/editor/jobs/${jobId}/start`, { method: 'POST' }).catch(() => {});
      router.push(`/admin/editor/${jobId}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
      setSubmitting(false);
    }
  }

  return (
    <AdminPageLayout title="New AI Edit" subtitle="Upload raw footage and pick an edit mode.">
      <div className="mb-4">
        <Link href="/admin/editor" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="w-4 h-4" /> Back to jobs
        </Link>
      </div>

      <div className="space-y-6 max-w-3xl">
        <div>
          <label className="block text-sm text-zinc-300 mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Edit"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100"
          />
        </div>

        <FileInput
          label="Raw footage (required, .mp4/.mov)"
          multiple
          accept="video/*"
          files={rawFiles}
          onChange={setRawFiles}
        />

        <FileInput
          label="B-roll (optional)"
          multiple
          accept="video/*,image/*"
          files={brollFiles}
          onChange={setBrollFiles}
        />

        <SingleFileInput
          label="Product image (optional — used by UGC mode)"
          accept="image/*"
          file={productFile}
          onChange={setProductFile}
        />

        <SingleFileInput
          label="Music bed (optional — used by UGC mode)"
          accept="audio/*"
          file={musicFile}
          onChange={setMusicFile}
        />

        <div>
          <label className="block text-sm text-zinc-300 mb-2">Edit Mode</label>
          <div className="grid sm:grid-cols-2 gap-3">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`text-left rounded-lg border p-4 transition ${active ? 'border-teal-500 bg-teal-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-teal-400" />
                    <div className="font-medium text-zinc-100">{m.name}</div>
                  </div>
                  <div className="text-xs text-zinc-400">{m.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || rawFiles.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-5 py-2.5 text-sm font-medium text-white"
          >
            <Upload className="w-4 h-4" />
            Start Edit
          </button>
          {status && <span className="text-xs text-zinc-400">{status}</span>}
        </div>
      </div>
    </AdminPageLayout>
  );
}

function FileInput({
  label, multiple, accept, files, onChange,
}: { label: string; multiple?: boolean; accept?: string; files: File[]; onChange: (f: File[]) => void }) {
  return (
    <div>
      <label className="block text-sm text-zinc-300 mb-1">{label}</label>
      <input
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={(e) => onChange(Array.from(e.target.files ?? []))}
        className="block w-full text-sm text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700"
      />
      {files.length > 0 && (
        <div className="mt-1 text-xs text-zinc-500">{files.map((f) => f.name).join(', ')}</div>
      )}
    </div>
  );
}

function SingleFileInput({
  label, accept, file, onChange,
}: { label: string; accept?: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div>
      <label className="block text-sm text-zinc-300 mb-1">{label}</label>
      <input
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700"
      />
      {file && <div className="mt-1 text-xs text-zinc-500">{file.name}</div>}
    </div>
  );
}
