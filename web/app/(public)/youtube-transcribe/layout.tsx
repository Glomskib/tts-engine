import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Free YouTube Video Transcriber | AI Script Analyzer',
  description:
    'Transcribe any YouTube video for free. Get AI-powered hook analysis, key phrases, emotional triggers, and content recommendations. Works with videos, Shorts, and youtu.be links. No signup required.',
  keywords: [
    'free youtube video transcriber',
    'youtube transcript generator',
    'transcribe youtube video',
    'youtube video to text',
    'youtube script analyzer',
    'ai youtube content analyzer',
    'youtube shorts transcriber',
  ],
  openGraph: {
    title: 'Free YouTube Video Transcriber | AI Script Analyzer | FlashFlow AI',
    description:
      'Transcribe any YouTube video for free. Get AI-powered hook analysis, key phrases, and content recommendations.',
    type: 'website',
    images: [{ url: '/FFAI.png', width: 512, height: 512, alt: 'FlashFlow AI Logo' }],
    url: 'https://flashflowai.com/youtube-transcribe',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free YouTube Video Transcriber | FlashFlow AI',
    description:
      'Transcribe any YouTube video for free. Get AI-powered hook analysis and content recommendations.',
    images: ['/FFAI.png'],
  },
  alternates: {
    canonical: 'https://flashflowai.com/youtube-transcribe',
  },
};

export default function YouTubeTranscribeLayout({ children }: { children: ReactNode }) {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is this YouTube transcriber free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, completely free with no signup required. Paste any YouTube URL and get the full transcript with AI analysis instantly.',
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
          text: "FlashFlow uses YouTube's built-in captions when available, with OpenAI Whisper as a fallback for videos without captions. Accuracy is typically >95% for clear audio.",
        },
      },
      {
        '@type': 'Question',
        name: 'What does the AI analysis include?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You get hook strength scoring, key phrases extraction, emotional triggers, content structure breakdown, and actionable recommendations to adapt the content for your own videos.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I use this for long YouTube videos?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, the transcriber works with videos of any length. For very long videos, the AI analysis focuses on the most engaging segments including the hook, key transitions, and conclusion.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {children}
    </>
  );
}
