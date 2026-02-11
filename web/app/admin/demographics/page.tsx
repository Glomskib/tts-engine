'use client';

import { useState, useEffect } from 'react';
import { UserCheck, Users, MapPin, BarChart3, RefreshCw } from 'lucide-react';
import { fetchJson } from '@/lib/http/fetchJson';

interface ProductDemographic {
  id: string;
  name: string;
  brand: string | null;
  primary_gender: string | null;
  primary_age_range: string | null;
  primary_location: string | null;
  demographic_data: {
    gender_breakdown?: Record<string, number>;
    age_breakdown?: Record<string, number>;
    locations?: Record<string, number>;
    sample_count?: number;
  } | null;
}

export default function DemographicsPage() {
  const [products, setProducts] = useState<ProductDemographic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    const resp = await fetchJson<ProductDemographic[]>('/api/products?include_demographics=true');
    if (resp.ok && resp.data) {
      setProducts(Array.isArray(resp.data) ? resp.data : []);
    }
    setLoading(false);
  }

  const productsWithData = products.filter(p => p.demographic_data && Object.keys(p.demographic_data).length > 0);
  const productsWithout = products.filter(p => !p.demographic_data || Object.keys(p.demographic_data).length === 0);

  // Aggregate demographics across all products
  const aggregateGender: Record<string, number> = {};
  const aggregateAge: Record<string, number> = {};
  const aggregateLocations: Record<string, number> = {};
  let totalSamples = 0;

  for (const p of productsWithData) {
    const d = p.demographic_data;
    if (!d) continue;
    totalSamples += d.sample_count || 1;

    if (d.gender_breakdown) {
      for (const [k, v] of Object.entries(d.gender_breakdown)) {
        aggregateGender[k] = (aggregateGender[k] || 0) + v;
      }
    }
    if (d.age_breakdown) {
      for (const [k, v] of Object.entries(d.age_breakdown)) {
        aggregateAge[k] = (aggregateAge[k] || 0) + v;
      }
    }
    if (d.locations) {
      for (const [k, v] of Object.entries(d.locations)) {
        aggregateLocations[k] = (aggregateLocations[k] || 0) + v;
      }
    }
  }

  // Normalize aggregates to percentages
  const genderTotal = Object.values(aggregateGender).reduce((a, b) => a + b, 0) || 1;
  const ageTotal = Object.values(aggregateAge).reduce((a, b) => a + b, 0) || 1;
  const locationTotal = Object.values(aggregateLocations).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <UserCheck className="w-7 h-7 text-teal-400" />
            Demographic Intelligence
          </h1>
          <p className="text-zinc-400 mt-1">
            Audience demographics across your products — powered by analytics screenshots
          </p>
        </div>
        <button onClick={loadProducts} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-zinc-500" />
        </div>
      )}

      {!loading && productsWithData.length === 0 && (
        <div className="border border-dashed border-zinc-700 rounded-xl p-12 text-center">
          <UserCheck className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No demographic data yet</h2>
          <p className="text-zinc-400 mb-4">
            Upload TikTok analytics screenshots to build audience profiles for your products.
          </p>
          <a href="/admin/analytics/upload" className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-500 px-6 py-3 rounded-lg font-medium transition-colors">
            Upload Screenshots
          </a>
        </div>
      )}

      {!loading && productsWithData.length > 0 && (
        <div className="space-y-8">
          {/* Aggregate Overview */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Gender */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4" /> Overall Gender Split
              </h3>
              <div className="space-y-3">
                {Object.entries(aggregateGender).sort((a, b) => b[1] - a[1]).map(([gender, count]) => {
                  const pct = Math.round((count / genderTotal) * 100);
                  return (
                    <div key={gender}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize text-zinc-300">{gender}</span>
                        <span className="text-teal-400 font-medium">{pct}%</span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Age */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Overall Age Distribution
              </h3>
              <div className="space-y-3">
                {Object.entries(aggregateAge).sort((a, b) => {
                  const numA = parseInt(a[0]);
                  const numB = parseInt(b[0]);
                  return numA - numB;
                }).map(([age, count]) => {
                  const pct = Math.round((count / ageTotal) * 100);
                  return (
                    <div key={age}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-300">{age}</span>
                        <span className="text-amber-400 font-medium">{pct}%</span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Locations */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Top Locations
              </h3>
              <div className="space-y-3">
                {Object.entries(aggregateLocations).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([loc, count]) => {
                  const pct = Math.round((count / locationTotal) * 100);
                  return (
                    <div key={loc}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-300">{loc}</span>
                        <span className="text-blue-400 font-medium">{pct}%</span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Summary bar */}
          <div className="flex items-center gap-6 text-sm text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-3">
            <span><strong className="text-zinc-300">{productsWithData.length}</strong> products with data</span>
            <span className="text-zinc-700">|</span>
            <span><strong className="text-zinc-300">{productsWithout.length}</strong> need screenshots</span>
            <span className="text-zinc-700">|</span>
            <span><strong className="text-zinc-300">{totalSamples}</strong> total samples</span>
          </div>

          {/* Per-product cards */}
          <h2 className="text-lg font-semibold">Product Breakdowns</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {productsWithData.map(product => {
              const d = product.demographic_data;
              return (
                <div key={product.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-xs text-teal-400 font-medium uppercase">{product.brand || 'Product'}</span>
                      <h3 className="font-semibold text-zinc-100">{product.name}</h3>
                    </div>
                    {product.primary_gender && product.primary_age_range && (
                      <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">
                        {product.primary_age_range} {product.primary_gender}{product.primary_location ? `, ${product.primary_location}` : ''}
                      </span>
                    )}
                  </div>

                  {d?.gender_breakdown && (
                    <div className="flex gap-2 mb-2">
                      {Object.entries(d.gender_breakdown).map(([g, v]) => (
                        <span key={g} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded capitalize">
                          {g}: {v}%
                        </span>
                      ))}
                    </div>
                  )}

                  {d?.age_breakdown && (
                    <div className="flex gap-1 h-4 rounded overflow-hidden mb-2">
                      {Object.entries(d.age_breakdown).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([age, pct], i) => {
                        const colors = ['bg-blue-500', 'bg-teal-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500'];
                        return (
                          <div
                            key={age}
                            className={`${colors[i % colors.length]} relative group`}
                            style={{ width: `${pct}%` }}
                            title={`${age}: ${pct}%`}
                          />
                        );
                      })}
                    </div>
                  )}

                  {d?.locations && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(d.locations).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([loc, pct]) => (
                        <span key={loc} className="text-xs text-zinc-500">
                          {loc} {pct}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Products without data */}
          {productsWithout.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-zinc-400">Needs Data ({productsWithout.length})</h2>
              <div className="grid md:grid-cols-3 gap-3">
                {productsWithout.slice(0, 12).map(p => (
                  <div key={p.id} className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-zinc-500">{p.brand || 'Product'}</span>
                      <p className="text-sm text-zinc-400">{p.name}</p>
                    </div>
                    <a href={`/admin/analytics/upload?product_id=${p.id}`} className="text-xs text-teal-400 hover:text-teal-300">
                      Upload
                    </a>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
