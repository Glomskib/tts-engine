/**
 * Daily Virals DOM selectors — isolated for quick patching.
 *
 * If the site's HTML changes, update ONLY this file.
 * Run `npm run trending:daily-virals -- --dry-run` to test.
 */

// ── Login page ──
export const LOGIN = {
  emailInput: 'input[type="email"], input[name="email"], #email',
  passwordInput: 'input[type="password"], input[name="password"], #password',
  submitButton: 'button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")',
  /** Indicators that login succeeded (any match = logged in) */
  loggedInIndicator: [
    '[data-testid="user-menu"]',
    'nav a[href*="dashboard"]',
    '.dashboard',
    'a[href*="/account"]',
    'button:has-text("Logout")',
    'button:has-text("Log out")',
  ],
  /** Indicators of 2FA / CAPTCHA blocking */
  blockIndicators: [
    'input[name="otp"]',
    'input[name="code"]',
    '[class*="captcha"]',
    '[id*="captcha"]',
    'iframe[src*="captcha"]',
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    '[class*="two-factor"]',
    '[class*="2fa"]',
    'input[placeholder*="verification"]',
    'input[placeholder*="code"]',
  ],
} as const;

// ── Trending list page ──
export const TRENDING = {
  /** Container for each trending item (row / card) */
  itemContainer: [
    'table tbody tr',
    '[class*="product-card"]',
    '[class*="trending-item"]',
    '[class*="rank-row"]',
    'div[class*="item"]',
    '.product-list > div',
  ],

  /** Within an item container — fields */
  rank: [
    '[class*="rank"]',
    'td:first-child',
    '[class*="position"]',
    '[class*="number"]',
  ],
  title: [
    '[class*="title"]',
    '[class*="name"] a',
    'h3',
    'h4',
    'td:nth-child(2) a',
    '[class*="product-name"]',
  ],
  productName: [
    '[class*="product-name"]',
    '[class*="product"] [class*="name"]',
    '[class*="item-name"]',
  ],
  category: [
    '[class*="category"]',
    '[class*="tag"]',
    '[class*="badge"]',
  ],
  thumbnail: [
    'img[class*="thumb"]',
    'img[class*="product"]',
    'img[class*="cover"]',
    'img:first-of-type',
    'video[poster]',
  ],
  sourceLink: [
    'a[href*="tiktok"]',
    'a[href*="product"]',
    'a[class*="link"]',
    'a[target="_blank"]',
    'td a[href]',
  ],
  hookText: [
    '[class*="hook"]',
    '[class*="caption"]',
    '[class*="description"]',
    '[class*="text-preview"]',
  ],
  scriptSnippet: [
    '[class*="script"]',
    '[class*="transcript"]',
  ],

  /** Metric labels → value pairs.  The scraper tries each selector on the item. */
  metricSelectors: [
    '[class*="views"]',
    '[class*="gmv"]',
    '[class*="revenue"]',
    '[class*="velocity"]',
    '[class*="sold"]',
    '[class*="commission"]',
    '[class*="likes"]',
    '[class*="shares"]',
    '[class*="metric"]',
    '[class*="stat"]',
    'td',
  ],
} as const;

// ── Pagination (if needed to reach 20 items) ──
export const PAGINATION = {
  nextButton: [
    'button:has-text("Next")',
    'a:has-text("Next")',
    '[class*="pagination"] button:last-child',
    '[class*="next"]',
  ],
  loadMore: [
    'button:has-text("Load more")',
    'button:has-text("Show more")',
    '[class*="load-more"]',
  ],
} as const;
