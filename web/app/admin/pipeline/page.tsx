'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import IncidentBanner from '../components/IncidentBanner';
import VideoDrawer from './components/VideoDrawer';
import CreateVideoDrawer from './components/CreateVideoDrawer';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { VideoQueueMobile } from '@/components/VideoQueueMobile';
import { VideoDetailSheet } from '@/components/VideoDetailSheet';
import { FilterSheet } from '@/components/FilterSheet';
import { Filter, Film, Download, LayoutGrid, List } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonVideoList } from '@/components/ui/Skeleton';
import { PageErrorState } from '@/components/ui/PageErrorState';
import BoardView from './components/BoardView';
import type { BoardFilters } from './types';
import { getVideoDisplayTitle } from './types';

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

type SlaStatus = 'on_track' | 'due_soon' | 'overdue' | 'no_due_date';

interface QueueVideo {
  id: string;
  video_code: string | null;
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

// Stage tabs with user-friendly labels
type RecordingStatusTab = 'ALL' | 'NEEDS_SCRIPT' | 'GENERATING_SCRIPT' | 'NOT_RECORDED' | 'AI_RENDERING' | 'READY_FOR_REVIEW' | 'RECORDED' | 'EDITED' | 'APPROVED_NEEDS_EDITS' | 'READY_TO_POST' | 'POSTED' | 'REJECTED';
type ClaimRole = 'recorder' | 'editor' | 'uploader' | 'admin';

// VA Mode types
const VA_MODES = ['admin', 'recorder', 'editor', 'uploader'] as const;
type VAMode = typeof VA_MODES[number];

// Filter intent types
type FilterIntent = 'all' | 'my_work' | 'needs_action' | 'overdue' | 'needs_mapping' | 'ready_to_post';
const FILTER_OPTIONS: { value: FilterIntent; label: string }[] = [
  { value: 'all', label: 'All Videos' },
  { value: 'my_work', label: 'Assigned to Me' },
  { value: 'needs_action', label: 'Needs Attention' },
  { value: 'overdue', label: 'Past Due' },
  { value: 'needs_mapping', label: 'Missing Info' },
  { value: 'ready_to_post', label: 'Ready to Publish' },
];

// localStorage keys
const VA_MODE_KEY = 'pipeline_va_mode';
const SIMPLE_MODE_KEY = 'pipeline_simple_mode';
const FILTER_STATE_KEY = 'pipeline_filter_state';
const VIEW_MODE_KEY = 'pipeline_view_mode';

// Auth user info type
interface AuthUser {
  id: string;
  email: string | null;
  role: 'admin' | 'recorder' | 'editor' | 'uploader' | null;
}


// ============================================================================
// PRIMARY ACTION LOGIC - Single source of truth for "what should VA do next"
// Colors: Script=Teal, Record=Blue, Edit=Purple, Approve=Green, Post=Orange
// ============================================================================
interface PrimaryAction {
  key: 'add_script' | 'lock_script' | 'record' | 'edit' | 'approve' | 'post' | 'done' | 'rejected' | 're_generate';
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

  // Priority 1: Need script - using accent color
  if (!hasLockedScript) {
    return {
      key: 'add_script',
      label: 'Add Script',
      icon: '',
      color: '#0F766E', // Accent teal
      requiredRole: 'recorder',
      disabled: false,
      actionType: 'modal',
    };
  }

  // Priority 2: Not recorded yet
  if (recordingStatus === 'NOT_RECORDED') {
    return {
      key: 'record',
      label: 'Record',
      icon: '',
      color: '#0F766E', // Accent
      requiredRole: 'recorder',
      disabled: !video.can_record,
      disabledReason: video.can_record ? undefined : 'Script required',
      actionType: 'transition',
      targetStatus: 'RECORDED',
    };
  }

  // Priority 2b: Ready for review (AI video composed)
  if (recordingStatus === 'READY_FOR_REVIEW') {
    return {
      key: 'approve',
      label: 'Approve Video',
      icon: '',
      color: '#059669',
      requiredRole: 'admin',
      disabled: false,
      actionType: 'transition',
      targetStatus: 'READY_TO_POST',
    };
  }

  // Priority 3: Recorded, needs editing
  if (recordingStatus === 'RECORDED') {
    return {
      key: 'edit',
      label: 'Edit Done',
      icon: '',
      color: '#0F766E', // Accent
      requiredRole: 'editor',
      disabled: !video.can_mark_edited,
      disabledReason: 'Recording required',
      actionType: 'transition',
      targetStatus: 'EDITED',
    };
  }

  // Priority 4: Edited, needs approval
  if (recordingStatus === 'EDITED') {
    const canApprove = video.can_mark_ready_to_post;
    return {
      key: 'approve',
      label: 'Approve',
      icon: '',
      color: '#0F766E', // Accent
      requiredRole: 'editor',
      disabled: !canApprove,
      disabledReason: canApprove ? undefined : 'Need video URL',
      actionType: 'transition',
      targetStatus: 'READY_TO_POST',
    };
  }

  // Priority 4b: Approved but needs edits
  if (recordingStatus === 'APPROVED_NEEDS_EDITS') {
    return {
      key: 'edit',
      label: 'Apply Edits',
      icon: '',
      color: '#D97706', // Amber
      requiredRole: 'editor',
      disabled: false,
      actionType: 'transition',
      targetStatus: 'READY_TO_POST',
    };
  }

  // Priority 5: Ready to post
  if (recordingStatus === 'READY_TO_POST') {
    return {
      key: 'post',
      label: 'Post',
      icon: '',
      color: '#0F766E', // Accent
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
      icon: '',
      color: '#10B981', // Success
      requiredRole: null,
      disabled: true,
      actionType: 'none',
    };
  }

  // Priority 7: Rejected - offer re-generate
  if (recordingStatus === 'REJECTED') {
    return {
      key: 're_generate',
      label: 'Re-generate',
      icon: '',
      color: '#6366f1',
      requiredRole: 'admin',
      disabled: false,
      actionType: 'transition',
      targetStatus: 'NOT_RECORDED',
    };
  }

  // Fallback
  return {
    key: 'done',
    label: 'View',
    icon: '',
    color: '#6B7280', // Muted
    requiredRole: null,
    disabled: false,
    actionType: 'none',
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

// Main pipeline page component
export default function AdminPipelinePage() {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { showSuccess, showError } = useToast();
  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [, setQueueSummary] = useState<QueueSummary | null>(null);
  const [, setClaimedVideos] = useState<ClaimedVideo[]>([]);
  const [, setRecentEvents] = useState<VideoEvent[]>([]);
  const [queueVideos, setQueueVideos] = useState<QueueVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [error, setError] = useState('');
  const [, setLastRefresh] = useState<Date | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null);
  const [reclaiming, setReclaiming] = useState(false);
  const [reclaimMessage, setReclaimMessage] = useState<string | null>(null);
  // Recording status tab state
  const [activeRecordingTab] = useState<RecordingStatusTab>('ALL');
  const [claimedFilter] = useState<'any' | 'unclaimed' | 'claimed'>('any');

  // Auth state
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Role-based filtering state
  const [activeRoleTab] = useState<'all' | 'recorder' | 'editor' | 'uploader'>('all');
  const [myWorkOnly] = useState(false);

  // Derived: active user is the authenticated user's ID
  const activeUser = authUser?.id || '';

  // VA Mode state (Admin / Recorder / Editor / Uploader)
  const [vaMode, setVaMode] = useState<VAMode>('admin');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Brand & assignee filter state
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');

  // Filter intent state
  const [filterIntent, setFilterIntent] = useState<FilterIntent>('all');
  const [showMaintenanceMenu, setShowMaintenanceMenu] = useState(false);

  // Enhanced filter state
  const [workflowFilter, setWorkflowFilter] = useState<RecordingStatusTab>('ALL');
  const [productFilter, setProductFilter] = useState<string>('');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'newest' | 'oldest' | 'sla'>('priority');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  // Per-row claim/release state
  const [, setClaimingVideoId] = useState<string | null>(null);
  const [, setClaimError] = useState<{ videoId: string; message: string } | null>(null);

  // Attach script modal state
  const [attachModalVideoId, setAttachModalVideoId] = useState<string | null>(null);
  const [attachModalVideo, setAttachModalVideo] = useState<QueueVideo | null>(null);
  const [availableScripts, setAvailableScripts] = useState<AvailableScript[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [selectedScriptId, setSelectedScriptId] = useState<string>('');
  const [attaching, setAttaching] = useState(false);
  const [attachMessage, setAttachMessage] = useState<string | null>(null);
  const [forceOverwrite, setForceOverwrite] = useState(false);

  // Reject modal state (for drag-to-REJECTED from board)
  const [rejectModalVideoId, setRejectModalVideoId] = useState<string | null>(null);
  const [rejectTag, setRejectTag] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Post modal state (for READY_TO_POST -> POSTED)
  const [postModalVideoId, setPostModalVideoId] = useState<string | null>(null);
  const [, setPostModalVideo] = useState<QueueVideo | null>(null);
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
  const [, setExecutingVideoId] = useState<string | null>(null);
  const [, setExecutionError] = useState<{ videoId: string; message: string } | null>(null);
  // More menu state (which video's menu is open)
  const [, setOpenMenuVideoId] = useState<string | null>(null);

  // View mode state (simple vs advanced) - simple is default for VA usability
  const [simpleView, setSimpleView] = useState(true);
  // Board vs list view
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [boardFilters, setBoardFilters] = useState<BoardFilters>({ brand: '', product: '', account: '' });

  // Drawer state - which video is open in the details drawer
  const [drawerVideo, setDrawerVideo] = useState<QueueVideo | null>(null);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);

  // Mobile detail sheet state
  const [mobileDetailVideo, setMobileDetailVideo] = useState<QueueVideo | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Mobile filter sheet state
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [mobileFilters, setMobileFilters] = useState<{ status?: string; brand?: string; assignedTo?: string }>({});

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Bulk selection state
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Queue health state
  const [queueHealth, setQueueHealth] = useState<{
    stuck_items: { video_id: string; video_code: string | null; hours_in_status: number; recording_status: string | null }[];
    aging_buckets: { under_4h: number; h4_to_12h: number; h12_to_24h: number; over_24h: number };
    total_in_progress: number;
  } | null>(null);
  const [, setQueueHealthLoading] = useState(false);

  // Show toast with auto-dismiss
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Export videos as CSV
  const handleExportVideos = () => {
    const videos = getRoleFilteredVideos();
    if (!videos.length) {
      showToast('No videos to export', 'error');
      return;
    }
    const esc = (v: string | null | undefined) => `"${(v || '').replace(/"/g, '""')}"`;
    const csv = [
      ['Video Title', 'Product', 'Brand', 'Status', 'Assigned To', 'Created', 'Last Updated'].join(','),
      ...videos.map(v => [
        esc(getVideoDisplayTitle(v)),
        esc(v.product_name),
        esc(v.brand_name),
        esc((v.recording_status || 'NOT_RECORDED').replace(/_/g, ' ')),
        esc(v.claimed_by ? (userMap[v.claimed_by] || v.claimed_by.slice(0, 8)) : ''),
        v.created_at?.slice(0, 10) || '',
        v.last_status_changed_at?.slice(0, 10) || v.created_at?.slice(0, 10) || '',
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Pipeline exported!');
  };

  // Bulk selection handlers
  const toggleVideoSelection = (videoId: string) => {
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const currentVideos = getIntentFilteredVideos();
    if (selectedVideoIds.size === currentVideos.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(currentVideos.map(v => v.id)));
    }
  };

  const clearSelection = () => {
    setSelectedVideoIds(new Set());
  };

  // Bulk action: Mark as Winner
  const bulkMarkWinner = async () => {
    if (selectedVideoIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch('/api/admin/videos/bulk-winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_ids: Array.from(selectedVideoIds),
          winner_reason: 'Bulk marked as winner',
        }),
      });
      const data = await res.json();
      if (data.ok || data.data?.success_count > 0) {
        showToast(`Marked ${data.data?.success_count || 0} video(s) as winner`);
        clearSelection();
        fetchQueueVideos();
      } else {
        showToast(data.message || 'Failed to mark winners', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk action: Mark as Underperform
  const bulkMarkUnderperform = async () => {
    if (selectedVideoIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch('/api/admin/videos/bulk-underperform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_ids: Array.from(selectedVideoIds),
        }),
      });
      const data = await res.json();
      if (data.ok || data.data?.success_count > 0) {
        showToast(`Marked ${data.data?.success_count || 0} video(s) as underperforming`);
        clearSelection();
        fetchQueueVideos();
      } else {
        showToast(data.message || 'Failed to mark underperform', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk action: Change Status
  const bulkChangeStatus = async (newStatus: string) => {
    if (selectedVideoIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch('/api/admin/videos/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_ids: Array.from(selectedVideoIds), status: newStatus }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Moved ${data.data?.updated || 0} video(s) to ${newStatus}`);
        clearSelection();
        fetchQueueVideos();
      } else {
        showToast(data.message || 'Failed to change status', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk action: Archive (soft delete)
  const bulkArchive = async () => {
    if (selectedVideoIds.size === 0) return;
    if (!confirm(`Archive ${selectedVideoIds.size} video(s)? They will be moved to ARCHIVED status.`)) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch('/api/admin/videos/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_ids: Array.from(selectedVideoIds) }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Archived ${data.data?.archived || 0} video(s)`);
        clearSelection();
        fetchQueueVideos();
      } else {
        showToast(data.message || 'Failed to archive', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setBulkActionLoading(false);
    }
  };


  // Reference data for filters
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; brand: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);

  // User lookup map (UUID -> display label)
  const [userMap, setUserMap] = useState<Record<string, string>>({});


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

        // Load view mode preference
        const savedViewMode = localStorage.getItem(VIEW_MODE_KEY);
        if (savedViewMode === 'board') {
          setViewMode('board');
        }

        // Restore filter state from localStorage
        try {
          const savedFilters = localStorage.getItem(FILTER_STATE_KEY);
          if (savedFilters) {
            const parsed = JSON.parse(savedFilters);
            if (parsed.filterIntent) setFilterIntent(parsed.filterIntent);
            if (parsed.brandFilter) setBrandFilter(parsed.brandFilter);
            if (parsed.assigneeFilter) setAssigneeFilter(parsed.assigneeFilter);
            if (parsed.workflowFilter) setWorkflowFilter(parsed.workflowFilter);
            if (parsed.productFilter) setProductFilter(parsed.productFilter);
            if (parsed.dateRangeFilter) setDateRangeFilter(parsed.dateRangeFilter);
            if (parsed.sortBy) setSortBy(parsed.sortBy);
            if (parsed.priorityFilter) setPriorityFilter(parsed.priorityFilter);
          }
        } catch {
          // Ignore parse errors
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

  // Fetch reference data (brands, products, accounts, users) for filters
  useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        const [productsRes, accountsRes, usersRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/accounts'),
          fetch('/api/admin/users'),
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

        // Build user lookup map (UUID -> "email (role)" or "email")
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          const map: Record<string, string> = {};
          for (const u of (usersData.data || [])) {
            const email = u.email || u.user_id?.slice(0, 8);
            const label = u.role ? `${email} (${u.role})` : email;
            map[u.user_id] = label;
          }
          setUserMap(map);
        }
      } catch (err) {
        console.error('Failed to fetch reference data:', err);
      }
    };

    fetchReferenceData();
  }, []);

  // Persist filter state to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STATE_KEY, JSON.stringify({
        filterIntent,
        brandFilter,
        assigneeFilter,
        workflowFilter,
        productFilter,
        dateRangeFilter,
        sortBy,
        priorityFilter,
      }));
    } catch {
      // Ignore write errors
    }
  }, [filterIntent, brandFilter, assigneeFilter, workflowFilter, productFilter, dateRangeFilter, sortBy, priorityFilter]);


  // Get videos filtered by current role mode and search query
  const getRoleFilteredVideos = (): QueueVideo[] => {
    let filtered = vaMode === 'admin' ? queueVideos : filterVideosByRole(queueVideos, vaMode);

    // Apply search filter (uses API-provided brand_name/product_name/product_sku)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(video => {
        const brand = (video.brand_name || '').toLowerCase();
        const productName = (video.product_name || '').toLowerCase();
        const sku = (video.product_sku || '').toLowerCase();
        const videoCode = (video.video_code || '').toLowerCase();
        const videoId = video.id.toLowerCase();

        return (
          brand.includes(query) ||
          productName.includes(query) ||
          sku.includes(query) ||
          videoCode.includes(query) ||
          videoId.includes(query)
        );
      });
    }

    return filtered;
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

  // Get product/account info for display (brand_name/product_name/product_sku populated by API join)
  const getVideoMetaBadges = (video: QueueVideo) => {
    const account = accounts.find(a => a.id === video.account_id);
    return {
      brand: video.brand_name || '—',
      sku: video.product_name?.slice(0, 12) || video.product_sku || video.product_id?.slice(0, 8) || '—',
      account: account?.name || '—',
    };
  };

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

        // Compute SLA status based on due date (7-day window from creation)
        const SLA_DAYS = 7;
        const SLA_DUE_SOON_HOURS = 24;
        const nowMs = Date.now();
        videos = videos.map((v: QueueVideo) => {
          // POSTED and READY_TO_POST (approved) videos never show Past Due
          const terminalStatuses = ['POSTED', 'READY_TO_POST'];
          if (terminalStatuses.includes(v.recording_status || '')) {
            return { ...v, sla_status: 'on_track' as SlaStatus };
          }

          // Compute due_date: sla_deadline_at from API, or 7 days from creation
          const dueDateStr = v.sla_deadline_at;
          if (!dueDateStr) {
            // No due date set — check if we can derive one from created_at
            if (!v.created_at) return { ...v, sla_status: 'no_due_date' as SlaStatus };
            // Default due date: 7 days from creation
            const defaultDueMs = new Date(v.created_at).getTime() + SLA_DAYS * 24 * 60 * 60 * 1000;
            const msUntilDue = defaultDueMs - nowMs;
            let sla_status: SlaStatus = 'on_track';
            if (msUntilDue < 0) sla_status = 'overdue';
            else if (msUntilDue < SLA_DUE_SOON_HOURS * 60 * 60 * 1000) sla_status = 'due_soon';
            return { ...v, sla_status };
          }

          // Explicit due date exists
          const dueMs = new Date(dueDateStr).getTime();
          const msUntilDue = dueMs - nowMs;
          let sla_status: SlaStatus = 'on_track';
          if (msUntilDue < 0) sla_status = 'overdue';
          else if (msUntilDue < SLA_DUE_SOON_HOURS * 60 * 60 * 1000) sla_status = 'due_soon';
          return { ...v, sla_status };
        });

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
    } catch {
      setError('Failed to fetch observability data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch queue health data (admin only)
  const fetchQueueHealth = useCallback(async () => {
    setQueueHealthLoading(true);
    try {
      const res = await fetch('/api/admin/queue-health');
      const data = await res.json();
      if (data.ok && data.data) {
        setQueueHealth(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch queue health:', err);
    } finally {
      setQueueHealthLoading(false);
    }
  }, []);

  const releaseStale = useCallback(async () => {
    setReleasing(true);
    setReleaseMessage(null);
    try {
      const res = await fetch('/api/videos/release-stale', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setReleaseMessage(`Freed up ${data.released_count} inactive assignment(s)`);
        fetchData();
        fetchQueueVideos();
      } else {
        setReleaseMessage(`Error: ${data.message || 'Failed to release'}`);
      }
    } catch {
      setReleaseMessage('Error: Failed to free inactive assignments');
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
        setReclaimMessage(`Reassigned ${data.reclaimed_count} timed-out video(s)`);
        fetchData();
        fetchQueueVideos();
      } else {
        setReclaimMessage(`Error: ${data.error || 'Failed to reclaim'}`);
      }
    } catch {
      setReclaimMessage('Error: Failed to reassign timed-out videos');
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
    } catch {
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
    } catch {
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
        showSuccess('Script attached successfully');
        // Refresh queue to show updated blocker status
        fetchQueueVideos();
        closeAttachModal();
      } else if (data.code === 'SCRIPT_ALREADY_LOCKED') {
        setAttachMessage('This video already has an approved script. Check "Overwrite existing" to replace it.');
      } else if (data.code === 'SCRIPT_NOT_APPROVED') {
        setAttachMessage(`Script is not approved (status: ${data.details?.status || 'unknown'}). Check "Force attach" to attach anyway.`);
      } else {
        setAttachMessage(`Error: ${data.error || 'Failed to attach script'}`);
        showError(data.error || 'Failed to attach script');
      }
    } catch {
      setAttachMessage('Error: Failed to attach script');
      showError('Failed to attach script');
    } finally {
      setAttaching(false);
    }
  };

  // Quick execution transition (for record, edit, ready_to_post)
  const executeTransition = async (videoId: string, targetStatus: string) => {
    setExecutingVideoId(videoId);
    setExecutionError(null);

    // Get friendly status names for toast
    const statusLabels: Record<string, string> = {
      'RECORDED': 'marked as recorded',
      'EDITED': 'marked as edited',
      'APPROVED_NEEDS_EDITS': 'approved — needs edits',
      'READY_TO_POST': 'approved for posting',
      'POSTED': 'marked as posted',
      'REJECTED': 'rejected',
    };
    const statusLabel = statusLabels[targetStatus] || 'updated';

    try {
      // Auth is handled server-side via session
      const res = await fetch(`/api/videos/${videoId}/execution`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_status: targetStatus }),
      });
      const data = await res.json();
      if (data.ok) {
        showSuccess(`Video ${statusLabel}`);
        fetchQueueVideos();
        // Close mobile detail sheet if open
        setMobileDetailOpen(false);

        // Auto-schedule when video reaches READY_TO_POST
        if (targetStatus === 'READY_TO_POST') {
          fetch(`/api/videos/${videoId}/auto-schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).then(async (schedRes) => {
            if (schedRes.ok) {
              const schedData = await schedRes.json();
              if (schedData.scheduled_for) {
                const formattedDate = new Date(schedData.scheduled_for).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                });
                showSuccess(`Auto-scheduled for ${formattedDate}`);
              }
            }
          }).catch(() => {
            // Auto-schedule is best-effort, don't block on failure
          });
        }
      } else {
        setExecutionError({ videoId, message: data.error || 'Failed to update status' });
        showError(data.error || 'Failed to update status');
      }
    } catch {
      setExecutionError({ videoId, message: 'Network error' });
      showError('Network error - please try again');
    } finally {
      setExecutingVideoId(null);
    }
  };

  // Reject modal handlers
  const REJECT_TAGS = [
    { code: 'too_generic', label: 'Too Generic' },
    { code: 'too_risky', label: 'Too Risky' },
    { code: 'not_relatable', label: 'Not Relatable' },
    { code: 'wrong_angle', label: 'Wrong Angle' },
    { code: 'compliance', label: 'Compliance Issue' },
    { code: 'bad_cta', label: 'Bad CTA' },
  ];

  const openRejectModal = (videoId: string) => {
    setRejectModalVideoId(videoId);
    setRejectTag(null);
    setRejectReason('');
  };

  const closeRejectModal = () => {
    setRejectModalVideoId(null);
    setRejectTag(null);
    setRejectReason('');
  };

  const submitReject = async () => {
    if (!rejectModalVideoId || (!rejectTag && !rejectReason.trim())) return;
    setRejecting(true);
    try {
      const tagLabel = rejectTag
        ? REJECT_TAGS.find(t => t.code === rejectTag)?.label
        : null;
      const noteParts: string[] = [];
      if (tagLabel) noteParts.push(`[${tagLabel}]`);
      if (rejectReason.trim()) noteParts.push(rejectReason.trim());
      const combinedNotes = noteParts.join(' ') || 'Rejected';

      const res = await fetch(`/api/videos/${rejectModalVideoId}/execution`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_status: 'REJECTED',
          recording_notes: combinedNotes,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showSuccess('Video rejected');
        fetchQueueVideos();
        closeRejectModal();
      } else {
        showError(data.error || 'Failed to reject video');
      }
    } catch {
      showError('Network error - please try again');
    } finally {
      setRejecting(false);
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
        showSuccess('Video marked as posted');
        fetchQueueVideos();
        closePostModal();
      } else {
        setPostMessage(`Error: ${data.error || 'Failed to mark as posted'}`);
        showError(data.error || 'Failed to mark as posted');
      }
    } catch {
      setPostMessage('Error: Network error');
      showError('Network error - please try again');
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

  // Advance to next video in queue (for auto-advance after completing action)
  const advanceToNextVideo = () => {
    if (!drawerVideo) return;

    const videos = getRoleFilteredVideos();
    const currentIndex = videos.findIndex(v => v.id === drawerVideo.id);

    if (currentIndex >= 0 && currentIndex < videos.length - 1) {
      // Advance to next video
      setDrawerVideo(videos[currentIndex + 1]);
    } else if (videos.length > 0 && currentIndex === videos.length - 1) {
      // At the end of list, go back to first if there are unclaimed videos
      const firstUnclaimed = videos.find(v =>
        !v.claimed_by || (v.claim_expires_at && new Date(v.claim_expires_at) <= new Date())
      );
      if (firstUnclaimed) {
        setDrawerVideo(firstUnclaimed);
      } else {
        // No more tasks, close drawer and show completion message
        closeDrawer();
      }
    } else {
      closeDrawer();
    }
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
    } catch {
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
      fetchQueueHealth();
      const interval = setInterval(() => {
        fetchData();
        fetchQueueVideos();
        fetchQueueHealth();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [adminEnabled, fetchData, fetchQueueVideos, fetchQueueHealth]);

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

  if (error && !loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        <PageErrorState message={error} onRetry={fetchData} />
      </div>
    );
  }

  // Table styles using theme colors
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginBottom: '20px',
    backgroundColor: colors.surface,
    borderRadius: '10px',
    overflow: 'hidden',
  };
  const thStyle = {
    padding: '12px 16px',
    textAlign: 'left' as const,
    backgroundColor: colors.surface,
    color: colors.textMuted,
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    borderBottom: `1px solid ${colors.border}`,
  };
  const tdStyle = {
    padding: '12px 16px',
    borderBottom: `1px solid ${colors.border}`,
    color: colors.text,
    fontSize: '14px',
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

  // Apply intent-based filtering
  const getIntentFilteredVideos = () => {
    let videos = getRoleFilteredVideos();

    switch (filterIntent) {
      case 'my_work':
        videos = videos.filter(v => v.claimed_by === activeUser);
        break;
      case 'needs_action':
        // Videos in actionable states, prioritize unclaimed
        videos = videos.filter(v =>
          ['NEEDS_SCRIPT', 'NOT_RECORDED', 'RECORDED', 'EDITED', 'APPROVED_NEEDS_EDITS', 'READY_TO_POST'].includes(v.recording_status || '')
        ).sort((a, b) => {
          // Unclaimed first
          if (!a.claimed_by && b.claimed_by) return -1;
          if (a.claimed_by && !b.claimed_by) return 1;
          return 0;
        });
        break;
      case 'overdue':
        videos = videos.filter(v => v.sla_status === 'overdue');
        break;
      case 'needs_mapping':
        videos = videos.filter(v => !v.brand_name || !v.product_id);
        break;
      case 'ready_to_post':
        videos = videos.filter(v => v.recording_status === 'READY_TO_POST');
        break;
      default:
        break;
    }

    // Apply workflow status filter
    if (workflowFilter !== 'ALL') {
      videos = videos.filter(v => v.recording_status === workflowFilter);
    }

    // Apply product filter
    if (productFilter) {
      videos = videos.filter(v => v.product_id === productFilter);
    }

    // Apply date range filter
    if (dateRangeFilter !== 'all') {
      const now = new Date();
      let cutoff: Date;
      if (dateRangeFilter === 'today') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateRangeFilter === 'week') {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      videos = videos.filter(v => new Date(v.created_at) >= cutoff);
    }

    // Apply brand filter
    if (brandFilter) {
      videos = videos.filter(v => v.brand_name === brandFilter);
    }

    // Apply assignee filter
    if (assigneeFilter) {
      if (assigneeFilter === '__unassigned__') {
        videos = videos.filter(v => !v.claimed_by);
      } else {
        videos = videos.filter(v => v.claimed_by === assigneeFilter);
      }
    }

    // Apply priority filter
    if (priorityFilter !== 'all') {
      videos = videos.filter(v => {
        const score = v.priority_score ?? 0;
        if (priorityFilter === 'high') return score >= 70;
        if (priorityFilter === 'medium') return score >= 30 && score < 70;
        return score < 30; // low
      });
    }

    // Apply search query on top
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      videos = videos.filter(v =>
        v.video_code?.toLowerCase().includes(q) ||
        v.id.toLowerCase().includes(q) ||
        v.brand_name?.toLowerCase().includes(q) ||
        v.product_name?.toLowerCase().includes(q) ||
        v.product_sku?.toLowerCase().includes(q)
      );
    }

    // Apply sort
    videos.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return (b.priority_score ?? 0) - (a.priority_score ?? 0);
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'sla': {
          // Items with SLA deadlines first, then by deadline ascending
          const aDeadline = a.sla_deadline_at ? new Date(a.sla_deadline_at).getTime() : Infinity;
          const bDeadline = b.sla_deadline_at ? new Date(b.sla_deadline_at).getTime() : Infinity;
          return aDeadline - bDeadline;
        }
        default:
          return 0;
      }
    });

    return videos;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Incident Mode Banner */}
      <IncidentBanner />

      {/* Review Banner */}
      {(() => {
        const reviewCount = queueVideos.filter(v => v.recording_status === 'READY_FOR_REVIEW').length;
        if (reviewCount === 0) return null;
        return (
          <a
            href="/admin/review"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              marginBottom: '16px',
              backgroundColor: isDark ? 'rgba(5, 150, 105, 0.15)' : '#ecfdf5',
              border: `1px solid ${isDark ? 'rgba(52, 211, 153, 0.3)' : '#a7f3d0'}`,
              borderRadius: '10px',
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = isDark ? 'rgba(5, 150, 105, 0.25)' : '#d1fae5')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = isDark ? 'rgba(5, 150, 105, 0.15)' : '#ecfdf5')}
          >
            <span style={{ fontSize: '20px' }}>🎬</span>
            <span style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: isDark ? '#6ee7b7' : '#059669' }}>
              {reviewCount} video{reviewCount !== 1 ? 's' : ''} ready for your review
            </span>
            <span style={{ fontSize: '13px', fontWeight: 500, color: isDark ? '#34d399' : '#059669' }}>
              Go to Review →
            </span>
          </a>
        );
      })()}

      {/* Clean Header */}
      {/* Desktop Header - Hidden on mobile */}
      <div className="hidden lg:flex" style={{
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
      }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, color: colors.text, margin: 0 }}>
            Work Queue
          </h1>
          <p style={{ fontSize: '13px', color: colors.textMuted, margin: '4px 0 0 0' }}>
            Everything currently in progress
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Create Video - Primary Action */}
          {isAdminMode && (
            <button type="button"
              onClick={() => setShowCreateDrawer(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: colors.accent,
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              New Video
            </button>
          )}

          {/* View Toggle */}
          <div style={{
            display: 'flex',
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            <button type="button"
              onClick={() => { setViewMode('list'); localStorage.setItem(VIEW_MODE_KEY, 'list'); }}
              style={{
                padding: '7px 10px',
                backgroundColor: viewMode === 'list' ? colors.accent : 'transparent',
                color: viewMode === 'list' ? 'white' : colors.textMuted,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title="List view"
            >
              <List size={15} />
            </button>
            <button type="button"
              onClick={() => { setViewMode('board'); localStorage.setItem(VIEW_MODE_KEY, 'board'); }}
              style={{
                padding: '7px 10px',
                backgroundColor: viewMode === 'board' ? colors.accent : 'transparent',
                color: viewMode === 'board' ? 'white' : colors.textMuted,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Board view"
            >
              <LayoutGrid size={15} />
            </button>
          </div>

          {/* Export CSV */}
          {isAdminMode && (
            <button type="button"
              onClick={handleExportVideos}
              style={{
                padding: '8px 16px',
                backgroundColor: colors.surface,
                color: colors.textMuted,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={14} />
              Export
            </button>
          )}

          {/* Maintenance Menu */}
          {isAdminMode && (
            <div style={{ position: 'relative' }}>
              <button type="button"
                onClick={() => setShowMaintenanceMenu(!showMaintenanceMenu)}
                style={{
                  padding: '8px 12px',
                  backgroundColor: colors.surface,
                  color: colors.textMuted,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  lineHeight: 1,
                }}
                title="Maintenance"
              >
                ...
              </button>
              {showMaintenanceMenu && (
                <>
                  <div
                    onClick={() => setShowMaintenanceMenu(false)}
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    backgroundColor: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 100,
                    minWidth: '160px',
                    overflow: 'hidden',
                  }}>
                    <button type="button"
                      onClick={() => { fetchData(); fetchQueueVideos(); setShowMaintenanceMenu(false); }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 14px',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: colors.text,
                      }}
                    >
                      Refresh
                    </button>
                    <button type="button"
                      onClick={() => { releaseStale(); setShowMaintenanceMenu(false); }}
                      disabled={releasing}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 14px',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        cursor: releasing ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        color: colors.text,
                        opacity: releasing ? 0.5 : 1,
                      }}
                    >
                      {releasing ? 'Freeing...' : 'Free Up Inactive Assignments'}
                    </button>
                    <button type="button"
                      onClick={() => { reclaimExpired(); setShowMaintenanceMenu(false); }}
                      disabled={reclaiming}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 14px',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        cursor: reclaiming ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        color: colors.text,
                        opacity: reclaiming ? 0.5 : 1,
                      }}
                    >
                      {reclaiming ? 'Reassigning...' : 'Reassign Timed-Out Videos'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {error && <div style={{ color: colors.danger, marginBottom: '16px', fontSize: '13px' }}>Error: {error}</div>}
      {releaseMessage && (
        <div style={{ color: releaseMessage.startsWith('Error') ? colors.danger : colors.success, marginBottom: '16px', fontSize: '13px' }}>
          {releaseMessage}
        </div>
      )}
      {reclaimMessage && (
        <div style={{ color: reclaimMessage.startsWith('Error') ? colors.danger : colors.success, marginBottom: '16px', fontSize: '13px' }}>
          {reclaimMessage}
        </div>
      )}

      {/* Queue Health Card (admin only) - Desktop only */}
      {isAdminMode && queueHealth && (
        <div className="hidden lg:flex" style={{
          marginBottom: '16px',
          padding: '12px 16px',
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
          alignItems: 'center',
          gap: '24px',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Queue Health
          </span>

          {/* Aging buckets */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: colors.textMuted }}>
              &lt;4h: <span style={{ fontWeight: 500, color: colors.success }}>{queueHealth.aging_buckets.under_4h}</span>
            </span>
            <span style={{ fontSize: '12px', color: colors.textMuted }}>
              4-12h: <span style={{ fontWeight: 500, color: colors.text }}>{queueHealth.aging_buckets.h4_to_12h}</span>
            </span>
            <span style={{ fontSize: '12px', color: colors.textMuted }}>
              12-24h: <span style={{ fontWeight: 500, color: colors.warning }}>{queueHealth.aging_buckets.h12_to_24h}</span>
            </span>
            <span style={{ fontSize: '12px', color: colors.textMuted }}>
              &gt;24h: <span style={{ fontWeight: 500, color: colors.danger }}>{queueHealth.aging_buckets.over_24h}</span>
            </span>
          </div>

          {/* Stuck items indicator */}
          {queueHealth.stuck_items.length > 0 && (
            <button type="button"
              onClick={() => setFilterIntent('overdue')}
              style={{
                padding: '4px 10px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: colors.danger,
                border: `1px solid rgba(239, 68, 68, 0.2)`,
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {queueHealth.stuck_items.length} stuck
            </button>
          )}

          {/* Total count */}
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: colors.textMuted }}>
            {queueHealth.total_in_progress} in progress
          </span>
        </div>
      )}

      {/* Compact Filter Bar - Desktop only */}
      <div className="hidden lg:block" style={{ marginBottom: '16px' }}>
        {/* Row 1: Intent pill buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {FILTER_OPTIONS.map(opt => {
            const isActive = filterIntent === opt.value;
            // Compute count for this intent
            const getCountForIntent = (intent: FilterIntent): number => {
              let vids = getRoleFilteredVideos();
              switch (intent) {
                case 'my_work': return vids.filter(v => v.claimed_by === activeUser).length;
                case 'needs_action': return vids.filter(v => ['NEEDS_SCRIPT', 'NOT_RECORDED', 'RECORDED', 'EDITED', 'APPROVED_NEEDS_EDITS', 'READY_TO_POST'].includes(v.recording_status || '')).length;
                case 'overdue': return vids.filter(v => v.sla_status === 'overdue').length;
                case 'needs_mapping': return vids.filter(v => !v.brand_name || !v.product_id).length;
                case 'ready_to_post': return vids.filter(v => v.recording_status === 'READY_TO_POST').length;
                default: return vids.length;
              }
            };
            const count = getCountForIntent(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilterIntent(opt.value)}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: `1px solid ${isActive ? colors.accent : colors.border}`,
                  borderRadius: '20px',
                  backgroundColor: isActive ? `${colors.accent}20` : 'transparent',
                  color: isActive ? colors.accent : colors.textMuted,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                }}
              >
                {opt.label}
                <span style={{
                  padding: '0 5px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: 600,
                  backgroundColor: isActive ? colors.accent : colors.surface,
                  color: isActive ? 'white' : colors.textMuted,
                  minWidth: '18px',
                  textAlign: 'center',
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Row 2: Dropdowns + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Workflow Status */}
          <select
            value={workflowFilter}
            onChange={(e) => setWorkflowFilter(e.target.value as RecordingStatusTab)}
            style={{
              padding: '7px 10px',
              fontSize: '12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              backgroundColor: colors.surface,
              color: workflowFilter !== 'ALL' ? colors.text : colors.textMuted,
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All Stages</option>
            <option value="NEEDS_SCRIPT">Needs Script</option>
            <option value="GENERATING_SCRIPT">Generating</option>
            <option value="NOT_RECORDED">Scripted</option>
            <option value="AI_RENDERING">AI Rendering</option>
            <option value="READY_FOR_REVIEW">Ready for Review</option>
            <option value="RECORDED">Recorded</option>
            <option value="APPROVED_NEEDS_EDITS">Needs Edits</option>
            <option value="READY_TO_POST">Approved</option>
            <option value="POSTED">Posted</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* Brand Filter */}
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              fontSize: '12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              backgroundColor: colors.surface,
              color: brandFilter ? colors.text : colors.textMuted,
              cursor: 'pointer',
            }}
          >
            <option value="">All Brands</option>
            {brands.map(b => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>

          {/* Product Filter */}
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              fontSize: '12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              backgroundColor: colors.surface,
              color: productFilter ? colors.text : colors.textMuted,
              cursor: 'pointer',
              maxWidth: '180px',
            }}
          >
            <option value="">All Products</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.brand ? `${p.brand} — ` : ''}{p.name}</option>
            ))}
          </select>

          {/* Date Range */}
          <select
            value={dateRangeFilter}
            onChange={(e) => setDateRangeFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}
            style={{
              padding: '7px 10px',
              fontSize: '12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              backgroundColor: colors.surface,
              color: dateRangeFilter !== 'all' ? colors.text : colors.textMuted,
              cursor: 'pointer',
            }}
          >
            <option value="all">Any Date</option>
            <option value="today">Today</option>
            <option value="week">Past 7 Days</option>
            <option value="month">Past 30 Days</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}
            style={{
              padding: '7px 10px',
              fontSize: '12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              backgroundColor: colors.surface,
              color: priorityFilter !== 'all' ? colors.text : colors.textMuted,
              cursor: 'pointer',
            }}
          >
            <option value="all">Any Priority</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          {/* Assignee Filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              fontSize: '12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              backgroundColor: colors.surface,
              color: assigneeFilter ? colors.text : colors.textMuted,
              cursor: 'pointer',
            }}
          >
            <option value="">All Assignees</option>
            <option value="__unassigned__">Unassigned</option>
            {Array.from(new Set(queueVideos.map(v => v.claimed_by).filter(Boolean))).map(assignee => (
              <option key={assignee} value={assignee!}>
                {assignee === activeUser ? 'You' : (userMap[assignee!] || assignee!.slice(0, 8))}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'priority' | 'newest' | 'oldest' | 'sla')}
            style={{
              padding: '7px 10px',
              fontSize: '12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              backgroundColor: colors.surface,
              color: sortBy !== 'priority' ? colors.text : colors.textMuted,
              cursor: 'pointer',
            }}
          >
            <option value="priority">Sort: Priority</option>
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="sla">Sort: SLA Deadline</option>
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '7px 10px',
              fontSize: '12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              width: '160px',
              backgroundColor: colors.surface,
              color: colors.text,
            }}
          />

          {/* Clear All Filters */}
          {(searchQuery || brandFilter || assigneeFilter || workflowFilter !== 'ALL' || productFilter || dateRangeFilter !== 'all' || filterIntent !== 'all' || sortBy !== 'priority' || priorityFilter !== 'all') && (
            <button type="button"
              onClick={() => {
                setSearchQuery('');
                setBrandFilter('');
                setAssigneeFilter('');
                setWorkflowFilter('ALL');
                setProductFilter('');
                setDateRangeFilter('all');
                setFilterIntent('all');
                setSortBy('priority');
                setPriorityFilter('all');
              }}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: colors.textMuted,
                textDecoration: 'underline',
              }}
            >
              Clear All
            </button>
          )}

          {/* Count */}
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: colors.textMuted }}>
            {getIntentFilteredVideos().length} {getIntentFilteredVideos().length === 1 ? 'video' : 'videos'}
            {queueLoading && ' (loading...)'}
          </span>
        </div>
      </div>

      {/* Bulk Action Bar - Desktop only, appears when items selected */}
      {selectedVideoIds.size > 0 && isAdminMode && (
        <div className="hidden lg:flex" style={{
          marginBottom: '12px',
          padding: '10px 16px',
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span style={{ fontSize: '13px', color: colors.text, fontWeight: 500 }}>
            {selectedVideoIds.size} selected
          </span>
          <button type="button"
            onClick={bulkMarkWinner}
            disabled={bulkActionLoading}
            style={{
              padding: '6px 12px',
              backgroundColor: colors.success,
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: bulkActionLoading ? 'not-allowed' : 'pointer',
              opacity: bulkActionLoading ? 0.6 : 1,
            }}
          >
            Mark Winner
          </button>
          <button type="button"
            onClick={bulkMarkUnderperform}
            disabled={bulkActionLoading}
            style={{
              padding: '6px 12px',
              backgroundColor: colors.warning,
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: bulkActionLoading ? 'not-allowed' : 'pointer',
              opacity: bulkActionLoading ? 0.6 : 1,
            }}
          >
            Mark Underperform
          </button>
          <select
            disabled={bulkActionLoading}
            defaultValue=""
            onChange={e => { if (e.target.value) { bulkChangeStatus(e.target.value); e.target.value = ''; } }}
            style={{
              padding: '6px 12px',
              backgroundColor: colors.surface,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="" disabled>Move to...</option>
            <option value="NEEDS_SCRIPT">Needs Script</option>
            <option value="NOT_RECORDED">Scripted</option>
            <option value="RECORDED">Ready for Review</option>
            <option value="APPROVED_NEEDS_EDITS">Needs Edits</option>
            <option value="READY_TO_POST">Approved</option>
            <option value="POSTED">Posted</option>
          </select>
          <button type="button"
            onClick={bulkArchive}
            disabled={bulkActionLoading}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              color: '#f87171',
              border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: bulkActionLoading ? 'not-allowed' : 'pointer',
              opacity: bulkActionLoading ? 0.6 : 1,
            }}
          >
            Archive
          </button>
          <button type="button"
            onClick={clearSelection}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              color: colors.textMuted,
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Mobile: Header with Filter */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-800 -mx-4 mb-4">
        <h1 className="text-lg font-semibold text-white">Work Queue</h1>
        <button type="button"
          onClick={() => setFilterSheetOpen(true)}
          className="flex items-center gap-2 px-3 h-10 rounded-lg bg-zinc-800 text-sm text-zinc-300"
        >
          <Filter className="w-4 h-4" />
          Filter
          {Object.keys(mobileFilters).filter(k => mobileFilters[k as keyof typeof mobileFilters]).length > 0 && (
            <span className="w-5 h-5 rounded-full bg-teal-500 text-xs flex items-center justify-center text-white">
              {Object.keys(mobileFilters).filter(k => mobileFilters[k as keyof typeof mobileFilters]).length}
            </span>
          )}
        </button>
      </div>

      {/* Mobile: Card Layout */}
      <div className="lg:hidden pb-24">
        {queueLoading && queueVideos.length === 0 ? (
          <SkeletonVideoList count={5} />
        ) : getIntentFilteredVideos().length === 0 ? (
          <EmptyState
            icon={Film}
            title="No videos in queue"
            description={activeRecordingTab !== 'ALL'
              ? `No videos with status "${activeRecordingTab.replace(/_/g, ' ').toLowerCase()}". Try changing your filter.`
              : "Videos will appear here as they enter the workflow."
            }
            action={{
              label: 'Create Video',
              onClick: () => setShowCreateDrawer(true)
            }}
          />
        ) : (
          <PullToRefresh onRefresh={fetchQueueVideos} className="min-h-[calc(100vh-200px)]">
            <VideoQueueMobile
              videos={getIntentFilteredVideos().map(v => ({
                id: v.id,
                title: getVideoDisplayTitle(v),
                thumbnail: undefined,
                brand: v.brand_name || v.product_name || undefined,
                workflow: v.recording_status || v.status || 'Unknown',
                assignedTo: v.claimed_by || undefined,
                updatedAt: v.last_status_changed_at || v.created_at,
              }))}
              onVideoClick={(video) => {
                const fullVideo = getIntentFilteredVideos().find(v => v.id === video.id);
                if (fullVideo) {
                  setMobileDetailVideo(fullVideo);
                  setMobileDetailOpen(true);
                }
              }}
            />
          </PullToRefresh>
        )}
      </div>

      {/* Desktop: Board View */}
      {viewMode === 'board' && (
        <div className="hidden lg:block">
          <BoardView
            videos={getIntentFilteredVideos()}
            simpleMode={simpleView}
            activeUser={activeUser}
            isAdmin={isAdminMode}
            onClaimVideo={claimVideo}
            onReleaseVideo={releaseVideo}
            onExecuteTransition={executeTransition}
            onOpenAttachModal={openAttachModal}
            onOpenPostModal={openPostModal}
            onOpenHandoffModal={isAdminMode ? openHandoffModal : undefined}
            onRejectVideo={openRejectModal}
            onRefresh={fetchQueueVideos}
            filters={boardFilters}
            onFiltersChange={setBoardFilters}
            brands={brands}
            products={products}
            accounts={accounts}
            onShowToast={showToast}
          />
        </div>
      )}

      {/* Desktop: Quiet, Scannable Table */}
      {viewMode === 'list' && (
      <div className="hidden lg:block">
      {getIntentFilteredVideos().length > 0 ? (
        <table style={tableStyle}>
          <thead>
            <tr>
              {isAdminMode && (
                <th style={{ ...thStyle, width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedVideoIds.size === getIntentFilteredVideos().length && getIntentFilteredVideos().length > 0}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }}
                    title="Select all"
                  />
                </th>
              )}
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Video</th>
              <th style={thStyle}>Brand / Product</th>
              <th style={thStyle}>Workflow</th>
              <th style={thStyle}>Assigned To</th>
            </tr>
          </thead>
          <tbody>
            {getIntentFilteredVideos().map((video) => {
              const claimedByOther = isClaimedByOther(video);
              const claimedByMe = isClaimedByMe(video);
              const metaBadges = getVideoMetaBadges(video);

              // SLA indicator - subtle left border color
              const slaBorderColor = video.sla_status === 'overdue' ? colors.danger :
                video.sla_status === 'due_soon' ? colors.warning :
                video.sla_status === 'no_due_date' ? 'transparent' : 'transparent';

              return (
                <tr
                  key={video.id}
                  onClick={(e) => handleRowClick(e, video)}
                  style={{
                    cursor: 'pointer',
                    borderLeft: `3px solid ${slaBorderColor}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.surface2;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {/* Checkbox for bulk selection (admin only) */}
                  {isAdminMode && (
                    <td style={{ ...tdStyle, width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedVideoIds.has(video.id)}
                        onChange={() => toggleVideoSelection(video.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                  )}
                  {/* Status - subtle indicator */}
                  <td style={{ ...tdStyle, width: '90px' }}>
                    {video.sla_status === 'no_due_date' ? (
                      <span style={{ fontSize: '11px', color: colors.textMuted }}>No due date</span>
                    ) : video.sla_status === 'overdue' ? (
                      <span
                        title="This video is past its expected completion time"
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 500,
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          color: colors.danger,
                        }}
                      >
                        Past Due
                      </span>
                    ) : video.sla_status === 'due_soon' ? (
                      <span style={{ fontSize: '11px', color: colors.warning }}>Due Soon</span>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#2b8a3e' }}>On Track</span>
                    )}
                  </td>
                  {/* Video - readable title prominent, code muted */}
                  <td style={tdStyle}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: colors.text }}>
                      {getVideoDisplayTitle(video)}
                    </div>
                    {video.video_code && (
                      <div style={{ fontFamily: 'monospace', fontSize: '10px', color: colors.textMuted }}>
                        {video.video_code}
                      </div>
                    )}
                  </td>
                  {/* Brand / Product */}
                  <td style={tdStyle}>
                    {metaBadges.brand === '—' && metaBadges.sku === '—' ? (
                      <span style={{ fontSize: '12px', color: colors.textMuted, fontStyle: 'italic' }}>
                        Not set
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: colors.text }}>
                        {metaBadges.brand}{metaBadges.sku !== '—' ? ` · ${metaBadges.sku}` : ''}
                      </span>
                    )}
                  </td>
                  {/* Step - neutral pill with friendly label */}
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      backgroundColor: colors.surface2,
                      color: colors.text,
                      fontSize: '11px',
                      fontWeight: 500,
                    }}>
                      {(() => {
                        const status = video.recording_status || 'NOT_RECORDED';
                        switch (status) {
                          case 'NEEDS_SCRIPT': return 'Needs Script';
                          case 'GENERATING_SCRIPT': return 'Generating';
                          case 'NOT_RECORDED': return 'Scripted';
                          case 'AI_RENDERING': return 'AI Rendering';
                          case 'RECORDED': return 'Ready for Review';
                          case 'EDITED': return 'Ready for Review';
                          case 'APPROVED_NEEDS_EDITS': return 'Needs Edits';
                          case 'READY_TO_POST': return 'Approved';
                          case 'POSTED': return 'Posted';
                          case 'REJECTED': return 'Rejected';
                          default: return status.replace(/_/g, ' ');
                        }
                      })()}
                    </span>
                  </td>
                  {/* Owner */}
                  <td style={tdStyle}>
                    <span style={{ fontSize: '12px', color: colors.textMuted }}>
                      {claimedByMe ? 'You' : claimedByOther ? (userMap[video.claimed_by!] || video.claimed_by?.slice(0, 8)) : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: colors.textMuted,
          backgroundColor: colors.surface,
          borderRadius: '10px',
          border: `1px solid ${colors.border}`,
        }}>
          {queueLoading ? 'Loading...' : 'No videos match this filter'}
        </div>
      )}
      </div>
      )}

      {/* Mobile Video Detail Sheet */}
      <VideoDetailSheet
        video={mobileDetailVideo ? {
          id: mobileDetailVideo.id,
          title: getVideoDisplayTitle(mobileDetailVideo),
          brand: mobileDetailVideo.brand_name || mobileDetailVideo.product_name,
          workflow: mobileDetailVideo.recording_status || mobileDetailVideo.status || 'Unknown',
          assignedTo: mobileDetailVideo.claimed_by || undefined,
          script: mobileDetailVideo.script_locked_text || undefined,
        } : null}
        isOpen={mobileDetailOpen}
        onClose={() => {
          setMobileDetailOpen(false);
          setMobileDetailVideo(null);
        }}
        onApprove={mobileDetailVideo?.can_move_next ? async () => {
          if (mobileDetailVideo) {
            await handlePrimaryActionClick(mobileDetailVideo);
            setMobileDetailOpen(false);
            setMobileDetailVideo(null);
          }
        } : undefined}
      />

      {/* Mobile Filter Sheet */}
      <FilterSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        filters={mobileFilters}
        setFilters={setMobileFilters}
        brands={brands.map(b => ({ value: b.name, label: b.name }))}
        onApply={(newFilters) => {
          setMobileFilters(newFilters);
          // Map mobile filters to existing filter system
          if (newFilters.brand) {
            setBrandFilter(newFilters.brand);
          } else {
            setBrandFilter('');
          }
          if (newFilters.assignedTo) {
            if (newFilters.assignedTo === 'me') {
              setFilterIntent('my_work');
              setAssigneeFilter('');
            } else if (newFilters.assignedTo === 'unassigned') {
              setAssigneeFilter('__unassigned__');
              setFilterIntent('all');
            } else {
              setAssigneeFilter('');
              setFilterIntent('all');
            }
          } else {
            setAssigneeFilter('');
          }
          if (newFilters.status) {
            const statusMap: Record<string, RecordingStatusTab> = {
              'Scripted': 'NOT_RECORDED',
              'AI Rendering': 'AI_RENDERING',
              'Ready for Review': 'READY_FOR_REVIEW',
              'Recorded': 'RECORDED',
              'Needs Edits': 'APPROVED_NEEDS_EDITS',
              'Approved': 'READY_TO_POST',
              'Posted': 'POSTED',
              'Rejected': 'REJECTED',
            };
            setWorkflowFilter(statusMap[newFilters.status] || 'ALL');
          } else {
            setWorkflowFilter('ALL');
          }
        }}
      />

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
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: colors.text }}>Attach Script</h2>
              <button type="button"
                onClick={closeAttachModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: colors.textMuted,
                }}
              >
                ×
              </button>
            </div>

            <p style={{ color: colors.textMuted, fontSize: '14px', marginBottom: '20px' }}>
              Video: <code style={{ backgroundColor: colors.surface, padding: '2px 6px', borderRadius: '4px', color: colors.text }}>{attachModalVideoId.slice(0, 8)}...</code>
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
                    <span style={{ color: '#856404' }}>This video already has an approved script.</span>
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
                  <button type="button"
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
                  <button type="button"
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

      {/* Reject Modal (drag-to-REJECTED from board) */}
      {rejectModalVideoId && (
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
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: colors.text, fontSize: '18px' }}>Reject Video</h2>
              <button type="button"
                onClick={closeRejectModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: colors.textMuted,
                }}
              >
                &times;
              </button>
            </div>

            <p style={{ color: colors.textMuted, fontSize: '14px', marginBottom: '12px' }}>
              Select a reason:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              {REJECT_TAGS.map((tag) => (
                <button type="button"
                  key={tag.code}
                  onClick={() => setRejectTag(rejectTag === tag.code ? null : tag.code)}
                  style={{
                    padding: '10px 12px',
                    backgroundColor: rejectTag === tag.code ? '#e03131' : colors.surface,
                    color: rejectTag === tag.code ? 'white' : colors.text,
                    border: `1px solid ${rejectTag === tag.code ? '#e03131' : colors.border}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: rejectTag === tag.code ? 600 : 'normal',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tag.label}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: colors.textMuted }}>
                What went wrong?
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Describe why this video is being rejected..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: colors.surface,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  fontSize: '13px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            {!rejectTag && !rejectReason.trim() && (
              <p style={{ margin: '0 0 12px 0', color: '#e03131', fontSize: '12px' }}>
                Select a tag or add a note before rejecting.
              </p>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button"
                onClick={submitReject}
                disabled={rejecting || (!rejectTag && !rejectReason.trim())}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: (!rejectTag && !rejectReason.trim()) ? '#666' : '#e03131',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: (rejecting || (!rejectTag && !rejectReason.trim())) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  opacity: (!rejectTag && !rejectReason.trim()) ? 0.5 : 1,
                }}
              >
                {rejecting ? 'Rejecting...' : 'Reject'}
              </button>
              <button type="button"
                onClick={closeRejectModal}
                style={{
                  padding: '12px 20px',
                  backgroundColor: colors.surface,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
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
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '450px',
            width: '90%',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: colors.text }}>Mark as Posted</h2>
              <button type="button"
                onClick={closePostModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: colors.textMuted,
                }}
              >
                ×
              </button>
            </div>

            <p style={{ color: colors.textMuted, fontSize: '14px', marginBottom: '20px' }}>
              Video: <code style={{ backgroundColor: colors.surface, padding: '2px 6px', borderRadius: '4px', color: colors.text }}>{postModalVideoId.slice(0, 8)}...</code>
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
              <button type="button"
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
              <button type="button"
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
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '450px',
            width: '90%',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: colors.text }}>Handoff Video</h2>
              <button type="button"
                onClick={closeHandoffModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: colors.textMuted,
                }}
              >
                ×
              </button>
            </div>

            <p style={{ color: colors.textMuted, fontSize: '14px', marginBottom: '20px' }}>
              Video: <code style={{ backgroundColor: colors.surface, padding: '2px 6px', borderRadius: '4px', color: colors.text }}>{handoffModalVideoId.slice(0, 8)}...</code>
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
              <button type="button"
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
              <button type="button"
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
          onAdvanceToNext={advanceToNextVideo}
        />
      )}

      {/* Create Video Drawer */}
      {showCreateDrawer && (
        <CreateVideoDrawer
          onClose={() => setShowCreateDrawer(false)}
          onSuccess={() => {
            fetchQueueVideos();
          }}
          onShowToast={(message) => showToast(message, 'success')}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '12px 20px',
            backgroundColor: toast.type === 'success' ? '#40c057' : '#e03131',
            color: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 2000,
            fontSize: '14px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'slideIn 0.2s ease-out',
          }}
        >
          <span>{toast.type === 'success' ? '' : ''}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
