import type { Metadata } from 'next';
import TokCommentTool from '@/components/tools/TokCommentTool';

export const metadata: Metadata = {
  title: 'TikTok Comment Reply Sticker | FlashFlow',
  description:
    'Generate a transparent PNG overlay of a TikTok on-screen comment reply bubble. No watermark. Works in any video editor.',
  alternates: {
    canonical: 'https://flashflowai.com/tools/tok-comment',
  },
};

export default function TokCommentPage() {
  return <TokCommentTool />;
}
