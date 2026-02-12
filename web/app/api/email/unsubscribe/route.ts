import { NextResponse } from 'next/server';
import { processUnsubscribe } from '@/lib/email/unsubscribe';

export const runtime = 'nodejs';

/**
 * GET /api/email/unsubscribe?token=xxx
 * Processes an unsubscribe request and returns a styled HTML confirmation page.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse(renderPage('Invalid Request', 'No unsubscribe token provided.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const result = await processUnsubscribe(token);

  if (!result.ok) {
    return new NextResponse(renderPage('Invalid Link', 'This unsubscribe link is invalid or expired.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new NextResponse(
    renderPage(
      'Unsubscribed',
      `You've been successfully unsubscribed${result.email ? ` (${result.email})` : ''}. You will no longer receive marketing emails from FlashFlow.`,
      true
    ),
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

function renderPage(title: string, message: string, success: boolean): string {
  const iconColor = success ? '#0D9488' : '#EF4444';
  const icon = success
    ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - FlashFlow</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #18181B; color: #E4E4E7; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { max-width: 480px; text-align: center; padding: 40px 20px; }
    .icon { color: ${iconColor}; margin-bottom: 24px; }
    h1 { color: #FAFAFA; font-size: 24px; margin: 0 0 12px 0; }
    p { color: #A1A1AA; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; }
    .logo { color: #0D9488; font-size: 14px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="logo">FlashFlow AI</div>
  </div>
</body>
</html>`;
}
