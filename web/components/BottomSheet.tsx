'use client';

import { useEffect, useRef, ReactNode } from 'react';
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
  const sheetRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

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
        className={`
          fixed inset-x-0 bottom-0 z-50 lg:hidden
          bg-zinc-900 rounded-t-2xl
          ${heights[size]}
          flex flex-col
          animate-slide-up
        `}
      >
        {/* Grab handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-lg hover:bg-zinc-800 min-h-12 min-w-12 flex items-center justify-center"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 hide-scrollbar">
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
