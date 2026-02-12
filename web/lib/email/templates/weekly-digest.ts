import { emailWrapper, type BaseEmailData } from './base';

export interface WeeklyDigestEmailData extends BaseEmailData {
  userName: string;
  scriptsGenerated: number;
  creditsUsed: number;
  creditsRemaining: number;
  topPersona?: string;
  newFeatures?: string[];
}

export const weeklyDigestEmails = [
  {
    delay: 0,
    subject: "Your weekly FlashFlow recap",
    getHtml: (data: WeeklyDigestEmailData) => emailWrapper(`
      <h1>Your Week in Review</h1>
      <p>Hey ${data.userName}, here's what you accomplished this week:</p>
      <div style="text-align: center;">
        <div class="stat-box">
          <div class="stat-number">${data.scriptsGenerated}</div>
          <div class="stat-label">Scripts Generated</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${data.creditsUsed}</div>
          <div class="stat-label">Credits Used</div>
        </div>
      </div>
      <div style="text-align: center; margin-top: 8px;">
        <div class="stat-box">
          <div class="stat-number">${data.creditsRemaining}</div>
          <div class="stat-label">Credits Remaining</div>
        </div>
        ${data.topPersona ? `
        <div class="stat-box">
          <div class="stat-number" style="font-size: 18px;">${data.topPersona}</div>
          <div class="stat-label">Top Persona</div>
        </div>
        ` : ''}
      </div>
      ${data.newFeatures && data.newFeatures.length > 0 ? `
      <h2>What's New</h2>
      ${data.newFeatures.map(f => `<p>&bull; ${f}</p>`).join('')}
      ` : ''}
      <a href="https://flashflowai.com/admin/content-studio" class="btn">Generate More Scripts</a>
    `, `You generated ${data.scriptsGenerated} scripts this week`, data.unsubscribeUrl),
  },
];
