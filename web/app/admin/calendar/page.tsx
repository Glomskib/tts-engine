'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { PullToRefresh } from '@/components/ui/PullToRefresh';

interface DayContent {
  id: string;
  title: string;
  status: string;
  recording_status: string;
  product_name: string | null;
  account_name: string | null;
  account_handle: string | null;
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));
  const [calendar, setCalendar] = useState<Record<string, DayContent[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?month=${currentMonth}`);
      const data = await res.json();
      if (data.ok) {
        setCalendar(data.data.calendar || {});
      }
    } catch (error) {
      console.error('Failed to fetch calendar:', error);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  const getDaysInMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const days: Date[] = [];

    const startPadding = firstDay.getDay();
    for (let i = startPadding - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, -i);
      days.push(date);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month - 1, day));
    }

    const endPadding = 6 - lastDay.getDay();
    for (let i = 1; i <= endPadding; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const changeMonth = (delta: number) => {
    const [year, month] = currentMonth.split('-').map(Number);
    const newDate = new Date(year, month - 1 + delta, 1);
    setCurrentMonth(newDate.toISOString().slice(0, 7));
    setSelectedDay(null);
  };

  const formatDate = (date: Date) => {
    return date.toISOString().slice(0, 10);
  };

  const isCurrentMonth = (date: Date) => {
    return formatDate(date).startsWith(currentMonth);
  };

  const getStatusColor = (status: string) => {
    if (status === 'POSTED') return 'bg-green-500';
    if (status === 'SCRIPTED' || status === 'READY_TO_FILM') return 'bg-blue-500';
    if (status === 'DRAFT') return 'bg-yellow-500';
    return 'bg-zinc-600';
  };

  const days = getDaysInMonth();
  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayHeadersMobile = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const selectedDayContent = selectedDay ? (calendar[selectedDay] || []) : [];

  const handleRefresh = async () => {
    await fetchCalendar();
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} className="pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-5 h-5 text-indigo-400" />
          <h1 className="text-xl font-bold text-white">Content Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeMonth(-1)}
            className="p-2.5 hover:bg-zinc-800 rounded-lg text-white min-w-[44px] min-h-[44px] flex items-center justify-center btn-press"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white min-w-[120px] sm:min-w-[140px] text-center text-sm sm:text-base">
            {new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <button
            onClick={() => changeMonth(1)}
            className="p-2.5 hover:bg-zinc-800 rounded-lg text-white min-w-[44px] min-h-[44px] flex items-center justify-center btn-press"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b border-zinc-800">
          {dayHeaders.map((day, i) => (
            <div key={day} className="p-2 sm:p-3 text-center text-xs sm:text-sm font-medium text-zinc-400 border-r border-zinc-800 last:border-r-0">
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{dayHeadersMobile[i]}</span>
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {days.map((date, idx) => {
            const dateStr = formatDate(date);
            const content = calendar[dateStr] || [];
            const isToday = dateStr === new Date().toISOString().slice(0, 10);
            const inCurrentMonth = isCurrentMonth(date);
            const isSelected = selectedDay === dateStr;

            return (
              <div
                key={idx}
                onClick={() => content.length > 0 && setSelectedDay(isSelected ? null : dateStr)}
                className={`min-h-[60px] sm:min-h-[100px] lg:min-h-[120px] p-1 sm:p-2 border-r border-b border-zinc-800 last:border-r-0 transition-colors ${
                  inCurrentMonth ? 'bg-zinc-900' : 'bg-zinc-950/50'
                } ${isToday ? 'ring-2 ring-indigo-500 ring-inset' : ''} ${
                  isSelected ? 'bg-zinc-800' : ''
                } ${content.length > 0 ? 'cursor-pointer' : ''}`}
              >
                <div className={`text-xs sm:text-sm font-medium mb-0.5 sm:mb-1 ${
                  inCurrentMonth ? 'text-white' : 'text-zinc-600'
                } ${isToday ? 'text-indigo-400' : ''}`}>
                  {date.getDate()}
                </div>

                {/* Desktop: show content items */}
                <div className="hidden sm:block space-y-1">
                  {content.slice(0, 3).map(item => (
                    <div
                      key={item.id}
                      className="text-xs p-1 sm:p-1.5 bg-zinc-800 rounded border-l-2 border-indigo-500 truncate"
                      title={item.title || 'Untitled'}
                    >
                      <div className="text-white truncate">{item.title || 'Untitled'}</div>
                      {item.account_handle && (
                        <div className="text-zinc-500 truncate hidden lg:block">{item.account_handle}</div>
                      )}
                    </div>
                  ))}
                  {content.length > 3 && (
                    <div className="text-xs text-zinc-500 pl-1.5">
                      +{content.length - 3} more
                    </div>
                  )}
                </div>

                {/* Mobile: show dot indicators */}
                {content.length > 0 && (
                  <div className="sm:hidden flex gap-0.5 flex-wrap">
                    {content.slice(0, 4).map((item, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${getStatusColor(item.status)}`} />
                    ))}
                    {content.length > 4 && (
                      <span className="text-[9px] text-zinc-500">+{content.length - 4}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: Selected Day Detail */}
      {selectedDay && selectedDayContent.length > 0 && (
        <div className="mt-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl sm:hidden">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3">
            {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </h3>
          <div className="space-y-2">
            {selectedDayContent.map(item => (
              <div key={item.id} className="p-3 bg-zinc-800 rounded-lg border-l-2 border-indigo-500">
                <div className="text-sm font-medium text-white">{item.title || 'Untitled'}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-2 h-2 rounded-full ${getStatusColor(item.status)}`} />
                  <span className="text-xs text-zinc-400">{item.status}</span>
                  {item.account_handle && (
                    <span className="text-xs text-zinc-500">{item.account_handle}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-green-500 rounded" />
          <span className="text-zinc-400">Posted</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-blue-500 rounded" />
          <span className="text-zinc-400">Scheduled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-yellow-500 rounded" />
          <span className="text-zinc-400">Draft</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 ring-2 ring-indigo-500 rounded" />
          <span className="text-zinc-400">Today</span>
        </div>
      </div>
    </PullToRefresh>
  );
}
