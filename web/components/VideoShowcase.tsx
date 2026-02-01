'use client';

import { useState, useEffect } from 'react';
import { Play, ExternalLink, Heart, Eye } from 'lucide-react';

interface ShowcaseVideo {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string;
  tiktok_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  views: number;
  likes: number;
  client_name: string | null;
  category: string | null;
  is_featured: boolean;
}

interface VideoShowcaseProps {
  limit?: number;
  showTitle?: boolean;
  onContactClick?: () => void;
}

export function VideoShowcase({ limit = 6, showTitle = true, onContactClick }: VideoShowcaseProps) {
  const [videos, setVideos] = useState<ShowcaseVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState<ShowcaseVideo | null>(null);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const res = await fetch(`/api/showcase/videos?limit=${limit}&featured=true`);
        const data = await res.json();
        if (data.ok) {
          setVideos(data.videos);
        }
      } catch (err) {
        console.error('Failed to fetch showcase videos:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [limit]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Show placeholder cards if no videos yet
  const placeholderVideos = [
    { title: 'Product Demo', category: 'product', views: 125000, likes: 8500 },
    { title: 'UGC Testimonial', category: 'ugc', views: 89000, likes: 6200 },
    { title: 'Educational Explainer', category: 'educational', views: 156000, likes: 12000 },
    { title: 'Brand Story', category: 'testimonial', views: 234000, likes: 18500 },
    { title: 'Quick Tutorial', category: 'educational', views: 67000, likes: 4300 },
    { title: 'Social Proof', category: 'ugc', views: 98000, likes: 7100 },
  ];

  return (
    <div>
      {showTitle && (
        <div className="text-center mb-12">
          <p className="text-sm font-medium text-violet-400 uppercase tracking-widest mb-4">Our Work</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Videos that perform.
          </h2>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">
            See what we create for brands like yours. Real results, real engagement.
          </p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(limit)].map((_, i) => (
            <div key={i} className="aspect-[9/16] rounded-xl bg-zinc-800/50 animate-pulse" />
          ))}
        </div>
      ) : videos.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onPlay={() => setActiveVideo(video)}
              formatNumber={formatNumber}
            />
          ))}
        </div>
      ) : (
        /* Placeholder showcase when no videos in DB */
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {placeholderVideos.slice(0, limit).map((placeholder, i) => (
            <div
              key={i}
              className="group relative aspect-[9/16] rounded-xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/5 overflow-hidden"
            >
              {/* Placeholder content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-3">
                  <Play className="w-5 h-5 text-white/60" />
                </div>
                <p className="text-sm font-medium text-zinc-300">{placeholder.title}</p>
                <p className="text-xs text-zinc-500 capitalize mt-1">{placeholder.category}</p>
              </div>

              {/* Stats overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Eye size={12} />
                    {formatNumber(placeholder.views)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart size={12} />
                    {formatNumber(placeholder.likes)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      {onContactClick && (
        <div className="mt-10 text-center">
          <button
            onClick={onContactClick}
            className="inline-flex items-center px-8 py-4 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-all shadow-lg"
          >
            Get Videos Like These
            <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      )}

      {/* Video Modal */}
      {activeVideo && (
        <VideoModal
          video={activeVideo}
          onClose={() => setActiveVideo(null)}
        />
      )}
    </div>
  );
}

function VideoCard({
  video,
  onPlay,
  formatNumber,
}: {
  video: ShowcaseVideo;
  onPlay: () => void;
  formatNumber: (n: number) => string;
}) {
  const videoUrl = video.tiktok_url || video.instagram_url || video.youtube_url;

  return (
    <div
      className="group relative aspect-[9/16] rounded-xl overflow-hidden cursor-pointer bg-zinc-900"
      onClick={onPlay}
    >
      {/* Thumbnail */}
      <img
        src={video.thumbnail_url}
        alt={video.title}
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      />

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

      {/* Play button */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
          <Play className="w-6 h-6 text-white fill-white" />
        </div>
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        {video.client_name && (
          <p className="text-xs text-zinc-400 mb-1">{video.client_name}</p>
        )}
        <p className="text-sm font-medium text-white mb-2 line-clamp-2">{video.title}</p>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="flex items-center gap-1">
            <Eye size={12} />
            {formatNumber(video.views)}
          </span>
          <span className="flex items-center gap-1">
            <Heart size={12} />
            {formatNumber(video.likes)}
          </span>
        </div>
      </div>

      {/* Category badge */}
      {video.category && (
        <div className="absolute top-3 left-3">
          <span className="px-2 py-1 text-xs font-medium bg-black/50 backdrop-blur-sm rounded-full text-zinc-300 capitalize">
            {video.category}
          </span>
        </div>
      )}

      {/* External link */}
      {videoUrl && (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-3 right-3 p-2 rounded-full bg-black/50 backdrop-blur-sm text-zinc-300 hover:text-white hover:bg-black/70 transition-colors"
        >
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

function VideoModal({
  video,
  onClose,
}: {
  video: ShowcaseVideo;
  onClose: () => void;
}) {
  const videoUrl = video.tiktok_url || video.instagram_url || video.youtube_url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-zinc-900 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-zinc-400 hover:text-white hover:bg-black/70 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Video thumbnail */}
        <div className="aspect-[9/16] bg-black">
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover"
          />
          {videoUrl && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/50 transition-colors"
            >
              <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/40">
                <Play className="w-8 h-8 text-white fill-white ml-1" />
              </div>
            </a>
          )}
        </div>

        {/* Info */}
        <div className="p-5">
          <h3 className="text-lg font-semibold text-white mb-2">{video.title}</h3>
          {video.description && (
            <p className="text-sm text-zinc-400 mb-4">{video.description}</p>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Eye size={14} />
                {video.views.toLocaleString()} views
              </span>
              <span className="flex items-center gap-1.5">
                <Heart size={14} />
                {video.likes.toLocaleString()} likes
              </span>
            </div>

            {videoUrl && (
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                Watch <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoShowcase;
