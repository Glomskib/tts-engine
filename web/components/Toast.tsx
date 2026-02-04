'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  undoAction?: () => void;
  undoLabel?: string;
  duration?: number;
  onClose: () => void;
}

export function Toast({
  message,
  type,
  undoAction,
  undoLabel = 'Undo',
  duration = 5000,
  onClose
}: ToastProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          onClose();
          return 0;
        }
        return prev - (100 / (duration / 100));
      });
    }, 100);

    return () => clearInterval(interval);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />,
    error: <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />,
  };

  return (
    <div className="
      fixed bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-96
      z-[100] animate-slide-up
    ">
      <div className="
        bg-zinc-800 border border-zinc-700 rounded-xl
        shadow-2xl overflow-hidden
      ">
        <div className="flex items-center gap-3 p-4">
          {icons[type]}
          <span className="flex-1 text-[15px] text-white">{message}</span>

          {undoAction && (
            <button
              type="button"
              onClick={() => {
                undoAction();
                onClose();
              }}
              className="
                px-3 h-9 rounded-lg font-medium text-sm
                bg-teal-600 text-white
                active:bg-teal-700 flex-shrink-0
              "
            >
              {undoLabel}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1 flex-shrink-0 hover:bg-zinc-700 rounded"
          >
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-zinc-700">
          <div
            className="h-full bg-teal-500 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Toast container for managing multiple toasts
interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  undoAction?: () => void;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          undoAction={toast.undoAction}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </>
  );
}
