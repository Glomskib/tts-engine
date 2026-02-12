import { emailWrapper, type BaseEmailData } from './base';

export interface LeadMagnetEmailData extends BaseEmailData {
  userName: string;
  downloadUrl?: string;
}

export const leadMagnetEmails = [
  {
    delay: 0,
    subject: "Your UGC Script Vault is here",
    getHtml: (data: LeadMagnetEmailData) => emailWrapper(`
      <h1>Your Script Vault is ready!</h1>
      <p>Hey ${data.userName},</p>
      <p>Here's your download:</p>
      <a href="${data.downloadUrl || 'https://flashflowai.com/free-scripts'}" class="btn">Download the UGC Script Vault</a>
      <p>Inside you'll find:</p>
      <p>&bull; 50 proven TikTok hooks organized by niche</p>
      <p>&bull; 10 complete script templates ready to film</p>
      <p>&bull; The Hook &rarr; Setup &rarr; Body &rarr; CTA formula breakdown</p>
      <p>These hooks have generated millions in TikTok Shop sales. Use them wisely.</p>
    `, '50 proven hooks + 10 script templates inside', data.unsubscribeUrl),
  },
  {
    delay: 3,
    subject: "How I generate 20 scripts in 10 minutes",
    getHtml: (data: LeadMagnetEmailData) => emailWrapper(`
      <h1>The Script Vault is just the start</h1>
      <p>Hey ${data.userName},</p>
      <p>Those 50 hooks and 10 templates? They're powerful. But here's the thing &mdash; you'll run through them in a week if you're posting daily.</p>
      <p>That's why I built FlashFlow. It generates <strong>unlimited unique scripts</strong> tailored to your specific products, using 7 different creator personas.</p>
      <p>My workflow:</p>
      <p>1. Add my products (paste a TikTok Shop link or enter manually)</p>
      <p>2. Hit "Generate" with different personas</p>
      <p>3. Pick the 3-4 best hooks</p>
      <p>4. Film them all in one batch session</p>
      <p>20 scripts. 10 minutes. Zero creative burnout.</p>
      <a href="https://flashflowai.com/login?mode=signup&ref=email-nurture" class="btn">Try FlashFlow Free &mdash; 5 Scripts On Me</a>
    `, 'The template vault is powerful. This is next level.', data.unsubscribeUrl),
  },
  {
    delay: 7,
    subject: "The biggest script mistake TikTok Shop creators make",
    getHtml: (data: LeadMagnetEmailData) => emailWrapper(`
      <h1>Your audience can tell when every video sounds the same</h1>
      <p>Hey ${data.userName},</p>
      <p>The #1 mistake I see TikTok Shop creators make: <strong>they find one script formula that works, and they use it for every single video.</strong></p>
      <p>"I was skeptical but then I tried it..." Sound familiar?</p>
      <p>Your audience notices. The algorithm notices. Engagement drops. Sales flatline.</p>
      <p>The fix isn't working harder. It's varying your approach:</p>
      <p>&bull; <strong>Skeptic Convert</strong> for health/wellness products</p>
      <p>&bull; <strong>Honest Reviewer</strong> for tech and gadgets</p>
      <p>&bull; <strong>Excited Discovery</strong> for trending items</p>
      <p>&bull; <strong>Storyteller</strong> for lifestyle products</p>
      <p>FlashFlow has 7 personas built in. Each one writes differently. Your content stays fresh without you having to reinvent the wheel.</p>
      <a href="https://flashflowai.com/login?mode=signup&ref=email-nurture" class="btn">Generate Your First Script Free</a>
    `, 'This one mistake is killing your TikTok engagement', data.unsubscribeUrl),
  },
  {
    delay: 10,
    subject: "5 free scripts, no catch",
    getHtml: (data: LeadMagnetEmailData) => emailWrapper(`
      <h1>Last thing, then I'll stop bugging you</h1>
      <p>Hey ${data.userName},</p>
      <p>I hope the Script Vault has been useful. If you've been using those hooks and templates, you've probably noticed how much easier content creation gets when you have a starting point.</p>
      <p>FlashFlow takes that concept and puts it on autopilot. Tell it your product, pick a style, and get a complete, ready-to-film script in seconds.</p>
      <p>5 scripts free. No credit card. No catch.</p>
      <a href="https://flashflowai.com/login?mode=signup&ref=email-nurture" class="btn">Try FlashFlow Free</a>
      <p style="font-size: 13px; color: #71717A;">If FlashFlow isn't for you, no hard feelings. But I think you'll be surprised.</p>
    `, '5 free AI scripts. No credit card needed.', data.unsubscribeUrl),
  },
];
