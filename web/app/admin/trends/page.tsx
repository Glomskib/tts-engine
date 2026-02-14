'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Hash, Music, TrendingUp, Plus, Trash2, ExternalLink,
  ArrowUpRight, ArrowDownRight, Minus, Sparkles, X
} from 'lucide-react';
import Link from 'next/link';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { PageErrorState } from '@/components/ui/PageErrorState';
import { useToast } from '@/contexts/ToastContext';

interface Hashtag {
  id: string;
  hashtag: string;
  category: string | null;
  view_count: number;
  video_count: number;
  growth_rate: number;
  notes: string | null;
  spotted_at: string;
}

interface Sound {
  id: string;
  sound_name: string;
  sound_url: string | null;
  creator: string | null;
  video_count: number;
  growth_rate: number;
  notes: string | null;
  spotted_at: string;
}

type Tab = 'hashtags' | 'sounds';

function GrowthBadge({ rate }: { rate: number }) {
  if (rate > 0) return (
    <span className="flex items-center gap-0.5 text-xs text-green-400">
      <ArrowUpRight className="w-3 h-3" />+{rate}%
    </span>
  );
  if (rate < 0) return (
    <span className="flex items-center gap-0.5 text-xs text-red-400">
      <ArrowDownRight className="w-3 h-3" />{rate}%
    </span>
  );
  return <span className="flex items-center gap-0.5 text-xs text-zinc-500"><Minus className="w-3 h-3" />0%</span>;
}

function formatNum(n: number): string {
  if (n >= 1000000000) return (n / 1000000000).toFixed(1) + 'B';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export default function TrendsPage() {
  const [tab, setTab] = useState<Tab>('hashtags');
  const [hashtags, setHashtags] = useState<Hashtag[]>([]);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Add form
  const [addHashtag, setAddHashtag] = useState('');
  const [addCategory, setAddCategory] = useState('');
  const [addViewCount, setAddViewCount] = useState('');
  const [addVideoCount, setAddVideoCount] = useState('');
  const [addGrowth, setAddGrowth] = useState('');
  const [addSoundName, setAddSoundName] = useState('');
  const [addSoundUrl, setAddSoundUrl] = useState('');
  const [addCreator, setAddCreator] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/trends');
      if (res.ok) {
        const json = await res.json();
        setHashtags(json.data?.hashtags || []);
        setSounds(json.data?.sounds || []);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Failed to load trends data');
      }
    } catch (err) {
      console.error('Failed to fetch trends:', err);
      setError('Failed to load trends data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const body = tab === 'hashtags'
        ? {
            type: 'hashtag',
            hashtag: addHashtag.startsWith('#') ? addHashtag : `#${addHashtag}`,
            category: addCategory || undefined,
            view_count: parseInt(addViewCount) || 0,
            video_count: parseInt(addVideoCount) || 0,
            growth_rate: parseFloat(addGrowth) || 0,
            notes: addNotes || undefined,
          }
        : {
            type: 'sound',
            sound_name: addSoundName,
            sound_url: addSoundUrl || undefined,
            creator: addCreator || undefined,
            video_count: parseInt(addVideoCount) || 0,
            growth_rate: parseFloat(addGrowth) || 0,
            notes: addNotes || undefined,
          };

      const res = await fetch('/api/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        resetForm();
        setShowAdd(false);
        fetchData();
        showSuccess('Trend saved');
      } else {
        showError('Failed to save trend');
      }
    } catch (err) {
      console.error('Failed to save trend:', err);
      showError('Failed to save trend');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, type: 'hashtag' | 'sound') => {
    if (!confirm('Delete this item?')) return;
    try {
      const res = await fetch(`/api/trends?id=${id}&type=${type}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
        showSuccess('Trend deleted');
      } else {
        showError('Failed to delete trend');
      }
    } catch (err) {
      console.error('Failed to delete trend:', err);
      showError('Failed to delete trend');
    }
  };

  const resetForm = () => {
    setAddHashtag(''); setAddCategory(''); setAddViewCount('');
    setAddVideoCount(''); setAddGrowth(''); setAddSoundName('');
    setAddSoundUrl(''); setAddCreator(''); setAddNotes('');
  };

  if (error && !loading) {
    return (
      <PullToRefresh onRefresh={fetchData}>
        <div className="px-4 py-6 pb-24 lg:pb-8 max-w-5xl mx-auto">
          <PageErrorState message={error} onRetry={fetchData} />
        </div>
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={fetchData}>
      <div className="px-4 py-6 pb-24 lg:pb-8 space-y-5 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Trending</h1>
            <p className="text-zinc-400 text-sm">Track trending hashtags and sounds for content ideas</p>
          </div>
          <button
            onClick={() => { setShowAdd(true); resetForm(); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add {tab === 'hashtags' ? 'Hashtag' : 'Sound'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-800">
          {([['hashtags', 'Hashtags', Hash], ['sounds', 'Sounds', Music]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
              <span className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">
                {key === 'hashtags' ? hashtags.length : sounds.length}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <SkeletonTable rows={5} cols={4} />
        ) : tab === 'hashtags' ? (
          hashtags.length === 0 ? (
            <div className="text-center py-16">
              <Hash className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400">No trending hashtags tracked yet</p>
              <p className="text-xs text-zinc-600 mt-1">Add hashtags to monitor their performance</p>
            </div>
          ) : (
            <div className="space-y-2">
              {hashtags.map(h => (
                <div key={h.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center shrink-0">
                    <Hash className="w-5 h-5 text-teal-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{h.hashtag}</span>
                      {h.category && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{h.category}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500">
                      <span>{formatNum(h.view_count)} views</span>
                      <span>{formatNum(h.video_count)} videos</span>
                      <span>Spotted {new Date(h.spotted_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <GrowthBadge rate={h.growth_rate} />
                  <Link
                    href={`/admin/content-studio`}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-teal-500/10 text-teal-400 rounded-lg text-xs hover:bg-teal-500/20 transition-colors"
                  >
                    <Sparkles className="w-3 h-3" /> Use
                  </Link>
                  <button
                    onClick={() => handleDelete(h.id, 'hashtag')}
                    className="shrink-0 p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          sounds.length === 0 ? (
            <div className="text-center py-16">
              <Music className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400">No trending sounds tracked yet</p>
              <p className="text-xs text-zinc-600 mt-1">Add sounds to keep tabs on what&apos;s popular</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sounds.map(s => (
                <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                    <Music className="w-5 h-5 text-teal-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{s.sound_name}</span>
                      {s.creator && <span className="text-[10px] text-zinc-500">by {s.creator}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500">
                      <span>{formatNum(s.video_count)} videos</span>
                      <span>Spotted {new Date(s.spotted_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <GrowthBadge rate={s.growth_rate} />
                  {s.sound_url && (
                    <a href={s.sound_url} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1.5 text-zinc-500 hover:text-white">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(s.id, 'sound')}
                    className="shrink-0 p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <h3 className="text-lg font-semibold text-white">
                  Add {tab === 'hashtags' ? 'Hashtag' : 'Sound'}
                </h3>
                <button onClick={() => setShowAdd(false)} className="text-zinc-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                {tab === 'hashtags' ? (
                  <>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Hashtag</label>
                      <input
                        value={addHashtag}
                        onChange={e => setAddHashtag(e.target.value)}
                        placeholder="#trending"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Category</label>
                      <input
                        value={addCategory}
                        onChange={e => setAddCategory(e.target.value)}
                        placeholder="Health, Beauty, etc."
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Views</label>
                        <input
                          type="number"
                          value={addViewCount}
                          onChange={e => setAddViewCount(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-teal-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Videos</label>
                        <input
                          type="number"
                          value={addVideoCount}
                          onChange={e => setAddVideoCount(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-teal-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Sound Name</label>
                      <input
                        value={addSoundName}
                        onChange={e => setAddSoundName(e.target.value)}
                        placeholder="Original Sound - creator"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Sound URL</label>
                      <input
                        value={addSoundUrl}
                        onChange={e => setAddSoundUrl(e.target.value)}
                        placeholder="https://tiktok.com/..."
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Creator</label>
                        <input
                          value={addCreator}
                          onChange={e => setAddCreator(e.target.value)}
                          placeholder="@creator"
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-teal-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Videos Using</label>
                        <input
                          type="number"
                          value={addVideoCount}
                          onChange={e => setAddVideoCount(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-teal-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Growth Rate (%)</label>
                  <input
                    type="number"
                    value={addGrowth}
                    onChange={e => setAddGrowth(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Notes</label>
                  <input
                    value={addNotes}
                    onChange={e => setAddNotes(e.target.value)}
                    placeholder="Why is this trending?"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-zinc-800">
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm">Cancel</button>
                <button
                  onClick={handleAdd}
                  disabled={saving || (tab === 'hashtags' ? !addHashtag : !addSoundName)}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
