import type { Metadata } from 'next';
import { BreadcrumbSchema } from '@/components/BreadcrumbSchema';

export const metadata: Metadata = {
  title: { absolute: 'Pricing | Plans for Creators & Businesses | FlashFlow AI' },
  description:
    'Start free with 5 scripts/month. Upgrade to Creator Lite ($9), Creator Pro ($29), or Business ($59) for unlimited AI-powered TikTok Shop scripts. Brand & Agency plans available.',
  openGraph: {
    title: 'FlashFlow AI Pricing — Plans That Grow With You',
    description:
      'AI-powered TikTok Shop scripts from $0/mo. 4 tiers: Free, Creator Lite, Creator Pro, and Business. Enterprise plans available.',
    url: 'https://flashflowai.com/pricing',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FlashFlow AI' }],
  },
  twitter: {
    card: 'summary',
    title: 'FlashFlow AI Pricing — Plans That Grow With You',
    description: 'AI-powered TikTok Shop scripts from $0/mo. Free, Lite, Creator Pro, and Business tiers.',
    images: ['/opengraph-image'],
  },
  alternates: {
    canonical: 'https://flashflowai.com/pricing',
  },
};

// Schema.org Product with per-tier Offer entries. Google rich-snippets pricing
// directly from this when paired with the page's PriceSpecification on each
// card. AggregateOffer surfaces "from $0" in SERP.
const PRICING_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'FlashFlow AI',
  description:
    'AI-powered TikTok Shop content engine — scripts, hooks, clips, publishing, commissions.',
  brand: { '@type': 'Brand', name: 'FlashFlow AI' },
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'USD',
    lowPrice: '0',
    highPrice: '99',
    offerCount: 4,
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
        name: 'Starter',
        price: '19',
        priceCurrency: 'USD',
        url: 'https://flashflowai.com/pricing',
        availability: 'https://schema.org/InStock',
        eligibleQuantity: { '@type': 'QuantitativeValue', unitCode: 'MON' },
      },
      {
        '@type': 'Offer',
        name: 'Creator',
        price: '49',
        priceCurrency: 'USD',
        url: 'https://flashflowai.com/pricing',
        availability: 'https://schema.org/InStock',
        eligibleQuantity: { '@type': 'QuantitativeValue', unitCode: 'MON' },
      },
      {
        '@type': 'Offer',
        name: 'Pro',
        price: '99',
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
