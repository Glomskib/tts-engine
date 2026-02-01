'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large' | 'full';
  showCloseButton?: boolean;
  stickyFooter?: ReactNode;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  size = 'large',
  showCloseButton = true,
  stickyFooter,
}: BottomSheetProps) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setDragY(0); // Reset drag on close
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - startY.current;
    // Only allow dragging down (positive delta)
    if (delta > 0) {
      setDragY(delta);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    // If dragged more than 100px, close the sheet
    if (dragY > 100) {
      onClose();
    }
    setDragY(0);
  };

  const heights = {
    small: 'h-[30vh]',
    medium: 'h-[50vh]',
    large: 'h-[85vh]',
    full: 'h-[95vh]',
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50 lg:hidden animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        className={`
          fixed inset-x-0 bottom-0 z-50 lg:hidden
          bg-zinc-900 rounded-t-2xl
          ${heights[size]}
          flex flex-col
          ${!isDragging && dragY === 0 ? 'animate-slide-up' : ''}
        `}
      >
        {/* Grab handle - swipe zone */}
        <div
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1.5 rounded-full bg-zinc-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-lg hover:bg-zinc-800 active:bg-zinc-700 min-h-12 min-w-12 flex items-center justify-center"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 overscroll-contain scrollbar-hide">
          {children}
        </div>

        {/* Sticky footer for actions */}
        {stickyFooter && (
          <div className="
            sticky bottom-0 px-4 py-4
            bg-zinc-900 border-t border-zinc-800
            pb-[max(16px,env(safe-area-inset-bottom))]
          ">
            {stickyFooter}
          </div>
        )}
      </div>
    </>
  );
}
