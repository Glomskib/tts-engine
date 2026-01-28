'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminNav from '../components/AdminNav';

interface ProductStats {
  id: string;
  name: string;
  brand: string;
  category: string;
  videos_this_month: number;
  in_queue: number;
  posted: number;
  target_accounts: string[];
}

interface AuthUser {
  id: string;
  email: string | null;
  role: 'admin' | 'recorder' | 'editor' | 'uploader' | null;
}

export default function ProductsPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [productStats, setProductStats] = useState<ProductStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Fetch auth user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/products');
          return;
        }

        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        setAuthUser({
          id: user.id,
          email: user.email || null,
          role: roleData.role || null,
        });
      } catch (err) {
        console.error('Failed to fetch auth user:', err);
        router.push('/login?redirect=/admin/products');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch product stats
  const fetchProductStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all products
      const productsRes = await fetch('/api/products');
      const productsData = await productsRes.json();

      if (!productsData.ok) {
        throw new Error(productsData.error || 'Failed to fetch products');
      }

      const products = productsData.data || [];

      // Fetch videos (simplified - in production this would be a dedicated API)
      const videosRes = await fetch('/api/videos/queue?limit=200&claimed=any');
      const videosData = await videosRes.json();
      const videos = videosData.ok ? (videosData.data || []) : [];

      // Fetch accounts for name lookup
      const accountsRes = await fetch('/api/accounts');
      const accountsData = await accountsRes.json();
      const accounts: Record<string, string> = {};
      if (accountsData.ok && accountsData.data) {
        accountsData.data.forEach((a: { id: string; name: string }) => {
          accounts[a.id] = a.name;
        });
      }

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Calculate stats per product
      const stats: ProductStats[] = products.map((product: { id: string; name: string; brand: string; category: string }) => {
        const productVideos = videos.filter((v: { product_id: string | null }) =>
          v.product_id === product.id
        );

        // Get unique account IDs
        const accountIds = new Set<string>();
        productVideos.forEach((v: { account_id: string }) => {
          if (v.account_id) accountIds.add(v.account_id);
        });

        return {
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
          videos_this_month: productVideos.filter((v: { created_at: string }) =>
            new Date(v.created_at) >= startOfMonth
          ).length,
          in_queue: productVideos.filter((v: { recording_status: string | null }) =>
            v.recording_status !== 'POSTED' && v.recording_status !== 'REJECTED'
          ).length,
          posted: productVideos.filter((v: { recording_status: string | null }) =>
            v.recording_status === 'POSTED'
          ).length,
          target_accounts: Array.from(accountIds).map(id => accounts[id] || id.slice(0, 8)),
        };
      });

      // Sort by in_queue desc (most urgent first)
      stats.sort((a, b) => b.in_queue - a.in_queue);

      setProductStats(stats);
    } catch (err) {
      console.error('Failed to fetch product stats:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && authUser) {
      fetchProductStats();
    }
  }, [authLoading, authUser, fetchProductStats]);

  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!authUser) {
    return <div style={{ padding: '20px' }}>Redirecting to login...</div>;
  }

  const isAdmin = authUser.role === 'admin';

  // Get unique brands and categories for filters
  const uniqueBrands = Array.from(new Set(productStats.map(p => p.brand))).sort();
  const uniqueCategories = Array.from(new Set(productStats.map(p => p.category))).sort();

  // Apply filters
  const filteredProducts = productStats.filter(p => {
    if (brandFilter && p.brand !== brandFilter) return false;
    if (categoryFilter && p.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Products</h1>
        <button
          onClick={fetchProductStats}
          style={{
            padding: '8px 16px',
            backgroundColor: '#228be6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      <AdminNav isAdmin={isAdmin} />

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        padding: '12px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>Brand:</label>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '13px',
              minWidth: '140px',
            }}
          >
            <option value="">All Brands</option>
            {uniqueBrands.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>Category:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '13px',
              minWidth: '140px',
            }}
          >
            <option value="">All Categories</option>
            {uniqueCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {(brandFilter || categoryFilter) && (
          <button
            onClick={() => { setBrandFilter(''); setCategoryFilter(''); }}
            style={{
              padding: '6px 12px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Clear Filters
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#6c757d' }}>
          {filteredProducts.length} of {productStats.length} products
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '4px',
          marginBottom: '20px',
        }}>
          Error: {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          Loading product statistics...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#666',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
        }}>
          {productStats.length === 0
            ? 'No products found. Add products to see statistics here.'
            : 'No products match the current filters.'
          }
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'left', backgroundColor: '#f8f9fa' }}>Product</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'left', backgroundColor: '#f8f9fa' }}>Brand</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'left', backgroundColor: '#f8f9fa' }}>Category</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa' }}>This Month</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa' }}>In Queue</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa' }}>Posted</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'left', backgroundColor: '#f8f9fa' }}>Target Accounts</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{product.name}</span>
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px' }}>
                    <span style={{
                      padding: '3px 8px',
                      backgroundColor: '#e7f5ff',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: '#1971c2',
                    }}>
                      {product.brand}
                    </span>
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px', fontSize: '13px', color: '#495057' }}>
                    {product.category}
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center' }}>
                    {product.videos_this_month}
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      backgroundColor: product.in_queue > 0 ? '#fff3bf' : '#f8f9fa',
                      borderRadius: '12px',
                      fontWeight: 'bold',
                      color: product.in_queue > 0 ? '#e67700' : '#868e96',
                    }}>
                      {product.in_queue}
                    </span>
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      backgroundColor: product.posted > 0 ? '#d3f9d8' : '#f8f9fa',
                      borderRadius: '12px',
                      fontWeight: 'bold',
                      color: product.posted > 0 ? '#2b8a3e' : '#868e96',
                    }}>
                      {product.posted}
                    </span>
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px' }}>
                    {product.target_accounts.length > 0 ? (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {product.target_accounts.slice(0, 3).map((account, idx) => (
                          <span key={idx} style={{
                            padding: '2px 6px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#495057',
                          }}>
                            {account}
                          </span>
                        ))}
                        {product.target_accounts.length > 3 && (
                          <span style={{ fontSize: '11px', color: '#868e96' }}>
                            +{product.target_accounts.length - 3} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#868e96', fontSize: '12px' }}>None</span>
                    )}
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center' }}>
                    <Link
                      href={`/admin/pipeline?product=${encodeURIComponent(product.id)}`}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#228be6',
                        color: 'white',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        fontSize: '12px',
                      }}
                    >
                      View Videos
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#868e96' }}>
        Showing {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
