/**
 * Weekly Email Digest Template
 *
 * This module provides HTML email templates for weekly summary digests.
 * Templates are designed for sending to users and admins with activity summaries.
 *
 * Note: This is the template only. Integration with a scheduler (e.g., cron job)
 * is not included and should be implemented separately.
 */

export interface WeeklyDigestData {
  // Recipient info
  recipientName: string;
  recipientEmail: string;

  // Period info
  weekStart: string; // ISO date
  weekEnd: string; // ISO date

  // Script metrics
  scriptsCreated: number;
  scriptsCreatedChange: number; // percentage change from previous week
  topScriptTypes: { type: string; count: number }[];

  // Video metrics
  videosCompleted: number;
  videosCompletedChange: number;
  videosInProgress: number;
  averageTurnaroundHours: number;

  // Credit usage
  creditsUsed: number;
  creditsUsedChange: number;
  creditsRemaining: number;

  // Top performers (admin only)
  topPerformers?: { name: string; completed: number }[];

  // Highlights
  highlights?: string[];

  // Action items
  actionItems?: { text: string; link?: string }[];
}

/**
 * Format hours into a readable duration string
 */
function formatDuration(hours: number): string {
  if (hours < 24) return `${Math.round(hours)} hours`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  if (remainingHours === 0) return `${days} day${days !== 1 ? 's' : ''}`;
  return `${days}d ${remainingHours}h`;
}

/**
 * Format a change percentage with arrow indicator
 */
function formatChange(change: number): string {
  if (change === 0) return '→ No change';
  const arrow = change > 0 ? '↑' : '↓';
  const color = change > 0 ? '#22c55e' : '#ef4444';
  return `<span style="color: ${color}">${arrow} ${Math.abs(change)}%</span>`;
}

/**
 * Generate the weekly digest HTML email template
 */
export function generateWeeklyDigestHtml(data: WeeklyDigestData): string {
  const weekRange = `${formatDate(data.weekStart)} - ${formatDate(data.weekEnd)}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Digest - FlashFlow AI</title>
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse: collapse; }
    .fallback-font { font-family: Arial, sans-serif; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; line-height: 1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #14b8a6 0%, #8b5cf6 100%); padding: 32px 40px; border-radius: 12px 12px 0 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #ffffff;">
                      Weekly Digest
                    </h1>
                    <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.9);">
                      ${weekRange}
                    </p>
                  </td>
                  <td align="right">
                    <span style="font-size: 28px; font-weight: bold; color: #ffffff;">FlashFlow</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="background-color: #ffffff; padding: 32px 40px;">

              <!-- Greeting -->
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #27272a;">
                Hi ${data.recipientName},
              </p>
              <p style="margin: 0 0 32px 0; font-size: 16px; color: #52525b;">
                Here's your weekly summary of activity and performance.
              </p>

              <!-- Stats Cards -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
                <tr>
                  <!-- Scripts Created -->
                  <td width="50%" style="padding-right: 10px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0fdf4; border-radius: 8px; padding: 20px;">
                      <tr>
                        <td style="padding: 16px;">
                          <p style="margin: 0 0 4px 0; font-size: 12px; color: #166534; text-transform: uppercase; font-weight: 600;">
                            Scripts Created
                          </p>
                          <p style="margin: 0; font-size: 32px; font-weight: bold; color: #15803d;">
                            ${data.scriptsCreated}
                          </p>
                          <p style="margin: 8px 0 0 0; font-size: 12px; color: #52525b;">
                            ${formatChange(data.scriptsCreatedChange)} from last week
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Videos Completed -->
                  <td width="50%" style="padding-left: 10px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #eff6ff; border-radius: 8px; padding: 20px;">
                      <tr>
                        <td style="padding: 16px;">
                          <p style="margin: 0 0 4px 0; font-size: 12px; color: #1e40af; text-transform: uppercase; font-weight: 600;">
                            Videos Completed
                          </p>
                          <p style="margin: 0; font-size: 32px; font-weight: bold; color: #1d4ed8;">
                            ${data.videosCompleted}
                          </p>
                          <p style="margin: 8px 0 0 0; font-size: 12px; color: #52525b;">
                            ${formatChange(data.videosCompletedChange)} from last week
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="height: 20px;"></td>
                </tr>
                <tr>
                  <!-- Credits Used -->
                  <td width="50%" style="padding-right: 10px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fefce8; border-radius: 8px; padding: 20px;">
                      <tr>
                        <td style="padding: 16px;">
                          <p style="margin: 0 0 4px 0; font-size: 12px; color: #854d0e; text-transform: uppercase; font-weight: 600;">
                            Credits Used
                          </p>
                          <p style="margin: 0; font-size: 32px; font-weight: bold; color: #a16207;">
                            ${data.creditsUsed}
                          </p>
                          <p style="margin: 8px 0 0 0; font-size: 12px; color: #52525b;">
                            ${data.creditsRemaining} remaining
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Avg Turnaround -->
                  <td width="50%" style="padding-left: 10px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #faf5ff; border-radius: 8px; padding: 20px;">
                      <tr>
                        <td style="padding: 16px;">
                          <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b21a8; text-transform: uppercase; font-weight: 600;">
                            Avg Turnaround
                          </p>
                          <p style="margin: 0; font-size: 32px; font-weight: bold; color: #7c3aed;">
                            ${formatDuration(data.averageTurnaroundHours)}
                          </p>
                          <p style="margin: 8px 0 0 0; font-size: 12px; color: #52525b;">
                            ${data.videosInProgress} in progress
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${data.topScriptTypes.length > 0 ? `
              <!-- Content Types -->
              <div style="margin-bottom: 32px;">
                <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #27272a;">
                  Top Content Types
                </h2>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  ${data.topScriptTypes.slice(0, 5).map(t => `
                  <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7;">
                      <span style="font-size: 14px; color: #27272a; text-transform: capitalize;">${t.type.replace(/_/g, ' ')}</span>
                    </td>
                    <td align="right" style="padding: 8px 0; border-bottom: 1px solid #e4e4e7;">
                      <span style="font-size: 14px; font-weight: 600; color: #14b8a6;">${t.count}</span>
                    </td>
                  </tr>
                  `).join('')}
                </table>
              </div>
              ` : ''}

              ${data.topPerformers && data.topPerformers.length > 0 ? `
              <!-- Top Performers (Admin) -->
              <div style="margin-bottom: 32px;">
                <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #27272a;">
                  Top Performers
                </h2>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  ${data.topPerformers.slice(0, 5).map((p, i) => `
                  <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7;">
                      <span style="display: inline-block; width: 20px; height: 20px; background-color: ${i === 0 ? '#fef3c7' : i === 1 ? '#f3f4f6' : i === 2 ? '#fef3c7' : '#f4f4f5'}; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; color: #52525b; margin-right: 8px;">${i + 1}</span>
                      <span style="font-size: 14px; color: #27272a;">${p.name}</span>
                    </td>
                    <td align="right" style="padding: 8px 0; border-bottom: 1px solid #e4e4e7;">
                      <span style="font-size: 14px; font-weight: 600; color: #8b5cf6;">${p.completed} completed</span>
                    </td>
                  </tr>
                  `).join('')}
                </table>
              </div>
              ` : ''}

              ${data.highlights && data.highlights.length > 0 ? `
              <!-- Highlights -->
              <div style="margin-bottom: 32px; padding: 20px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
                <h2 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #166534;">
                  This Week's Highlights
                </h2>
                <ul style="margin: 0; padding-left: 20px; color: #15803d;">
                  ${data.highlights.map(h => `<li style="margin-bottom: 4px; font-size: 14px;">${h}</li>`).join('')}
                </ul>
              </div>
              ` : ''}

              ${data.actionItems && data.actionItems.length > 0 ? `
              <!-- Action Items -->
              <div style="margin-bottom: 32px;">
                <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #27272a;">
                  Action Items
                </h2>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  ${data.actionItems.map(item => `
                  <tr>
                    <td style="padding: 12px 16px; background-color: #f4f4f5; border-radius: 6px; margin-bottom: 8px;">
                      <span style="font-size: 14px; color: #27272a;">${item.text}</span>
                      ${item.link ? `<a href="${item.link}" style="display: block; margin-top: 4px; font-size: 12px; color: #14b8a6;">View Details →</a>` : ''}
                    </td>
                  </tr>
                  <tr><td style="height: 8px;"></td></tr>
                  `).join('')}
                </table>
              </div>
              ` : ''}

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com'}/admin/analytics"
                       style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #14b8a6 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 8px;">
                      View Full Analytics
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #27272a; padding: 24px 40px; border-radius: 0 0 12px 12px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #ffffff;">FlashFlow AI</p>
                    <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                      You're receiving this because you're subscribed to weekly digests.
                    </p>
                  </td>
                  <td align="right">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com'}/settings/notifications"
                       style="font-size: 12px; color: #14b8a6; text-decoration: none;">
                      Manage preferences
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Format a date string for display
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Generate plain text version of the weekly digest
 */
export function generateWeeklyDigestText(data: WeeklyDigestData): string {
  const weekRange = `${formatDate(data.weekStart)} - ${formatDate(data.weekEnd)}`;

  let text = `
WEEKLY DIGEST - FLASHFLOW AI
${weekRange}
${'='.repeat(40)}

Hi ${data.recipientName},

Here's your weekly summary:

METRICS
--------
Scripts Created: ${data.scriptsCreated} (${data.scriptsCreatedChange >= 0 ? '+' : ''}${data.scriptsCreatedChange}% from last week)
Videos Completed: ${data.videosCompleted} (${data.videosCompletedChange >= 0 ? '+' : ''}${data.videosCompletedChange}% from last week)
Credits Used: ${data.creditsUsed} (${data.creditsRemaining} remaining)
Avg Turnaround: ${formatDuration(data.averageTurnaroundHours)}
Videos In Progress: ${data.videosInProgress}
`;

  if (data.topScriptTypes.length > 0) {
    text += `
TOP CONTENT TYPES
-----------------
${data.topScriptTypes.slice(0, 5).map(t => `- ${t.type.replace(/_/g, ' ')}: ${t.count}`).join('\n')}
`;
  }

  if (data.topPerformers && data.topPerformers.length > 0) {
    text += `
TOP PERFORMERS
--------------
${data.topPerformers.slice(0, 5).map((p, i) => `${i + 1}. ${p.name}: ${p.completed} completed`).join('\n')}
`;
  }

  if (data.highlights && data.highlights.length > 0) {
    text += `
HIGHLIGHTS
----------
${data.highlights.map(h => `* ${h}`).join('\n')}
`;
  }

  if (data.actionItems && data.actionItems.length > 0) {
    text += `
ACTION ITEMS
------------
${data.actionItems.map(item => `- ${item.text}${item.link ? ` (${item.link})` : ''}`).join('\n')}
`;
  }

  text += `
---
View full analytics: ${process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com'}/admin/analytics

FlashFlow AI
To manage your email preferences, visit: ${process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com'}/settings/notifications
`;

  return text;
}

/**
 * Example usage and data structure for testing
 */
export const exampleDigestData: WeeklyDigestData = {
  recipientName: 'John',
  recipientEmail: 'john@example.com',
  weekStart: '2024-01-15',
  weekEnd: '2024-01-21',
  scriptsCreated: 45,
  scriptsCreatedChange: 12,
  topScriptTypes: [
    { type: 'story_hook', count: 15 },
    { type: 'question_hook', count: 12 },
    { type: 'stat_hook', count: 10 },
    { type: 'controversy_hook', count: 5 },
    { type: 'other', count: 3 },
  ],
  videosCompleted: 32,
  videosCompletedChange: -5,
  videosInProgress: 8,
  averageTurnaroundHours: 36,
  creditsUsed: 450,
  creditsUsedChange: 8,
  creditsRemaining: 550,
  topPerformers: [
    { name: 'Alice Smith', completed: 12 },
    { name: 'Bob Johnson', completed: 10 },
    { name: 'Carol White', completed: 8 },
  ],
  highlights: [
    'Reached 1000 total scripts milestone!',
    'Average turnaround improved by 15%',
    'New team member onboarded successfully',
  ],
  actionItems: [
    { text: '3 videos awaiting review', link: '/admin/video-editing?status=review' },
    { text: 'Credit balance running low', link: '/admin/billing' },
  ],
};
