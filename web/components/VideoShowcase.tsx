'use client';

import { useState, useEffect } from 'react';
import { Play, ExternalLink, Heart, Eye } from 'lucide-react';
import { SHOWCASE_VIDEOS } from '@/lib/showcase-videos';

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

interface OEmbedData {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
}

interface VideoShowcaseProps {
  limit?: number;
  showTitle?: boolean;
  onContactClick?: () => void;
}

export function VideoShowcase({ limit = 6, showTitle = true, onContactClick }: VideoShowcaseProps) {
  const [videos, setVideos] = useState<ShowcaseVideo[]>([]);
  const [oembedData, setOembedData] = useState<Record<string, OEmbedData>>({});
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState<ShowcaseVideo | null>(null);
  const [useConfigFallback, setUseConfigFallback] = useState(false);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const res = await fetch(`/api/showcase/videos?limit=${limit}&featured=true`);
        const data = await res.json();
        if (data.ok && data.videos && data.videos.length > 0) {
          setVideos(data.videos);
        } else {
          // Fall back to config file videos
          setUseConfigFallback(true);
        }
      } catch (err) {
        console.error('Failed to fetch showcase videos:', err);
        setUseConfigFallback(true);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [limit]);

  // Fetch oEmbed data for config videos
  useEffect(() => {
    if (!useConfigFallback) return;

    const fetchOembedData = async () => {
      const results: Record<string, OEmbedData> = {};

      await Promise.all(
        SHOWCASE_VIDEOS.slice(0, limit).map(async (video) => {
          try {
            const res = await fetch(`/api/tiktok/oembed?url=${encodeURIComponent(video.tiktokUrl)}`);
            if (res.ok) {
              const data = await res.json();
              results[video.id] = data;
            }
          } catch {
            console.error('Failed to fetch oEmbed for', video.id);
          }
        })
      );

      setOembedData(results);
    };

    fetchOembedData();
  }, [useConfigFallback, limit]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

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
      ) : useConfigFallback ? (
        /* TikTok oEmbed showcase from config */
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {SHOWCASE_VIDEOS.slice(0, limit).map((video) => {
            const oembed = oembedData[video.id];

            return (
              <a
                key={video.id}
                href={video.tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative bg-zinc-900 rounded-2xl overflow-hidden hover:ring-2 hover:ring-teal-500 transition-all duration-300 hover:scale-[1.02]"
              >
                {/* Thumbnail */}
                <div className="aspect-[9/16] bg-zinc-800 relative overflow-hidden">
                  {oembed?.thumbnail_url ? (
                    <img
                      src={oembed.thumbnail_url}
                      alt={video.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                      <div className="w-8 h-8 border-2 border-zinc-600 border-t-teal-400 rounded-full animate-spin" />
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                      <Play className="w-10 h-10 text-white fill-white ml-1" />
                    </div>
                  </div>

                  {/* TikTok logo badge */}
                  <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-full p-2">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                    </svg>
                  </div>

                  {/* Category badge */}
                  <div className="absolute bottom-3 left-3">
                    <span className="px-3 py-1 bg-teal-500/90 backdrop-blur-sm text-white text-xs font-medium rounded-full">
                      {video.category}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-teal-400 transition-colors">
                        {video.title}
                      </h3>
                      {oembed?.author_name && (
                        <p className="text-sm text-zinc-500 mt-1">@{oembed.author_name}</p>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-teal-400 transition-colors" />
                  </div>
                </div>
              </a>
            );
          })}
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
      ) : null}

      {/* View all on TikTok CTA */}
      <div className="text-center mt-10">
        <a
          href="https://www.tiktok.com/@flashflowai"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full font-medium transition-colors mr-4"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
          </svg>
          View all on TikTok
        </a>
        {onContactClick && (
          <button type="button"
            onClick={onContactClick}
            className="inline-flex items-center px-8 py-3 rounded-full bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-all shadow-lg"
          >
            Get Videos Like These
            <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        )}
      </div>

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
        <button type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-zinc-400 hover:text-white hover:bg-black/70 transition-colors"
          aria-label="Close"
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
                className="text-sm text-teal-400 hover:text-teal-300 flex items-center gap-1"
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
