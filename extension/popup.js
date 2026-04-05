/**
 * FlashFlow Extension — Popup Logic
 */

// ═══════════════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════════════

const $ = (id) => document.getElementById(id);

const els = {
  authScreen: $('auth-screen'),
  app: $('app'),
  tokenInput: $('token-input'),
  btnLogin: $('btn-login'),
  btnLogout: $('btn-logout'),
  creditsBadge: $('credits-badge'),
  contextDot: $('context-dot'),
  contextText: $('context-text'),
  inputText: $('input-text'),
  btnHooks: $('btn-hooks'),
  btnScript: $('btn-script'),
  loading: $('loading'),
  msgError: $('msg-error'),
  msgUpgrade: $('msg-upgrade'),
  outputSection: $('output-section'),
  outputTitle: $('output-title'),
  outputContent: $('output-content'),
  btnCopy: $('btn-copy'),
  copyToast: $('copy-toast'),
};

let lastOutput = '';

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  const authResult = await sendMessage({ action: 'check_auth' });

  if (authResult.authenticated) {
    showApp();
    loadUsage();
    loadPageContext();
  } else {
    showAuth();
  }

  // Event listeners
  els.btnLogin.addEventListener('click', handleLogin);
  els.btnLogout.addEventListener('click', handleLogout);
  els.btnHooks.addEventListener('click', () => handleGenerate('hooks'));
  els.btnScript.addEventListener('click', () => handleGenerate('script'));
  els.btnCopy.addEventListener('click', handleCopy);

  // Enter key on token input
  els.tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
});

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════

function showAuth() {
  els.authScreen.style.display = 'block';
  els.app.style.display = 'none';
  els.tokenInput.focus();
}

function showApp() {
  els.authScreen.style.display = 'none';
  els.app.style.display = 'block';
}

async function handleLogin() {
  const token = els.tokenInput.value.trim();
  if (!token) return;

  els.btnLogin.disabled = true;
  els.btnLogin.textContent = 'Connecting...';

  const type = token.startsWith('ff_ak_') ? 'api_key' : 'jwt';
  await sendMessage({ action: 'set_token', token, type });

  // Verify by fetching usage
  const usage = await sendMessage({ action: 'get_usage' });

  if (usage.error) {
    els.btnLogin.disabled = false;
    els.btnLogin.textContent = 'Connect';
    showError(usage.message || 'Invalid token. Check your API key.');
    await sendMessage({ action: 'logout' });
    return;
  }

  els.btnLogin.disabled = false;
  els.btnLogin.textContent = 'Connect';
  showApp();
  displayUsage(usage.data);
  loadPageContext();
}

async function handleLogout() {
  await sendMessage({ action: 'logout' });
  showAuth();
  clearOutput();
}

// ═══════════════════════════════════════════════════════════════
// USAGE
// ═══════════════════════════════════════════════════════════════

async function loadUsage() {
  const result = await sendMessage({ action: 'get_usage' });
  if (result.error) {
    if (result.error === 'not_authenticated') {
      showAuth();
      return;
    }
    els.creditsBadge.textContent = '? credits';
    return;
  }
  displayUsage(result.data);
}

function displayUsage(data) {
  if (!data) {
    els.creditsBadge.textContent = '';
    return;
  }
  const credits = data.credits_remaining ?? data.creditsRemaining ?? '?';
  const plan = data.plan_id ?? data.planId ?? 'free';
  els.creditsBadge.textContent = `${credits} credits | ${plan}`;
}

// ═══════════════════════════════════════════════════════════════
// PAGE CONTEXT
// ═══════════════════════════════════════════════════════════════

async function loadPageContext() {
  const result = await sendMessage({ action: 'get_page_context' });
  const ctx = result?.context;

  if (ctx && ctx.summary) {
    els.contextDot.classList.remove('inactive');
    els.contextText.textContent = truncate(ctx.summary, 60);

    // Pre-fill input if empty
    if (!els.inputText.value.trim()) {
      els.inputText.value = ctx.summary;
    }
  } else {
    els.contextDot.classList.add('inactive');
    els.contextText.textContent = 'No page context detected';
  }
}

// ═══════════════════════════════════════════════════════════════
// GENERATE
// ═══════════════════════════════════════════════════════════════

async function handleGenerate(type) {
  const inputText = els.inputText.value.trim();
  if (!inputText) {
    showError('Enter a topic or context first.');
    return;
  }

  setLoading(true);
  clearMessages();
  clearOutput();

  const action = type === 'hooks' ? 'generate_hooks' : 'generate_script';
  const result = await sendMessage({
    action,
    payload: { input_text: inputText },
  });

  setLoading(false);

  if (result.error === 'upgrade_required') {
    els.msgUpgrade.style.display = 'block';
    return;
  }

  if (result.error) {
    showError(result.message || 'Generation failed.');
    return;
  }

  if (type === 'hooks') {
    renderHooks(result.data);
  } else {
    renderScript(result.data);
  }

  // Refresh credits
  loadUsage();
}

// ═══════════════════════════════════════════════════════════════
// RENDER OUTPUT
// ═══════════════════════════════════════════════════════════════

function renderHooks(data) {
  els.outputTitle.textContent = 'Generated Hooks';
  els.outputSection.classList.add('visible');

  // Handle various response shapes from the API
  const hooks = data.hooks || data.results || data;
  let html = '';
  let plainText = '';

  if (Array.isArray(hooks)) {
    hooks.forEach((hook, i) => {
      const text = typeof hook === 'string' ? hook : (hook.hook || hook.text || hook.content || JSON.stringify(hook));
      html += `<div class="hook-item"><div class="hook-number">Hook ${i + 1}</div>${escapeHtml(text)}</div>`;
      plainText += `${i + 1}. ${text}\n\n`;
    });
  } else if (typeof hooks === 'string') {
    html = escapeHtml(hooks);
    plainText = hooks;
  } else {
    html = `<pre>${escapeHtml(JSON.stringify(hooks, null, 2))}</pre>`;
    plainText = JSON.stringify(hooks, null, 2);
  }

  els.outputContent.innerHTML = html;
  lastOutput = plainText.trim();
}

function renderScript(data) {
  els.outputTitle.textContent = 'Generated Script';
  els.outputSection.classList.add('visible');

  let html = '';
  let plainText = '';

  // Handle the generate-script response shape
  const script = data.script || data;

  if (script.hook) {
    html += renderScriptField('Hook', script.hook);
    plainText += `HOOK:\n${script.hook}\n\n`;
  }
  if (script.setup) {
    html += renderScriptField('Setup', script.setup);
    plainText += `SETUP:\n${script.setup}\n\n`;
  }
  if (script.body) {
    html += renderScriptField('Body', script.body);
    plainText += `BODY:\n${script.body}\n\n`;
  }
  if (script.full_script) {
    html += renderScriptField('Full Script', script.full_script);
    plainText += `FULL SCRIPT:\n${script.full_script}\n\n`;
  }
  if (script.cta) {
    html += renderScriptField('CTA', script.cta);
    plainText += `CTA:\n${script.cta}\n\n`;
  }
  if (script.on_screen_text) {
    const ost = Array.isArray(script.on_screen_text)
      ? script.on_screen_text.join('\n')
      : script.on_screen_text;
    html += renderScriptField('On-Screen Text', ost);
    plainText += `ON-SCREEN TEXT:\n${ost}\n\n`;
  }
  if (script.filming_notes) {
    html += renderScriptField('Filming Notes', script.filming_notes);
    plainText += `FILMING NOTES:\n${script.filming_notes}\n`;
  }

  // Fallback if none of the expected fields exist
  if (!html) {
    html = `<pre>${escapeHtml(JSON.stringify(script, null, 2))}</pre>`;
    plainText = JSON.stringify(script, null, 2);
  }

  els.outputContent.innerHTML = html;
  lastOutput = plainText.trim();
}

function renderScriptField(label, value) {
  return `<div class="script-section"><div class="script-label">${escapeHtml(label)}</div>${escapeHtml(value)}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// COPY
// ═══════════════════════════════════════════════════════════════

async function handleCopy() {
  if (!lastOutput) return;

  try {
    await navigator.clipboard.writeText(lastOutput);
    els.copyToast.classList.add('show');
    setTimeout(() => els.copyToast.classList.remove('show'), 1500);
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = lastOutput;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    els.copyToast.classList.add('show');
    setTimeout(() => els.copyToast.classList.remove('show'), 1500);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response || {});
    });
  });
}

function setLoading(on) {
  els.loading.classList.toggle('visible', on);
  els.btnHooks.disabled = on;
  els.btnScript.disabled = on;
}

function showError(msg) {
  els.msgError.textContent = msg;
  els.msgError.classList.add('visible');
}

function clearMessages() {
  els.msgError.classList.remove('visible');
  els.msgError.textContent = '';
  els.msgUpgrade.style.display = 'none';
}

function clearOutput() {
  els.outputSection.classList.remove('visible');
  els.outputContent.innerHTML = '';
  lastOutput = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, len) {
  if (str.length <= len) return str;
  return str.substring(0, len) + '...';
}
