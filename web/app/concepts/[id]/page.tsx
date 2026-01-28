'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface Hook {
  id: string;
  hook_text: string;
  created_at: string;
}

interface Script {
  id: string;
  script_v1: string;
  caption: string;
  hashtags: string;
  created_at: string;
}

interface Variant {
  id: string;
  status: string;
  created_at: string;
}

interface Account {
  id: string;
  name: string;
  platform: string;
}

export default function ConceptWorkbenchPage() {
  const params = useParams();
  const conceptId = params.id as string;
  
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedHook, setSelectedHook] = useState('');
  const [showVideoForm, setShowVideoForm] = useState<string | null>(null);
  const [videoForm, setVideoForm] = useState({
    account_id: '',
    google_drive_url: '',
    caption_used: '',
    hashtags_used: '',
    status: 'ready_to_upload'
  });

  const fetchData = async () => {
    try {
      // Fetch hooks for this concept
      const hooksResponse = await fetch(`/api/hooks?concept_id=${conceptId}`);
      const hooksResult = await hooksResponse.json();
      if (hooksResult.ok) setHooks(hooksResult.data);

      // Fetch scripts for this concept
      const scriptsResponse = await fetch(`/api/scripts?concept_id=${conceptId}`);
      const scriptsResult = await scriptsResponse.json();
      if (scriptsResult.ok) setScripts(scriptsResult.data);

      // Fetch variants for this concept
      const variantsResponse = await fetch(`/api/variants?concept_id=${conceptId}`);
      const variantsResult = await variantsResponse.json();
      if (variantsResult.ok) setVariants(variantsResult.data);

      // Fetch accounts for video creation
      const accountsResponse = await fetch('/api/accounts');
      const accountsResult = await accountsResponse.json();
      if (accountsResult.ok) setAccounts(accountsResult.data);

      setError('');
    } catch (err) {
      setError('Failed to fetch workbench data');
    } finally {
      setLoading(false);
    }
  };

  const generateHooks = async () => {
    try {
      const response = await fetch('/api/hooks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept_id: conceptId })
      });
      
      if (response.ok) {
        await fetchData();
      } else {
        const result = await response.json();
        setError(result.error || 'Failed to generate hooks');
      }
    } catch (err) {
      setError('Failed to generate hooks');
    }
  };

  const generateScript = async () => {
    if (!selectedHook) {
      setError('Please select a hook first');
      return;
    }

    try {
      const response = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          concept_id: conceptId,
          hook_text: selectedHook
        })
      });
      
      if (response.ok) {
        await fetchData();
        setSelectedHook('');
      } else {
        const result = await response.json();
        setError(result.error || 'Failed to generate script');
      }
    } catch (err) {
      setError('Failed to generate script');
    }
  };

  const generateVariants = async () => {
    try {
      const response = await fetch('/api/variants/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept_id: conceptId })
      });
      
      if (response.ok) {
        await fetchData();
      } else {
        const result = await response.json();
        setError(result.error || 'Failed to generate variants');
      }
    } catch (err) {
      setError('Failed to generate variants');
    }
  };

  const createVideo = async (variantId: string) => {
    try {
      const response = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...videoForm,
          variant_id: variantId
        })
      });
      
      if (response.ok) {
        setShowVideoForm(null);
        setVideoForm({
          account_id: '',
          google_drive_url: '',
          caption_used: '',
          hashtags_used: '',
          status: 'ready_to_upload'
        });
        setError('Video created successfully');
      } else {
        const result = await response.json();
        setError(result.error || 'Failed to create video');
      }
    } catch (err) {
      setError('Failed to create video');
    }
  };

  useEffect(() => {
    if (conceptId) {
      fetchData();
    }
  }, [conceptId]);

  if (loading) return <div>Loading workbench...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Concept Workbench - {conceptId}</h1>
      
      {error && <div style={{ color: error.includes('successfully') ? 'green' : 'red', marginBottom: '20px' }}>
        {error}
      </div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        <div>
          <h2>Hooks ({hooks.length})</h2>
          <button onClick={generateHooks} style={{ marginBottom: '10px', padding: '5px 10px' }}>
            Generate Hooks
          </button>
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px' }}>
            {hooks.map(hook => (
              <div key={hook.id} style={{ marginBottom: '10px', padding: '5px', border: '1px solid #eee' }}>
                <div>{hook.hook_text}</div>
                <button 
                  onClick={() => setSelectedHook(hook.hook_text)}
                  style={{ marginTop: '5px', padding: '2px 5px', fontSize: '12px' }}
                >
                  Select for Script
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2>Scripts ({scripts.length})</h2>
          <div style={{ marginBottom: '10px' }}>
            <select 
              value={selectedHook} 
              onChange={(e) => setSelectedHook(e.target.value)}
              style={{ marginRight: '10px', padding: '5px' }}
            >
              <option value="">Select hook...</option>
              {hooks.map(hook => (
                <option key={hook.id} value={hook.hook_text}>
                  {hook.hook_text.slice(0, 50)}...
                </option>
              ))}
            </select>
            <button onClick={generateScript} disabled={!selectedHook} style={{ padding: '5px 10px' }}>
              Generate Script
            </button>
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px' }}>
            {scripts.map(script => (
              <div key={script.id} style={{ marginBottom: '10px', padding: '5px', border: '1px solid #eee' }}>
                <div><strong>Caption:</strong> {script.caption}</div>
                <div><strong>Hashtags:</strong> {script.hashtags}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2>Variants ({variants.length})</h2>
          <button onClick={generateVariants} style={{ marginBottom: '10px', padding: '5px 10px' }}>
            Generate Variants
          </button>
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px' }}>
            {variants.map(variant => (
              <div key={variant.id} style={{ marginBottom: '10px', padding: '5px', border: '1px solid #eee' }}>
                <div>Status: {variant.status}</div>
                <button 
                  onClick={() => setShowVideoForm(variant.id)}
                  style={{ marginTop: '5px', padding: '2px 5px', fontSize: '12px' }}
                >
                  Create Video
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2>Video Creation</h2>
          {showVideoForm && (
            <div style={{ border: '1px solid #ccc', padding: '10px' }}>
              <h3>Create Video for Variant {showVideoForm}</h3>
              <div style={{ marginBottom: '10px' }}>
                <label>Account: </label>
                <select 
                  value={videoForm.account_id}
                  onChange={(e) => setVideoForm(prev => ({ ...prev, account_id: e.target.value }))}
                  style={{ width: '100%', padding: '5px' }}
                >
                  <option value="">Select account...</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.platform})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label>Google Drive URL: </label>
                <input
                  type="text"
                  value={videoForm.google_drive_url}
                  onChange={(e) => setVideoForm(prev => ({ ...prev, google_drive_url: e.target.value }))}
                  style={{ width: '100%', padding: '5px' }}
                  required
                />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label>Caption: </label>
                <textarea
                  value={videoForm.caption_used}
                  onChange={(e) => setVideoForm(prev => ({ ...prev, caption_used: e.target.value }))}
                  style={{ width: '100%', padding: '5px' }}
                />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label>Hashtags: </label>
                <input
                  type="text"
                  value={videoForm.hashtags_used}
                  onChange={(e) => setVideoForm(prev => ({ ...prev, hashtags_used: e.target.value }))}
                  style={{ width: '100%', padding: '5px' }}
                />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label>Status: </label>
                <select
                  value={videoForm.status}
                  onChange={(e) => setVideoForm(prev => ({ ...prev, status: e.target.value }))}
                  style={{ width: '100%', padding: '5px' }}
                >
                  <option value="needs_edit">Needs Edit</option>
                  <option value="ready_to_upload">Ready to Upload</option>
                </select>
              </div>
              <button 
                onClick={() => createVideo(showVideoForm)}
                disabled={!videoForm.account_id || !videoForm.google_drive_url}
                style={{ marginRight: '10px', padding: '5px 10px' }}
              >
                Create Video
              </button>
              <button 
                onClick={() => setShowVideoForm(null)}
                style={{ padding: '5px 10px' }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
