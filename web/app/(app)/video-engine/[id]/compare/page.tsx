import CompareView from '@/components/video-engine/CompareView';

export const metadata = { title: { absolute: 'Compare · Video Engine | FlashFlow AI' } };

export default async function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="max-w-6xl mx-auto">
      <CompareView runId={id} />
    </div>
  );
}
