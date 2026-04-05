/**
 * FlashFlow Extension — Background Service Worker
 *
 * Handles:
 * - API calls to FlashFlow backend
 * - Auth token management
 * - Usage tracking
 */

const API_BASE = 'https://flashflowai.com';

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════

async function getAuthToken() {
  const result = await chrome.storage.local.get(['ff_api_key', 'ff_jwt']);
  return result.ff_api_key || result.ff_jwt || null;
}

async function setAuthToken(token, type = 'api_key') {
  if (type === 'api_key') {
    await chrome.storage.local.set({ ff_api_key: token });
  } else {
    await chrome.storage.local.set({ ff_jwt: token });
  }
}

async function clearAuth() {
  await chrome.storage.local.remove(['ff_api_key', 'ff_jwt', 'ff_user']);
}

function buildAuthHeader(token) {
  if (!token) return {};
  // API keys start with ff_ak_, JWTs start with eyJ
  if (token.startsWith('ff_ak_')) {
    return { 'x-api-key': token };
  }
  return { Authorization: `Bearer ${token}` };
}

// ═══════════════════════════════════════════════════════════════
// API CALLS
// ═══════════════════════════════════════════════════════════════

async function apiCall(endpoint, method, body) {
  const token = await getAuthToken();
  if (!token) {
    return { error: 'not_authenticated', message: 'Please log in to FlashFlow first.' };
  }

  const headers = {
    'Content-Type': 'application/json',
    ...buildAuthHeader(token),
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (response.status === 401) {
      return { error: 'not_authenticated', message: 'Session expired. Please log in again.' };
    }

    if (response.status === 402) {
      return { error: 'upgrade_required', message: data.error || 'Credits exhausted.', upgrade_url: data.upgrade_url || `${API_BASE}/admin/billing` };
    }

    if (response.status === 429) {
      return { error: 'rate_limited', message: 'Too many requests. Wait a moment and try again.' };
    }

    if (!response.ok) {
      return { error: 'api_error', message: data.error || `Server error (${response.status})` };
    }

    return { success: true, data };
  } catch (err) {
    return { error: 'network_error', message: 'Cannot reach FlashFlow. Check your connection.' };
  }
}

// ═══════════════════════════════════════════════════════════════
// GENERATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════

async function generateHooks(payload) {
  return apiCall('/api/hooks/generate', 'POST', {
    topic: payload.input_text,
    platform: payload.platform || 'tiktok',
    niche: payload.niche || '',
    count: payload.count || 5,
  });
}

async function generateScript(payload) {
  return apiCall('/api/transcribe/generate-script', 'POST', {
    transcript: payload.input_text,
    angle: payload.angle || 'educational',
    tone: payload.tone || 'conversational',
    targetLength: payload.targetLength || '30-45 seconds',
    instructions: payload.instructions || '',
  });
}

async function getUsageSummary() {
  return apiCall('/api/usage/summary', 'GET');
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.action) {
      case 'generate_hooks':
        return generateHooks(message.payload);

      case 'generate_script':
        return generateScript(message.payload);

      case 'get_usage':
        return getUsageSummary();

      case 'set_token':
        await setAuthToken(message.token, message.type);
        return { success: true };

      case 'check_auth': {
        const token = await getAuthToken();
        return { authenticated: !!token };
      }

      case 'logout':
        await clearAuth();
        return { success: true };

      case 'get_page_context':
        // Forward to content script in active tab
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) return { context: null };
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract_context' });
          return { context: response };
        } catch {
          return { context: null };
        }

      default:
        return { error: 'unknown_action' };
    }
  };

  handler().then(sendResponse);
  return true; // keep message channel open for async
});
