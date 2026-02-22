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

export const PRODUCT_SEARCH_INPUT: SelectorList = [
  'input[placeholder*="Search"]',
  'input[placeholder*="search"]',
  'input[placeholder*="product"]',
  'input[type="search"]',
];

export const PRODUCT_RESULT_ROW: SelectorList = [
  '[class*="product"] [class*="item"]:first-child',
  '[class*="search-result"]:first-child',
  'table tbody tr:first-child',
  '[role="listbox"] [role="option"]:first-of-type',
  '[class*="list"] [class*="row"]:first-child',
];

export const PRODUCT_CONFIRM_BTN: SelectorList = [
  'button:has-text("Confirm")',
  'button:has-text("Done")',
  'button:has-text("Next")',
  'button:has-text("Add")',
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
