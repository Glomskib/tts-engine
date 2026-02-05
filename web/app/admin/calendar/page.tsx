'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Calendar, Clock, ChevronLeft, ChevronRight, Plus, X, Trash2, ExternalLink } from 'lucide-react';

interface ScheduledPost {
  id: string;
  title: string;
  description: string | null;
  scheduled_for: string;
  platform: string;
  status: string;
  skit_id: string | null;
  metadata?: {
    video_id?: string;
    auto_scheduled?: boolean;
  };
  skit?: {
    id: string;
    title: string;
    product_name?: string;
    product_brand?: string;
  };
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  posts: ScheduledPost[];
}

const PLATFORMS = [
  { value: 'tiktok', label: 'TikTok', color: 'bg-pink-500' },
  { value: 'instagram', label: 'Instagram', color: 'bg-purple-500' },
  { value: 'youtube', label: 'YouTube', color: 'bg-red-500' },
  { value: 'all', label: 'All', color: 'bg-violet-500' },
];

const STATUS_STYLES: Record<string, { bg: string; dot: string; label: string }> = {
  scheduled: { bg: 'bg-blue-500/20 text-blue-300 border border-blue-500/30', dot: 'bg-blue-400', label: 'Scheduled' },
  posted: { bg: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', dot: 'bg-emerald-400', label: 'Posted' },
  failed: { bg: 'bg-red-500/20 text-red-300 border border-red-500/30', dot: 'bg-red-400', label: 'Failed' },
  cancelled: { bg: 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30', dot: 'bg-zinc-500', label: 'Cancelled' },
};

function getStatusStyle(status: string) {
  return STATUS_STYLES[status] || STATUS_STYLES.scheduled;
}

function formatCountdown(scheduledFor: string): string {
  const now = new Date();
  const target = new Date(scheduledFor);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs < 0) return 'Overdue';

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `in ${diffDays}d ${diffHours % 24}h`;
  if (diffHours > 0) return `in ${diffHours}h ${diffMinutes % 60}m`;
  return `in ${diffMinutes}m`;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [, setSelectedDate] = useState<Date | null>(null);
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    scheduled_date: '',
    scheduled_time: '12:00',
    platform: 'tiktok',
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string>('all_platforms');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const firstDayOfMonth = new Date(year, month, 1);
      const lastDayOfMonth = new Date(year, month + 1, 0);
      const startDate = new Date(firstDayOfMonth);
      startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay());
      const endDate = new Date(lastDayOfMonth);
      endDate.setDate(endDate.getDate() + (6 - lastDayOfMonth.getDay()));

      const params = new URLSearchParams({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      });

      const res = await fetch(`/api/scheduled-posts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal) closeModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });

  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const calendarDays = useMemo((): CalendarDay[] => {
    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const firstDayWeekday = firstDayOfMonth.getDay();
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        posts: posts.filter(p => isSameDay(new Date(p.scheduled_for), date)),
      });
    }

    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      const date = new Date(year, month, day);
      days.push({
        date,
        isCurrentMonth: true,
        isToday: date.getTime() === today.getTime(),
        posts: posts.filter(p => isSameDay(new Date(p.scheduled_for), date)),
      });
    }

    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        posts: posts.filter(p => isSameDay(new Date(p.scheduled_for), date)),
      });
    }

    return days;
  }, [year, month, posts]);

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(year, month + direction, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const openModal = (date: Date, post?: ScheduledPost) => {
    setSelectedDate(date);
    setSelectedPost(post || null);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (post) {
      const postDate = new Date(post.scheduled_for);
      setFormData({
        title: post.title,
        description: post.description || '',
        scheduled_date: dateStr,
        scheduled_time: `${postDate.getHours().toString().padStart(2, '0')}:${postDate.getMinutes().toString().padStart(2, '0')}`,
        platform: post.platform,
      });
    } else {
      setFormData({
        title: '',
        description: '',
        scheduled_date: dateStr,
        scheduled_time: '12:00',
        platform: 'tiktok',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedDate(null);
    setSelectedPost(null);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.scheduled_date) return;

    setSaving(true);
    try {
      const [hours, minutes] = formData.scheduled_time.split(':').map(Number);
      const [y, m, d] = formData.scheduled_date.split('-').map(Number);
      const scheduledFor = new Date(y, m - 1, d, hours, minutes, 0, 0);

      const body = {
        title: formData.title,
        description: formData.description || null,
        scheduled_for: scheduledFor.toISOString(),
        platform: formData.platform,
      };

      let res;
      if (selectedPost) {
        res = await fetch(`/api/scheduled-posts/${selectedPost.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/scheduled-posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        closeModal();
        fetchPosts();
        showToast(selectedPost ? 'Post updated' : 'Post scheduled', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to save post', 'error');
      }
    } catch (err) {
      console.error('Failed to save:', err);
      showToast('Failed to save post', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPost || !confirm('Delete this scheduled post?')) return;

    try {
      const res = await fetch(`/api/scheduled-posts/${selectedPost.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        closeModal();
        fetchPosts();
        showToast('Post deleted', 'success');
      } else {
        showToast('Failed to delete post', 'error');
      }
    } catch (err) {
      console.error('Failed to delete:', err);
      showToast('Failed to delete post', 'error');
    }
  };

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const filteredPosts = useMemo(() => {
    if (platformFilter === 'all_platforms') return posts;
    return posts.filter(p => p.platform === platformFilter);
  }, [posts, platformFilter]);

  const displayDays = useMemo((): CalendarDay[] => {
    if (platformFilter === 'all_platforms') return calendarDays;
    return calendarDays.map(day => ({
      ...day,
      posts: day.posts.filter(p => p.platform === platformFilter),
    }));
  }, [calendarDays, platformFilter]);

  const totalPostsThisMonth = filteredPosts.filter(p => {
    const d = new Date(p.scheduled_for);
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;

  // Upcoming posts: next 3 scheduled posts from now
  const upcomingPosts = useMemo(() => {
    const now = new Date();
    return posts
      .filter(p => p.status === 'scheduled' && new Date(p.scheduled_for) > now)
      .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())
      .slice(0, 3);
  }, [posts]);

  // Stats
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const scheduledThisWeek = posts.filter(p => {
    const d = new Date(p.scheduled_for);
    return d >= startOfWeek && d < endOfWeek && p.status === 'scheduled';
  }).length;

  const scheduledThisMonth = posts.filter(p => {
    const d = new Date(p.scheduled_for);
    return d.getMonth() === month && d.getFullYear() === year && p.status === 'scheduled';
  }).length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-violet-400" />
            Content Calendar
          </h1>
          <p className="text-zinc-400">Schedule and manage your content</p>
        </div>
        <button
          type="button"
          onClick={() => openModal(new Date())}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Schedule Post
        </button>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Upcoming Summary */}
      <div className="mb-6 p-4 rounded-xl border border-white/10 bg-zinc-900/50">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
          {/* Stats */}
          <div className="flex items-center gap-6 shrink-0">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{scheduledThisWeek}</div>
              <div className="text-xs text-zinc-500">This week</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{scheduledThisMonth}</div>
              <div className="text-xs text-zinc-500">This month</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{totalPostsThisMonth}</div>
              <div className="text-xs text-zinc-500">Total posts</div>
            </div>
          </div>

          {/* Upcoming posts */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-zinc-400">Upcoming</h3>
              <Link href="/admin/pipeline" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                Pipeline <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            {upcomingPosts.length === 0 ? (
              <p className="text-sm text-zinc-600">No upcoming scheduled posts</p>
            ) : (
              <div className="space-y-2">
                {upcomingPosts.map(post => {
                  const platform = PLATFORMS.find(p => p.value === post.platform);
                  const scheduledDate = new Date(post.scheduled_for);
                  return (
                    <div
                      key={post.id}
                      onClick={() => openModal(scheduledDate, post)}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-colors group"
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${platform?.color || 'bg-zinc-500'}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-zinc-200 truncate block">{post.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-zinc-500">
                          {scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-xs text-zinc-400 font-mono">
                          {scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <span className="text-xs text-teal-400 font-medium">
                          {formatCountdown(post.scheduled_for)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calendar Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigateMonth(-1)}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-semibold text-white min-w-[200px] text-center">{monthName}</h2>
          <button
            type="button"
            onClick={() => navigateMonth(1)}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <span className="text-sm text-zinc-500 ml-2">
            {totalPostsThisMonth} post{totalPostsThisMonth !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="all_platforms">All Platforms</option>
            {PLATFORMS.filter(p => p.value !== 'all').map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={goToToday}
            className="px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 bg-zinc-900">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="px-2 py-3 text-center text-sm font-medium text-zinc-500 border-b border-white/10">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="min-h-[100px] p-2 border-b border-r border-white/5 bg-zinc-900 animate-pulse">
                <div className="h-4 w-6 bg-zinc-800 rounded mb-2" />
                {i % 5 === 0 && <div className="h-5 w-full bg-zinc-800 rounded mb-1" />}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border border-white/10 rounded-xl overflow-hidden">
          {/* Days of week header */}
          <div className="grid grid-cols-7 bg-zinc-900">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="px-2 py-3 text-center text-sm font-medium text-zinc-500 border-b border-white/10">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7">
            {displayDays.map((day, idx) => (
              <div
                key={idx}
                onClick={() => openModal(day.date)}
                className={`min-h-[100px] p-2 border-b border-r border-white/5 cursor-pointer transition-colors hover:bg-zinc-800/50 ${
                  !day.isCurrentMonth ? 'bg-zinc-900/50' : 'bg-zinc-900'
                } ${day.isToday ? 'ring-2 ring-inset ring-violet-500/50' : ''}`}
              >
                <div className={`text-sm mb-1 ${
                  day.isToday
                    ? 'text-violet-400 font-bold'
                    : day.isCurrentMonth
                    ? 'text-zinc-300'
                    : 'text-zinc-600'
                }`}>
                  {day.date.getDate()}
                </div>

                {/* Posts for this day */}
                <div className="space-y-1">
                  {day.posts.slice(0, 3).map(post => {
                    const style = getStatusStyle(post.status);
                    const time = new Date(post.scheduled_for).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={post.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal(day.date, post);
                        }}
                        className={`px-2 py-1 rounded text-xs truncate flex items-center gap-1.5 ${style.bg} hover:opacity-80 transition-opacity`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                        <Clock className="w-3 h-3 opacity-60 shrink-0" />
                        <span className="opacity-75">{time}</span>
                        <span className="truncate">{post.title}</span>
                      </div>
                    );
                  })}
                  {day.posts.length > 3 && (
                    <div className="text-xs text-zinc-500 pl-2">
                      +{day.posts.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4">
        <span className="text-sm text-zinc-500">Status:</span>
        {Object.entries(STATUS_STYLES).map(([key, style]) => (
          <div key={key} className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
            <span className="text-sm text-zinc-400">{style.label}</span>
          </div>
        ))}
        <span className="text-sm text-zinc-500 ml-4">Platforms:</span>
        {PLATFORMS.filter(p => p.value !== 'all').map(platform => (
          <div key={platform.value} className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${platform.color}`} />
            <span className="text-sm text-zinc-400">{platform.label}</span>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">
                {selectedPost ? 'Scheduled Post Details' : 'Schedule New Post'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="text-zinc-400 hover:text-white"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Status badge for existing posts */}
              {selectedPost && (
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusStyle(selectedPost.status).bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${getStatusStyle(selectedPost.status).dot}`} />
                    {getStatusStyle(selectedPost.status).label}
                  </span>
                  {selectedPost.metadata?.auto_scheduled && (
                    <span className="text-xs text-zinc-500">Auto-scheduled</span>
                  )}
                  {selectedPost.metadata?.video_id && (
                    <Link
                      href={`/admin/pipeline`}
                      className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                    >
                      View in Pipeline <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              )}

              {/* Video/Script details for auto-scheduled posts */}
              {selectedPost?.skit && (
                <div className="p-3 rounded-lg bg-zinc-800/50 border border-white/5">
                  <div className="text-xs text-zinc-500 mb-1">From Script</div>
                  <div className="text-sm text-zinc-200">{selectedPost.skit.title}</div>
                  {(selectedPost.skit.product_name || selectedPost.skit.product_brand) && (
                    <div className="text-xs text-zinc-400 mt-1">
                      {[selectedPost.skit.product_brand, selectedPost.skit.product_name].filter(Boolean).join(' - ')}
                    </div>
                  )}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Post title..."
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  placeholder="Optional description..."
                />
              </div>

              {/* Date (for rescheduling) */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Date</label>
                <input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={e => setFormData({ ...formData, scheduled_date: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Time */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Time</label>
                <input
                  type="time"
                  value={formData.scheduled_time}
                  onChange={e => setFormData({ ...formData, scheduled_time: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Platform */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Platform</label>
                <select
                  value={formData.platform}
                  onChange={e => setFormData({ ...formData, platform: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {PLATFORMS.map(platform => (
                    <option key={platform.value} value={platform.value}>
                      {platform.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 border-t border-white/10">
              {selectedPost ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!formData.title || !formData.scheduled_date || saving}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : selectedPost ? 'Update' : 'Schedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
