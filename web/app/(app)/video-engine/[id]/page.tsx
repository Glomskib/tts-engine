import RunDetail from '@/components/video-engine/RunDetail';

export const metadata = { title: 'Run · Video Engine — FlashFlow' };

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="max-w-5xl mx-auto">
      <RunDetail runId={id} />
    </div>
  );
}
