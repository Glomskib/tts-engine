import { emailWrapper, type BaseEmailData } from './base';

export interface UpgradeNudgeEmailData extends BaseEmailData {
  userName: string;
  creditsUsed?: number;
  creditsTotal?: number;
}

export const upgradeNudgeEmails = [
  {
    delay: 0,
    subject: "You're making great progress",
    getHtml: (data: UpgradeNudgeEmailData) => emailWrapper(`
      <h1>You're off to a great start, ${data.userName}!</h1>
      <p>You've used <strong>${data.creditsUsed ?? 0} of ${data.creditsTotal ?? 5}</strong> free credits so far. That tells me you're serious about creating content that converts.</p>
      <p>Here's what Creator Pro unlocks:</p>
      <p>&bull; <strong>Unlimited scripts</strong> &mdash; no more counting credits</p>
      <p>&bull; <strong>Script of the Day</strong> &mdash; fresh content ideas delivered daily</p>
      <p>&bull; <strong>Content Planner</strong> &mdash; 5 tailored scripts in one click</p>
      <p>&bull; <strong>Advanced personas</strong> &mdash; more variety, better hooks</p>
      <p>Most creators see ROI within their first week.</p>
      <a href="https://flashflowai.com/upgrade" class="btn">See Creator Pro Plans</a>
    `, 'Unlock unlimited scripts with Creator Pro', data.unsubscribeUrl),
  },
  {
    delay: 3,
    subject: "Free vs Pro: the real difference",
    getHtml: (data: UpgradeNudgeEmailData) => emailWrapper(`
      <h1>What you're missing on the free tier</h1>
      <p>Hey ${data.userName},</p>
      <p>Here's a quick comparison:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="border-bottom: 1px solid #3F3F46;">
          <td style="padding: 12px 8px; color: #A1A1AA; font-size: 14px;">Feature</td>
          <td style="padding: 12px 8px; color: #A1A1AA; font-size: 14px; text-align: center;">Free</td>
          <td style="padding: 12px 8px; color: #0D9488; font-size: 14px; text-align: center;">Creator Pro</td>
        </tr>
        <tr style="border-bottom: 1px solid #3F3F46;">
          <td style="padding: 12px 8px; color: #E4E4E7; font-size: 14px;">Scripts per month</td>
          <td style="padding: 12px 8px; color: #A1A1AA; font-size: 14px; text-align: center;">5</td>
          <td style="padding: 12px 8px; color: #0D9488; font-size: 14px; text-align: center;">Unlimited</td>
        </tr>
        <tr style="border-bottom: 1px solid #3F3F46;">
          <td style="padding: 12px 8px; color: #E4E4E7; font-size: 14px;">Personas</td>
          <td style="padding: 12px 8px; color: #A1A1AA; font-size: 14px; text-align: center;">3</td>
          <td style="padding: 12px 8px; color: #0D9488; font-size: 14px; text-align: center;">All 7+</td>
        </tr>
        <tr style="border-bottom: 1px solid #3F3F46;">
          <td style="padding: 12px 8px; color: #E4E4E7; font-size: 14px;">Content Planner</td>
          <td style="padding: 12px 8px; color: #A1A1AA; font-size: 14px; text-align: center;">&mdash;</td>
          <td style="padding: 12px 8px; color: #0D9488; font-size: 14px; text-align: center;">&#10003;</td>
        </tr>
        <tr>
          <td style="padding: 12px 8px; color: #E4E4E7; font-size: 14px;">Script of the Day</td>
          <td style="padding: 12px 8px; color: #A1A1AA; font-size: 14px; text-align: center;">&mdash;</td>
          <td style="padding: 12px 8px; color: #0D9488; font-size: 14px; text-align: center;">&#10003;</td>
        </tr>
      </table>
      <p>For <strong>$29/month</strong>, you get unlimited creative firepower.</p>
      <a href="https://flashflowai.com/upgrade" class="btn">Upgrade to Creator Pro</a>
    `, 'See what Creator Pro unlocks for your content', data.unsubscribeUrl),
  },
  {
    delay: 7,
    subject: "Last chance: your free trial ends soon",
    getHtml: (data: UpgradeNudgeEmailData) => emailWrapper(`
      <h1>Don't lose your momentum</h1>
      <p>Hey ${data.userName},</p>
      <p>You've been using FlashFlow for a week now. The creators who stick with it see the best results &mdash; and the ones on Pro see them fastest.</p>
      <p>Here's the truth: <strong>consistency beats talent on TikTok Shop.</strong> Pro gives you the tools to stay consistent without burning out.</p>
      <p>Your free credits won't last forever. Upgrade now and never worry about running out of content ideas again.</p>
      <a href="https://flashflowai.com/upgrade" class="btn">Upgrade Now &mdash; $29/mo</a>
      <p style="font-size: 13px; color: #71717A;">Cancel anytime. No contracts. Start with a 7-day money-back guarantee.</p>
    `, 'Upgrade before your free credits run out', data.unsubscribeUrl),
  },
];
