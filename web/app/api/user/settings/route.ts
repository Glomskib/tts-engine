import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createClient } from '@supabase/supabase-js';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

// Default user settings
const DEFAULT_SETTINGS = {
  theme: 'dark',
  notifications: {
    email: true,
    push: false,
    weekly_digest: true,
  },
  defaults: {
    video_aspect_ratio: '9:16',
    video_quality: 'high',
    auto_save: true,
  },
  accessibility: {
    reduce_motion: false,
    high_contrast: false,
  },
  posting: {
    videos_per_day: 1,
    posting_time_1: '09:00',
    posting_time_2: '18:00',
  },
};

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return createApiErrorResponse('INTERNAL', 'Server configuration error', 500, correlationId);
  }

  const user = authContext.user;

  try {
    // Try to fetch user settings from profiles or a dedicated settings table
    const { data: profile } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', user.id)
      .single();

    const settings = profile?.settings || DEFAULT_SETTINGS;

    return NextResponse.json({
      settings: { ...DEFAULT_SETTINGS, ...settings },
    });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json({
      settings: DEFAULT_SETTINGS,
    });
  }
}

export async function PATCH(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return createApiErrorResponse('INTERNAL', 'Server configuration error', 500, correlationId);
  }

  const user = authContext.user;

  try {
    const updates = await request.json();

    // Fetch current settings
    const { data: profile } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', user.id)
      .single();

    const currentSettings = profile?.settings || DEFAULT_SETTINGS;
    const newSettings = deepMerge(currentSettings, updates);

    // Update settings
    const { error } = await supabase
      .from('profiles')
      .update({ settings: newSettings, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (error) {
      console.error('Failed to update settings:', error);
      return createApiErrorResponse('DB_ERROR', 'Failed to save settings', 500, correlationId);
    }

    return NextResponse.json({
      settings: newSettings,
      message: 'Settings updated',
    });
  } catch (error) {
    console.error('Settings update error:', error);
    return createApiErrorResponse('BAD_REQUEST', 'Invalid request', 400, correlationId);
  }
}

// Deep merge helper for nested settings
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }

  return result;
}
