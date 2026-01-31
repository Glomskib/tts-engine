import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
    url: "https://app.flashflow.ai",
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
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
  },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  category: "technology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-[#09090b] antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
