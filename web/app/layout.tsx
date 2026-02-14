import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

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
    default: "FlashFlow AI - AI-Powered Video Script Generator",
    template: "%s | FlashFlow AI",
  },
  description: "Create engaging TikTok and short-form video scripts in seconds. AI-powered script generation for creators, marketers, and teams.",
  keywords: ["AI script generator", "TikTok scripts", "video scripts", "content creation", "UGC scripts", "marketing scripts", "short-form video"],
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
    title: "FlashFlow AI - AI-Powered Video Script Generator",
    description: "Create engaging TikTok and short-form video scripts in seconds using AI.",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://flashflowai.com",
    siteName: "FlashFlow AI",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/FFAI.png",
        width: 512,
        height: 512,
        alt: "FlashFlow AI Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FlashFlow AI - AI-Powered Video Script Generator",
    description: "Create engaging TikTok and short-form video scripts in seconds using AI.",
    images: ["/FFAI.png"],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FlashFlow AI",
  },
  category: "technology",
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
    logo: 'https://flashflowai.com/FFAI.png',
    description: 'AI-powered TikTok Shop video content creation platform',
    sameAs: [
      'https://twitter.com/flashflowai',
    ],
  };

  const softwareApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'FlashFlow AI',
    applicationCategory: 'Multimedia',
    operatingSystem: 'Web',
    url: 'https://flashflowai.com',
    description: 'AI-powered TikTok Shop video content creation platform. Generate scripts, create videos, and analyze winners.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '500',
    },
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/FFAI.png" type="image/png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/FFAI.png" />
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
        
        {/* Performance: Preconnect to external APIs */}
        <link rel="preconnect" href="https://api.openai.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://replicate.delivery" crossOrigin="anonymous" />
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
          {children}
        </Providers>
      </body>
    </html>
  );
}
