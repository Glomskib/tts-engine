'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminNav from '../components/AdminNav';

interface BrandStats {
  name: string;
  total_videos: number;
  videos_this_month: number;
  in_queue: number;
  posted: number;
  top_products: { id: string; name: string; video_count: number }[];
}

interface AuthUser {
  id: string;
  email: string | null;
  role: 'admin' | 'recorder' | 'editor' | 'uploader' | null;
}

export default function BrandsPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [brandStats, setBrandStats] = useState<BrandStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch auth user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/brands');
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
        router.push('/login?redirect=/admin/brands');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch brand stats
  const fetchBrandStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all products to get unique brands
      const productsRes = await fetch('/api/products');
      const productsData = await productsRes.json();

      if (!productsData.ok) {
        throw new Error(productsData.error || 'Failed to fetch products');
      }

      const products = productsData.data || [];

      // Get unique brands
      const brandMap: Record<string, { products: typeof products }> = {};
      products.forEach((p: { brand: string }) => {
        if (!brandMap[p.brand]) {
          brandMap[p.brand] = { products: [] };
        }
        brandMap[p.brand].products.push(p);
      });

      // Fetch video stats (simplified - in production this would be a dedicated API)
      const videosRes = await fetch('/api/videos/queue?limit=200&claimed=any');
      const videosData = await videosRes.json();
      const videos = videosData.ok ? (videosData.data || []) : [];

      // Calculate stats per brand
      const stats: BrandStats[] = Object.entries(brandMap).map(([brandName, data]) => {
        const brandProductIds = data.products.map((p: { id: string }) => p.id);
        const brandVideos = videos.filter((v: { product_id: string | null }) =>
          v.product_id && brandProductIds.includes(v.product_id)
        );

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Count product videos
        const productVideoCounts: Record<string, number> = {};
        brandVideos.forEach((v: { product_id: string }) => {
          productVideoCounts[v.product_id] = (productVideoCounts[v.product_id] || 0) + 1;
        });

        const topProducts = data.products
          .map((p: { id: string; name: string }) => ({
            id: p.id,
            name: p.name,
            video_count: productVideoCounts[p.id] || 0,
          }))
          .sort((a: { video_count: number }, b: { video_count: number }) => b.video_count - a.video_count)
          .slice(0, 3);

        return {
          name: brandName,
          total_videos: brandVideos.length,
          videos_this_month: brandVideos.filter((v: { created_at: string }) =>
            new Date(v.created_at) >= startOfMonth
          ).length,
          in_queue: brandVideos.filter((v: { recording_status: string | null }) =>
            v.recording_status !== 'POSTED' && v.recording_status !== 'REJECTED'
          ).length,
          posted: brandVideos.filter((v: { recording_status: string | null }) =>
            v.recording_status === 'POSTED'
          ).length,
          top_products: topProducts,
        };
      });

      // Sort by total videos desc
      stats.sort((a, b) => b.total_videos - a.total_videos);

      setBrandStats(stats);
    } catch (err) {
      console.error('Failed to fetch brand stats:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && authUser) {
      fetchBrandStats();
    }
  }, [authLoading, authUser, fetchBrandStats]);

  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!authUser) {
    return <div style={{ padding: '20px' }}>Redirecting to login...</div>;
  }

  const isAdmin = authUser.role === 'admin';

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Brands</h1>
        <button
          onClick={fetchBrandStats}
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
          Loading brand statistics...
        </div>
      ) : brandStats.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#666',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
        }}>
          No brands found. Add products with brand names to see statistics here.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'left', backgroundColor: '#f8f9fa' }}>Brand</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa' }}>Total Videos</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa' }}>This Month</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa' }}>In Queue</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa' }}>Posted</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'left', backgroundColor: '#f8f9fa' }}>Top Products</th>
                <th style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {brandStats.map((brand) => (
                <tr key={brand.name}>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{brand.name}</span>
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      backgroundColor: '#e7f5ff',
                      borderRadius: '12px',
                      fontWeight: 'bold',
                      color: '#1971c2',
                    }}>
                      {brand.total_videos}
                    </span>
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center' }}>
                    {brand.videos_this_month}
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      backgroundColor: brand.in_queue > 0 ? '#fff3bf' : '#f8f9fa',
                      borderRadius: '12px',
                      fontWeight: 'bold',
                      color: brand.in_queue > 0 ? '#e67700' : '#868e96',
                    }}>
                      {brand.in_queue}
                    </span>
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      backgroundColor: brand.posted > 0 ? '#d3f9d8' : '#f8f9fa',
                      borderRadius: '12px',
                      fontWeight: 'bold',
                      color: brand.posted > 0 ? '#2b8a3e' : '#868e96',
                    }}>
                      {brand.posted}
                    </span>
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px' }}>
                    {brand.top_products.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {brand.top_products.map((p) => (
                          <span key={p.id} style={{ fontSize: '12px', color: '#495057' }}>
                            {p.name} ({p.video_count})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#868e96', fontSize: '12px' }}>No products</span>
                    )}
                  </td>
                  <td style={{ border: '1px solid #dee2e6', padding: '12px', textAlign: 'center' }}>
                    <Link
                      href={`/admin/pipeline?brand=${encodeURIComponent(brand.name)}`}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#228be6',
                        color: 'white',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        fontSize: '12px',
                      }}
                    >
                      View Pipeline
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#868e96' }}>
        Showing {brandStats.length} brand{brandStats.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
