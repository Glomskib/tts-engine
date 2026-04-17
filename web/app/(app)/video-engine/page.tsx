import UploadCard from '@/components/video-engine/UploadCard';
import RunsList from '@/components/video-engine/RunsList';
import LaneTabs from '@/components/video-engine/LaneTabs';

export const metadata = { title: 'Video Engine — FlashFlow' };

type Lane = 'product' | 'clipper';

export default async function VideoEnginePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const raw = typeof sp.lane === 'string' ? sp.lane : Array.isArray(sp.lane) ? sp.lane[0] : undefined;
  const lane: Lane = raw === 'clipper' ? 'clipper' : 'product';

  const isClipper = lane === 'clipper';

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-0 py-6 sm:py-10 space-y-8">
      <LaneTabs active={lane} />

      <header className="text-center sm:text-left">
        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-50 tracking-tight">
          {isClipper
            ? 'Find the best moments in your long-form video'
            : 'Turn one video into shareable clips'}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-zinc-400 leading-relaxed">
          {isClipper
            ? 'Upload a podcast, stream, or long YouTube. We surface the strongest moments and cut them into ready-to-post clips — then you post and keep clipping.'
            : 'Upload a video. We pick the best moments, add captions, and hand you clips you can post.'}
        </p>
      </header>

      <section aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="sr-only">
          {isClipper ? 'Upload long-form content' : 'Upload a video'}
        </h2>
        <div className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-5 sm:p-6">
          <UploadCard lane={lane} />
        </div>
      </section>

      <section aria-labelledby="recent-heading" className="space-y-3">
        <h2 id="recent-heading" className="text-sm font-medium text-zinc-300">
          {isClipper ? 'Your recent sources' : 'Your videos'}
        </h2>
        <RunsList />
      </section>
    </div>
  );
}
