'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Eye, Search, Brain, Upload, Video, TrendingUp, X, Loader2, ExternalLink, ArrowLeft } from 'lucide-react';
import { PullToRefresh } from '@/components/ui/PullToRefresh';

interface Competitor {
  id: string;
  name: string;
  tiktok_handle: string;
  category: string | null;
  notes: string | null;
  total_videos_tracked: number;
  avg_views: number;
  avg_engagement: number;
  last_checked_at: string | null;
  created_at: string;
}

interface CompetitorVideo {
  id: string;
  tiktok_url: string;
  title: string | null;
  hook_text: string | null;
  content_type: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement_rate: number;
  spotted_at: string;
}

interface AnalysisResult {
  summary?: string;
  top_hooks?: string[];
  content_patterns?: string[];
  posting_style?: string;
  weaknesses?: string[];
  recommendations?: string[];
  remix_ideas?: string[];
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<CompetitorVideo[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Add form
  const [newName, setNewName] = useState('');
  const [newHandle, setNewHandle] = useState('');
  const [newCategory, setNewCategory] = useState('');

  // Track video form
  const [trackUrl, setTrackUrl] = useState('');
  const [tracking, setTracking] = useState(false);

  useEffect(() => { fetchCompetitors(); }, []);

  const fetchCompetitors = async () => {
    try {
      const res = await fetch('/api/competitors');
      const data = await res.json();
      if (data.ok) setCompetitors(data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newHandle.trim()) return;
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, tiktok_handle: newHandle, category: newCategory || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setCompetitors([data.data, ...competitors]);
        setShowAdd(false);
        setNewName(''); setNewHandle(''); setNewCategory('');
      }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this competitor and all tracked videos?')) return;
    try {
      await fetch(`/api/competitors/${id}`, { method: 'DELETE' });
      setCompetitors(competitors.filter(c => c.id !== id));
      if (selectedId === id) { setSelectedId(null); setSelectedVideos([]); setAnalysis(null); }
    } catch (e) { console.error(e); }
  };

  const selectCompetitor = async (id: string) => {
    setSelectedId(id);
    setAnalysis(null);
    setLoadingVideos(true);
    try {
      const res = await fetch(`/api/competitors/${id}`);
      const data = await res.json();
      if (data.ok) setSelectedVideos(data.data.videos || []);
    } catch (e) { console.error(e); }
    finally { setLoadingVideos(false); }
  };

  const handleTrackVideo = async () => {
    if (!trackUrl.trim() || !selectedId) return;
    setTracking(true);
    try {
      const res = await fetch(`/api/competitors/${selectedId}/track-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiktok_url: trackUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelectedVideos([data.data, ...selectedVideos]);
        setTrackUrl('');
        fetchCompetitors(); // refresh stats
      }
    } catch (e) { console.error(e); }
    finally { setTracking(false); }
  };

  const handleAnalyze = async () => {
    if (!selectedId) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch(`/api/competitors/${selectedId}/analysis`);
      const data = await res.json();
      if (data.ok) setAnalysis(data.data);
    } catch (e) { console.error(e); }
    finally { setAnalyzing(false); }
  };

  const handleImportAsWinner = async (video: CompetitorVideo) => {
    try {
      const res = await fetch('/api/winners/import-tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: video.tiktok_url, notes: `Imported from competitor: ${video.title || video.tiktok_url}` }),
      });
      const data = await res.json();
      if (data.ok) {
        alert('Added to Winners Bank!');
      }
    } catch (e) { console.error(e); }
  };

  const selected = competitors.find(c => c.id === selectedId);

  const handleRefresh = async () => {
    await fetchCompetitors();
  };

  if (loading) {
    return (
      <div className="px-4 py-6 space-y-4">
        <div className="h-8 w-56 bg-zinc-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} className="pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold">Competitor Tracker</h1>
          <p className="text-sm text-zinc-400 mt-1">Monitor competitor TikTok accounts and steal their winning patterns</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm transition-colors btn-press min-h-[44px]">
          <Plus className="w-4 h-4" /> Add Competitor
        </button>
      </div>

        {/* Add Form */}
        {showAdd && (
          <div className="mb-6 p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
            <h3 className="text-base font-semibold mb-3">Track New Competitor</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (e.g. Sarah's Wellness)" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm" />
              <input value={newHandle} onChange={e => setNewHandle(e.target.value)} placeholder="@handle" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm" />
              <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="Category (optional)" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleAdd} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm">Add</button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Competitor List - hide on mobile when detail selected */}
          <div className={`lg:col-span-1 space-y-3 ${selectedId ? 'hidden lg:block' : ''}`}>
            {competitors.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p>No competitors tracked yet</p>
              </div>
            ) : competitors.map(c => (
              <div
                key={c.id}
                onClick={() => selectCompetitor(c.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-colors card-press ${
                  selectedId === c.id ? 'bg-zinc-800 border-indigo-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-sm text-zinc-400">{c.tiktok_handle}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }} className="p-2.5 hover:bg-zinc-700 rounded-lg ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div>
                    <div className="text-sm font-semibold">{c.total_videos_tracked}</div>
                    <div className="text-[10px] text-zinc-500">Videos</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{c.avg_views > 1000 ? `${(c.avg_views / 1000).toFixed(1)}K` : c.avg_views}</div>
                    <div className="text-[10px] text-zinc-500">Avg Views</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{Number(c.avg_engagement).toFixed(1)}%</div>
                    <div className="text-[10px] text-zinc-500">Engage</div>
                  </div>
                </div>
                {c.category && <div className="mt-2 text-xs text-zinc-500">{c.category}</div>}
              </div>
            ))}
          </div>

          {/* Detail Panel */}
          <div className={`lg:col-span-2 ${selectedId ? '' : 'hidden lg:block'}`}>
            {!selected ? (
              <div className="flex items-center justify-center h-64 text-zinc-500">
                <div className="text-center">
                  <Eye className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p>Select a competitor to view details</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Mobile Back Button */}
                <button
                  onClick={() => { setSelectedId(null); setSelectedVideos([]); setAnalysis(null); }}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-3 lg:hidden btn-press min-h-[44px]"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to list
                </button>

                {/* Competitor Header */}
                <div className="p-4 sm:p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div>
                      <h2 className="text-lg font-bold">{selected.name}</h2>
                      <p className="text-sm text-zinc-400">{selected.tiktok_handle} {selected.category ? `| ${selected.category}` : ''}</p>
                    </div>
                    <button
                      onClick={handleAnalyze}
                      disabled={analyzing}
                      className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm transition-colors btn-press min-h-[44px] self-start"
                    >
                      {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                      {analyzing ? 'Analyzing...' : 'AI Analysis'}
                    </button>
                  </div>

                  {/* Track Video Input */}
                  <div className="flex gap-2">
                    <input
                      value={trackUrl}
                      onChange={e => setTrackUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleTrackVideo()}
                      placeholder="Paste TikTok URL to track..."
                      className="flex-1 px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm min-h-[44px]"
                    />
                    <button
                      onClick={handleTrackVideo}
                      disabled={tracking || !trackUrl.trim()}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm btn-press min-h-[44px]"
                    >
                      {tracking ? 'Adding...' : 'Track'}
                    </button>
                  </div>
                </div>

                {/* AI Analysis Results */}
                {analysis && (
                  <div className="p-5 bg-zinc-900 border border-violet-500/30 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="w-4 h-4 text-violet-400" />
                      <h3 className="font-semibold text-violet-300">AI Analysis</h3>
                    </div>
                    {analysis.summary && <p className="text-sm text-zinc-300 mb-4">{analysis.summary}</p>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {analysis.top_hooks && analysis.top_hooks.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-zinc-400 mb-2 uppercase">Top Hook Patterns</div>
                          <ul className="space-y-1">
                            {analysis.top_hooks.map((h, i) => (
                              <li key={i} className="text-sm text-zinc-300 flex items-start gap-1.5">
                                <span className="text-violet-400 mt-0.5">-</span> {h}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.weaknesses && analysis.weaknesses.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-zinc-400 mb-2 uppercase">Weaknesses to Exploit</div>
                          <ul className="space-y-1">
                            {analysis.weaknesses.map((w, i) => (
                              <li key={i} className="text-sm text-zinc-300 flex items-start gap-1.5">
                                <span className="text-yellow-400 mt-0.5">-</span> {w}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.recommendations && analysis.recommendations.length > 0 && (
                        <div className="md:col-span-2">
                          <div className="text-xs font-semibold text-zinc-400 mb-2 uppercase">Recommendations</div>
                          <ul className="space-y-1">
                            {analysis.recommendations.map((r, i) => (
                              <li key={i} className="text-sm text-zinc-300 flex items-start gap-1.5">
                                <span className="text-green-400 mt-0.5">{i + 1}.</span> {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.remix_ideas && analysis.remix_ideas.length > 0 && (
                        <div className="md:col-span-2">
                          <div className="text-xs font-semibold text-zinc-400 mb-2 uppercase">Remix Ideas</div>
                          <ul className="space-y-1">
                            {analysis.remix_ideas.map((r, i) => (
                              <li key={i} className="text-sm text-zinc-300 flex items-start gap-1.5">
                                <span className="text-blue-400 mt-0.5">-</span> {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tracked Videos */}
                <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Video className="w-4 h-4 text-zinc-400" />
                    Tracked Videos ({selectedVideos.length})
                  </h3>
                  {loadingVideos ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
                  ) : selectedVideos.length === 0 ? (
                    <p className="text-sm text-zinc-500 py-4">No videos tracked yet. Paste a TikTok URL above to start.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedVideos.map(v => (
                        <div key={v.id} className="p-3 bg-zinc-800 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{v.title || v.tiktok_url}</div>
                              {v.hook_text && <div className="text-xs text-indigo-400 mt-0.5 truncate">Hook: {v.hook_text}</div>}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <a href={v.tiktok_url} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-zinc-700 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center" title="Open on TikTok">
                                <ExternalLink className="w-4 h-4 text-zinc-400" />
                              </a>
                              <button onClick={() => handleImportAsWinner(v)} className="p-2 hover:bg-zinc-700 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center" title="Import as Winner">
                                <Upload className="w-4 h-4 text-green-400" />
                              </button>
                            </div>
                          </div>
                          <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                            <span><Eye className="w-3 h-3 inline mr-1" />{v.views.toLocaleString()}</span>
                            <span>{v.likes.toLocaleString()} likes</span>
                            <span>{v.comments.toLocaleString()} comments</span>
                            {v.engagement_rate > 0 && <span className="text-green-400">{Number(v.engagement_rate).toFixed(1)}% engage</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
    </PullToRefresh>
  );
}
