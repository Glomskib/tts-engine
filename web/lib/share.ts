import { track } from '@/lib/tracking';

/** True if at least one share/copy method is available — false means hide the button. */
export function canShare(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share === 'function') return true;
  if (typeof navigator.clipboard?.writeText === 'function') return true;
  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') return true;
  return false;
}

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

/** Copy text using the legacy execCommand fallback (works on HTTP). */
function execCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* ignored */ }
  document.body.removeChild(ta);
  return ok;
}

/**
 * Share content using the best available method:
 * 1. navigator.share (mobile native share sheet)
 * 2. navigator.clipboard.writeText (modern clipboard API, requires HTTPS)
 * 3. document.execCommand('copy') (legacy fallback, works on HTTP)
 */
export async function handleShare(
  payload: SharePayload,
  callbacks?: { onSuccess?: (method: 'native' | 'clipboard') => void; onError?: (msg: string) => void }
): Promise<ShareResult> {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

  track('share_clicked', {
    route: typeof window !== 'undefined' ? window.location.pathname : '',
    isMobile,
  });

  // 1. Native share (mobile)
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
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, method: 'none' };
      }
      // Fall through to clipboard
    }
  }

  // 2. Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(payload.url);
      callbacks?.onSuccess?.('clipboard');
      return { success: true, method: 'clipboard' };
    } catch {
      // Fall through to execCommand
    }
  }

  // 3. Legacy execCommand fallback (works on HTTP / expired user activation)
  if (execCopy(payload.url)) {
    callbacks?.onSuccess?.('clipboard');
    return { success: true, method: 'clipboard' };
  }

  const msg = 'Unable to share or copy link';
  callbacks?.onError?.(msg);
  return { success: false, method: 'none', error: msg };
}
