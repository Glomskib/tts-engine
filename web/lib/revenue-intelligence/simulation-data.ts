/**
 * Revenue Intelligence – Simulation Data
 *
 * Provides realistic mock data for testing the full ingestion pipeline
 * without hitting TikTok. Used when IngestionConfig.simulation_mode = true.
 */

import type { ScrapedVideo, ScrapedComment, VideoScrapeResult } from './types';

// ── Mock Videos ────────────────────────────────────────────────

const MOCK_VIDEOS: ScrapedVideo[] = [
  {
    platform_video_id: 'sim_7340001001',
    caption: 'This $12 serum literally changed my skin in 2 weeks. Not even exaggerating. #skincare #glowup',
    video_url: 'https://www.tiktok.com/@testcreator/video/sim_7340001001',
    comment_count: 847,
  },
  {
    platform_video_id: 'sim_7340001002',
    caption: 'POV: you found the gym bag that actually fits everything. Link in bio! #fitness #gymessentials',
    video_url: 'https://www.tiktok.com/@testcreator/video/sim_7340001002',
    comment_count: 432,
  },
  {
    platform_video_id: 'sim_7340001003',
    caption: 'Honest review: I tried every protein powder so you don\'t have to. Results shocked me.',
    video_url: 'https://www.tiktok.com/@testcreator/video/sim_7340001003',
    comment_count: 1203,
  },
  {
    platform_video_id: 'sim_7340001004',
    caption: 'The kitchen gadget that went viral is actually worth it? Full test inside #kitchen #cooking',
    video_url: 'https://www.tiktok.com/@testcreator/video/sim_7340001004',
    comment_count: 289,
  },
  {
    platform_video_id: 'sim_7340001005',
    caption: 'Replying to comments about shipping times. Let me address this.',
    video_url: 'https://www.tiktok.com/@testcreator/video/sim_7340001005',
    comment_count: 156,
  },
];

// ── Mock Comments (mixed categories) ───────────────────────────

const COMMENT_POOLS: Record<string, Array<Omit<ScrapedComment, 'platform_comment_id' | 'raw_json'>>> = {
  sim_7340001001: [
    { comment_text: 'Where can I buy this?? I need it NOW', commenter_username: 'skincarejunkie22', commenter_display_name: 'Skincare Addict', like_count: 34, reply_count: 3, is_reply: false, parent_comment_id: null, posted_at: ago(2, 'h') },
    { comment_text: 'Drop the link!! 😍', commenter_username: 'beautybabe99', commenter_display_name: 'Beauty Babe', like_count: 21, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(3, 'h') },
    { comment_text: 'Is this safe for sensitive skin? I break out from everything', commenter_username: 'sensitivesally', commenter_display_name: 'Sally', like_count: 8, reply_count: 1, is_reply: false, parent_comment_id: null, posted_at: ago(5, 'h') },
    { comment_text: 'This is an ad lol you got paid to say this', commenter_username: 'truthteller420', commenter_display_name: null, like_count: 5, reply_count: 2, is_reply: false, parent_comment_id: null, posted_at: ago(6, 'h') },
    { comment_text: 'ORDERED. Can\'t wait to try it! How long does shipping take?', commenter_username: 'impulseshopperx', commenter_display_name: 'Impulse Buyer', like_count: 12, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(4, 'h') },
    { comment_text: 'Your skin looks amazing! Not sure if it\'s the serum or just good lighting tho 😂', commenter_username: 'honestviewer', commenter_display_name: 'Honest Viewer', like_count: 67, reply_count: 5, is_reply: false, parent_comment_id: null, posted_at: ago(1, 'h') },
    { comment_text: 'I bought this 3 months ago and my skin has never been better ✨', commenter_username: 'verifiedbuyer', commenter_display_name: 'Verified', like_count: 89, reply_count: 4, is_reply: false, parent_comment_id: null, posted_at: ago(8, 'h') },
    { comment_text: 'How much is it?', commenter_username: 'curiouscat', commenter_display_name: 'Curious', like_count: 15, reply_count: 1, is_reply: false, parent_comment_id: null, posted_at: ago(30, 'm') },
    { comment_text: 'first', commenter_username: 'speedycommenter', commenter_display_name: null, like_count: 0, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(12, 'h') },
    { comment_text: 'Do they ship internationally? I\'m in Canada 🇨🇦', commenter_username: 'canadian_shopper', commenter_display_name: 'Maple Leaf', like_count: 7, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(2, 'h') },
  ],
  sim_7340001002: [
    { comment_text: 'What\'s the price? This looks perfect for my gym setup', commenter_username: 'gymrat2024', commenter_display_name: 'Gym Rat', like_count: 18, reply_count: 2, is_reply: false, parent_comment_id: null, posted_at: ago(1, 'd') },
    { comment_text: 'I bought this last month and the zipper broke after 2 weeks. Trash quality.', commenter_username: 'disappointedjoe', commenter_display_name: 'Joe', like_count: 45, reply_count: 8, is_reply: false, parent_comment_id: null, posted_at: ago(3, 'd') },
    { comment_text: 'Does it have a separate shoe compartment?', commenter_username: 'fitnessfanatic', commenter_display_name: 'Fitness Fan', like_count: 22, reply_count: 1, is_reply: false, parent_comment_id: null, posted_at: ago(2, 'd') },
    { comment_text: 'This or the Nike one? Which is better?', commenter_username: 'indecisive_buyer', commenter_display_name: null, like_count: 31, reply_count: 3, is_reply: false, parent_comment_id: null, posted_at: ago(1, 'd') },
    { comment_text: 'Just ordered! 💪 Can\'t wait', commenter_username: 'gains_daily', commenter_display_name: 'Daily Gains', like_count: 5, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(6, 'h') },
    { comment_text: 'Literally buying this rn', commenter_username: 'shutupandtakemymoney', commenter_display_name: 'Take My Money', like_count: 11, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(4, 'h') },
  ],
  sim_7340001003: [
    { comment_text: 'I\'ve been using the chocolate one for 6 months. Best I\'ve ever had. Where did you get the vanilla?', commenter_username: 'proteinlover', commenter_display_name: 'Protein Enthusiast', like_count: 42, reply_count: 5, is_reply: false, parent_comment_id: null, posted_at: ago(12, 'h') },
    { comment_text: 'My order arrived damaged. Who do I contact for a replacement?', commenter_username: 'angrycustomer1', commenter_display_name: 'Frustrated', like_count: 3, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(2, 'h') },
    { comment_text: 'Is this keto-friendly?', commenter_username: 'ketolife', commenter_display_name: 'Keto Life', like_count: 19, reply_count: 2, is_reply: false, parent_comment_id: null, posted_at: ago(8, 'h') },
    { comment_text: 'Anyone else get stomach issues from this brand?', commenter_username: 'stomach_issues', commenter_display_name: null, like_count: 14, reply_count: 6, is_reply: false, parent_comment_id: null, posted_at: ago(1, 'd') },
    { comment_text: 'Code "PROTEIN20" still works? About to order 🛒', commenter_username: 'dealfinder', commenter_display_name: 'Deal Finder', like_count: 28, reply_count: 1, is_reply: false, parent_comment_id: null, posted_at: ago(3, 'h') },
    { comment_text: 'Legend 🐐 Best reviews on TikTok fr', commenter_username: 'loyalfollower', commenter_display_name: 'Loyal Fan', like_count: 55, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(6, 'h') },
    { comment_text: 'Stop promoting garbage products for money', commenter_username: 'negativenancy', commenter_display_name: null, like_count: 2, reply_count: 1, is_reply: false, parent_comment_id: null, posted_at: ago(5, 'h') },
    { comment_text: 'I want to buy the bundle but it says out of stock??', commenter_username: 'wannabuy', commenter_display_name: 'Want To Buy', like_count: 9, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(1, 'h') },
  ],
  sim_7340001004: [
    { comment_text: 'Bought it! Works exactly as shown. 10/10', commenter_username: 'happycook', commenter_display_name: 'Happy Cook', like_count: 77, reply_count: 3, is_reply: false, parent_comment_id: null, posted_at: ago(2, 'd') },
    { comment_text: 'How long did shipping take?', commenter_username: 'shipping_question', commenter_display_name: null, like_count: 4, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(1, 'd') },
    { comment_text: 'Mine still hasn\'t shipped after 2 weeks. This is ridiculous.', commenter_username: 'waiting_forever', commenter_display_name: 'Still Waiting', like_count: 33, reply_count: 4, is_reply: false, parent_comment_id: null, posted_at: ago(3, 'd') },
    { comment_text: 'Where is the link??', commenter_username: 'needlink', commenter_display_name: null, like_count: 8, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(5, 'h') },
  ],
  sim_7340001005: [
    { comment_text: 'Finally someone addresses shipping! My order took 3 weeks 😤', commenter_username: 'impatient_buyer', commenter_display_name: 'Impatient', like_count: 22, reply_count: 2, is_reply: false, parent_comment_id: null, posted_at: ago(6, 'h') },
    { comment_text: 'Thank you for being transparent about this ❤️', commenter_username: 'supportive_fan', commenter_display_name: 'Supportive', like_count: 41, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(3, 'h') },
    { comment_text: 'Still waiting on order #45923. Can someone help?', commenter_username: 'order_45923', commenter_display_name: 'Need Help', like_count: 6, reply_count: 0, is_reply: false, parent_comment_id: null, posted_at: ago(1, 'h') },
  ],
};

// ── Generate simulation results ────────────────────────────────

export function generateSimulationData(
  maxVideos: number,
  maxCommentsPerVideo: number,
): VideoScrapeResult[] {
  const videos = MOCK_VIDEOS.slice(0, maxVideos);

  return videos.map((video) => {
    const pool = COMMENT_POOLS[video.platform_video_id] ?? [];
    const comments: ScrapedComment[] = pool
      .slice(0, maxCommentsPerVideo)
      .map((c, i) => ({
        ...c,
        platform_comment_id: `sim_${video.platform_video_id}_comment_${i}`,
        raw_json: { simulation: true, index: i },
      }));

    return { video, comments, errors: [] };
  });
}

// ── Helpers ────────────────────────────────────────────────────

function ago(n: number, unit: 'h' | 'm' | 'd'): string {
  const ms: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return new Date(Date.now() - n * ms[unit]).toISOString();
}
