/**
 * Revenue Intelligence – TikTok DOM Selectors
 *
 * Isolated selector file for quick patching when TikTok updates their DOM.
 * Covers the creator profile page and individual video comment sections.
 */

// ── Profile page: video grid ───────────────────────────────────

export const PROFILE = {
  /** The video card containers on a creator's profile page. */
  videoCards: [
    '[data-e2e="user-post-item"]',
    '[class*="DivItemContainerV2"]',
    '[class*="DivVideoFeed"] [class*="DivItemContainer"]',
    'div[data-e2e="user-post-item-list"] > div',
  ],
  /** Link to the video within a card. */
  videoLink: [
    'a[href*="/video/"]',
    'a',
  ],
  /** Caption text within a video card (if visible on profile). */
  captionInCard: [
    '[class*="DivDesContainer"] [class*="SpanOuter"]',
    '[data-e2e="user-post-item-desc"]',
  ],
  /** View count overlay on video thumbnail. */
  viewCount: [
    '[data-e2e="video-views"]',
    'strong[data-e2e="video-views"]',
    '[class*="StrongVideoCount"]',
    '[class*="DivPlayCount"] strong',
  ],
} as const;

// ── Individual video page ──────────────────────────────────────

export const VIDEO_PAGE = {
  /** Caption/description on a single video page. */
  caption: [
    '[data-e2e="browse-video-desc"]',
    '[data-e2e="video-desc"]',
    'h1[data-e2e="video-desc"]',
    '[class*="DivVideoInfoContainer"] span',
    '[class*="SpanText"]',
  ],
  /** Comment count displayed near the video. */
  commentCount: [
    '[data-e2e="browse-comment-count"]',
    '[data-e2e="comment-count"]',
    'strong[data-e2e="comment-count"]',
  ],
} as const;

// ── Comment section ────────────────────────────────────────────

export const COMMENTS = {
  /** Button to click to activate/open the comment panel. */
  commentButton: [
    '[data-e2e="comment-icon"]',
    'button[aria-label*="comment" i]',
  ],
  /** Individual comment containers (each wraps one comment). */
  commentItem: [
    '[class*="DivCommentObjectWrapper"]',
    '[class*="DivCommentItemContainer"]',
    '[data-e2e="comment-item"]',
    '[class*="CommentItem"]',
    '[class*="comment-item"]',
  ],
  /** Username within a comment. */
  username: [
    '[data-e2e="comment-username-1"]',
    'a[data-e2e="comment-username"]',
    '[class*="StyledLink"] [class*="SpanUserName"]',
    'a[href*="/@"] span',
    'a[href*="/@"]',
  ],
  /** Display name within a comment (sometimes shown above username). */
  displayName: [
    '[data-e2e="comment-nickname"]',
    '[class*="SpanNickname"]',
  ],
  /** Comment text body. */
  commentText: [
    '[data-e2e="comment-level-1"]',
    '[data-e2e="comment-level-1"] span',
    'p[data-e2e="comment-level-1"]',
    '[class*="DivComment"] p > span',
    '[class*="comment-text"]',
    '[class*="CommentText"]',
  ],
  /** Like count on a comment. */
  likeCount: [
    '[data-e2e="comment-like-count"]',
    'span[data-e2e="comment-like-count"]',
    '[class*="SpanCount"]',
  ],
  /** Reply count / "View replies" button. */
  replyCount: [
    '[data-e2e="view-more-replies-1"]',
    'p[data-e2e="comment-reply-count"]',
    '[class*="ReplyCount"]',
  ],
  /** Timestamp text (e.g. "2d ago", "1w"). */
  timestamp: [
    '[data-e2e="comment-time-1"]',
    'span[data-e2e="comment-time"]',
    '[class*="SpanCreatedTime"]',
  ],
  /** Container that holds the comment list (for scrolling). */
  commentListContainer: [
    '[class*="DivCommentListContainer"]',
    '[class*="CommentList"]',
    '[class*="DivCommentContainer"]',
  ],
  /** "View more comments" or scroll trigger. */
  loadMore: [
    'p[data-e2e="view-more-1"]',
    '[class*="DivViewMoreComments"]',
    'button:has-text("View more comments")',
  ],
  /** Comment sort button / dropdown trigger. */
  sortButton: [
    '[data-e2e="comment-sort"]',
    '[class*="DivSortContainer"]',
    '[class*="DivHeaderSort"]',
    '[class*="SortBy"]',
    'div[class*="DivCommentListContainer"] [class*="DivHeader"] div[role="button"]',
    'div[class*="DivCommentListContainer"] [class*="DivSort"]',
    // Fallback: any clickable element near the top of comment list with "Relevance" or sort text
    'span:has-text("Relevance")',
    'span:has-text("All comments")',
  ],
  /** "Newest" option within the sort dropdown/menu. */
  sortNewest: [
    '[data-e2e="comment-sort-newest"]',
    'div[role="option"]:has-text("Newest")',
    'li:has-text("Newest")',
    'span:has-text("Newest")',
    'div:has-text("Newest first")',
    'p:has-text("Newest")',
  ],
  /** Comment ID is usually in a data attribute or derived from the link. */
  commentIdAttr: 'data-comment-id',
} as const;

// ── Login detection ────────────────────────────────────────────

export const LOGIN_INDICATORS = {
  /** If we land on a login page or are not authenticated. */
  loginForm: [
    '[data-e2e="top-login-button"]',
    'form[data-e2e="login-form"]',
    'input[name="username"]',
    'button:has-text("Log in")',
    '[class*="LoginContainer"]',
  ],
  /** URL patterns that indicate we've been redirected to login. */
  loginUrlPatterns: ['/login', '/auth', '/signup'],
} as const;
