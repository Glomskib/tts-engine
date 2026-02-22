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

// ─── Product Linking ────────────────────────────────────────────────────────

export const ADD_PRODUCT_BTN: SelectorList = [
  'button:has-text("Add product")',
  'button:has-text("Product link")',
  'text="Add product"',
  '[class*="product"] button',
  'button:has-text("product")',
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
  'button:has-text("Save as draft")',
  'button:has-text("Draft")',
  'button:has-text("Save draft")',
];

export const POST_BTN: SelectorList = [
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

// ─── Success Detection ─────────────────────────────────────────────────────

export const SUCCESS_INDICATORS: SelectorList = [
  'text="Successfully"',
  'text="uploaded"',
  'text="saved"',
  'text="Your video"',
  '[class*="success"]',
  '[class*="toast"]',
];
