'use client';

import { useState, useRef, useCallback } from 'react';
import VideoCard from './VideoCard';
import VideoDrawer from './VideoDrawer';
import type { QueueVideo, BoardFilters } from '../types';

const RECORDING_STATUS_COLUMNS = [
  { key: 'NEEDS_SCRIPT', label: 'Needs Script', color: '#e8590c', darkColor: '#fb923c' },
  { key: 'GENERATING_SCRIPT', label: 'Generating', color: '#7950f2', darkColor: '#a78bfa' },
  { key: 'NOT_RECORDED', label: 'Not Recorded', color: '#6c757d', darkColor: '#9ca3af' },
  { key: 'RECORDED', label: 'Recorded', color: '#228be6', darkColor: '#60a5fa' },
  { key: 'EDITED', label: 'Edited', color: '#fab005', darkColor: '#fbbf24' },
  { key: 'READY_TO_POST', label: 'Ready to Post', color: '#40c057', darkColor: '#4ade80' },
  { key: 'POSTED', label: 'Posted', color: '#1971c2', darkColor: '#3b82f6' },
  { key: 'REJECTED', label: 'Rejected', color: '#e03131', darkColor: '#f87171' },
] as const;

// Valid status transitions (forward progression + reject)
const VALID_TRANSITIONS: Record<string, string[]> = {
  'NEEDS_SCRIPT': ['GENERATING_SCRIPT', 'NOT_RECORDED', 'REJECTED'],
  'GENERATING_SCRIPT': ['NEEDS_SCRIPT', 'NOT_RECORDED', 'REJECTED'],
  'NOT_RECORDED': ['RECORDED', 'REJECTED'],
  'RECORDED': ['EDITED', 'REJECTED', 'NOT_RECORDED'],
  'EDITED': ['READY_TO_POST', 'REJECTED', 'RECORDED'],
  'READY_TO_POST': ['POSTED', 'REJECTED', 'EDITED'],
  'POSTED': [],
  'REJECTED': ['NEEDS_SCRIPT', 'NOT_RECORDED', 'RECORDED'],
};

interface BoardViewProps {
  videos: QueueVideo[];
  simpleMode: boolean;
  activeUser: string;
  isAdmin: boolean;
  onClaimVideo: (videoId: string) => Promise<void>;
  onReleaseVideo: (videoId: string) => Promise<void>;
  onExecuteTransition: (videoId: string, targetStatus: string) => Promise<void>;
  onOpenAttachModal: (video: QueueVideo) => void;
  onOpenPostModal: (video: QueueVideo) => void;
  onOpenHandoffModal?: (video: QueueVideo) => void;
  onRefresh: () => void;
  filters: BoardFilters;
  onFiltersChange: (filters: BoardFilters) => void;
  brands: { id: string; name: string }[];
  products: { id: string; name: string; brand: string }[];
  accounts: { id: string; name: string }[];
  onShowToast?: (message: string, type: 'success' | 'error') => void;
}

export default function BoardView({
  videos,
  simpleMode,
  activeUser,
  isAdmin,
  onClaimVideo,
  onReleaseVideo,
  onExecuteTransition,
  onOpenAttachModal,
  onOpenPostModal,
  onOpenHandoffModal,
  onRefresh,
  filters,
  onFiltersChange,
  brands,
  products,
  accounts,
  onShowToast,
}: BoardViewProps) {
  const [selectedVideo, setSelectedVideo] = useState<QueueVideo | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draggedVideoId, setDraggedVideoId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const dragCounterRef = useRef<Record<string, number>>({});

  const openDrawer = (video: QueueVideo) => {
    setSelectedVideo(video);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedVideo(null);
  };

  // Group videos by recording_status
  const videosByStatus: Record<string, QueueVideo[]> = {};
  RECORDING_STATUS_COLUMNS.forEach(col => {
    videosByStatus[col.key] = [];
  });
  videos.forEach(video => {
    const status = video.recording_status || 'NOT_RECORDED';
    if (videosByStatus[status]) {
      videosByStatus[status].push(video);
    }
  });

  // Filter logic
  const filteredProducts = filters.brand
    ? products.filter(p => p.brand === filters.brand)
    : products;

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, videoId: string) => {
    setDraggedVideoId(videoId);
    e.dataTransfer.setData('text/plain', videoId);
    e.dataTransfer.effectAllowed = 'move';
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedVideoId(null);
    setDragOverColumn(null);
    dragCounterRef.current = {};
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    dragCounterRef.current[columnKey] = (dragCounterRef.current[columnKey] || 0) + 1;
    setDragOverColumn(columnKey);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    dragCounterRef.current[columnKey] = (dragCounterRef.current[columnKey] || 0) - 1;
    if (dragCounterRef.current[columnKey] <= 0) {
      dragCounterRef.current[columnKey] = 0;
      if (dragOverColumn === columnKey) {
        setDragOverColumn(null);
      }
    }
  }, [dragOverColumn]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    dragCounterRef.current = {};

    const videoId = e.dataTransfer.getData('text/plain');
    if (!videoId) return;

    const video = videos.find(v => v.id === videoId);
    if (!video) return;

    const currentStatus = video.recording_status || 'NOT_RECORDED';
    if (currentStatus === targetStatus) return;

    // Check if transition is valid
    const validTargets = VALID_TRANSITIONS[currentStatus] || [];
    if (!validTargets.includes(targetStatus)) {
      onShowToast?.(`Cannot move from ${currentStatus.replace(/_/g, ' ')} to ${targetStatus.replace(/_/g, ' ')}`, 'error');
      return;
    }

    setTransitioning(videoId);
    try {
      await onExecuteTransition(videoId, targetStatus);
      onShowToast?.(`Moved to ${targetStatus.replace(/_/g, ' ').toLowerCase()}`, 'success');
    } catch {
      onShowToast?.('Failed to update status', 'error');
    } finally {
      setTransitioning(null);
      setDraggedVideoId(null);
    }
  }, [videos, onExecuteTransition, onShowToast]);

  // Check if a column is a valid drop target for the currently dragged video
  const isValidDropTarget = useCallback((columnKey: string): boolean => {
    if (!draggedVideoId) return false;
    const video = videos.find(v => v.id === draggedVideoId);
    if (!video) return false;
    const currentStatus = video.recording_status || 'NOT_RECORDED';
    if (currentStatus === columnKey) return false;
    const validTargets = VALID_TRANSITIONS[currentStatus] || [];
    return validTargets.includes(columnKey);
  }, [draggedVideoId, videos]);

  // Get urgency glow style for a video
  const getUrgencyStyle = (video: QueueVideo): string => {
    if (video.sla_status === 'overdue') return 'ring-2 ring-red-500/60';
    if (video.sla_status === 'due_soon') return 'ring-2 ring-amber-500/40';
    return '';
  };

  return (
    <div>
      {/* Filters Row */}
      <div className="flex gap-3 mb-4 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800 flex-wrap items-center">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-semibold text-zinc-400">Brand:</label>
          <select
            value={filters.brand}
            onChange={(e) => onFiltersChange({ ...filters, brand: e.target.value, product: '' })}
            className="px-2 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 text-xs min-w-[140px] focus:outline-none focus:border-teal-500"
          >
            <option value="">All Brands</option>
            {brands.map(b => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs font-semibold text-zinc-400">Product:</label>
          <select
            value={filters.product}
            onChange={(e) => onFiltersChange({ ...filters, product: e.target.value })}
            className="px-2 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 text-xs min-w-[160px] focus:outline-none focus:border-teal-500"
          >
            <option value="">All Products</option>
            {filteredProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs font-semibold text-zinc-400">Account:</label>
          <select
            value={filters.account}
            onChange={(e) => onFiltersChange({ ...filters, account: e.target.value })}
            className="px-2 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 text-xs min-w-[140px] focus:outline-none focus:border-teal-500"
          >
            <option value="">All Accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {(filters.brand || filters.product || filters.account) && (
          <button type="button"
            onClick={() => onFiltersChange({ brand: '', product: '', account: '' })}
            className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg cursor-pointer text-xs hover:bg-red-500/30 transition-colors"
          >
            Clear
          </button>
        )}

        <div className="ml-auto text-xs text-zinc-500">
          {videos.length} video{videos.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Board Columns */}
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
        {RECORDING_STATUS_COLUMNS.map(column => {
          const columnVideos = videosByStatus[column.key] || [];
          const isDragOver = dragOverColumn === column.key;
          const isValid = isValidDropTarget(column.key);
          const isInvalid = draggedVideoId && !isValid && dragOverColumn === column.key;

          return (
            <div
              key={column.key}
              onDragEnter={(e) => handleDragEnter(e, column.key)}
              onDragLeave={(e) => handleDragLeave(e, column.key)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.key)}
              className={`
                flex-shrink-0 rounded-xl border transition-all duration-200
                ${isDragOver && isValid
                  ? 'border-teal-500 bg-teal-500/10 shadow-lg shadow-teal-500/20'
                  : isInvalid
                    ? 'border-red-500/50 bg-red-500/5'
                    : 'border-zinc-800 bg-zinc-900/40'
                }
              `}
              style={{
                width: simpleMode ? '200px' : '260px',
                minWidth: simpleMode ? '200px' : '260px',
              }}
            >
              {/* Column Header */}
              <div
                className="flex items-center justify-between px-3 py-2.5"
                style={{ borderBottom: `3px solid ${column.darkColor}` }}
              >
                <span
                  className="font-bold text-xs"
                  style={{ color: column.darkColor }}
                >
                  {simpleMode ? column.label.split(' ')[0] : column.label}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: column.darkColor }}
                >
                  {columnVideos.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 p-2 max-h-[70vh] overflow-y-auto">
                {columnVideos.length === 0 ? (
                  <div className={`
                    text-center py-8 text-zinc-600 text-xs
                    ${isDragOver && isValid ? 'text-teal-400' : ''}
                  `}>
                    {isDragOver && isValid ? 'Drop here' : simpleMode ? 'Empty' : 'No videos'}
                  </div>
                ) : (
                  columnVideos.map(video => (
                    <div
                      key={video.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, video.id)}
                      onDragEnd={handleDragEnd}
                      className={`
                        cursor-grab active:cursor-grabbing rounded-lg transition-all duration-150
                        ${draggedVideoId === video.id ? 'opacity-40 scale-95' : ''}
                        ${transitioning === video.id ? 'opacity-50 pointer-events-none' : ''}
                        ${getUrgencyStyle(video)}
                      `}
                    >
                      <VideoCard
                        video={video}
                        simpleMode={simpleMode}
                        activeUser={activeUser}
                        onClick={() => openDrawer(video)}
                        onClaimVideo={onClaimVideo}
                        onReleaseVideo={onReleaseVideo}
                        onExecuteTransition={onExecuteTransition}
                        onOpenAttachModal={onOpenAttachModal}
                        onOpenPostModal={onOpenPostModal}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drag hint */}
      {!draggedVideoId && videos.length > 0 && (
        <p className="text-center text-xs text-zinc-600 mt-2">
          Drag cards between columns to update status
        </p>
      )}

      {/* Video Drawer */}
      {drawerOpen && selectedVideo && (
        <VideoDrawer
          video={selectedVideo}
          simpleMode={simpleMode}
          activeUser={activeUser}
          isAdmin={isAdmin}
          onClose={closeDrawer}
          onClaimVideo={onClaimVideo}
          onReleaseVideo={onReleaseVideo}
          onExecuteTransition={onExecuteTransition}
          onOpenAttachModal={onOpenAttachModal}
          onOpenPostModal={onOpenPostModal}
          onOpenHandoffModal={onOpenHandoffModal}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
