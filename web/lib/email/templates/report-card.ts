import { emailWrapper, type BaseEmailData } from './base';

export interface ReportCardEmailData extends BaseEmailData {
  userName: string;
  weekStart: string;
  weekEnd: string;
  grade: string;
  totalViews: number;
  viewsChangePct: number | null;
  engagementRate: number;
  engagementChangePct: number | null;
  videosPublished: number;
  aiSummary: string;
  wins: string[];
  improvements: string[];
  tipOfTheWeek: string;
}

function formatChange(pct: number | null): string {
  if (pct === null || pct === undefined) return '';
  const sign = pct >= 0 ? '+' : '';
  return `<span style="color: ${pct >= 0 ? '#10B981' : '#EF4444'}; font-size: 13px;">${sign}${pct.toFixed(1)}%</span>`;
}

export const reportCardEmails = [
  {
    delay: 0,
    subject: "Your Weekly Content Report Card",
    getHtml: (data: ReportCardEmailData) => emailWrapper(`
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background: #3F3F46; border-radius: 50%; width: 80px; height: 80px; line-height: 80px; font-size: 36px; font-weight: bold; color: #0D9488; margin-bottom: 8px;">${data.grade}</div>
        <h1 style="margin: 8px 0 4px 0;">Your Content Report Card</h1>
        <p style="color: #71717A; font-size: 13px; margin: 0;">${data.weekStart} — ${data.weekEnd}</p>
      </div>

      <p>${data.aiSummary}</p>

      <div style="text-align: center;">
        <div class="stat-box">
          <div class="stat-number">${data.totalViews.toLocaleString()}</div>
          <div class="stat-label">Total Views</div>
          ${data.viewsChangePct !== null ? `<div>${formatChange(data.viewsChangePct)}</div>` : ''}
        </div>
        <div class="stat-box">
          <div class="stat-number">${data.engagementRate.toFixed(1)}%</div>
          <div class="stat-label">Engagement</div>
          ${data.engagementChangePct !== null ? `<div>${formatChange(data.engagementChangePct)}</div>` : ''}
        </div>
      </div>
      <div style="text-align: center; margin-top: 8px;">
        <div class="stat-box">
          <div class="stat-number">${data.videosPublished}</div>
          <div class="stat-label">Videos Published</div>
        </div>
      </div>

      ${data.wins.length > 0 ? `
      <h2>Wins This Week</h2>
      ${data.wins.map(w => `<p style="color: #A1A1AA;">&bull; ${w}</p>`).join('')}
      ` : ''}

      ${data.improvements.length > 0 ? `
      <h2>Room for Growth</h2>
      ${data.improvements.map(i => `<p style="color: #A1A1AA;">&bull; ${i}</p>`).join('')}
      ` : ''}

      ${data.tipOfTheWeek ? `
      <div style="background: #0D9488; background: linear-gradient(135deg, #0D9488 0%, #065F56 100%); border-radius: 8px; padding: 16px; margin-top: 16px;">
        <p style="color: #FFFFFF; margin: 0; font-weight: 600; font-size: 14px;">Tip of the Week</p>
        <p style="color: #CCFBF1; margin: 8px 0 0 0; font-size: 14px;">${data.tipOfTheWeek}</p>
      </div>
      ` : ''}

      <div style="text-align: center; margin-top: 24px;">
        <a href="https://flashflowai.com/admin/report-card" class="btn">View Full Report Card</a>
      </div>
    `, `Grade: ${data.grade} — ${data.totalViews.toLocaleString()} views this week`, data.unsubscribeUrl),
  },
];
