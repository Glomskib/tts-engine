'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import ClientNav from './components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';

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
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);

  // Check for welcome flag from invite acceptance
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('welcome') === '1') {
      setShowWelcomeBanner(true);
      // Remove the query param from URL without reload
      window.history.replaceState({}, '', '/client');
    }
  }, []);

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

  // Fetch branding
  useEffect(() => {
    if (!authUser) return;

    const fetchBranding = async () => {
      try {
        const res = await fetch('/api/client/branding');
        const data = await res.json();

        if (res.ok && data.ok && data.data?.branding) {
          setBranding(data.data.branding);
          setWelcomeMessage(data.data.branding.welcome_message || null);
        } else {
          // Use defaults
          setBranding(getDefaultOrgBranding());
        }
      } catch (err) {
        console.error('Failed to fetch branding:', err);
        setBranding(getDefaultOrgBranding());
      }
    };

    fetchBranding();
  }, [authUser]);

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

  // Get accent classes for styling
  const accentBg = branding?.accent_bg_class || 'bg-slate-800';
  const accentText = branding?.accent_text_class || 'text-slate-800';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} branding={branding} />

        {/* Welcome Banner for new members */}
        {showWelcomeBanner && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
            <div>
              <div className="text-green-800 font-medium">Welcome to the team!</div>
              <div className="text-sm text-green-700">
                Your invite has been accepted. You now have access to this organization&apos;s portal.
              </div>
            </div>
            <button
              onClick={() => setShowWelcomeBanner(false)}
              className="text-green-600 hover:text-green-800 p-1"
              aria-label="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className={`text-2xl font-semibold ${accentText}`}>Welcome</h1>
          {welcomeMessage ? (
            <p className="mt-2 text-sm text-slate-600">{welcomeMessage}</p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">
              Your client portal for tracking video projects.
            </p>
          )}
        </div>

        {/* Org Required State */}
        {orgRequired ? (
          <div className="bg-white rounded-lg border border-amber-200 shadow-sm p-8 text-center">
            <div className="text-amber-600 mb-2 text-lg font-medium">Portal Not Connected</div>
            <p className="text-slate-600 mb-4">
              Your account is not yet connected to an organization.
            </p>
            <p className="text-sm text-slate-500 mb-4">
              If you received an invite link, click it to join an organization.
              Otherwise, please contact your administrator for access.
            </p>
            <p className="text-xs text-slate-400">
              Signed in as: {authUser?.email}
            </p>
          </div>
        ) : (
          <>
            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Link
                href="/client/videos"
                className={`p-5 bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow group`}
              >
                <div className={`text-lg font-medium text-slate-800 mb-1 group-hover:${accentText}`}>Videos</div>
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
              <div className={`px-5 py-4 border-b border-slate-100`}>
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
                          className={`text-sm ${accentText} hover:opacity-80`}
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
