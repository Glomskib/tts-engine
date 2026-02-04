'use client';

import { useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, Info, HelpCircle, X } from 'lucide-react';

type DialogVariant = 'danger' | 'warning' | 'info' | 'confirm';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  isLoading?: boolean;
}

const variantConfig = {
  danger: {
    icon: AlertTriangle,
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-400',
    confirmBg: 'bg-red-600 hover:bg-red-700',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-400',
    confirmBg: 'bg-amber-600 hover:bg-amber-700',
  },
  info: {
    icon: Info,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    confirmBg: 'bg-blue-600 hover:bg-blue-700',
  },
  confirm: {
    icon: HelpCircle,
    iconBg: 'bg-teal-500/10',
    iconColor: 'text-teal-400',
    confirmBg: 'bg-teal-600 hover:bg-teal-700',
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'confirm',
  isLoading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const config = variantConfig[variant];
  const Icon = config.icon;

  // Focus trap
  useEffect(() => {
    if (isOpen) {
      confirmButtonRef.current?.focus();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isLoading, onClose]);

  const handleConfirm = useCallback(async () => {
    await onConfirm();
  }, [onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !isLoading && onClose()}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
        className="relative bg-zinc-900 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className={`w-12 h-12 rounded-full ${config.iconBg} flex items-center justify-center mb-4`}>
          <Icon className={`w-6 h-6 ${config.iconColor}`} />
        </div>

        {/* Content */}
        <h2 id="dialog-title" className="text-lg font-semibold text-white mb-2">
          {title}
        </h2>
        <p id="dialog-description" className="text-sm text-zinc-400 mb-6">
          {message}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 h-11 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex-1 h-11 px-4 ${config.confirmBg} text-white rounded-xl font-medium transition-colors disabled:opacity-50`}
          >
            {isLoading ? 'Please wait...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for using confirmation dialogs
interface UseConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
}

export function useConfirm() {
  const promiseRef = useRef<{
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: UseConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      promiseRef.current = { resolve };
      // This would need to be connected to a context or global state
      // For now, we'll use window events as a simple mechanism
      window.dispatchEvent(
        new CustomEvent('show-confirm-dialog', { detail: options })
      );
    });
  }, []);

  const handleConfirm = useCallback(() => {
    promiseRef.current?.resolve(true);
    promiseRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    promiseRef.current?.resolve(false);
    promiseRef.current = null;
  }, []);

  return { confirm, handleConfirm, handleCancel };
}

// Simple inline confirm for buttons
interface ConfirmButtonProps {
  onConfirm: () => void | Promise<void>;
  confirmMessage?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function ConfirmButton({
  onConfirm,
  confirmMessage = 'Are you sure?',
  children,
  className = '',
  disabled = false,
}: ConfirmButtonProps) {
  const handleClick = async () => {
    if (window.confirm(confirmMessage)) {
      await onConfirm();
    }
  };

  return (
    <button type="button" onClick={handleClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}
