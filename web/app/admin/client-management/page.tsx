'use client';

import { useState, useEffect } from 'react';
import { Users, UserPlus, Mail, Trash2, RefreshCw } from 'lucide-react';
import { SkeletonContent } from '@/components/ui/Skeleton';

interface Editor {
  id: string;
  email: string;
  full_name?: string;
  created_at: string;
  assigned_videos_count: number;
}

interface VideoAssignment {
  id: string;
  video_code: string;
  title: string;
  recording_status: string;
  product_name?: string;
  brand_name?: string;
}

export default function ClientManagementPage() {
  const [editors, setEditors] = useState<Editor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEditor, setSelectedEditor] = useState<Editor | null>(null);
  const [editorVideos, setEditorVideos] = useState<VideoAssignment[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchEditors();
  }, []);

  const fetchEditors = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/editors/managed', { credentials: 'include' });
      const data = await res.json();
      setEditors(data.editors || []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load editors' });
    } finally {
      setLoading(false);
    }
  };

  const fetchEditorVideos = async (editorId: string) => {
    try {
      const res = await fetch(`/api/admin/editors/${editorId}/videos`, { credentials: 'include' });
      const data = await res.json();
      setEditorVideos(data.videos || []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load editor videos' });
    }
  };

  const handleSelectEditor = (editor: Editor) => {
    setSelectedEditor(editor);
    fetchEditorVideos(editor.id);
  };

  const handleInviteEditor = async () => {
    if (!inviteEmail.trim()) return;

    setInviting(true);
    try {
      const res = await fetch('/api/admin/editors/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Invitation sent!' });
        setInviteEmail('');
        setShowInviteModal(false);
        fetchEditors();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to invite');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to invite editor';
      setMessage({ type: 'error', text: msg });
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveEditor = async (editorId: string) => {
    if (!confirm('Remove this editor? They will lose access to all assigned videos.')) return;

    try {
      const res = await fetch(`/api/admin/editors/${editorId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Editor removed' });
        setSelectedEditor(null);
        setEditorVideos([]);
        fetchEditors();
      } else {
        throw new Error('Failed to remove');
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to remove editor' });
    }
  };

  const handleUnassignVideo = async (videoId: string) => {
    try {
      const res = await fetch(`/api/admin/editors/${selectedEditor?.id}/videos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ video_id: videoId }),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Video unassigned' });
        if (selectedEditor) fetchEditorVideos(selectedEditor.id);
        fetchEditors();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to unassign video' });
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Client Management</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage video editors and assignments</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Invite Editor
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
        }`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-2 opacity-70 hover:opacity-100">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-white">Editors ({editors.length})</h2>
            <button onClick={fetchEditors} className="text-zinc-400 hover:text-white">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <SkeletonContent rows={4} />
          ) : editors.length === 0 ? (
            <div className="text-center py-8 bg-zinc-900 rounded-lg border border-zinc-800">
              <Users className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-zinc-400">No editors yet</p>
              <p className="text-zinc-500 text-sm">Invite your first editor to get started</p>
            </div>
          ) : (
            editors.map(editor => (
              <div
                key={editor.id}
                onClick={() => handleSelectEditor(editor)}
                className={`p-4 bg-zinc-900 rounded-lg border cursor-pointer transition-colors ${
                  selectedEditor?.id === editor.id ? 'border-purple-500' : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{editor.full_name || editor.email}</p>
                    {editor.full_name && <p className="text-zinc-400 text-sm">{editor.email}</p>}
                  </div>
                  <span className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded text-xs">
                    {editor.assigned_videos_count} videos
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Editor Detail / Videos */}
        <div className="lg:col-span-2">
          {selectedEditor ? (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-white">{selectedEditor.full_name || selectedEditor.email}</h2>
                  <p className="text-zinc-400 text-sm">{selectedEditor.email}</p>
                </div>
                <button
                  onClick={() => handleRemoveEditor(selectedEditor.id)}
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-sm flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
              </div>

              <h3 className="text-sm font-medium text-zinc-400 mb-3">Assigned Videos ({editorVideos.length})</h3>

              {editorVideos.length === 0 ? (
                <p className="text-zinc-500 text-sm">No videos assigned</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {editorVideos.map(video => (
                    <div key={video.id} className="flex items-center justify-between p-3 bg-zinc-800 rounded">
                      <div>
                        <p className="text-white text-sm">{video.video_code || video.title}</p>
                        <p className="text-zinc-400 text-xs">
                          {[video.brand_name, video.product_name].filter(Boolean).join(' \u2022 ') || 'No product info'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-zinc-700 text-zinc-300 rounded text-xs">
                          {video.recording_status?.replace(/_/g, ' ') || 'unknown'}
                        </span>
                        <button
                          onClick={() => handleUnassignVideo(video.id)}
                          className="text-zinc-500 hover:text-red-400"
                          title="Unassign"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-zinc-900 rounded-lg border border-zinc-800">
              <p className="text-zinc-500">Select an editor to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-md border border-zinc-800">
            <h3 className="text-lg font-semibold text-white mb-4">Invite Editor</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 block mb-1">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="editor@example.com"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleInviteEditor(); }}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInviteEditor}
                  disabled={inviting || !inviteEmail.trim()}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded text-sm flex items-center gap-2"
                >
                  {inviting ? 'Sending...' : (
                    <>
                      <Mail className="w-4 h-4" />
                      Send Invite
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
