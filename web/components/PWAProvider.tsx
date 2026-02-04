'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWA() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    // Listen for successful install
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return false;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
      return true;
    }

    return false;
  };

  return { isInstallable, isInstalled, promptInstall };
}

export default function PWAProvider({ children }: { children: React.ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // SW registered successfully
          setRegistration(reg);

          // Check for updates periodically
          setInterval(() => {
            reg.update();
          }, 60 * 60 * 1000); // Check every hour

          // Listen for updates
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setUpdateAvailable(true);
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('SW registration failed:', error);
        });
    }
  }, []);

  const handleUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  return (
    <>
      {children}
      {updateAvailable && (
        <UpdateNotification onUpdate={handleUpdate} onDismiss={() => setUpdateAvailable(false)} />
      )}
    </>
  );
}

// Update notification component
function UpdateNotification({ onUpdate, onDismiss }: { onUpdate: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed top-4 left-4 right-4 lg:left-auto lg:right-6 lg:w-80 z-[100] animate-slide-in-up">
      <div className="bg-blue-600 text-white rounded-xl p-4 shadow-xl flex items-center gap-3">
        <RefreshCw className="w-5 h-5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">Update available</p>
          <p className="text-xs text-blue-200">Refresh to get the latest version</p>
        </div>
        <button
          type="button"
          onClick={onUpdate}
          className="h-8 px-3 bg-white text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 btn-press"
        >
          Refresh
        </button>
        <button type="button" onClick={onDismiss} className="p-1 hover:bg-blue-500 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Install prompt banner
export function InstallBanner() {
  const { isInstallable, promptInstall } = usePWA();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const wasDismissed = localStorage.getItem('pwa-banner-dismissed');
    if (wasDismissed) setDismissed(true);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-banner-dismissed', 'true');
  };

  if (!isInstallable || dismissed) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 lg:left-auto lg:right-6 lg:w-80 z-[90] animate-slide-in-up">
      <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
            <Download className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white mb-1">Install FlashFlow AI</h3>
            <p className="text-sm text-zinc-400 mb-3">
              Add to your home screen for quick access and offline support.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={promptInstall}
                className="h-9 px-4 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 active:bg-teal-800 btn-press"
              >
                Install
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="h-9 px-4 text-zinc-400 rounded-lg text-sm font-medium hover:bg-zinc-700"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-zinc-500 hover:text-zinc-300"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
