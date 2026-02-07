'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface StatusCounts {
  videos: Record<string, number>;
  variants: Record<string, number>;
}

const VIDEO_STATUSES = ["needs_edit", "ready_to_upload", "posted", "blocked", "needs_revision"];
const VARIANT_STATUSES = ["draft", "approved", "killed", "winner"];

export default function PipelinePage() {
  const params = useParams();
  const accountId = params.id as string;
  
  const [counts, setCounts] = useState<StatusCounts>({ videos: {}, variants: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCounts = async () => {
    try {
      // Fetch all videos for this account
      const videosResponse = await fetch(`/api/videos?account_id=${accountId}`);
      const videosResult = await videosResponse.json();
      
      if (!videosResult.ok) {
        setError(videosResult.error);
        return;
      }

      // Count videos by status
      const videoCounts: Record<string, number> = {};
      VIDEO_STATUSES.forEach(status => videoCounts[status] = 0);
      
      videosResult.data.forEach((video: any) => {
        if (videoCounts.hasOwnProperty(video.status)) {
          videoCounts[video.status]++;
        }
      });

      // Fetch all variants (not account-specific since variants don't have account_id)
      const variantsResponse = await fetch('/api/variants');
      const variantsResult = await variantsResponse.json();
      
      const variantCounts: Record<string, number> = {};
      VARIANT_STATUSES.forEach(status => variantCounts[status] = 0);
      
      if (variantsResult.ok) {
        variantsResult.data.forEach((variant: any) => {
          const status = variant.status || 'draft';
          if (variantCounts.hasOwnProperty(status)) {
            variantCounts[status]++;
          }
        });
      }

      setCounts({ videos: videoCounts, variants: variantCounts });
      setError('');
    } catch {
      setError('Failed to fetch pipeline data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountId) {
      fetchCounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  if (loading) return <div>Loading videos...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Videos - Account {accountId}</h1>
      
      {error && <div style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</div>}

      <div style={{ display: 'flex', gap: '40px' }}>
        <div style={{ flex: 1 }}>
          <h2>Videos by Status</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Status</th>
                <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Count</th>
                <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {VIDEO_STATUSES.map(status => (
                <tr key={status}>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    {status.replace('_', ' ').toUpperCase()}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    {counts.videos[status] || 0}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    {counts.videos[status] > 0 && (
                      <Link href={`/accounts/${accountId}/pipeline/videos?status=${status}`}>
                        View List
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ flex: 1 }}>
          <h2>Variants by Status</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Status</th>
                <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Count</th>
                <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {VARIANT_STATUSES.map(status => (
                <tr key={status}>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    {status.toUpperCase()}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    {counts.variants[status] || 0}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    {counts.variants[status] > 0 && (
                      <Link href={`/accounts/${accountId}/pipeline/variants?status=${status}`}>
                        View List
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '30px' }}>
        <h3>Quick Actions</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href={`/accounts/${accountId}/videos`} style={{ display: 'inline-block', padding: '10px 20px', border: '1px solid #ccc', borderRadius: '4px', textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
            Go to Uploader Portal
          </Link>
          <Link href="/concepts" style={{ display: 'inline-block', padding: '10px 20px', border: '1px solid #ccc', borderRadius: '4px', textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
            Go to Concept Workbench
          </Link>
        </div>
      </div>
    </div>
  );
}
