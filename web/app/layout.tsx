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
    default: "FlashFlow AI — AI-Powered TikTok & Instagram Scripts",
    template: "%s | FlashFlow AI",
  },
  description: "Generate viral short-form scripts for TikTok and Instagram Reels personalized to your creator voice. Hook patterns that stop the scroll, free transcriber, content calendar, brand-deal tracking. Built for influencers and UGC creators. Try free — no credit card.",
  keywords: ["AI script generator", "TikTok scripts", "Instagram scripts", "video scripts", "content creation", "UGC scripts", "3-part hooks", "scroll-stopping hooks", "short-form video"],
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
    title: "FlashFlow AI — Scripts That Stop The Scroll",
    description: "AI-powered script generator for TikTok & Instagram creators. 7 content types, 3-part hooks, free transcriber.",
    url: "https://flashflowai.com",
    siteName: "FlashFlow AI",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "https://flashflowai.com/logo.png",
        width: 1024,
        height: 1024,
        alt: "FlashFlow AI - Teal Lightning Bolt Logo",
      },
    ],
  },
  twitter: {
    // summary_large_image gives us a bigger preview card when the URL is shared
    // on X/Twitter and many other clients that respect Twitter card tags.
    // iMessage / SMS still use Open Graph above, which is unchanged.
    card: "summary_large_image",
    title: "FlashFlow AI — Scripts That Stop The Scroll",
    description: "AI-powered script generator for TikTok & Instagram. Try free.",
    images: ["https://flashflowai.com/logo.png"],
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
    logo: 'https://flashflowai.com/logo.png',
    description: 'AI-powered short-form video content creation platform for TikTok, Instagram Reels, YouTube, and Facebook creators.',
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
    description: 'AI-powered TikTok Shop video content creation platform. Generate scripts, create videos, and analyze winners.',
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
        
        {/* Performance: Preconnect to external APIs */}
        <link rel="preconnect" href="https://api.openai.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://replicate.delivery" crossOrigin="anonymous" />
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL || ''} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL || ''} />
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
