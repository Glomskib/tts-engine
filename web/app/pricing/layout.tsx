import type { Metadata } from 'next';
import { BreadcrumbSchema } from '@/components/BreadcrumbSchema';

export const metadata: Metadata = {
  title: { absolute: 'Pricing | Plans for Creators & Businesses | FlashFlow AI' },
  description:
    'Start free. Upgrade to Lite ($9), Creator ($19), Creator Pro ($29), or Fleet ($149) for the full AI script + clip + publishing engine. Built for TikTok Shop, Reels, and YouTube Shorts creators.',
  openGraph: {
    title: 'FlashFlow AI Pricing — Plans That Grow With You',
    description:
      'AI-powered creator content engine from $0/mo. Free, Lite ($9), Creator ($19), Creator Pro ($29), Fleet ($149).',
    url: 'https://flashflowai.com/pricing',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FlashFlow AI' }],
  },
  twitter: {
    card: 'summary',
    title: 'FlashFlow AI Pricing — Plans That Grow With You',
    description: 'From $0/mo. Free, Lite ($9), Creator ($19), Creator Pro ($29), Fleet ($149).',
    images: ['/opengraph-image'],
  },
  alternates: {
    canonical: 'https://flashflowai.com/pricing',
  },
};

// Schema.org Product with per-tier Offer entries. Google rich-snippets pricing
// directly from this when paired with the page's PriceSpecification on each
// card. AggregateOffer surfaces "from $0" in SERP.
// Keep these tiers in sync with web/lib/plans.ts PRICING_PLANS — drift here
// means Google indexes prices that don't match the page.
const PRICING_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'FlashFlow AI',
  description:
    'AI-powered creator content engine — scripts, hooks, clips, publishing, commissions.',
  brand: { '@type': 'Brand', name: 'FlashFlow AI' },
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'USD',
    lowPrice: '0',
    highPrice: '149',
    offerCount: 5,
    offers: [
      {
        '@type': 'Offer',
        name: 'Free',
        price: '0',
        priceCurrency: 'USD',
        url: 'https://flashflowai.com/pricing',
        availability: 'https://schema.org/InStock',
      },
      {
        '@type': 'Offer',
        name: 'Lite',
        price: '9',
        priceCurrency: 'USD',
        url: 'https://flashflowai.com/pricing',
        availability: 'https://schema.org/InStock',
        eligibleQuantity: { '@type': 'QuantitativeValue', unitCode: 'MON' },
      },
      {
        '@type': 'Offer',
        name: 'Creator',
        price: '19',
        priceCurrency: 'USD',
        url: 'https://flashflowai.com/pricing',
        availability: 'https://schema.org/InStock',
        eligibleQuantity: { '@type': 'QuantitativeValue', unitCode: 'MON' },
      },
      {
        '@type': 'Offer',
        name: 'Creator Pro',
        price: '29',
        priceCurrency: 'USD',
        url: 'https://flashflowai.com/pricing',
        availability: 'https://schema.org/InStock',
        eligibleQuantity: { '@type': 'QuantitativeValue', unitCode: 'MON' },
      },
      {
        '@type': 'Offer',
        name: 'Fleet',
        price: '149',
        priceCurrency: 'USD',
        url: 'https://flashflowai.com/pricing',
        availability: 'https://schema.org/InStock',
        eligibleQuantity: { '@type': 'QuantitativeValue', unitCode: 'MON' },
      },
    ],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbSchema
        trail={[
          { name: 'Home', url: 'https://flashflowai.com/' },
          { name: 'Pricing', url: 'https://flashflowai.com/pricing' },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRICING_SCHEMA) }}
      />
      {children}
    </>
  );
}
