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
        <p>No concepts found. Create some concepts first.</p>
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
                  <Link href={`/concepts/${concept.id}`}>
                    <button type="button" style={{ padding: '5px 10px' }}>Open Workbench</button>
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
