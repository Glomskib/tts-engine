'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Account {
  id: string;
  name: string;
  platform: string;
  created_at: string;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('tiktok');
  const [creating, setCreating] = useState(false);

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/accounts');
      const result = await response.json();
      if (result.ok) {
        setAccounts(result.data);
        setError('');
      } else {
        setError(result.error);
      }
    } catch {
      setError('Failed to fetch accounts');
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), platform })
      });

      const result = await response.json();
      if (result.ok) {
        await fetchAccounts();
        setName('');
        setPlatform('tiktok');
        setError('');
      } else {
        setError(result.error);
      }
    } catch {
      setError('Failed to create account');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  if (loading) return <div>Loading accounts...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h1>Accounts</h1>
      
      {error && <div style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</div>}

      <div style={{ marginBottom: '30px', border: '1px solid #ccc', padding: '20px' }}>
        <h2>Create Account</h2>
        <form onSubmit={createAccount}>
          <div style={{ marginBottom: '10px' }}>
            <label>Name: </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ marginLeft: '10px', padding: '5px' }}
            />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label>Platform: </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              style={{ marginLeft: '10px', padding: '5px' }}
            >
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
            </select>
          </div>
          <button type="submit" disabled={creating || !name.trim()}>
            {creating ? 'Creating...' : 'Create Account'}
          </button>
        </form>
      </div>

      <h2>Existing Accounts</h2>
      {accounts.length === 0 ? (
        <p>No accounts found.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Name</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Platform</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Created</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{account.name}</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{account.platform}</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {new Date(account.created_at).toLocaleDateString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  <Link href={`/accounts/${account.id}/videos`} style={{ marginRight: '10px' }}>
                    Uploader Portal
                  </Link>
                  <Link href={`/accounts/${account.id}/pipeline`}>
                    Manager View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
