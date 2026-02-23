import type { NextConfig } from "next";

// Security headers for production
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=()'
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['@ffmpeg-installer/ffmpeg', 'canvas', 'jsdom', '@tobyg74/tiktok-api-dl'],
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  turbopack: {
    root: __dirname,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Replicate AI image generation
      {
        protocol: 'https',
        hostname: 'replicate.delivery',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.replicate.delivery',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'pbxt.replicate.delivery',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'replicate.com',
        pathname: '/**',
      },
      // Supabase storage (for uploaded images)
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/**',
      },
      // Common CDNs that might host generated images
      {
        protocol: 'https',
        hostname: '*.cloudflare.com',
        pathname: '/**',
      },
      // TikTok Shop product images (via ScrapeCreators)
      {
        protocol: 'https',
        hostname: '*.ttcdn-us.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.tiktokcdn-us.com',
        pathname: '/**',
      },
      // FlashFlow production domain
      {
        protocol: 'https',
        hostname: 'flashflowai.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.flashflowai.com',
        pathname: '/**',
      },
    ],
  },
  webpack(config: Record<string, unknown> & { resolve?: { alias?: Record<string, string> } }, { isServer }: { isServer: boolean }) {
    // react-joyride@2.9.3 imports unmountComponentAtNode which was removed in
    // React 19.  Alias the import to a tiny shim so webpack can resolve it
    // without crashing at compile time.  The shim is client-only (SSR is
    // already excluded via next/dynamic ssr:false).
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'react-dom$': require.resolve('./lib/react-dom-compat.js'),
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Cache public pages aggressively
        source: '/transcribe',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/pricing',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/features',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/about',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/tools',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
