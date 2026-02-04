'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface Video {
  id: string;
  variant_id: string;
  google_drive_url: string;
  caption_used: string;
  hashtags_used: string;
  status: string;
  posted_at?: string;
}

export default function UploaderPortalPage() {
  const params = useParams();
  const accountId = params.id as string;
  
  const [readyVideos, setReadyVideos] = useState<Video[]>([]);
  const [postedVideos, setPostedVideos] = useState<Video[]>([]);
  const [needsEditVideos, setNeedsEditVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ttPostUrls, setTtPostUrls] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'ready' | 'posted' | 'needs_edit'>('ready');

  const fetchVideos = async () => {
    try {
      // Fetch ready to upload videos
      const readyResponse = await fetch(`/api/videos?account_id=${accountId}&status=ready_to_upload`);
      const readyResult = await readyResponse.json();
      
      if (readyResult.ok) {
        setReadyVideos(readyResult.data);
      } else {
        setError(readyResult.error);
        return;
      }

      // Fetch needs edit videos
      const needsEditResponse = await fetch(`/api/videos?account_id=${accountId}&status=needs_edit`);
      const needsEditResult = await needsEditResponse.json();
      
      if (needsEditResult.ok) {
        setNeedsEditVideos(needsEditResult.data);
      }

      // Fetch posted videos from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const postedResponse = await fetch(`/api/videos?account_id=${accountId}&status=posted`);
      const postedResult = await postedResponse.json();
      
      if (postedResult.ok) {
        // Filter to last 7 days
        const recentPosted = postedResult.data.filter((video: Video) => 
          video.posted_at && new Date(video.posted_at) >= sevenDaysAgo
        );
        setPostedVideos(recentPosted);
      }

      setError('');
    } catch {
      setError('Failed to fetch videos');
    } finally {
      setLoading(false);
    }
  };

  const markPosted = async (videoId: string) => {
    const ttPostUrl = ttPostUrls[videoId];
    if (!ttPostUrl?.trim()) {
      setError('TikTok post URL is required');
      return;
    }

    try {
      const response = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'posted',
          tt_post_url: ttPostUrl.trim(),
          posted_at: new Date().toISOString()
        })
      });

      const result = await response.json();
      if (result.ok) {
        await fetchVideos();
        setTtPostUrls(prev => ({ ...prev, [videoId]: '' }));
        setError('');
      } else {
        setError(result.error);
      }
    } catch {
      setError('Failed to mark video as posted');
    }
  };

  const markReadyToUpload = async (videoId: string) => {
    try {
      const response = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'ready_to_upload'
        })
      });

      const result = await response.json();
      if (result.ok) {
        await fetchVideos();
        setError('Video marked as ready to upload');
      } else {
        setError(result.error);
      }
    } catch {
      setError('Failed to mark video as ready to upload');
    }
  };

  useEffect(() => {
    if (accountId) {
      fetchVideos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  if (loading) return <div>Loading videos...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Uploader Portal - Account {accountId}</h1>
      
      {error && <div style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</div>}

      <div style={{ marginBottom: '20px' }}>
        <button type="button" 
          onClick={() => setActiveTab('ready')}
          style={{ 
            marginRight: '10px', 
            padding: '10px 20px',
            backgroundColor: activeTab === 'ready' ? '#007bff' : '#f8f9fa',
            color: activeTab === 'ready' ? 'white' : 'black',
            border: '1px solid #ccc'
          }}
        >
          Ready to Upload ({readyVideos.length})
        </button>
        <button type="button" 
          onClick={() => setActiveTab('needs_edit')}
          style={{ 
            marginRight: '10px',
            padding: '10px 20px',
            backgroundColor: activeTab === 'needs_edit' ? '#007bff' : '#f8f9fa',
            color: activeTab === 'needs_edit' ? 'white' : 'black',
            border: '1px solid #ccc'
          }}
        >
          Needs Edit ({needsEditVideos.length})
        </button>
        <button type="button" 
          onClick={() => setActiveTab('posted')}
          style={{ 
            padding: '10px 20px',
            backgroundColor: activeTab === 'posted' ? '#007bff' : '#f8f9fa',
            color: activeTab === 'posted' ? 'white' : 'black',
            border: '1px solid #ccc'
          }}
        >
          Posted Last 7 Days ({postedVideos.length})
        </button>
      </div>

      {activeTab === 'ready' && (
        <div>
          <h2>Videos Ready for Upload</h2>
          {readyVideos.length === 0 ? (
            <p>No videos ready for upload.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Video ID</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Google Drive URL</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Caption</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Hashtags</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>TikTok Post URL</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {readyVideos.map((video) => (
                  <tr key={video.id}>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      {video.id.slice(0, 8)}...
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      <a href={video.google_drive_url} target="_blank" rel="noopener noreferrer">
                        {video.google_drive_url.length > 50 
                          ? video.google_drive_url.slice(0, 50) + '...' 
                          : video.google_drive_url}
                      </a>
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.caption_used}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.hashtags_used}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      <input
                        type="text"
                        value={ttPostUrls[video.id] || ''}
                        onChange={(e) => setTtPostUrls(prev => ({ ...prev, [video.id]: e.target.value }))}
                        placeholder="https://tiktok.com/@user/video/..."
                        style={{ width: '100%', padding: '4px' }}
                      />
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      <button type="button" 
                        onClick={() => markPosted(video.id)}
                        disabled={!ttPostUrls[video.id]?.trim()}
                        style={{ padding: '5px 10px' }}
                      >
                        Mark Posted
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'needs_edit' && (
        <div>
          <h2>Videos Needing Edit</h2>
          {needsEditVideos.length === 0 ? (
            <p>No videos need editing.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Video ID</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Google Drive URL</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Variant</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Caption</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Hashtags</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {needsEditVideos.map((video) => (
                  <tr key={video.id}>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      {video.id.slice(0, 8)}...
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      <a href={video.google_drive_url} target="_blank" rel="noopener noreferrer">
                        {video.google_drive_url?.length > 50 
                          ? video.google_drive_url.slice(0, 50) + '...' 
                          : video.google_drive_url || 'N/A'}
                      </a>
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      <a href={`/variants/${video.variant_id}`} target="_blank" rel="noopener noreferrer">
                        Open Variant
                      </a>
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.caption_used || 'N/A'}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.hashtags_used || 'N/A'}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      <button type="button" 
                        onClick={() => markReadyToUpload(video.id)}
                        style={{ padding: '5px 10px' }}
                      >
                        Mark Ready to Upload
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'posted' && (
        <div>
          <h2>Posted Videos (Last 7 Days)</h2>
          {postedVideos.length === 0 ? (
            <p>No videos posted in the last 7 days.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Video ID</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Caption</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Hashtags</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Posted At</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {postedVideos.map((video) => (
                  <tr key={video.id}>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      {video.id.slice(0, 8)}...
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.caption_used}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.hashtags_used}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      {video.posted_at ? new Date(video.posted_at).toLocaleString() : 'N/A'}
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
