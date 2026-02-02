import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  try {
    const authContext = await getApiAuthContext();
    if (!authContext.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authContext.user.id;

    // Check if user has dismissed onboarding (store in user_profiles or localStorage-backed)
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('onboarding_dismissed, onboarding_completed_steps')
      .eq('user_id', userId)
      .single();

    // Check what's been completed
    const [productsResult, scriptsResult, personasResult] = await Promise.all([
      supabaseAdmin
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAdmin
        .from('saved_skits')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAdmin
        .from('audience_personas')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    const productsCount = productsResult.count || 0;
    const scriptsCount = scriptsResult.count || 0;
    const personasCount = personasResult.count || 0;

    // Define onboarding steps
    const steps = [
      {
        id: 'add_product',
        title: 'Add your first product',
        description: 'Add a product or service to create content about',
        href: '/admin/products',
        completed: productsCount > 0,
      },
      {
        id: 'create_persona',
        title: 'Define your audience',
        description: 'Create an audience persona for targeted content',
        href: '/admin/audience',
        completed: personasCount > 0,
      },
      {
        id: 'generate_script',
        title: 'Generate your first script',
        description: 'Use AI to create a video script',
        href: '/admin/content-studio',
        completed: scriptsCount > 0,
      },
      {
        id: 'explore_features',
        title: 'Explore more features',
        description: 'Try the script library and video pipeline',
        href: '/admin/skit-library',
        completed: profile?.onboarding_completed_steps?.includes('explore_features') || false,
      },
    ];

    return NextResponse.json({
      steps,
      dismissed: profile?.onboarding_dismissed || false,
    });
  } catch (error) {
    console.error('Onboarding status error:', error);
    // Return default steps on error
    return NextResponse.json({
      steps: [
        {
          id: 'add_product',
          title: 'Add your first product',
          description: 'Add a product or service to create content about',
          href: '/admin/products',
          completed: false,
        },
        {
          id: 'generate_script',
          title: 'Generate your first script',
          description: 'Use AI to create a video script',
          href: '/admin/content-studio',
          completed: false,
        },
      ],
      dismissed: false,
    });
  }
}
