'use client';

import { useState, useEffect, useCallback } from 'react';

interface Comment {
  id: string;
  user_id: string;
  content: string;
  is_resolved: boolean;
  beat_index: number | null;
  created_at: string;
  updated_at: string;
  user?: {
    email: string;
  };
  replies?: Comment[];
}

interface ScriptCommentsProps {
  skitId: string;
  isOwner?: boolean;
  className?: string;
}

export default function ScriptComments({ skitId, isOwner = false, className = '' }: ScriptCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?skit_id=${skitId}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setLoading(false);
    }
  }, [skitId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skit_id: skitId,
          content: newComment.trim(),
        }),
      });

      if (res.ok) {
        setNewComment('');
        fetchComments();
      }
    } catch (err) {
      console.error('Failed to submit comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skit_id: skitId,
          content: replyContent.trim(),
          parent_id: parentId,
        }),
      });

      if (res.ok) {
        setReplyContent('');
        setReplyingTo(null);
        fetchComments();
      }
    } catch (err) {
      console.error('Failed to submit reply:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (commentId: string, resolved: boolean) => {
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_resolved: resolved }),
      });

      if (res.ok) {
        fetchComments();
      }
    } catch (err) {
      console.error('Failed to resolve comment:', err);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;

    try {
      const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchComments();
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getInitials = (email: string) => {
    return email.slice(0, 2).toUpperCase();
  };

  const filteredComments = showResolved
    ? comments
    : comments.filter(c => !c.is_resolved);

  const unresolvedCount = comments.filter(c => !c.is_resolved).length;
  const resolvedCount = comments.filter(c => c.is_resolved).length;

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Comments
          {unresolvedCount > 0 && (
            <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 rounded-full text-xs">
              {unresolvedCount}
            </span>
          )}
        </h3>

        {resolvedCount > 0 && (
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="text-sm text-zinc-400 hover:text-zinc-300"
          >
            {showResolved ? 'Hide resolved' : `Show resolved (${resolvedCount})`}
          </button>
        )}
      </div>

      {/* New comment form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-xs font-medium">
            You
          </div>
          <div className="flex-1">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none text-sm"
            />
            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={!newComment.trim() || submitting}
                className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Posting...' : 'Comment'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Comments list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-zinc-800" />
              <div className="flex-1">
                <div className="h-4 w-24 bg-zinc-800 rounded mb-2" />
                <div className="h-12 bg-zinc-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredComments.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          {comments.length === 0 ? 'No comments yet' : 'No unresolved comments'}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredComments.map(comment => (
            <div
              key={comment.id}
              className={`p-4 rounded-lg border ${
                comment.is_resolved
                  ? 'bg-zinc-900/30 border-white/5'
                  : 'bg-zinc-800/50 border-white/10'
              }`}
            >
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-700 text-zinc-300 flex items-center justify-center text-xs font-medium flex-shrink-0">
                  {comment.user?.email ? getInitials(comment.user.email) : '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-300">
                      {comment.user?.email?.split('@')[0] || 'Unknown'}
                    </span>
                    <span className="text-xs text-zinc-600">{formatTime(comment.created_at)}</span>
                    {comment.is_resolved && (
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                        Resolved
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${comment.is_resolved ? 'text-zinc-500' : 'text-zinc-300'}`}>
                    {comment.content}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-4 mt-2">
                    <button
                      onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Reply
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => handleResolve(comment.id, !comment.is_resolved)}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        {comment.is_resolved ? 'Unresolve' : 'Resolve'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-xs text-zinc-500 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>

                  {/* Reply form */}
                  {replyingTo === comment.id && (
                    <div className="mt-3 pl-4 border-l-2 border-zinc-700">
                      <textarea
                        value={replyContent}
                        onChange={e => setReplyContent(e.target.value)}
                        placeholder="Write a reply..."
                        rows={2}
                        className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none text-sm"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={() => {
                            setReplyingTo(null);
                            setReplyContent('');
                          }}
                          className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-300"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleReply(comment.id)}
                          disabled={!replyContent.trim() || submitting}
                          className="px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded text-sm disabled:opacity-50"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Replies */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-3 space-y-3 pl-4 border-l-2 border-zinc-700">
                      {comment.replies.map(reply => (
                        <div key={reply.id} className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                            {reply.user?.email ? getInitials(reply.user.email) : '??'}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-zinc-400">
                                {reply.user?.email?.split('@')[0] || 'Unknown'}
                              </span>
                              <span className="text-xs text-zinc-600">{formatTime(reply.created_at)}</span>
                            </div>
                            <p className="text-sm text-zinc-400">{reply.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
