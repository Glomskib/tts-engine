'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw, X,
  Video, Send, Eye, Calendar, GripVertical,
} from 'lucide-react';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { SkeletonVideoList } from '@/components/ui/Skeleton';
import { PageErrorState } from '@/components/ui/PageErrorState';

// --- Types ---

interface CalendarVideo {
  id: string;
  title: string | null;
  video_code: string | null;
  status: string | null;
  recording_status: string;
  scheduled_date: string;
  product_name: string | null;
  product_brand: string | null;
  account_name: string | null;
  account_handle: string | null;
}

interface CalendarData {
  calendar: Record<string, CalendarVideo[]>;
  total: number;
  status_counts: Record<string, number>;
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
  posted:    { dot: 'bg-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/30',   text: 'text-blue-400',   label: 'Posted' },
  rejected:  { dot: 'bg-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/30',    text: 'text-red-400',    label: 'Rejected' },
  rendering: { dot: 'bg-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/30', text: 'text-purple-400', label: 'In Production' },
};

// --- Date helpers ---

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

function getWeekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// --- Component ---

export default function ContentCalendarPage() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseMonday, setBaseMonday] = useState(() => getMonday(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dragVideo, setDragVideo] = useState<CalendarVideo | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const dragCounterRef = useRef<Record<string, number>>({});

  // Compute 3-week range
  const weeks = [0, 1, 2].map(i => {
    const mon = new Date(baseMonday);
    mon.setDate(mon.getDate() + i * 7);
    return getWeekDates(mon);
  });
  const allDays = weeks.flat();
  const rangeStart = formatDateKey(allDays[0]);
  const rangeEnd = formatDateKey(allDays[allDays.length - 1]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar?start=${rangeStart}&end=${rangeEnd}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to load calendar');
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- This Week summary ---
  const thisWeekMonday = getMonday(new Date());
  const thisWeekDates = getWeekDates(thisWeekMonday).map(formatDateKey);
  const thisWeekVideos = data
    ? thisWeekDates.flatMap(d => data.calendar[d] || [])
    : [];
  const toPost = thisWeekVideos.filter(v => v.recording_status === 'READY_TO_POST').length;
  const toReview = thisWeekVideos.filter(v => ['EDITED', 'READY_FOR_REVIEW'].includes(v.recording_status)).length;
  const inProduction = thisWeekVideos.filter(v =>
    !['READY_TO_POST', 'POSTED', 'REJECTED', 'EDITED', 'READY_FOR_REVIEW'].includes(v.recording_status)
  ).length;

  // --- Drag and drop handlers ---
  const handleDragStart = (e: React.DragEvent, video: CalendarVideo) => {
    setDragVideo(video);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', video.id);
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
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, dateKey: string) => {
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

  const handleDragEnd = () => {
    setDragVideo(null);
    setDropTarget(null);
    dragCounterRef.current = {};
  };

  // --- Navigation ---
  const goToToday = () => setBaseMonday(getMonday(new Date()));
  const goBack = () => {
    const d = new Date(baseMonday);
    d.setDate(d.getDate() - 7);
    setBaseMonday(d);
  };
  const goForward = () => {
    const d = new Date(baseMonday);
    d.setDate(d.getDate() + 7);
    setBaseMonday(d);
  };

  // --- Render ---
  if (error && !loading) {
    return (
      <PullToRefresh onRefresh={fetchData}>
        <div className="px-4 py-6 pb-24 lg:pb-8 max-w-7xl mx-auto">
          <PageErrorState message={error} onRetry={fetchData} />
        </div>
      </PullToRefresh>
    );
  }

  const selectedDayVideos = selectedDay && data ? (data.calendar[selectedDay] || []) : [];

  return (
    <PullToRefresh onRefresh={fetchData}>
      <div className="px-4 py-6 pb-24 lg:pb-8 space-y-5 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Content Calendar</h1>
            <p className="text-zinc-400 text-sm">Plan and schedule when videos go live</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goBack}
              className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Today
            </button>
            <button
              onClick={goForward}
              className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={fetchData}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

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
            <div className="flex items-center justify-center gap-1 text-xs text-purple-400 mb-1">
              <Video className="w-3 h-3" /> In Production
            </div>
            <div className="text-2xl font-bold text-white">{inProduction}</div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap text-xs text-zinc-400">
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
        ) : (
          <div className="space-y-1">
            {weeks.map((week, weekIdx) => {
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

                  {/* Day name headers - only for first week */}
                  {weekIdx === 0 && (
                    <div className="grid grid-cols-7 gap-1.5 mb-1">
                      {DAY_NAMES.map(name => (
                        <div key={name} className="text-center text-[10px] text-zinc-600 font-medium">
                          {name}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-7 gap-1.5">
                    {week.map((day, dayIdx) => {
                      const dateKey = formatDateKey(day);
                      const videos = data?.calendar[dateKey] || [];
                      const today = isToday(day);
                      const past = isPast(day) && !today;
                      const isDropping = dropTarget === dateKey && dragVideo?.scheduled_date !== dateKey;

                      return (
                        <div
                          key={dateKey}
                          className={`
                            rounded-xl border min-h-[120px] p-2 transition-all cursor-pointer select-none
                            ${today
                              ? 'bg-teal-500/5 border-teal-500/30'
                              : isDropping
                                ? 'bg-teal-500/10 border-teal-500/40 scale-[1.02]'
                                : past
                                  ? 'bg-zinc-950/50 border-zinc-800/50'
                                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                            }
                          `}
                          onClick={() => setSelectedDay(dateKey)}
                          onDragEnter={(e) => handleDragEnter(e, dateKey)}
                          onDragLeave={(e) => handleDragLeave(e, dateKey)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, dateKey)}
                        >
                          {/* Day header */}
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-[10px] font-medium ${past ? 'text-zinc-600' : 'text-zinc-500'}`}>
                              {DAY_NAMES[dayIdx]}
                            </span>
                            <span className={`
                              text-xs font-semibold
                              ${today
                                ? 'bg-teal-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px]'
                                : past ? 'text-zinc-600' : 'text-zinc-300'
                              }
                            `}>
                              {day.getDate()}
                            </span>
                          </div>

                          {/* Video pills */}
                          <div className="space-y-1">
                            {videos.slice(0, 4).map(video => {
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
                                  title={`${video.product_name || video.title || 'Video'} (${colors.label})`}
                                >
                                  <span className={colors.text}>
                                    {video.product_name || video.video_code || 'Video'}
                                  </span>
                                </div>
                              );
                            })}
                            {videos.length > 4 && (
                              <div className="text-[10px] text-zinc-500 text-center">
                                +{videos.length - 4} more
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
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
                    {selectedDayVideos.length} video{selectedDayVideos.length !== 1 ? 's' : ''} scheduled
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
                    <p className="text-zinc-600 text-xs mt-1">Drag a video here to schedule it</p>
                  </div>
                ) : (
                  selectedDayVideos.map(video => {
                    const group = getStatusGroup(video.recording_status);
                    const colors = STATUS_COLORS[group];
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
                              <span className={`text-xs font-medium ${colors.text}`}>
                                {colors.label}
                              </span>
                              {video.video_code && (
                                <span className="text-[10px] text-zinc-600 font-mono ml-auto">
                                  {video.video_code}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-white truncate">
                              {video.product_name || video.title || 'Untitled Video'}
                            </p>
                            {video.product_brand && (
                              <p className="text-xs text-zinc-500 mt-0.5">{video.product_brand}</p>
                            )}
                            {video.account_name && (
                              <p className="text-xs text-zinc-500 mt-0.5">
                                {video.account_name}
                                {video.account_handle ? ` (@${video.account_handle})` : ''}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
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
  );
}
