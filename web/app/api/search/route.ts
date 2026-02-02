import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

interface SearchResult {
  type: 'video' | 'script' | 'client';
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  createdAt?: string;
}

export async function GET(request: NextRequest) {
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const user = authContext.user;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();
  const type = searchParams.get('type'); // 'video' | 'script' | 'client' | null (all)
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results: SearchResult[] = [];
  const searchPattern = `%${query}%`;

  try {
    // Search videos
    if (!type || type === 'video') {
      const { data: videos } = await supabase
        .from('videos')
        .select('id, title, status, created_at')
        .eq('user_id', user.id)
        .ilike('title', searchPattern)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (videos) {
        results.push(...videos.map(v => ({
          type: 'video' as const,
          id: v.id,
          title: v.title,
          subtitle: v.status,
          url: `/videos/${v.id}`,
          createdAt: v.created_at,
        })));
      }
    }

    // Search scripts
    if (!type || type === 'script') {
      const { data: scripts } = await supabase
        .from('scripts')
        .select('id, title, hook, created_at')
        .eq('user_id', user.id)
        .or(`title.ilike.${searchPattern},hook.ilike.${searchPattern}`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (scripts) {
        results.push(...scripts.map(s => ({
          type: 'script' as const,
          id: s.id,
          title: s.title || 'Untitled Script',
          subtitle: s.hook?.substring(0, 50) + (s.hook?.length > 50 ? '...' : ''),
          url: `/scripts/${s.id}`,
          createdAt: s.created_at,
        })));
      }
    }

    // Search clients (for admin/agency users)
    if (!type || type === 'client') {
      const { data: clients } = await supabase
        .from('agency_clients')
        .select('id, company_name, contact_name, email, status, created_at')
        .eq('agency_id', user.id)
        .or(`company_name.ilike.${searchPattern},contact_name.ilike.${searchPattern},email.ilike.${searchPattern}`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (clients) {
        results.push(...clients.map(c => ({
          type: 'client' as const,
          id: c.id,
          title: c.company_name,
          subtitle: `${c.contact_name} • ${c.status}`,
          url: `/admin/clients/${c.id}`,
          createdAt: c.created_at,
        })));
      }
    }

    // Sort by most recent
    results.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({
      results: results.slice(0, limit),
      query,
      total: results.length,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
