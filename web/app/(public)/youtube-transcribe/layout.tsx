import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Free YouTube Transcriber — AI-Powered, No Signup Needed | FlashFlow AI',
  description:
    'Free AI-powered YouTube transcript generator. Paste any URL, get a clean transcript instantly. Bonus AI breakdown included.',
  keywords: [
    'free youtube transcriber',
    'youtube transcript generator',
    'youtube transcript online',
    'transcribe youtube video free',
    'youtube to text',
    'youtube video to text',
    'youtube shorts transcriber',
    'paste youtube into chatgpt',
    'ai youtube transcript',
  ],
  openGraph: {
    title: 'Free YouTube Transcriber — AI-Powered, No Signup Needed | FlashFlow AI',
    description:
      'Paste any YouTube link. Get a clean transcript in seconds. Plus a bonus AI breakdown of hooks, structure, and what works — free.',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FlashFlow AI' }],
    url: 'https://flashflowai.com/youtube-transcribe',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free YouTube Transcriber | FlashFlow AI',
    description:
      'Paste any YouTube link, get a clean transcript instantly. Bonus AI breakdown included. No signup.',
    images: ['/opengraph-image'],
  },
  alternates: {
    canonical: 'https://flashflowai.com/youtube-transcribe',
  },
};

export default function YouTubeTranscribeLayout({ children }: { children: ReactNode }) {
  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Free YouTube Transcriber',
    url: 'https://flashflowai.com/youtube-transcribe',
    description:
      'Free AI-powered YouTube transcript generator. Paste any URL, get a clean transcript instantly. Bonus AI breakdown of hooks and structure included.',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript. Requires a modern browser.',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
    },
    creator: {
      '@type': 'Organization',
      name: 'FlashFlow AI',
      url: 'https://flashflowai.com',
    },
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is this YouTube transcriber free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, completely free with no signup required. Paste any YouTube URL and get the full transcript instantly. A bonus AI breakdown is included free.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I paste the transcript into ChatGPT?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes — that is the main use case. Click the Copy button on the transcript and paste it into ChatGPT, Claude, Notion, Google Docs, or any other tool.',
        },
      },
      {
        '@type': 'Question',
        name: 'What YouTube formats are supported?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The transcriber works with standard YouTube videos (youtube.com/watch), YouTube Shorts, and youtu.be short links. Any public YouTube video can be transcribed.',
        },
      },
      {
        '@type': 'Question',
        name: 'How accurate is the transcription?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'FlashFlow uses YouTube\'s built-in captions when available, with high-accuracy AI transcription as fallback for videos without captions. Accuracy is typically >95% for clear audio.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is the bonus AI breakdown?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'After the transcript, you also get a free breakdown of the video\'s hook, key phrases, emotional triggers, and pacing structure — useful if you want to learn what makes the video work.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I use this for long YouTube videos?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, the transcriber works with videos of any length. The transcript covers the full video; the bonus AI analysis focuses on the most engaging segments.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {children}
    </>
  );
}
