'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

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

  useEffect(() => {
    fetchCalendar();
  }, [currentMonth]);

  const fetchCalendar = async () => {
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
  };

  const getDaysInMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const days: Date[] = [];

    // Add padding days from previous month
    const startPadding = firstDay.getDay();
    for (let i = startPadding - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, -i);
      days.push(date);
    }

    // Add days of current month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month - 1, day));
    }

    // Add padding days from next month
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

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <CalendarIcon className="w-6 h-6 text-indigo-400" />
            <h1 className="text-2xl font-bold text-white">Content Calendar</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeMonth(-1)}
              className="p-2 hover:bg-zinc-800 rounded-lg text-white"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white min-w-[140px] text-center">
              {new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <button
              onClick={() => changeMonth(1)}
              className="p-2 hover:bg-zinc-800 rounded-lg text-white"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-b border-zinc-800">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-3 text-center text-sm font-medium text-zinc-400 border-r border-zinc-800 last:border-r-0">
                {day}
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

              return (
                <div
                  key={idx}
                  className={`min-h-[120px] p-2 border-r border-b border-zinc-800 last:border-r-0 ${
                    inCurrentMonth ? 'bg-zinc-900' : 'bg-zinc-950/50'
                  } ${isToday ? 'ring-2 ring-indigo-500 ring-inset' : ''}`}
                >
                  <div className={`text-sm font-medium mb-1 ${
                    inCurrentMonth ? 'text-white' : 'text-zinc-600'
                  } ${isToday ? 'text-indigo-400' : ''}`}>
                    {date.getDate()}
                  </div>

                  {/* Content Items */}
                  <div className="space-y-1">
                    {content.slice(0, 3).map(item => (
                      <div
                        key={item.id}
                        className="text-xs p-1.5 bg-zinc-800 rounded border-l-2 border-indigo-500 truncate"
                        title={item.title || 'Untitled'}
                      >
                        <div className="text-white truncate">{item.title || 'Untitled'}</div>
                        {item.account_handle && (
                          <div className="text-zinc-500 truncate">{item.account_handle}</div>
                        )}
                      </div>
                    ))}
                    {content.length > 3 && (
                      <div className="text-xs text-zinc-500 pl-1.5">
                        +{content.length - 3} more
                      </div>
                    )}
                  </div>

                  {/* Empty day indicator */}
                  {content.length === 0 && inCurrentMonth && (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-xs text-zinc-700">No content</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span className="text-zinc-400">Posted</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span className="text-zinc-400">Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
            <span className="text-zinc-400">Draft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 ring-2 ring-indigo-500 rounded"></div>
            <span className="text-zinc-400">Today</span>
          </div>
        </div>
      </div>
    </div>
  );
}
