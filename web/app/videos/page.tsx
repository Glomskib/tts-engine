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
        await fetchVideos(); // Refresh list
        setTtPostUrls(prev => ({ ...prev, [videoId]: '' })); // Clear input
      }
    } catch (error) {
      console.error('Failed to mark video as posted:', error);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Videos Ready for Upload</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>ID</th>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Google Drive URL</th>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Caption</th>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Hashtags</th>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Status</th>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>TikTok Post URL</th>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr key={video.id}>
              <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.id}</td>
              <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                <a href={video.google_drive_url} target="_blank" rel="noopener noreferrer">
                  {video.google_drive_url}
                </a>
              </td>
              <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.caption_used}</td>
              <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.hashtags_used}</td>
              <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.status}</td>
              <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                <input
                  type="text"
                  value={ttPostUrls[video.id] || ''}
                  onChange={(e) => setTtPostUrls(prev => ({ ...prev, [video.id]: e.target.value }))}
                  placeholder="TikTok post URL"
                  style={{ width: '100%' }}
                />
              </td>
              <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                <button onClick={() => markPosted(video.id)}>Mark Posted</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {videos.length === 0 && <p>No videos ready for upload.</p>}
    </div>
  );
}
