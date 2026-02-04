'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';

interface ScriptTemplate {
  id: string;
  name: string;
  category: string | null;
  tags: string[] | null;
  template_json: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Script {
  id: string;
  title: string | null;
  concept_id: string | null;
  product_id: string | null;
  template_id: string | null;
  script_json: Record<string, unknown> | null;
  script_text: string | null;
  status: string;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export default function ScriptsLibraryPage() {
  const hydrated = useHydrated();
  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'scripts' | 'templates'>('scripts');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Create form state
  const [showCreateScript, setShowCreateScript] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // New script form
  const [newScriptTitle, setNewScriptTitle] = useState('');
  const [newScriptHook, setNewScriptHook] = useState('');
  const [newScriptBody, setNewScriptBody] = useState('');
  const [newScriptCta, setNewScriptCta] = useState('');
  const [newScriptBullets, setNewScriptBullets] = useState('');

  // New template form
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('');
  const [newTemplateTags, setNewTemplateTags] = useState('');
  const [newTemplateHook, setNewTemplateHook] = useState('');
  const [newTemplateBody, setNewTemplateBody] = useState('');
  const [newTemplateCta, setNewTemplateCta] = useState('');

  const checkAdminEnabled = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/enabled');
      const data = await res.json();
      setAdminEnabled(data.enabled === true);
    } catch {
      setAdminEnabled(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [templatesRes, scriptsRes] = await Promise.all([
        fetch('/api/script-templates'),
        fetch('/api/scripts'),
      ]);

      const [templatesData, scriptsData] = await Promise.all([
        templatesRes.json(),
        scriptsRes.json(),
      ]);

      if (templatesData.ok) setTemplates(templatesData.data || []);
      if (scriptsData.ok) setScripts(scriptsData.data || []);
      setError('');
    } catch {
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAdminEnabled();
  }, [checkAdminEnabled]);

  useEffect(() => {
    if (adminEnabled === true) {
      fetchData();
    }
  }, [adminEnabled, fetchData]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(label);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Use hydration-safe time display
  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  const handleCreateScript = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);

    try {
      const scriptJson = {
        hook: newScriptHook.trim(),
        body: newScriptBody.trim(),
        cta: newScriptCta.trim(),
        bullets: newScriptBullets.split('\n').map(b => b.trim()).filter(Boolean),
      };

      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newScriptTitle.trim(),
          script_json: scriptJson,
          status: 'DRAFT',
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setShowCreateScript(false);
        setNewScriptTitle('');
        setNewScriptHook('');
        setNewScriptBody('');
        setNewScriptCta('');
        setNewScriptBullets('');
        fetchData();
      } else {
        setError(data.error || 'Failed to create script');
      }
    } catch {
      setError('Failed to create script');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);

    try {
      const templateJson = {
        hook: newTemplateHook.trim(),
        body: newTemplateBody.trim(),
        cta: newTemplateCta.trim(),
        bullets: [],
      };

      const res = await fetch('/api/script-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          category: newTemplateCategory.trim() || null,
          tags: newTemplateTags.split(',').map(t => t.trim()).filter(Boolean),
          template_json: templateJson,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setShowCreateTemplate(false);
        setNewTemplateName('');
        setNewTemplateCategory('');
        setNewTemplateTags('');
        setNewTemplateHook('');
        setNewTemplateBody('');
        setNewTemplateCta('');
        fetchData();
      } else {
        setError(data.error || 'Failed to create template');
      }
    } catch {
      setError('Failed to create template');
    } finally {
      setCreateLoading(false);
    }
  };

  // Filter scripts
  const filteredScripts = scripts.filter(script => {
    if (statusFilter && script.status !== statusFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const titleMatch = script.title?.toLowerCase().includes(term);
      const idMatch = script.id.toLowerCase().includes(term);
      if (!titleMatch && !idMatch) return false;
    }
    return true;
  });

  // Filter templates
  const filteredTemplates = templates.filter(template => {
    if (categoryFilter && template.category !== categoryFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const nameMatch = template.name.toLowerCase().includes(term);
      const idMatch = template.id.toLowerCase().includes(term);
      if (!nameMatch && !idMatch) return false;
    }
    return true;
  });

  // Get unique categories
  const categories = [...new Set(templates.map(t => t.category).filter(Boolean))] as string[];

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

  const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '20px' };
  const thStyle = { border: '1px solid #ccc', padding: '8px', textAlign: 'left' as const, backgroundColor: '#f5f5f5' };
  const tdStyle = { border: '1px solid #ccc', padding: '8px' };
  const copyableCellStyle = { ...tdStyle, fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer' };
  const inputStyle = { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '100%', marginBottom: '10px' };
  const textareaStyle = { ...inputStyle, minHeight: '80px', resize: 'vertical' as const };
  const buttonStyle = { padding: '8px 16px', backgroundColor: '#0066cc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' };
  const tabStyle = (active: boolean) => ({
    padding: '10px 20px',
    backgroundColor: active ? '#0066cc' : '#e0e0e0',
    color: active ? 'white' : '#333',
    border: 'none',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    marginRight: '4px',
  });

  const statusBadge = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: '#fff3cd', text: '#856404' },
      REVIEW: { bg: '#cce5ff', text: '#004085' },
      APPROVED: { bg: '#d4edda', text: '#155724' },
      ARCHIVED: { bg: '#e2e3e5', text: '#383d41' },
    };
    const style = colors[status] || colors.DRAFT;
    return (
      <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: style.bg, color: style.text, fontSize: '12px' }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }} className="pb-24 lg:pb-6">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Scripts Library</h1>
        <button onClick={fetchData} style={{ padding: '8px 16px' }}>Refresh</button>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '20px', padding: '10px', backgroundColor: '#fee', borderRadius: '4px' }}>{error}</div>}

      {/* Tabs */}
      <div style={{ marginBottom: '0' }}>
        <button style={tabStyle(activeTab === 'scripts')} onClick={() => setActiveTab('scripts')}>
          Scripts ({scripts.length})
        </button>
        <button style={tabStyle(activeTab === 'templates')} onClick={() => setActiveTab('templates')}>
          Templates ({templates.length})
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '20px', backgroundColor: '#fff' }}>
        {activeTab === 'scripts' && (
          <>
            {/* Scripts Filters */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search by title or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px', width: '250px' }}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px' }}
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">DRAFT</option>
                <option value="REVIEW">REVIEW</option>
                <option value="APPROVED">APPROVED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
              <button style={buttonStyle} onClick={() => setShowCreateScript(true)}>
                + New Script
              </button>
            </div>

            {/* Create Script Form */}
            {showCreateScript && (
              <div style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                <h3 style={{ marginTop: 0 }}>Create New Script</h3>
                <form onSubmit={handleCreateScript}>
                  <div>
                    <label>Title *</label>
                    <input
                      type="text"
                      value={newScriptTitle}
                      onChange={(e) => setNewScriptTitle(e.target.value)}
                      required
                      style={inputStyle}
                      placeholder="Script title..."
                    />
                  </div>
                  <div>
                    <label>Hook</label>
                    <textarea
                      value={newScriptHook}
                      onChange={(e) => setNewScriptHook(e.target.value)}
                      style={textareaStyle}
                      placeholder="Opening hook text..."
                    />
                  </div>
                  <div>
                    <label>Body</label>
                    <textarea
                      value={newScriptBody}
                      onChange={(e) => setNewScriptBody(e.target.value)}
                      style={{ ...textareaStyle, minHeight: '120px' }}
                      placeholder="Main body content..."
                    />
                  </div>
                  <div>
                    <label>Bullets (one per line)</label>
                    <textarea
                      value={newScriptBullets}
                      onChange={(e) => setNewScriptBullets(e.target.value)}
                      style={textareaStyle}
                      placeholder="Key point 1&#10;Key point 2&#10;Key point 3"
                    />
                  </div>
                  <div>
                    <label>Call to Action</label>
                    <input
                      type="text"
                      value={newScriptCta}
                      onChange={(e) => setNewScriptCta(e.target.value)}
                      style={inputStyle}
                      placeholder="Shop now!"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="submit" style={buttonStyle} disabled={createLoading}>
                      {createLoading ? 'Creating...' : 'Create Script'}
                    </button>
                    <button type="button" onClick={() => setShowCreateScript(false)} style={{ ...buttonStyle, backgroundColor: '#666' }}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Scripts Table */}
            {loading ? (
              <p>Loading scripts...</p>
            ) : filteredScripts.length === 0 ? (
              <p style={{ color: '#666' }}>No scripts found.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>Title</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Version</th>
                    <th style={thStyle}>Updated</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScripts.map((script) => (
                    <tr key={script.id}>
                      <td
                        style={copyableCellStyle}
                        onClick={() => copyToClipboard(script.id, `script-${script.id}`)}
                        title="Click to copy full ID"
                      >
                        {script.id.slice(0, 8)}...
                        {copiedId === `script-${script.id}` && <span style={{ marginLeft: '5px', color: 'green', fontSize: '10px' }}>Copied!</span>}
                      </td>
                      <td style={tdStyle}>{script.title || <span style={{ color: '#999' }}>Untitled</span>}</td>
                      <td style={tdStyle}>{statusBadge(script.status)}</td>
                      <td style={tdStyle}>v{script.version}</td>
                      <td style={tdStyle} title={formatDateString(script.updated_at)}>{displayTime(script.updated_at)}</td>
                      <td style={tdStyle}>
                        <Link href={`/admin/scripts/${script.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {activeTab === 'templates' && (
          <>
            {/* Templates Filters */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search by name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px', width: '250px' }}
              />
              {categories.length > 0 && (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px' }}
                >
                  <option value="">All Categories</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}
              <button style={buttonStyle} onClick={() => setShowCreateTemplate(true)}>
                + New Template
              </button>
            </div>

            {/* Create Template Form */}
            {showCreateTemplate && (
              <div style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                <h3 style={{ marginTop: 0 }}>Create New Template</h3>
                <form onSubmit={handleCreateTemplate}>
                  <div>
                    <label>Name *</label>
                    <input
                      type="text"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      required
                      style={inputStyle}
                      placeholder="Template name..."
                    />
                  </div>
                  <div>
                    <label>Category</label>
                    <input
                      type="text"
                      value={newTemplateCategory}
                      onChange={(e) => setNewTemplateCategory(e.target.value)}
                      style={inputStyle}
                      placeholder="e.g., supplements, beauty, tech"
                    />
                  </div>
                  <div>
                    <label>Tags (comma-separated)</label>
                    <input
                      type="text"
                      value={newTemplateTags}
                      onChange={(e) => setNewTemplateTags(e.target.value)}
                      style={inputStyle}
                      placeholder="educational, product-demo, testimonial"
                    />
                  </div>
                  <div>
                    <label>Hook Template</label>
                    <textarea
                      value={newTemplateHook}
                      onChange={(e) => setNewTemplateHook(e.target.value)}
                      style={textareaStyle}
                      placeholder="Opening hook template..."
                    />
                  </div>
                  <div>
                    <label>Body Template</label>
                    <textarea
                      value={newTemplateBody}
                      onChange={(e) => setNewTemplateBody(e.target.value)}
                      style={{ ...textareaStyle, minHeight: '120px' }}
                      placeholder="Main body template..."
                    />
                  </div>
                  <div>
                    <label>CTA Template</label>
                    <input
                      type="text"
                      value={newTemplateCta}
                      onChange={(e) => setNewTemplateCta(e.target.value)}
                      style={inputStyle}
                      placeholder="Call to action template..."
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="submit" style={buttonStyle} disabled={createLoading}>
                      {createLoading ? 'Creating...' : 'Create Template'}
                    </button>
                    <button type="button" onClick={() => setShowCreateTemplate(false)} style={{ ...buttonStyle, backgroundColor: '#666' }}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Templates Table */}
            {loading ? (
              <p>Loading templates...</p>
            ) : filteredTemplates.length === 0 ? (
              <p style={{ color: '#666' }}>No templates found.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Tags</th>
                    <th style={thStyle}>Updated</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map((template) => (
                    <tr key={template.id}>
                      <td
                        style={copyableCellStyle}
                        onClick={() => copyToClipboard(template.id, `template-${template.id}`)}
                        title="Click to copy full ID"
                      >
                        {template.id.slice(0, 8)}...
                        {copiedId === `template-${template.id}` && <span style={{ marginLeft: '5px', color: 'green', fontSize: '10px' }}>Copied!</span>}
                      </td>
                      <td style={tdStyle}>{template.name}</td>
                      <td style={tdStyle}>{template.category || <span style={{ color: '#999' }}>-</span>}</td>
                      <td style={tdStyle}>
                        {template.tags && template.tags.length > 0 ? (
                          template.tags.map((tag, i) => (
                            <span key={i} style={{ display: 'inline-block', padding: '2px 6px', backgroundColor: '#e0e0e0', borderRadius: '3px', fontSize: '11px', marginRight: '4px' }}>
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#999' }}>-</span>
                        )}
                      </td>
                      <td style={tdStyle} title={formatDateString(template.updated_at)}>{displayTime(template.updated_at)}</td>
                      <td style={tdStyle}>
                        <Link href={`/admin/scripts/templates/${template.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
