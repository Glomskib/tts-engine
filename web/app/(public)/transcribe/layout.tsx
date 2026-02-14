import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Free TikTok Video Transcriber | AI Script Analyzer | FlashFlow AI',
  description:
    'Transcribe any TikTok video for free. Get AI-powered hook analysis, key phrases, emotional triggers, and content recommendations. Turn winning TikToks into your own scripts. No signup required.',
  keywords: [
    'free tiktok video transcriber',
    'tiktok transcript generator',
    'transcribe tiktok video',
    'tiktok video to text',
    'tiktok script analyzer',
    'ai tiktok content analyzer',
  ],
  openGraph: {
    title: 'Free TikTok Video Transcriber | AI Script Analyzer | FlashFlow AI',
    description:
      'Transcribe any TikTok video for free. Get AI-powered hook analysis, key phrases, and content recommendations.',
    type: 'website',
    images: [{ url: '/FFAI.png', width: 512, height: 512, alt: 'FlashFlow AI Logo' }],
    url: 'https://flashflowai.com/transcribe',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free TikTok Video Transcriber | FlashFlow AI',
    description:
      'Transcribe any TikTok video for free. Get AI-powered hook analysis and content recommendations.',
    images: ['/FFAI.png'],
  },
};

export default function TranscribeLayout({ children }: { children: ReactNode }) {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is this TikTok transcriber free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, you get 5 free transcriptions per day. No credit card or signup required. Premium plans offer unlimited transcriptions and advanced AI analysis.',
        },
      },
      {
        '@type': 'Question',
        name: 'How accurate is the transcription?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'FlashFlow uses OpenAI\'s Whisper model for transcription accuracy >95% for clear audio. The AI analysis of hooks, key phrases, and content patterns is powered by GPT-4.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I analyze any TikTok video?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, paste any public TikTok URL. The tool extracts the video metadata, transcribes the audio, and analyzes the content strategy, hook strength, and engagement tactics.',
        },
      },
      {
        '@type': 'Question',
        name: 'What does the AI analysis include?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You get hook strength scoring, key phrases extraction, emotional triggers, audience targeting analysis, content structure breakdown, and actionable recommendations to adapt the script.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I download the transcripts?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, export transcripts as text files or integrate directly into FlashFlow\'s script generator to create your own videos based on viral content patterns.',
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
