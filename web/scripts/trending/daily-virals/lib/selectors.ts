/**
 * Daily Virals DOM selectors — isolated for quick patching.
 *
 * If the site's HTML changes, update ONLY this file.
 * Run `npm run trending:daily-virals -- --dry-run` to test.
 *
 * Last updated: 2026-02-21 based on live page screenshots.
 * Site: thedailyvirals.com — dark SPA with sidebar navigation.
 */

// ── Cookie banner ──
export const COOKIE_BANNER = {
  acceptButton: [
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("Got it")',
    '[class*="cookie"] button:first-of-type',
  ],
} as const;

// ── Login flow ──
// The site has a sidebar with a "Login" link that opens a login form/page.
export const LOGIN = {
  /** Sidebar login link — must click this first to reach the login form */
  sidebarLoginLink: [
    'a:has-text("Login")',
    'button:has-text("Login")',
    '[class*="login"]',
    'nav a:has-text("Login")',
    'aside a:has-text("Login")',
    'a[href*="login"]',
    'a[href*="signin"]',
  ],
  emailInput: 'input[type="email"], input[name="email"], #email, input[placeholder*="email" i], input[placeholder*="Email"]',
  passwordInput: 'input[type="password"], input[name="password"], #password, input[placeholder*="password" i]',
  submitButton: 'button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login"), form button',
  /** Indicators that login succeeded (any match = logged in) */
  loggedInIndicator: [
    'button:has-text("Logout")',
    'button:has-text("Log out")',
    'a:has-text("Logout")',
    'a:has-text("Log out")',
    '[data-testid="user-menu"]',
    'nav a[href*="dashboard"]',
    'a[href*="/account"]',
    'a[href*="/profile"]',
    '[class*="avatar"]',
    '[class*="user-menu"]',
    // If the sidebar no longer shows "Login", we're authenticated
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
    'input[placeholder*="verification" i]',
    'input[placeholder*="code" i]',
  ],
} as const;

// ── Trending list page ──
// After login, the main content area shows viral product cards/rows.
// The page has filters: date picker, product filter, category filter.
export const TRENDING = {
  /** Wait for content to load after login — look for these */
  contentLoadedIndicator: [
    '[class*="video"]',
    '[class*="card"]',
    '[class*="product"]',
    '[class*="grid"]',
    '[class*="list"]',
    'table',
  ],

  /** Container for each trending item (row / card) */
  itemContainer: [
    // Table-based layouts
    'table tbody tr',
    // Card-based layouts (common in TikTok product dashboards)
    '[class*="video-card"]',
    '[class*="product-card"]',
    '[class*="viral-card"]',
    '[class*="trending-card"]',
    '[class*="content-card"]',
    // Grid item patterns
    '[class*="grid"] > div[class]',
    '[class*="list"] > div[class]',
    // Generic card/row patterns
    '[class*="card"]:not(nav *)',
    '[class*="row"]:not(nav *):not(header *)',
    // Main content area children (exclude sidebar/nav)
    'main > div > div[class]',
    'main [class*="item"]',
  ],

  /** Within an item container — fields */
  rank: [
    '[class*="rank"]',
    '[class*="position"]',
    '[class*="number"]',
    '[class*="index"]',
    'td:first-child',
    'span:first-child',
  ],
  title: [
    '[class*="title"]',
    '[class*="name"] a',
    'h3',
    'h4',
    'h2',
    'a[class*="title"]',
    'td:nth-child(2) a',
    'td:nth-child(2)',
    '[class*="product-name"]',
    '[class*="video-title"]',
    'p[class*="name"]',
  ],
  productName: [
    '[class*="product-name"]',
    '[class*="product"] [class*="name"]',
    '[class*="item-name"]',
    '[class*="shop-name"]',
  ],
  category: [
    '[class*="category"]',
    '[class*="tag"]:not([class*="hash"])',
    '[class*="badge"]',
    '[class*="label"]',
  ],
  thumbnail: [
    'img[class*="thumb"]',
    'img[class*="product"]',
    'img[class*="cover"]',
    'img[class*="video"]',
    'video[poster]',
    'img:first-of-type',
  ],
  sourceLink: [
    'a[href*="tiktok.com"]',
    'a[href*="tiktokshop"]',
    'a[href*="product"]',
    'a[href*="video"]',
    'a[class*="link"]',
    'a[target="_blank"]',
    'td a[href]',
  ],
  hookText: [
    '[class*="hook"]',
    '[class*="caption"]',
    '[class*="description"]',
    '[class*="text-preview"]',
    '[class*="script"]',
    'p[class*="text"]',
  ],
  scriptSnippet: [
    '[class*="script"]',
    '[class*="transcript"]',
    '[class*="copy-text"]',
  ],

  /** Metric labels → value pairs. The scraper tries each selector on the item. */
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
    '[class*="count"]',
    '[class*="amount"]',
    'td',
    'span[class]',
  ],
} as const;

// ── Pagination (if needed to reach 20 items) ──
export const PAGINATION = {
  nextButton: [
    'button:has-text("Next")',
    'a:has-text("Next")',
    '[class*="pagination"] button:last-child',
    '[class*="next"]',
    '[class*="pagination"] a:last-child',
  ],
  loadMore: [
    'button:has-text("Load more")',
    'button:has-text("Show more")',
    'button:has-text("Load More")',
    'button:has-text("View More")',
    '[class*="load-more"]',
    '[class*="show-more"]',
  ],
} as const;
