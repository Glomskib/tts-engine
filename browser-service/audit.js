const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUDIT_DIR = path.join(__dirname);
const SCREENSHOTS_DIR = path.join(AUDIT_DIR, 'screenshots');
const ERRORS_DIR = path.join(AUDIT_DIR, 'errors');

const EMAIL = process.env.FLASHFLOW_EMAIL || 'brandon@communitycorewholesale.com';
const PASSWORD = process.env.FLASHFLOW_PASSWORD || 'CCw123!123';

const PAGES = [
  { name: 'landing', url: 'https://flashflowai.com/', auth: false },
  { name: 'dashboard', url: 'https://flashflowai.com/admin/dashboard', auth: true },
  { name: 'pipeline', url: 'https://flashflowai.com/admin/pipeline', auth: true },
  { name: 'review', url: 'https://flashflowai.com/admin/review', auth: true },
  { name: 'calendar', url: 'https://flashflowai.com/admin/calendar', auth: true },
  { name: 'audience', url: 'https://flashflowai.com/admin/audience', auth: true },
  { name: 'products', url: 'https://flashflowai.com/admin/products', auth: true },
  { name: 'winners', url: 'https://flashflowai.com/admin/winners', auth: true },
  { name: 'content-studio', url: 'https://flashflowai.com/admin/content-studio', auth: true },
  { name: 'posting-queue', url: 'https://flashflowai.com/admin/posting-queue', auth: true },
  { name: 'tasks', url: 'https://flashflowai.com/admin/tasks', auth: true },
];

const DESKTOP = { width: 1920, height: 1080 };
const MOBILE = { width: 390, height: 844 };

async function login(page) {
  console.log('  Logging in via Supabase...');
  await page.goto('https://flashflowai.com/admin/dashboard', { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for the login form to appear
  await page.waitForTimeout(2000);

  // Try different login form selectors
  const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
  if (emailInput) {
    await emailInput.fill(EMAIL);
    const passInput = await page.$('input[type="password"], input[name="password"]');
    if (passInput) {
      await passInput.fill(PASSWORD);
    }
    // Click sign in button
    const signInBtn = await page.$('button[type="submit"], button:has-text("Sign"), button:has-text("Log")');
    if (signInBtn) {
      await signInBtn.click();
    }
    // Wait for navigation after login
    await page.waitForTimeout(5000);
    await page.waitForLoadState('networkidle').catch(() => {});
    console.log('  Login complete. URL:', page.url());
  } else {
    console.log('  No login form found - may already be logged in. URL:', page.url());
  }
}

async function auditPage(context, pageInfo, results) {
  const viewports = [
    { label: 'desktop', ...DESKTOP },
    { label: 'mobile', ...MOBILE },
  ];

  for (const vp of viewports) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({ text: msg.text(), url: msg.location()?.url || '' });
      }
    });

    const startTime = Date.now();
    let status = 'pass';
    let statusCode = 200;
    let error = null;

    try {
      const response = await page.goto(pageInfo.url, { waitUntil: 'networkidle', timeout: 30000 });
      statusCode = response?.status() || 0;
      if (statusCode >= 500) {
        status = 'fail';
        error = `HTTP ${statusCode}`;
      }
    } catch (e) {
      status = 'fail';
      error = e.message;
    }

    const loadTime = Date.now() - startTime;

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Check for blank white screen
    const bodyContent = await page.evaluate(() => {
      const body = document.body;
      return {
        innerText: body?.innerText?.trim()?.length || 0,
        childCount: body?.children?.length || 0,
        height: document.documentElement.scrollHeight,
      };
    }).catch(() => ({ innerText: 0, childCount: 0, height: 0 }));

    if (bodyContent.innerText < 10 && bodyContent.childCount < 3) {
      status = 'fail';
      error = (error || '') + ' Blank/empty page detected';
    }

    // Check scrollability
    const scrollable = bodyContent.height > vp.height;

    // Take screenshot
    const screenshotPath = path.join(SCREENSHOTS_DIR, `${pageInfo.name}-${vp.label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

    const key = `${pageInfo.name}-${vp.label}`;
    results[key] = {
      name: pageInfo.name,
      viewport: vp.label,
      url: pageInfo.url,
      status,
      statusCode,
      loadTime,
      scrollable,
      pageHeight: bodyContent.height,
      consoleErrors,
      error,
      screenshot: `screenshots/${pageInfo.name}-${vp.label}.png`,
    };

    await page.close();
  }

  // Save console errors
  const allErrors = [
    ...(results[`${pageInfo.name}-desktop`]?.consoleErrors || []),
    ...(results[`${pageInfo.name}-mobile`]?.consoleErrors || []),
  ];
  fs.writeFileSync(
    path.join(ERRORS_DIR, `${pageInfo.name}.json`),
    JSON.stringify(allErrors, null, 2)
  );
}

function generateReport(results) {
  const pages = [...new Set(Object.values(results).map(r => r.name))];

  let rows = '';
  for (const pageName of pages) {
    const desktop = results[`${pageName}-desktop`];
    const mobile = results[`${pageName}-mobile`];

    const badge = (r) => {
      if (!r) return '<span class="badge fail">N/A</span>';
      return r.status === 'pass'
        ? '<span class="badge pass">PASS</span>'
        : '<span class="badge fail">FAIL</span>';
    };

    const errorList = (r) => {
      if (!r || !r.consoleErrors.length) return '<em>None</em>';
      return '<ul>' + r.consoleErrors.map(e => `<li>${escapeHtml(e.text)}</li>`).join('') + '</ul>';
    };

    rows += `
    <tr>
      <td>
        <strong>${pageName}</strong><br>
        <small>${desktop?.url || ''}</small>
      </td>
      <td class="screenshot-cell">
        ${badge(desktop)}
        <img src="${desktop?.screenshot || ''}" alt="${pageName} desktop" onclick="openModal(this.src)">
        <div class="stats">
          Load: ${desktop?.loadTime || '?'}ms |
          Height: ${desktop?.pageHeight || '?'}px |
          Scroll: ${desktop?.scrollable ? 'Yes' : 'No'}
        </div>
      </td>
      <td class="screenshot-cell">
        ${badge(mobile)}
        <img src="${mobile?.screenshot || ''}" alt="${pageName} mobile" onclick="openModal(this.src)">
        <div class="stats">
          Load: ${mobile?.loadTime || '?'}ms |
          Height: ${mobile?.pageHeight || '?'}px |
          Scroll: ${mobile?.scrollable ? 'Yes' : 'No'}
        </div>
      </td>
      <td class="errors">
        ${errorList(desktop)}
        ${mobile?.consoleErrors?.length ? '<hr>' + errorList(mobile) : ''}
      </td>
    </tr>`;
  }

  const totalPages = pages.length;
  const passCount = Object.values(results).filter(r => r.status === 'pass').length;
  const failCount = Object.values(results).filter(r => r.status === 'fail').length;
  const avgLoad = Math.round(
    Object.values(results).reduce((sum, r) => sum + (r.loadTime || 0), 0) / Object.values(results).length
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FlashFlow Site Audit - ${new Date().toISOString().slice(0, 10)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e0e0e0; padding: 20px; }
  h1 { color: #fff; margin-bottom: 5px; }
  .subtitle { color: #888; margin-bottom: 20px; }
  .summary { display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; }
  .summary-card { background: #1a1d27; border-radius: 10px; padding: 15px 25px; min-width: 150px; }
  .summary-card .label { color: #888; font-size: 12px; text-transform: uppercase; }
  .summary-card .value { font-size: 28px; font-weight: 700; color: #fff; }
  .summary-card .value.pass-color { color: #4ade80; }
  .summary-card .value.fail-color { color: #f87171; }
  table { width: 100%; border-collapse: collapse; background: #1a1d27; border-radius: 10px; overflow: hidden; }
  th { background: #252836; padding: 12px 15px; text-align: left; font-size: 13px; text-transform: uppercase; color: #888; }
  td { padding: 12px 15px; border-top: 1px solid #2a2d3a; vertical-align: top; }
  .screenshot-cell { text-align: center; }
  .screenshot-cell img { width: 280px; border-radius: 6px; border: 1px solid #333; cursor: pointer; margin-top: 8px; transition: transform 0.2s; }
  .screenshot-cell img:hover { transform: scale(1.03); }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .badge.pass { background: #064e3b; color: #4ade80; }
  .badge.fail { background: #7f1d1d; color: #f87171; }
  .stats { font-size: 11px; color: #888; margin-top: 6px; }
  .errors { font-size: 12px; max-width: 300px; }
  .errors ul { padding-left: 15px; }
  .errors li { margin: 4px 0; color: #f87171; word-break: break-word; }
  .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 1000; justify-content: center; align-items: center; cursor: pointer; }
  .modal img { max-width: 95%; max-height: 95%; border-radius: 8px; }
  .modal.active { display: flex; }
</style>
</head>
<body>

<h1>FlashFlow Site Audit</h1>
<p class="subtitle">Generated ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC</p>

<div class="summary">
  <div class="summary-card">
    <div class="label">Pages</div>
    <div class="value">${totalPages}</div>
  </div>
  <div class="summary-card">
    <div class="label">Pass</div>
    <div class="value pass-color">${passCount}</div>
  </div>
  <div class="summary-card">
    <div class="label">Fail</div>
    <div class="value fail-color">${failCount}</div>
  </div>
  <div class="summary-card">
    <div class="label">Avg Load</div>
    <div class="value">${avgLoad}ms</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Page</th>
      <th>Desktop (1920x1080)</th>
      <th>Mobile (390x844)</th>
      <th>Console Errors</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>

<div class="modal" id="modal" onclick="closeModal()">
  <img id="modal-img" src="" alt="Full screenshot">
</div>

<script>
function openModal(src) {
  document.getElementById('modal-img').src = src;
  document.getElementById('modal').classList.add('active');
}
function closeModal() {
  document.getElementById('modal').classList.remove('active');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
</script>

</body>
</html>`;

  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function main() {
  console.log('=== FlashFlow Site Audit ===');
  console.log(`Auditing ${PAGES.length} pages...\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: DESKTOP,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  // Login first for auth pages
  console.log('[AUTH] Logging in...');
  const loginPage = await context.newPage();
  await login(loginPage);
  await loginPage.close();
  console.log('[AUTH] Session established.\n');

  const results = {};

  for (const pageInfo of PAGES) {
    console.log(`[${pageInfo.name}] Auditing...`);
    await auditPage(context, pageInfo, results);
    const dk = `${pageInfo.name}-desktop`;
    const mk = `${pageInfo.name}-mobile`;
    console.log(`  Desktop: ${results[dk]?.status} (${results[dk]?.loadTime}ms) | Mobile: ${results[mk]?.status} (${results[mk]?.loadTime}ms)`);
  }

  await browser.close();

  // Generate report
  console.log('\nGenerating report...');
  const reportHtml = generateReport(results);
  fs.writeFileSync(path.join(AUDIT_DIR, 'report.html'), reportHtml);

  // Also save raw results
  fs.writeFileSync(path.join(AUDIT_DIR, 'results.json'), JSON.stringify(results, null, 2));

  console.log('Report saved to audit/report.html');
  console.log(`\nSummary: ${Object.values(results).filter(r => r.status === 'pass').length} pass, ${Object.values(results).filter(r => r.status === 'fail').length} fail`);
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
