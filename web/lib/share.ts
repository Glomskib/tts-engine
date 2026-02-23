import { track } from '@/lib/tracking';

interface SharePayload {
  title: string;
  text?: string;
  url: string;
}

interface ShareResult {
  success: boolean;
  method: 'native' | 'clipboard' | 'none';
  error?: string;
}

/**
 * Share content using navigator.share (mobile) or clipboard fallback.
 * Fires a share_clicked analytics event regardless of outcome.
 */
export async function handleShare(
  payload: SharePayload,
  callbacks?: { onSuccess?: (method: 'native' | 'clipboard') => void; onError?: (msg: string) => void }
): Promise<ShareResult> {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

  // Analytics event
  track('share_clicked', {
    route: typeof window !== 'undefined' ? window.location.pathname : '',
    isMobile,
  });

  // Try native share (typically available on mobile browsers)
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text || payload.title,
        url: payload.url,
      });
      callbacks?.onSuccess?.('native');
      return { success: true, method: 'native' };
    } catch (err: unknown) {
      // User cancelled the share sheet — not a real error
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, method: 'none' };
      }
      // Fall through to clipboard
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(payload.url);
    callbacks?.onSuccess?.('clipboard');
    return { success: true, method: 'clipboard' };
  } catch {
    const msg = 'Unable to share or copy link';
    callbacks?.onError?.(msg);
    return { success: false, method: 'none', error: msg };
  }
}
