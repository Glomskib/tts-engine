'use client';

import Link from 'next/link';
import { Sparkles, Zap } from 'lucide-react';
import AdminPageLayout from '@/app/admin/components/AdminPageLayout';
import TokCommentTool from '@/components/tools/TokCommentTool';

export default function AdminTokCommentPage() {
  return (
    <AdminPageLayout
      title="Comment Replies"
      subtitle="Make a comment reply sticker — transparent PNG, ready for your video overlay"
    >
      <div className="flex items-center gap-4 mb-4 text-sm">
        <Link
          href="/admin/content-studio"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Sparkles size={14} />
          Content Studio
        </Link>
        <span className="text-zinc-700">|</span>
        <Link
          href="/admin/hook-generator"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Zap size={14} />
          Hooks
        </Link>
      </div>
      <TokCommentTool embedded />
    </AdminPageLayout>
  );
}
