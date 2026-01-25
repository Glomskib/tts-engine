'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminNav from '../components/AdminNav';
import { EmptyState } from '../components/AdminPageLayout';
import { getAccentColorOptions, AccentColor } from '@/lib/org-branding';

interface ClientOrg {
  org_id: string;
  org_name: string;
  created_at: string;
  member_count: number;
  video_count: number;
  last_activity_at: string | null;
}

interface ClientProject {
  project_id: string;
  project_name: string;
  video_count: number;
  created_at: string;
  is_archived?: boolean;
}

interface OrgBranding {
  org_display_name?: string;
  logo_url?: string | null;
  accent_color?: AccentColor;
  welcome_message?: string | null;
}

interface OrgMember {
  user_id: string;
  email: string | null;
  role: 'owner' | 'member';
  joined_at: string;
}

interface OrgInvite {
  invite_id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
}

const ACCENT_COLOR_OPTIONS = getAccentColorOptions();
const INVITE_ROLES = ['client', 'recorder', 'editor', 'uploader', 'admin'] as const;

export default function AdminClientOrgsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orgs, setOrgs] = useState<ClientOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Member management
  const [selectedOrg, setSelectedOrg] = useState<ClientOrg | null>(null);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState<'owner' | 'member'>('member');
  const [managingMember, setManagingMember] = useState(false);

  // Video assignment
  const [videoIdToAssign, setVideoIdToAssign] = useState('');
  const [assigningVideo, setAssigningVideo] = useState(false);

  // Branding
  const [branding, setBranding] = useState<OrgBranding>({});
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);

  // Projects
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [archivingProject, setArchivingProject] = useState<string | null>(null);

  // Video to project assignment
  const [videoIdForProject, setVideoIdForProject] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [assigningToProject, setAssigningToProject] = useState(false);

  // Org Plan
  const [orgPlan, setOrgPlan] = useState<'free' | 'pro' | 'enterprise'>('free');
  const [billingStatus, setBillingStatus] = useState<'active' | 'trial' | 'past_due' | 'canceled'>('active');
  const [planLoading, setPlanLoading] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingBillingStatus, setSavingBillingStatus] = useState(false);

  // Members & Invites
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<typeof INVITE_ROLES[number]>('client');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [revokingMember, setRevokingMember] = useState<string | null>(null);
  const [revokingInvite, setRevokingInvite] = useState<string | null>(null);
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);

  // Check auth and admin status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/client-orgs');
          return;
        }

        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        if (roleData.role !== 'admin') {
          router.push('/admin/pipeline');
          return;
        }

        setIsAdmin(true);
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/admin/client-orgs');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch orgs
  const fetchOrgs = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch('/api/admin/client-orgs', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      const data = await res.json();

      if (data.orgs) {
        setOrgs(data.orgs);
        setError('');
      } else {
        setError(data.error || 'Failed to load organizations');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchOrgs();
  }, [isAdmin]);

  // Fetch branding, projects, plan, members, and invites when org selected
  useEffect(() => {
    if (!selectedOrg) {
      setBranding({});
      setProjects([]);
      setOrgPlan('free');
      setBillingStatus('active');
      setMembers([]);
      setInvites([]);
      setLastInviteUrl(null);
      return;
    }

    const fetchBranding = async () => {
      setBrandingLoading(true);
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();

        const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/branding`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`
          }
        });
        const data = await res.json();

        if (data.ok && data.data.raw) {
          setBranding(data.data.raw);
        } else {
          setBranding({});
        }
      } catch (err) {
        console.error('Error fetching branding:', err);
        setBranding({});
      } finally {
        setBrandingLoading(false);
      }
    };

    const fetchProjects = async () => {
      setProjectsLoading(true);
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();

        const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/projects`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`
          }
        });
        const data = await res.json();

        if (data.ok && data.data) {
          setProjects(data.data);
        } else {
          setProjects([]);
        }
      } catch (err) {
        console.error('Error fetching projects:', err);
        setProjects([]);
      } finally {
        setProjectsLoading(false);
      }
    };

    const fetchPlan = async () => {
      setPlanLoading(true);
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();

        const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/plan`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`
          }
        });
        const data = await res.json();

        if (data.ok && data.data) {
          setOrgPlan(data.data.plan || 'free');
          setBillingStatus(data.data.billing_status || 'active');
        } else {
          setOrgPlan('free');
          setBillingStatus('active');
        }
      } catch (err) {
        console.error('Error fetching org plan:', err);
        setOrgPlan('free');
        setBillingStatus('active');
      } finally {
        setPlanLoading(false);
      }
    };

    const fetchMembers = async () => {
      setMembersLoading(true);
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();

        const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/members`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`
          }
        });
        const data = await res.json();

        if (data.ok && data.data?.members) {
          setMembers(data.data.members);
        } else {
          setMembers([]);
        }
      } catch (err) {
        console.error('Error fetching members:', err);
        setMembers([]);
      } finally {
        setMembersLoading(false);
      }
    };

    const fetchInvites = async () => {
      setInvitesLoading(true);
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();

        const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/invite`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`
          }
        });
        const data = await res.json();

        if (data.ok && data.data?.invites) {
          setInvites(data.data.invites);
        } else {
          setInvites([]);
        }
      } catch (err) {
        console.error('Error fetching invites:', err);
        setInvites([]);
      } finally {
        setInvitesLoading(false);
      }
    };

    fetchBranding();
    fetchProjects();
    fetchPlan();
    fetchMembers();
    fetchInvites();
  }, [selectedOrg]);

  // Create organization
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    setCreatingOrg(true);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch('/api/admin/client-orgs/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ org_name: newOrgName.trim() }),
      });

      const data = await res.json();

      if (data.org_id) {
        setMessage({ type: 'success', text: `Organization "${newOrgName}" created` });
        setNewOrgName('');
        fetchOrgs();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create organization' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setCreatingOrg(false);
    }
  };

  // Add/remove member
  const handleSetMember = async (action: 'add' | 'remove') => {
    if (!selectedOrg || !memberUserId.trim()) return;

    setManagingMember(true);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch('/api/admin/client-orgs/members/set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          org_id: selectedOrg.org_id,
          user_id: memberUserId.trim(),
          role: memberRole,
          action,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: action === 'add'
            ? `User added to ${selectedOrg.org_name}`
            : `User removed from ${selectedOrg.org_name}`
        });
        setMemberUserId('');
        fetchOrgs();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update membership' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setManagingMember(false);
    }
  };

  // Assign video to org
  const handleAssignVideo = async () => {
    if (!selectedOrg || !videoIdToAssign.trim()) return;

    setAssigningVideo(true);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/videos/${videoIdToAssign.trim()}/set-client-org`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ org_id: selectedOrg.org_id }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: `Video assigned to ${selectedOrg.org_name}` });
        setVideoIdToAssign('');
        fetchOrgs();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to assign video' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setAssigningVideo(false);
    }
  };

  // Save branding
  const handleSaveBranding = async () => {
    if (!selectedOrg) return;

    setSavingBranding(true);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/branding/set`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(branding),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: 'Branding updated successfully' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update branding' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSavingBranding(false);
    }
  };

  // Refresh projects for selected org
  const refreshProjects = async () => {
    if (!selectedOrg) return;
    setProjectsLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/projects`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      const data = await res.json();

      if (data.ok && data.data) {
        setProjects(data.data);
      }
    } catch (err) {
      console.error('Error refreshing projects:', err);
    } finally {
      setProjectsLoading(false);
    }
  };

  // Create project
  const handleCreateProject = async () => {
    if (!selectedOrg || !newProjectName.trim()) return;

    setCreatingProject(true);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/projects/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ project_name: newProjectName.trim() }),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: `Project "${newProjectName}" created` });
        setNewProjectName('');
        refreshProjects();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create project' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setCreatingProject(false);
    }
  };

  // Archive project
  const handleArchiveProject = async (projectId: string) => {
    if (!selectedOrg) return;

    setArchivingProject(projectId);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/projects/${projectId}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: 'Project archived' });
        refreshProjects();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to archive project' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setArchivingProject(null);
    }
  };

  // Assign video to project
  const handleAssignToProject = async () => {
    if (!selectedOrg || !videoIdForProject.trim() || !selectedProjectId) return;

    setAssigningToProject(true);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/videos/${videoIdForProject.trim()}/set-project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ project_id: selectedProjectId }),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: 'Video assigned to project' });
        setVideoIdForProject('');
        setSelectedProjectId('');
        refreshProjects();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to assign video to project' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setAssigningToProject(false);
    }
  };

  // Set org plan
  const handleSetOrgPlan = async (newPlan: 'free' | 'pro' | 'enterprise') => {
    if (!selectedOrg) return;

    setSavingPlan(true);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/plan/set`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ plan: newPlan }),
      });

      const data = await res.json();

      if (data.ok) {
        setOrgPlan(newPlan);
        setMessage({ type: 'success', text: `Organization plan set to ${newPlan}` });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to set plan' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSavingPlan(false);
    }
  };

  // Set billing status
  const handleSetBillingStatus = async (newStatus: 'active' | 'trial' | 'past_due' | 'canceled') => {
    if (!selectedOrg) return;

    setSavingBillingStatus(true);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/billing-status/set`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ billing_status: newStatus }),
      });

      const data = await res.json();

      if (data.ok) {
        setBillingStatus(newStatus);
        setMessage({ type: 'success', text: `Billing status set to ${newStatus}` });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to set billing status' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSavingBillingStatus(false);
    }
  };

  // Refresh members and invites
  const refreshMembersAndInvites = async () => {
    if (!selectedOrg) return;

    const supabase = createBrowserSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    // Fetch members
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/members`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
      if (data.ok && data.data?.members) {
        setMembers(data.data.members);
      }
    } catch (err) {
      console.error('Error refreshing members:', err);
    } finally {
      setMembersLoading(false);
    }

    // Fetch invites
    setInvitesLoading(true);
    try {
      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/invite`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
      if (data.ok && data.data?.invites) {
        setInvites(data.data.invites);
      }
    } catch (err) {
      console.error('Error refreshing invites:', err);
    } finally {
      setInvitesLoading(false);
    }

    // Refresh orgs list for member count
    fetchOrgs();
  };

  // Create invite
  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !inviteEmail.trim()) return;

    setCreatingInvite(true);
    setMessage(null);
    setLastInviteUrl(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      const data = await res.json();

      if (data.ok) {
        // Show email status in message
        const emailNote = data.data.email_sent
          ? ' (Email sent)'
          : data.data.email_skipped
            ? ' (Email not configured)'
            : '';
        setMessage({ type: 'success', text: `Invite created for ${inviteEmail}${emailNote}` });
        setLastInviteUrl(data.data.invite_url);
        setInviteEmail('');
        refreshMembersAndInvites();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create invite' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setCreatingInvite(false);
    }
  };

  // Revoke member
  const handleRevokeMember = async (userId: string) => {
    if (!selectedOrg) return;

    setRevokingMember(userId);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/members/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ user_id: userId }),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: 'Member revoked' });
        refreshMembersAndInvites();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to revoke member' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setRevokingMember(null);
    }
  };

  // Revoke invite
  const handleRevokeInvite = async (inviteId: string) => {
    if (!selectedOrg) return;

    setRevokingInvite(inviteId);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/invites/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ invite_id: inviteId }),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: 'Invite revoked' });
        refreshMembersAndInvites();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to revoke invite' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setRevokingInvite(null);
    }
  };

  // Resend invite
  const handleResendInvite = async (inviteId: string) => {
    if (!selectedOrg) return;

    setResendingInvite(inviteId);
    setMessage(null);
    setLastInviteUrl(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/client-orgs/${selectedOrg.org_id}/invites/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ invite_id: inviteId }),
      });

      const data = await res.json();

      if (data.ok) {
        // Show email status in message
        const emailNote = data.data.email_sent
          ? ' (Email sent)'
          : data.data.email_skipped
            ? ' (Email not configured)'
            : '';
        setMessage({ type: 'success', text: `Invite resent to ${data.data.email}${emailNote}` });
        setLastInviteUrl(data.data.invite_url);
        refreshMembersAndInvites();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to resend invite' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setResendingInvite(null);
    }
  };

  // Copy invite URL to clipboard
  const handleCopyInviteUrl = async () => {
    if (lastInviteUrl) {
      try {
        await navigator.clipboard.writeText(lastInviteUrl);
        setMessage({ type: 'success', text: 'Invite URL copied to clipboard' });
      } catch {
        setMessage({ type: 'error', text: 'Failed to copy to clipboard' });
      }
    }
  };

  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!isAdmin) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <AdminNav isAdmin={isAdmin} />

      <h1 style={{ margin: '0 0 20px 0' }}>Client Organizations</h1>

      {/* Message */}
      {message && (
        <div style={{
          marginBottom: '15px',
          padding: '12px 16px',
          backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24',
          borderRadius: '4px',
          border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
        }}>
          {message.text}
        </div>
      )}

      {/* Create Org Form */}
      <div style={{
        padding: '16px 20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        marginBottom: '20px',
        border: '1px solid #dee2e6',
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#495057' }}>Create Organization</h3>
        <form onSubmit={handleCreateOrg} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            placeholder="Organization name"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
          <button
            type="submit"
            disabled={creatingOrg || !newOrgName.trim()}
            style={{
              padding: '8px 16px',
              backgroundColor: creatingOrg || !newOrgName.trim() ? '#adb5bd' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: creatingOrg || !newOrgName.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            {creatingOrg ? 'Creating...' : 'Create'}
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Orgs List */}
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#495057' }}>Organizations</h3>

          {loading && (
            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              Loading...
            </div>
          )}

          {error && (
            <div style={{
              padding: '20px',
              backgroundColor: '#f8d7da',
              borderRadius: '4px',
              color: '#721c24',
            }}>
              {error}
            </div>
          )}

          {!loading && !error && orgs.length === 0 && (
            <EmptyState
              title="No organizations"
              description="Create your first client organization to get started."
            />
          )}

          {!loading && !error && orgs.length > 0 && (
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              {orgs.map((org, idx) => (
                <div
                  key={org.org_id}
                  onClick={() => setSelectedOrg(org)}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: selectedOrg?.org_id === org.org_id ? '#e7f5ff' : 'white',
                    borderBottom: idx < orgs.length - 1 ? '1px solid #dee2e6' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{org.org_name}</div>
                  <div style={{ fontSize: '12px', color: '#6c757d', display: 'flex', gap: '12px' }}>
                    <span>{org.member_count} member(s)</span>
                    <span>{org.video_count} video(s)</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#adb5bd', fontFamily: 'monospace', marginTop: '4px' }}>
                    {org.org_id.slice(0, 8)}...
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Org Detail Panel */}
        {selectedOrg && (
          <div style={{
            width: '400px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            {/* Org Info */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>{selectedOrg.org_name}</h3>
              <div style={{ fontSize: '12px', color: '#6c757d' }}>
                <div>Members: {selectedOrg.member_count}</div>
                <div>Videos: {selectedOrg.video_count}</div>
                <div style={{ fontFamily: 'monospace', marginTop: '4px' }}>
                  ID: {selectedOrg.org_id}
                </div>
              </div>
            </div>

            {/* Plan Management */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#495057' }}>Plan & Billing</h4>
              {planLoading ? (
                <div style={{ fontSize: '12px', color: '#6c757d' }}>Loading...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
                      Plan
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        value={orgPlan}
                        onChange={(e) => handleSetOrgPlan(e.target.value as 'free' | 'pro' | 'enterprise')}
                        disabled={savingPlan}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1px solid #ced4da',
                          borderRadius: '4px',
                          fontSize: '13px',
                          backgroundColor: savingPlan ? '#e9ecef' : 'white',
                        }}
                      >
                        <option value="free">Free</option>
                        <option value="pro">Pro</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                      {savingPlan && (
                        <span style={{ fontSize: '12px', color: '#6c757d', alignSelf: 'center' }}>Saving...</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
                      Billing Status
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        value={billingStatus}
                        onChange={(e) => handleSetBillingStatus(e.target.value as 'active' | 'trial' | 'past_due' | 'canceled')}
                        disabled={savingBillingStatus}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1px solid #ced4da',
                          borderRadius: '4px',
                          fontSize: '13px',
                          backgroundColor: savingBillingStatus ? '#e9ecef' : 'white',
                        }}
                      >
                        <option value="active">Active</option>
                        <option value="trial">Trial</option>
                        <option value="past_due">Past Due</option>
                        <option value="canceled">Canceled</option>
                      </select>
                      {savingBillingStatus && (
                        <span style={{ fontSize: '12px', color: '#6c757d', alignSelf: 'center' }}>Saving...</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '4px' }}>
                    {orgPlan === 'free' && (
                      <span>Free: 1 project max, org_display_name only for branding</span>
                    )}
                    {orgPlan === 'pro' && (
                      <span>Pro: Unlimited projects, full branding</span>
                    )}
                    {orgPlan === 'enterprise' && (
                      <span>Enterprise: All features + priority support</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Branding Panel */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#495057' }}>Branding</h4>
              {brandingLoading ? (
                <div style={{ fontSize: '12px', color: '#6c757d' }}>Loading...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={branding.org_display_name || ''}
                      onChange={(e) => setBranding({ ...branding, org_display_name: e.target.value })}
                      placeholder={selectedOrg.org_name}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
                      Logo URL
                    </label>
                    <input
                      type="text"
                      value={branding.logo_url || ''}
                      onChange={(e) => setBranding({ ...branding, logo_url: e.target.value || null })}
                      placeholder="https://example.com/logo.png"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
                      Accent Color
                    </label>
                    <select
                      value={branding.accent_color || ''}
                      onChange={(e) => setBranding({ ...branding, accent_color: e.target.value as AccentColor || undefined })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">Default (Slate)</option>
                      {ACCENT_COLOR_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
                      Welcome Message
                    </label>
                    <textarea
                      value={branding.welcome_message || ''}
                      onChange={(e) => setBranding({ ...branding, welcome_message: e.target.value || null })}
                      placeholder="Welcome to your portal..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleSaveBranding}
                    disabled={savingBranding}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: savingBranding ? '#adb5bd' : '#1971c2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: savingBranding ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    {savingBranding ? 'Saving...' : 'Save Branding'}
                  </button>
                </div>
              )}
            </div>

            {/* Projects Panel */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#495057' }}>Projects</h4>

              {/* Create Project */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="New project name"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '13px',
                  }}
                />
                <button
                  onClick={handleCreateProject}
                  disabled={creatingProject || !newProjectName.trim()}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: creatingProject || !newProjectName.trim() ? '#adb5bd' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: creatingProject || !newProjectName.trim() ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                >
                  {creatingProject ? '...' : 'Create'}
                </button>
              </div>

              {/* Projects List */}
              {projectsLoading ? (
                <div style={{ fontSize: '12px', color: '#6c757d', padding: '8px 0' }}>Loading...</div>
              ) : projects.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#6c757d', padding: '8px 0' }}>No projects</div>
              ) : (
                <div style={{
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginBottom: '12px',
                }}>
                  {projects.map((project, idx) => (
                    <div
                      key={project.project_id}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: project.is_archived ? '#f8f9fa' : 'white',
                        borderBottom: idx < projects.length - 1 ? '1px solid #dee2e6' : 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{
                          fontWeight: 'bold',
                          fontSize: '13px',
                          color: project.is_archived ? '#6c757d' : '#212529',
                        }}>
                          {project.project_name}
                          {project.is_archived && (
                            <span style={{
                              marginLeft: '6px',
                              fontSize: '10px',
                              padding: '2px 6px',
                              backgroundColor: '#e9ecef',
                              borderRadius: '3px',
                              color: '#6c757d',
                            }}>
                              archived
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '2px' }}>
                          {project.video_count} video(s)
                        </div>
                      </div>
                      {!project.is_archived && (
                        <button
                          onClick={() => handleArchiveProject(project.project_id)}
                          disabled={archivingProject === project.project_id}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'transparent',
                            color: '#6c757d',
                            border: '1px solid #ced4da',
                            borderRadius: '3px',
                            cursor: archivingProject === project.project_id ? 'not-allowed' : 'pointer',
                            fontSize: '11px',
                          }}
                        >
                          {archivingProject === project.project_id ? '...' : 'Archive'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Assign Video to Project */}
              {projects.filter(p => !p.is_archived).length > 0 && (
                <div style={{ borderTop: '1px solid #dee2e6', paddingTop: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#495057', marginBottom: '8px' }}>
                    Assign Video to Project
                  </div>
                  <input
                    type="text"
                    value={videoIdForProject}
                    onChange={(e) => setVideoIdForProject(e.target.value)}
                    placeholder="Video ID (UUID)"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #ced4da',
                      borderRadius: '4px',
                      fontSize: '13px',
                      marginBottom: '8px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '13px',
                      }}
                    >
                      <option value="">Select project...</option>
                      {projects.filter(p => !p.is_archived).map((project) => (
                        <option key={project.project_id} value={project.project_id}>
                          {project.project_name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssignToProject}
                      disabled={assigningToProject || !videoIdForProject.trim() || !selectedProjectId}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: assigningToProject || !videoIdForProject.trim() || !selectedProjectId ? '#adb5bd' : '#1971c2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: assigningToProject || !videoIdForProject.trim() || !selectedProjectId ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    >
                      {assigningToProject ? '...' : 'Assign'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Members Table */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#495057' }}>
                Members ({members.length})
              </h4>
              {membersLoading ? (
                <div style={{ fontSize: '12px', color: '#6c757d', padding: '8px 0' }}>Loading...</div>
              ) : members.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#6c757d', padding: '8px 0' }}>No members</div>
              ) : (
                <div style={{
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginBottom: '12px',
                }}>
                  {members.map((member, idx) => (
                    <div
                      key={member.user_id}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'white',
                        borderBottom: idx < members.length - 1 ? '1px solid #dee2e6' : 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>
                          {member.email || 'No email'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6c757d' }}>
                          {member.role} • {member.user_id.slice(0, 8)}...
                        </div>
                      </div>
                      <button
                        onClick={() => handleRevokeMember(member.user_id)}
                        disabled={revokingMember === member.user_id}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: revokingMember === member.user_id ? '#adb5bd' : '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: revokingMember === member.user_id ? 'not-allowed' : 'pointer',
                          fontSize: '11px',
                        }}
                      >
                        {revokingMember === member.user_id ? '...' : 'Revoke'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add member by UUID (legacy) */}
              <div style={{ borderTop: '1px solid #dee2e6', paddingTop: '12px' }}>
                <div style={{ fontSize: '12px', color: '#495057', marginBottom: '8px' }}>
                  Add by User ID
                </div>
                <input
                  type="text"
                  value={memberUserId}
                  onChange={(e) => setMemberUserId(e.target.value)}
                  placeholder="User ID (UUID)"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '13px',
                    marginBottom: '8px',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value as 'owner' | 'member')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '1px solid #ced4da',
                      borderRadius: '4px',
                      fontSize: '13px',
                    }}
                  >
                    <option value="member">Member</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    onClick={() => handleSetMember('add')}
                    disabled={managingMember || !memberUserId.trim()}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: managingMember || !memberUserId.trim() ? '#adb5bd' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: managingMember || !memberUserId.trim() ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    {managingMember ? '...' : 'Add'}
                  </button>
                </div>
              </div>
            </div>

            {/* Invites Panel */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#495057' }}>
                Invite by Email
              </h4>

              {/* Invite Form */}
              <form onSubmit={handleCreateInvite} style={{ marginBottom: '12px' }}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '13px',
                    marginBottom: '8px',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as typeof INVITE_ROLES[number])}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '1px solid #ced4da',
                      borderRadius: '4px',
                      fontSize: '13px',
                    }}
                  >
                    {INVITE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={creatingInvite || !inviteEmail.trim()}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: creatingInvite || !inviteEmail.trim() ? '#adb5bd' : '#1971c2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: creatingInvite || !inviteEmail.trim() ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    {creatingInvite ? '...' : 'Invite'}
                  </button>
                </div>
              </form>

              {/* Last Invite URL */}
              {lastInviteUrl && (
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#d4edda',
                  borderRadius: '4px',
                  marginBottom: '12px',
                  border: '1px solid #c3e6cb',
                }}>
                  <div style={{ fontSize: '11px', color: '#155724', marginBottom: '6px' }}>
                    Invite URL (share with user):
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                  }}>
                    <input
                      type="text"
                      readOnly
                      value={lastInviteUrl}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #c3e6cb',
                        borderRadius: '3px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        backgroundColor: 'white',
                      }}
                    />
                    <button
                      onClick={handleCopyInviteUrl}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold',
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {/* Pending Invites */}
              <div style={{ borderTop: '1px solid #dee2e6', paddingTop: '12px' }}>
                <div style={{ fontSize: '12px', color: '#495057', marginBottom: '8px' }}>
                  Pending Invites ({invites.length})
                </div>
                {invitesLoading ? (
                  <div style={{ fontSize: '12px', color: '#6c757d', padding: '8px 0' }}>Loading...</div>
                ) : invites.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#6c757d', padding: '8px 0' }}>No pending invites</div>
                ) : (
                  <div style={{
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}>
                    {invites.map((invite, idx) => {
                      const isExpired = new Date(invite.expires_at) < new Date();
                      return (
                        <div
                          key={invite.invite_id}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: isExpired ? '#f8f9fa' : 'white',
                            borderBottom: idx < invites.length - 1 ? '1px solid #dee2e6' : 'none',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 500, color: isExpired ? '#6c757d' : '#212529' }}>
                                {invite.email}
                              </div>
                              <div style={{ fontSize: '11px', color: '#6c757d' }}>
                                {invite.role} • {isExpired ? 'Expired' : `Expires ${new Date(invite.expires_at).toLocaleDateString()}`}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => handleResendInvite(invite.invite_id)}
                                disabled={resendingInvite === invite.invite_id}
                                style={{
                                  padding: '4px 6px',
                                  backgroundColor: resendingInvite === invite.invite_id ? '#adb5bd' : '#1971c2',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  cursor: resendingInvite === invite.invite_id ? 'not-allowed' : 'pointer',
                                  fontSize: '10px',
                                }}
                              >
                                {resendingInvite === invite.invite_id ? '...' : 'Resend'}
                              </button>
                              <button
                                onClick={() => handleRevokeInvite(invite.invite_id)}
                                disabled={revokingInvite === invite.invite_id}
                                style={{
                                  padding: '4px 6px',
                                  backgroundColor: revokingInvite === invite.invite_id ? '#adb5bd' : '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  cursor: revokingInvite === invite.invite_id ? 'not-allowed' : 'pointer',
                                  fontSize: '10px',
                                }}
                              >
                                {revokingInvite === invite.invite_id ? '...' : 'Revoke'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Assign Video */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#495057' }}>Assign Video</h4>
              <input
                type="text"
                value={videoIdToAssign}
                onChange={(e) => setVideoIdToAssign(e.target.value)}
                placeholder="Video ID (UUID)"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '13px',
                  marginBottom: '8px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleAssignVideo}
                disabled={assigningVideo || !videoIdToAssign.trim()}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: assigningVideo || !videoIdToAssign.trim() ? '#adb5bd' : '#1971c2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: assigningVideo || !videoIdToAssign.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                {assigningVideo ? 'Assigning...' : 'Assign to Org'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Count */}
      {!loading && !error && orgs.length > 0 && (
        <div style={{
          marginTop: '15px',
          color: '#6c757d',
          fontSize: '13px',
        }}>
          Total: {orgs.length} organization(s)
        </div>
      )}
    </div>
  );
}
