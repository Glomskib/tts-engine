'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Loader2, Package } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  brand: string;
  link: string | null;
  product_image_url: string | null;
}

interface ProductPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (productId: string, productName: string) => void;
}

export default function ProductPicker({ isOpen, onClose, onSelect }: ProductPickerProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products?limit=100');
      const json = await res.json();
      if (json.ok) {
        setProducts(json.data || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchProducts();
      setSearch('');
    }
  }, [isOpen, fetchProducts]);

  if (!isOpen) return null;

  const filtered = search
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.brand.toLowerCase().includes(search.toLowerCase()),
      )
    : products;

  // Group by brand
  const grouped = filtered.reduce<Record<string, Product[]>>((acc, p) => {
    const brand = p.brand || 'Other';
    if (!acc[brand]) acc[brand] = [];
    acc[brand].push(p);
    return acc;
  }, {});

  const brands = Object.keys(grouped).sort();

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-2xl max-h-[85vh] sm:max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-sm">Link Product</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <Loader2 size={24} className="mx-auto mb-2 animate-spin opacity-30" />
              <p className="text-sm">Loading products...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No products found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {brands.map(brand => (
                <div key={brand}>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{brand}</h4>
                  <div className="space-y-1">
                    {grouped[brand].map(product => (
                      <button
                        key={product.id}
                        onClick={() => onSelect(product.id, product.name)}
                        className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition flex items-center gap-3"
                      >
                        {product.product_image_url ? (
                          <img src={product.product_image_url} alt="" className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <Package size={14} className="text-gray-400" />
                          </div>
                        )}
                        <span>{product.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
