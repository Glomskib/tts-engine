'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Send, X, Upload, FileText, Image, File, CheckCircle, Clock } from 'lucide-react';
import InitiativeFilter from '../_components/InitiativeFilter';
import CCSubnav from '../_components/CCSubnav';

interface Idea {
  id: string;
  title: string;
  prompt: string;
  tags: string[];
  status: string;
  mode: string;
  priority: number;
  score: number | null;
  created_by: string | null;
  created_at: string;
  last_processed_at: string | null;
  meta?: Record<string, unknown>;
}

interface CcProject {
  id: string;
  name: string;
  type: string;
  initiative_id: string | null;
}

interface IdeaArtifact {
  id: string;
  ts: string;
  artifact_type: string;
  content_md: string;
  label?: string | null;
  storage_path?: string | null;
  content_type?: string | null;
  extracted_text?: string | null;
  summary?: string | null;
  meta?: Record<string, unknown>;
}

const STATUS_COLORS: Record<string, string> = {
  inbox: 'bg-zinc-700/40 text-zinc-400',
  queued: 'bg-zinc-700/40 text-zinc-400',
  researching: 'bg-blue-900/40 text-blue-400',
  researched: 'bg-purple-900/40 text-purple-400',
  ready: 'bg-teal-900/40 text-teal-400',
  building: 'bg-amber-900/40 text-amber-400',
  shipped: 'bg-green-900/40 text-green-400',
  killed: 'bg-zinc-800/40 text-zinc-600',
};

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [artifacts, setArtifacts] = useState<IdeaArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [initiativeId, setInitiativeId] = useState<string>('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPrompt, setQuickPrompt] = useState('');
  const [quickMode, setQuickMode] = useState('research_only');
  const [quickPriority, setQuickPriority] = useState(3);
  const [showConvert, setShowConvert] = useState(false);
  const [convertProjectId, setConvertProjectId] = useState('');
  const [convertTitle, setConvertTitle] = useState('');
  const [convertRisk, setConvertRisk] = useState('medium');
  const [convertAgent, setConvertAgent] = useState('unassigned');
  const [projects, setProjects] = useState<CcProject[]>([]);
  const [uploading, setUploading] = useState(false);

  const fetchIdeas = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (initiativeId) params.set('initiative_id', initiativeId);
    const res = await fetch(`/api/admin/ideas?${params}`);
    if (res.ok) {
      const json = await res.json();
      setIdeas(json.data || []);
    }
    setLoading(false);
  }, [statusFilter, initiativeId]);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  async function fetchIdeaDetail(id: string) {
    const res = await fetch(`/api/admin/ideas/${id}`);
    if (res.ok) {
      const json = await res.json();
      setSelectedIdea(json.data.idea);
      setArtifacts(json.data.artifacts || []);
    }
  }

  async function quickAddIdea() {
    if (!quickTitle.trim()) return;
    const res = await fetch('/api/admin/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: quickTitle,
        prompt: quickPrompt,
        mode: quickMode,
        priority: quickPriority,
      }),
    });
    if (res.ok) {
      setQuickTitle('');
      setQuickPrompt('');
      setQuickMode('research_only');
      setQuickPriority(3);
      setShowQuickAdd(false);
      fetchIdeas();
    }
  }

  async function updateIdeaStatus(id: string, status: string) {
    await fetch(`/api/admin/ideas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchIdeas();
    if (selectedIdea?.id === id) {
      setSelectedIdea({ ...selectedIdea, status });
    }
  }

  async function sendToResearch(id: string) {
    await updateIdeaStatus(id, 'researching');
  }

  async function fetchProjects() {
    const res = await fetch('/api/admin/cc-projects');
    if (res.ok) {
      const json = await res.json();
      setProjects(json.data || []);
    }
  }

  function openConvertForm(idea: Idea) {
    setConvertTitle(`[Idea] ${idea.title}`);
    setConvertRisk('medium');
    setConvertAgent('unassigned');
    setConvertProjectId('');
    setShowConvert(true);
    if (projects.length === 0) fetchProjects();
  }

  async function convertToTask() {
    if (!selectedIdea || !convertProjectId) return;
    const res = await fetch(`/api/admin/command-center/ideas/${selectedIdea.id}/convert-to-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: convertProjectId,
        title: convertTitle,
        risk_tier: convertRisk,
        assigned_agent: convertAgent,
      }),
    });
    if (res.ok) {
      setShowConvert(false);
      fetchIdeas();
      fetchIdeaDetail(selectedIdea.id);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedIdea || !e.target.files?.length) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/admin/ideas/${selectedIdea.id}/upload`, {
        method: 'POST',
        body: form,
      });
      if (res.ok) {
        fetchIdeaDetail(selectedIdea.id);
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.message || 'Upload failed');
      }
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function getFileIcon(contentType: string | null | undefined) {
    if (!contentType) return <File className="w-4 h-4" />;
    if (contentType.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (contentType === 'application/pdf') return <FileText className="w-4 h-4 text-red-400" />;
    return <FileText className="w-4 h-4" />;
  }

  return (
    <div className="space-y-6">
      <CCSubnav />
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-white flex-1">Ideas</h2>
        <button onClick={() => setShowQuickAdd(true)} className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg">
          <Plus className="w-4 h-4" /> Dump Idea
        </button>
      </div>

      {/* Quick add form */}
      {showQuickAdd && (
        <div className="border border-purple-800/50 rounded-lg p-4 bg-zinc-900">
          <div className="space-y-3">
            <input
              placeholder="Idea title (be brief)"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && quickAddIdea()}
            />
            <textarea
              placeholder="Describe the idea, problem, or prompt... (optional)"
              value={quickPrompt}
              onChange={(e) => setQuickPrompt(e.target.value)}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm resize-none"
            />
            <div className="flex items-center gap-3">
              <select value={quickMode} onChange={(e) => setQuickMode(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm">
                <option value="research_only">Research only</option>
                <option value="research_and_plan">Research + Plan</option>
                <option value="research_and_build">Research + Build</option>
              </select>
              <select value={quickPriority} onChange={(e) => setQuickPriority(Number(e.target.value))} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm">
                <option value={1}>P1 - Critical</option>
                <option value={2}>P2 - High</option>
                <option value={3}>P3 - Normal</option>
                <option value={4}>P4 - Low</option>
                <option value={5}>P5 - Someday</option>
              </select>
              <div className="flex-1" />
              <button onClick={() => setShowQuickAdd(false)} className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-300">Cancel</button>
              <button onClick={quickAddIdea} disabled={!quickTitle.trim()} className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded disabled:opacity-50">Add Idea</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <InitiativeFilter value={initiativeId} onChange={setInitiativeId} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm">
          <option value="">All statuses</option>
          <option value="inbox">Inbox</option>
          <option value="queued">Queued</option>
          <option value="researching">Researching</option>
          <option value="researched">Researched</option>
          <option value="ready">Ready</option>
          <option value="building">Building</option>
          <option value="shipped">Shipped</option>
          <option value="killed">Killed</option>
        </select>
        <button onClick={fetchIdeas} className="p-2 text-zinc-400 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Two-column: list + detail */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Ideas list */}
        <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800 bg-zinc-900/50">
          {ideas.length === 0 && (
            <div className="p-8 text-center text-zinc-500">{loading ? 'Loading...' : 'No ideas yet. Dump one!'}</div>
          )}
          {ideas.map((idea) => (
            <div
              key={idea.id}
              onClick={() => fetchIdeaDetail(idea.id)}
              className={`px-4 py-3 cursor-pointer hover:bg-zinc-800/50 ${selectedIdea?.id === idea.id ? 'bg-zinc-800/50 border-l-2 border-l-purple-500' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm text-zinc-300 font-medium truncate">{idea.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-1.5 py-0.5 text-xs rounded ${STATUS_COLORS[idea.status] || 'text-zinc-500'}`}>{idea.status}</span>
                    <span className="text-xs text-zinc-600">P{idea.priority}</span>
                    {idea.score !== null && <span className="text-xs text-amber-400">Score: {idea.score}</span>}
                    <span className="text-xs text-zinc-600">{idea.mode.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {(idea.status === 'queued' || idea.status === 'inbox') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); sendToResearch(idea.id); }}
                      title="Send to nightly research queue"
                      className="p-1.5 text-blue-400 hover:bg-blue-900/30 rounded"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Idea detail / artifacts */}
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4">
          {!selectedIdea ? (
            <div className="text-center text-zinc-500 py-12">Select an idea to view details</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold text-white">{selectedIdea.title}</h2>
                <button onClick={() => { setSelectedIdea(null); setArtifacts([]); }} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedIdea.prompt && (
                <p className="text-sm text-zinc-400 whitespace-pre-wrap">{selectedIdea.prompt}</p>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[selectedIdea.status] || ''}`}>{selectedIdea.status}</span>
                <span className="text-xs text-zinc-500">Priority: {selectedIdea.priority}</span>
                <span className="text-xs text-zinc-500">Mode: {selectedIdea.mode.replace(/_/g, ' ')}</span>
                {selectedIdea.tags.length > 0 && selectedIdea.tags.map((t) => (
                  <span key={t} className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">{t}</span>
                ))}
              </div>

              {/* Status quick actions */}
              <div className="flex gap-2 flex-wrap">
                {selectedIdea.status !== 'shipped' && <button onClick={() => updateIdeaStatus(selectedIdea.id, 'shipped')} className="px-3 py-1.5 text-xs bg-green-900/30 text-green-400 rounded hover:bg-green-900/50">Ship</button>}
                {selectedIdea.status !== 'killed' && <button onClick={() => updateIdeaStatus(selectedIdea.id, 'killed')} className="px-3 py-1.5 text-xs bg-zinc-700/30 text-zinc-400 rounded hover:bg-zinc-700/50">Kill</button>}
                {selectedIdea.status !== 'researching' && <button onClick={() => sendToResearch(selectedIdea.id)} className="px-3 py-1.5 text-xs bg-blue-900/30 text-blue-400 rounded hover:bg-blue-900/50">Research</button>}
                {selectedIdea.status !== 'building' && selectedIdea.status !== 'shipped' && (
                  <button onClick={() => openConvertForm(selectedIdea)} className="px-3 py-1.5 text-xs bg-teal-900/30 text-teal-400 rounded hover:bg-teal-900/50">Convert to Task</button>
                )}
              </div>

              {/* Next action hint from nightly job */}
              {!!selectedIdea.meta?.next_action && (
                <div className="text-xs text-zinc-500">
                  Nightly recommendation: <span className="text-amber-400 font-medium">{String(selectedIdea.meta.next_action).replace(/_/g, ' ')}</span>
                </div>
              )}

              {/* Convert to task form */}
              {showConvert && (
                <div className="border border-teal-800/50 rounded-lg p-3 bg-zinc-900 space-y-2">
                  <h4 className="text-sm font-semibold text-teal-400">Convert to Task</h4>
                  <input
                    value={convertTitle}
                    onChange={(e) => setConvertTitle(e.target.value)}
                    placeholder="Task title"
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={convertProjectId} onChange={(e) => setConvertProjectId(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm">
                      <option value="">Select project...</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select value={convertRisk} onChange={(e) => setConvertRisk(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm">
                      <option value="low">Low risk</option>
                      <option value="medium">Medium risk</option>
                      <option value="high">High risk</option>
                    </select>
                    <select value={convertAgent} onChange={(e) => setConvertAgent(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm">
                      <option value="unassigned">Unassigned</option>
                      <option value="tom-dev">tom-dev</option>
                      <option value="dan-ops">dan-ops</option>
                      <option value="brett-growth">brett-growth</option>
                      <option value="greg-uploader">greg-uploader</option>
                      <option value="susan-social">susan-social</option>
                      <option value="human">human</option>
                    </select>
                    <div className="flex gap-2">
                      <button onClick={convertToTask} disabled={!convertProjectId} className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded disabled:opacity-50">Create Task</button>
                      <button onClick={() => setShowConvert(false)} className="px-3 py-1.5 text-xs bg-zinc-700 text-zinc-300 rounded">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* File uploads */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-zinc-300">Files</h3>
                  <label className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded cursor-pointer ${uploading ? 'bg-zinc-700 text-zinc-500' : 'bg-indigo-900/30 text-indigo-400 hover:bg-indigo-900/50'}`}>
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? 'Uploading...' : 'Upload'}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.txt,.md,.csv,.log,.jpg,.jpeg,.png,.webp,.gif"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </label>
                </div>
                {(() => {
                  const fileArtifacts = artifacts.filter((a) => a.artifact_type === 'file');
                  if (fileArtifacts.length === 0) return <p className="text-sm text-zinc-600 mb-3">No files uploaded</p>;
                  return (
                    <div className="space-y-2 mb-3">
                      {fileArtifacts.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 border border-zinc-800 rounded px-3 py-2 bg-zinc-800/30">
                          {getFileIcon(a.content_type)}
                          <a
                            href={a.meta?.public_url as string || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-indigo-400 hover:text-indigo-300 truncate flex-1"
                            title={a.label || undefined}
                          >
                            {a.label || 'file'}
                          </a>
                          <span className="text-xs text-zinc-600">
                            {a.meta?.file_size ? `${Math.round((a.meta.file_size as number) / 1024)}KB` : ''}
                          </span>
                          {a.extracted_text ? (
                            <span title="Text extracted" className="text-green-500"><CheckCircle className="w-3.5 h-3.5" /></span>
                          ) : (
                            <span title="Pending extraction" className="text-zinc-600"><Clock className="w-3.5 h-3.5" /></span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Artifacts timeline */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">Artifacts</h3>
                {(() => {
                  const nonFileArtifacts = artifacts.filter((a) => a.artifact_type !== 'file');
                  if (nonFileArtifacts.length === 0) return <p className="text-sm text-zinc-500">No artifacts yet</p>;
                  return (
                    <div className="space-y-3">
                      {nonFileArtifacts.map((a) => (
                        <div key={a.id} className="border border-zinc-800 rounded p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-zinc-500 uppercase">{a.artifact_type}</span>
                            <span className="text-xs text-zinc-600">{new Date(a.ts).toLocaleString()}</span>
                            {a.summary && <span className="text-xs text-amber-400">has summary</span>}
                          </div>
                          <div className="text-sm text-zinc-400 whitespace-pre-wrap">{a.content_md}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
