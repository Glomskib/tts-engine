/**
 * FlashFlow QA-bot config.
 *
 * Lists every URL the QA bot hits and what to expect from each.
 * Edit this file to add/remove monitored routes — the bot picks them up
 * on next run, no other code changes required.
 *
 * --target=<url> CLI flag overrides BASE_URL so the same bot can run
 * against client domains, mc.flashflowai.com, staging URLs, etc.
 */

export type CheckMethod = 'GET' | 'POST' | 'HEAD';

export interface QaCheck {
  /** Path appended to the base URL. Use "" for the homepage. */
  path: string;
  /** HTTP method. Defaults to GET. */
  method?: CheckMethod;
  /**
   * One of:
   *   - "200": must return 2xx
   *   - "auth": must return 200 OR a 3xx that lands on a login page (admin gates)
   *   - "redirect": must return a 3xx
   *   - "any-2xx-or-4xx": method-not-allowed/expected-401 etc. is fine; only 5xx fails
   *   - a specific number (e.g. 405) for known method-not-allowed routes
   */
  expect: '200' | 'auth' | 'redirect' | 'any-2xx-or-4xx' | number;
  /** If true, screenshot the rendered page. Default true for browser checks, false for API. */
  screenshot?: boolean;
  /** If true, hit it as an API check (no browser nav, just fetch). Default false. */
  apiOnly?: boolean;
  /** Optional POST body for apiOnly checks. */
  body?: unknown;
  /** Headers to attach (only for apiOnly checks). */
  headers?: Record<string, string>;
  /** Friendly label used in the summary report. */
  label?: string;
}

export interface QaConfig {
  /** Default target if --target isn't passed. */
  baseUrl: string;
  /** Per-check timeout in ms. */
  navTimeoutMs: number;
  /** Hard ceiling on the whole run, in ms. */
  totalTimeoutMs: number;
  /** Viewport for screenshots. */
  viewport: { width: number; height: number };
  /** Checks to run. */
  checks: QaCheck[];
}

/** Default config — points at FlashFlow production. */
export const DEFAULT_CONFIG: QaConfig = {
  baseUrl: 'https://flashflowai.com',
  navTimeoutMs: 30_000,
  totalTimeoutMs: 5 * 60_000,
  viewport: { width: 1280, height: 800 },
  checks: [
    // Public pages — should render 200 + screenshot cleanly.
    { path: '/', expect: '200', label: 'Homepage' },
    { path: '/pricing', expect: '200', label: 'Pricing' },

    // Admin gates — should 307 to /login when unauthenticated. The redirect
    // landing on /login is itself a "pass" — that's the expected security path.
    { path: '/admin/transcribe', expect: 'auth', label: 'Admin: Transcribe' },
    { path: '/admin/comment-miner', expect: 'auth', label: 'Admin: Comment Miner' },
    { path: '/admin/affiliate', expect: 'auth', label: 'Admin: Affiliate' },
    { path: '/admin/hook-generator', expect: 'auth', label: 'Admin: Hook Generator' },
    { path: '/admin/editor/new', expect: 'auth', label: 'Admin: Editor (new)' },

    // API endpoints — no browser, just fetch and check status.
    {
      path: '/api/webhooks/tiktok-shop',
      method: 'GET',
      expect: 'any-2xx-or-4xx',
      apiOnly: true,
      label: 'API: TikTok Shop webhook',
    },
    {
      path: '/api/orgs/me',
      method: 'GET',
      expect: 'any-2xx-or-4xx',
      apiOnly: true,
      label: 'API: orgs/me (auth gate)',
    },
  ],
};

/** Parse CLI argv for `--target=<url>` and `--config=<json>` overrides. */
export function parseCliConfig(argv: readonly string[]): QaConfig {
  let cfg: QaConfig = { ...DEFAULT_CONFIG, checks: [...DEFAULT_CONFIG.checks] };
  for (const arg of argv) {
    if (arg.startsWith('--target=')) {
      const target = arg.slice('--target='.length).replace(/\/$/, '');
      cfg = { ...cfg, baseUrl: target };
    } else if (arg.startsWith('--config=')) {
      try {
        const json = JSON.parse(arg.slice('--config='.length));
        cfg = { ...cfg, ...(json as Partial<QaConfig>) };
      } catch (err) {
        console.error('[qa-bot] failed to parse --config=', err);
      }
    }
  }
  return cfg;
}

/** Slugify a URL path so it can be a filename. */
export function pathSlug(p: string): string {
  if (!p || p === '/') return 'root';
  return p
    .replace(/^\//, '')
    .replace(/\//g, '_')
    .replace(/[^a-z0-9._-]/gi, '_')
    .slice(0, 80);
}
