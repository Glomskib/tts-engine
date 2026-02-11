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
    value: 'camera=(), microphone=(), geolocation=()'
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
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
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
