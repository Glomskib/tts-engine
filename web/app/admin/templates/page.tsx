'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, Edit3, Copy, Loader2, X, Save,
  Sparkles, FileText, Tag, Variable
} from 'lucide-react';
import { DEFAULT_TEMPLATES, TEMPLATE_CATEGORIES, ContentTemplate } from '@/lib/templates';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { useToast } from '@/contexts/ToastContext';

interface CustomTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  hook_template: string | null;
  body_template: string | null;
  cta_template: string | null;
  variables: string[];
  structure: Record<string, unknown>;
  tags: string[];
  use_count: number;
  created_at: string;
}

const iconMap: Record<string, React.ReactNode> = {
  star: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
  sun: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  arrows: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  book: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
  lightbulb: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  xmark: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  gift: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>,
  scale: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>,
  trophy: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>,
  mirror: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  check: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  comment: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
};

const categoryColors: Record<string, string> = {
  ugc: 'from-violet-500 to-purple-600',
  educational: 'from-blue-500 to-cyan-600',
  lifestyle: 'from-pink-500 to-rose-600',
  promotional: 'from-amber-500 to-orange-600',
  trending: 'from-red-500 to-pink-600',
  custom: 'from-teal-500 to-emerald-600',
};

const CUSTOM_CATEGORIES = ['hook', 'script', 'cta', 'full', 'other'];

const COMMON_VARIABLES = ['product_name', 'brand', 'audience', 'benefit', 'price', 'feature', 'pain_point', 'competitor'];

export default function TemplatesPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'built-in' | 'custom'>('built-in');

  // Custom template state
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CustomTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError } = useToast();

  // Editor form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('hook');
  const [formHook, setFormHook] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formCta, setFormCta] = useState('');
  const [formTags, setFormTags] = useState('');

  const fetchCustomTemplates = useCallback(async () => {
    setLoadingCustom(true);
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setCustomTemplates(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoadingCustom(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'custom') fetchCustomTemplates();
  }, [activeTab, fetchCustomTemplates]);

  const filteredBuiltIn = DEFAULT_TEMPLATES.filter(template => {
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    const matchesSearch = searchQuery === '' ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredCustom = customTemplates.filter(t => {
    const matchesSearch = searchQuery === '' ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleUseTemplate = (template: ContentTemplate) => {
    router.push(`/admin/content-studio?template=${template.id}`);
  };

  const openEditor = (template?: CustomTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormName(template.name);
      setFormDescription(template.description || '');
      setFormCategory(template.category);
      setFormHook(template.hook_template || '');
      setFormBody(template.body_template || '');
      setFormCta(template.cta_template || '');
      setFormTags(template.tags.join(', '));
    } else {
      setEditingTemplate(null);
      setFormName('');
      setFormDescription('');
      setFormCategory('hook');
      setFormHook('');
      setFormBody('');
      setFormCta('');
      setFormTags('');
    }
    setShowEditor(true);
  };

  const saveTemplate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        category: formCategory,
        hook_template: formHook.trim() || undefined,
        body_template: formBody.trim() || undefined,
        cta_template: formCta.trim() || undefined,
        tags: formTags.split(',').map(t => t.trim()).filter(Boolean),
      };

      let res: Response;
      if (editingTemplate) {
        res = await fetch('/api/templates', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingTemplate.id, ...payload }),
        });
      } else {
        res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setShowEditor(false);
        fetchCustomTemplates();
        showSuccess('Template saved');
      } else {
        showError('Failed to save template');
      }
    } catch (err) {
      console.error('Save template failed:', err);
      showError('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCustomTemplates();
        showSuccess('Template deleted');
      } else {
        showError('Failed to delete template');
      }
    } catch (err) {
      console.error('Delete template failed:', err);
      showError('Failed to delete template');
    }
  };

  // Detect variables in template text
  const detectedVars = new Set<string>();
  const varRegex = /\{\{(\w+)\}\}/g;
  for (const text of [formHook, formBody, formCta]) {
    let match;
    while ((match = varRegex.exec(text)) !== null) {
      detectedVars.add(match[1]);
    }
  }

  return (
    <PullToRefresh onRefresh={fetchCustomTemplates}>
      <div className="px-4 py-6 pb-24 lg:pb-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Content Templates</h1>
            <p className="text-zinc-400 text-sm">Proven formats and your custom templates</p>
          </div>
          <button
            type="button"
            onClick={() => { setActiveTab('custom'); openEditor(); }}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Create Template
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('built-in')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'built-in'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-transparent hover:text-zinc-200'
            }`}
          >
            Built-in ({DEFAULT_TEMPLATES.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'custom'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-transparent hover:text-zinc-200'
            }`}
          >
            My Templates ({customTemplates.length})
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 bg-zinc-800 border border-white/10 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />

        {/* Built-in Templates Tab */}
        {activeTab === 'built-in' && (
          <>
            {/* Category Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {TEMPLATE_CATEGORIES.map(category => (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors min-h-[44px] ${
                    selectedCategory === category.id
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>

            {/* Templates Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBuiltIn.map(template => (
                <div
                  key={template.id}
                  className="p-5 rounded-xl border border-white/10 bg-zinc-900/50 hover:bg-zinc-800/50 transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${categoryColors[template.category] || categoryColors.custom} flex items-center justify-center text-white`}>
                      {iconMap[template.icon] || iconMap.star}
                    </div>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-400 capitalize">
                      {template.category}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-2">{template.name}</h3>
                  <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{template.description}</p>

                  <div className="mb-3 p-3 rounded-lg bg-zinc-800/50 border border-white/5">
                    <div className="text-xs text-zinc-500 mb-1">Example hook:</div>
                    <div className="text-sm text-zinc-300 italic">&quot;{template.example_hook}&quot;</div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-400">
                      {template.structure.beat_count} beats
                    </span>
                    <span className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-400">
                      {template.structure.suggested_duration}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUseTemplate(template)}
                    className="w-full py-2.5 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-100 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                  >
                    <Sparkles className="w-4 h-4" /> Use Template
                  </button>
                </div>
              ))}
            </div>

            {filteredBuiltIn.length === 0 && (
              <div className="text-center py-12">
                <p className="text-zinc-500">No templates found</p>
                <button type="button" onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }} className="text-violet-400 hover:text-violet-300 text-sm mt-2">
                  Clear filters
                </button>
              </div>
            )}
          </>
        )}

        {/* Custom Templates Tab */}
        {activeTab === 'custom' && (
          <>
            {loadingCustom ? (
              <div className="flex items-center gap-2 text-zinc-400 py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading templates...
              </div>
            ) : filteredCustom.length === 0 && !showEditor ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400">No custom templates yet</p>
                <p className="text-sm text-zinc-500 mt-1">Create templates with variables like {"{{product_name}}"} for reusable content</p>
                <button
                  type="button"
                  onClick={() => openEditor()}
                  className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 text-sm font-medium"
                >
                  Create Your First Template
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCustom.map(t => (
                  <div key={t.id} className="p-4 rounded-xl border border-white/10 bg-zinc-900/50">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-white truncate">{t.name}</h3>
                        <span className="text-xs text-zinc-500 capitalize">{t.category}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => openEditor(t)} className="p-1.5 text-zinc-400 hover:text-white rounded">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => deleteTemplate(t.id)} className="p-1.5 text-zinc-400 hover:text-red-400 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {t.description && (
                      <p className="text-xs text-zinc-400 mb-2 line-clamp-2">{t.description}</p>
                    )}

                    {t.hook_template && (
                      <div className="mb-2 p-2 rounded bg-zinc-800/50 border border-white/5">
                        <div className="text-[10px] text-zinc-500 mb-0.5">Hook template:</div>
                        <div className="text-xs text-zinc-300">{t.hook_template}</div>
                      </div>
                    )}

                    {t.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {t.variables.map(v => (
                          <span key={v} className="px-1.5 py-0.5 text-[10px] bg-teal-500/15 text-teal-400 rounded font-mono">
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    )}

                    {t.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {t.tags.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-zinc-700/50 text-zinc-400 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-[10px] text-zinc-600 mt-2">Used {t.use_count} times</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Template Editor Modal */}
        {showEditor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  {editingTemplate ? 'Edit Template' : 'Create Template'}
                </h2>
                <button type="button" onClick={() => setShowEditor(false)} className="p-2 text-zinc-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Product Launch Hook"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="What this template is for..."
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {CUSTOM_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                          formCategory === cat
                            ? 'bg-teal-600/20 text-teal-300 border border-teal-500/50'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Hook Template <span className="text-zinc-600">(use {"{{variable}}"} for dynamic content)</span>
                  </label>
                  <textarea
                    value={formHook}
                    onChange={(e) => setFormHook(e.target.value)}
                    placeholder="e.g. POV: You just discovered {{product_name}} and your {{pain_point}} is gone"
                    rows={2}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Body Template</label>
                  <textarea
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    placeholder="Main script body with {{variable}} placeholders..."
                    rows={4}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-1">CTA Template</label>
                  <textarea
                    value={formCta}
                    onChange={(e) => setFormCta(e.target.value)}
                    placeholder="e.g. Link in bio for {{benefit}} — limited time {{price}}"
                    rows={2}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  />
                </div>

                {/* Variable chips */}
                <div>
                  <label className="flex items-center gap-1.5 text-sm text-zinc-400 mb-2">
                    <Variable className="w-3.5 h-3.5" /> Quick Variable Insert
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_VARIABLES.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          // Insert into the last focused field (default to hook)
                          const varStr = `{{${v}}}`;
                          if (!formHook.includes(varStr) && !formBody.includes(varStr) && !formCta.includes(varStr)) {
                            setFormHook(prev => prev + (prev ? ' ' : '') + varStr);
                          }
                        }}
                        className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                          detectedVars.has(v)
                            ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                            : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
                        }`}
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                  {detectedVars.size > 0 && (
                    <p className="text-[11px] text-zinc-500 mt-1">{detectedVars.size} variable{detectedVars.size !== 1 ? 's' : ''} detected</p>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-sm text-zinc-400 mb-1">
                    <Tag className="w-3.5 h-3.5" /> Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    placeholder="e.g. skincare, launch, ugc"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={saveTemplate}
                  disabled={saving || !formName.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 text-sm font-medium disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingTemplate ? 'Save Changes' : 'Create Template'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditor(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg hover:text-zinc-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
