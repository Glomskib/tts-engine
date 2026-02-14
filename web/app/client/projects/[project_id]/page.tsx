'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import ClientNav from '../../components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';

interface AuthUser {
  id: string;
  email: string | null;
}

interface Video {
  id: string;
  status: string;
  recording_status: string;
  created_at: string;
  last_status_changed_at: string | null;
  posted_url: string | null;
}

interface Project {
  project_id: string;
  project_name: string;
  created_at: string;
  is_archived: boolean;
}

interface ProjectData {
  project: Project;
  videos: Video[];
  video_count: number;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NOT_RECORDED: { bg: 'bg-slate-100', text: 'text-slate-600' },
  RECORDED: { bg: 'bg-amber-100', text: 'text-amber-700' },
  EDITED: { bg: 'bg-teal-100', text: 'text-teal-700' },
  READY_TO_POST: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  POSTED: { bg: 'bg-green-100', text: 'text-green-700' },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-700' },
};

export default function ClientProjectDetailPage({
  params,
}: {
  params: Promise<{ project_id: string }>;
}) {
  const { project_id: projectId } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orgRequired, setOrgRequired] = useState(false);
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push(`/login?redirect=/client/projects/${projectId}`);
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push(`/login?redirect=/client/projects/${projectId}`);
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router, projectId]);

  // Fetch branding
  useEffect(() => {
    if (!authUser) return;

    const fetchBranding = async () => {
      try {
        const res = await fetch('/api/client/branding');
        const data = await res.json();

        if (res.ok && data.ok && data.data?.branding) {
          setBranding(data.data.branding);
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

  // Fetch project details
  useEffect(() => {
    if (!authUser) return;

    const fetchProject = async () => {
      try {
        const res = await fetch(`/api/client/projects/${projectId}`);
        const data = await res.json();

        if (res.status === 403 && data.error === 'client_org_required') {
          setOrgRequired(true);
        } else if (res.status === 404) {
          setError('Project not found');
        } else if (res.ok && data.ok) {
          setProjectData(data.data);
        } else {
          setError(data.error || 'Failed to load project');
        }
      } catch (err) {
        console.error('Failed to fetch project:', err);
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [authUser, projectId]);

  const displayTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

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
  const accentText = branding?.accent_text_class || 'text-slate-800';
  const accentBg = branding?.accent_bg_class || 'bg-slate-800';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} branding={branding} />

        {/* Breadcrumb */}
        <nav className="mb-4 text-sm">
          <Link href="/client/projects" className={`${accentText} hover:opacity-80`}>
            Projects
          </Link>
          <span className="mx-2 text-slate-400">/</span>
          <span className="text-slate-500">
            {projectData?.project.project_name || 'Loading...'}
          </span>
        </nav>

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
        ) : loading ? (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8 text-center text-slate-500">
            Loading project...
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg border border-red-200 shadow-sm p-8 text-center">
            <div className="text-red-600 mb-4">{error}</div>
            <Link
              href="/client/projects"
              className={`inline-block px-4 py-2 ${accentBg} text-white rounded-md hover:opacity-90`}
            >
              Back to Projects
            </Link>
          </div>
        ) : projectData ? (
          <>
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <h1 className={`text-2xl font-semibold ${accentText}`}>
                  {projectData.project.project_name}
                </h1>
                {projectData.project.is_archived && (
                  <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded">
                    Archived
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Created {displayTime(projectData.project.created_at)}
                <span className="mx-2">·</span>
                {projectData.video_count} video{projectData.video_count !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Videos List */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              {projectData.videos.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="text-slate-400 mb-2">No videos in this project</div>
                  <div className="text-sm text-slate-500">
                    Videos will appear here once assigned to this project.
                  </div>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Video ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Last Updated
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectData.videos.map((video) => {
                      const statusKey = video.recording_status || 'NOT_RECORDED';
                      const colors = STATUS_COLORS[statusKey] || STATUS_COLORS.NOT_RECORDED;
                      return (
                        <tr key={video.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm text-slate-600">
                              {video.id.slice(0, 8)}...
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors.bg} ${colors.text}`}>
                              {statusKey.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {displayTime(video.created_at)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {displayTime(video.last_status_changed_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/client/videos/${video.id}`}
                              className={`text-sm ${accentText} hover:opacity-80 font-medium`}
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
