import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/client/',
          '/va/',
          '/auth/',
          '/reset-password',
          '/forgot-password',
          '/invite/',
          '/join/',
          '/my-tasks',
          '/concepts/',
          '/variants/',
          '/videos',
          '/uploader',
          '/upgrade',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
