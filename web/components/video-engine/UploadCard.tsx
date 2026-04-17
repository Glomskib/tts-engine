'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import WorkspaceSelector, {
  GoalSelector,
  workspaceToMode,
  type Workspace,
  type Goal,
} from './WorkspaceSelector';

// Matches the backend cap in app/api/creator/upload-urls/route.ts (MAX_FILE_BYTES).
const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_SIZE_LABEL = '2 GB';
const ALLOWED_EXT = ['mp4', 'mov', 'webm', 'avi'];

function formatBytes(n: number): string {
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  if (n >= MB) return `${Math.round(n / MB)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

type State = 'idle' | 'uploading' | 'creating' | 'error';

interface FriendlyError {
  title: string;
  hint?: string;
}

// Map raw backend/storage errors into plain-language messages. Anything we
// don't recognize falls back to a generic "something went wrong" so users
// never see stack traces or statusCode jargon.
function humanizeError(raw: string): FriendlyError {
  const msg = raw.toLowerCase();
  if (msg.includes('payload too large') || msg.includes('exceeded the maximum') || msg.includes('413')) {
    return {
      title: `This video is too large. The limit is ${MAX_SIZE_LABEL}.`,
      hint: 'Try a shorter clip, or compress the file and upload again.',
    };
  }
  if (msg.includes('unsupported') && msg.includes('type')) {
    return {
      title: 'That file type isn\u2019t supported.',
      hint: `Use MP4, MOV, WebM, or AVI and try again.`,
    };
  }
  if (msg.includes('network error') || msg.includes('failed to fetch')) {
    return {
      title: 'The upload lost its connection.',
      hint: 'Check your internet and try again.',
    };
  }
  if (msg.includes('payg_checkout_required')) {
    return {
      title: 'You\u2019re out of included uploads this month.',
      hint: 'Upgrade to keep going, or pay per upload.',
    };
  }
  if (msg.includes('plan_limit_uploads')) {
    return {
      title: 'You\u2019ve hit your monthly upload limit.',
      hint: 'Upgrade for more uploads this month.',
    };
  }
  if (msg.includes('plan_limit_duration')) {
    return {
      title: 'This video is longer than your plan allows.',
      hint: 'Try a shorter cut, or upgrade for longer sources.',
    };
  }
  if (msg.includes('unauthorized') || msg.includes('401')) {
    return {
      title: 'You\u2019re signed out.',
      hint: 'Sign back in and try the upload again.',
    };
  }
  return {
    title: 'Something went wrong with the upload.',
    hint: 'Give it another try in a moment.',
  };
}

export default function UploadCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [workspace, setWorkspace] = useState<Workspace>('creator');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [contextText, setContextText] = useState<string>('');
  const [showMore, setShowMore] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  function fail(raw: string) {
    console.error('[UploadCard] FAIL', { error: raw });
    setState('error');
    setError(humanizeError(raw));
  }

  function onPick(file: File) {
    console.log('[UploadCard] ONPICK_ENTER', { name: file.name, type: file.type, size: file.size, ext: file.name.split('.').pop()?.toLowerCase() });
    setError(null);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.includes(ext)) {
      console.warn('[UploadCard] ONPICK_REJECT_EXT', { ext, allowed: ALLOWED_EXT });
      setState('error');
      setError({
        title: 'That file type isn\u2019t supported.',
        hint: `Use MP4, MOV, WebM, or AVI.`,
      });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      console.warn('[UploadCard] ONPICK_REJECT_SIZE', { name: file.name, size: file.size, limit: MAX_SIZE_BYTES });
      setState('error');
      setError({
        title: `This file is ${formatBytes(file.size)}. The current limit is ${MAX_SIZE_LABEL}.`,
        hint: 'Choose a smaller export or compress the file before uploading.',
      });
      return;
    }
    console.log('[UploadCard] ONPICK_ACCEPTED', { name: file.name });

    setFilename(file.name);
    setState('uploading');
    setProgress(0);

    console.log('[UploadCard] DOUPLOAD_CALL');
    void doUpload(file);
  }

  async function doUpload(file: File) {
    try {
      console.log('[UploadCard] REQUEST_PRESIGN', { filename: file.name, size: file.size, type: file.type || 'video/mp4' });
      const presignRes = await fetch('/api/creator/upload-urls', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          files: [{ filename: file.name, content_type: file.type || 'video/mp4', size_bytes: file.size }],
          source_type: 'video_engine',
        }),
      });
      const presignJson = await presignRes.json();
      if (!presignRes.ok || !presignJson.ok) {
        throw new Error(presignJson?.error?.message || presignJson?.error || 'Failed to get upload URL');
      }
      const upload = presignJson.data.uploads[0];
      if (!upload?.signed_url) throw new Error('No signed URL returned');
      console.log('[UploadCard] PRESIGN_OK', { path: upload.path, signed_url_head: upload.signed_url.substring(0, 80) });

      await new Promise<void>((resolve, reject) => {
        const contentType = file.type || 'video/mp4';
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', upload.signed_url, true);
        xhr.setRequestHeader('content-type', contentType);
        xhr.setRequestHeader('x-upsert', 'true');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve();
          console.error('[UploadCard] PUT_FAIL', {
            status: xhr.status,
            statusText: xhr.statusText,
            body: xhr.responseText,
            response_headers: xhr.getAllResponseHeaders(),
            request: {
              url: upload.signed_url,
              method: 'PUT',
              content_type_sent: contentType,
              file_name: file.name,
              file_type: file.type,
              file_size: file.size,
            },
          });
          reject(new Error(`Upload failed (${xhr.status} ${xhr.statusText}): ${xhr.responseText || '<empty body>'}`));
        };
        xhr.onerror = () => {
          console.error('[UploadCard] PUT_NETERR', { url: upload.signed_url });
          reject(new Error('Network error during upload'));
        };
        console.log('[UploadCard] PUT_START', {
          path: upload.path,
          bytes: file.size,
          content_type: contentType,
          file_type_raw: file.type,
          signed_url: upload.signed_url,
        });
        xhr.send(file);
      });
      console.log('[UploadCard] PUT_OK', { path: upload.path });

      setState('creating');
      const mode = workspaceToMode(workspace);
      const context = parseContext(contextText, workspace, goal);
      console.log('[UploadCard] CREATE_RUN', { storage_path: upload.path, mode, workspace, goal });
      const runRes = await fetch('/api/video-engine/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          storage_path: upload.path,
          storage_url: upload.storage_url,
          filename: file.name,
          byte_size: file.size,
          mime_type: file.type || 'video/mp4',
          mode,
          workspace,
          goal,
          context,
        }),
      });
      const runJson = await runRes.json();
      if (!runRes.ok || !runJson.ok) {
        throw new Error(runJson?.error?.code || runJson?.error?.message || runJson?.error || 'Failed to create run');
      }
      console.log('[UploadCard] CREATE_RUN_OK', { run_id: runJson.data.run_id });

      router.push(`/video-engine/${runJson.data.run_id}`);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  function reset() {
    setState('idle');
    setError(null);
    setProgress(0);
    setFilename(null);
  }

  const busy = state === 'uploading' || state === 'creating';

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-zinc-100 mb-2">Who is this for?</label>
        <WorkspaceSelector value={workspace} onChange={setWorkspace} disabled={busy} />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-100 mb-2">
          What should this video do? <span className="text-zinc-500 font-normal text-xs">(optional)</span>
        </label>
        <GoalSelector value={goal} onChange={setGoal} disabled={busy} />
      </div>

      <DropZone
        busy={busy}
        progress={progress}
        state={state}
        filename={filename}
        onPick={onPick}
        inputRef={inputRef}
        maxSizeLabel={MAX_SIZE_LABEL}
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm"
        >
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-300" />
          <div className="flex-1 space-y-1">
            <div className="font-medium text-red-100">{error.title}</div>
            {error.hint && <div className="text-red-300/90 text-xs leading-relaxed">{error.hint}</div>}
          </div>
          {!busy && (
            <button
              type="button"
              onClick={reset}
              className="shrink-0 text-xs font-medium text-red-200 hover:text-red-50 underline underline-offset-2"
            >
              Try again
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
        aria-expanded={showMore}
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
        {showMore ? 'Hide details' : 'Add product or brand name (optional)'}
      </button>
      {showMore && (
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-1.5">
            {workspace === 'creator' ? 'Product or brand name' : 'Brand, campaign, or event'}
          </label>
          <input
            type="text"
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            disabled={busy}
            placeholder={workspace === 'creator' ? 'e.g. Acme Hydration Tabs' : 'e.g. Spring launch'}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-base sm:text-sm px-3 py-2.5 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Helps us write sharper captions. You can skip this.
          </p>
        </div>
      )}
    </div>
  );
}

function parseContext(text: string, workspace: Workspace, goal: Goal | null): Record<string, string> {
  const out: Record<string, string> = {};
  const trimmed = text.trim();
  if (trimmed) {
    if (workspace === 'creator') out.product_name = trimmed;
    else { out.event_name = trimmed; out.brand_name = trimmed; }
  }
  if (goal) out.goal = goal;
  return out;
}

function DropZone({
  busy, progress, state, filename, onPick, inputRef, maxSizeLabel,
}: {
  busy: boolean;
  progress: number;
  state: State;
  filename: string | null;
  onPick: (file: File) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  maxSizeLabel: string;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload a video"
      aria-disabled={busy}
      onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (busy) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
        else console.warn('[UploadCard] DROP_NO_FILE');
      }}
      onClick={() => {
        console.log('[UploadCard] CLICK_START', { busy, state, input_attached: !!inputRef.current });
        if (busy) {
          console.warn('[UploadCard] CLICK_IGNORED_BUSY', { state });
          return;
        }
        if (!inputRef.current) {
          console.error('[UploadCard] CLICK_NO_INPUT_REF');
          return;
        }
        inputRef.current.value = '';
        inputRef.current.click();
        console.log('[UploadCard] INPUT_CLICKED');
      }}
      onKeyDown={(e) => {
        if (busy) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (inputRef.current) inputRef.current.value = '';
          inputRef.current?.click();
        }
      }}
      className={[
        'rounded-2xl border-2 border-dashed px-5 py-10 sm:py-14 text-center transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2 focus:ring-offset-zinc-950',
        busy ? 'cursor-default opacity-95' : 'cursor-pointer',
        dragOver ? 'border-zinc-200 bg-zinc-900/60' : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500 hover:bg-zinc-900/40',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-msvideo"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            console.log('[UploadCard] FILE_SELECTED', { name: f.name, type: f.type, size: f.size });
            onPick(f);
          } else {
            console.warn('[UploadCard] FILE_SELECTED: none');
          }
        }}
      />

      {state === 'idle' && (
        <>
          <div className="mx-auto w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Upload className="w-6 h-6 text-zinc-300" />
          </div>
          <p className="mt-4 text-zinc-50 font-semibold text-base sm:text-lg">Tap to upload a video</p>
          <p className="mt-1.5 text-xs sm:text-sm text-zinc-500">
            Or drop a file here. MP4, MOV, WebM, AVI &middot; up to {maxSizeLabel}
          </p>
          <p className="mt-1 text-[11px] text-zinc-600">
            Full creator exports welcome. Bigger files take longer to upload &mdash; processing keeps going after the upload finishes.
          </p>
        </>
      )}

      {state === 'uploading' && (
        <>
          <Loader2 className="w-8 h-8 mx-auto text-zinc-200 animate-spin" />
          <p className="mt-3 text-zinc-100 font-medium truncate max-w-[90%] mx-auto">
            Uploading {filename}
          </p>
          <div className="mt-3 mx-auto w-full max-w-sm h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-zinc-100 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-zinc-400">{progress}%</p>
          <p className="mt-2 text-[11px] text-zinc-500">
            Large files take a few minutes. Processing continues after the upload finishes.
          </p>
        </>
      )}

      {state === 'creating' && (
        <>
          <Loader2 className="w-8 h-8 mx-auto text-zinc-200 animate-spin" />
          <p className="mt-3 text-zinc-100 font-medium">Getting things ready&hellip;</p>
          <p className="mt-1 text-xs text-zinc-500">This only takes a moment.</p>
        </>
      )}

      {state === 'error' && (
        <>
          <div className="mx-auto w-14 h-14 rounded-full bg-red-950/40 border border-red-900/50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-300" />
          </div>
          <p className="mt-4 text-zinc-100 font-semibold">Upload didn&rsquo;t go through</p>
          <p className="mt-1.5 text-xs sm:text-sm text-zinc-400">Tap here to pick another video.</p>
        </>
      )}
    </div>
  );
}
