'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Toast } from '@/components/Toast';

interface ToastData {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  undoAction?: () => void;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastData, 'id'>) => void;
  showSuccess: (message: string, undoAction?: () => void) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...toast, id }]);
  }, []);

  const showSuccess = useCallback((message: string, undoAction?: () => void) => {
    showToast({ message, type: 'success', undoAction });
  }, [showToast]);

  const showError = useCallback((message: string) => {
    showToast({ message, type: 'error' });
  }, [showToast]);

  const showInfo = useCallback((message: string) => {
    showToast({ message, type: 'info' });
  }, [showToast]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showInfo }}>
      {children}
      {/* Toast container - positioned above bottom nav on mobile */}
      <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-96 z-[100] space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast
              message={toast.message}
              type={toast.type}
              undoAction={toast.undoAction}
              onClose={() => removeToast(toast.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};
