'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ScriptActionsProps {
  skitId: string;
  skitTitle: string;
  skitData: Record<string, unknown>;
  productId?: string;
  productName?: string;
  productBrand?: string;
  generationConfig?: Record<string, unknown>;
  onDuplicate?: (newSkitId: string) => void;
  onDelete?: () => void;
}

export default function ScriptActions({
  skitId,
  skitTitle,
  skitData,
  productId,
  productName,
  productBrand,
  generationConfig,
  onDuplicate,
  onDelete,
}: ScriptActionsProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDuplicate = async () => {
    setLoading('duplicate');
    try {
      const res = await fetch('/api/skits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${skitTitle} (Copy)`,
          skit_data: skitData,
          product_id: productId,
          product_name: productName,
          product_brand: productBrand,
          generation_config: generationConfig,
          status: 'draft',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onDuplicate?.(data.data.id);
        setIsOpen(false);
      }
    } catch (err) {
      console.error('Failed to duplicate:', err);
    } finally {
      setLoading(null);
    }
  };

  const handleRemix = () => {
    // Build query params for skit generator
    const params = new URLSearchParams();
    if (productId) params.set('product_id', productId);
    if (productName) params.set('product_name', productName);
    if (productBrand) params.set('product_brand', productBrand);
    if (generationConfig) {
      if (typeof generationConfig.intensity === 'number') {
        params.set('intensity', String(generationConfig.intensity));
      }
      if (typeof generationConfig.persona === 'string') {
        params.set('persona', generationConfig.persona);
      }
    }
    params.set('remix_from', skitId);

    router.push(`/admin/skit-generator?${params.toString()}`);
    setIsOpen(false);
  };

  const handleSaveAsTemplate = async () => {
    setLoading('template');
    try {
      // For now, just show coming soon
      alert('Save as Template feature coming soon!');
    } finally {
      setLoading(null);
      setIsOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this script? This action cannot be undone.')) return;

    setLoading('delete');
    try {
      const res = await fetch(`/api/skits/${skitId}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete?.();
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setLoading(null);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 py-2 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50">
          {/* Duplicate */}
          <button type="button"
            onClick={handleDuplicate}
            disabled={loading !== null}
            className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 disabled:opacity-50"
          >
            {loading === 'duplicate' ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
            Duplicate
          </button>

          {/* Remix */}
          <button type="button"
            onClick={handleRemix}
            className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3"
          >
            <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Remix
          </button>

          {/* Save as Template */}
          <button type="button"
            onClick={handleSaveAsTemplate}
            disabled={loading !== null}
            className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-3 disabled:opacity-50"
          >
            <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            Save as Template
          </button>

          <div className="my-2 border-t border-white/10" />

          {/* Delete */}
          <button type="button"
            onClick={handleDelete}
            disabled={loading !== null}
            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-3 disabled:opacity-50"
          >
            {loading === 'delete' ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// Favorite button component
interface FavoriteButtonProps {
  skitId: string;
  isFavorite: boolean;
  onToggle?: (newState: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
}

export function FavoriteButton({ skitId, isFavorite, onToggle, size = 'md' }: FavoriteButtonProps) {
  const [favorite, setFavorite] = useState(isFavorite);
  const [loading, setLoading] = useState(false);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const handleToggle = async () => {
    setLoading(true);
    const newState = !favorite;

    try {
      const res = await fetch(`/api/skits/${skitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: newState }),
      });

      if (res.ok) {
        setFavorite(newState);
        onToggle?.(newState);
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button"
      onClick={handleToggle}
      disabled={loading}
      className={`p-1.5 rounded-lg transition-colors ${
        favorite
          ? 'text-red-400 hover:bg-red-500/20'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
      } disabled:opacity-50`}
      title={favorite ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <svg
        className={sizeClasses[size]}
        fill={favorite ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    </button>
  );
}
