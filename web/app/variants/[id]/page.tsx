'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Variant {
  id: string;
  status: string;
  score?: number;
  is_winner?: boolean;
  locked?: boolean;
  change_type?: string;
  change_note?: string;
  parent_variant_id?: string;
  iteration_group_id?: string;
  created_at: string;
}

interface Video {
  id: string;
  account_id: string;
  status: string;
  views_total?: number;
  likes_total?: number;
  orders_total?: number;
  revenue_total?: number;
  last_metric_at?: string;
  accounts?: { name: string; platform: string };
}

interface Account {
  id: string;
  name: string;
  platform: string;
}

interface ScalingForm {
  change_types: string[];
  count_per_type: number;
  account_ids: string[];
  google_drive_url: string;
}

export default function VariantPage() {
  const params = useParams();
  const variantId = params.id as string;
  
  const [lineage, setLineage] = useState<any>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [scaling, setScaling] = useState(false);
  const [promotionNote, setPromotionNote] = useState('');
  const [scalingForm, setScalingForm] = useState<ScalingForm>({
    change_types: [],
    count_per_type: 3,
    account_ids: [],
    google_drive_url: ''
  });
  const [scalingResult, setScalingResult] = useState<any>(null);

  const CHANGE_TYPES = ['hook', 'on_screen_text', 'cta', 'caption', 'edit_style'];

  const fetchLineage = async () => {
    try {
      const response = await fetch(`/api/variants/lineage?variant_id=${variantId}`);
      const result = await response.json();
      
      if (result.ok) {
        setLineage(result.data);
        setError('');
      } else {
        setError(result.error);
      }
    } catch {
      setError('Failed to fetch variant lineage');
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/accounts');
      const result = await response.json();
      
      if (result.ok) {
        setAccounts(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    }
  };

  const promoteVariant = async () => {
    setPromoting(true);
    try {
      const response = await fetch('/api/variants/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant_id: variantId,
          note: promotionNote.trim() || undefined
        })
      });

      const result = await response.json();
      if (result.ok) {
        await fetchLineage(); // Refresh data
        setPromotionNote('');
        setError('Variant successfully promoted to winner!');
      } else {
        setError(result.error);
      }
    } catch {
      setError('Failed to promote variant');
    } finally {
      setPromoting(false);
    }
  };

  const scaleVariant = async () => {
    if (scalingForm.change_types.length === 0) {
      setError('Please select at least one change type');
      return;
    }

    setScaling(true);
    try {
      const response = await fetch('/api/variants/scale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winner_variant_id: lineage.root_variant.id,
          change_types: scalingForm.change_types,
          count_per_type: scalingForm.count_per_type,
          account_ids: scalingForm.account_ids.length > 0 ? scalingForm.account_ids : undefined,
          google_drive_url: scalingForm.google_drive_url.trim() || undefined
        })
      });

      const result = await response.json();
      if (result.ok) {
        setScalingResult(result.data);
        await fetchLineage(); // Refresh data
        setError(`Scaling complete! Created ${result.summary.variants_created} variants and ${result.summary.videos_created} videos.`);
      } else {
        setError(result.error);
      }
    } catch {
      setError('Failed to scale variant');
    } finally {
      setScaling(false);
    }
  };

  const updateScalingForm = (field: keyof ScalingForm, value: ScalingForm[keyof ScalingForm]) => {
    setScalingForm(prev => ({ ...prev, [field]: value }));
  };

  const toggleChangeType = (changeType: string) => {
    setScalingForm(prev => ({
      ...prev,
      change_types: prev.change_types.includes(changeType)
        ? prev.change_types.filter(t => t !== changeType)
        : [...prev.change_types, changeType]
    }));
  };

  const toggleAccount = (accountId: string) => {
    setScalingForm(prev => ({
      ...prev,
      account_ids: prev.account_ids.includes(accountId)
        ? prev.account_ids.filter(id => id !== accountId)
        : [...prev.account_ids, accountId]
    }));
  };

  useEffect(() => {
    if (variantId) {
      setLoading(true);
      Promise.all([fetchLineage(), fetchAccounts()]).finally(() => setLoading(false));
    }
  }, [variantId]);

  if (loading) return <div>Loading variant data...</div>;
  if (!lineage) return <div>Variant not found</div>;

  const variant = lineage.target_variant;
  const rootVariant = lineage.root_variant;
  const videos = lineage.videos_by_variant[variant.id] || [];

  return (
    <div style={{ padding: '20px' }}>
      <h1>Variant Management - {variant.id.slice(0, 8)}...</h1>
      
      {error && (
        <div style={{ 
          color: error.includes('successfully') || error.includes('complete') ? 'green' : 'red', 
          marginBottom: '20px',
          padding: '10px',
          border: '1px solid',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        {/* Variant Details */}
        <div>
          <h2>Variant Details</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold' }}>Status</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{variant.status}</td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold' }}>Score</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{variant.score || 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold' }}>Winner</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{variant.is_winner ? 'Yes' : 'No'}</td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold' }}>Locked</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{variant.locked ? 'Yes' : 'No'}</td>
              </tr>
              {variant.change_type && (
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold' }}>Change Type</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>{variant.change_type}</td>
                </tr>
              )}
              {variant.change_note && (
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold' }}>Change Note</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>{variant.change_note}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Associated Videos */}
          <h3 style={{ marginTop: '20px' }}>Associated Videos</h3>
          {videos.length === 0 ? (
            <p>No videos found for this variant.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Account</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Status</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Performance</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video: Video) => (
                  <tr key={video.id}>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      {video.accounts?.name || 'Unknown'} ({video.accounts?.platform || 'Unknown'})
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{video.status}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      {video.views_total !== undefined ? (
                        <div>
                          Views: {video.views_total.toLocaleString()}<br/>
                          Likes: {video.likes_total || 0}<br/>
                          Orders: {video.orders_total || 0}<br/>
                          Revenue: ${(video.revenue_total || 0).toFixed(2)}
                        </div>
                      ) : (
                        'No metrics'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Actions */}
        <div>
          <h2>Actions</h2>
          
          {/* Promotion */}
          {!variant.is_winner && (
            <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc' }}>
              <h3>Promote to Winner</h3>
              <div style={{ marginBottom: '10px' }}>
                <label>Note (optional):</label>
                <input
                  type="text"
                  value={promotionNote}
                  onChange={(e) => setPromotionNote(e.target.value)}
                  placeholder="Reason for promotion..."
                  style={{ width: '100%', padding: '5px', marginTop: '5px' }}
                />
              </div>
              <button type="button" 
                onClick={promoteVariant}
                disabled={promoting}
                style={{ 
                  padding: '10px 20px', 
                  backgroundColor: '#28a745', 
                  color: 'white', 
                  border: 'none' 
                }}
              >
                {promoting ? 'Promoting...' : 'Promote to Winner'}
              </button>
            </div>
          )}

          {/* Scaling */}
          {(variant.is_winner || rootVariant.is_winner) && (
            <div style={{ padding: '15px', border: '1px solid #ccc' }}>
              <h3>Generate Scaling Plan</h3>
              
              <div style={{ marginBottom: '15px' }}>
                <label><strong>Change Types:</strong></label>
                <div style={{ marginTop: '5px' }}>
                  {CHANGE_TYPES.map(changeType => (
                    <label key={changeType} style={{ display: 'block', marginBottom: '5px' }}>
                      <input
                        type="checkbox"
                        checked={scalingForm.change_types.includes(changeType)}
                        onChange={() => toggleChangeType(changeType)}
                        style={{ marginRight: '8px' }}
                      />
                      {changeType.replace('_', ' ')}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label><strong>Variants per type:</strong></label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={scalingForm.count_per_type}
                  onChange={(e) => updateScalingForm('count_per_type', parseInt(e.target.value))}
                  style={{ width: '100%', padding: '5px', marginTop: '5px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label><strong>Google Drive URL (optional):</strong></label>
                <input
                  type="text"
                  value={scalingForm.google_drive_url}
                  onChange={(e) => updateScalingForm('google_drive_url', e.target.value)}
                  placeholder="https://drive.google.com/..."
                  style={{ width: '100%', padding: '5px', marginTop: '5px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label><strong>Create Videos for Accounts (optional):</strong></label>
                <div style={{ marginTop: '5px', maxHeight: '150px', overflowY: 'auto' }}>
                  {accounts.map(account => (
                    <label key={account.id} style={{ display: 'block', marginBottom: '5px' }}>
                      <input
                        type="checkbox"
                        checked={scalingForm.account_ids.includes(account.id)}
                        onChange={() => toggleAccount(account.id)}
                        style={{ marginRight: '8px' }}
                      />
                      {account.name} ({account.platform})
                    </label>
                  ))}
                </div>
              </div>

              <button type="button" 
                onClick={scaleVariant}
                disabled={scaling || scalingForm.change_types.length === 0}
                style={{ 
                  padding: '10px 20px', 
                  backgroundColor: '#007bff', 
                  color: 'white', 
                  border: 'none' 
                }}
              >
                {scaling ? 'Generating...' : 'Generate Scaling Plan'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lineage Display */}
      {(lineage.child_variants.length > 0 || lineage.parent_variant) && (
        <div style={{ marginTop: '30px' }}>
          <h2>Variant Lineage</h2>
          
          {lineage.parent_variant && (
            <div style={{ marginBottom: '20px' }}>
              <h3>Parent Variant</h3>
              <Link href={`/variants/${lineage.parent_variant.id}`}>
                <button type="button" style={{ padding: '5px 10px' }}>
                  {lineage.parent_variant.id.slice(0, 8)}... ({lineage.parent_variant.status})
                </button>
              </Link>
            </div>
          )}

          {lineage.child_variants.length > 0 && (
            <div>
              <h3>Child Variants ({lineage.child_variants.length})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                {lineage.child_variants.map((child: Variant) => (
                  <div key={child.id} style={{ border: '1px solid #ccc', padding: '10px' }}>
                    <div><strong>ID:</strong> {child.id.slice(0, 8)}...</div>
                    <div><strong>Status:</strong> {child.status}</div>
                    <div><strong>Change Type:</strong> {child.change_type || 'N/A'}</div>
                    <div><strong>Change Note:</strong> {child.change_note || 'N/A'}</div>
                    <div style={{ marginTop: '10px' }}>
                      <Link href={`/variants/${child.id}`}>
                        <button type="button" style={{ padding: '5px 10px' }}>View Details</button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scaling Results */}
      {scalingResult && (
        <div style={{ marginTop: '30px' }}>
          <h2>Scaling Results</h2>
          <div style={{ backgroundColor: '#f8f9fa', padding: '15px', border: '1px solid #dee2e6' }}>
            <div><strong>Variants Created:</strong> {scalingResult.child_variants?.length || 0}</div>
            <div><strong>Videos Created:</strong> {scalingResult.created_videos?.length || 0}</div>
            <div><strong>Iteration Group ID:</strong> {scalingResult.iteration_group?.id}</div>
            
            {scalingResult.scaling_plan?.editor_brief && (
              <div style={{ marginTop: '15px' }}>
                <h4>Editor Brief</h4>
                <div><strong>B-Roll:</strong> {scalingResult.scaling_plan.editor_brief.b_roll?.join(', ')}</div>
                <div><strong>Style:</strong> {scalingResult.scaling_plan.editor_brief.on_screen_style}</div>
                <div><strong>Pacing:</strong> {scalingResult.scaling_plan.editor_brief.pacing}</div>
                <div><strong>Do&apos;s:</strong> {scalingResult.scaling_plan.editor_brief.dos?.join(', ')}</div>
                <div><strong>Don&apos;ts:</strong> {scalingResult.scaling_plan.editor_brief.donts?.join(', ')}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
