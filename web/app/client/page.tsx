'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import ClientNav from './components/ClientNav';

interface AuthUser {
  id: string;
  email: string | null;
}

interface RecentVideo {
  id: string;
  status: string;
  recording_status: string;
  created_at: string;
}

export default function ClientPortalPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [orgRequired, setOrgRequired] = useState(false);

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/client');
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/client');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch recent videos
  useEffect(() => {
    if (!authUser) return;

    const fetchRecentVideos = async () => {
      try {
        const res = await fetch('/api/client/videos?limit=5');
        const data = await res.json();

        if (res.status === 403 && data.error === 'client_org_required') {
          setOrgRequired(true);
        } else if (res.ok && data.ok) {
          setRecentVideos(data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch videos:', err);
      } finally {
        setVideosLoading(false);
      }
    };

    fetchRecentVideos();
  }, [authUser]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Checking access...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Redirecting to login...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} />

        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-800">Welcome</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your client portal for tracking video projects.
          </p>
        </div>

        {/* Org Required State */}
        {orgRequired ? (
          <div className="bg-white rounded-lg border border-amber-200 shadow-sm p-8 text-center">
            <div className="text-amber-600 mb-2 text-lg font-medium">Portal Not Connected</div>
            <p className="text-slate-600 mb-4">
              Your portal is not yet connected to an organization.
            </p>
            <p className="text-sm text-slate-500">
              Please contact support to get started.
            </p>
          </div>
        ) : (
          <>
            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Link
                href="/client/videos"
                className="p-5 bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-lg font-medium text-slate-800 mb-1">Videos</div>
                <div className="text-sm text-slate-500">View your video projects</div>
              </Link>
              <Link
                href="/client/support"
                className="p-5 bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-lg font-medium text-slate-800 mb-1">Support</div>
                <div className="text-sm text-slate-500">Get help and contact us</div>
              </Link>
              <Link
                href="/admin/status"
                className="p-5 bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-lg font-medium text-slate-800 mb-1">Status</div>
                <div className="text-sm text-slate-500">Check system status</div>
              </Link>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">Recent Activity</h2>
              </div>
              <div className="p-5">
                {videosLoading ? (
                  <div className="text-sm text-slate-500">Loading...</div>
                ) : recentVideos.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="text-slate-400 mb-2">No videos yet</div>
                    <div className="text-sm text-slate-500">
                      Your recent video projects will appear here.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentVideos.map((video) => (
                      <Link
                        key={video.id}
                        href={`/client/videos/${video.id}`}
                        className="block p-3 rounded-md border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-mono text-sm text-slate-600">
                            {video.id.slice(0, 8)}...
                          </div>
                          <span className="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600">
                            {video.recording_status?.replace(/_/g, ' ') || video.status || 'Unknown'}
                          </span>
                        </div>
                      </Link>
                    ))}
                    {recentVideos.length > 0 && (
                      <div className="pt-2 text-center">
                        <Link
                          href="/client/videos"
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          View all videos
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
