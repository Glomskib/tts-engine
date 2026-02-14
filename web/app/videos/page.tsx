'use client';

import { useState, useEffect } from 'react';

interface Video {
  id: string;
  google_drive_url: string;
  caption_used: string;
  hashtags_used: string;
  status: string;
}

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [ttPostUrls, setTtPostUrls] = useState<Record<string, string>>({});

  const fetchVideos = async () => {
    try {
      const response = await fetch('/api/videos?status=ready_to_upload');
      const result = await response.json();
      if (result.ok) {
        setVideos(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const markPosted = async (videoId: string) => {
    const ttPostUrl = ttPostUrls[videoId];
    if (!ttPostUrl) return;

    try {
      const response = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'posted',
          tt_post_url: ttPostUrl,
          posted_at: new Date().toISOString()
        })
      });

      if (response.ok) {
        await fetchVideos();
        setTtPostUrls(prev => ({ ...prev, [videoId]: '' }));
      }
    } catch (error) {
      console.error('Failed to mark video as posted:', error);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  if (loading) return <div className="p-5 text-gray-700 dark:text-gray-300">Loading...</div>;

  return (
    <div className="p-4 sm:p-5 max-w-full overflow-hidden">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Videos Ready for Upload</h1>
      <div className="overflow-x-auto rounded-lg">
      <table className="w-full border-collapse min-w-[640px]">
        <thead>
          <tr>
            <th className="border border-gray-300 dark:border-gray-600 p-2 text-left bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100">ID</th>
            <th className="border border-gray-300 dark:border-gray-600 p-2 text-left bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100">Google Drive URL</th>
            <th className="border border-gray-300 dark:border-gray-600 p-2 text-left bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100">Caption</th>
            <th className="border border-gray-300 dark:border-gray-600 p-2 text-left bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100">Hashtags</th>
            <th className="border border-gray-300 dark:border-gray-600 p-2 text-left bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100">Status</th>
            <th className="border border-gray-300 dark:border-gray-600 p-2 text-left bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100">TikTok Post URL</th>
            <th className="border border-gray-300 dark:border-gray-600 p-2 text-left bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100">Action</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr key={video.id}>
              <td className="border border-gray-300 dark:border-gray-600 p-2 text-gray-800 dark:text-gray-200">{video.id}</td>
              <td className="border border-gray-300 dark:border-gray-600 p-2">
                <a href={video.google_drive_url} target="_blank" rel="noopener noreferrer" className="text-teal-600 dark:text-teal-400 hover:underline">
                  {video.google_drive_url}
                </a>
              </td>
              <td className="border border-gray-300 dark:border-gray-600 p-2 text-gray-800 dark:text-gray-200">{video.caption_used}</td>
              <td className="border border-gray-300 dark:border-gray-600 p-2 text-gray-800 dark:text-gray-200">{video.hashtags_used}</td>
              <td className="border border-gray-300 dark:border-gray-600 p-2 text-gray-800 dark:text-gray-200">{video.status}</td>
              <td className="border border-gray-300 dark:border-gray-600 p-2">
                <input
                  type="text"
                  value={ttPostUrls[video.id] || ''}
                  onChange={(e) => setTtPostUrls(prev => ({ ...prev, [video.id]: e.target.value }))}
                  placeholder="TikTok post URL"
                  className="w-full p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                />
              </td>
              <td className="border border-gray-300 dark:border-gray-600 p-2">
                <button type="button" onClick={() => markPosted(video.id)} className="px-3 py-1 bg-teal-600 text-white rounded hover:bg-teal-700">
                  Mark Posted
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {videos.length === 0 && <p className="mt-4 text-gray-600 dark:text-gray-400">No videos ready for upload.</p>}
    </div>
  );
}
