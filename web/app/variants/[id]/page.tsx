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

const cellClass = "border border-gray-300 dark:border-gray-600 p-2 text-gray-800 dark:text-gray-200";
const headerCellClass = "border border-gray-300 dark:border-gray-600 p-2 text-left bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const labelCellClass = "border border-gray-300 dark:border-gray-600 p-2 font-bold text-gray-800 dark:text-gray-200";
const inputClass = "w-full p-1 mt-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200";

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
        await fetchLineage();
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
        await fetchLineage();
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

  if (loading) return <div className="p-5 text-gray-700 dark:text-gray-300">Loading variant data...</div>;
  if (!lineage) return <div className="p-5 text-gray-700 dark:text-gray-300">Variant not found</div>;

  const variant = lineage.target_variant;
  const rootVariant = lineage.root_variant;
  const videos = lineage.videos_by_variant[variant.id] || [];

  return (
    <div className="p-5">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        Variant Management - {variant.id.slice(0, 8)}...
      </h1>

      {error && (
        <div className={`mb-5 p-3 border rounded ${
          error.includes('successfully') || error.includes('complete')
            ? 'border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
            : 'border-red-500 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
        }`}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Variant Details */}
        <div>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">Variant Details</h2>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className={labelCellClass}>Status</td>
                <td className={cellClass}>{variant.status}</td>
              </tr>
              <tr>
                <td className={labelCellClass}>Score</td>
                <td className={cellClass}>{variant.score || 'N/A'}</td>
              </tr>
              <tr>
                <td className={labelCellClass}>Winner</td>
                <td className={cellClass}>{variant.is_winner ? 'Yes' : 'No'}</td>
              </tr>
              <tr>
                <td className={labelCellClass}>Locked</td>
                <td className={cellClass}>{variant.locked ? 'Yes' : 'No'}</td>
              </tr>
              {variant.change_type && (
                <tr>
                  <td className={labelCellClass}>Change Type</td>
                  <td className={cellClass}>{variant.change_type}</td>
                </tr>
              )}
              {variant.change_note && (
                <tr>
                  <td className={labelCellClass}>Change Note</td>
                  <td className={cellClass}>{variant.change_note}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Associated Videos */}
          <h3 className="mt-5 mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">Associated Videos</h3>
          {videos.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">No videos found for this variant.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={headerCellClass}>Account</th>
                  <th className={headerCellClass}>Status</th>
                  <th className={headerCellClass}>Performance</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video: Video) => (
                  <tr key={video.id}>
                    <td className={cellClass}>
                      {video.accounts?.name || 'Unknown'} ({video.accounts?.platform || 'Unknown'})
                    </td>
                    <td className={cellClass}>{video.status}</td>
                    <td className={cellClass}>
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
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">Actions</h2>

          {/* Promotion */}
          {!variant.is_winner && (
            <div className="mb-8 p-4 border border-gray-300 dark:border-gray-600 rounded">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Promote to Winner</h3>
              <div className="mb-3">
                <label className="text-gray-700 dark:text-gray-300">Note (optional):</label>
                <input
                  type="text"
                  value={promotionNote}
                  onChange={(e) => setPromotionNote(e.target.value)}
                  placeholder="Reason for promotion..."
                  className={inputClass}
                />
              </div>
              <button type="button"
                onClick={promoteVariant}
                disabled={promoting}
                className="px-5 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {promoting ? 'Promoting...' : 'Promote to Winner'}
              </button>
            </div>
          )}

          {/* Scaling */}
          {(variant.is_winner || rootVariant.is_winner) && (
            <div className="p-4 border border-gray-300 dark:border-gray-600 rounded">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Generate Scaling Plan</h3>

              <div className="mb-4">
                <label className="font-bold text-gray-700 dark:text-gray-300">Change Types:</label>
                <div className="mt-1">
                  {CHANGE_TYPES.map(changeType => (
                    <label key={changeType} className="block mb-1 text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={scalingForm.change_types.includes(changeType)}
                        onChange={() => toggleChangeType(changeType)}
                        className="mr-2"
                      />
                      {changeType.replace('_', ' ')}
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="font-bold text-gray-700 dark:text-gray-300">Variants per type:</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={scalingForm.count_per_type}
                  onChange={(e) => updateScalingForm('count_per_type', parseInt(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div className="mb-4">
                <label className="font-bold text-gray-700 dark:text-gray-300">Google Drive URL (optional):</label>
                <input
                  type="text"
                  value={scalingForm.google_drive_url}
                  onChange={(e) => updateScalingForm('google_drive_url', e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className={inputClass}
                />
              </div>

              <div className="mb-4">
                <label className="font-bold text-gray-700 dark:text-gray-300">Create Videos for Accounts (optional):</label>
                <div className="mt-1 max-h-36 overflow-y-auto">
                  {accounts.map(account => (
                    <label key={account.id} className="block mb-1 text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={scalingForm.account_ids.includes(account.id)}
                        onChange={() => toggleAccount(account.id)}
                        className="mr-2"
                      />
                      {account.name} ({account.platform})
                    </label>
                  ))}
                </div>
              </div>

              <button type="button"
                onClick={scaleVariant}
                disabled={scaling || scalingForm.change_types.length === 0}
                className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {scaling ? 'Generating...' : 'Generate Scaling Plan'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lineage Display */}
      {(lineage.child_variants.length > 0 || lineage.parent_variant) && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">Variant Lineage</h2>

          {lineage.parent_variant && (
            <div className="mb-5">
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Parent Variant</h3>
              <Link href={`/variants/${lineage.parent_variant.id}`} className="inline-block px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                  {lineage.parent_variant.id.slice(0, 8)}... ({lineage.parent_variant.status})
              </Link>
            </div>
          )}

          {lineage.child_variants.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
                Child Variants ({lineage.child_variants.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {lineage.child_variants.map((child: Variant) => (
                  <div key={child.id} className="border border-gray-300 dark:border-gray-600 rounded p-3">
                    <div className="text-gray-800 dark:text-gray-200"><strong>ID:</strong> {child.id.slice(0, 8)}...</div>
                    <div className="text-gray-800 dark:text-gray-200"><strong>Status:</strong> {child.status}</div>
                    <div className="text-gray-800 dark:text-gray-200"><strong>Change Type:</strong> {child.change_type || 'N/A'}</div>
                    <div className="text-gray-800 dark:text-gray-200"><strong>Change Note:</strong> {child.change_note || 'N/A'}</div>
                    <div className="mt-2">
                      <Link href={`/variants/${child.id}`} className="inline-block px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                        View Details
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
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">Scaling Results</h2>
          <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded">
            <div className="text-gray-800 dark:text-gray-200"><strong>Variants Created:</strong> {scalingResult.child_variants?.length || 0}</div>
            <div className="text-gray-800 dark:text-gray-200"><strong>Videos Created:</strong> {scalingResult.created_videos?.length || 0}</div>
            <div className="text-gray-800 dark:text-gray-200"><strong>Iteration Group ID:</strong> {scalingResult.iteration_group?.id}</div>

            {scalingResult.scaling_plan?.editor_brief && (
              <div className="mt-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Editor Brief</h4>
                <div className="text-gray-800 dark:text-gray-200"><strong>B-Roll:</strong> {scalingResult.scaling_plan.editor_brief.b_roll?.join(', ')}</div>
                <div className="text-gray-800 dark:text-gray-200"><strong>Style:</strong> {scalingResult.scaling_plan.editor_brief.on_screen_style}</div>
                <div className="text-gray-800 dark:text-gray-200"><strong>Pacing:</strong> {scalingResult.scaling_plan.editor_brief.pacing}</div>
                <div className="text-gray-800 dark:text-gray-200"><strong>Do&apos;s:</strong> {scalingResult.scaling_plan.editor_brief.dos?.join(', ')}</div>
                <div className="text-gray-800 dark:text-gray-200"><strong>Don&apos;ts:</strong> {scalingResult.scaling_plan.editor_brief.donts?.join(', ')}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
