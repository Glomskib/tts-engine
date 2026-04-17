import UploadCard from '@/components/video-engine/UploadCard';
import RunsList from '@/components/video-engine/RunsList';

export const metadata = { title: 'Video Engine — FlashFlow' };

export default function VideoEnginePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-0 py-6 sm:py-10 space-y-10">
      <header className="text-center sm:text-left">
        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-50 tracking-tight">
          Turn one video into shareable clips
        </h1>
        <p className="mt-2 text-sm sm:text-base text-zinc-400 leading-relaxed">
          Upload a video. We pick the best moments, add captions, and hand you clips you can post.
        </p>
      </header>

      <section aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="sr-only">Upload a video</h2>
        <div className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-5 sm:p-6">
          <UploadCard />
        </div>
      </section>

      <section aria-labelledby="recent-heading" className="space-y-3">
        <h2 id="recent-heading" className="text-sm font-medium text-zinc-300">Your videos</h2>
        <RunsList />
      </section>
    </div>
  );
}
