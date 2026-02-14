import Image from 'next/image';

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <Image
          src="/FFAI.png"
          alt="FlashFlow AI"
          width={48}
          height={48}
          className="rounded-xl animate-pulse"
          priority
        />
        <div className="w-48 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full w-full rounded-full animate-shimmer" />
        </div>
      </div>
    </div>
  );
}
