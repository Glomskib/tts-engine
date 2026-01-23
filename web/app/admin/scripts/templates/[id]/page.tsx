'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface TemplateJson {
  hook?: string;
  body?: string;
  cta?: string;
  bullets?: string[];
  sections?: { name: string; content: string }[];
}

interface ScriptTemplate {
  id: string;
  name: string;
  category: string | null;
  tags: string[] | null;
  template_json: TemplateJson;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;

  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [template, setTemplate] = useState<ScriptTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [hook, setHook] = useState('');
  const [body, setBody] = useState('');
  const [cta, setCta] = useState('');
  const [bullets, setBullets] = useState('');

  const checkAdminEnabled = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/enabled');
      const data = await res.json();
      setAdminEnabled(data.enabled === true);
    } catch {
      setAdminEnabled(false);
    }
  }, []);

  const fetchTemplate = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/script-templates/${templateId}`);
      const data = await res.json();

      if (data.ok && data.data) {
        const t = data.data as ScriptTemplate;
        setTemplate(t);
        setName(t.name);
        setCategory(t.category || '');
        setTags(t.tags?.join(', ') || '');
        setHook(t.template_json?.hook || '');
        setBody(t.template_json?.body || '');
        setCta(t.template_json?.cta || '');
        setBullets(t.template_json?.bullets?.join('\n') || '');
        setError('');
      } else {
        setError(data.error || 'Failed to load template');
      }
    } catch (err) {
      setError('Failed to fetch template');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    checkAdminEnabled();
  }, [checkAdminEnabled]);

  useEffect(() => {
    if (adminEnabled === true) {
      fetchTemplate();
    }
  }, [adminEnabled, fetchTemplate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const templateJson: TemplateJson = {
        hook: hook.trim(),
        body: body.trim(),
        cta: cta.trim(),
        bullets: bullets.split('\n').map(b => b.trim()).filter(Boolean),
      };

      const res = await fetch(`/api/script-templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim() || null,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
          template_json: templateJson,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setSuccess('Template saved successfully');
        setTemplate(data.data);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to save template');
      }
    } catch (err) {
      setError('Failed to save template');
    } finally {
      setSaving(false);
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
    return <div style={{ padding: '20px' }}>Loading template...</div>;
  }

  if (!template) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>Template Not Found</h1>
        <Link href="/admin/scripts" style={{ color: '#0066cc' }}>Back to Scripts Library</Link>
      </div>
    );
  }

  const inputStyle = { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '100%', marginBottom: '10px' };
  const textareaStyle = { ...inputStyle, minHeight: '100px', resize: 'vertical' as const, fontFamily: 'monospace' };
  const labelStyle = { display: 'block', marginBottom: '4px', fontWeight: 'bold' as const };
  const sectionStyle = { marginBottom: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' };
  const buttonStyle = { padding: '10px 20px', backgroundColor: '#0066cc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <Link href="/admin/scripts" style={{ padding: '8px 16px', marginRight: '10px', textDecoration: 'none', color: '#333', border: '1px solid #ccc', borderRadius: '4px', display: 'inline-block' }}>
          &larr; Back to Library
        </Link>
      </div>

      <h1>Edit Template</h1>

      {/* Metadata */}
      <div style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
        <span>ID: <code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>{template.id}</code></span>
        <span style={{ marginLeft: '20px' }}>Created: {formatDate(template.created_at)}</span>
        <span style={{ marginLeft: '20px' }}>Updated: {formatDate(template.updated_at)}</span>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '20px', padding: '10px', backgroundColor: '#fee', borderRadius: '4px' }}>{error}</div>}
      {success && <div style={{ color: 'green', marginBottom: '20px', padding: '10px', backgroundColor: '#efe', borderRadius: '4px' }}>{success}</div>}

      <form onSubmit={handleSave}>
        {/* Basic Info */}
        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>Basic Information</h2>
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={inputStyle}
              placeholder="Template name..."
            />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={inputStyle}
              placeholder="e.g., supplements, beauty, tech"
            />
          </div>
          <div>
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              style={inputStyle}
              placeholder="educational, product-demo, testimonial"
            />
          </div>
        </section>

        {/* Template Content */}
        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>Template Content</h2>
          <div>
            <label style={labelStyle}>Hook</label>
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              style={textareaStyle}
              placeholder="Opening hook template text..."
            />
          </div>
          <div>
            <label style={labelStyle}>Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ ...textareaStyle, minHeight: '150px' }}
              placeholder="Main body template text..."
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
              placeholder="Call to action template..."
            />
          </div>
        </section>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" style={buttonStyle} disabled={saving}>
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </form>
    </div>
  );
}
