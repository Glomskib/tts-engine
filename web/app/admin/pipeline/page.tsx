'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import NotificationBadge from '../components/NotificationBadge';
import IncidentBanner from '../components/IncidentBanner';
import AdminNav from '../components/AdminNav';
import VideoDrawer from './components/VideoDrawer';
import AppLayout from '@/app/components/AppLayout';
// Board view components available but simplified approach used instead
// import BoardView from './components/BoardView';
// import type { BoardFilters } from './types';

interface QueueSummary {
  counts_by_status: Record<string, number>;
  total_queued: number;
}

interface ClaimedVideo {
  id: string;
  claimed_by: string;
  claimed_at: string;
  claim_expires_at: string;
}

interface VideoEvent {
  id: string;
  video_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  correlation_id: string;
  actor: string;
  created_at: string;
}

type SlaStatus = 'on_track' | 'due_soon' | 'overdue';

interface QueueVideo {
  id: string;
  variant_id: string;
  account_id: string;
  status: string;
  google_drive_url: string;
  created_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  claim_role: string | null;
  recording_status: string | null;
  last_status_changed_at: string | null;
  posted_url: string | null;
  posted_platform: string | null;
  script_locked_text: string | null;
  script_locked_version: number | null;
  concept_id: string | null;
  product_id: string | null;
  final_video_url?: string | null;
  // Computed fields from API
  can_move_next: boolean;
  blocked_reason: string | null;
  next_action: string;
  next_status: string | null;
  // Individual action flags
  can_record: boolean;
  can_mark_edited: boolean;
  can_mark_ready_to_post: boolean;
  can_mark_posted: boolean;
  required_fields: string[];
  // SLA fields
  sla_deadline_at: string | null;
  sla_status: SlaStatus;
  age_minutes_in_stage: number;
  priority_score: number;
  // Board view extended fields (optional)
  brand_name?: string;
  product_name?: string;
  product_sku?: string;
  account_name?: string;
}

interface AvailableScript {
  id: string;
  title: string | null;
  status: string;
  version: number;
  created_at: string;
  concept_id: string | null;
  product_id: string | null;
}

const RECORDING_STATUS_TABS = ['ALL', 'NOT_RECORDED', 'RECORDED', 'EDITED', 'READY_TO_POST', 'POSTED', 'REJECTED'] as const;
const CLAIM_ROLE_TABS = ['all', 'recorder', 'editor', 'uploader'] as const;
type ClaimRole = 'recorder' | 'editor' | 'uploader' | 'admin';

// VA Mode types
const VA_MODES = ['admin', 'recorder', 'editor', 'uploader'] as const;
type VAMode = typeof VA_MODES[number];

// localStorage keys
const VA_MODE_KEY = 'pipeline_va_mode';
const VIEW_MODE_KEY = 'pipeline_view_mode';
const SIMPLE_MODE_KEY = 'pipeline_simple_mode';

type ViewMode = 'table' | 'board';

// Auth user info type
interface AuthUser {
  id: string;
  email: string | null;
  role: 'admin' | 'recorder' | 'editor' | 'uploader' | null;
}

// Status badge color helper (matches detail page)
function getStatusBadgeColor(status: string | null): { bg: string; border: string; badge: string } {
  switch (status) {
    case 'NOT_RECORDED':
      return { bg: '#f8f9fa', border: '#dee2e6', badge: '#6c757d' };
    case 'RECORDED':
      return { bg: '#e7f5ff', border: '#74c0fc', badge: '#228be6' };
    case 'EDITED':
      return { bg: '#fff3bf', border: '#ffd43b', badge: '#fab005' };
    case 'READY_TO_POST':
      return { bg: '#d3f9d8', border: '#69db7c', badge: '#40c057' };
    case 'POSTED':
      return { bg: '#d0ebff', border: '#339af0', badge: '#1971c2' };
    case 'REJECTED':
      return { bg: '#ffe3e3', border: '#ff8787', badge: '#e03131' };
    default:
      return { bg: '#f8f9fa', border: '#dee2e6', badge: '#6c757d' };
  }
}

// SLA badge colors
function getSlaColor(status: SlaStatus): { bg: string; text: string; border: string } {
  switch (status) {
    case 'overdue':
      return { bg: '#ffe3e3', text: '#c92a2a', border: '#ffa8a8' };
    case 'due_soon':
      return { bg: '#fff3bf', text: '#e67700', border: '#ffd43b' };
    case 'on_track':
      return { bg: '#d3f9d8', text: '#2b8a3e', border: '#69db7c' };
    default:
      return { bg: '#f8f9fa', text: '#495057', border: '#dee2e6' };
  }
}

// ============================================================================
// 7-STEP PIPELINE MODEL (icons only for VA clarity)
// Idea/Script → Record → Edit → Approve → Post → Monitor → Remake
// ============================================================================
const PIPELINE_STEPS = [
  { key: 'script', icon: '📝', label: 'Script' },
  { key: 'record', icon: '🎬', label: 'Record' },
  { key: 'edit', icon: '✂️', label: 'Edit' },
  { key: 'approve', icon: '✅', label: 'Approve' },
  { key: 'post', icon: '🚀', label: 'Post' },
  { key: 'monitor', icon: '📊', label: 'Monitor' },
  { key: 'remake', icon: '♻️', label: 'Remake' },
] as const;

// Get current step index (0-6) for a video
function getCurrentStep(video: QueueVideo): number {
  const hasScript = !!video.script_locked_text;
  const status = video.recording_status || 'NOT_RECORDED';

  if (!hasScript) return 0; // Script step
  if (status === 'NOT_RECORDED') return 1; // Record step
  if (status === 'RECORDED') return 2; // Edit step
  if (status === 'EDITED') return 3; // Approve step
  if (status === 'READY_TO_POST') return 4; // Post step
  if (status === 'POSTED') return 5; // Monitor step
  if (status === 'REJECTED') return 6; // Remake step
  return 0;
}

// Role-based instruction banners
const ROLE_INSTRUCTIONS: Record<string, string> = {
  recorder: 'Click the blue button to mark recording done.',
  editor: 'Edit the video, then click Edit Done.',
  uploader: 'Post the video and paste the link.',
  admin: 'Monitor flow and resolve blockers.',
};

// ============================================================================
// PRIMARY ACTION LOGIC - Single source of truth for "what should VA do next"
// Colors: Script=Teal, Record=Blue, Edit=Purple, Approve=Green, Post=Orange
// ============================================================================
interface PrimaryAction {
  key: 'add_script' | 'lock_script' | 'record' | 'edit' | 'approve' | 'post' | 'done' | 'rejected';
  label: string;          // Verb-only label
  icon: string;           // Emoji icon
  color: string;          // Button background color
  requiredRole: 'recorder' | 'editor' | 'uploader' | 'admin' | null;
  disabled: boolean;
  disabledReason?: string;
  actionType: 'modal' | 'transition' | 'none';
  targetStatus?: string;
}

function getPrimaryAction(video: QueueVideo): PrimaryAction {
  const hasLockedScript = !!video.script_locked_text;
  const recordingStatus = video.recording_status || 'NOT_RECORDED';

  // Priority 1: Need script - TEAL
  if (!hasLockedScript) {
    return {
      key: 'add_script',
      label: 'Add Script',
      icon: '📝',
      color: '#0d9488', // Teal
      requiredRole: 'recorder',
      disabled: false,
      actionType: 'modal',
    };
  }

  // Priority 2: Not recorded yet - BLUE
  if (recordingStatus === 'NOT_RECORDED') {
    return {
      key: 'record',
      label: 'Record',
      icon: '🎬',
      color: '#2563eb', // Blue
      requiredRole: 'recorder',
      disabled: !video.can_record,
      disabledReason: video.can_record ? undefined : 'Script required',
      actionType: 'transition',
      targetStatus: 'RECORDED',
    };
  }

  // Priority 3: Recorded, needs editing - PURPLE
  if (recordingStatus === 'RECORDED') {
    return {
      key: 'edit',
      label: 'Edit Done',
      icon: '✂️',
      color: '#7c3aed', // Purple
      requiredRole: 'editor',
      disabled: !video.can_mark_edited,
      disabledReason: 'Recording required',
      actionType: 'transition',
      targetStatus: 'EDITED',
    };
  }

  // Priority 4: Edited, needs approval - GREEN
  if (recordingStatus === 'EDITED') {
    const canApprove = video.can_mark_ready_to_post;
    return {
      key: 'approve',
      label: 'Approve',
      icon: '✅',
      color: '#16a34a', // Green
      requiredRole: 'editor',
      disabled: !canApprove,
      disabledReason: canApprove ? undefined : 'Need video URL',
      actionType: 'transition',
      targetStatus: 'READY_TO_POST',
    };
  }

  // Priority 5: Ready to post - ORANGE
  if (recordingStatus === 'READY_TO_POST') {
    return {
      key: 'post',
      label: 'Post',
      icon: '🚀',
      color: '#ea580c', // Orange
      requiredRole: 'uploader',
      disabled: false,
      actionType: 'modal',
    };
  }

  // Priority 6: Already posted
  if (recordingStatus === 'POSTED') {
    return {
      key: 'done',
      label: 'Done',
      icon: '✓',
      color: '#40c057',
      requiredRole: null,
      disabled: true,
      actionType: 'none',
    };
  }

  // Priority 7: Rejected
  if (recordingStatus === 'REJECTED') {
    return {
      key: 'rejected',
      label: 'Rejected',
      icon: '⚠️',
      color: '#e03131',
      requiredRole: 'admin',
      disabled: true,
      actionType: 'none',
    };
  }

  // Fallback
  return {
    key: 'done',
    label: 'View',
    icon: '👁',
    color: '#6c757d',
    requiredRole: null,
    disabled: false,
    actionType: 'none',
  };
}

// Get compact next action badge text (icon + 1-3 words)
function getNextActionBadge(video: QueueVideo): { icon: string; text: string; color: string } {
  const action = getPrimaryAction(video);
  return {
    icon: action.icon,
    text: action.label,
    color: action.color,
  };
}

// Filter videos by role (for role-based views)
function filterVideosByRole(videos: QueueVideo[], role: 'recorder' | 'editor' | 'uploader' | 'admin'): QueueVideo[] {
  if (role === 'admin') return videos;

  return videos.filter(video => {
    const action = getPrimaryAction(video);
    return action.requiredRole === role || action.requiredRole === null;
  });
}

// Admin identifier - in a real app this would come from auth
const ADMIN_IDENTIFIER = 'admin';

// Main pipeline page component
export default function AdminPipelinePage() {
  const hydrated = useHydrated();
  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [queueSummary, setQueueSummary] = useState<QueueSummary | null>(null);
  const [claimedVideos, setClaimedVideos] = useState<ClaimedVideo[]>([]);
  const [recentEvents, setRecentEvents] = useState<VideoEvent[]>([]);
  const [queueVideos, setQueueVideos] = useState<QueueVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null);
  const [reclaiming, setReclaiming] = useState(false);
  const [reclaimMessage, setReclaimMessage] = useState<string | null>(null);
  const [videoIdFilter, setVideoIdFilter] = useState('');
  const [claimedByFilter, setClaimedByFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Recording status tab state
  const [activeRecordingTab, setActiveRecordingTab] = useState<typeof RECORDING_STATUS_TABS[number]>('ALL');
  const [claimedFilter, setClaimedFilter] = useState<'any' | 'unclaimed' | 'claimed'>('any');

  // Auth state
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Role-based filtering state
  const [activeRoleTab, setActiveRoleTab] = useState<typeof CLAIM_ROLE_TABS[number]>('all');
  const [myWorkOnly, setMyWorkOnly] = useState(false);

  // Derived: active user is the authenticated user's ID
  const activeUser = authUser?.id || '';

  // VA Mode state (Admin / Recorder / Editor / Uploader)
  const [vaMode, setVaMode] = useState<VAMode>('admin');

  // Per-row claim/release state
  const [claimingVideoId, setClaimingVideoId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<{ videoId: string; message: string } | null>(null);

  // Attach script modal state
  const [attachModalVideoId, setAttachModalVideoId] = useState<string | null>(null);
  const [attachModalVideo, setAttachModalVideo] = useState<QueueVideo | null>(null);
  const [availableScripts, setAvailableScripts] = useState<AvailableScript[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [selectedScriptId, setSelectedScriptId] = useState<string>('');
  const [attaching, setAttaching] = useState(false);
  const [attachMessage, setAttachMessage] = useState<string | null>(null);
  const [forceOverwrite, setForceOverwrite] = useState(false);

  // Post modal state (for READY_TO_POST -> POSTED)
  const [postModalVideoId, setPostModalVideoId] = useState<string | null>(null);
  const [postModalVideo, setPostModalVideo] = useState<QueueVideo | null>(null);
  const [postUrl, setPostUrl] = useState('');
  const [postPlatform, setPostPlatform] = useState('');
  const [posting, setPosting] = useState(false);
  const [postMessage, setPostMessage] = useState<string | null>(null);

  // Handoff modal state
  const [handoffModalVideoId, setHandoffModalVideoId] = useState<string | null>(null);
  const [handoffModalVideo, setHandoffModalVideo] = useState<QueueVideo | null>(null);
  const [handoffToUser, setHandoffToUser] = useState('');
  const [handoffToRole, setHandoffToRole] = useState<ClaimRole | ''>('');
  const [handoffNotes, setHandoffNotes] = useState('');
  const [handingOff, setHandingOff] = useState(false);
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);

  // Execution action state (for quick transitions)
  const [executingVideoId, setExecutingVideoId] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<{ videoId: string; message: string } | null>(null);
  // More menu state (which video's menu is open)
  const [openMenuVideoId, setOpenMenuVideoId] = useState<string | null>(null);

  // View mode state (simple vs advanced) - simple is default for VA usability
  const [simpleView, setSimpleView] = useState(true);

  // Drawer state - which video is open in the details drawer
  const [drawerVideo, setDrawerVideo] = useState<QueueVideo | null>(null);


  // Reference data for filters
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; brand: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);


  // Fetch authenticated user on mount
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          // Redirect to login if not authenticated
          router.push('/login?redirect=/admin/pipeline');
          return;
        }

        // Fetch user role from API
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        setAuthUser({
          id: user.id,
          email: user.email || null,
          role: roleData.role || null,
        });

        // Set VA mode based on user's actual role (non-admins can't select admin mode)
        const userRole = roleData.role as AuthUser['role'];
        if (userRole && userRole !== 'admin') {
          // Lock to user's role for non-admins
          setVaMode(userRole);
        } else {
          // Admins can use saved preference
          const savedMode = localStorage.getItem(VA_MODE_KEY);
          if (savedMode && VA_MODES.includes(savedMode as VAMode)) {
            setVaMode(savedMode as VAMode);
          }
        }

        // Load simple view preference from localStorage (default to true for VA usability)
        const savedSimpleView = localStorage.getItem(SIMPLE_MODE_KEY);
        if (savedSimpleView === 'false') {
          setSimpleView(false);
        }
      } catch (err) {
        console.error('Failed to fetch auth user:', err);
        router.push('/login?redirect=/admin/pipeline');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch reference data (brands, products, accounts) for filters
  useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        const [productsRes, accountsRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/accounts'),
        ]);
        const [productsData, accountsData] = await Promise.all([
          productsRes.json(),
          accountsRes.json(),
        ]);

        if (productsData.ok && productsData.data) {
          setProducts(productsData.data.map((p: { id: string; name: string; brand: string }) => ({
            id: p.id,
            name: p.name,
            brand: p.brand,
          })));
          // Extract unique brands
          const uniqueBrands = Array.from(new Set(productsData.data.map((p: { brand: string }) => p.brand))) as string[];
          setBrands(uniqueBrands.map(b => ({ id: b, name: b })));
        }
        if (accountsData.ok && accountsData.data) {
          setAccounts(accountsData.data.map((a: { id: string; name: string }) => ({
            id: a.id,
            name: a.name,
          })));
        }
      } catch (err) {
        console.error('Failed to fetch reference data:', err);
      }
    };

    fetchReferenceData();
  }, []);


  // Save VA mode to localStorage (admins only can switch freely)
  const updateVaMode = (mode: VAMode) => {
    // Non-admins cannot switch to admin mode
    if (mode === 'admin' && authUser?.role !== 'admin') {
      return;
    }
    setVaMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(VA_MODE_KEY, mode);
    }
    // Auto-set role tab to match VA mode (except admin which shows all)
    if (mode !== 'admin') {
      setActiveRoleTab(mode);
    }
  };

  // Toggle simple/advanced view
  const toggleSimpleView = () => {
    const newValue = !simpleView;
    setSimpleView(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SIMPLE_MODE_KEY, String(newValue));
    }
  };

  // Get videos filtered by current role mode
  const getRoleFilteredVideos = (): QueueVideo[] => {
    if (vaMode === 'admin') return queueVideos;
    return filterVideosByRole(queueVideos, vaMode);
  };

  // Handle primary action click (auto-assigns if video is available)
  const handlePrimaryActionClick = async (video: QueueVideo) => {
    const action = getPrimaryAction(video);
    if (action.disabled) return;

    // Auto-assign if video is available (not assigned to anyone)
    const unclaimed = isUnclaimed(video);
    if (unclaimed && action.actionType !== 'none') {
      await claimVideo(video.id);
    }

    switch (action.actionType) {
      case 'modal':
        if (action.key === 'add_script') {
          openAttachModal(video);
        } else if (action.key === 'post') {
          openPostModal(video);
        }
        break;
      case 'transition':
        if (action.targetStatus) {
          await executeTransition(video.id, action.targetStatus);
        }
        break;
      default:
        break;
    }
  };

  // Get product/account info for display
  const getVideoMetaBadges = (video: QueueVideo) => {
    const product = products.find(p => p.id === video.product_id);
    const account = accounts.find(a => a.id === video.account_id);
    return {
      brand: product?.brand || '—',
      sku: product?.name?.slice(0, 12) || video.product_id?.slice(0, 8) || '—',
      account: account?.name || '—',
    };
  };

  // Check if user is an admin
  const isUserAdmin = authUser?.role === 'admin';

  // Helper to check if current VA mode is admin
  const isAdminMode = vaMode === 'admin';

  const checkAdminEnabled = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/enabled');
      const data = await res.json();
      setAdminEnabled(data.enabled === true);
    } catch {
      setAdminEnabled(false);
    }
  }, []);

  const fetchQueueVideos = useCallback(async () => {
    setQueueLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeRecordingTab !== 'ALL') {
        params.set('recording_status', activeRecordingTab);
      }
      params.set('claimed', claimedFilter);
      params.set('limit', '100');

      // Add "My Work" filter
      if (myWorkOnly && activeUser) {
        params.set('claimed_by', activeUser);
        params.set('claimed', 'claimed'); // My Work implies claimed
      }

      // Lane-based filtering (role tabs now represent work lanes, not claim_role)
      // These set recording_status filters to show recommended work for each role
      if (activeRoleTab !== 'all' && activeRecordingTab === 'ALL') {
        // Only apply lane filter if not already filtering by recording_status
        if (activeRoleTab === 'recorder') {
          params.set('recording_status', 'NOT_RECORDED');
        } else if (activeRoleTab === 'editor') {
          params.set('recording_status', 'RECORDED');
        } else if (activeRoleTab === 'uploader') {
          params.set('recording_status', 'READY_TO_POST');
        }
      }

      const res = await fetch(`/api/videos/queue?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        let videos = data.data || [];

        // Client-side filtering for lane-specific conditions
        if (activeRoleTab === 'recorder') {
          // Recorder lane: must have script and can_record
          videos = videos.filter((v: QueueVideo) => v.script_locked_text && v.can_record);
        } else if (activeRoleTab === 'editor') {
          // Editor lane: can_mark_edited or recording_status=RECORDED
          videos = videos.filter((v: QueueVideo) => v.can_mark_edited || v.recording_status === 'RECORDED');
        } else if (activeRoleTab === 'uploader') {
          // Uploader lane: can_mark_posted or recording_status=READY_TO_POST
          videos = videos.filter((v: QueueVideo) => v.can_mark_posted || v.recording_status === 'READY_TO_POST');
        }

        setQueueVideos(videos);
      }
    } catch (err) {
      console.error('Failed to fetch queue videos:', err);
    } finally {
      setQueueLoading(false);
    }
  }, [activeRecordingTab, claimedFilter, activeRoleTab, myWorkOnly, activeUser]);

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, claimedRes, eventsRes] = await Promise.all([
        fetch('/api/observability/queue-summary'),
        fetch('/api/observability/claimed'),
        fetch('/api/observability/recent-events'),
      ]);

      const [summaryData, claimedData, eventsData] = await Promise.all([
        summaryRes.json(),
        claimedRes.json(),
        eventsRes.json(),
      ]);

      if (summaryData.ok) setQueueSummary(summaryData.data);
      if (claimedData.ok) setClaimedVideos(claimedData.data || []);
      if (eventsData.ok) setRecentEvents(eventsData.data || []);

      setLastRefresh(new Date());
      setError('');
    } catch (err) {
      setError('Failed to fetch observability data');
    } finally {
      setLoading(false);
    }
  }, []);

  const releaseStale = useCallback(async () => {
    setReleasing(true);
    setReleaseMessage(null);
    try {
      const res = await fetch('/api/videos/release-stale', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setReleaseMessage(`Released ${data.released_count} stale claim(s)`);
        fetchData();
        fetchQueueVideos();
      } else {
        setReleaseMessage(`Error: ${data.message || 'Failed to release'}`);
      }
    } catch (err) {
      setReleaseMessage('Error: Failed to release stale claims');
    } finally {
      setReleasing(false);
    }
  }, [fetchData, fetchQueueVideos]);

  const reclaimExpired = useCallback(async () => {
    setReclaiming(true);
    setReclaimMessage(null);
    try {
      const res = await fetch('/api/videos/reclaim-expired', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setReclaimMessage(`Reclaimed ${data.reclaimed_count} expired assignment(s)`);
        fetchData();
        fetchQueueVideos();
      } else {
        setReclaimMessage(`Error: ${data.error || 'Failed to reclaim'}`);
      }
    } catch (err) {
      setReclaimMessage('Error: Failed to reclaim expired assignments');
    } finally {
      setReclaiming(false);
    }
  }, [fetchData, fetchQueueVideos]);

  // Claim a video with role
  const claimVideo = async (videoId: string, role?: ClaimRole) => {
    setClaimingVideoId(videoId);
    setClaimError(null);
    try {
      // Determine claim_role: use provided role, or infer from activeRoleTab, or default to 'admin'
      const claimRole: ClaimRole = role || (activeRoleTab !== 'all' ? activeRoleTab : 'admin');

      // Auth is handled server-side via session - claim_role tells the server what role to record
      const res = await fetch(`/api/videos/${videoId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_role: claimRole }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchQueueVideos();
        fetchData();
      } else if (data.code === 'ALREADY_CLAIMED') {
        setClaimError({
          videoId,
          message: `Already claimed by ${data.details?.claimed_by || 'someone else'}`,
        });
        // Refresh to show current state
        fetchQueueVideos();
      } else {
        setClaimError({ videoId, message: data.error || 'Failed to claim' });
      }
    } catch (err) {
      setClaimError({ videoId, message: 'Network error' });
    } finally {
      setClaimingVideoId(null);
    }
  };

  // Release a video
  const releaseVideo = async (videoId: string) => {
    setClaimingVideoId(videoId);
    setClaimError(null);
    try {
      // Auth is handled server-side via session
      const res = await fetch(`/api/videos/${videoId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        fetchQueueVideos();
        fetchData();
      } else {
        setClaimError({ videoId, message: data.error || 'Failed to release' });
      }
    } catch (err) {
      setClaimError({ videoId, message: 'Network error' });
    } finally {
      setClaimingVideoId(null);
    }
  };

  // Fetch available scripts for attach modal
  const fetchAvailableScripts = useCallback(async (video: QueueVideo) => {
    setScriptsLoading(true);
    try {
      const res = await fetch('/api/scripts?status=APPROVED');
      const data = await res.json();
      if (data.ok && data.data) {
        const scripts = data.data as AvailableScript[];
        setAvailableScripts(scripts);

        // Auto-select best script
        // Priority: 1) Most recent APPROVED matching concept_id, 2) Most recent APPROVED matching product_id, 3) Most recent APPROVED overall
        let bestScript: AvailableScript | null = null;

        if (video.concept_id) {
          bestScript = scripts.find(s => s.concept_id === video.concept_id) || null;
        }
        if (!bestScript && video.product_id) {
          bestScript = scripts.find(s => s.product_id === video.product_id) || null;
        }
        if (!bestScript && scripts.length > 0) {
          // Most recent (already sorted by created_at desc from API)
          bestScript = scripts[0];
        }

        if (bestScript) {
          setSelectedScriptId(bestScript.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch scripts:', err);
    } finally {
      setScriptsLoading(false);
    }
  }, []);

  // Open attach script modal
  const openAttachModal = (video: QueueVideo) => {
    setAttachModalVideoId(video.id);
    setAttachModalVideo(video);
    setAttachMessage(null);
    setForceOverwrite(false);
    setSelectedScriptId('');
    fetchAvailableScripts(video);
  };

  // Close attach script modal
  const closeAttachModal = () => {
    setAttachModalVideoId(null);
    setAttachModalVideo(null);
    setSelectedScriptId('');
    setAttachMessage(null);
    setForceOverwrite(false);
  };

  // Attach script to video
  const attachScript = async () => {
    if (!selectedScriptId || !attachModalVideoId) return;
    setAttaching(true);
    setAttachMessage(null);
    try {
      const payload: { script_id: string; force?: boolean } = { script_id: selectedScriptId };
      if (forceOverwrite) {
        payload.force = true;
      }
      const res = await fetch(`/api/videos/${attachModalVideoId}/attach-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setAttachMessage('Script attached successfully!');
        // Refresh queue to show updated blocker status
        fetchQueueVideos();
        // Close modal after short delay
        setTimeout(() => {
          closeAttachModal();
        }, 1500);
      } else if (data.code === 'SCRIPT_ALREADY_LOCKED') {
        setAttachMessage('This video already has a locked script. Check "Overwrite existing" to replace it.');
      } else if (data.code === 'SCRIPT_NOT_APPROVED') {
        setAttachMessage(`Script is not approved (status: ${data.details?.status || 'unknown'}). Check "Force attach" to attach anyway.`);
      } else {
        setAttachMessage(`Error: ${data.error || 'Failed to attach script'}`);
      }
    } catch (err) {
      setAttachMessage('Error: Failed to attach script');
    } finally {
      setAttaching(false);
    }
  };

  // Quick execution transition (for record, edit, ready_to_post)
  const executeTransition = async (videoId: string, targetStatus: string) => {
    setExecutingVideoId(videoId);
    setExecutionError(null);
    try {
      // Auth is handled server-side via session
      const res = await fetch(`/api/videos/${videoId}/execution`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_status: targetStatus }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchQueueVideos();
      } else {
        setExecutionError({ videoId, message: data.error || 'Failed to update status' });
      }
    } catch (err) {
      setExecutionError({ videoId, message: 'Network error' });
    } finally {
      setExecutingVideoId(null);
    }
  };

  // Open post modal
  const openPostModal = (video: QueueVideo) => {
    setPostModalVideoId(video.id);
    setPostModalVideo(video);
    setPostUrl(video.posted_url || '');
    setPostPlatform(video.posted_platform || '');
    setPostMessage(null);
  };

  // Close post modal
  const closePostModal = () => {
    setPostModalVideoId(null);
    setPostModalVideo(null);
    setPostUrl('');
    setPostPlatform('');
    setPostMessage(null);
  };

  // Submit post (READY_TO_POST -> POSTED)
  const submitPost = async () => {
    if (!postModalVideoId || !postUrl.trim() || !postPlatform) return;
    setPosting(true);
    setPostMessage(null);
    try {
      // Auth is handled server-side via session
      const res = await fetch(`/api/videos/${postModalVideoId}/execution`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_status: 'POSTED',
          posted_url: postUrl.trim(),
          posted_platform: postPlatform,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setPostMessage('Marked as posted!');
        fetchQueueVideos();
        setTimeout(() => {
          closePostModal();
        }, 1500);
      } else {
        setPostMessage(`Error: ${data.error || 'Failed to mark as posted'}`);
      }
    } catch (err) {
      setPostMessage('Error: Network error');
    } finally {
      setPosting(false);
    }
  };

  // Open drawer for a video
  const openDrawer = (video: QueueVideo) => {
    setDrawerVideo(video);
    setOpenMenuVideoId(null); // Close any open menu
  };

  // Close drawer
  const closeDrawer = () => {
    setDrawerVideo(null);
  };

  // Handle row click to open drawer (exclude buttons and inputs)
  const handleRowClick = (e: React.MouseEvent, video: QueueVideo) => {
    const target = e.target as HTMLElement;
    // Don't open drawer if clicking on buttons, links, inputs, or within the more menu
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('[data-menu]')
    ) {
      return;
    }
    openDrawer(video);
  };

  // Open handoff modal
  const openHandoffModal = (video: QueueVideo) => {
    setHandoffModalVideoId(video.id);
    setHandoffModalVideo(video);
    setHandoffToUser('');
    setHandoffToRole('');
    setHandoffNotes('');
    setHandoffMessage(null);
  };

  // Close handoff modal
  const closeHandoffModal = () => {
    setHandoffModalVideoId(null);
    setHandoffModalVideo(null);
    setHandoffToUser('');
    setHandoffToRole('');
    setHandoffNotes('');
    setHandoffMessage(null);
  };

  // Submit handoff
  const submitHandoff = async () => {
    if (!handoffModalVideoId || !handoffToUser.trim() || !handoffToRole) return;
    setHandingOff(true);
    setHandoffMessage(null);
    try {
      // Auth is handled server-side via session - from_user is derived from auth
      const res = await fetch(`/api/videos/${handoffModalVideoId}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_user: handoffToUser.trim(),
          to_role: handoffToRole,
          notes: handoffNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setHandoffMessage('Handoff successful!');
        fetchQueueVideos();
        fetchData();
        setTimeout(() => {
          closeHandoffModal();
        }, 1500);
      } else {
        setHandoffMessage(`Error: ${data.error || 'Failed to handoff'}`);
      }
    } catch (err) {
      setHandoffMessage('Error: Network error');
    } finally {
      setHandingOff(false);
    }
  };

  useEffect(() => {
    checkAdminEnabled();
  }, [checkAdminEnabled]);

  useEffect(() => {
    if (adminEnabled === true) {
      fetchData();
      fetchQueueVideos();
      const interval = setInterval(() => {
        fetchData();
        fetchQueueVideos();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [adminEnabled, fetchData, fetchQueueVideos]);

  // Refetch queue when tab or claimed filter changes
  useEffect(() => {
    if (adminEnabled === true) {
      fetchQueueVideos();
    }
  }, [activeRecordingTab, claimedFilter, activeRoleTab, myWorkOnly, activeUser, adminEnabled, fetchQueueVideos]);

  if (adminEnabled === null || authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!authUser) {
    return <div style={{ padding: '20px' }}>Redirecting to login...</div>;
  }

  if (adminEnabled === false) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>404 - Not Found</h1>
        <p>This page is not available.</p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading observability data...</div>;
  }

  // Use hydration-safe time display
  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '20px' };
  const thStyle = { border: '1px solid #ccc', padding: '8px', textAlign: 'left' as const, backgroundColor: '#f5f5f5' };
  const tdStyle = { border: '1px solid #ccc', padding: '8px' };
  const inputStyle = { padding: '6px 10px', marginRight: '10px', border: '1px solid #ccc', borderRadius: '4px' };
  const selectStyle = { padding: '6px 10px', marginRight: '10px', border: '1px solid #ccc', borderRadius: '4px' };

  // Get distinct event types for dropdown
  const eventTypes = Array.from(new Set(recentEvents.map(e => e.event_type))).sort();

  // Apply filters
  const filteredClaimedVideos = claimedVideos.filter(video => {
    const matchesVideoId = !videoIdFilter || video.id.toLowerCase().includes(videoIdFilter.toLowerCase());
    const matchesClaimedBy = !claimedByFilter || video.claimed_by.toLowerCase().includes(claimedByFilter.toLowerCase());
    return matchesVideoId && matchesClaimedBy;
  });

  const filteredEvents = recentEvents.filter(event => {
    const matchesVideoId = !videoIdFilter || event.video_id.toLowerCase().includes(videoIdFilter.toLowerCase());
    const matchesEventType = !eventTypeFilter || event.event_type === eventTypeFilter;
    const matchesActor = !claimedByFilter || event.actor.toLowerCase().includes(claimedByFilter.toLowerCase());
    return matchesVideoId && matchesEventType && matchesActor;
  });

  const hasActiveFilters = videoIdFilter || claimedByFilter || eventTypeFilter;

  const clearFilters = () => {
    setVideoIdFilter('');
    setClaimedByFilter('');
    setEventTypeFilter('');
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(label);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyableCellStyle = {
    ...tdStyle,
    fontFamily: 'monospace',
    fontSize: '12px',
    cursor: 'pointer',
    position: 'relative' as const,
  };

  // Check if a video is claimed by current user
  const isClaimedByMe = (video: QueueVideo) => video.claimed_by === activeUser;

  // Check if a video is claimed by someone else (and not expired)
  const isClaimedByOther = (video: QueueVideo) => {
    if (!video.claimed_by || video.claimed_by === activeUser) return false;
    if (!video.claim_expires_at) return true;
    return new Date(video.claim_expires_at) > new Date();
  };

  // Check if video is unclaimed
  const isUnclaimed = (video: QueueVideo) => {
    if (!video.claimed_by) return true;
    if (!video.claim_expires_at) return false;
    return new Date(video.claim_expires_at) <= new Date();
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Incident Mode Banner */}
      <IncidentBanner />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>
          {isAdminMode ? 'Admin: Video Pipeline' : `${vaMode.charAt(0).toUpperCase() + vaMode.slice(1)} Dashboard`}
        </h1>
        <div>
          <button onClick={() => { fetchData(); fetchQueueVideos(); }} style={{ padding: '8px 16px', marginRight: '10px' }}>
            Refresh
          </button>
          {/* Release stale claims - Admin only */}
          {isAdminMode && (
            <button
              onClick={releaseStale}
              disabled={releasing}
              style={{ padding: '8px 16px', marginRight: '10px', backgroundColor: '#f0ad4e', border: '1px solid #eea236' }}
            >
              {releasing ? 'Releasing...' : 'Release stale claims'}
            </button>
          )}
          {/* Reclaim expired assignments - Admin only */}
          {isAdminMode && (
            <button
              onClick={reclaimExpired}
              disabled={reclaiming}
              style={{ padding: '8px 16px', marginRight: '10px', backgroundColor: '#17a2b8', color: 'white', border: '1px solid #138496' }}
            >
              {reclaiming ? 'Reclaiming...' : 'Reclaim expired'}
            </button>
          )}
          {lastRefresh && (
            <span style={{ color: '#666', fontSize: '14px' }}>
              Last updated: {hydrated ? lastRefresh.toLocaleString() : formatDateString(lastRefresh.toISOString())}
            </span>
          )}
        </div>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</div>}
      {releaseMessage && (
        <div style={{ color: releaseMessage.startsWith('Error') ? 'red' : 'green', marginBottom: '20px' }}>
          {releaseMessage}
        </div>
      )}
      {reclaimMessage && (
        <div style={{ color: reclaimMessage.startsWith('Error') ? 'red' : 'green', marginBottom: '20px' }}>
          {reclaimMessage}
        </div>
      )}

      {/* Simple/Advanced View Toggle */}
      <div style={{
        marginBottom: '20px',
        padding: '12px 16px',
        backgroundColor: '#e7f5ff',
        borderRadius: '8px',
        border: '1px solid #74c0fc',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap',
      }}>
        {/* Simple/Advanced Toggle */}
        <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #74c0fc' }}>
          <button
            onClick={() => setSimpleView(true)}
            style={{
              padding: '8px 16px',
              border: 'none',
              backgroundColor: simpleView ? '#228be6' : 'white',
              color: simpleView ? 'white' : '#228be6',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: simpleView ? 'bold' : 'normal',
            }}
          >
            ✨ Simple
          </button>
          <button
            onClick={() => setSimpleView(false)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderLeft: '1px solid #74c0fc',
              backgroundColor: !simpleView ? '#228be6' : 'white',
              color: !simpleView ? 'white' : '#228be6',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: !simpleView ? 'bold' : 'normal',
            }}
          >
            ⚙️ Advanced
          </button>
        </div>

        {/* Quick Stats */}
        {queueSummary && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#495057' }}>
              <strong>{getRoleFilteredVideos().length}</strong> items
              {vaMode !== 'admin' && ` for ${vaMode}`}
            </span>
            {queueSummary.counts_by_status['READY_TO_POST'] > 0 && (
              <span style={{
                padding: '4px 10px',
                backgroundColor: '#40c057',
                color: 'white',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 'bold',
              }}>
                {queueSummary.counts_by_status['READY_TO_POST']} ready
              </span>
            )}
          </div>
        )}

        {/* Role indicator */}
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#868e96' }}>
          {simpleView ? 'Showing essential columns' : 'Showing all columns'}
        </div>
      </div>

      {/* Queue Summary - Advanced view only */}
      {!simpleView && (
        <section style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
          <h2 style={{ marginTop: 0 }}>Queue Summary</h2>
          {queueSummary ? (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: '18px' }}>
                <strong>Total Queued:</strong> {queueSummary.total_queued}
              </div>
              {Object.entries(queueSummary.counts_by_status).map(([status, count]) => (
                <div key={status} style={{ padding: '4px 10px', backgroundColor: '#e9ecef', borderRadius: '4px', fontSize: '14px' }}>
                  {status.replace(/_/g, ' ')}: <strong>{count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p>No data available</p>
          )}
        </section>
      )}

      {/* Video Queue with Recording Status Tabs */}
      <section style={{ marginBottom: '30px' }}>
        <h2>Video Queue</h2>

        {/* VA Mode + Authenticated User Display */}
        <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '15px', padding: '10px', backgroundColor: '#e7f5ff', borderRadius: '4px', border: '1px solid #74c0fc', flexWrap: 'wrap' }}>
          {/* VA Mode Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Mode:</span>
            <select
              value={vaMode}
              onChange={(e) => updateVaMode(e.target.value as VAMode)}
              disabled={!isUserAdmin}
              style={{
                padding: '4px 12px',
                borderRadius: '4px',
                border: '1px solid #74c0fc',
                fontWeight: 'bold',
                color: vaMode === 'admin' ? '#e03131' : vaMode === 'recorder' ? '#228be6' : vaMode === 'editor' ? '#fab005' : '#40c057',
                backgroundColor: isUserAdmin ? '#fff' : '#f0f0f0',
                fontSize: '14px',
                textTransform: 'capitalize',
                cursor: isUserAdmin ? 'pointer' : 'not-allowed',
              }}
            >
              {VA_MODES.filter(mode => isUserAdmin || mode === authUser?.role).map(mode => (
                <option key={mode} value={mode}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</option>
              ))}
            </select>
            {vaMode !== 'admin' && (
              <span style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                (Safe mode - force actions hidden)
              </span>
            )}
            {!isUserAdmin && (
              <span style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                (Locked to your role)
              </span>
            )}
          </div>

          <span style={{ color: '#ccc' }}>|</span>

          {/* Authenticated User Display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Signed in as:</span>
            <span style={{
              padding: '4px 12px',
              backgroundColor: '#fff',
              borderRadius: '4px',
              border: '1px solid #74c0fc',
              fontWeight: 'bold',
              color: '#1971c2',
              fontSize: '13px',
            }}>
              {authUser?.email || authUser?.id.slice(0, 8) || 'Loading...'}
            </span>
            {authUser?.role && (
              <span style={{
                padding: '3px 8px',
                backgroundColor: authUser.role === 'admin' ? '#ffe3e3' : '#d3f9d8',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 'bold',
                textTransform: 'capitalize',
                color: authUser.role === 'admin' ? '#e03131' : '#40c057',
              }}>
                {authUser.role}
              </span>
            )}
            <button
              onClick={async () => {
                const supabase = createBrowserSupabaseClient();
                await supabase.auth.signOut();
                router.push('/login');
              }}
              style={{
                padding: '4px 10px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Sign Out
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginLeft: 'auto' }}>
            <input
              type="checkbox"
              checked={myWorkOnly}
              onChange={(e) => setMyWorkOnly(e.target.checked)}
            />
            <span style={{ fontSize: '14px', fontWeight: myWorkOnly ? 'bold' : 'normal', color: myWorkOnly ? '#1971c2' : '#333' }}>
              My Work Only
            </span>
          </label>
        </div>

        {/* Admin Navigation */}
        <AdminNav
          isAdmin={isUserAdmin}
          showNotificationBadge={<NotificationBadge />}
        />

        {/* Recording Status Tabs */}
        <div style={{ marginBottom: '15px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {RECORDING_STATUS_TABS.map(tab => {
            const colors = tab === 'ALL' ? { bg: '#f8f9fa', badge: '#495057' } : getStatusBadgeColor(tab);
            const isActive = activeRecordingTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveRecordingTab(tab)}
                style={{
                  padding: '8px 16px',
                  border: isActive ? `2px solid ${colors.badge}` : '1px solid #dee2e6',
                  borderRadius: '4px',
                  backgroundColor: isActive ? colors.badge : '#fff',
                  color: isActive ? '#fff' : colors.badge,
                  cursor: 'pointer',
                  fontWeight: isActive ? 'bold' : 'normal',
                  fontSize: '13px',
                }}
              >
                {tab.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>

        {/* Role Tabs */}
        <div style={{ marginBottom: '15px', display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold', fontSize: '14px', marginRight: '8px' }}>Role:</span>
          {CLAIM_ROLE_TABS.map(role => {
            const isActive = activeRoleTab === role;
            const roleColors: Record<string, string> = {
              all: '#495057',
              recorder: '#228be6',
              editor: '#fab005',
              uploader: '#40c057',
            };
            return (
              <button
                key={role}
                onClick={() => setActiveRoleTab(role)}
                style={{
                  padding: '6px 14px',
                  border: isActive ? `2px solid ${roleColors[role]}` : '1px solid #dee2e6',
                  borderRadius: '4px',
                  backgroundColor: isActive ? roleColors[role] : '#fff',
                  color: isActive ? '#fff' : roleColors[role],
                  cursor: 'pointer',
                  fontWeight: isActive ? 'bold' : 'normal',
                  fontSize: '13px',
                  textTransform: 'capitalize',
                }}
              >
                {role}
              </button>
            );
          })}
        </div>

        {/* Assignment filter */}
        <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Assignment:</span>
          {(['any', 'unclaimed', 'claimed'] as const).map(filter => {
            // User-friendly labels
            const label = filter === 'any' ? 'All' : filter === 'unclaimed' ? 'Available' : 'In Progress';
            return (
            <label key={filter} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="claimedFilter"
                checked={claimedFilter === filter}
                onChange={() => setClaimedFilter(filter)}
                disabled={myWorkOnly} // Disable when My Work is active
              />
              <span style={{ fontSize: '14px', color: myWorkOnly ? '#999' : '#333' }}>{label}</span>
            </label>
          );})}
          {queueLoading && <span style={{ color: '#666', fontSize: '12px', marginLeft: '10px' }}>Loading...</span>}
        </div>

        {/* Role Instruction Banner - context-aware help for VAs */}
        {vaMode !== 'admin' && ROLE_INSTRUCTIONS[vaMode] && (
          <div style={{
            marginBottom: '15px',
            padding: '12px 16px',
            backgroundColor: vaMode === 'recorder' ? '#dbeafe' : vaMode === 'editor' ? '#ede9fe' : '#dcfce7',
            borderRadius: '8px',
            border: `1px solid ${vaMode === 'recorder' ? '#93c5fd' : vaMode === 'editor' ? '#c4b5fd' : '#86efac'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <span style={{ fontSize: '20px' }}>
              {vaMode === 'recorder' ? '🎬' : vaMode === 'editor' ? '✂️' : '🚀'}
            </span>
            <span style={{
              fontSize: '14px',
              fontWeight: '500',
              color: vaMode === 'recorder' ? '#1e40af' : vaMode === 'editor' ? '#5b21b6' : '#166534',
            }}>
              {ROLE_INSTRUCTIONS[vaMode]}
            </span>
          </div>
        )}

        {/* Queue Table - Simple or Advanced View */}
        {getRoleFilteredVideos().length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>SLA</th>
                <th style={thStyle}>Video</th>
                <th style={thStyle}>Step</th>
                {!simpleView && <th style={thStyle}>Status</th>}
                <th style={thStyle}>Brand / SKU</th>
                {!simpleView && <th style={thStyle}>Account</th>}
                {!simpleView && <th style={thStyle}>Next</th>}
                {!simpleView && <th style={thStyle}>Last Changed</th>}
                {!simpleView && <th style={thStyle}>Script</th>}
                {!simpleView && <th style={thStyle}>Assigned</th>}
                <th style={thStyle}>Action</th>
                <th style={thStyle}>⋯</th>
              </tr>
            </thead>
            <tbody>
              {getRoleFilteredVideos().map((video) => {
                const statusColors = getStatusBadgeColor(video.recording_status);
                const slaColors = getSlaColor(video.sla_status);
                const claimedByOther = isClaimedByOther(video);
                const claimedByMe = isClaimedByMe(video);
                const unclaimed = isUnclaimed(video);
                const isProcessing = claimingVideoId === video.id;
                const hasError = claimError?.videoId === video.id;
                const primaryAction = getPrimaryAction(video);
                const metaBadges = getVideoMetaBadges(video);
                const isExecuting = executingVideoId === video.id;
                const moreMenuOpen = openMenuVideoId === video.id;
                const toggleMoreMenu = () => setOpenMenuVideoId(moreMenuOpen ? null : video.id);
                const closeMoreMenu = () => setOpenMenuVideoId(null);

                return (
                  <tr
                    key={video.id}
                    onClick={(e) => handleRowClick(e, video)}
                    style={{
                      backgroundColor: claimedByMe ? '#e8f5e9' : claimedByOther ? '#fff3e0' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {/* SLA Badge - Compact */}
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block',
                        padding: simpleView ? '3px 6px' : '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: slaColors.bg,
                        color: slaColors.text,
                        border: `1px solid ${slaColors.border}`,
                        fontSize: simpleView ? '9px' : '10px',
                        fontWeight: 'bold',
                      }}>
                        {simpleView ? (video.sla_status === 'overdue' ? '!' : video.sla_status === 'due_soon' ? '~' : '✓') :
                         (video.sla_status === 'overdue' ? 'OVERDUE' : video.sla_status === 'due_soon' ? 'DUE' : 'OK')}
                      </span>
                    </td>
                    {/* Video ID */}
                    <td style={{...tdStyle, fontFamily: 'monospace', fontSize: '11px'}}>
                      {video.id.slice(0, 8)}
                    </td>
                    {/* Step Indicator - 7-step progress */}
                    <td style={tdStyle}>
                      {(() => {
                        const currentStep = getCurrentStep(video);
                        return (
                          <div style={{
                            display: 'flex',
                            gap: simpleView ? '2px' : '3px',
                            alignItems: 'center',
                          }}>
                            {PIPELINE_STEPS.slice(0, 5).map((step, idx) => (
                              <span
                                key={step.key}
                                title={step.label}
                                style={{
                                  fontSize: simpleView ? '12px' : '14px',
                                  opacity: idx < currentStep ? 1 : idx === currentStep ? 1 : 0.25,
                                  filter: idx < currentStep ? 'grayscale(50%)' : 'none',
                                  transform: idx === currentStep ? 'scale(1.2)' : 'scale(1)',
                                }}
                              >
                                {step.icon}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    {/* Status - Advanced only */}
                    {!simpleView && (
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          backgroundColor: statusColors.badge,
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: 'bold',
                        }}>
                          {(video.recording_status || 'NOT_RECORDED').replace(/_/g, ' ')}
                        </span>
                      </td>
                    )}
                    {/* Brand / SKU badges */}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '2px 6px',
                          backgroundColor: '#e7f5ff',
                          borderRadius: '3px',
                          fontSize: '10px',
                          color: '#1971c2',
                          maxWidth: '60px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }} title={metaBadges.brand}>
                          {metaBadges.brand}
                        </span>
                        <span style={{
                          padding: '2px 6px',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '3px',
                          fontSize: '10px',
                          color: '#495057',
                          maxWidth: '80px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }} title={metaBadges.sku}>
                          {metaBadges.sku}
                        </span>
                      </div>
                    </td>
                    {/* Account - Advanced only */}
                    {!simpleView && (
                      <td style={tdStyle}>
                        <span style={{ fontSize: '11px', color: '#666' }}>{metaBadges.account}</span>
                      </td>
                    )}
                    {/* Next Action Badge - Compact */}
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        backgroundColor: primaryAction.color + '20',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: primaryAction.color,
                      }}>
                        {primaryAction.icon} {primaryAction.label}
                      </span>
                    </td>
                    {/* Last Changed - Advanced only */}
                    {!simpleView && (
                      <td style={tdStyle}>
                        <span style={{ fontSize: '11px', color: '#666' }}>
                          {hydrated && video.last_status_changed_at ? getTimeAgo(video.last_status_changed_at) : '—'}
                        </span>
                      </td>
                    )}
                    {/* Script - Advanced only */}
                    {!simpleView && (
                      <td style={tdStyle}>
                        <span style={{ fontSize: '11px', color: video.script_locked_text ? '#2b8a3e' : '#868e96' }}>
                          {video.script_locked_text ? '🔒 Locked' : '—'}
                        </span>
                      </td>
                    )}
                    {/* Assignment Status - Advanced only */}
                    {!simpleView && (
                      <td style={tdStyle}>
                        <span style={{ fontSize: '11px', color: claimedByMe ? '#2b8a3e' : claimedByOther ? '#e67700' : '#868e96' }}>
                          {claimedByMe ? '✓ My Task' : claimedByOther ? `🔒 ${video.claimed_by?.slice(0, 8)}` : 'Available'}
                        </span>
                      </td>
                    )}
                    {/* PRIMARY ACTION BUTTON */}
                    <td style={tdStyle}>
                      <button
                        onClick={() => handlePrimaryActionClick(video)}
                        disabled={primaryAction.disabled || isExecuting || claimedByOther}
                        title={primaryAction.disabledReason || (claimedByOther ? 'Locked by another user' : undefined)}
                        style={{
                          padding: simpleView ? '8px 16px' : '6px 12px',
                          backgroundColor: (primaryAction.disabled || claimedByOther) ? '#ccc' : primaryAction.color,
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: (primaryAction.disabled || claimedByOther) ? 'not-allowed' : 'pointer',
                          fontSize: simpleView ? '13px' : '12px',
                          fontWeight: 'bold',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          minWidth: simpleView ? '100px' : 'auto',
                          justifyContent: 'center',
                        }}
                      >
                        {isExecuting ? '...' : (
                          <>
                            <span>{primaryAction.icon}</span>
                            <span>{primaryAction.label}</span>
                          </>
                        )}
                      </button>
                    </td>
                    {/* MORE MENU */}
                    <td style={tdStyle}>
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={toggleMoreMenu}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: moreMenuOpen ? '#e9ecef' : 'transparent',
                            border: '1px solid #dee2e6',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                          }}
                        >
                          ⋯
                        </button>
                        {moreMenuOpen && (
                          <div style={{
                            position: 'absolute',
                            right: 0,
                            top: '100%',
                            backgroundColor: 'white',
                            border: '1px solid #dee2e6',
                            borderRadius: '6px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            zIndex: 100,
                            minWidth: '140px',
                            marginTop: '4px',
                          }}>
                            {/* Details - Opens drawer */}
                            <button
                              onClick={() => { openDrawer(video); closeMoreMenu(); }}
                              style={{
                                display: 'block',
                                width: '100%',
                                padding: '10px 14px',
                                textAlign: 'left',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#212529',
                                fontSize: '13px',
                                borderBottom: '1px solid #f0f0f0',
                              }}
                            >
                              📄 Details
                            </button>
                            {/* Start - Always visible when available */}
                            {unclaimed && (
                              <button
                                onClick={() => { claimVideo(video.id); closeMoreMenu(); }}
                                disabled={isProcessing}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '10px 14px',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  color: '#28a745',
                                  borderBottom: '1px solid #f0f0f0',
                                }}
                              >
                                ▶️ Start
                              </button>
                            )}
                            {/* Put Back - Always visible when assigned to me */}
                            {claimedByMe && (
                              <button
                                onClick={() => { releaseVideo(video.id); closeMoreMenu(); }}
                                disabled={isProcessing}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '10px 14px',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  color: '#dc3545',
                                  borderBottom: isAdminMode ? '1px solid #f0f0f0' : 'none',
                                }}
                              >
                                ↩️ Put Back
                              </button>
                            )}
                            {/* Admin-only options below this line */}
                            {isAdminMode && claimedByMe && (
                              <button
                                onClick={() => { openHandoffModal(video); closeMoreMenu(); }}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '10px 14px',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  color: '#6f42c1',
                                  borderBottom: '1px solid #f0f0f0',
                                }}
                              >
                                🔄 Handoff
                              </button>
                            )}
                            {isAdminMode && video.recording_status !== 'REJECTED' && video.recording_status !== 'POSTED' && (
                              <button
                                onClick={() => { executeTransition(video.id, 'REJECTED'); closeMoreMenu(); }}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '10px 14px',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  color: '#e03131',
                                }}
                              >
                                ⚠️ Reject
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {hasError && <span style={{ color: '#dc3545', fontSize: '10px', display: 'block' }}>{claimError?.message}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>
            {queueLoading ? 'Loading...' : 'No videos in queue for this filter'}
          </p>
        )}
        <div style={{ fontSize: '12px', color: '#666' }}>
          Showing {getRoleFilteredVideos().length} video(s)
          {vaMode !== 'admin' && ` for ${vaMode} role`}
          {activeRecordingTab !== 'ALL' && ` with status ${activeRecordingTab}`}
        </div>
      </section>

      {/* Advanced sections - only show in advanced view */}
      {!simpleView && (
      <>
      {/* Filters for legacy sections */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Event Filters:</span>
          <input
            type="text"
            placeholder="Filter by Video ID..."
            value={videoIdFilter}
            onChange={(e) => setVideoIdFilter(e.target.value)}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Filter by Actor..."
            value={claimedByFilter}
            onChange={(e) => setClaimedByFilter(e.target.value)}
            style={inputStyle}
          />
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All Event Types</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* In Progress Videos - Advanced View Only */}
      <section style={{ marginBottom: '40px' }}>
        <h2>In Progress ({filteredClaimedVideos.length}{hasActiveFilters ? ` of ${claimedVideos.length}` : ''})</h2>
        {filteredClaimedVideos.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Assigned To</th>
                <th style={thStyle}>Started</th>
                <th style={thStyle}>Expires</th>
              </tr>
            </thead>
            <tbody>
              {filteredClaimedVideos.map((video) => (
                <tr key={video.id}>
                  <td style={copyableCellStyle}>
                    <Link href={`/admin/pipeline/${video.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                      {video.id.slice(0, 8)}...
                    </Link>
                    <span
                      onClick={(e) => { e.stopPropagation(); copyToClipboard(video.id, `vid-${video.id}`); }}
                      style={{ marginLeft: '5px', cursor: 'pointer', color: '#666' }}
                      title="Copy full ID"
                    >
                      [copy]
                    </span>
                    {copiedId === `vid-${video.id}` && <span style={{ marginLeft: '5px', color: 'green', fontSize: '10px' }}>Copied!</span>}
                  </td>
                  <td style={tdStyle}>{video.claimed_by}</td>
                  <td style={tdStyle} title={formatDateString(video.claimed_at)}>{displayTime(video.claimed_at)}</td>
                  <td style={tdStyle} title={video.claim_expires_at ? formatDateString(video.claim_expires_at) : ''}>{video.claim_expires_at ? displayTime(video.claim_expires_at) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>{hasActiveFilters ? 'No matching claimed videos' : 'No videos currently claimed'}</p>
        )}
      </section>

      {/* Recent Events */}
      <section style={{ marginBottom: '40px' }}>
        <h2>Recent Events ({filteredEvents.length}{hasActiveFilters ? ` of ${recentEvents.length}` : ''})</h2>
        {filteredEvents.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Video ID</th>
                <th style={thStyle}>Actor</th>
                <th style={thStyle}>Transition</th>
                <th style={thStyle}>Correlation</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => (
                <tr key={event.id}>
                  <td style={tdStyle} title={formatDateString(event.created_at)}>{displayTime(event.created_at)}</td>
                  <td style={tdStyle}>{event.event_type}</td>
                  <td style={copyableCellStyle}>
                    <Link href={`/admin/pipeline/${event.video_id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                      {event.video_id.slice(0, 8)}...
                    </Link>
                    <span
                      onClick={(e) => { e.stopPropagation(); copyToClipboard(event.video_id, `evt-vid-${event.id}`); }}
                      style={{ marginLeft: '5px', cursor: 'pointer', color: '#666' }}
                      title="Copy full ID"
                    >
                      [copy]
                    </span>
                    {copiedId === `evt-vid-${event.id}` && <span style={{ marginLeft: '5px', color: 'green', fontSize: '10px' }}>Copied!</span>}
                  </td>
                  <td style={tdStyle}>{event.actor}</td>
                  <td style={tdStyle}>
                    {event.from_status || '-'} → {event.to_status || '-'}
                  </td>
                  <td
                    style={copyableCellStyle}
                    onClick={() => copyToClipboard(event.correlation_id, `corr-${event.id}`)}
                    title="Click to copy"
                  >
                    {event.correlation_id.slice(0, 12)}...
                    {copiedId === `corr-${event.id}` && <span style={{ marginLeft: '5px', color: 'green', fontSize: '10px' }}>Copied!</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>{hasActiveFilters ? 'No matching events' : 'No recent events'}</p>
        )}
      </section>

      <div style={{ color: '#999', fontSize: '12px' }}>
        Auto-refreshes every 10 seconds
      </div>
      </>
      )}

      {/* Attach Script Modal */}
      {attachModalVideoId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#004085' }}>Attach Script</h2>
              <button
                onClick={closeAttachModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                }}
              >
                ×
              </button>
            </div>

            <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
              Video: <code style={{ backgroundColor: '#f5f5f5', padding: '2px 6px', borderRadius: '4px' }}>{attachModalVideoId.slice(0, 8)}...</code>
            </p>

            {scriptsLoading ? (
              <p>Loading scripts...</p>
            ) : availableScripts.length === 0 ? (
              <p style={{ color: '#856404', backgroundColor: '#fff3cd', padding: '10px', borderRadius: '4px' }}>
                No approved scripts available. Please approve a script first.
              </p>
            ) : (
              <>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Select Script</label>
                  <select
                    value={selectedScriptId}
                    onChange={(e) => setSelectedScriptId(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
                  >
                    <option value="">-- Select a script --</option>
                    {availableScripts.map(script => (
                      <option key={script.id} value={script.id}>
                        {script.title || script.id.slice(0, 8)} (v{script.version})
                        {attachModalVideo?.concept_id && script.concept_id === attachModalVideo.concept_id && ' ★ matches concept'}
                        {attachModalVideo?.product_id && script.product_id === attachModalVideo.product_id && ' ★ matches product'}
                      </option>
                    ))}
                  </select>
                </div>

                {attachModalVideo?.script_locked_text && (
                  <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px', fontSize: '13px' }}>
                    <span style={{ color: '#856404' }}>This video already has a locked script.</span>
                  </div>
                )}

                {/* Force checkbox - only visible in Admin mode */}
                {isAdminMode && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={forceOverwrite}
                        onChange={(e) => setForceOverwrite(e.target.checked)}
                      />
                      <span style={{ fontSize: '13px' }}>Overwrite existing / Force attach unapproved</span>
                    </label>
                  </div>
                )}

                {attachMessage && (
                  <div style={{
                    marginBottom: '15px',
                    padding: '10px',
                    borderRadius: '4px',
                    backgroundColor: attachMessage.includes('Error') || attachMessage.includes('already') || attachMessage.includes('not approved')
                      ? '#f8d7da'
                      : '#d4edda',
                    color: attachMessage.includes('Error') || attachMessage.includes('already') || attachMessage.includes('not approved')
                      ? '#721c24'
                      : '#155724',
                    fontSize: '13px',
                  }}>
                    {attachMessage}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={attachScript}
                    disabled={!selectedScriptId || attaching}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: selectedScriptId && !attaching ? '#28a745' : '#ccc',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: selectedScriptId && !attaching ? 'pointer' : 'not-allowed',
                      fontSize: '14px',
                      fontWeight: 'bold',
                    }}
                  >
                    {attaching ? 'Attaching...' : 'Attach Script'}
                  </button>
                  <button
                    onClick={closeAttachModal}
                    style={{
                      padding: '12px 20px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Post Modal (READY_TO_POST -> POSTED) */}
      {postModalVideoId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '450px',
            width: '90%',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#1971c2' }}>Mark as Posted</h2>
              <button
                onClick={closePostModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                }}
              >
                ×
              </button>
            </div>

            <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
              Video: <code style={{ backgroundColor: '#f5f5f5', padding: '2px 6px', borderRadius: '4px' }}>{postModalVideoId.slice(0, 8)}...</code>
            </p>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Platform <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <select
                value={postPlatform}
                onChange={(e) => setPostPlatform(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
              >
                <option value="">-- Select Platform --</option>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
                <option value="youtube">YouTube</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Posted URL <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <input
                type="text"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://..."
                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            {postMessage && (
              <div style={{
                marginBottom: '15px',
                padding: '10px',
                borderRadius: '4px',
                backgroundColor: postMessage.includes('Error') ? '#f8d7da' : '#d4edda',
                color: postMessage.includes('Error') ? '#721c24' : '#155724',
                fontSize: '13px',
              }}>
                {postMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={submitPost}
                disabled={!postUrl.trim() || !postPlatform || posting}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: postUrl.trim() && postPlatform && !posting ? '#1971c2' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: postUrl.trim() && postPlatform && !posting ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                {posting ? 'Posting...' : 'Mark as Posted'}
              </button>
              <button
                onClick={closePostModal}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handoff Modal */}
      {handoffModalVideoId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '450px',
            width: '90%',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#6f42c1' }}>Handoff Video</h2>
              <button
                onClick={closeHandoffModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                }}
              >
                ×
              </button>
            </div>

            <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
              Video: <code style={{ backgroundColor: '#f5f5f5', padding: '2px 6px', borderRadius: '4px' }}>{handoffModalVideoId.slice(0, 8)}...</code>
              {handoffModalVideo?.claim_role && (
                <span style={{
                  marginLeft: '10px',
                  padding: '2px 8px',
                  backgroundColor: '#e7f5ff',
                  borderRadius: '4px',
                  fontSize: '12px',
                  textTransform: 'capitalize',
                }}>
                  Current role: {handoffModalVideo.claim_role}
                </span>
              )}
            </p>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                To User <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <input
                type="text"
                value={handoffToUser}
                onChange={(e) => setHandoffToUser(e.target.value)}
                placeholder="e.g., editor1, uploader2"
                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
              />
              <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['recorder1', 'recorder2', 'editor1', 'editor2', 'uploader1', 'admin'].filter(u => u !== activeUser).map(user => (
                  <button
                    key={user}
                    type="button"
                    onClick={() => setHandoffToUser(user)}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: handoffToUser === user ? '#6f42c1' : '#f8f9fa',
                      color: handoffToUser === user ? 'white' : '#333',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {user}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                New Role <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <select
                value={handoffToRole}
                onChange={(e) => setHandoffToRole(e.target.value as ClaimRole | '')}
                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
              >
                <option value="">-- Select Role --</option>
                <option value="recorder">Recorder</option>
                <option value="editor">Editor</option>
                <option value="uploader">Uploader</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Notes (optional)
              </label>
              <textarea
                value={handoffNotes}
                onChange={(e) => setHandoffNotes(e.target.value)}
                placeholder="Any handoff instructions..."
                rows={3}
                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>

            {handoffMessage && (
              <div style={{
                marginBottom: '15px',
                padding: '10px',
                borderRadius: '4px',
                backgroundColor: handoffMessage.includes('Error') ? '#f8d7da' : '#d4edda',
                color: handoffMessage.includes('Error') ? '#721c24' : '#155724',
                fontSize: '13px',
              }}>
                {handoffMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={submitHandoff}
                disabled={!handoffToUser.trim() || !handoffToRole || handingOff}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: handoffToUser.trim() && handoffToRole && !handingOff ? '#6f42c1' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: handoffToUser.trim() && handoffToRole && !handingOff ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                {handingOff ? 'Handing off...' : 'Handoff'}
              </button>
              <button
                onClick={closeHandoffModal}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Details Drawer */}
      {drawerVideo && (
        <VideoDrawer
          video={drawerVideo}
          simpleMode={simpleView}
          activeUser={activeUser}
          isAdmin={isAdminMode}
          onClose={closeDrawer}
          onClaimVideo={claimVideo}
          onReleaseVideo={releaseVideo}
          onExecuteTransition={executeTransition}
          onOpenAttachModal={(video) => { openAttachModal(video); }}
          onOpenPostModal={(video) => { openPostModal(video); }}
          onOpenHandoffModal={isAdminMode ? openHandoffModal : undefined}
          onRefresh={() => {
            fetchQueueVideos();
            // Update drawer video if it still exists in the list
            fetchQueueVideos().then(() => {
              const updatedVideo = queueVideos.find(v => v.id === drawerVideo.id);
              if (updatedVideo) {
                setDrawerVideo(updatedVideo);
              }
            });
          }}
        />
      )}
    </div>
  );
}
