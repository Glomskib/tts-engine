import { emailWrapper } from './base';

export interface WinbackEmailData {
  userName: string;
  discountCode?: string;
}

export const winbackEmails = [
  {
    delay: 7,
    subject: "We shipped 3 new features since you left",
    getHtml: (data: WinbackEmailData) => emailWrapper(`
      <h1>A lot has changed, ${data.userName}</h1>
      <p>Since you've been gone, we've added:</p>
      <p><strong>AI Product Enrichment</strong> &mdash; Import from TikTok Shop and FlashFlow auto-extracts selling points, objections, and viral hook ideas</p>
      <p><strong>Content Packages</strong> &mdash; Get 5 daily scripts tailored to your products, ready to film</p>
      <p><strong>7 Creator Personas</strong> &mdash; Every script sounds different. No more cookie-cutter content.</p>
      <p>Your account and all your products are still here. One click to pick up where you left off.</p>
      <a href="https://flashflowai.com/admin/content-studio" class="btn">See What's New</a>
    `, '3 major updates you missed'),
  },
  {
    delay: 14,
    subject: "Your scripts are still here",
    getHtml: (data: WinbackEmailData) => emailWrapper(`
      <h1>Everything's where you left it</h1>
      <p>Hey ${data.userName},</p>
      <p>Your products, your scripts, your content history &mdash; it's all still saved in FlashFlow.</p>
      <p>One click and you're back to generating.</p>
      <a href="https://flashflowai.com/admin/content-studio" class="btn">Pick Up Where You Left Off</a>
    `, 'Your FlashFlow account is waiting'),
  },
  {
    delay: 30,
    subject: "50% off, come back and see what's changed",
    getHtml: (data: WinbackEmailData) => emailWrapper(`
      <h1>One last thing</h1>
      <p>Hey ${data.userName},</p>
      <p>I'd love to have you back. Use code <strong>${data.discountCode || 'COMEBACK50'}</strong> for 50% off your next month.</p>
      <a href="https://flashflowai.com/upgrade?promo=${data.discountCode || 'COMEBACK50'}" class="btn">Reactivate at 50% Off</a>
      <p style="font-size: 13px; color: #71717A;">This code expires in 7 days.</p>
    `, '50% off your next month of FlashFlow'),
  },
];
