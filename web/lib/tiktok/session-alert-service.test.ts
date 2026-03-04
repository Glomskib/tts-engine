import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeAlertState, evaluateSessionAlerts } from './session-alert-service';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../supabaseAdmin', () => {
  const mockFrom = vi.fn();
  return {
    supabaseAdmin: { from: mockFrom },
    __mockFrom: mockFrom,
  };
});

vi.mock('../telegram', () => ({
  sendTelegramNotification: vi.fn(),
}));

vi.mock('../node-id', () => ({
  getNodeId: () => 'test-node',
}));

import { supabaseAdmin } from '../supabaseAdmin';
import { sendTelegramNotification } from '../telegram';

// ─── Helpers ────────────────────────────────────────────────────────────────

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function hoursAgoISO(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function mockDbRow(overrides: Record<string, any> = {}) {
  return {
    node_name: 'test-node',
    platform: 'tiktok_studio',
    is_valid: true,
    expires_at: hoursFromNow(20),
    last_expiring_alert_at: null,
    last_invalid_alert_at: null,
    ...overrides,
  };
}

/** Wire up supabaseAdmin.from() to return a given row (or error). */
function mockSelect(row: any | null, error: any = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: row, error }),
  };
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

/** Wire up supabaseAdmin.from() to support both select and update calls. */
function mockSelectAndUpdate(row: any | null, error: any = null) {
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: row, error }),
  };
  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  };

  let callCount = 0;
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
    callCount++;
    // First call is the select, subsequent calls are updates
    if (callCount === 1) return selectChain;
    return updateChain;
  });

  return { selectChain, updateChain };
}

// ─── Pure function tests ────────────────────────────────────────────────────

describe('computeAlertState', () => {
  it('returns ok when valid and plenty of time', () => {
    expect(computeAlertState(true, 10)).toBe('ok');
  });

  it('returns expiring_soon when valid but under 6h', () => {
    expect(computeAlertState(true, 5)).toBe('expiring_soon');
  });

  it('returns invalid when expires_in is 0', () => {
    expect(computeAlertState(true, 0)).toBe('invalid');
  });

  it('returns invalid when not valid regardless of hours', () => {
    expect(computeAlertState(false, 10)).toBe('invalid');
  });

  it('returns expiring_soon at boundary (6h)', () => {
    expect(computeAlertState(true, 6)).toBe('expiring_soon');
  });

  it('returns ok just above threshold (6.1h)', () => {
    expect(computeAlertState(true, 6.1)).toBe('ok');
  });
});

// ─── Integration tests ──────────────────────────────────────────────────────

describe('evaluateSessionAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok with no Telegram when no DB row exists', async () => {
    mockSelect(null, { code: 'PGRST116', message: 'not found' });

    const result = await evaluateSessionAlerts('test-node');

    expect(result.alertState).toBe('ok');
    expect(result.alertSent).toBe(false);
    expect(result.reason).toBe('no_session_row');
    expect(sendTelegramNotification).not.toHaveBeenCalled();
  });

  it('returns ok with no Telegram when session is healthy', async () => {
    mockSelect(mockDbRow());

    const result = await evaluateSessionAlerts('test-node');

    expect(result.alertState).toBe('ok');
    expect(result.alertSent).toBe(false);
    expect(result.reason).toBe('healthy');
    expect(sendTelegramNotification).not.toHaveBeenCalled();
  });

  it('sends Telegram when expiring with no prior alert', async () => {
    mockSelectAndUpdate(mockDbRow({ expires_at: hoursFromNow(3) }));

    const result = await evaluateSessionAlerts('test-node');

    expect(result.alertState).toBe('expiring_soon');
    expect(result.alertSent).toBe(true);
    expect(sendTelegramNotification).toHaveBeenCalledOnce();
  });

  it('skips Telegram when expiring but alert sent 4h ago (cooldown active)', async () => {
    mockSelect(mockDbRow({
      expires_at: hoursFromNow(3),
      last_expiring_alert_at: hoursAgoISO(4),
    }));

    const result = await evaluateSessionAlerts('test-node');

    expect(result.alertState).toBe('expiring_soon');
    expect(result.alertSent).toBe(false);
    expect(result.reason).toBe('cooldown_active');
    expect(sendTelegramNotification).not.toHaveBeenCalled();
  });

  it('sends Telegram when expiring and alert sent 13h ago (cooldown expired)', async () => {
    mockSelectAndUpdate(mockDbRow({
      expires_at: hoursFromNow(3),
      last_expiring_alert_at: hoursAgoISO(13),
    }));

    const result = await evaluateSessionAlerts('test-node');

    expect(result.alertState).toBe('expiring_soon');
    expect(result.alertSent).toBe(true);
    expect(sendTelegramNotification).toHaveBeenCalledOnce();
  });

  it('sends Telegram when invalid with no prior alert', async () => {
    mockSelectAndUpdate(mockDbRow({
      is_valid: false,
      expires_at: hoursFromNow(10),
    }));

    const result = await evaluateSessionAlerts('test-node');

    expect(result.alertState).toBe('invalid');
    expect(result.alertSent).toBe(true);
    expect(sendTelegramNotification).toHaveBeenCalledOnce();
  });

  it('skips Telegram when invalid but alert sent 3h ago (cooldown active)', async () => {
    mockSelect(mockDbRow({
      is_valid: false,
      expires_at: hoursFromNow(10),
      last_invalid_alert_at: hoursAgoISO(3),
    }));

    const result = await evaluateSessionAlerts('test-node');

    expect(result.alertState).toBe('invalid');
    expect(result.alertSent).toBe(false);
    expect(result.reason).toBe('cooldown_active');
    expect(sendTelegramNotification).not.toHaveBeenCalled();
  });
});
