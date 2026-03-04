'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, RefreshCw, X,
  Video, Send, Eye, Calendar, GripVertical,
  LayoutGrid, Zap, Loader2, Star, Trash2,
  SlidersHorizontal, ChevronDown, ChevronRight as ChevronRightIcon,
  Package, Clock, ExternalLink, Upload, Copy, FileText, Scissors,
  Mic, ArrowRight, CalendarDays,
} from 'lucide-react';
import { CONTENT_ITEM_STATUSES } from '@/lib/content-items/types';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import PlanGate from '@/components/PlanGate';
import { SkeletonVideoList } from '@/components/ui/Skeleton';
import { PageErrorState } from '@/components/ui/PageErrorState';
import { useToast } from '@/contexts/ToastContext';
import { CONTENT_TYPES } from '@/lib/content-types';

// --- Content type helper ---
function getContentTypeName(id: string): string {
  const ct = CONTENT_TYPES.find(c => c.id === id);
  return ct?.name || id;
}

// --- Types ---

interface CalendarVideo {
  id: string;
  video_code: string | null;
  status: string | null;
  recording_status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  google_drive_url: string | null;
  final_video_url: string | null;
  product_name: string | null;
  product_brand: string | null;
  account_name: string | null;
  account_handle: string | null;
}

interface CalendarContentItem {
  id: string;
  type: 'content_item';
  short_id: string;
  title: string;
  status: string;
  due_at: string;
  drive_folder_url: string | null;
  brief_doc_url: string | null;
  final_video_url: string | null;
  ai_description: string | null;
  hashtags: string[] | null;
  caption: string | null;
  editor_notes_status: string | null;
  product_name: string | null;
}

type CalendarEntry = (CalendarVideo & { type?: 'video' }) | CalendarContentItem;

interface CalendarData {
  calendar: Record<string, CalendarEntry[]>;
  total: number;
  status_counts: Record<string, number>;
}

interface FullScript {
  hook: string;
  setup: string;
  body: string;
  cta: string;
  on_screen_text: string[];
  filming_notes: string;
  persona: string;
  sales_approach: string;
  estimated_length: string;
}

interface PackageItem {
  id: string;
  product_name: string;
  brand: string;
  content_type: string;
  hook: string;
  full_script: FullScript | null;
  score: number;
  kept: boolean;
  added_to_pipeline: boolean;
}

interface ContentPackage {
  id: string;
  created_at: string;
  status: 'generating' | 'complete' | 'failed';
  items: PackageItem[];
  error?: string;
}

// --- Status helpers ---

type StatusGroup = 'approved' | 'review' | 'posted' | 'rejected' | 'rendering';

function getStatusGroup(recordingStatus: string): StatusGroup {
  switch (recordingStatus) {
    case 'READY_TO_POST': return 'approved';
    case 'EDITED':
    case 'READY_FOR_REVIEW': return 'review';
    case 'POSTED': return 'posted';
    case 'REJECTED': return 'rejected';
    default: return 'rendering';
  }
}

const STATUS_COLORS: Record<StatusGroup, { dot: string; bg: string; border: string; text: string; label: string }> = {
  approved:  { dot: 'bg-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/30',  text: 'text-green-400',  label: 'Approved' },
  review:    { dot: 'bg-amber-400',  bg: 'bg-amber-400/10',  border: 'border-amber-400/30',  text: 'text-amber-400',  label: 'Ready for Review' },
  posted:    { dot: 'bg-teal-400',   bg: 'bg-teal-400/10',   border: 'border-teal-400/30',   text: 'text-teal-400',   label: 'Posted' },
  rejected:  { dot: 'bg-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/30',    text: 'text-red-400',    label: 'Rejected' },
  rendering: { dot: 'bg-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/30', text: 'text-teal-400', label: 'In Production' },
};

// --- Score helpers (from content-package) ---

function getScoreColor(score: number): string {
  if (score >= 9) return 'text-amber-300';
  if (score >= 7) return 'text-emerald-400';
  if (score >= 5) return 'text-yellow-400';
  return 'text-red-400';
}

function getScoreBg(score: number): string {
  if (score >= 9) return 'bg-amber-400/15 border-amber-400/30';
  if (score >= 7) return 'bg-emerald-400/15 border-emerald-400/30';
  if (score >= 5) return 'bg-yellow-400/15 border-yellow-400/30';
  return 'bg-red-400/15 border-red-400/30';
}

// Studio URL builder
const studioUrl = (item: PackageItem) => {
  const hook = item.full_script?.hook || item.hook;
  const params = new URLSearchParams();
  params.set("hook", hook);
  if (item.content_type) params.set("content_type", item.content_type);
  if (item.product_name) params.set("inspiration", item.product_name);
  return `/admin/content-studio?${params.toString()}`;
};

// --- Date helpers ---

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortDate(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
}

function isPast(date: Date): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return date < now;
}

/** Convert "HH:MM" (24h) to "H:MM AM/PM" */
function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${suffix}`;
}

const TIME_OPTIONS = [
  { label: '7:00 AM', value: '07:00' },
  { label: '10:00 AM', value: '10:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '3:00 PM', value: '15:00' },
  { label: '7:00 PM', value: '19:00' },
  { label: '9:00 PM', value: '21:00' },
  { label: 'No time', value: '' },
];

function getWeekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Get all the dates for a full month grid (Mon-Sun rows, includes padding days from prev/next month) */
function getMonthGridDates(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  // Find the Monday on or before the 1st
  const startDay = firstOfMonth.getDay(); // 0=Sun
  const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
  const gridStart = new Date(year, month, 1 + mondayOffset);

  // Find the Sunday on or after the last day
  const endDay = lastOfMonth.getDay(); // 0=Sun
  const sundayOffset = endDay === 0 ? 0 : 7 - endDay;
  const gridEnd = new Date(year, month + 1, 0 + sundayOffset);

  const dates: Date[] = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// --- Component ---

export default function ContentPlannerPage() {
  const searchParams = useSearchParams();
  const { showSuccess, showError } = useToast();

  // View modes
  const [viewMode, setViewMode] = useState<'calendar' | 'grid'>(
    searchParams.get('view') === 'grid' ? 'grid' : 'calendar'
  );
  const [calendarMode, setCalendarMode] = useState<'week' | 'month'>('week');

  // Calendar state
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseMonday, setBaseMonday] = useState(() => getMonday(new Date()));
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dragVideo, setDragVideo] = useState<CalendarVideo | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const dragCounterRef = useRef<Record<string, number>>({});

  // Ideas panel state
  const [pkg, setPkg] = useState<ContentPackage | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(true);
  const [dragIdea, setDragIdea] = useState<PackageItem | null>(null);
  const [schedulingIdea, setSchedulingIdea] = useState<string | null>(null);

  // Content item interaction state
  const [dragContentItem, setDragContentItem] = useState<CalendarContentItem | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [editingDueDate, setEditingDueDate] = useState<string | null>(null);

  // Time picker state
  const [editingTimeVideoId, setEditingTimeVideoId] = useState<string | null>(null);
  const [savingTime, setSavingTime] = useState(false);

  // Grid view state (reused from content-package)
  const [addingToPipeline, setAddingToPipeline] = useState<Set<string>>(new Set());
  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'score' | 'product' | 'content_type'>('score');
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const [filterContentType, setFilterContentType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'kept' | 'discarded'>('all');

  // =====================
  // CALENDAR DATA
  // =====================

  // Compute date ranges based on calendar mode
  const weekDays = useMemo(() => {
    if (calendarMode !== 'week') return [];
    return [0, 1, 2].map(i => {
      const mon = new Date(baseMonday);
      mon.setDate(mon.getDate() + i * 7);
      return getWeekDates(mon);
    });
  }, [calendarMode, baseMonday]);

  const monthDays = useMemo(() => {
    if (calendarMode !== 'month') return [];
    return getMonthGridDates(monthDate.getFullYear(), monthDate.getMonth());
  }, [calendarMode, monthDate]);

  const allDays = calendarMode === 'week' ? weekDays.flat() : monthDays;
  const rangeStart = allDays.length > 0 ? formatDateKey(allDays[0]) : '';
  const rangeEnd = allDays.length > 0 ? formatDateKey(allDays[allDays.length - 1]) : '';

  const fetchCalendar = useCallback(async () => {
    if (!rangeStart || !rangeEnd) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar?start=${rangeStart}&end=${rangeEnd}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || json.error || 'Failed to load calendar');
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  // =====================
  // IDEAS / PACKAGE DATA
  // =====================

  const fetchPackage = useCallback(async () => {
    setIdeasLoading(true);
    try {
      const res = await fetch('/api/content-package/generate');
      const d = await res.json();
      if (d.ok && d.data) {
        setPkg(d.data);
      } else {
        setPkg(null);
      }
    } catch (err) {
      console.error('Failed to fetch package:', err);
      setPkg(null);
    } finally {
      setIdeasLoading(false);
    }
  }, []);

  useEffect(() => { fetchPackage(); }, [fetchPackage]);

  // Poll while generating
  useEffect(() => {
    if (!pkg || pkg.status !== 'generating') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/content-package/generate');
        const d = await res.json();
        if (d.ok && d.data) {
          setPkg(d.data);
          if (d.data.status !== 'generating') {
            clearInterval(interval);
            if (d.data.status === 'complete') {
              showSuccess(`Package generated with ${d.data.items?.length || 0} items`);
            }
          }
        }
      } catch { /* retry */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [pkg?.status, pkg?.id, showSuccess]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/content-package/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 20 }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        showError(d.error || 'Failed to generate package');
        return;
      }
      setPkg(d.data);
      showSuccess('Package generation started');
    } catch {
      showError('Network error generating package');
    } finally {
      setGenerating(false);
    }
  };

  // =====================
  // FILTERED IDEAS
  // =====================

  const filterOptions = useMemo(() => {
    if (!pkg?.items) return { products: [] as string[], contentTypes: [] as string[] };
    const products = [...new Set(pkg.items.map(i => i.product_name))].sort();
    const contentTypes = [...new Set(pkg.items.map(i => i.content_type))].sort();
    return { products, contentTypes };
  }, [pkg?.items]);

  const displayItems = useMemo(() => {
    if (!pkg?.items) return [];
    let items = [...pkg.items];
    items = items.map(item => ({
      ...item,
      kept: discardedIds.has(item.id) ? false : item.kept,
    }));
    if (filterProduct !== 'all') items = items.filter(i => i.product_name === filterProduct);
    if (filterContentType !== 'all') items = items.filter(i => i.content_type === filterContentType);
    if (filterStatus === 'kept') items = items.filter(i => i.kept && !discardedIds.has(i.id));
    else if (filterStatus === 'discarded') items = items.filter(i => discardedIds.has(i.id));
    switch (sortBy) {
      case 'score': items.sort((a, b) => b.score - a.score); break;
      case 'product': items.sort((a, b) => a.product_name.localeCompare(b.product_name)); break;
      case 'content_type': items.sort((a, b) => a.content_type.localeCompare(b.content_type)); break;
    }
    return items;
  }, [pkg?.items, sortBy, filterProduct, filterContentType, filterStatus, discardedIds]);

  // Ideas for the sidebar panel (unscheduled, not discarded)
  const sidebarIdeas = useMemo(() => {
    if (!pkg?.items) return [];
    return pkg.items
      .filter(i => i.kept && !i.added_to_pipeline && !discardedIds.has(i.id))
      .sort((a, b) => b.score - a.score);
  }, [pkg?.items, discardedIds]);

  // =====================
  // THIS WEEK SUMMARY
  // =====================

  const thisWeekMonday = getMonday(new Date());
  const thisWeekDates = getWeekDates(thisWeekMonday).map(formatDateKey);
  const thisWeekVideos = data
    ? thisWeekDates.flatMap(d => data.calendar[d] || [])
    : [];
  const thisWeekVideoEntries = thisWeekVideos.filter((v): v is CalendarVideo & { type?: 'video' } => (v as CalendarContentItem).type !== 'content_item');
  const toPost = thisWeekVideoEntries.filter(v => v.recording_status === 'READY_TO_POST').length;
  const toReview = thisWeekVideoEntries.filter(v => ['EDITED', 'READY_FOR_REVIEW'].includes(v.recording_status)).length;
  const inProduction = thisWeekVideoEntries.filter(v =>
    !['READY_TO_POST', 'POSTED', 'REJECTED', 'EDITED', 'READY_FOR_REVIEW'].includes(v.recording_status)
  ).length;

  // =====================
  // DRAG & DROP — VIDEOS (reschedule)
  // =====================

  const handleDragStart = (e: React.DragEvent, video: CalendarVideo) => {
    setDragVideo(video);
    setDragIdea(null);
    setSelectedDay(null); // Close drawer so drop targets are reachable
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', video.id);
    e.dataTransfer.setData('application/x-type', 'video');
  };

  const handleDragEnter = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    if (!dragCounterRef.current[dateKey]) dragCounterRef.current[dateKey] = 0;
    dragCounterRef.current[dateKey]++;
    setDropTarget(dateKey);
  };

  const handleDragLeave = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    if (!dragCounterRef.current[dateKey]) dragCounterRef.current[dateKey] = 0;
    dragCounterRef.current[dateKey]--;
    if (dragCounterRef.current[dateKey] <= 0) {
      dragCounterRef.current[dateKey] = 0;
      if (dropTarget === dateKey) setDropTarget(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragIdea ? 'copy' : 'move';
  };

  const isAnyDragging = dragVideo !== null || dragIdea !== null || dragContentItem !== null;

  // Drop handler — reschedule existing video
  const handleDropVideo = async (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    dragCounterRef.current = {};
    setDropTarget(null);

    if (!dragVideo || dragVideo.scheduled_date === dateKey) {
      setDragVideo(null);
      return;
    }

    const oldDate = dragVideo.scheduled_date;
    const movedVideo = { ...dragVideo, scheduled_date: dateKey };

    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      const cal = { ...prev.calendar };
      cal[oldDate] = (cal[oldDate] || []).filter(v => v.id !== dragVideo.id);
      if (cal[oldDate].length === 0) delete cal[oldDate];
      cal[dateKey] = [...(cal[dateKey] || []), movedVideo];
      return { ...prev, calendar: cal };
    });

    setDragVideo(null);
    setRescheduling(true);

    try {
      const res = await fetch('/api/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: dragVideo.id, scheduled_date: dateKey }),
      });
      if (!res.ok) {
        // Revert
        setData(prev => {
          if (!prev) return prev;
          const cal = { ...prev.calendar };
          cal[dateKey] = (cal[dateKey] || []).filter(v => v.id !== dragVideo.id);
          if (cal[dateKey].length === 0) delete cal[dateKey];
          cal[oldDate] = [...(cal[oldDate] || []), dragVideo];
          return { ...prev, calendar: cal };
        });
      }
    } catch {
      // Revert
      setData(prev => {
        if (!prev) return prev;
        const cal = { ...prev.calendar };
        cal[dateKey] = (cal[dateKey] || []).filter(v => v.id !== dragVideo.id);
        if (cal[dateKey].length === 0) delete cal[dateKey];
        cal[oldDate] = [...(cal[oldDate] || []), dragVideo];
        return { ...prev, calendar: cal };
      });
    } finally {
      setRescheduling(false);
    }
  };

  // =====================
  // DRAG & DROP — CONTENT ITEMS (reschedule due_at)
  // =====================

  const handleContentItemDragStart = (e: React.DragEvent, ci: CalendarContentItem) => {
    setDragContentItem(ci);
    setDragVideo(null);
    setDragIdea(null);
    setSelectedDay(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ci.id);
    e.dataTransfer.setData('application/x-type', 'content_item');
  };

  const handleDropContentItem = async (dateKey: string, ci: CalendarContentItem) => {
    const oldDate = ci.due_at.slice(0, 10);
    if (oldDate === dateKey) return;

    const newDueAt = `${dateKey}T${ci.due_at.slice(11) || '12:00:00Z'}`;
    const movedItem = { ...ci, due_at: newDueAt };

    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      const cal = { ...prev.calendar };
      cal[oldDate] = (cal[oldDate] || []).filter(v => v.id !== ci.id);
      if (cal[oldDate].length === 0) delete cal[oldDate];
      cal[dateKey] = [...(cal[dateKey] || []), movedItem];
      return { ...prev, calendar: cal };
    });

    try {
      const res = await fetch(`/api/content-items/${ci.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_at: newDueAt }),
      });
      const json = await res.json();
      if (!json.ok) {
        // Revert
        setData(prev => {
          if (!prev) return prev;
          const cal = { ...prev.calendar };
          cal[dateKey] = (cal[dateKey] || []).filter(v => v.id !== ci.id);
          if (cal[dateKey].length === 0) delete cal[dateKey];
          cal[oldDate] = [...(cal[oldDate] || []), ci];
          return { ...prev, calendar: cal };
        });
        showError('Failed to reschedule content item');
      } else {
        showSuccess(`Moved to ${dateKey}`);
      }
    } catch {
      setData(prev => {
        if (!prev) return prev;
        const cal = { ...prev.calendar };
        cal[dateKey] = (cal[dateKey] || []).filter(v => v.id !== ci.id);
        if (cal[dateKey].length === 0) delete cal[dateKey];
        cal[oldDate] = [...(cal[oldDate] || []), ci];
        return { ...prev, calendar: cal };
      });
      showError('Network error rescheduling');
    }
  };

  // =====================
  // CONTENT ITEM STATUS UPDATE
  // =====================

  const handleContentItemStatusChange = async (ci: CalendarContentItem, newStatus: string) => {
    if (ci.status === newStatus) return;
    setUpdatingStatus(ci.id);
    const oldStatus = ci.status;

    // Optimistic update in calendar data
    setData(prev => {
      if (!prev) return prev;
      const cal = { ...prev.calendar };
      const dateKey = ci.due_at.slice(0, 10);
      cal[dateKey] = (cal[dateKey] || []).map(v =>
        v.id === ci.id ? { ...v, status: newStatus } : v
      );
      return { ...prev, calendar: cal };
    });

    try {
      const res = await fetch(`/api/content-items/${ci.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!json.ok) {
        // Revert
        setData(prev => {
          if (!prev) return prev;
          const cal = { ...prev.calendar };
          const dateKey = ci.due_at.slice(0, 10);
          cal[dateKey] = (cal[dateKey] || []).map(v =>
            v.id === ci.id ? { ...v, status: oldStatus } : v
          );
          return { ...prev, calendar: cal };
        });
        showError(json.error || 'Failed to update status');
      } else {
        showSuccess(`Status updated to ${newStatus.replace(/_/g, ' ')}`);
      }
    } catch {
      setData(prev => {
        if (!prev) return prev;
        const cal = { ...prev.calendar };
        const dateKey = ci.due_at.slice(0, 10);
        cal[dateKey] = (cal[dateKey] || []).map(v =>
          v.id === ci.id ? { ...v, status: oldStatus } : v
        );
        return { ...prev, calendar: cal };
      });
      showError('Network error updating status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  // =====================
  // CONTENT ITEM DUE DATE UPDATE (mobile picker)
  // =====================

  const handleContentItemDueDateChange = async (ci: CalendarContentItem, newDate: string) => {
    setEditingDueDate(null);
    const oldDateKey = ci.due_at.slice(0, 10);
    if (oldDateKey === newDate) return;
    await handleDropContentItem(newDate, ci);
  };

  // =====================
  // DRAG & DROP — IDEAS (schedule new)
  // =====================

  const handleIdeaDragStart = (e: React.DragEvent, item: PackageItem) => {
    setDragIdea(item);
    setDragVideo(null);
    setSelectedDay(null); // Close drawer so drop targets are reachable
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.setData('application/x-type', 'idea');
  };

  const handleDropIdea = async (dateKey: string, item: PackageItem) => {
    setSchedulingIdea(item.id);
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: item.product_name,
          brand: item.brand,
          content_type: item.content_type,
          hook_text: item.hook,
          score: item.score,
          source: 'content_package',
          package_id: pkg?.id,
          scheduled_date: dateKey,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        showError(d.error || 'Failed to schedule idea');
        return;
      }

      // Add to calendar optimistically
      const newVideo: CalendarVideo = {
        id: d.data.video_id,
        video_code: d.data.video_code,
        status: 'needs_edit',
        recording_status: d.data.status || 'NEEDS_SCRIPT',
        scheduled_date: dateKey,
        scheduled_time: null,
        google_drive_url: null,
        final_video_url: null,
        product_name: item.product_name,
        product_brand: item.brand,
        account_name: null,
        account_handle: null,
      };
      setData(prev => {
        if (!prev) return prev;
        const cal = { ...prev.calendar };
        cal[dateKey] = [...(cal[dateKey] || []), newVideo];
        return { ...prev, calendar: cal, total: prev.total + 1 };
      });

      // Mark item as added to pipeline
      setPkg(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(i =>
            i.id === item.id ? { ...i, added_to_pipeline: true } : i
          ),
        };
      });

      showSuccess(`"${item.product_name}" scheduled for ${dateKey}`);
    } catch {
      showError('Network error scheduling idea');
    } finally {
      setSchedulingIdea(null);
    }
  };

  // Unified drop handler
  const handleDrop = async (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    dragCounterRef.current = {};
    setDropTarget(null);

    const itemType = e.dataTransfer.getData('application/x-type');

    if (itemType === 'content_item' && dragContentItem) {
      const ciToMove = dragContentItem;
      setDragContentItem(null);
      await handleDropContentItem(dateKey, ciToMove);
    } else if (itemType === 'idea' && dragIdea) {
      const ideaToSchedule = dragIdea;
      setDragIdea(null);
      await handleDropIdea(dateKey, ideaToSchedule);
    } else if (dragVideo) {
      await handleDropVideo(e, dateKey);
    } else {
      setDragVideo(null);
      setDragIdea(null);
      setDragContentItem(null);
    }
  };

  const handleDragEnd = () => {
    setDragVideo(null);
    setDragIdea(null);
    setDragContentItem(null);
    setDropTarget(null);
    dragCounterRef.current = {};
  };

  // =====================
  // TIME CHANGE
  // =====================

  const handleTimeChange = async (videoId: string, dateKey: string, newTime: string) => {
    setSavingTime(true);
    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      const cal = { ...prev.calendar };
      cal[dateKey] = (cal[dateKey] || []).map(v =>
        v.id === videoId ? { ...v, scheduled_time: newTime || null } : v
      );
      return { ...prev, calendar: cal };
    });
    setEditingTimeVideoId(null);
    try {
      const res = await fetch('/api/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, scheduled_time: newTime || null }),
      });
      const json = await res.json();
      if (!json.ok) showError('Failed to update time');
    } catch {
      showError('Network error updating time');
      fetchCalendar(); // Revert on failure
    } finally {
      setSavingTime(false);
    }
  };

  // =====================
  // GRID VIEW ACTIONS
  // =====================

  const discardItem = useCallback((itemId: string) => {
    setDiscardedIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const addToPipeline = async (item: PackageItem) => {
    setAddingToPipeline(prev => new Set(prev).add(item.id));
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: item.product_name,
          brand: item.brand,
          content_type: item.content_type,
          hook_text: item.hook,
          score: item.score,
          source: 'content_package',
          package_id: pkg?.id,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        showError(d.error || 'Failed to add to pipeline');
        return;
      }
      setPkg(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(i =>
            i.id === item.id ? { ...i, added_to_pipeline: true } : i
          ),
        };
      });
      showSuccess(`"${item.product_name}" added to pipeline`);
    } catch {
      showError('Network error adding to pipeline');
    } finally {
      setAddingToPipeline(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // =====================
  // NAVIGATION
  // =====================

  const goToToday = () => {
    setBaseMonday(getMonday(new Date()));
    setMonthDate(new Date());
  };
  const goBack = () => {
    if (calendarMode === 'week') {
      const d = new Date(baseMonday);
      d.setDate(d.getDate() - 7);
      setBaseMonday(d);
    } else {
      const d = new Date(monthDate);
      d.setMonth(d.getMonth() - 1);
      setMonthDate(d);
    }
  };
  const goForward = () => {
    if (calendarMode === 'week') {
      const d = new Date(baseMonday);
      d.setDate(d.getDate() + 7);
      setBaseMonday(d);
    } else {
      const d = new Date(monthDate);
      d.setMonth(d.getMonth() + 1);
      setMonthDate(d);
    }
  };

  // =====================
  // RENDER HELPERS
  // =====================

  const selectedDayVideos = useMemo(() => {
    if (!selectedDay || !data) return [];
    const entries = data.calendar[selectedDay] || [];
    return [...entries].sort((a, b) => {
      const aTime = (a as CalendarVideo).scheduled_time;
      const bTime = (b as CalendarVideo).scheduled_time;
      if (aTime && !bTime) return -1;
      if (!aTime && bTime) return 1;
      if (aTime && bTime) return aTime.localeCompare(bTime);
      return 0;
    });
  }, [selectedDay, data]);

  const CI_STATUS_COLORS: Record<string, string> = {
    briefing: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
    ready_to_record: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    recorded: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    editing: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    ready_to_post: 'bg-teal-500/10 border-teal-500/30 text-teal-400',
    posted: 'bg-green-500/10 border-green-500/30 text-green-400',
  };

  const CI_PILL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    briefing: { bg: 'bg-purple-400/10', border: 'border-purple-400/30', text: 'text-purple-400' },
    ready_to_record: { bg: 'bg-amber-400/10', border: 'border-amber-400/30', text: 'text-amber-400' },
    recorded: { bg: 'bg-blue-400/10', border: 'border-blue-400/30', text: 'text-blue-400' },
    editing: { bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', text: 'text-yellow-400' },
    ready_to_post: { bg: 'bg-teal-400/10', border: 'border-teal-400/30', text: 'text-teal-400' },
    posted: { bg: 'bg-green-400/10', border: 'border-green-400/30', text: 'text-green-400' },
  };

  const renderVideoPill = (video: CalendarVideo, compact = false) => {
    const group = getStatusGroup(video.recording_status);
    const colors = STATUS_COLORS[group];
    return (
      <div
        key={video.id}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          handleDragStart(e, video);
        }}
        onDragEnd={handleDragEnd}
        className={`
          ${colors.bg} ${colors.border} border rounded-md px-1.5 py-0.5
          text-[10px] truncate cursor-grab active:cursor-grabbing
          hover:brightness-125 transition-all
        `}
        onClick={(e) => e.stopPropagation()}
        title={`${video.product_name || video.video_code || 'Video'} (${colors.label})`}
      >
        <span className={`${colors.text} truncate block max-w-full`}>
          {video.scheduled_time ? `${formatTime12h(video.scheduled_time)} · ` : ''}{video.product_name || video.video_code || 'Video'}
        </span>
      </div>
    );
  };

  const renderContentItemPill = (ci: CalendarContentItem) => {
    const pillColors = CI_PILL_COLORS[ci.status] || CI_PILL_COLORS.briefing;
    return (
      <div
        key={ci.id}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          handleContentItemDragStart(e, ci);
        }}
        onDragEnd={handleDragEnd}
        className={`
          ${pillColors.bg} ${pillColors.border} border rounded-md px-1.5 py-0.5
          text-[10px] truncate cursor-grab active:cursor-grabbing
          hover:brightness-125 transition-all flex items-center gap-1
        `}
        onClick={(e) => e.stopPropagation()}
        title={`${ci.title} (${ci.status.replace(/_/g, ' ')})`}
      >
        <FileText className="w-2.5 h-2.5 flex-shrink-0" />
        <span className={`${pillColors.text} truncate block`}>
          {ci.product_name ? `${ci.product_name} · ` : ''}{ci.title}
        </span>
      </div>
    );
  };

  const renderDayCell = (day: Date, dayIdx: number, compact = false) => {
    const dateKey = formatDateKey(day);
    const allEntries = data?.calendar[dateKey] || [];
    const videoEntries = allEntries.filter((v): v is CalendarVideo & { type?: 'video' } => (v as CalendarContentItem).type !== 'content_item');
    const ciEntries = allEntries.filter((v): v is CalendarContentItem => (v as CalendarContentItem).type === 'content_item');
    const today = isToday(day);
    const past = isPast(day) && !today;
    const isDropping = dropTarget === dateKey && isAnyDragging;
    const isCurrentMonth = calendarMode === 'month' ? day.getMonth() === monthDate.getMonth() : true;
    const maxPills = compact ? 2 : 4;
    const totalEntries = videoEntries.length + ciEntries.length;

    return (
      <div
        key={dateKey}
        className={`
          rounded-xl border transition-all cursor-pointer select-none
          ${compact ? 'min-h-[80px] p-1.5' : 'min-h-[80px] md:min-h-[120px] p-1.5 md:p-2'}
          ${!isCurrentMonth ? 'opacity-40' : ''}
          ${today
            ? 'bg-teal-500/5 border-teal-500/30'
            : isDropping
              ? 'bg-teal-500/10 border-teal-500/40 scale-[1.02]'
              : past
                ? 'bg-zinc-950/50 border-zinc-800/50'
                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
          }
        `}
        onClick={() => { if (!isAnyDragging) setSelectedDay(dateKey); }}
        onDragEnter={(e) => handleDragEnter(e, dateKey)}
        onDragLeave={(e) => handleDragLeave(e, dateKey)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, dateKey)}
      >
        <div className="flex items-center justify-between mb-1">
          {calendarMode === 'week' && (
            <span className={`text-[10px] font-medium ${past ? 'text-zinc-600' : 'text-zinc-500'}`}>
              {DAY_NAMES[dayIdx]}
            </span>
          )}
          <span className={`
            text-xs font-semibold ml-auto
            ${today
              ? 'bg-teal-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px]'
              : past ? 'text-zinc-600' : isCurrentMonth ? 'text-zinc-300' : 'text-zinc-600'
            }
          `}>
            {day.getDate()}
          </span>
        </div>
        <div className="space-y-0.5">
          {videoEntries.slice(0, maxPills).map(video => renderVideoPill(video, compact))}
          {ciEntries.slice(0, Math.max(0, maxPills - videoEntries.length)).map(ci => renderContentItemPill(ci))}
          {totalEntries > maxPills && (
            <div className="text-[10px] text-zinc-500 text-center">
              +{totalEntries - maxPills} more
            </div>
          )}
        </div>
      </div>
    );
  };

  // =====================
  // RENDER
  // =====================

  if (error && !loading && viewMode === 'calendar') {
    return (
      <PullToRefresh onRefresh={fetchCalendar}>
        <div className="px-4 py-6 pb-24 lg:pb-8 max-w-7xl mx-auto">
          <PageErrorState message={error} onRetry={fetchCalendar} />
        </div>
      </PullToRefresh>
    );
  }

  return (
    <PlanGate minPlan="creator_pro" feature="Content Planner">
    <PullToRefresh onRefresh={async () => { await Promise.all([fetchCalendar(), fetchPackage()]); }}>
      <div className="px-4 py-6 pb-24 lg:pb-8 max-w-full mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-white">Content Planner</h1>
            <p className="text-zinc-400 text-sm">Plan, schedule, and manage your content pipeline</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View Toggle: Calendar / Grid */}
            <div className="flex items-center bg-zinc-800 rounded-lg border border-zinc-700 p-0.5">
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'calendar'
                    ? 'bg-teal-500/20 text-teal-400'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Calendar
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-teal-500/20 text-teal-400'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Ideas
              </button>
            </div>

            {/* Calendar-specific controls */}
            {viewMode === 'calendar' && (
              <>
                {/* Week / Month Toggle */}
                <div className="flex items-center bg-zinc-800 rounded-lg border border-zinc-700 p-0.5">
                  <button
                    onClick={() => setCalendarMode('week')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      calendarMode === 'week'
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Week
                  </button>
                  <button
                    onClick={() => setCalendarMode('month')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      calendarMode === 'month'
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Month
                  </button>
                </div>

                {/* Navigation */}
                <button onClick={goBack} className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={goToToday}
                  className="px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors"
                >
                  Today
                </button>
                <button onClick={goForward} className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => { fetchCalendar(); fetchPackage(); }} className="p-2 text-zinc-400 hover:text-white transition-colors">
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/ai/schedule-suggest');
                      const json = await res.json();
                      if (json.ok && json.data) {
                        showSuccess(json.data.message);
                      }
                    } catch {
                      showError('Failed to get schedule suggestion');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" /> Smart Schedule
                </button>
              </>
            )}
          </div>
        </div>

        {/* ===== CALENDAR VIEW ===== */}
        {viewMode === 'calendar' && (
          <div className="flex gap-4 max-w-full">
            {/* Calendar Grid */}
            <div className={`flex-1 min-w-0 space-y-5 ${ideasOpen ? 'max-w-[calc(100%-340px)]' : ''}`}>
              {/* This Week Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-green-400 mb-1">
                    <Send className="w-3 h-3" /> To Post
                  </div>
                  <div className="text-2xl font-bold text-white">{toPost}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-amber-400 mb-1">
                    <Eye className="w-3 h-3" /> To Review
                  </div>
                  <div className="text-2xl font-bold text-white">{toReview}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-teal-400 mb-1">
                    <Video className="w-3 h-3" /> In Production
                  </div>
                  <div className="text-2xl font-bold text-white">{inProduction}</div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-1 md:gap-4 flex-wrap text-xs text-zinc-400">
                {Object.entries(STATUS_COLORS).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </div>
                ))}
                {rescheduling && (
                  <span className="text-teal-400 ml-auto">Saving...</span>
                )}
              </div>

              {/* Calendar Grid */}
              {loading && !data ? (
                <SkeletonVideoList count={7} />
              ) : calendarMode === 'week' ? (
                /* WEEK VIEW */
                <div className="space-y-1 overflow-x-auto">
                  {weekDays.map((week, weekIdx) => {
                    const weekLabel = formatShortDate(week[0]) + ' \u2013 ' + formatShortDate(week[6]);
                    const isCurrentWeek = formatDateKey(getMonday(new Date())) === formatDateKey(week[0]);

                    return (
                      <div key={weekIdx}>
                        <div className="flex items-center gap-2 mb-1.5 mt-3 first:mt-0">
                          <span className={`text-xs font-medium ${isCurrentWeek ? 'text-teal-400' : 'text-zinc-500'}`}>
                            {isCurrentWeek ? 'This Week' : weekLabel}
                          </span>
                          {isCurrentWeek && (
                            <span className="text-[10px] text-zinc-600">{weekLabel}</span>
                          )}
                        </div>

                        {weekIdx === 0 && (
                          <div className="grid grid-cols-7 gap-0.5 md:gap-1 mb-1">
                            {DAY_NAMES.map(name => (
                              <div key={name} className="text-center text-[10px] text-zinc-600 font-medium">
                                <span className="hidden md:inline">{name}</span>
                                <span className="md:hidden">{name.charAt(0)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-7 gap-0.5 md:gap-1">
                          {week.map((day, dayIdx) => renderDayCell(day, dayIdx))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* MONTH VIEW */
                <div className="space-y-1">
                  <div className="text-center mb-2">
                    <span className="text-sm font-medium text-zinc-300">
                      {FULL_MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 md:gap-1 mb-1">
                    {DAY_NAMES.map(name => (
                      <div key={name} className="text-center text-[10px] text-zinc-600 font-medium">
                        <span className="hidden md:inline">{name}</span>
                        <span className="md:hidden">{name.charAt(0)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 md:gap-1">
                    {monthDays.map((day, idx) => renderDayCell(day, idx % 7, true))}
                  </div>
                </div>
              )}
            </div>

            {/* Ideas Sidebar */}
            <div className={`hidden lg:block transition-all ${ideasOpen ? 'w-[320px] flex-shrink-0' : 'w-10'}`}>
              {!ideasOpen ? (
                <button
                  onClick={() => setIdeasOpen(true)}
                  className="w-10 h-10 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                  title="Show Ideas Panel"
                >
                  <Package className="w-4 h-4" />
                </button>
              ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden h-[calc(100vh-200px)] flex flex-col">
                  {/* Panel Header */}
                  <div className="p-3 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Ideas</h3>
                      <p className="text-[10px] text-zinc-500">{sidebarIdeas.length} available</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleGenerate}
                        disabled={generating || pkg?.status === 'generating'}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-teal-500/20 text-teal-400 border border-teal-500/30 rounded-md hover:bg-teal-500/30 transition-colors disabled:opacity-50"
                      >
                        {generating || pkg?.status === 'generating' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3" />
                        )}
                        Generate
                      </button>
                      <button
                        onClick={() => setIdeasOpen(false)}
                        className="p-1 text-zinc-500 hover:text-white transition-colors rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Ideas List */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                    {ideasLoading && !pkg && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                      </div>
                    )}

                    {!ideasLoading && !pkg && (
                      <div className="text-center py-8">
                        <Package className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                        <p className="text-xs text-zinc-500 mb-2">No ideas yet</p>
                        <button
                          onClick={handleGenerate}
                          disabled={generating}
                          className="text-xs text-teal-400 hover:text-teal-300"
                        >
                          Generate your first package
                        </button>
                      </div>
                    )}

                    {pkg?.status === 'generating' && (
                      <div className="text-center py-8">
                        <Loader2 className="w-6 h-6 text-teal-400 animate-spin mx-auto mb-2" />
                        <p className="text-xs text-zinc-500">Generating ideas...</p>
                      </div>
                    )}

                    {sidebarIdeas.map(item => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleIdeaDragStart(e, item)}
                        onDragEnd={handleDragEnd}
                        className={`
                          p-2 rounded-lg border bg-zinc-800/50 border-zinc-700/50
                          cursor-grab active:cursor-grabbing hover:border-teal-500/30
                          transition-all group
                          ${schedulingIdea === item.id ? 'opacity-50 pointer-events-none' : ''}
                        `}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-3.5 h-3.5 text-zinc-600 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[11px] font-medium text-zinc-200 truncate">
                                {item.product_name}
                              </span>
                              <span className={`text-[10px] font-bold flex-shrink-0 ${getScoreColor(item.score)}`}>
                                {item.score}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500 truncate">
                              {item.full_script?.hook || item.hook}
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[9px] px-1.5 py-0.5 bg-zinc-700/50 text-zinc-400 rounded">
                                {getContentTypeName(item.content_type)}
                              </span>
                              <Link
                                href={studioUrl(item)}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[9px] text-teal-400 hover:text-teal-300 ml-auto"
                              >
                                Studio
                              </Link>
                            </div>
                          </div>
                        </div>
                        {schedulingIdea === item.id && (
                          <div className="flex items-center gap-1 mt-1">
                            <Loader2 className="w-3 h-3 text-teal-400 animate-spin" />
                            <span className="text-[10px] text-teal-400">Scheduling...</span>
                          </div>
                        )}
                      </div>
                    ))}

                    {pkg?.status === 'complete' && sidebarIdeas.length === 0 && pkg.items.length > 0 && (
                      <div className="text-center py-6">
                        <p className="text-xs text-zinc-500 mb-2">All ideas have been used</p>
                        <button
                          onClick={handleGenerate}
                          disabled={generating}
                          className="text-xs text-teal-400 hover:text-teal-300"
                        >
                          Generate more
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== GRID VIEW ===== */}
        {viewMode === 'grid' && (
          <div className="max-w-7xl mx-auto space-y-5">
            {/* Header Actions */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchPackage}
                  disabled={ideasLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${ideasLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating || pkg?.status === 'generating'}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
              >
                {generating || pkg?.status === 'generating' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Generate Daily Package
                  </>
                )}
              </button>
            </div>

            {/* Loading */}
            {ideasLoading && !pkg && (
              <div className="bg-zinc-900/50 rounded-xl border border-white/10 p-16 text-center">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin mx-auto mb-3" />
                <span className="text-zinc-400 text-sm">Loading content planner...</span>
              </div>
            )}

            {/* Empty */}
            {!ideasLoading && !pkg && (
              <div className="bg-zinc-900/50 rounded-xl border border-white/10 py-16 text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Package className="w-8 h-8 text-violet-400" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-100 mb-2">No Content Plan Yet</h3>
                <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
                  Generate your first daily content plan. The AI will analyze your products, trending hooks,
                  and winning patterns to create a batch of content ideas scored by potential.
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-base font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
                >
                  {generating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Zap className="w-4 h-4" /> Generate First Package</>
                  )}
                </button>
              </div>
            )}

            {/* Generating */}
            {pkg?.status === 'generating' && (
              <div className="bg-zinc-900/50 rounded-xl border border-white/10 py-16 text-center">
                <Loader2 className="w-10 h-10 text-violet-400 animate-spin mx-auto mb-4" />
                <h3 className="text-base font-medium text-zinc-100 mb-1">Generating Your Package</h3>
                <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                  Analyzing products, hooks, and trends. This usually takes 30-60 seconds.
                </p>
              </div>
            )}

            {pkg && pkg.status === 'complete' && (
              <>
                {/* Sort & Filter Bar */}
                {pkg.items && pkg.items.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-zinc-900/50 rounded-xl border border-white/10">
                    <SlidersHorizontal className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                    <div className="relative">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                        className="appearance-none bg-zinc-800 text-zinc-300 text-xs font-medium pl-2.5 pr-7 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                      >
                        <option value="score">Sort: Score</option>
                        <option value="product">Sort: Product</option>
                        <option value="content_type">Sort: Type</option>
                      </select>
                      <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <div className="relative">
                      <select
                        value={filterProduct}
                        onChange={(e) => setFilterProduct(e.target.value)}
                        className="appearance-none bg-zinc-800 text-zinc-300 text-xs font-medium pl-2.5 pr-7 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:ring-1 focus:ring-violet-500/50 max-w-[140px]"
                      >
                        <option value="all">All Products</option>
                        {filterOptions.products.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <div className="relative">
                      <select
                        value={filterContentType}
                        onChange={(e) => setFilterContentType(e.target.value)}
                        className="appearance-none bg-zinc-800 text-zinc-300 text-xs font-medium pl-2.5 pr-7 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:ring-1 focus:ring-violet-500/50 max-w-[160px]"
                      >
                        <option value="all">All Types</option>
                        {filterOptions.contentTypes.map(ct => (
                          <option key={ct} value={ct}>{getContentTypeName(ct)}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <div className="relative">
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                        className="appearance-none bg-zinc-800 text-zinc-300 text-xs font-medium pl-2.5 pr-7 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                      >
                        <option value="all">All Status</option>
                        <option value="kept">Selected Only</option>
                        <option value="discarded">Discarded</option>
                      </select>
                      <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <span className="text-xs text-zinc-500 ml-auto">
                      {displayItems.length} of {pkg.items.length}
                    </span>
                  </div>
                )}

                {/* Package Items Grid */}
                {displayItems.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {displayItems.map((item) => (
                      <div
                        key={item.id}
                        className={`
                          relative rounded-xl border overflow-hidden transition-all duration-200
                          ${discardedIds.has(item.id)
                            ? 'bg-zinc-900/20 border-red-500/15 opacity-40 hover:opacity-60'
                            : item.kept
                              ? 'bg-zinc-900/80 border-violet-500/30 shadow-lg shadow-violet-500/5'
                              : 'bg-zinc-900/30 border-white/5 opacity-60 hover:opacity-80'
                          }
                          ${item.added_to_pipeline ? 'ring-1 ring-emerald-500/30' : ''}
                        `}
                      >
                        {item.added_to_pipeline && (
                          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            <span className="text-xs text-emerald-400 font-medium">In Pipeline</span>
                          </div>
                        )}

                        <div className="p-4">
                          {/* Header */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0 pr-2">
                              <h3 className="text-sm font-semibold text-zinc-100 truncate">{item.product_name}</h3>
                              <p className="text-xs text-zinc-500 mt-0.5">{item.brand}</p>
                            </div>
                            {!item.added_to_pipeline && (
                              <div className={`flex-shrink-0 px-2.5 py-1 rounded-lg border text-sm font-bold ${getScoreBg(item.score)} ${getScoreColor(item.score)}`}>
                                {item.score >= 9 && <Star className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                                {item.score}
                              </div>
                            )}
                          </div>

                          {/* Content Type */}
                          <div className="mb-3 flex items-center gap-1.5 flex-wrap">
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300 border border-white/5">
                              {getContentTypeName(item.content_type)}
                            </span>
                            {item.full_script && (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-teal-500/15 text-teal-300 border border-teal-500/20">
                                Full Script
                              </span>
                            )}
                            {item.full_script?.persona && (
                              <span className="text-[11px] text-zinc-500">{item.full_script.persona}</span>
                            )}
                          </div>

                          {/* Hook */}
                          <p className="text-sm text-zinc-300 leading-relaxed mb-2 line-clamp-3">
                            &ldquo;{item.full_script?.hook || item.hook}&rdquo;
                          </p>

                          {/* Full Script Expand */}
                          {item.full_script && (
                            <div className="mb-4">
                              <button
                                type="button"
                                onClick={() => setExpandedIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(item.id)) next.delete(item.id);
                                  else next.add(item.id);
                                  return next;
                                })}
                                className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors mb-2"
                              >
                                {expandedIds.has(item.id) ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRightIcon className="w-3.5 h-3.5" />
                                )}
                                {expandedIds.has(item.id) ? 'Hide full script' : 'Show full script'}
                              </button>
                              {expandedIds.has(item.id) && (
                                <div className="space-y-2 text-xs text-zinc-400 bg-zinc-800/50 rounded-lg p-3 border border-white/5">
                                  {item.full_script.setup && (
                                    <div><span className="font-semibold text-zinc-300">Setup:</span> {item.full_script.setup}</div>
                                  )}
                                  {item.full_script.body && (
                                    <div><span className="font-semibold text-zinc-300">Body:</span> {item.full_script.body}</div>
                                  )}
                                  {item.full_script.cta && (
                                    <div><span className="font-semibold text-zinc-300">CTA:</span> {item.full_script.cta}</div>
                                  )}
                                  {item.full_script.on_screen_text && item.full_script.on_screen_text.length > 0 && (
                                    <div><span className="font-semibold text-zinc-300">On-screen text:</span> {item.full_script.on_screen_text.join(' | ')}</div>
                                  )}
                                  {item.full_script.filming_notes && (
                                    <div><span className="font-semibold text-zinc-300">Filming notes:</span> {item.full_script.filming_notes}</div>
                                  )}
                                  {item.full_script.estimated_length && (
                                    <div><span className="font-semibold text-zinc-300">Est. length:</span> {item.full_script.estimated_length}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {!item.full_script && <div className="mb-4" />}

                          {/* Actions */}
                          <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                            {!discardedIds.has(item.id) && (
                              <Link
                                href={studioUrl(item)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-teal-500/20 to-violet-500/20 text-teal-300 border border-teal-500/30 hover:from-teal-500/30 hover:to-violet-500/30 hover:text-teal-200 transition-all"
                              >
                                <Zap className="w-3.5 h-3.5" />
                                Use in Studio
                              </Link>
                            )}
                            {!item.added_to_pipeline && (
                              <button
                                type="button"
                                onClick={() => discardItem(item.id)}
                                className={`
                                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                                  ${discardedIds.has(item.id)
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30'
                                    : 'bg-zinc-800 text-zinc-500 border border-white/5 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                                  }
                                `}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {discardedIds.has(item.id) ? 'Discarded' : 'Discard'}
                              </button>
                            )}
                            {!item.added_to_pipeline && !discardedIds.has(item.id) && (
                              <button
                                type="button"
                                onClick={() => addToPipeline(item)}
                                disabled={addingToPipeline.has(item.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/50 text-zinc-500 border border-white/5 hover:bg-zinc-700 hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
                              >
                                {addingToPipeline.has(item.id) ? (
                                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding...</>
                                ) : (
                                  <><ChevronRightIcon className="w-3.5 h-3.5" /> Pipeline</>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* No results for filter */}
                {pkg.items && pkg.items.length > 0 && displayItems.length === 0 && (
                  <div className="bg-zinc-900/50 rounded-xl border border-white/10 py-10 text-center">
                    <SlidersHorizontal className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                    <p className="text-sm text-zinc-400 mb-3">No items match the current filters.</p>
                    <button
                      type="button"
                      onClick={() => { setFilterProduct('all'); setFilterContentType('all'); setFilterStatus('all'); }}
                      className="text-sm text-violet-400 hover:text-violet-300 underline"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}

                {/* Complete but empty */}
                {(!pkg.items || pkg.items.length === 0) && (
                  <div className="bg-zinc-900/50 rounded-xl border border-white/10 py-12 text-center">
                    <Package className="w-6 h-6 text-zinc-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-zinc-100 mb-1">Package is Empty</h3>
                    <p className="text-sm text-zinc-500 mb-4">Try generating a new one.</p>
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
                    >
                      <Zap className="w-4 h-4" /> Regenerate Package
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Day Detail Drawer */}
        {selectedDay && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedDay(null)} />
            <div className="relative w-full max-w-md bg-zinc-900 border-l border-zinc-800 overflow-y-auto">
              <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {new Date(selectedDay + 'T12:00:00').toLocaleDateString(undefined, {
                      weekday: 'long', month: 'long', day: 'numeric',
                    })}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {selectedDayVideos.length} item{selectedDayVideos.length !== 1 ? 's' : ''} scheduled
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {selectedDayVideos.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">No videos scheduled</p>
                    <p className="text-zinc-600 text-xs mt-1">Drag an idea here to schedule it</p>
                  </div>
                ) : (
                  selectedDayVideos.map((entry) => {
                    // Content Item rendering — interactive
                    if ((entry as CalendarContentItem).type === 'content_item') {
                      const ci = entry as CalendarContentItem;
                      const statusColor = CI_STATUS_COLORS[ci.status] || 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400';
                      const isUpdating = updatingStatus === ci.id;
                      return (
                        <div key={ci.id} className={`border rounded-xl p-4 space-y-3 ${statusColor}`}>
                          {/* Header */}
                          <div className="flex items-start gap-3">
                            <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] text-zinc-600 font-mono ml-auto">{ci.short_id}</span>
                              </div>
                              <p className="text-sm font-medium text-white">{ci.title}</p>
                              {ci.product_name && (
                                <p className="text-xs text-zinc-400 mt-0.5">{ci.product_name}</p>
                              )}
                              {ci.ai_description && (
                                <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{ci.ai_description}</p>
                              )}
                            </div>
                          </div>

                          {/* Status Dropdown */}
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Status</label>
                            <select
                              value={ci.status}
                              disabled={isUpdating}
                              onChange={(e) => handleContentItemStatusChange(ci, e.target.value)}
                              className="w-full min-h-[44px] bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-teal-500 disabled:opacity-50"
                            >
                              {CONTENT_ITEM_STATUSES.map(s => (
                                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                              ))}
                            </select>
                          </div>

                          {/* Due Date Picker (mobile-friendly) */}
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Due Date</label>
                            {editingDueDate === ci.id ? (
                              <input
                                type="date"
                                autoFocus
                                defaultValue={ci.due_at.slice(0, 10)}
                                onChange={(e) => {
                                  if (e.target.value) handleContentItemDueDateChange(ci, e.target.value);
                                }}
                                onBlur={() => setEditingDueDate(null)}
                                className="w-full min-h-[44px] bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-teal-500"
                              />
                            ) : (
                              <button
                                onClick={() => setEditingDueDate(ci.id)}
                                className="w-full min-h-[44px] flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 px-3 py-2 hover:border-zinc-600 transition-colors text-left"
                              >
                                <CalendarDays className="w-4 h-4 text-zinc-500" />
                                {new Date(ci.due_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                              </button>
                            )}
                          </div>

                          {/* Caption + Tags */}
                          {ci.caption && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-zinc-500">Caption:</span>
                              <span className="text-[10px] text-zinc-400 truncate flex-1">{ci.caption}</span>
                              <button onClick={() => navigator.clipboard.writeText(ci.caption!)} className="p-1 text-zinc-600 hover:text-zinc-300">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          {ci.hashtags?.length ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-zinc-500">Tags:</span>
                              <span className="text-[10px] text-zinc-400 truncate flex-1">{ci.hashtags.join(' ')}</span>
                              <button onClick={() => navigator.clipboard.writeText(ci.hashtags!.join(' '))} className="p-1 text-zinc-600 hover:text-zinc-300">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          ) : null}

                          {/* Links row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {ci.drive_folder_url && (
                              <a href={ci.drive_folder_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300">
                                <ExternalLink className="w-3 h-3" /> Upload Folder
                              </a>
                            )}
                            {ci.brief_doc_url && (
                              <a href={ci.brief_doc_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-green-400 hover:text-green-300">
                                <FileText className="w-3 h-3" /> Brief Doc
                              </a>
                            )}
                            {ci.final_video_url && (
                              <a href={ci.final_video_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-green-400 hover:text-green-300">
                                <ExternalLink className="w-3 h-3" /> Final Video
                              </a>
                            )}
                            {ci.editor_notes_status === 'completed' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                                <Scissors className="w-3 h-3" /> Editor Notes Ready
                              </span>
                            )}
                          </div>

                          {/* Action Buttons — full-width, big tap targets */}
                          <div className="space-y-2 pt-1">
                            {(ci.status === 'briefing' || ci.status === 'ready_to_record') && (
                              <Link
                                href={`/admin/record/${ci.id}`}
                                className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-sm font-semibold transition-colors bg-teal-600 text-white active:bg-teal-700"
                              >
                                <Mic size={16} /> Open Recording Kit
                              </Link>
                            )}
                            {ci.status === 'ready_to_post' && (
                              <Link
                                href={`/admin/post/${ci.id}`}
                                className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-sm font-semibold transition-colors bg-green-600 text-white active:bg-green-700"
                              >
                                <Send size={16} /> Post Now
                              </Link>
                            )}
                            <Link
                              href={`/admin/pipeline?highlight=${ci.id}`}
                              className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-sm font-medium transition-colors bg-zinc-800 text-zinc-200 border border-zinc-700 active:bg-zinc-700"
                            >
                              <ArrowRight size={16} /> Open in Board
                            </Link>
                          </div>
                        </div>
                      );
                    }

                    // Regular video rendering
                    const video = entry as CalendarVideo;
                    const group = getStatusGroup(video.recording_status);
                    const colors = STATUS_COLORS[group];
                    const hasVideo = !!video.final_video_url;
                    return (
                      <div
                        key={video.id}
                        className={`${colors.bg} ${colors.border} border rounded-xl p-4`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, video)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="flex items-start gap-3">
                          <div className="pt-0.5">
                            <GripVertical className="w-4 h-4 text-zinc-600 cursor-grab active:cursor-grabbing" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                              <span className={`text-xs font-medium ${colors.text}`}>{colors.label}</span>
                              {video.video_code && (
                                <span className="text-[10px] text-zinc-600 font-mono ml-auto">{video.video_code}</span>
                              )}
                            </div>

                            {/* Time picker */}
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              {editingTimeVideoId === video.id ? (
                                <select
                                  autoFocus
                                  className="bg-zinc-800 border border-zinc-700 rounded text-xs text-white px-1.5 py-0.5 focus:outline-none focus:border-teal-500"
                                  defaultValue={video.scheduled_time || ''}
                                  onChange={(e) => handleTimeChange(video.id, video.scheduled_date, e.target.value)}
                                  onBlur={() => setEditingTimeVideoId(null)}
                                >
                                  {TIME_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <button
                                  onClick={() => setEditingTimeVideoId(video.id)}
                                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                                  disabled={savingTime}
                                >
                                  {video.scheduled_time ? formatTime12h(video.scheduled_time) : 'Set time'}
                                </button>
                              )}
                            </div>

                            <p className="text-sm font-medium text-white truncate">
                              {video.product_name || video.video_code || 'Untitled Video'}
                            </p>
                            {video.product_brand && (
                              <p className="text-xs text-zinc-500 mt-0.5">{video.product_brand}</p>
                            )}
                            {video.account_name && (
                              <p className="text-xs text-zinc-500 mt-0.5">
                                {video.account_name}{video.account_handle ? ` (@${video.account_handle})` : ''}
                              </p>
                            )}

                            {/* Upload status + Drive link */}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {hasVideo ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-400 bg-green-400/10 border border-green-400/30 rounded-full px-2 py-0.5">
                                  <Upload className="w-3 h-3" /> Video ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5">
                                  <Upload className="w-3 h-3" /> Needs upload
                                </span>
                              )}
                              {video.google_drive_url && (
                                <a
                                  href={video.google_drive_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" /> Google Drive
                                </a>
                              )}
                              <a
                                href={`/admin/pipeline?video=${video.id}`}
                                className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
                              >
                                View in Pipeline
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
    </PlanGate>
  );
}
