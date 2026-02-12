'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Concept {
  id: string;
  concept_title: string;
  product_id: string;
  source_url?: string;
  notes?: string;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
}

export default function ConceptsPage() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      // Fetch concepts
      const conceptsResponse = await fetch('/api/concepts');
      const conceptsResult = await conceptsResponse.json();
      
      if (conceptsResult.ok) {
        setConcepts(conceptsResult.data);
      } else {
        setError(conceptsResult.error);
        return;
      }

      // Fetch products to show product names
      const productsResponse = await fetch('/api/products');
      const productsResult = await productsResponse.json();
      
      if (productsResult.ok) {
        setProducts(productsResult.data);
      }

      setError('');
    } catch {
      setError('Failed to fetch concepts');
    } finally {
      setLoading(false);
    }
  };

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Unknown Product';
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <div>Loading concepts...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Concept Workbench</h1>
      
      {error && <div style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</div>}

      <div style={{ marginBottom: '20px' }}>
        <p>Select a concept to open the workbench and manage hooks, scripts, variants, and videos.</p>
      </div>

      {concepts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No product concepts yet</h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-sm mb-6">
            A concept tells FlashFlow about your product so it can write killer scripts. Add your first concept to get started.
          </p>
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-2 h-11 px-6 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 active:bg-teal-800 transition-colors"
          >
            Create Your First Concept
          </Link>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Concept Title</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Product</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Source URL</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Created</th>
              <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {concepts.map((concept) => (
              <tr key={concept.id}>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {concept.concept_title}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {getProductName(concept.product_id)}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {concept.source_url ? (
                    <a href={concept.source_url} target="_blank" rel="noopener noreferrer">
                      {concept.source_url.length > 50 
                        ? concept.source_url.slice(0, 50) + '...' 
                        : concept.source_url}
                    </a>
                  ) : (
                    'N/A'
                  )}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {new Date(concept.created_at).toLocaleDateString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  <Link href={`/concepts/${concept.id}`} style={{ display: 'inline-block', padding: '5px 10px', border: '1px solid #ccc', borderRadius: '4px', textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
                    Open Workbench
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
