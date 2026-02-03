export interface ShowcaseVideo {
  id: string;
  tiktokUrl: string;
  videoId: string;
  title: string;
  category: string;
}

// Replace these with your actual TikTok video URLs
export const SHOWCASE_VIDEOS: ShowcaseVideo[] = [
  {
    id: '1',
    tiktokUrl: 'https://www.tiktok.com/@tiktok/video/7281842809498752298',
    videoId: '7281842809498752298',
    title: 'Product Demo',
    category: 'Product',
  },
  {
    id: '2',
    tiktokUrl: 'https://www.tiktok.com/@tiktok/video/7281842809498752298',
    videoId: '7281842809498752298',
    title: 'UGC Testimonial',
    category: 'UGC',
  },
  {
    id: '3',
    tiktokUrl: 'https://www.tiktok.com/@tiktok/video/7281842809498752298',
    videoId: '7281842809498752298',
    title: 'Educational Explainer',
    category: 'Educational',
  },
];
