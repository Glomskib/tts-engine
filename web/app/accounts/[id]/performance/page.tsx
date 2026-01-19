'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface Video {
  id: string;
  tt_post_url?: string;
  views_total?: number;
  likes_total?: number;
  comments_total?: number;
  shares_total?: number;
  orders_total?: number;
  revenue_total?: number;
  last_metric_at?: string;
  caption_used?: string;
  hashtags_used?: string;
}

interface Winner {
  variant_id: string;
  video_id: string;
  score: number;
  reason: string;
}

interface MetricForm {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  orders: number;
  revenue: number;
  metric_date: string;
}

export default function PerformancePage() {
  const params = useParams();
  const accountId = params.id as string;
  
  const [videos, setVideos] = useState<Video[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [activeMetricForm, setActiveMetricForm] = useState<string | null>(null);
  const [metricForms, setMetricForms] = useState<Record<string, MetricForm>>({});

  const fetchPostedVideos = async () => {
    try {
      const response = await fetch(`/api/videos?account_id=${accountId}&status=posted`);
      const result = await response.json();
      
      if (result.ok) {
        setVideos(result.data);
        setError('');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to fetch posted videos');
    } finally {
      setLoading(false);
    }
  };

  const initializeMetricForm = (videoId: string) => {
    const today = new Date().toISOString().split('T')[0];
    setMetricForms(prev => ({
      ...prev,
      [videoId]: {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
        orders: 0,
        revenue: 0,
        metric_date: today
      }
    }));
  };

  const updateMetricForm = (videoId: string, field: keyof MetricForm, value: string | number) => {
    setMetricForms(prev => ({
      ...prev,
      [videoId]: {
        ...prev[videoId],
        [field]: field === 'metric_date' ? value : Number(value)
      }
    }));
  };

  const submitMetrics = async (videoId: string) => {
    const form = metricForms[videoId];
    if (!form) return;

    try {
      const response = await fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: videoId,
          account_id: accountId,
          ...form
        })
      });

      const result = await response.json();
      if (result.ok) {
        setActiveMetricForm(null);
        await fetchPostedVideos(); // Refresh to show updated totals
        setError('Metrics saved successfully');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to save metrics');
    }
  };

  const evaluateWinners = async () => {
    setEvaluating(true);
    try {
      const response = await fetch('/api/variants/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          days: 7
        })
      });

      const result = await response.json();
      if (result.ok) {
        setWinners(result.winners || []);
        setError(`Evaluated ${result.evaluated_count} variants, found ${result.winners_count} winners`);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to evaluate winners');
    } finally {
      setEvaluating(false);
    }
  };

  const openMetricForm = (videoId: string) => {
    initializeMetricForm(videoId);
    setActiveMetricForm(videoId);
  };

  useEffect(() => {
    if (accountId) {
      fetchPostedVideos();
    }
  }, [accountId]);

  if (loading) return <div>Loading performance data...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Performance Dashboard - Account {accountId}</h1>
      
      {error && (
        <div style={{ 
          color: error.includes('successfully') || error.includes('Evaluated') ? 'green' : 'red', 
          marginBottom: '20px' 
        }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={evaluateWinners}
          disabled={evaluating}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#28a745', 
            color: 'white', 
            border: 'none',
            marginRight: '10px'
          }}
        >
          {evaluating ? 'Evaluating...' : 'Evaluate Winners (7d)'}
        </button>
        <button 
          onClick={fetchPostedVideos}
          style={{ padding: '10px 20px' }}
        >
          Refresh Data
        </button>
      </div>

      {winners.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h2>🏆 Winners Found</h2>
          <div style={{ backgroundColor: '#f8f9fa', padding: '15px', border: '1px solid #dee2e6' }}>
            {winners.map((winner) => (
              <div key={winner.variant_id} style={{ marginBottom: '10px' }}>
                <strong>Variant:</strong> {winner.variant_id.slice(0, 8)}... | 
                <strong> Video:</strong> {winner.video_id.slice(0, 8)}... | 
                <strong> Score:</strong> {winner.score.toFixed(0)} | 
                <strong> Reason:</strong> {winner.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      <h2>Posted Videos Performance</h2>
      {videos.length === 0 ? (
        <p>No posted videos found for this account.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Video ID</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>TikTok URL</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Views</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Likes</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Orders</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Revenue</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Last Updated</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => (
              <tr key={video.id}>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {video.id.slice(0, 8)}...
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {video.tt_post_url ? (
                    <a href={video.tt_post_url} target="_blank" rel="noopener noreferrer">
                      View Post
                    </a>
                  ) : (
                    'N/A'
                  )}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {video.views_total !== undefined ? video.views_total.toLocaleString() : '—'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {video.likes_total !== undefined ? video.likes_total.toLocaleString() : '—'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {video.orders_total !== undefined ? video.orders_total.toLocaleString() : '—'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {video.revenue_total !== undefined ? `$${video.revenue_total.toFixed(2)}` : '—'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {video.last_metric_at ? new Date(video.last_metric_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {activeMetricForm === video.id ? (
                    <div style={{ minWidth: '300px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '10px' }}>
                        <div>
                          <label style={{ fontSize: '12px' }}>Views:</label>
                          <input
                            type="number"
                            value={metricForms[video.id]?.views || 0}
                            onChange={(e) => updateMetricForm(video.id, 'views', e.target.value)}
                            style={{ width: '100%', padding: '2px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px' }}>Likes:</label>
                          <input
                            type="number"
                            value={metricForms[video.id]?.likes || 0}
                            onChange={(e) => updateMetricForm(video.id, 'likes', e.target.value)}
                            style={{ width: '100%', padding: '2px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px' }}>Comments:</label>
                          <input
                            type="number"
                            value={metricForms[video.id]?.comments || 0}
                            onChange={(e) => updateMetricForm(video.id, 'comments', e.target.value)}
                            style={{ width: '100%', padding: '2px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px' }}>Shares:</label>
                          <input
                            type="number"
                            value={metricForms[video.id]?.shares || 0}
                            onChange={(e) => updateMetricForm(video.id, 'shares', e.target.value)}
                            style={{ width: '100%', padding: '2px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px' }}>Orders:</label>
                          <input
                            type="number"
                            value={metricForms[video.id]?.orders || 0}
                            onChange={(e) => updateMetricForm(video.id, 'orders', e.target.value)}
                            style={{ width: '100%', padding: '2px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px' }}>Revenue:</label>
                          <input
                            type="number"
                            step="0.01"
                            value={metricForms[video.id]?.revenue || 0}
                            onChange={(e) => updateMetricForm(video.id, 'revenue', e.target.value)}
                            style={{ width: '100%', padding: '2px' }}
                          />
                        </div>
                      </div>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '12px' }}>Date:</label>
                        <input
                          type="date"
                          value={metricForms[video.id]?.metric_date || ''}
                          onChange={(e) => updateMetricForm(video.id, 'metric_date', e.target.value)}
                          style={{ width: '100%', padding: '2px' }}
                        />
                      </div>
                      <div>
                        <button 
                          onClick={() => submitMetrics(video.id)}
                          style={{ marginRight: '5px', padding: '5px 10px', fontSize: '12px' }}
                        >
                          Save
                        </button>
                        <button 
                          onClick={() => setActiveMetricForm(null)}
                          style={{ padding: '5px 10px', fontSize: '12px' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => openMetricForm(video.id)}
                      style={{ padding: '5px 10px', fontSize: '12px' }}
                    >
                      Add Today's Metrics
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
