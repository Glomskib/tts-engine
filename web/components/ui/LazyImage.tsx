'use client';

import { useState, useEffect, useRef } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  width?: number | string;
  height?: number | string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  threshold?: number;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * LazyImage component that uses Intersection Observer for lazy loading
 * with a smooth fade-in effect and placeholder.
 */
export function LazyImage({
  src,
  alt,
  className = '',
  placeholderClassName = '',
  width,
  height,
  objectFit = 'cover',
  threshold = 0.1,
  onLoad,
  onError,
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: '50px' }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [threshold]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  const style: React.CSSProperties = {
    width: width || '100%',
    height: height || '100%',
    position: 'relative',
    overflow: 'hidden',
  };

  return (
    <div ref={imgRef} style={style} className={className}>
      {/* Placeholder / Loading state */}
      {!isLoaded && !hasError && (
        <div
          className={`absolute inset-0 bg-zinc-800 animate-pulse ${placeholderClassName}`}
          style={{ objectFit }}
        />
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">
          <span className="text-zinc-500 text-xs">Failed to load</span>
        </div>
      )}

      {/* Actual image - only load when in view */}
      {isInView && !hasError && (
        <img
          src={src}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ objectFit }}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
}

/**
 * Thumbnail variant optimized for small images in lists
 */
export function LazyThumbnail({
  src,
  alt,
  size = 48,
  className = '',
  rounded = true,
}: {
  src: string;
  alt: string;
  size?: number;
  className?: string;
  rounded?: boolean;
}) {
  return (
    <LazyImage
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`flex-shrink-0 ${rounded ? 'rounded-lg' : ''} ${className}`}
      objectFit="cover"
    />
  );
}

export default LazyImage;
