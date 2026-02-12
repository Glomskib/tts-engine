export interface BaseEmailData {
  unsubscribeUrl?: string;
}

export function emailWrapper(content: string, preheader?: string, unsubscribeUrl?: string): string {
  const unsubscribeHtml = unsubscribeUrl
    ? `<p><a href="${unsubscribeUrl}" style="color: #52525B;">Unsubscribe</a></p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #18181B; color: #E4E4E7; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 32px; }
    .logo { font-size: 24px; font-weight: bold; color: #0D9488; }
    .content { background: #27272A; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
    h1 { color: #FAFAFA; font-size: 22px; margin: 0 0 16px 0; }
    h2 { color: #FAFAFA; font-size: 18px; margin: 24px 0 12px 0; }
    p { color: #A1A1AA; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0; }
    a { color: #0D9488; text-decoration: none; }
    .btn { display: inline-block; background: #0D9488; color: #FFFFFF !important; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; text-decoration: none; margin: 16px 0; }
    .footer { text-align: center; padding: 24px 0; }
    .footer p { color: #71717A; font-size: 12px; }
    .stat-box { background: #3F3F46; border-radius: 8px; padding: 16px; margin: 8px 4px; text-align: center; display: inline-block; width: 45%; }
    .stat-number { font-size: 28px; font-weight: bold; color: #0D9488; }
    .stat-label { font-size: 13px; color: #A1A1AA; }
    .preheader { display: none; max-height: 0; overflow: hidden; }
  </style>
</head>
<body>
  ${preheader ? `<div class="preheader">${preheader}</div>` : ''}
  <div class="container">
    <div class="header">
      <div class="logo">FlashFlow AI</div>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>FlashFlow AI &mdash; AI-powered scripts for TikTok Shop creators</p>
      <p><a href="https://flashflowai.com">flashflowai.com</a> | <a href="mailto:support@flashflowai.com">support@flashflowai.com</a></p>
      ${unsubscribeHtml}
    </div>
  </div>
</body>
</html>`;
}
