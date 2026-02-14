import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    const userId = authContext.user.id;

    // Check user_profiles (gracefully handle table not existing)
    let profile: { onboarding_dismissed: boolean; onboarding_complete: boolean } | null = null;
    try {
      const { data } = await supabaseAdmin
        .from('user_profiles')
        .select('onboarding_dismissed, onboarding_complete')
        .eq('user_id', userId)
        .single();
      profile = data;
    } catch {
      // Table may not exist yet
    }

    // Check what's been completed — 3 steps: product, script, pipeline video
    const [productsResult, scriptsResult, videosResult] = await Promise.all([
      supabaseAdmin
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAdmin
        .from('saved_skits')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAdmin
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    const productsCount = productsResult.count || 0;
    const scriptsCount = scriptsResult.count || 0;
    const videosCount = videosResult.count || 0;

    const steps = [
      {
        id: 'product',
        title: 'Add a product',
        description: 'Tell FlashFlow what you sell',
        href: '/admin/products',
        completed: productsCount > 0,
      },
      {
        id: 'script',
        title: 'Generate a script',
        description: 'Let AI write your first video script',
        href: '/admin/content-studio',
        completed: scriptsCount > 0,
      },
      {
        id: 'pipeline',
        title: 'Review in pipeline',
        description: 'Track a video from script to TikTok',
        href: '/admin/pipeline',
        completed: videosCount > 0,
      },
    ];

    return NextResponse.json({
      steps,
      dismissed: profile?.onboarding_dismissed || false,
      onboarding_complete: profile?.onboarding_complete || false,
    });
  } catch (error) {
    console.error('Onboarding status error:', error);
    return NextResponse.json({
      steps: [
        { id: 'product', title: 'Add a product', description: 'Tell FlashFlow what you sell', href: '/admin/products', completed: false },
        { id: 'script', title: 'Generate a script', description: 'Let AI write your first video script', href: '/admin/content-studio', completed: false },
        { id: 'pipeline', title: 'Review in pipeline', description: 'Track a video from script to TikTok', href: '/admin/pipeline', completed: false },
      ],
      dismissed: false,
      onboarding_complete: false,
    });
  }
}
