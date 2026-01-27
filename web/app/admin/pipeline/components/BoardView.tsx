'use client';

import { useState } from 'react';
import VideoCard from './VideoCard';
import VideoDrawer from './VideoDrawer';
import type { QueueVideo, BoardFilters } from '../types';

const RECORDING_STATUS_COLUMNS = [
  { key: 'NOT_RECORDED', label: 'Not Recorded', color: '#6c757d' },
  { key: 'RECORDED', label: 'Recorded', color: '#228be6' },
  { key: 'EDITED', label: 'Edited', color: '#fab005' },
  { key: 'READY_TO_POST', label: 'Ready to Post', color: '#40c057' },
  { key: 'POSTED', label: 'Posted', color: '#1971c2' },
  { key: 'REJECTED', label: 'Rejected', color: '#e03131' },
] as const;

interface BoardViewProps {
  videos: QueueVideo[];
  simpleMode: boolean;
  activeUser: string;
  onClaimVideo: (videoId: string) => Promise<void>;
  onReleaseVideo: (videoId: string) => Promise<void>;
  onExecuteTransition: (videoId: string, targetStatus: string) => Promise<void>;
  onOpenAttachModal: (video: QueueVideo) => void;
  onOpenPostModal: (video: QueueVideo) => void;
  onRefresh: () => void;
  filters: BoardFilters;
  onFiltersChange: (filters: BoardFilters) => void;
  brands: { id: string; name: string }[];
  products: { id: string; name: string; brand: string }[];
  accounts: { id: string; name: string }[];
}

export default function BoardView({
  videos,
  simpleMode,
  activeUser,
  onClaimVideo,
  onReleaseVideo,
  onExecuteTransition,
  onOpenAttachModal,
  onOpenPostModal,
  onRefresh,
  filters,
  onFiltersChange,
  brands,
  products,
  accounts,
}: BoardViewProps) {
  const [selectedVideo, setSelectedVideo] = useState<QueueVideo | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  return (
    <div>
      {/* Filters Row */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
        padding: '12px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>Brand:</label>
          <select
            value={filters.brand}
            onChange={(e) => onFiltersChange({ ...filters, brand: e.target.value, product: '' })}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '13px',
              minWidth: '140px',
            }}
          >
            <option value="">All Brands</option>
            {brands.map(b => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>Product:</label>
          <select
            value={filters.product}
            onChange={(e) => onFiltersChange({ ...filters, product: e.target.value })}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '13px',
              minWidth: '160px',
            }}
          >
            <option value="">All Products</option>
            {filteredProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>Account:</label>
          <select
            value={filters.account}
            onChange={(e) => onFiltersChange({ ...filters, account: e.target.value })}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '13px',
              minWidth: '140px',
            }}
          >
            <option value="">All Accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {(filters.brand || filters.product || filters.account) && (
          <button
            onClick={() => onFiltersChange({ brand: '', product: '', account: '' })}
            style={{
              padding: '6px 12px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Clear Filters
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#6c757d' }}>
          {videos.length} video{videos.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Board Columns */}
      <div style={{
        display: 'flex',
        gap: '12px',
        overflowX: 'auto',
        paddingBottom: '16px',
      }}>
        {RECORDING_STATUS_COLUMNS.map(column => {
          const columnVideos = videosByStatus[column.key] || [];

          return (
            <div
              key={column.key}
              style={{
                minWidth: simpleMode ? '200px' : '260px',
                maxWidth: simpleMode ? '220px' : '300px',
                flex: '1',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              {/* Column Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: `3px solid ${column.color}`,
              }}>
                <span style={{
                  fontWeight: 'bold',
                  fontSize: simpleMode ? '14px' : '13px',
                  color: column.color,
                }}>
                  {simpleMode ? column.label.split(' ')[0] : column.label}
                </span>
                <span style={{
                  backgroundColor: column.color,
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                }}>
                  {columnVideos.length}
                </span>
              </div>

              {/* Cards */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '70vh',
                overflowY: 'auto',
              }}>
                {columnVideos.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '20px 10px',
                    color: '#adb5bd',
                    fontSize: '12px',
                  }}>
                    {simpleMode ? 'Empty' : 'No videos'}
                  </div>
                ) : (
                  columnVideos.map(video => (
                    <VideoCard
                      key={video.id}
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
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Video Drawer */}
      {drawerOpen && selectedVideo && (
        <VideoDrawer
          video={selectedVideo}
          simpleMode={simpleMode}
          activeUser={activeUser}
          onClose={closeDrawer}
          onClaimVideo={onClaimVideo}
          onReleaseVideo={onReleaseVideo}
          onExecuteTransition={onExecuteTransition}
          onOpenAttachModal={onOpenAttachModal}
          onOpenPostModal={onOpenPostModal}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
