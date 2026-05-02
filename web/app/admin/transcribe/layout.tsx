import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Transcriber — Free AI Video & Audio Transcription | FlashFlow',
  description:
    'Free AI transcriber. Transcribe video to text and audio to text in seconds with high-accuracy AI. Supports MP4, MOV, MP3, WAV, and YouTube links. A faster, free alternative to Otter, Rev, and Descript transcription.',
  keywords: [
    'transcribe video to text',
    'video transcription tool',
    'audio to text AI',
    'free transcription',
    'AI transcriber',
    'mp3 to text',
    'youtube transcription',
    'transcribe interview',
  ],
  openGraph: {
    title: 'Transcriber — Free AI Video & Audio Transcription | FlashFlow',
    description:
      'Transcribe video and audio to text in seconds. Free, accurate, and fast — paste a YouTube link or upload a file.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Transcriber — Free AI Video & Audio Transcription | FlashFlow',
    description:
      'Transcribe video and audio to text in seconds. Free, accurate, and fast.',
  },
  alternates: {
    canonical: '/admin/transcribe',
  },
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'FlashFlow Transcriber',
  description:
    'Free AI-powered video and audio transcription tool. Transcribe MP4, MOV, MP3, WAV, and YouTube videos to text with high accuracy.',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  featureList: [
    'AI-powered video transcription',
    'Audio-to-text transcription',
    'YouTube link transcription',
    'Multi-language support',
    'Word-level timestamps',
    'Free tier with no credit card required',
  ],
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '247',
    bestRating: '5',
    worstRating: '1',
  },
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How accurate is the AI transcriber?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'FlashFlow Transcriber uses a state-of-the-art Whisper-based AI model that delivers 90–97% accuracy on clear speech, depending on accent, background noise, and audio quality. Word-level timestamps are returned for every transcript.',
      },
    },
    {
      '@type': 'Question',
      name: 'What languages does the transcriber support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The transcriber supports 50+ languages including English, Spanish, French, German, Portuguese, Italian, Dutch, Russian, Mandarin, Japanese, Korean, Hindi, Arabic, and more. Language is auto-detected.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are the file size and length limits?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Free tier supports files up to 25 MB and roughly 30 minutes of audio per transcription. Paid plans support longer videos. YouTube and direct video links are downloaded server-side, so length is the only constraint.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does FlashFlow Transcriber compare to Otter, Rev, and Descript?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'FlashFlow Transcriber is free for short clips, integrates directly with content creation tools (hooks, scripts, captions), and accepts YouTube links — no copy-paste workflow. Rev charges per minute. Otter is meeting-focused. Descript is a paid editor. FlashFlow is built for short-form video creators who want to go from transcript to script to posted video in one workspace.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a free version, or is it paid only?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'There is a permanent free tier with limits on file size and monthly transcription minutes. Creator and Pro plans unlock longer videos, batch processing, and direct integrations with the AI Video Editor, Hook Generator, and Content Studio.',
      },
    },
  ],
};

export default function TranscribeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  );
}
