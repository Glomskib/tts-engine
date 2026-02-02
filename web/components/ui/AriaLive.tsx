'use client';

import { useEffect, useState, useCallback, createContext, useContext, ReactNode } from 'react';

type AriaLivePoliteness = 'polite' | 'assertive' | 'off';

interface Announcement {
  message: string;
  politeness: AriaLivePoliteness;
  id: number;
}

// Context for announcements
const AriaLiveContext = createContext<{
  announce: (message: string, politeness?: AriaLivePoliteness) => void;
} | null>(null);

/**
 * Provider component for ARIA live announcements
 * Should wrap the app or a section that needs announcements
 */
export function AriaLiveProvider({ children }: { children: ReactNode }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [idCounter, setIdCounter] = useState(0);

  const announce = useCallback((message: string, politeness: AriaLivePoliteness = 'polite') => {
    const id = idCounter;
    setIdCounter((prev) => prev + 1);
    setAnnouncements((prev) => [...prev, { message, politeness, id }]);

    // Remove announcement after it's been read (roughly 5 seconds)
    setTimeout(() => {
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    }, 5000);
  }, [idCounter]);

  return (
    <AriaLiveContext.Provider value={{ announce }}>
      {children}
      <AriaLiveRegion announcements={announcements} />
    </AriaLiveContext.Provider>
  );
}

/**
 * Hook to access the announce function
 */
export function useAriaLive() {
  const context = useContext(AriaLiveContext);
  if (!context) {
    // Return a no-op if not wrapped in provider
    return {
      announce: () => {
        console.warn('AriaLiveProvider not found. Announcement will not be made.');
      },
    };
  }
  return context;
}

/**
 * The actual ARIA live region component (hidden but accessible)
 */
function AriaLiveRegion({ announcements }: { announcements: Announcement[] }) {
  const polite = announcements.filter((a) => a.politeness === 'polite');
  const assertive = announcements.filter((a) => a.politeness === 'assertive');

  return (
    <>
      {/* Polite announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {polite.map((a) => (
          <span key={a.id}>{a.message}</span>
        ))}
      </div>

      {/* Assertive announcements */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertive.map((a) => (
          <span key={a.id}>{a.message}</span>
        ))}
      </div>
    </>
  );
}

/**
 * Standalone live region for one-off announcements
 */
export function LiveRegion({
  message,
  politeness = 'polite',
  clearAfter = 5000,
}: {
  message: string;
  politeness?: AriaLivePoliteness;
  clearAfter?: number;
}) {
  const [current, setCurrent] = useState(message);

  useEffect(() => {
    setCurrent(message);
    if (clearAfter > 0) {
      const timer = setTimeout(() => setCurrent(''), clearAfter);
      return () => clearTimeout(timer);
    }
  }, [message, clearAfter]);

  return (
    <div
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {current}
    </div>
  );
}

/**
 * Visually hidden element for screen readers
 */
export function ScreenReaderOnly({ children, as: Component = 'span' }: {
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
}) {
  return (
    <Component className="sr-only">
      {children}
    </Component>
  );
}

/**
 * Loading state announcement
 */
export function LoadingAnnouncement({
  isLoading,
  loadingMessage = 'Loading',
  loadedMessage = 'Content loaded',
}: {
  isLoading: boolean;
  loadingMessage?: string;
  loadedMessage?: string;
}) {
  const [prevLoading, setPrevLoading] = useState(isLoading);

  return (
    <LiveRegion
      message={isLoading ? loadingMessage : prevLoading !== isLoading ? loadedMessage : ''}
      politeness="polite"
    />
  );
}
