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
  title: "FlashFlow AI - Ideas move faster here",
  description: "AI-powered script generation for creators, marketers, and teams. Build momentum. Ship faster. Stay in flow.",
  keywords: ["AI", "script generation", "content creation", "video scripts", "marketing"],
  openGraph: {
    title: "FlashFlow AI",
    description: "AI-powered script generation for creators, marketers, and teams.",
    type: "website",
  },
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
