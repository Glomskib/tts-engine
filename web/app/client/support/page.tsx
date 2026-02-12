'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ClientNav from '../components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';

export default function ClientSupportPage() {
  const { user } = useAuth();
  // Layout guarantees authenticated — user is always non-null here
  const authUser = { id: user?.id || '', email: user?.email || null };
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);

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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} branding={branding} />

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-800">Support</h1>
          <p className="mt-1 text-sm text-slate-500">
            Get help with your video projects.
          </p>
        </div>

        {/* Support Content */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-slate-800 mb-2">Contact Us</h2>
              <p className="text-sm text-slate-600">
                For questions about your video projects, please reach out to your account manager
                or contact support through your usual channels.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-medium text-slate-800 mb-2">FAQ</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-slate-700">How do I track my video status?</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Visit the Videos page to see all your projects and their current status.
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-700">What do the status labels mean?</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Videos progress through stages: Not Recorded, Recorded, Edited, Ready to Post, and Posted.
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-700">Where can I find my posted video?</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Once a video is posted, a link will appear on the video detail page.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
