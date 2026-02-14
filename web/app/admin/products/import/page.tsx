'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { celebrate } from '@/lib/celebrations';
import AdminPageLayout, { AdminCard, AdminButton } from '../../components/AdminPageLayout';
import {
  Package,
  Loader2,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Sparkles,
  Plus,
  Brain,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  RotateCcw,
  List,
  Upload,
  Clock,
  Hash,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ScrapedProductData {
  name: string;
  brand: string;
  category: string;
  description: string | null;
  price: number | null;
  original_price: number | null;
  discount: string | null;
  sold_count: number | null;
  seller_location: string | null;
  images: string[];
  variants: string[];
  tiktok_product_id: string | null;
}

interface BrandEntity {
  id: string;
  name: string;
}

interface ProductEnrichment {
  benefits: string[];
  unique_selling_points: string[];
  target_audiences: {
    segment: string;
    demographics: string;
    psychographics: string;
    why_this_product: string;
  }[];
  hook_angles: {
    angle: string;
    example_opening: string;
    best_for_audience: string;
  }[];
  objections: {
    objection: string;
    handler: string;
  }[];
  differentiators: string[];
  cta_suggestions: string[];
  content_angles: string[];
  recommended_price_positioning: string;
  urgency_triggers: string[];
}

interface BulkScrapeResult {
  url: string;
  data: ScrapedProductData | null;
  error?: string;
  enrichment?: ProductEnrichment | null;
  enriching?: boolean;
  saved?: boolean;
  savedId?: string;
}

interface RecentImport {
  id: string;
  name: string;
  brand: string;
  category: string;
  created_at: string;
  product_image_url: string | null;
}

type TabType = 'tiktok' | 'bulk' | 'manual';

const CATEGORY_OPTIONS = [
  'Beauty',
  'Health & Wellness',
  'Fashion',
  'Home & Garden',
  'Electronics',
  'Food & Beverage',
  'Pet Supplies',
  'Baby & Kids',
  'Sports & Outdoors',
  'Accessories',
  'Other',
];

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ImportProductsPage() {
  const { showSuccess, showError } = useToast();
  const router = useRouter();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('tiktok');

  // Success state (track saved product for post-save actions)
  const [savedProductId, setSavedProductId] = useState<string | null>(null);
  const [savedProductName, setSavedProductName] = useState<string | null>(null);

  // TikTok scraping state
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapedData, setScrapedData] = useState<ScrapedProductData | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [savingScraped, setSavingScraped] = useState(false);

  // Manual entry state
  const [manualForm, setManualForm] = useState({
    name: '',
    brand_id: '',
    category: '',
    description: '',
    price: '',
    notes: '',
  });
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Brand entities for linking
  const [brandEntities, setBrandEntities] = useState<BrandEntity[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);

  // Quick brand creation
  const [showQuickBrand, setShowQuickBrand] = useState(false);
  const [quickBrandName, setQuickBrandName] = useState('');
  const [creatingBrand, setCreatingBrand] = useState(false);

  // AI Enrichment state
  const [enrichmentData, setEnrichmentData] = useState<ProductEnrichment | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichmentError, setEnrichmentError] = useState<string | null>(null);
  const [showEnrichment, setShowEnrichment] = useState(false);

  // Bulk import state
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkScraping, setBulkScraping] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, phase: '' });
  const [bulkResults, setBulkResults] = useState<BulkScrapeResult[]>([]);
  const [bulkAutoEnrich, setBulkAutoEnrich] = useState(true);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Import history state
  const [recentImports, setRecentImports] = useState<RecentImport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Fetch brand entities on mount
  useEffect(() => {
    fetch('/api/brands')
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.data) {
          setBrandEntities(data.data.map((b: Record<string, unknown>) => ({
            id: b.id as string,
            name: b.name as string,
          })));
        }
      })
      .catch(err => console.error('Failed to fetch brands:', err))
      .finally(() => setBrandsLoading(false));
  }, []);

  // Fetch recent imports on mount
  const fetchImportHistory = useCallback(() => {
    setHistoryLoading(true);
    fetch('/api/products?limit=10')
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.data?.products) {
          setRecentImports(data.data.products.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            name: p.name as string,
            brand: p.brand as string,
            category: (p.category as string) || 'General',
            created_at: p.created_at as string,
            product_image_url: (p.product_image_url as string) || null,
          })));
        }
      })
      .catch(err => console.error('Failed to fetch import history:', err))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    fetchImportHistory();
  }, [fetchImportHistory]);

  /* ---------------------------------------------------------------- */
  /*  TikTok Scraping Handlers                                        */
  /* ---------------------------------------------------------------- */

  const handleScrape = useCallback(async () => {
    if (!tiktokUrl.trim()) {
      setScrapeError('Please enter a TikTok Shop product URL');
      return;
    }

    setScraping(true);
    setScrapeError(null);
    setScrapedData(null);

    try {
      const res = await fetch('/api/products/scrape-tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tiktokUrl.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setScrapeError(data.message || data.error || 'Failed to scrape product data. Please check the URL and try again.');
        return;
      }

      setScrapedData(data.data.product);
      showSuccess('Product data scraped successfully!');
    } catch (err) {
      setScrapeError('Network error. Please check your connection and try again.');
    } finally {
      setScraping(false);
    }
  }, [tiktokUrl, showSuccess]);

  const handleSaveScraped = useCallback(async () => {
    if (!scrapedData) return;

    // Find or create brand
    let brandId: string | null = null;
    const existingBrand = brandEntities.find(b => b.name.toLowerCase() === scrapedData.brand.toLowerCase());

    if (existingBrand) {
      brandId = existingBrand.id;
    } else {
      // Create new brand
      try {
        const brandRes = await fetch('/api/brands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: scrapedData.brand }),
        });
        const brandData = await brandRes.json();
        if (brandData.ok && brandData.data) {
          brandId = brandData.data.id;
          setBrandEntities(prev => [...prev, { id: brandId!, name: scrapedData.brand }]);
        }
      } catch {
        // If brand creation fails, continue without brand_id
        console.error('Failed to create brand');
      }
    }

    setSavingScraped(true);

    try {
      // Build notes with scraped data + enrichment if available
      const notesLines: string[] = [
        scrapedData.sold_count ? `Sold: ${scrapedData.sold_count.toLocaleString()} units` : null,
        scrapedData.seller_location ? `Location: ${scrapedData.seller_location}` : null,
        scrapedData.variants.length > 0 ? `Variants: ${scrapedData.variants.join('; ')}` : null,
        scrapedData.discount ? `Discount: ${scrapedData.discount}` : null,
      ].filter(Boolean) as string[];

      // Add enrichment data if available
      if (enrichmentData) {
        notesLines.push('', '=== AI ENRICHMENT ===');

        if (enrichmentData.benefits.length > 0) {
          notesLines.push('', 'BENEFITS:');
          enrichmentData.benefits.forEach(b => notesLines.push(`• ${b}`));
        }

        if (enrichmentData.unique_selling_points.length > 0) {
          notesLines.push('', 'UNIQUE SELLING POINTS:');
          enrichmentData.unique_selling_points.forEach(u => notesLines.push(`• ${u}`));
        }

        if (enrichmentData.recommended_price_positioning) {
          notesLines.push('', `PRICE POSITIONING: ${enrichmentData.recommended_price_positioning}`);
        }
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scrapedData.name,
          brand: scrapedData.brand,
          brand_id: brandId,
          category: scrapedData.category,
          description: scrapedData.description,
          primary_link: tiktokUrl.trim(),
          tiktok_showcase_url: tiktokUrl.trim(),
          notes: notesLines.join('\n'),
          price: scrapedData.price,
          product_image_url: scrapedData.images[0] || null,  // Use first image as hero
          images: scrapedData.images,  // Save all images to gallery
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        showError(data.error || 'Failed to save product');
        return;
      }

      showSuccess(`Product "${scrapedData.name}" saved successfully!`);
      celebrate('first-product', showSuccess);

      // Capture saved product for post-save actions
      setSavedProductId(data.data.id);
      setSavedProductName(scrapedData.name);

      // Refresh import history
      fetchImportHistory();

      // Reset form
      setTiktokUrl('');
      setScrapedData(null);
      setScrapeError(null);
      setEnrichmentData(null);
      setEnrichmentError(null);
      setShowEnrichment(false);
    } catch (err) {
      showError('Network error while saving product');
    } finally {
      setSavingScraped(false);
    }
  }, [scrapedData, tiktokUrl, brandEntities, showSuccess, showError, fetchImportHistory]);

  /* ---------------------------------------------------------------- */
  /*  Manual Entry Handlers                                           */
  /* ---------------------------------------------------------------- */

  const handleQuickBrandCreate = useCallback(async () => {
    if (!quickBrandName.trim()) return;

    setCreatingBrand(true);
    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: quickBrandName.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setManualError(data.error?.message || data.error || 'Failed to create brand');
        return;
      }
      const newBrand = data.data;
      setBrandEntities(prev => [...prev, { id: newBrand.id, name: newBrand.name }].sort((a, b) => a.name.localeCompare(b.name)));
      setManualForm(prev => ({ ...prev, brand_id: newBrand.id }));
      setShowQuickBrand(false);
      setQuickBrandName('');
      showSuccess(`Brand "${newBrand.name}" created!`);
    } catch {
      setManualError('Failed to create brand');
    } finally {
      setCreatingBrand(false);
    }
  }, [quickBrandName, showSuccess]);

  const handleSaveManual = useCallback(async () => {
    // Validation
    if (!manualForm.name.trim()) {
      setManualError('Product name is required');
      return;
    }
    if (!manualForm.brand_id) {
      setManualError('Brand is required');
      return;
    }
    if (!manualForm.category.trim()) {
      setManualError('Category is required');
      return;
    }

    setSavingManual(true);
    setManualError(null);

    try {
      // Get brand name from selected brand
      const selectedBrand = brandEntities.find(b => b.id === manualForm.brand_id);
      const brandName = selectedBrand?.name || '';

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: manualForm.name.trim(),
          brand: brandName,
          brand_id: manualForm.brand_id,
          category: manualForm.category.trim(),
          description: manualForm.description.trim() || null,
          notes: manualForm.notes.trim() || null,
          price: manualForm.price ? parseFloat(manualForm.price) : null,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setManualError(data.error || 'Failed to create product');
        return;
      }

      showSuccess(`Product "${manualForm.name}" created successfully!`);
      celebrate('first-product', showSuccess);

      // Capture saved product for post-save actions
      setSavedProductId(data.data.id);
      setSavedProductName(manualForm.name);

      // Refresh import history
      fetchImportHistory();

      // Reset form
      setManualForm({
        name: '',
        brand_id: '',
        category: '',
        description: '',
        price: '',
        notes: '',
      });
    } catch (err) {
      setManualError('Network error while creating product');
    } finally {
      setSavingManual(false);
    }
  }, [manualForm, brandEntities, showSuccess, fetchImportHistory]);

  /* ---------------------------------------------------------------- */
  /*  AI Enrichment Handler                                           */
  /* ---------------------------------------------------------------- */

  const handleEnrich = useCallback(async (productData: {
    name: string;
    brand: string;
    category: string;
    description?: string | null;
    price?: number | null;
    sold_count?: number | null;
    seller_location?: string | null;
    variants?: string[];
  }) => {
    setEnriching(true);
    setEnrichmentError(null);

    try {
      const res = await fetch('/api/products/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: productData.name,
          brand: productData.brand,
          category: productData.category,
          description: productData.description || null,
          price: productData.price || null,
          sold_count: productData.sold_count || null,
          seller_location: productData.seller_location || null,
          variants: productData.variants || [],
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setEnrichmentError(data.message || 'Failed to generate AI enrichment');
        return;
      }

      setEnrichmentData(data.data.enrichment);
      setShowEnrichment(true);
      showSuccess('AI enrichment generated successfully!');
    } catch (err) {
      setEnrichmentError('Network error while generating enrichment');
    } finally {
      setEnriching(false);
    }
  }, [showSuccess]);

  /* ---------------------------------------------------------------- */
  /*  Bulk Import Handlers                                            */
  /* ---------------------------------------------------------------- */

  const handleBulkScrape = useCallback(async () => {
    const urls = bulkUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.length > 0 && u.startsWith('http'));

    if (urls.length === 0) {
      showError('Please enter at least one valid URL');
      return;
    }

    if (urls.length > 20) {
      showError('Maximum 20 URLs per batch');
      return;
    }

    setBulkScraping(true);
    setBulkResults([]);
    setBulkProgress({ current: 0, total: urls.length, phase: 'Scraping' });

    const results: BulkScrapeResult[] = [];

    for (let i = 0; i < urls.length; i++) {
      setBulkProgress({ current: i + 1, total: urls.length, phase: 'Scraping' });

      try {
        const res = await fetch('/api/products/scrape-tiktok', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urls[i] }),
        });

        const data = await res.json();

        if (res.ok && data.ok) {
          results.push({ url: urls[i], data: data.data.product, enrichment: null });
        } else {
          results.push({ url: urls[i], data: null, error: data.message || data.error || 'Failed to scrape' });
        }
      } catch {
        results.push({ url: urls[i], data: null, error: 'Network error' });
      }

      setBulkResults([...results]);
    }

    // Auto-enrich if enabled
    if (bulkAutoEnrich) {
      const scrapedResults = results.filter(r => r.data);
      for (let i = 0; i < scrapedResults.length; i++) {
        const r = scrapedResults[i];
        const resultIdx = results.indexOf(r);

        setBulkProgress({ current: i + 1, total: scrapedResults.length, phase: 'Enriching' });
        results[resultIdx] = { ...results[resultIdx], enriching: true };
        setBulkResults([...results]);

        try {
          const res = await fetch('/api/products/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: r.data!.name,
              brand: r.data!.brand,
              category: r.data!.category,
              description: r.data!.description,
              price: r.data!.price,
              sold_count: r.data!.sold_count,
              seller_location: r.data!.seller_location,
              variants: r.data!.variants,
            }),
          });

          const data = await res.json();

          if (res.ok && data.ok) {
            results[resultIdx] = { ...results[resultIdx], enrichment: data.data.enrichment, enriching: false };
          } else {
            results[resultIdx] = { ...results[resultIdx], enriching: false };
          }
        } catch {
          results[resultIdx] = { ...results[resultIdx], enriching: false };
        }

        setBulkResults([...results]);
      }
    }

    setBulkScraping(false);
    const successCount = results.filter(r => r.data).length;
    showSuccess(`Scraped ${successCount} of ${urls.length} products`);
  }, [bulkUrls, bulkAutoEnrich, showSuccess, showError]);

  const handleBulkSave = useCallback(async () => {
    const toSave = bulkResults.filter(r => r.data && !r.saved);
    if (toSave.length === 0) return;

    setBulkSaving(true);
    let saved = 0;

    for (const r of toSave) {
      const resultIdx = bulkResults.indexOf(r);

      // Find or create brand
      let brandId: string | null = null;
      const existingBrand = brandEntities.find(b => b.name.toLowerCase() === r.data!.brand.toLowerCase());
      if (existingBrand) {
        brandId = existingBrand.id;
      } else {
        try {
          const brandRes = await fetch('/api/brands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: r.data!.brand }),
          });
          const brandData = await brandRes.json();
          if (brandData.ok && brandData.data) {
            brandId = brandData.data.id;
            setBrandEntities(prev => {
              if (prev.find(b => b.id === brandId)) return prev;
              return [...prev, { id: brandId!, name: r.data!.brand }];
            });
          }
        } catch {
          // Continue without brand_id
        }
      }

      // Build notes
      const notesLines: string[] = [
        r.data!.sold_count ? `Sold: ${r.data!.sold_count.toLocaleString()} units` : null,
        r.data!.seller_location ? `Location: ${r.data!.seller_location}` : null,
        r.data!.variants.length > 0 ? `Variants: ${r.data!.variants.join('; ')}` : null,
        r.data!.discount ? `Discount: ${r.data!.discount}` : null,
      ].filter(Boolean) as string[];

      if (r.enrichment) {
        notesLines.push('', '=== AI ENRICHMENT ===');
        if (r.enrichment.benefits.length > 0) {
          notesLines.push('', 'BENEFITS:');
          r.enrichment.benefits.forEach(b => notesLines.push(`• ${b}`));
        }
        if (r.enrichment.unique_selling_points.length > 0) {
          notesLines.push('', 'UNIQUE SELLING POINTS:');
          r.enrichment.unique_selling_points.forEach(u => notesLines.push(`• ${u}`));
        }
      }

      try {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: r.data!.name,
            brand: r.data!.brand,
            brand_id: brandId,
            category: r.data!.category,
            description: r.data!.description,
            primary_link: r.url,
            tiktok_showcase_url: r.url,
            notes: notesLines.join('\n'),
            price: r.data!.price,
            product_image_url: r.data!.images[0] || null,
            images: r.data!.images,
          }),
        });

        const data = await res.json();
        if (data.ok) {
          setBulkResults(prev => prev.map((p, idx) =>
            idx === resultIdx ? { ...p, saved: true, savedId: data.data.id } : p
          ));
          saved++;
        }
      } catch {
        // Skip failed saves
      }
    }

    setBulkSaving(false);
    if (saved > 0) {
      showSuccess(`Saved ${saved} product${saved !== 1 ? 's' : ''}!`);
      celebrate('first-product', showSuccess);
      fetchImportHistory();
    }
  }, [bulkResults, brandEntities, showSuccess, fetchImportHistory]);

  const handleRemoveBulkResult = useCallback((index: number) => {
    setBulkResults(prev => prev.filter((_, i) => i !== index));
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Post-Save Action Handlers                                       */
  /* ---------------------------------------------------------------- */

  const handleGenerateScripts = useCallback(() => {
    if (!savedProductId) return;
    router.push(`/admin/content-studio?product=${savedProductId}`);
  }, [savedProductId, router]);

  const handleImportAnother = useCallback(() => {
    setSavedProductId(null);
    setSavedProductName(null);
    // Form is already reset in save handlers
  }, []);

  const handleViewAllProducts = useCallback(() => {
    router.push('/admin/products');
  }, [router]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <AdminPageLayout
      title="Import Products"
      subtitle="Import products from TikTok Shop or add manually"
      headerActions={
        <Link href="/admin/products">
          <AdminButton variant="secondary" size="sm">
            <Package size={16} className="mr-1.5" />
            All Products
          </AdminButton>
        </Link>
      }
    >
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-white/10 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('tiktok')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === 'tiktok'
              ? 'text-violet-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <Sparkles size={16} />
            TikTok Shop
          </span>
          {activeTab === 'tiktok' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bulk')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === 'bulk'
              ? 'text-violet-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <Upload size={16} />
            Bulk Import
          </span>
          {activeTab === 'bulk' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === 'manual'
              ? 'text-violet-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <Plus size={16} />
            Manual Entry
          </span>
          {activeTab === 'manual' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500" />
          )}
        </button>
      </div>

      {/* Success Card - Post-Save Actions */}
      {savedProductId && savedProductName && (
        <div className="mb-6">
          <AdminCard>
            <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle size={24} className="text-green-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">
                  Product Saved Successfully!
                </h3>
                <p className="text-sm text-zinc-400 mt-1">
                  "{savedProductName}" has been added to your products library. What would you like to do next?
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                type="button"
                onClick={handleGenerateScripts}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-violet-500 hover:bg-violet-600 text-white font-medium text-sm transition-colors"
              >
                <Sparkles size={16} />
                Generate Scripts
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={handleImportAnother}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-white/10 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-100 font-medium text-sm transition-colors"
              >
                <RotateCcw size={16} />
                Import Another
              </button>

              <button
                type="button"
                onClick={handleViewAllProducts}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-white/10 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-100 font-medium text-sm transition-colors"
              >
                <List size={16} />
                View All Products
              </button>
            </div>
          </div>
          </AdminCard>
        </div>
      )}

      {/* TikTok Shop Tab */}
      {activeTab === 'tiktok' && (
        <div className="space-y-6">
          <AdminCard
            title="Scrape TikTok Shop Product"
            subtitle="Paste a TikTok Shop product URL and we'll automatically extract all the details"
          >
            <div className="space-y-4">
              {/* URL Input */}
              <div>
                <label htmlFor="tiktok-url" className="block text-sm font-medium text-zinc-300 mb-1.5">
                  TikTok Shop Product URL
                </label>
                <input
                  id="tiktok-url"
                  type="url"
                  value={tiktokUrl}
                  onChange={(e) => setTiktokUrl(e.target.value)}
                  placeholder="https://www.tiktok.com/shop/pdp/product-name/1234567890"
                  className="w-full rounded-lg border border-white/10 bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleScrape();
                  }}
                />
                <p className="mt-1.5 text-xs text-zinc-500">
                  Supports: tiktok.com/shop/pdp/..., shop.tiktok.com/view/product/..., or tiktok.com/t/... (short links)
                </p>
              </div>

              {/* Scrape Error */}
              {scrapeError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
                  <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-red-300">{scrapeError}</div>
                </div>
              )}

              {/* Scrape Button */}
              <AdminButton onClick={handleScrape} disabled={!tiktokUrl.trim() || scraping}>
                {scraping ? (
                  <>
                    <Loader2 size={16} className="mr-1.5 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} className="mr-1.5" />
                    Scrape Product Data
                  </>
                )}
              </AdminButton>
            </div>
          </AdminCard>

          {/* Scraped Data Preview */}
          {scrapedData && (
            <AdminCard
              title="Product Preview"
              subtitle="Review the scraped data before saving"
            >
              <div className="space-y-4">
                {/* Product Images */}
                {scrapedData.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {scrapedData.images.slice(0, 5).map((img, idx) => (
                      <img
                        key={idx}
                        src={img}
                        alt={`Product ${idx + 1}`}
                        className="w-20 h-20 rounded-lg border border-white/10 object-cover shrink-0"
                      />
                    ))}
                    {scrapedData.images.length > 5 && (
                      <div className="w-20 h-20 rounded-lg border border-white/10 bg-zinc-800/50 flex items-center justify-center text-xs text-zinc-500 shrink-0">
                        +{scrapedData.images.length - 5}
                      </div>
                    )}
                  </div>
                )}

                {/* Product Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Product Name</label>
                    <p className="text-sm text-zinc-100">{scrapedData.name}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Brand</label>
                    <p className="text-sm text-zinc-100">{scrapedData.brand}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Category</label>
                    <p className="text-sm text-zinc-100">{scrapedData.category}</p>
                  </div>
                  {scrapedData.price && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Price</label>
                      <p className="text-sm text-zinc-100">
                        ${scrapedData.price.toFixed(2)}
                        {scrapedData.original_price && scrapedData.original_price !== scrapedData.price && (
                          <span className="ml-2 text-xs text-zinc-500 line-through">
                            ${scrapedData.original_price.toFixed(2)}
                          </span>
                        )}
                        {scrapedData.discount && (
                          <span className="ml-2 text-xs text-emerald-400">{scrapedData.discount}</span>
                        )}
                      </p>
                    </div>
                  )}
                  {scrapedData.sold_count && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Units Sold</label>
                      <p className="text-sm text-zinc-100">{scrapedData.sold_count.toLocaleString()}</p>
                    </div>
                  )}
                  {scrapedData.seller_location && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Seller Location</label>
                      <p className="text-sm text-zinc-100">{scrapedData.seller_location}</p>
                    </div>
                  )}
                </div>

                {/* Description */}
                {scrapedData.description && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Description</label>
                    <p className="text-sm text-zinc-300 leading-relaxed">{scrapedData.description}</p>
                  </div>
                )}

                {/* Variants */}
                {scrapedData.variants.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Variants</label>
                    <div className="flex flex-wrap gap-2">
                      {scrapedData.variants.map((variant, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-zinc-800/50 border border-white/10 rounded text-xs text-zinc-300"
                        >
                          {variant}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Enrichment Section */}
                <div className="border-t border-white/10 pt-4">
                  {enrichmentError && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 mb-4">
                      <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                      <div className="text-sm text-red-300">{enrichmentError}</div>
                    </div>
                  )}

                  {!enrichmentData && !enriching && (
                    <div className="flex items-center gap-3">
                      <AdminButton
                        variant="secondary"
                        onClick={() => handleEnrich({
                          name: scrapedData.name,
                          brand: scrapedData.brand,
                          category: scrapedData.category,
                          description: scrapedData.description,
                          price: scrapedData.price,
                          sold_count: scrapedData.sold_count,
                          seller_location: scrapedData.seller_location,
                          variants: scrapedData.variants,
                        })}
                      >
                        <Brain size={16} className="mr-1.5" />
                        AI Enrich Product Data
                      </AdminButton>
                      <span className="text-xs text-zinc-500">
                        Generate selling points, hooks, and target audiences
                      </span>
                    </div>
                  )}

                  {enriching && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <Loader2 size={16} className="animate-spin" />
                      Generating AI enrichment... This may take 10-15 seconds
                    </div>
                  )}

                  {enrichmentData && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                            <CheckCircle size={14} className="text-emerald-400" />
                          </div>
                          <span className="text-sm font-medium text-zinc-200">AI Enrichment Complete</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowEnrichment(!showEnrichment)}
                          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          {showEnrichment ? (
                            <>
                              <ChevronUp size={14} />
                              Hide Details
                            </>
                          ) : (
                            <>
                              <ChevronDown size={14} />
                              Show Details
                            </>
                          )}
                        </button>
                      </div>

                      {showEnrichment && (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-4">
                          {/* Benefits */}
                          {enrichmentData.benefits.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide mb-2">
                                Key Benefits ({enrichmentData.benefits.length})
                              </h4>
                              <ul className="space-y-1">
                                {enrichmentData.benefits.map((benefit, idx) => (
                                  <li key={idx} className="text-xs text-zinc-400 flex gap-2">
                                    <span className="text-emerald-400">✓</span>
                                    <span>{benefit}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* USPs */}
                          {enrichmentData.unique_selling_points.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide mb-2">
                                Unique Selling Points ({enrichmentData.unique_selling_points.length})
                              </h4>
                              <ul className="space-y-1">
                                {enrichmentData.unique_selling_points.map((usp, idx) => (
                                  <li key={idx} className="text-xs text-zinc-400 flex gap-2">
                                    <span className="text-violet-400">★</span>
                                    <span>{usp}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Target Audiences */}
                          {enrichmentData.target_audiences.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide mb-2">
                                Target Audiences ({enrichmentData.target_audiences.length})
                              </h4>
                              <div className="space-y-2">
                                {enrichmentData.target_audiences.slice(0, 2).map((audience, idx) => (
                                  <div key={idx} className="text-xs bg-zinc-800/50 rounded p-2">
                                    <p className="font-medium text-zinc-200 mb-1">{audience.segment}</p>
                                    <p className="text-zinc-500">{audience.why_this_product}</p>
                                  </div>
                                ))}
                                {enrichmentData.target_audiences.length > 2 && (
                                  <p className="text-xs text-zinc-600">
                                    + {enrichmentData.target_audiences.length - 2} more audience segments
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Hook Angles */}
                          {enrichmentData.hook_angles.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide mb-2">
                                Hook Angles ({enrichmentData.hook_angles.length})
                              </h4>
                              <div className="space-y-1.5">
                                {enrichmentData.hook_angles.slice(0, 3).map((hook, idx) => (
                                  <div key={idx} className="text-xs bg-zinc-800/50 rounded px-2 py-1.5">
                                    <p className="text-zinc-300">&quot;{hook.example_opening}&quot;</p>
                                  </div>
                                ))}
                                {enrichmentData.hook_angles.length > 3 && (
                                  <p className="text-xs text-zinc-600">
                                    + {enrichmentData.hook_angles.length - 3} more hook angles
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Save Button */}
                <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                  <AdminButton onClick={handleSaveScraped} disabled={savingScraped}>
                    {savingScraped ? (
                      <>
                        <Loader2 size={16} className="mr-1.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} className="mr-1.5" />
                        Save Product
                      </>
                    )}
                  </AdminButton>
                  <button
                    type="button"
                    onClick={() => {
                      setScrapedData(null);
                      setScrapeError(null);
                    }}
                    className="text-sm text-zinc-500 hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </AdminCard>
          )}
        </div>
      )}

      {/* Bulk Import Tab */}
      {activeTab === 'bulk' && (
        <div className="space-y-6">
          {/* URL Input Card */}
          <AdminCard
            title="Bulk Import from TikTok Shop"
            subtitle="Paste multiple TikTok Shop URLs (one per line) to scrape and import them all at once"
          >
            <div className="space-y-4">
              <div>
                <label htmlFor="bulk-urls" className="block text-sm font-medium text-zinc-300 mb-1.5">
                  TikTok Shop URLs
                </label>
                <textarea
                  id="bulk-urls"
                  value={bulkUrls}
                  onChange={(e) => setBulkUrls(e.target.value)}
                  rows={6}
                  placeholder={`https://www.tiktok.com/shop/pdp/product-1/123456\nhttps://www.tiktok.com/shop/pdp/product-2/789012\nhttps://www.tiktok.com/shop/pdp/product-3/345678`}
                  className="w-full rounded-lg border border-white/10 bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-y font-mono"
                  disabled={bulkScraping}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-zinc-500">
                    {bulkUrls.split('\n').filter(u => u.trim().startsWith('http')).length} URL{bulkUrls.split('\n').filter(u => u.trim().startsWith('http')).length !== 1 ? 's' : ''} detected (max 20)
                  </p>
                </div>
              </div>

              {/* Auto-enrich toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={bulkAutoEnrich}
                    onChange={(e) => setBulkAutoEnrich(e.target.checked)}
                    className="sr-only"
                    disabled={bulkScraping}
                  />
                  <div className={`w-10 h-5 rounded-full transition-colors ${bulkAutoEnrich ? 'bg-violet-500' : 'bg-zinc-700'}`} />
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${bulkAutoEnrich ? 'translate-x-5' : ''}`} />
                </div>
                <div>
                  <span className="text-sm text-zinc-200">Auto-enrich with AI</span>
                  <p className="text-xs text-zinc-500">Generate hooks, audiences, and selling points for each product</p>
                </div>
              </label>

              {/* Scrape Button */}
              <AdminButton
                onClick={handleBulkScrape}
                disabled={bulkScraping || bulkUrls.split('\n').filter(u => u.trim().startsWith('http')).length === 0}
              >
                {bulkScraping ? (
                  <>
                    <Loader2 size={16} className="mr-1.5 animate-spin" />
                    {bulkProgress.phase} {bulkProgress.current}/{bulkProgress.total}...
                  </>
                ) : (
                  <>
                    <Upload size={16} className="mr-1.5" />
                    Scrape All Products
                  </>
                )}
              </AdminButton>
            </div>
          </AdminCard>

          {/* Progress Bar */}
          {bulkScraping && bulkProgress.total > 0 && (
            <div className="rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-zinc-300">
                  {bulkProgress.phase}: {bulkProgress.current} of {bulkProgress.total}
                </span>
                <span className="text-xs text-zinc-500">
                  {Math.round((bulkProgress.current / bulkProgress.total) * 100)}%
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-300"
                  style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {bulkResults.length > 0 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-medium text-zinc-200">
                    {bulkResults.filter(r => r.data).length} scraped, {bulkResults.filter(r => !r.data).length} failed
                    {bulkResults.some(r => r.saved) && `, ${bulkResults.filter(r => r.saved).length} saved`}
                  </h3>
                </div>
                {bulkResults.some(r => r.data && !r.saved) && !bulkScraping && (
                  <AdminButton onClick={handleBulkSave} disabled={bulkSaving}>
                    {bulkSaving ? (
                      <>
                        <Loader2 size={16} className="mr-1.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} className="mr-1.5" />
                        Save All ({bulkResults.filter(r => r.data && !r.saved).length})
                      </>
                    )}
                  </AdminButton>
                )}
              </div>

              {/* Product Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bulkResults.map((result, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border p-4 ${
                      result.saved
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : result.data
                        ? 'border-white/10 bg-zinc-900/50'
                        : 'border-red-500/20 bg-red-500/5'
                    }`}
                  >
                    {result.data ? (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          {/* Product Image */}
                          {result.data.images[0] && (
                            <img
                              src={result.data.images[0]}
                              alt={result.data.name}
                              className="w-14 h-14 rounded-lg border border-white/10 object-cover shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-sm font-medium text-zinc-100 line-clamp-2">
                                {result.data.name}
                              </h4>
                              {!result.saved && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBulkResult(idx)}
                                  className="text-zinc-600 hover:text-zinc-400 shrink-0"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 mt-0.5">{result.data.brand}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {result.data.price && (
                                <span className="text-xs font-medium text-zinc-300">
                                  ${result.data.price.toFixed(2)}
                                </span>
                              )}
                              {result.data.sold_count && (
                                <span className="text-xs text-zinc-500">
                                  {result.data.sold_count.toLocaleString()} sold
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-400 border border-white/10">
                            {result.data.category}
                          </span>
                          {result.enriching && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-violet-500/10 text-violet-400 border border-violet-500/20">
                              <Loader2 size={10} className="animate-spin" />
                              Enriching...
                            </span>
                          )}
                          {result.enrichment && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <Brain size={10} />
                              Enriched
                            </span>
                          )}
                          {result.saved && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle size={10} />
                              Saved
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-zinc-400 truncate">{result.url}</p>
                          <p className="text-xs text-red-300 mt-0.5">{result.error}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Reset button after save */}
              {bulkResults.every(r => !r.data || r.saved) && !bulkScraping && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkResults([]);
                      setBulkUrls('');
                    }}
                    className="text-sm text-zinc-500 hover:text-zinc-300"
                  >
                    <RotateCcw size={14} className="inline mr-1.5" />
                    Import More Products
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual Entry Tab */}
      {activeTab === 'manual' && (
        <AdminCard
          title="Add Product Manually"
          subtitle="Fill in the product details manually (useful for non-TikTok products)"
        >
          <div className="space-y-4">
            {/* Error Message */}
            {manualError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
                <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                <div className="text-sm text-red-300">{manualError}</div>
              </div>
            )}

            {/* Product Name */}
            <div>
              <label htmlFor="manual-name" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                id="manual-name"
                type="text"
                value={manualForm.name}
                onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                placeholder="e.g., Vitamin D3 Gummies"
                className="w-full rounded-lg border border-white/10 bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            {/* Brand */}
            <div>
              <label htmlFor="manual-brand" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Brand <span className="text-red-500">*</span>
              </label>
              {brandsLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 size={14} className="animate-spin" />
                  Loading brands...
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <select
                      id="manual-brand"
                      value={manualForm.brand_id}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setShowQuickBrand(true);
                        } else {
                          setManualForm({ ...manualForm, brand_id: e.target.value });
                        }
                      }}
                      className="flex-1 rounded-lg border border-white/10 bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    >
                      <option value="">Select a brand...</option>
                      {brandEntities.map(brand => (
                        <option key={brand.id} value={brand.id}>{brand.name}</option>
                      ))}
                      <option value="__new__">+ Create New Brand</option>
                    </select>
                  </div>
                  {showQuickBrand && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={quickBrandName}
                        onChange={(e) => setQuickBrandName(e.target.value)}
                        placeholder="New brand name..."
                        className="flex-1 rounded-lg border border-teal-500/50 bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleQuickBrandCreate(); }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleQuickBrandCreate}
                        disabled={creatingBrand || !quickBrandName.trim()}
                        className="px-4 py-2.5 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {creatingBrand ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowQuickBrand(false); setQuickBrandName(''); }}
                        className="px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Category */}
            <div>
              <label htmlFor="manual-category" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                id="manual-category"
                value={manualForm.category}
                onChange={(e) => setManualForm({ ...manualForm, category: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="">Select category...</option>
                {CATEGORY_OPTIONS.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Price */}
            <div>
              <label htmlFor="manual-price" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Price (optional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                <input
                  id="manual-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualForm.price}
                  onChange={(e) => setManualForm({ ...manualForm, price: e.target.value })}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-white/10 bg-zinc-800/60 pl-8 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="manual-description" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Description (optional)
              </label>
              <textarea
                id="manual-description"
                value={manualForm.description}
                onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                rows={3}
                placeholder="Product description..."
                className="w-full rounded-lg border border-white/10 bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-y"
              />
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="manual-notes" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Notes (optional)
              </label>
              <textarea
                id="manual-notes"
                value={manualForm.notes}
                onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                rows={2}
                placeholder="Internal notes, talking points, compliance warnings..."
                className="w-full rounded-lg border border-white/10 bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-y"
              />
            </div>

            {/* Save Button */}
            <div className="flex items-center gap-3 pt-2 border-t border-white/10">
              <AdminButton onClick={handleSaveManual} disabled={savingManual}>
                {savingManual ? (
                  <>
                    <Loader2 size={16} className="mr-1.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={16} className="mr-1.5" />
                    Create Product
                  </>
                )}
              </AdminButton>
              <Link
                href="/admin/products"
                className="text-sm text-zinc-500 hover:text-zinc-300"
              >
                Cancel
              </Link>
            </div>
          </div>
        </AdminCard>
      )}

      {/* Import History */}
      {recentImports.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-zinc-500" />
              <h3 className="text-sm font-medium text-zinc-200">Recent Imports</h3>
            </div>
            <Link href="/admin/products" className="text-xs text-violet-400 hover:text-violet-300">
              View All
            </Link>
          </div>
          {historyLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 size={14} className="animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="space-y-2">
              {recentImports.slice(0, 5).map(product => (
                <Link
                  key={product.id}
                  href={`/admin/products/${product.id}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors group"
                >
                  {product.product_image_url ? (
                    <img
                      src={product.product_image_url}
                      alt={product.name}
                      className="w-8 h-8 rounded border border-white/10 object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded border border-white/10 bg-zinc-800 flex items-center justify-center shrink-0">
                      <Package size={14} className="text-zinc-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate group-hover:text-zinc-100">
                      {product.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {product.brand} &middot; {product.category}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0">
                    {new Date(product.created_at).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Help Card */}
      <div className="rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-500/15 flex items-center justify-center shrink-0">
            <ExternalLink size={16} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-100 mb-1">Need your ScrapeCreators API key?</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              The TikTok Shop scraper requires a ScrapeCreators API key. Get yours at{' '}
              <a
                href="https://scrapecreators.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:text-violet-300 underline"
              >
                scrapecreators.com
              </a>
              , then add <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-xs">SCRAPECREATORS_API_KEY</code> to your environment variables.
            </p>
          </div>
        </div>
      </div>
    </AdminPageLayout>
  );
}
