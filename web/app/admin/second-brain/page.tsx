'use client';

import { useState, useEffect, useCallback } from 'react';
import PlanGate from '@/components/PlanGate';
import {
  FileText, FolderOpen, Search, Tag, Calendar, ChevronRight,
  Loader2, Plus, ArrowLeft, RefreshCw, BookOpen, Hash,
} from 'lucide-react';

interface DocumentMeta {
  filename: string;
  folder: string;
  path: string;
  title: string;
  tags: string[];
  size: number;
  created_at: string;
  modified_at: string;
}

interface DocumentFull extends DocumentMeta {
  content: string;
}

interface TagInfo {
  name: string;
  count: number;
}

export default function SecondBrainPage() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [activeFolder, setActiveFolder] = useState('');

  // Selected document
  const [selectedDoc, setSelectedDoc] = useState<DocumentFull | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  // New document
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [newDocFolder, setNewDocFolder] = useState('journals');
  const [newDocFilename, setNewDocFilename] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (activeTag) params.set('tag', activeTag);
      if (activeFolder) params.set('folder', activeFolder);

      const res = await fetch(`/api/second-brain/documents?${params}`);
      const data = await res.json();
      if (data.ok) setDocuments(data.documents);
    } catch {}
    setLoading(false);
  }, [searchQuery, activeTag, activeFolder]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/second-brain/tags');
      const data = await res.json();
      if (data.ok) {
        setTags(data.tags);
        setFolders(data.folders);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetchTags();
  }, [fetchDocuments, fetchTags]);

  const openDocument = async (doc: DocumentMeta) => {
    setLoadingDoc(true);
    setSelectedDoc(null);
    try {
      const res = await fetch(`/api/second-brain/documents/${encodeURIComponent(doc.path)}`);
      const data = await res.json();
      if (data.ok) setSelectedDoc(data.document);
    } catch {}
    setLoadingDoc(false);
  };

  const handleCreateDoc = async () => {
    if (!newDocFilename.trim() || !newDocContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/second-brain/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: newDocFolder,
          filename: newDocFilename.trim(),
          content: newDocContent,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowNewDoc(false);
        setNewDocFilename('');
        setNewDocContent('');
        fetchDocuments();
        fetchTags();
      }
    } catch {}
    setSaving(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  // Simple markdown renderer
  const renderMarkdown = (content: string) => {
    return content
      .split('\n')
      .map((line, i) => {
        // Headers
        if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-semibold text-white mt-4 mb-2">{line.slice(4)}</h3>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-bold text-white mt-6 mb-2">{line.slice(3)}</h2>;
        if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold text-white mt-6 mb-3">{line.slice(2)}</h1>;

        // Horizontal rule
        if (line.match(/^---+$/)) return <hr key={i} className="border-zinc-700 my-4" />;

        // Bullet lists
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <li key={i} className="text-zinc-300 ml-4 list-disc">{renderInline(line.slice(2))}</li>;
        }

        // Numbered lists
        const numMatch = line.match(/^(\d+)\.\s/);
        if (numMatch) {
          return <li key={i} className="text-zinc-300 ml-4 list-decimal">{renderInline(line.slice(numMatch[0].length))}</li>;
        }

        // Code blocks (simplified)
        if (line.startsWith('```')) return <div key={i} className="text-xs text-zinc-500">{line}</div>;

        // Blockquotes
        if (line.startsWith('> ')) return <blockquote key={i} className="border-l-2 border-zinc-600 pl-4 text-zinc-400 italic my-2">{renderInline(line.slice(2))}</blockquote>;

        // Empty lines
        if (line.trim() === '') return <div key={i} className="h-2" />;

        // Regular text
        return <p key={i} className="text-zinc-300 leading-relaxed">{renderInline(line)}</p>;
      });
  };

  const renderInline = (text: string) => {
    // Bold
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
      }
      // Inline code
      const codeParts = part.split(/(`[^`]+`)/g);
      return codeParts.map((cp, j) => {
        if (cp.startsWith('`') && cp.endsWith('`')) {
          return <code key={`${i}-${j}`} className="px-1.5 py-0.5 bg-zinc-800 text-amber-400 rounded text-sm font-mono">{cp.slice(1, -1)}</code>;
        }
        return <span key={`${i}-${j}`}>{cp}</span>;
      });
    });
  };

  return (
    <PlanGate minPlan="agency" feature="Second Brain" adminOnly>
    <div className="min-h-screen bg-zinc-950 text-white flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5 text-teal-400" />
            <h1 className="text-lg font-semibold">Second Brain</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
            />
          </div>
        </div>

        {/* Folders */}
        <div className="p-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Folders</p>
          <button
            type="button"
            onClick={() => { setActiveFolder(''); setActiveTag(''); }}
            className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 ${!activeFolder ? 'bg-teal-600/20 text-teal-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
          >
            <FolderOpen className="w-3.5 h-3.5" /> All Documents
          </button>
          {folders.map(f => (
            <button
              key={f}
              type="button"
              onClick={() => { setActiveFolder(f); setActiveTag(''); }}
              className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 ${activeFolder === f ? 'bg-teal-600/20 text-teal-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
            >
              <FolderOpen className="w-3.5 h-3.5" /> {f}
            </button>
          ))}
        </div>

        {/* Tags */}
        <div className="p-3 border-t border-zinc-800">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Tags</p>
          <div className="flex flex-wrap gap-1">
            {tags.map(t => (
              <button
                key={t.name}
                type="button"
                onClick={() => { setActiveTag(activeTag === t.name ? '' : t.name); setActiveFolder(''); }}
                className={`px-2 py-0.5 rounded text-xs ${activeTag === t.name ? 'bg-teal-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
              >
                <Hash className="w-2.5 h-2.5 inline mr-0.5" />{t.name} ({t.count})
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-auto p-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={() => setShowNewDoc(true)}
            className="w-full px-3 py-2 bg-teal-600 hover:bg-teal-500 rounded text-sm font-medium flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Document
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedDoc ? (
          /* Document viewer */
          <div className="flex-1 overflow-auto">
            <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800 px-6 py-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="p-1 rounded hover:bg-zinc-800"
              >
                <ArrowLeft className="w-4 h-4 text-zinc-400" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-medium text-white truncate">{selectedDoc.filename}</h2>
                <p className="text-xs text-zinc-500">{selectedDoc.folder} &middot; {formatDate(selectedDoc.modified_at)} &middot; {formatSize(selectedDoc.size)}</p>
              </div>
              <div className="flex gap-1">
                {(selectedDoc as DocumentMeta & { tags?: string[] }).tags?.map((t: string) => (
                  <span key={t} className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px]">{t}</span>
                ))}
              </div>
            </div>
            <div className="max-w-3xl mx-auto px-8 py-6">
              {renderMarkdown(selectedDoc.content)}
            </div>
          </div>
        ) : loadingDoc ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : showNewDoc ? (
          /* New document form */
          <div className="flex-1 overflow-auto">
            <div className="max-w-2xl mx-auto px-8 py-8 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">New Document</h2>
                <button type="button" onClick={() => setShowNewDoc(false)} className="text-sm text-zinc-400 hover:text-zinc-300">Cancel</button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Folder</label>
                  <select
                    value={newDocFolder}
                    onChange={e => setNewDocFolder(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white"
                  >
                    <option value="journals">journals</option>
                    <option value="research">research</option>
                    <option value="business">business</option>
                    <option value="content-ideas">content-ideas</option>
                    <option value="projects">projects</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Filename</label>
                  <input
                    type="text"
                    value={newDocFilename}
                    onChange={e => setNewDocFilename(e.target.value)}
                    placeholder="my-document.md"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Content (Markdown)</label>
                <textarea
                  value={newDocContent}
                  onChange={e => setNewDocContent(e.target.value)}
                  rows={20}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500/50 resize-none"
                  placeholder="# My Document&#10;&#10;Write your content here..."
                />
              </div>
              <button
                type="button"
                onClick={handleCreateDoc}
                disabled={saving || !newDocFilename.trim() || !newDocContent.trim()}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-600/50 rounded text-sm font-medium flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Document
              </button>
            </div>
          </div>
        ) : (
          /* Document list */
          <div className="flex-1 overflow-auto">
            <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400">
                  {documents.length} document{documents.length !== 1 ? 's' : ''}
                  {activeFolder && <span> in <span className="text-white">{activeFolder}</span></span>}
                  {activeTag && <span> tagged <span className="text-teal-400">#{activeTag}</span></span>}
                </span>
              </div>
              <button type="button" onClick={() => { fetchDocuments(); fetchTags(); }} className="p-1.5 rounded hover:bg-zinc-800">
                <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="w-10 h-10 text-zinc-700 mb-3" />
                <p className="text-zinc-500 text-sm mb-1">No documents found</p>
                <p className="text-zinc-600 text-xs">Documents will appear here as Bolt creates journal entries and research reports.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {documents.map(doc => (
                  <button
                    key={doc.path}
                    type="button"
                    onClick={() => openDocument(doc)}
                    className="w-full text-left px-6 py-3 hover:bg-zinc-900/50 transition-colors flex items-center gap-4"
                  >
                    <FileText className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{doc.title || doc.filename}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-500">{doc.folder}</span>
                        <span className="text-[10px] text-zinc-600">&middot;</span>
                        <span className="text-[10px] text-zinc-500">{formatDate(doc.modified_at)}</span>
                        <span className="text-[10px] text-zinc-600">&middot;</span>
                        <span className="text-[10px] text-zinc-500">{formatSize(doc.size)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {doc.tags.slice(0, 3).map(t => (
                        <span key={t} className="px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded text-[10px]">{t}</span>
                      ))}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-700 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </PlanGate>
  );
}
