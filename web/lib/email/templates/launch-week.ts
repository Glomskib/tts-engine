import { emailWrapper, type BaseEmailData } from './base';

export interface LaunchWeekEmailData extends BaseEmailData {
  userName: string;
  promoCode?: string;
  deadlineDate?: string;
}

const PROMO_CODE = 'LAUNCHWEEK';
const UPGRADE_URL = 'https://flashflowai.com/pricing';

export const launchWeekEmails = [
  // Day 0 — Launch Announcement
  {
    delay: 0,
    subject: "FlashFlow Launch Week: 20% off starts NOW",
    getHtml: (data: LaunchWeekEmailData) => emailWrapper(`
      <h1>Launch Week is here, ${data.userName}.</h1>
      <p>For the next 7 days, you can lock in <strong>20% off your first 3 months</strong> of any FlashFlow plan.</p>
      <p>That's Creator Pro at <strong>$23.20/mo instead of $29</strong> — unlimited scripts, Winners Bank, Content Planner, all personas, analytics, and more.</p>
      <p>Why now? Because we just shipped a wave of upgrades:</p>
      <p>&bull; <strong>Script of the Day</strong> — fresh content ideas delivered daily<br/>
      &bull; <strong>Content Planner</strong> — 5 tailored scripts from one product URL<br/>
      &bull; <strong>Winners Bank</strong> — save & analyze your top-performing scripts<br/>
      &bull; <strong>7+ AI personas</strong> — match any brand voice instantly</p>
      <p>Use code <strong style="color: #0D9488; font-size: 18px;">${data.promoCode || PROMO_CODE}</strong> at checkout.</p>
      <a href="${UPGRADE_URL}" class="btn">Claim 20% Off Now</a>
      <p style="font-size: 13px; color: #71717A;">Offer ends ${data.deadlineDate || 'Sunday, March 2nd'}. Cancel anytime.</p>
    `, 'FlashFlow Launch Week — 20% off your first 3 months', data.unsubscribeUrl),
  },

  // Day 1 — Social Proof + Pain Point
  {
    delay: 1,
    subject: "How TikTok sellers are posting 3x more content",
    getHtml: (data: LaunchWeekEmailData) => emailWrapper(`
      <h1>The #1 reason TikTok shops fail</h1>
      <p>Hey ${data.userName},</p>
      <p>It's not bad products. It's not bad hooks. It's <strong>not enough content.</strong></p>
      <p>The algorithm rewards volume. Sellers who post 2-3x per day consistently outsell everyone else — but writing that many scripts by hand is brutal.</p>
      <p>That's exactly why we built FlashFlow. Here's what it looks like in practice:</p>
      <div style="background: #3F3F46; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; color: #0D9488; font-weight: 600;">Before FlashFlow</p>
        <p style="margin: 4px 0 12px; color: #A1A1AA;">2 hours staring at a blank doc → 1 mediocre script</p>
        <p style="margin: 0; color: #0D9488; font-weight: 600;">After FlashFlow</p>
        <p style="margin: 4px 0 0; color: #A1A1AA;">2 minutes → a scroll-stopping script with hook, body, and CTA</p>
      </div>
      <p>This week only: <strong>20% off your first 3 months</strong> with code <strong style="color: #0D9488;">${data.promoCode || PROMO_CODE}</strong>.</p>
      <a href="${UPGRADE_URL}" class="btn">Start Creating More Content</a>
    `, 'The real reason TikTok shops struggle with content', data.unsubscribeUrl),
  },

  // Day 3 — Feature Deep Dive + Comparison
  {
    delay: 3,
    subject: "Free vs Pro: here's what you're leaving on the table",
    getHtml: (data: LaunchWeekEmailData) => emailWrapper(`
      <h1>You've seen what Free can do. Here's Pro.</h1>
      <p>Hey ${data.userName},</p>
      <p>You've used FlashFlow's free tier — so you already know it writes scripts that actually sound human. But here's what you're missing:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="border-bottom: 2px solid #3F3F46;">
          <td style="padding: 12px 8px; color: #71717A; font-size: 13px; text-transform: uppercase;">Feature</td>
          <td style="padding: 12px 8px; color: #71717A; font-size: 13px; text-align: center; text-transform: uppercase;">Free</td>
          <td style="padding: 12px 8px; color: #0D9488; font-size: 13px; text-align: center; text-transform: uppercase;">Creator Pro</td>
        </tr>
        <tr style="border-bottom: 1px solid #3F3F46;">
          <td style="padding: 12px 8px; color: #E4E4E7;">Scripts per month</td>
          <td style="padding: 12px 8px; color: #A1A1AA; text-align: center;">5</td>
          <td style="padding: 12px 8px; color: #0D9488; text-align: center; font-weight: 600;">Unlimited</td>
        </tr>
        <tr style="border-bottom: 1px solid #3F3F46;">
          <td style="padding: 12px 8px; color: #E4E4E7;">AI Personas</td>
          <td style="padding: 12px 8px; color: #A1A1AA; text-align: center;">3 basic</td>
          <td style="padding: 12px 8px; color: #0D9488; text-align: center; font-weight: 600;">7+ including custom</td>
        </tr>
        <tr style="border-bottom: 1px solid #3F3F46;">
          <td style="padding: 12px 8px; color: #E4E4E7;">Content Planner</td>
          <td style="padding: 12px 8px; color: #A1A1AA; text-align: center;">—</td>
          <td style="padding: 12px 8px; color: #0D9488; text-align: center;">&#10003;</td>
        </tr>
        <tr style="border-bottom: 1px solid #3F3F46;">
          <td style="padding: 12px 8px; color: #E4E4E7;">Winners Bank</td>
          <td style="padding: 12px 8px; color: #A1A1AA; text-align: center;">—</td>
          <td style="padding: 12px 8px; color: #0D9488; text-align: center;">&#10003;</td>
        </tr>
        <tr style="border-bottom: 1px solid #3F3F46;">
          <td style="padding: 12px 8px; color: #E4E4E7;">Script of the Day</td>
          <td style="padding: 12px 8px; color: #A1A1AA; text-align: center;">—</td>
          <td style="padding: 12px 8px; color: #0D9488; text-align: center;">&#10003;</td>
        </tr>
        <tr>
          <td style="padding: 12px 8px; color: #E4E4E7;">Analytics</td>
          <td style="padding: 12px 8px; color: #A1A1AA; text-align: center;">—</td>
          <td style="padding: 12px 8px; color: #0D9488; text-align: center;">&#10003;</td>
        </tr>
      </table>
      <p>With Launch Week pricing, Creator Pro is just <strong>$23.20/mo</strong> for your first 3 months.</p>
      <p>Code: <strong style="color: #0D9488; font-size: 18px;">${data.promoCode || PROMO_CODE}</strong></p>
      <a href="${UPGRADE_URL}" class="btn">Upgrade to Creator Pro — 20% Off</a>
      <p style="font-size: 13px; color: #71717A;">4 days left. Cancel anytime.</p>
    `, 'See exactly what you unlock with Creator Pro', data.unsubscribeUrl),
  },

  // Day 5 — Urgency (48 hours left)
  {
    delay: 5,
    subject: "48 hours left: your Launch Week discount expires soon",
    getHtml: (data: LaunchWeekEmailData) => emailWrapper(`
      <h1>48 hours, ${data.userName}.</h1>
      <p>That's how long you have left to lock in <strong>20% off your first 3 months</strong> of FlashFlow Creator Pro.</p>
      <div style="background: #3F3F46; border-radius: 8px; padding: 20px; margin: 16px 0; text-align: center;">
        <p style="margin: 0 0 8px; color: #A1A1AA; font-size: 14px;">Launch Week Price</p>
        <p style="margin: 0; font-size: 32px; font-weight: bold; color: #0D9488;">$23.20<span style="font-size: 16px; color: #71717A;">/mo</span></p>
        <p style="margin: 4px 0 0; color: #71717A; font-size: 14px;"><s>$29/mo</s> — save $17.40 over 3 months</p>
      </div>
      <p>After Sunday, it goes back to full price. No exceptions.</p>
      <p>Here's what one more week on the free tier costs you:</p>
      <p>&bull; 5 scripts instead of unlimited<br/>
      &bull; No Content Planner (that's 5 scripts per click you're missing)<br/>
      &bull; No Winners Bank to learn from what's actually working<br/>
      &bull; No Script of the Day to keep your content fresh</p>
      <p>Every day without Pro is content you're not posting and sales you're not making.</p>
      <p>Code: <strong style="color: #0D9488; font-size: 18px;">${data.promoCode || PROMO_CODE}</strong></p>
      <a href="${UPGRADE_URL}" class="btn">Lock In 20% Off — 48 Hours Left</a>
    `, '48 hours left to save 20% on FlashFlow Creator Pro', data.unsubscribeUrl),
  },

  // Day 6 — Final Call (last day)
  {
    delay: 6,
    subject: "Final call: Launch Week ends tonight",
    getHtml: (data: LaunchWeekEmailData) => emailWrapper(`
      <h1>This is it.</h1>
      <p>${data.userName}, Launch Week ends at midnight tonight.</p>
      <p>After that, the <strong>20% discount on your first 3 months</strong> is gone — and Creator Pro goes back to $29/mo.</p>
      <p>Quick math on what you're saving:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="border-bottom: 1px solid #3F3F46;">
          <td style="padding: 10px 8px; color: #E4E4E7;">Creator Pro (3 months, regular)</td>
          <td style="padding: 10px 8px; color: #A1A1AA; text-align: right;">$87.00</td>
        </tr>
        <tr style="border-bottom: 1px solid #3F3F46;">
          <td style="padding: 10px 8px; color: #E4E4E7;">Creator Pro (3 months, Launch Week)</td>
          <td style="padding: 10px 8px; color: #0D9488; text-align: right; font-weight: 600;">$69.60</td>
        </tr>
        <tr>
          <td style="padding: 10px 8px; color: #E4E4E7; font-weight: 600;">You save</td>
          <td style="padding: 10px 8px; color: #0D9488; text-align: right; font-weight: 600;">$17.40</td>
        </tr>
      </table>
      <p>That's less than a single freelance script. And you get <strong>unlimited scripts, every day, for 3 months.</strong></p>
      <p>Last chance. Code: <strong style="color: #0D9488; font-size: 18px;">${data.promoCode || PROMO_CODE}</strong></p>
      <a href="${UPGRADE_URL}" class="btn">Upgrade Now — Last Chance</a>
      <p style="font-size: 13px; color: #71717A;">Offer expires at 11:59 PM EST tonight. Cancel anytime. 7-day money-back guarantee.</p>
    `, 'Last chance — Launch Week ends at midnight', data.unsubscribeUrl),
  },
];
