/**
 * Centralized selector definitions for TikTok Studio.
 *
 * Strategy: role/text-based selectors first, attribute-based fallbacks second.
 * TikTok Studio is a React SPA — class names are unstable, but text labels
 * and ARIA roles are more durable.
 */

/** Try selectors in order; first visible match wins. */
export type SelectorList = readonly string[];

// ─── File Upload ────────────────────────────────────────────────────────────

export const FILE_INPUT: SelectorList = [
  'input[type="file"][accept*="video"]',
  'input[type="file"]',
];

// ─── Caption / Description ──────────────────────────────────────────────────

export const CAPTION_EDITOR: SelectorList = [
  '[contenteditable="true"]',
  '[data-placeholder*="caption"]',
  '[data-placeholder*="description"]',
  '[aria-label*="caption"]',
  '[aria-label*="description"]',
];

// ─── Product / Link ─────────────────────────────────────────────────────────

export const ADD_PRODUCT_BTN: SelectorList = [
  '[data-e2e="anchor_container"] button',
  'button:has-text("Add link")',
  'button:has-text("Add product")',
  'button:has-text("Product link")',
  '[class*="product"] button',
];

/** "Add link" modal — step 1: link type selection + Next button */
export const LINK_TYPE_MODAL_NEXT: SelectorList = [
  // The modal has a "Next" button at the bottom
  '.TUXModal-overlay button:has-text("Next")',
  '[class*="Modal"] button:has-text("Next")',
  '[role="dialog"] button:has-text("Next")',
  'button:has-text("Next")',
];

/** Search input inside the floating product search panel (step 2) */
export const PRODUCT_SEARCH_INPUT: SelectorList = [
  // Scoped to floating portal — avoids matching background "Search locations"
  '[data-floating-ui-portal] input[placeholder="Search products"]',
  '[data-floating-ui-portal] input[placeholder*="Search"]',
  '[data-floating-ui-portal] input[type="search"]',
  // Fallback: anywhere on page but specific placeholder
  'input[placeholder="Search products"]',
  'input[placeholder*="search product"]',
];

export const PRODUCT_RESULT_ROW: SelectorList = [
  // Floating portal table rows (checkboxes in product list)
  '[data-floating-ui-portal] table tbody tr:first-child',
  '[data-floating-ui-portal] [class*="product"] [class*="item"]:first-child',
  '[data-floating-ui-portal] [class*="search-result"]:first-child',
  '[data-floating-ui-portal] [role="listbox"] [role="option"]:first-of-type',
  '[data-floating-ui-portal] [class*="list"] [class*="row"]:first-child',
  // Fallback: unscoped
  '[class*="product"] [class*="item"]:first-child',
  '[class*="search-result"]:first-child',
  'table tbody tr:first-child',
  '[role="listbox"] [role="option"]:first-of-type',
];

/** Confirm button in the floating product panel (step 2 — after selecting) */
export const PRODUCT_CONFIRM_BTN: SelectorList = [
  '[data-floating-ui-portal] button:has-text("Next")',
  '[data-floating-ui-portal] button:has-text("Confirm")',
  '[data-floating-ui-portal] button:has-text("Done")',
  '[data-floating-ui-portal] button:has-text("Add")',
  'button:has-text("Confirm")',
  'button:has-text("Done")',
];

// ─── Joyride / Tutorial Overlay ─────────────────────────────────────────────

export const JOYRIDE_DISMISS: SelectorList = [
  'button:has-text("Got it")',
  'button:has-text("Skip")',
  '[class*="joyride"] button',
  '[class*="react-joyride"] button',
];

// ─── Draft / Post ───────────────────────────────────────────────────────────

export const DRAFT_BTN: SelectorList = [
  '[data-e2e="save_draft_button"]',
  'button:has-text("Save as draft")',
  'button:has-text("Draft")',
  'button:has-text("Save draft")',
];

export const POST_BTN: SelectorList = [
  '[data-e2e="post_video_button"]',
  'button:has-text("Post")',
  'button[type="submit"]:has-text("Post")',
];

// ─── Login Detection ────────────────────────────────────────────────────────

export const LOGIN_INDICATORS: SelectorList = [
  'button:has-text("Log in")',
  'button:has-text("Sign up")',
  'input[name="username"]',
  '[class*="login"]',
];

// ─── Captcha / 2FA / Blocker Detection ─────────────────────────────────────

export const CAPTCHA_INDICATORS: SelectorList = [
  'iframe[src*="captcha"]',
  'iframe[src*="recaptcha"]',
  '[class*="captcha"]',
  '[id*="captcha"]',
  'text="Verify"',
  'text="verify you are human"',
  'text="slide to verify"',
  'text="Drag the slider"',
  '[class*="verify"]',
];

export const TWO_FA_INDICATORS: SelectorList = [
  'text="Enter the code"',
  'text="verification code"',
  'text="Two-factor"',
  'text="2-step"',
  'input[placeholder*="code"]',
  '[class*="two-factor"]',
  '[class*="verification-code"]',
];

export const BLOCKER_INDICATORS: SelectorList = [
  'text="Something went wrong"',
  'text="Try again later"',
  'text="rate limit"',
  'text="temporarily unavailable"',
  'text="suspended"',
  'text="Account suspended"',
  'text="violat"',
  '[class*="error-page"]',
];

// ─── Success Detection ─────────────────────────────────────────────────────

export const SUCCESS_INDICATORS: SelectorList = [
  'text="Successfully"',
  'text="uploaded"',
  'text="saved"',
  'text="Your video"',
  '[class*="success"]',
  '[class*="toast"]',
];
