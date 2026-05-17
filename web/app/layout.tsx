import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import CookieConsent from "@/components/CookieConsent";
import TopNav from '@/components/TopNav';
import QueueTicker from '@/components/QueueTicker';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#14b8a6",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://flashflowai.com"),
  title: {
    default: "FlashFlow AI — Growth Engine for TikTok Shop Affiliates & Creators",
    template: "%s | FlashFlow AI",
  },
  description: "The all-in-one growth engine for TikTok Shop affiliates, creators, and brands. Find products, generate hooks, edit videos, publish to TikTok, track commissions — in one tool. Try free — no credit card.",
  keywords: ["TikTok Shop affiliate", "TikTok Shop tools", "creator content engine", "TikTok Shop product discovery", "AI video editor", "hook generator", "comment miner", "TikTok publishing", "commission tracking", "affiliate marketing TikTok", "UGC creator tools", "AI script generator", "TikTok scripts"],
  authors: [{ name: "FlashFlow AI" }],
  creator: "FlashFlow AI",
  publisher: "FlashFlow AI",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "FlashFlow AI — The Growth Engine for TikTok Shop Affiliates",
    description: "Find products, generate hooks, edit videos, publish to TikTok, track commissions — in one tool. Built for TikTok Shop affiliates, creators, and brands.",
    url: "https://flashflowai.com",
    siteName: "FlashFlow AI",
    type: "website",
    locale: "en_US",
    // og:image is supplied by web/app/opengraph-image.tsx (Next.js file-based
    // metadata convention). The generated 1200x630 PNG renders the hero card
    // for FB/LinkedIn/iMessage ad previews. Don't add images here — file-based
    // metadata takes precedence for the same route segment, and a hardcoded
    // entry would split into two og:image tags.
  },
  twitter: {
    // summary_large_image gives us a bigger preview card when the URL is shared
    // on X/Twitter and many other clients that respect Twitter card tags.
    // The image is supplied by web/app/twitter-image.tsx (same 1200x630).
    card: "summary_large_image",
    title: "FlashFlow AI — Growth Engine for TikTok Shop Affiliates",
    description: "Find products, generate hooks, edit videos, publish to TikTok, track commissions — in one tool. Try free.",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FlashFlow AI",
  },
  category: "technology",
  // Search Console verification. Set GOOGLE_SITE_VERIFICATION (and optionally
  // BING_SITE_VERIFICATION) in Vercel env after starting verification in
  // Google Search Console → "HTML tag" method. Value is the content="" string
  // from the meta tag Google gives you (NOT the full tag, just the token).
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // JSON-LD Schema for Organization + SoftwareApplication
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FlashFlow AI',
    url: 'https://flashflowai.com',
    logo: 'https://flashflowai.com/logo.png',
    description: 'The all-in-one growth engine for TikTok Shop affiliates, creators, and brands. Find products, generate hooks, edit videos, publish to TikTok, track commissions — in one tool.',
    // sameAs lists external profiles. Empty until handles are claimed and
    // posting — leaving an unclaimed handle here would harm trust signals.
    sameAs: [],
  };

  const softwareApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'FlashFlow AI',
    applicationCategory: 'Multimedia',
    operatingSystem: 'Web',
    url: 'https://flashflowai.com',
    description: 'The all-in-one growth engine for TikTok Shop affiliates and creators. Affiliate Hub, AI hook generator, AI video editor, comment miner, multi-account TikTok publishing, and commission tracking — in one tool.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="FlashFlow" />
        <meta name="mobile-web-app-capable" content="yes" />
        
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
        />
        
        {/* Performance: only preconnect to first-party origin. Backend-vendor
            preconnects intentionally omitted — they leaked the underlying
            stack (OpenAI/Replicate/Supabase) in page source, which we want
            hidden from public competitors and prospective customers. The
            perf cost is negligible vs. the positioning/IP benefit. */}
        <link rel="dns-prefetch" href="https://flashflowai.com" />
        
        {/* Performance: Prefetch critical navigation */}
        <link rel="prefetch" href="/pricing" />
        <link rel="prefetch" href="/features" />
        <link rel="prefetch" href="/transcribe" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-[#09090b] antialiased`}
        suppressHydrationWarning
      >
        <Providers>
          <TopNav />
          {children}
          {/* Cookie consent banner — first-visit only, no-op after a choice. */}
          <CookieConsent />
          {/* Drives the worker queue from the user side while Vercel cron is
              broken. Self-stops with 401 if user is not logged in. */}
          <QueueTicker />
        </Providers>
      </body>
    </html>
  );
}
