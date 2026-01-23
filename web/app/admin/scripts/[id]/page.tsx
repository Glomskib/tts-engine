'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface ScriptJson {
  hook?: string;
  body?: string;
  cta?: string;
  bullets?: string[];
  on_screen_text?: string[];
  b_roll?: string[];
  pacing?: string;
  compliance_notes?: string;
  uploader_instructions?: string;
  product_tags?: string[];
  sections?: { name: string; content: string }[];
}

interface Script {
  id: string;
  title: string | null;
  concept_id: string | null;
  product_id: string | null;
  template_id: string | null;
  script_json: ScriptJson | null;
  script_text: string | null;
  spoken_script: string | null;
  caption: string | null;
  cta: string | null;
  status: string;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ScriptRewrite {
  id: string;
  script_id: string;
  rewrite_prompt: string;
  model: string;
  created_at: string;
}

export default function ScriptEditorPage() {
  const params = useParams();
  const router = useRouter();
  const scriptId = params.id as string;

  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [hook, setHook] = useState('');
  const [body, setBody] = useState('');
  const [cta, setCta] = useState('');
  const [bullets, setBullets] = useState('');
  const [onScreenText, setOnScreenText] = useState('');
  const [bRoll, setBRoll] = useState('');
  const [pacing, setPacing] = useState('');
  const [complianceNotes, setComplianceNotes] = useState('');
  const [uploaderInstructions, setUploaderInstructions] = useState('');
  const [productTags, setProductTags] = useState('');

  // Rewrite state
  const [showRewrite, setShowRewrite] = useState(false);
  const [rewritePrompt, setRewritePrompt] = useState('');
  const [productContext, setProductContext] = useState('');

  const checkAdminEnabled = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/enabled');
      const data = await res.json();
      setAdminEnabled(data.enabled === true);
    } catch {
      setAdminEnabled(false);
    }
  }, []);

  const fetchScript = useCallback(async () => {
    if (!scriptId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/scripts/${scriptId}`);
      const data = await res.json();

      if (data.ok && data.data) {
        const s = data.data as Script;
        setScript(s);
        setTitle(s.title || '');
        setStatus(s.status || 'DRAFT');

        // Populate from script_json if available, otherwise from legacy fields
        if (s.script_json) {
          setHook(s.script_json.hook || '');
          setBody(s.script_json.body || '');
          setCta(s.script_json.cta || '');
          setBullets(s.script_json.bullets?.join('\n') || '');
          setOnScreenText(s.script_json.on_screen_text?.join('\n') || '');
          setBRoll(s.script_json.b_roll?.join('\n') || '');
          setPacing(s.script_json.pacing || '');
          setComplianceNotes(s.script_json.compliance_notes || '');
          setUploaderInstructions(s.script_json.uploader_instructions || '');
          setProductTags(s.script_json.product_tags?.join(', ') || '');
        } else {
          setHook('');
          setBody(s.spoken_script || '');
          setCta(s.cta || '');
          setBullets('');
          setOnScreenText('');
          setBRoll('');
          setPacing('');
          setComplianceNotes('');
          setUploaderInstructions('');
          setProductTags('');
        }
        setError('');
      } else {
        setError(data.error || 'Failed to load script');
      }
    } catch (err) {
      setError('Failed to fetch script');
    } finally {
      setLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    checkAdminEnabled();
  }, [checkAdminEnabled]);

  useEffect(() => {
    if (adminEnabled === true) {
      fetchScript();
    }
  }, [adminEnabled, fetchScript]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const scriptJson: ScriptJson = {
        hook: hook.trim(),
        body: body.trim(),
        cta: cta.trim(),
        bullets: bullets.split('\n').map(b => b.trim()).filter(Boolean),
        on_screen_text: onScreenText.split('\n').map(t => t.trim()).filter(Boolean),
        b_roll: bRoll.split('\n').map(b => b.trim()).filter(Boolean),
        pacing: pacing.trim() || undefined,
        compliance_notes: complianceNotes.trim() || undefined,
        uploader_instructions: uploaderInstructions.trim() || undefined,
        product_tags: productTags.split(',').map(t => t.trim()).filter(Boolean),
      };

      const res = await fetch(`/api/scripts/${scriptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || null,
          status,
          script_json: scriptJson,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setSuccess('Script saved successfully');
        setScript(data.data);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to save script');
      }
    } catch (err) {
      setError('Failed to save script');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/scripts/${scriptId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (data.ok) {
        setSuccess('Script approved successfully');
        setScript(data.data);
        setStatus('APPROVED');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to approve script');
      }
    } catch (err) {
      setError('Failed to approve script');
    } finally {
      setApproving(false);
    }
  };

  const handleRewrite = async () => {
    if (!rewritePrompt.trim()) {
      setError('Please enter rewrite instructions');
      return;
    }

    setRewriting(true);
    setError('');
    setSuccess('');

    try {
      let parsedProductContext = null;
      if (productContext.trim()) {
        try {
          parsedProductContext = JSON.parse(productContext);
        } catch {
          // If not valid JSON, wrap as simple object
          parsedProductContext = { description: productContext.trim() };
        }
      }

      const res = await fetch(`/api/scripts/${scriptId}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewrite_prompt: rewritePrompt.trim(),
          product_context: parsedProductContext,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setSuccess(`Script rewritten successfully (v${data.data.version})`);
        setScript(data.data);

        // Update form with new values
        if (data.data.script_json) {
          setHook(data.data.script_json.hook || '');
          setBody(data.data.script_json.body || '');
          setCta(data.data.script_json.cta || '');
          setBullets(data.data.script_json.bullets?.join('\n') || '');
          setOnScreenText(data.data.script_json.on_screen_text?.join('\n') || '');
          setBRoll(data.data.script_json.b_roll?.join('\n') || '');
          setPacing(data.data.script_json.pacing || '');
          setComplianceNotes(data.data.script_json.compliance_notes || '');
          setUploaderInstructions(data.data.script_json.uploader_instructions || '');
          setProductTags(data.data.script_json.product_tags?.join(', ') || '');
        }

        setShowRewrite(false);
        setRewritePrompt('');
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError(data.error || 'Failed to rewrite script');
      }
    } catch (err) {
      setError('Failed to rewrite script');
    } finally {
      setRewriting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  if (adminEnabled === null) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (adminEnabled === false) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>404 - Not Found</h1>
        <p>This page is not available.</p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading script...</div>;
  }

  if (!script) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>Script Not Found</h1>
        <Link href="/admin/scripts" style={{ color: '#0066cc' }}>Back to Scripts Library</Link>
      </div>
    );
  }

  const inputStyle = { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '100%', marginBottom: '10px' };
  const textareaStyle = { ...inputStyle, minHeight: '100px', resize: 'vertical' as const, fontFamily: 'monospace' };
  const labelStyle = { display: 'block', marginBottom: '4px', fontWeight: 'bold' as const };
  const sectionStyle = { marginBottom: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' };
  const buttonStyle = { padding: '10px 20px', backgroundColor: '#0066cc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' };

  const statusColors: Record<string, { bg: string; text: string }> = {
    DRAFT: { bg: '#fff3cd', text: '#856404' },
    REVIEW: { bg: '#cce5ff', text: '#004085' },
    APPROVED: { bg: '#d4edda', text: '#155724' },
    ARCHIVED: { bg: '#e2e3e5', text: '#383d41' },
  };

  const statusStyle = statusColors[script.status] || statusColors.DRAFT;

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <Link href="/admin/scripts" style={{ padding: '8px 16px', marginRight: '10px', textDecoration: 'none', color: '#333', border: '1px solid #ccc', borderRadius: '4px', display: 'inline-block' }}>
          &larr; Back to Library
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Edit Script</h1>
        <span style={{ padding: '4px 12px', borderRadius: '4px', backgroundColor: statusStyle.bg, color: statusStyle.text, fontWeight: 'bold' }}>
          {script.status} (v{script.version})
        </span>
      </div>

      {/* Metadata */}
      <div style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
        <span>ID: <code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>{script.id}</code></span>
        <span style={{ marginLeft: '20px' }}>Created: {formatDate(script.created_at)}</span>
        <span style={{ marginLeft: '20px' }}>Updated: {formatDate(script.updated_at)}</span>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '20px', padding: '10px', backgroundColor: '#fee', borderRadius: '4px' }}>{error}</div>}
      {success && <div style={{ color: 'green', marginBottom: '20px', padding: '10px', backgroundColor: '#efe', borderRadius: '4px' }}>{success}</div>}

      <form onSubmit={handleSave}>
        {/* Basic Info */}
        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>Basic Information</h2>
          <div>
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              placeholder="Script title..."
            />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ ...inputStyle, width: 'auto' }}
            >
              <option value="DRAFT">DRAFT</option>
              <option value="REVIEW">REVIEW</option>
              <option value="APPROVED">APPROVED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>
        </section>

        {/* Script Content */}
        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>Script Content</h2>
          <div>
            <label style={labelStyle}>Hook</label>
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              style={textareaStyle}
              placeholder="Opening hook text..."
            />
          </div>
          <div>
            <label style={labelStyle}>Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ ...textareaStyle, minHeight: '150px' }}
              placeholder="Main body content..."
            />
          </div>
          <div>
            <label style={labelStyle}>Bullets (one per line)</label>
            <textarea
              value={bullets}
              onChange={(e) => setBullets(e.target.value)}
              style={textareaStyle}
              placeholder="Key point 1&#10;Key point 2&#10;Key point 3"
            />
          </div>
          <div>
            <label style={labelStyle}>Call to Action</label>
            <input
              type="text"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              style={inputStyle}
              placeholder="Shop now!"
            />
          </div>
        </section>

        {/* Visual/Production Guidance */}
        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>Visual &amp; Production</h2>
          <div>
            <label style={labelStyle}>On-Screen Text (one per line)</label>
            <textarea
              value={onScreenText}
              onChange={(e) => setOnScreenText(e.target.value)}
              style={textareaStyle}
              placeholder="Text overlay 1&#10;Text overlay 2&#10;Text overlay 3"
            />
          </div>
          <div>
            <label style={labelStyle}>B-Roll Suggestions (one per line)</label>
            <textarea
              value={bRoll}
              onChange={(e) => setBRoll(e.target.value)}
              style={textareaStyle}
              placeholder="Product close-up shot&#10;Lifestyle footage&#10;Before/after comparison"
            />
          </div>
          <div>
            <label style={labelStyle}>Pacing</label>
            <select
              value={pacing}
              onChange={(e) => setPacing(e.target.value)}
              style={{ ...inputStyle, width: 'auto' }}
            >
              <option value="">-- Select --</option>
              <option value="slow">Slow</option>
              <option value="medium">Medium</option>
              <option value="fast">Fast</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Compliance Notes</label>
            <textarea
              value={complianceNotes}
              onChange={(e) => setComplianceNotes(e.target.value)}
              style={textareaStyle}
              placeholder="Avoid medical claims, use lifestyle language..."
            />
          </div>
          <div>
            <label style={labelStyle}>Uploader Instructions</label>
            <textarea
              value={uploaderInstructions}
              onChange={(e) => setUploaderInstructions(e.target.value)}
              style={textareaStyle}
              placeholder="Post at peak hours, use trending sounds..."
            />
          </div>
          <div>
            <label style={labelStyle}>Product Tags (comma-separated)</label>
            <input
              type="text"
              value={productTags}
              onChange={(e) => setProductTags(e.target.value)}
              style={inputStyle}
              placeholder="weight-loss, energy, daily-vitamins"
            />
          </div>
        </section>

        {/* Rendered Preview */}
        {script.script_text && (
          <section style={sectionStyle}>
            <h2 style={{ marginTop: 0 }}>Rendered Script (Current)</h2>
            <pre style={{ backgroundColor: '#fff', padding: '15px', border: '1px solid #ddd', borderRadius: '4px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px' }}>
              {script.script_text}
            </pre>
          </section>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button type="submit" style={buttonStyle} disabled={saving}>
            {saving ? 'Saving...' : 'Save Script'}
          </button>
          {script.status !== 'APPROVED' && (
            <button
              type="button"
              style={{ ...buttonStyle, backgroundColor: '#28a745' }}
              onClick={handleApprove}
              disabled={approving}
            >
              {approving ? 'Approving...' : 'Approve Script'}
            </button>
          )}
          <button
            type="button"
            style={{ ...buttonStyle, backgroundColor: '#6c757d' }}
            onClick={() => setShowRewrite(!showRewrite)}
          >
            {showRewrite ? 'Cancel Rewrite' : 'AI Rewrite'}
          </button>
        </div>
      </form>

      {/* AI Rewrite Section */}
      {showRewrite && (
        <section style={{ ...sectionStyle, borderColor: '#007bff', backgroundColor: '#f0f7ff' }}>
          <h2 style={{ marginTop: 0, color: '#004085' }}>AI Script Rewrite</h2>
          <p style={{ color: '#666', marginBottom: '15px' }}>
            Provide instructions for how the script should be rewritten. The AI will generate a new version while maintaining the structure.
          </p>
          <div>
            <label style={labelStyle}>Rewrite Instructions *</label>
            <textarea
              value={rewritePrompt}
              onChange={(e) => setRewritePrompt(e.target.value)}
              style={{ ...textareaStyle, minHeight: '100px' }}
              placeholder="e.g., Make it more energetic, add urgency, focus on value proposition..."
            />
          </div>
          <div>
            <label style={labelStyle}>Product Context (optional JSON or text)</label>
            <textarea
              value={productContext}
              onChange={(e) => setProductContext(e.target.value)}
              style={textareaStyle}
              placeholder='{"name": "Product Name", "benefits": ["benefit1", "benefit2"], "price": "$29.99"}'
            />
          </div>
          <button
            type="button"
            style={{ ...buttonStyle, backgroundColor: '#007bff' }}
            onClick={handleRewrite}
            disabled={rewriting || !rewritePrompt.trim()}
          >
            {rewriting ? 'Rewriting...' : 'Generate Rewrite'}
          </button>
        </section>
      )}
    </div>
  );
}
