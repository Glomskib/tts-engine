'use client';

import AdminPageLayout from '@/app/admin/components/AdminPageLayout';
import TokCommentTool from '@/components/tools/TokCommentTool';

export default function AdminTokCommentPage() {
  return (
    <AdminPageLayout
      title="Comment Reply Sticker"
      subtitle="Generate a transparent PNG overlay of a TikTok on-screen comment reply bubble"
    >
      <TokCommentTool embedded />
    </AdminPageLayout>
  );
}
