'use client';

import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_ELEMENTS = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
].join(',');

interface UseFocusTrapOptions {
  /** Enable/disable the focus trap */
  enabled?: boolean;
  /** Return focus to trigger element on close */
  returnFocus?: boolean;
  /** Auto-focus first focusable element */
  autoFocus?: boolean;
  /** Initial focus element selector */
  initialFocus?: string;
  /** Callback when escape is pressed */
  onEscape?: () => void;
}

/**
 * Hook to trap focus within a container element
 * Useful for modals, dialogs, and dropdown menus
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  options: UseFocusTrapOptions = {}
) {
  const {
    enabled = true,
    returnFocus = true,
    autoFocus = true,
    initialFocus,
    onEscape,
  } = options;

  const containerRef = useRef<T>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Get all focusable elements within container
  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS)
    ).filter((el) => el.offsetParent !== null); // Filter out hidden elements
  }, []);

  // Handle tab key navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || !containerRef.current) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      // Shift + Tab on first element -> focus last
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
        return;
      }

      // Tab on last element -> focus first
      if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
        return;
      }
    },
    [enabled, getFocusableElements, onEscape]
  );

  // Set initial focus
  useEffect(() => {
    if (!enabled || !autoFocus || !containerRef.current) return;

    // Store the currently focused element to restore later
    triggerRef.current = document.activeElement as HTMLElement;

    // Try to focus initial focus element
    if (initialFocus) {
      const initialElement = containerRef.current.querySelector<HTMLElement>(initialFocus);
      if (initialElement) {
        initialElement.focus();
        return;
      }
    }

    // Otherwise focus first focusable element
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }, [enabled, autoFocus, initialFocus, getFocusableElements]);

  // Return focus when disabled
  useEffect(() => {
    if (!enabled && returnFocus && triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [enabled, returnFocus]);

  // Add/remove event listener
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);

  return containerRef;
}

/**
 * Hook to track and manage focus within a component
 */
export function useFocusManagement() {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const saveFocus = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
  }, []);

  const restoreFocus = useCallback(() => {
    if (previousFocusRef.current && document.body.contains(previousFocusRef.current)) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, []);

  const moveFocus = useCallback((element: HTMLElement | null) => {
    if (element) {
      element.focus();
    }
  }, []);

  return {
    saveFocus,
    restoreFocus,
    moveFocus,
  };
}

/**
 * Hook to handle roving tabindex pattern for lists/grids
 */
export function useRovingTabIndex(
  items: HTMLElement[],
  options: { orientation?: 'horizontal' | 'vertical' | 'both'; wrap?: boolean } = {}
) {
  const { orientation = 'vertical', wrap = true } = options;
  const currentIndexRef = useRef(0);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (items.length === 0) return;

      const isVertical = orientation === 'vertical' || orientation === 'both';
      const isHorizontal = orientation === 'horizontal' || orientation === 'both';

      let newIndex = currentIndexRef.current;
      let handled = false;

      if ((e.key === 'ArrowDown' && isVertical) || (e.key === 'ArrowRight' && isHorizontal)) {
        newIndex = currentIndexRef.current + 1;
        handled = true;
      } else if ((e.key === 'ArrowUp' && isVertical) || (e.key === 'ArrowLeft' && isHorizontal)) {
        newIndex = currentIndexRef.current - 1;
        handled = true;
      } else if (e.key === 'Home') {
        newIndex = 0;
        handled = true;
      } else if (e.key === 'End') {
        newIndex = items.length - 1;
        handled = true;
      }

      if (!handled) return;

      e.preventDefault();

      // Handle wrapping
      if (wrap) {
        if (newIndex < 0) newIndex = items.length - 1;
        if (newIndex >= items.length) newIndex = 0;
      } else {
        newIndex = Math.max(0, Math.min(newIndex, items.length - 1));
      }

      currentIndexRef.current = newIndex;
      items[newIndex]?.focus();
    },
    [items, orientation, wrap]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    currentIndex: currentIndexRef.current,
    setCurrentIndex: (index: number) => {
      currentIndexRef.current = index;
    },
  };
}
