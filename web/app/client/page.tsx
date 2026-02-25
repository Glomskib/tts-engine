'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Video, FileText, MessageCircle, Scissors, ChevronRight,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ClientNav from './components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';

interface RecentVideo {
  id: string;
  status: string;
  recording_status: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  NOT_RECORDED: 'Needs Recording',
  RECORDED: 'In Editing',
  EDITED: 'Ready to Review',
  READY_TO_POST: 'Ready to Post',
  POSTED: 'Posted',
  REJECTED: 'Rejected',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NOT_RECORDED: { bg: 'bg-slate-100', text: 'text-slate-600' },
  RECORDED: { bg: 'bg-amber-100', text: 'text-amber-700' },
  EDITED: { bg: 'bg-teal-100', text: 'text-teal-700' },
  READY_TO_POST: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  POSTED: { bg: 'bg-green-100', text: 'text-green-700' },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-700' },
};

export default function ClientPortalPage() {
  const { user } = useAuth();
  const authUser = { id: user?.id || '', email: user?.email || null };

  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [orgRequired, setOrgRequired] = useState(false);
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const [role, setRole] = useState<'owner' | 'member' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('welcome') === '1') {
      setShowWelcomeBanner(true);
      window.history.replaceState({}, '', '/client');
    }
  }, []);

  useEffect(() => {
    if (!authUser) return;

    const fetchBranding = async () => {
      try {
        const res = await fetch('/api/client/branding');
        const data = await res.json();

        if (res.ok && data.ok && data.data?.branding) {
          setBranding(data.data.branding);
          setWelcomeMessage(data.data.branding.welcome_message || null);
          if (data.data.role) setRole(data.data.role);
        } else {
          setBranding(getDefaultOrgBranding());
        }
      } catch (err) {
        console.error('Failed to fetch branding:', err);
        setBranding(getDefaultOrgBranding());
      }
    };

    fetchBranding();
  }, [authUser]);

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

  const accentText = branding?.accent_text_class || 'text-slate-800';
  const accentBg = branding?.accent_bg_class || 'bg-slate-800';

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
            <button type="button"
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
              {role === 'owner' && (
                <Link
                  href="/client/requests/new"
                  className="p-5 bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-5 h-5 text-slate-500 group-hover:text-teal-600 transition-colors" />
                    <div className="text-lg font-medium text-slate-800">New Request</div>
                  </div>
                  <div className="text-sm text-slate-500">Submit a content or editing request</div>
                </Link>
              )}
              <Link
                href="/client/videos"
                className="p-5 bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Video className="w-5 h-5 text-slate-500 group-hover:text-teal-600 transition-colors" />
                  <div className="text-lg font-medium text-slate-800">Videos</div>
                </div>
                <div className="text-sm text-slate-500">View your video projects</div>
              </Link>
              <Link
                href="/client/support"
                className="p-5 bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <MessageCircle className="w-5 h-5 text-slate-500 group-hover:text-teal-600 transition-colors" />
                  <div className="text-lg font-medium text-slate-800">Support</div>
                </div>
                <div className="text-sm text-slate-500">Get help and contact us</div>
              </Link>
              <Link
                href="/client/my-videos"
                className="p-5 bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Scissors className="w-5 h-5 text-slate-500 group-hover:text-teal-600 transition-colors" />
                  <div className="text-lg font-medium text-slate-800">Editing Requests</div>
                </div>
                <div className="text-sm text-slate-500">Track your video editing jobs</div>
              </Link>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">Recent Videos</h2>
              </div>
              <div className="p-5">
                {videosLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : recentVideos.length === 0 ? (
                  <div className="py-10 text-center">
                    <Video className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <div className="text-slate-600 font-medium mb-1">No videos yet</div>
                    <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">
                      {role === 'owner'
                        ? 'Create your first script to start producing videos.'
                        : 'Your team\'s videos will appear here once created.'}
                    </p>
                    {role === 'owner' && (
                      <Link
                        href="/client/requests/new"
                        className={`inline-flex items-center gap-2 px-4 py-2 ${accentBg} text-white text-sm font-medium rounded-md hover:opacity-90`}
                      >
                        Create Your First Script
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentVideos.map((video) => {
                      const statusKey = video.recording_status || 'NOT_RECORDED';
                      const colors = STATUS_COLORS[statusKey] || STATUS_COLORS.NOT_RECORDED;
                      const label = STATUS_LABELS[statusKey] || statusKey.replace(/_/g, ' ');

                      return (
                        <Link
                          key={video.id}
                          href={`/client/videos/${video.id}`}
                          className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="font-mono text-sm text-slate-600">
                              {video.id.slice(0, 8)}
                            </div>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors.bg} ${colors.text}`}>
                              {label}
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </Link>
                      );
                    })}
                    <div className="pt-2 text-center">
                      <Link
                        href="/client/videos"
                        className={`text-sm ${accentText} hover:opacity-80`}
                      >
                        View all videos
                      </Link>
                    </div>
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
