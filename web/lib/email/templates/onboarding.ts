import { emailWrapper, type BaseEmailData } from './base';

export interface OnboardingEmailData extends BaseEmailData {
  userName: string;
  creditsUsed?: number;
  creditsTotal?: number;
}

export const onboardingEmails = [
  {
    delay: 0,
    subject: "Your first script is waiting",
    getHtml: (data: OnboardingEmailData) => emailWrapper(`
      <h1>Welcome to FlashFlow, ${data.userName}!</h1>
      <p>You're 30 seconds away from your first AI-generated TikTok script.</p>
      <p>Here's all you need to do:</p>
      <p>1. Pick a product (or add one)</p>
      <p>2. Choose a creator persona</p>
      <p>3. Hit generate</p>
      <p>That's it. Your script is ready to film.</p>
      <a href="https://flashflowai.com/admin/content-studio" class="btn">Generate Your First Script</a>
      <p>Most creators generate their first script in under 2 minutes.</p>
    `, 'Your first AI script is 30 seconds away', data.unsubscribeUrl),
  },
  {
    delay: 2,
    subject: "The script formula that gets 10x more views",
    getHtml: (data: OnboardingEmailData) => emailWrapper(`
      <h1>The formula behind viral TikTok scripts</h1>
      <p>Hey ${data.userName},</p>
      <p>Every viral TikTok Shop video follows the same structure:</p>
      <p><strong>Hook</strong> &mdash; Grab attention in 1.5 seconds. "I can't believe this $12 product replaced my $200 one."</p>
      <p><strong>Setup</strong> &mdash; Establish the problem. "I've tried everything for my back pain..."</p>
      <p><strong>Body</strong> &mdash; Show the solution. Demo the product, share your experience.</p>
      <p><strong>CTA</strong> &mdash; Drive the sale. "Link in bio. Trust me, your future self will thank you."</p>
      <p>FlashFlow builds this structure into every script automatically. You just pick the persona and product &mdash; the formula is baked in.</p>
      <a href="https://flashflowai.com/admin/content-studio" class="btn">Try It Now</a>
    `, 'Hook, Setup, Body, CTA: the formula that works', data.unsubscribeUrl),
  },
  {
    delay: 4,
    subject: "How creators are using FlashFlow",
    getHtml: (data: OnboardingEmailData) => emailWrapper(`
      <h1>Real creators, real results</h1>
      <p>Hey ${data.userName},</p>
      <p>Here's what FlashFlow users are doing:</p>
      <p><strong>Batch scripting:</strong> Generating a full week of scripts in one sitting (15 minutes instead of 3 hours)</p>
      <p><strong>Persona rotation:</strong> Using the Skeptic Convert for health products, Honest Reviewer for tech, and Storyteller for lifestyle &mdash; so every video sounds different</p>
      <p><strong>Content Planner:</strong> Getting daily bundles of 5 scripts tailored to their specific products, ready to film</p>
      <p>The creators seeing the best results aren't just generating one script. They're generating 5-10, picking the best hooks, and filming those.</p>
      <a href="https://flashflowai.com/admin/content-package" class="btn">Try the Content Planner</a>
    `, 'How top creators batch-produce a week of content in 15 minutes', data.unsubscribeUrl),
  },
  {
    delay: 6,
    subject: "You've got scripts waiting",
    getHtml: (data: OnboardingEmailData) => emailWrapper(`
      <h1>Your FlashFlow progress</h1>
      <p>Hey ${data.userName},</p>
      <div style="text-align: center;">
        <div class="stat-box">
          <div class="stat-number">${data.creditsUsed ?? 0}</div>
          <div class="stat-label">Scripts Generated</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${(data.creditsTotal ?? 5) - (data.creditsUsed ?? 0)}</div>
          <div class="stat-label">Credits Remaining</div>
        </div>
      </div>
      <p>Each script you generate gets better as FlashFlow learns your products' selling angles.</p>
      <p>Pro users get <strong>unlimited scripts</strong>, <strong>Script of the Day</strong>, and the <strong>Content Planner</strong> &mdash; all for less than the cost of one freelance script.</p>
      <a href="https://flashflowai.com/upgrade" class="btn">See Pro Features</a>
    `, "Here's what you've created so far", data.unsubscribeUrl),
  },
  {
    delay: 7,
    subject: "The ROI math (it's not even close)",
    getHtml: (data: OnboardingEmailData) => emailWrapper(`
      <h1>Let's talk numbers</h1>
      <p>Hey ${data.userName},</p>
      <p>One viral TikTok Shop video can generate <strong>$500 - $5,000</strong> in affiliate commissions.</p>
      <p>FlashFlow Pro costs <strong>$29/month</strong>.</p>
      <p>That means you need <strong>one script to hit</strong> and FlashFlow has paid for itself 17x over.</p>
      <p>But it's not just about one viral video. It's about consistency. FlashFlow gives you fresh, unique scripts every day so you're never staring at your phone trying to figure out what to say.</p>
      <p>The creators who win on TikTok Shop aren't the most talented. They're the most consistent.</p>
      <a href="https://flashflowai.com/upgrade" class="btn">Upgrade to Pro &mdash; $29/mo</a>
      <p style="font-size: 13px; color: #71717A;">Cancel anytime. No contracts. No commitment.</p>
    `, 'One viral video pays for 17 months of FlashFlow', data.unsubscribeUrl),
  },
];
