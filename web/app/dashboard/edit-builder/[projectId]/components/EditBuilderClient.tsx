'use client';

/**
 * Client interactive shell for the Edit Builder project page.
 *
 * Handles:
 *   - clip upload (POST /api/edit-builder/projects/[id]/clips)
 *   - plan generation (POST /api/edit-builder/projects/[id]/plans)
 *   - render enqueue (POST /api/edit-builder/render)
 *   - render status polling (GET /api/edit-builder/projects/[id])
 *   - video preview player
 *
 * All state comes from props (server-rendered initial data) and is refreshed
 * via router.refresh() after mutations. Render status is polled with a simple
 * setInterval when there's an in_progress or queued job.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type {
  EditSourceClipRow,
  EditPlanRow,
  RenderJobRow,
} from '@/lib/edit-builder/types';

interface Props {
  projectId: string;
  clips: EditSourceClipRow[];
  plan: EditPlanRow | null;
  renders: RenderJobRow[];
}

const card: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  padding: '1rem',
  background: '#fff',
};

const btn: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  borderRadius: 6,
  background: '#111',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
};

const btnDisabled: React.CSSProperties = {
  ...btn,
  background: '#999',
  cursor: 'wait',
};

export default function EditBuilderClient({ projectId, clips, plan, renders }: Props) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [renderingReq, setRenderingReq] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Poll for render status changes when there are active jobs.
  const hasActiveRender = renders.some((r) => r.status === 'queued' || r.status === 'in_progress');
  useEffect(() => {
    if (!hasActiveRender) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [hasActiveRender, router]);

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/edit-builder/projects/${projectId}/clips`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }, [projectId, router]);

  const handleGeneratePlan = useCallback(async () => {
    setGeneratingPlan(true);
    setError(null);
    try {
      const res = await fetch(`/api/edit-builder/projects/${projectId}/plans`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Plan generation failed');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGeneratingPlan(false);
    }
  }, [projectId, router]);

  const handleRender = useCallback(async () => {
    setRenderingReq(true);
    setError(null);
    try {
      const res = await fetch('/api/edit-builder/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, kind: 'preview' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Render enqueue failed');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRenderingReq(false);
    }
  }, [projectId, router]);

  // Find best preview URL from completed renders.
  const latestCompleted = renders.find((r) => r.status === 'completed' && r.preview_url);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      {error && (
        <div style={{ gridColumn: '1 / -1', background: '#fee', color: '#c33', padding: '0.75rem', borderRadius: 6, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* A. Source Clips */}
      <section style={card}>
        <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Source Clips</h2>
        {clips.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
            {clips.map((c) => (
              <li key={c.id} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                {c.storage_path.split('/').pop()}
                <span style={{ color: '#888', marginLeft: 8 }}>
                  {c.duration_ms != null ? `${Math.round(c.duration_ms / 1000)}s` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm" style={{ fontSize: 13 }} />
          <button style={uploading ? btnDisabled : btn} onClick={handleUpload} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
        {clips.length === 0 && (
          <p style={{ color: '#888', fontSize: 12, marginTop: 8 }}>Upload at least one clip to get started.</p>
        )}
      </section>

      {/* B. AI Suggestions (placeholder) */}
      <section style={card}>
        <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>AI Suggestions</h2>
        <p style={{ color: '#888', fontSize: 13 }}>
          Hook candidates, dead-space removal, and variant suggestions will appear here in a future phase.
        </p>
      </section>

      {/* C. Edit Plan */}
      <section style={card}>
        <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Edit Plan</h2>
        {plan ? (
          <>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
              v{plan.version} · {plan.created_by_system ? 'system' : 'user-edited'} ·{' '}
              {plan.plan_json.segments.length} segment(s)
            </div>
            <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
              {plan.plan_json.segments.map((s, i) => (
                <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                  clip <code>{s.clipId.slice(0, 8)}…</code> · {s.startMs}–{s.endMs}ms
                  {s.emphasis ? ` · ${s.emphasis}` : ''}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p style={{ color: '#888', fontSize: 13 }}>
            {clips.length === 0 ? 'Upload clips first, then generate a plan.' : 'No plan yet.'}
          </p>
        )}
        <button
          style={clips.length === 0 || generatingPlan ? btnDisabled : { ...btn, marginTop: 12 }}
          onClick={handleGeneratePlan}
          disabled={clips.length === 0 || generatingPlan}
        >
          {generatingPlan ? 'Generating...' : plan ? 'Regenerate plan' : 'Generate plan'}
        </button>
      </section>

      {/* D. Style (placeholder) */}
      <section style={card}>
        <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Style</h2>
        <p style={{ color: '#888', fontSize: 13 }}>
          Caption preset, hook text, CTA text, music, duration target. Coming soon.
        </p>
      </section>

      {/* E. Render — full width */}
      <section style={{ ...card, gridColumn: '1 / -1' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Render</h2>
        {!plan ? (
          <p style={{ color: '#888', fontSize: 13 }}>Generate a plan first.</p>
        ) : (
          <button
            style={renderingReq ? btnDisabled : btn}
            onClick={handleRender}
            disabled={renderingReq}
          >
            {renderingReq ? 'Enqueuing...' : 'Render preview'}
          </button>
        )}

        {renders.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
            {renders.map((r) => (
              <li
                key={r.id}
                style={{
                  fontSize: 13,
                  padding: '6px 0',
                  borderBottom: '1px solid #f0f0f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  <code>{r.id.slice(0, 8)}</code> · {r.render_kind} ·{' '}
                  <strong
                    style={{
                      color: r.status === 'completed' ? '#0a7'
                        : r.status === 'failed' ? '#c33'
                        : r.status === 'in_progress' ? '#06c'
                        : '#888',
                    }}
                  >
                    {r.status}
                  </strong>
                  {r.progress > 0 && r.status === 'in_progress' ? ` · ${r.progress}%` : ''}
                </span>
                <span style={{ color: '#888' }}>
                  {r.error_message && (
                    <span title={r.error_message} style={{ color: '#c33', marginRight: 8 }}>error</span>
                  )}
                  {new Date(r.created_at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Video player for completed renders */}
        {latestCompleted && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Preview</h3>
            <video
              src={latestCompleted.preview_url!}
              controls
              playsInline
              style={{
                width: '100%',
                maxWidth: 360,
                borderRadius: 8,
                background: '#000',
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
