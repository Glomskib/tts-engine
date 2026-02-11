'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';

interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  item_count: number;
  created_at: string;
  updated_at: string;
}

const COLLECTION_COLORS = [
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Green', value: '#10B981' },
  { name: 'Yellow', value: '#F59E0B' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Red', value: '#EF4444' },
];

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCollection, setNewCollection] = useState({ name: '', description: '', color: '#8B5CF6' });
  const [creating, setCreating] = useState(false);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      const res = await fetch('/api/collections');
      if (res.ok) {
        const data = await res.json();
        setCollections(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch collections:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollection.name.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCollection),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewCollection({ name: '', description: '', color: '#8B5CF6' });
        fetchCollections();
        showSuccess('Collection created');
      } else {
        showError('Failed to create collection');
      }
    } catch (err) {
      console.error('Failed to create collection:', err);
      showError('Failed to create collection');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCollection = async (id: string) => {
    if (!confirm('Delete this collection? Scripts inside will not be deleted.')) return;

    try {
      const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCollections(collections.filter(c => c.id !== id));
        showSuccess('Collection deleted');
      } else {
        showError('Failed to delete collection');
      }
    } catch (err) {
      console.error('Failed to delete collection:', err);
      showError('Failed to delete collection');
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto pb-24 lg:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Collections</h1>
            <p className="text-zinc-400">Organize your scripts into folders</p>
          </div>
          <button type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-white text-zinc-900 rounded-lg font-medium hover:bg-zinc-100 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Collection
          </button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({length:6}).map((_,i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : collections.length === 0 ? (
          /* Empty State */
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto mb-4 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <h3 className="text-xl font-semibold text-white mb-2">No collections yet</h3>
            <p className="text-zinc-500 mb-6">Create your first collection to organize scripts</p>
            <button type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-500 transition-colors"
            >
              Create Collection
            </button>
          </div>
        ) : (
          /* Collections Grid */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map(collection => (
              <div
                key={collection.id}
                className="p-5 rounded-xl border border-white/10 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors group"
              >
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{ backgroundColor: collection.color + '20' }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke={collection.color}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>

                {/* Name & Description */}
                <h3 className="text-lg font-semibold text-white mb-1">{collection.name}</h3>
                {collection.description && (
                  <p className="text-sm text-zinc-500 mb-3 line-clamp-2">{collection.description}</p>
                )}

                {/* Meta */}
                <div className="flex items-center gap-4 text-sm text-zinc-500 mb-4">
                  <span>{collection.item_count || 0} scripts</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Link
                    href={`/admin/skit-library?collection=${collection.id}`}
                    className="flex-1 py-2 text-center bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm transition-colors"
                  >
                    View Scripts
                  </Link>
                  <button type="button"
                    onClick={() => handleDeleteCollection(collection.id)}
                    className="px-3 py-2 bg-zinc-800 text-zinc-400 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
            <div className="relative w-full max-w-md bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4">New Collection</h2>

                {/* Name */}
                <div className="mb-4">
                  <label className="block text-sm text-zinc-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={newCollection.name}
                    onChange={e => setNewCollection({ ...newCollection, name: e.target.value })}
                    placeholder="Q1 Campaign"
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-white/10 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    maxLength={100}
                  />
                </div>

                {/* Description */}
                <div className="mb-4">
                  <label className="block text-sm text-zinc-400 mb-1">Description (optional)</label>
                  <textarea
                    value={newCollection.description}
                    onChange={e => setNewCollection({ ...newCollection, description: e.target.value })}
                    placeholder="Scripts for our Q1 marketing push"
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-white/10 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    rows={2}
                  />
                </div>

                {/* Color */}
                <div className="mb-6">
                  <label className="block text-sm text-zinc-400 mb-2">Color</label>
                  <div className="flex gap-2">
                    {COLLECTION_COLORS.map(color => (
                      <button type="button"
                        key={color.value}
                        onClick={() => setNewCollection({ ...newCollection, color: color.value })}
                        className={`w-8 h-8 rounded-full transition-transform ${
                          newCollection.color === color.value ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110' : ''
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button type="button"
                    onClick={handleCreateCollection}
                    disabled={!newCollection.name.trim() || creating}
                    className="flex-1 py-2.5 bg-white text-zinc-900 rounded-lg font-medium hover:bg-zinc-100 transition-colors disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
