/**
 * FlashFlow Extension — Content Script
 *
 * Runs on TikTok pages to extract context for content generation.
 * Extracts: video descriptions, product titles, hashtags, creator info.
 */

(() => {
  // ═══════════════════════════════════════════════════════════════
  // TIKTOK CONTEXT EXTRACTION
  // ═══════════════════════════════════════════════════════════════

  function extractTikTokContext() {
    const context = {
      source: 'tiktok',
      url: window.location.href,
      title: '',
      description: '',
      hashtags: [],
      creator: '',
      product: '',
    };

    // Video description
    const descEl =
      document.querySelector('[data-e2e="browse-video-desc"]') ||
      document.querySelector('[data-e2e="video-desc"]') ||
      document.querySelector('.tiktok-j2a19r-SpanText');
    if (descEl) {
      context.description = descEl.textContent.trim();
    }

    // Hashtags
    const hashtagEls = document.querySelectorAll(
      '[data-e2e="search-common-link"], a[href*="/tag/"]'
    );
    hashtagEls.forEach((el) => {
      const tag = el.textContent.trim();
      if (tag.startsWith('#') && !context.hashtags.includes(tag)) {
        context.hashtags.push(tag);
      }
    });

    // Creator name
    const creatorEl =
      document.querySelector('[data-e2e="browse-username"]') ||
      document.querySelector('[data-e2e="video-author-uniqueid"]');
    if (creatorEl) {
      context.creator = creatorEl.textContent.trim();
    }

    // Product info (TikTok Shop)
    const productEl =
      document.querySelector('[data-e2e="product-card-name"]') ||
      document.querySelector('.product-card-title') ||
      document.querySelector('[class*="ProductCard"] span');
    if (productEl) {
      context.product = productEl.textContent.trim();
    }

    // Page title fallback
    context.title = document.title || '';

    // Build a summary string for the AI
    const parts = [];
    if (context.product) parts.push(`Product: ${context.product}`);
    if (context.description) parts.push(`Description: ${context.description}`);
    if (context.hashtags.length) parts.push(`Hashtags: ${context.hashtags.join(' ')}`);
    if (context.creator) parts.push(`Creator: ${context.creator}`);
    context.summary = parts.join('\n') || context.title;

    return context;
  }

  // ═══════════════════════════════════════════════════════════════
  // GENERIC PAGE EXTRACTION (non-TikTok)
  // ═══════════════════════════════════════════════════════════════

  function extractGenericContext() {
    const context = {
      source: 'web',
      url: window.location.href,
      title: document.title || '',
      description: '',
      hashtags: [],
      creator: '',
      product: '',
    };

    // Try meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      context.description = metaDesc.getAttribute('content') || '';
    }

    // Try selected text
    const selection = window.getSelection()?.toString()?.trim();
    if (selection) {
      context.description = selection;
    }

    context.summary = context.description || context.title;
    return context;
  }

  // ═══════════════════════════════════════════════════════════════
  // MESSAGE HANDLER
  // ═══════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'extract_context') {
      const isTikTok = window.location.hostname.includes('tiktok.com');
      const context = isTikTok ? extractTikTokContext() : extractGenericContext();
      sendResponse(context);
    }
    return true;
  });
})();
