'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Eye, MessageCircle, Clock, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface ReviewVideo {
  id: string;
  video_code: string;
  recording_status: string;
  tiktok_url: string | null;
  created_at: string;
  product: { id: string; name: string } | null;
}

export default function ClientReviewPage() {
  const [videos, setVideos] = useState<ReviewVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/client/videos?status=REVIEW');
      if (res.ok) {
        const json = await res.json();
        setVideos(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch review videos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleApprove = async (id: string) => {
    setApproving(id);
    try {
      const res = await fetch(`/api/client/videos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_status: 'READY_TO_POST', client_approved: true }),
      });
      if (res.ok) fetchVideos();
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (id: string) => {
    setApproving(id);
    try {
      const res = await fetch(`/api/client/videos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_status: 'EDITING', client_feedback: 'Needs revision' }),
      });
      if (res.ok) fetchVideos();
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="px-4 py-6 pb-24 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Review Videos</h1>
        <p className="text-zinc-400 text-sm">Approve or request changes on videos before posting</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-zinc-400">No videos pending review</h3>
          <p className="text-sm text-zinc-600 mt-1">Videos will appear here when they're ready for your approval.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map(v => (
            <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-medium text-white">{v.product?.name || v.video_code}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Submitted {new Date(v.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="px-2 py-0.5 text-xs rounded bg-orange-500/20 text-orange-400 border border-orange-500/20">
                  Pending Review
                </span>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <Link
                  href={`/client/videos/${v.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg text-xs text-zinc-300 hover:text-white transition-colors"
                >
                  <Eye className="w-3 h-3" /> Preview
                </Link>
                {v.tiktok_url && (
                  <a
                    href={v.tiktok_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg text-xs text-zinc-300 hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> View Video
                  </a>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => handleReject(v.id)}
                  disabled={approving === v.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-3 h-3" /> Request Changes
                </button>
                <button
                  onClick={() => handleApprove(v.id)}
                  disabled={approving === v.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-3 h-3" /> Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
