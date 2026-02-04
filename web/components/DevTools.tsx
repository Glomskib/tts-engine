'use client';

import { useState, useEffect } from 'react';
import { Bug, X, Database, User, Zap, Copy, Check } from 'lucide-react';

/**
 * Development tools panel - only rendered in development mode
 */
export function DevTools() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'user' | 'env' | 'perf'>('user');
  const [copied, setCopied] = useState(false);
  const [userInfo, setUserInfo] = useState<Record<string, unknown> | null>(null);

  // Only render in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Toggle Button */}
      <button type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-[9999] w-10 h-10 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
        title="Toggle Dev Tools"
        aria-label="Toggle Dev Tools"
      >
        <Bug className="w-5 h-5" />
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="fixed bottom-16 right-4 z-[9999] w-80 max-h-[60vh] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700 bg-zinc-800">
            <span className="text-sm font-medium text-white">Dev Tools</span>
            <button type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-400"
              aria-label="Close Dev Tools"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-zinc-700">
            {[
              { id: 'user', icon: User, label: 'User' },
              { id: 'env', icon: Database, label: 'Env' },
              { id: 'perf', icon: Zap, label: 'Perf' },
            ].map((tab) => (
              <button type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-purple-400 border-b-2 border-purple-400'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-3 overflow-y-auto max-h-[40vh]">
            {activeTab === 'user' && <UserTab userInfo={userInfo} setUserInfo={setUserInfo} />}
            {activeTab === 'env' && <EnvTab onCopy={handleCopy} copied={copied} />}
            {activeTab === 'perf' && <PerfTab />}
          </div>
        </div>
      )}
    </>
  );
}

function UserTab({
  userInfo,
  setUserInfo,
}: {
  userInfo: Record<string, unknown> | null;
  setUserInfo: (info: Record<string, unknown> | null) => void;
}) {
  useEffect(() => {
    // Fetch current user info
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => setUserInfo(data))
      .catch(() => setUserInfo(null));
  }, [setUserInfo]);

  if (!userInfo) {
    return <p className="text-sm text-zinc-400">Loading user info...</p>;
  }

  return (
    <div className="space-y-2">
      {Object.entries(userInfo).map(([key, value]) => (
        <div key={key} className="flex justify-between text-xs">
          <span className="text-zinc-400">{key}:</span>
          <span className="text-white font-mono truncate max-w-[150px]">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EnvTab({ onCopy, copied }: { onCopy: (text: string) => void; copied: boolean }) {
  const publicEnvVars = Object.entries(process.env)
    .filter(([key]) => key.startsWith('NEXT_PUBLIC_'))
    .map(([key, value]) => ({
      key,
      value: value?.substring(0, 30) + (value && value.length > 30 ? '...' : ''),
    }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 mb-2">Public environment variables:</p>
      {publicEnvVars.length === 0 ? (
        <p className="text-sm text-zinc-400">No public env vars found</p>
      ) : (
        publicEnvVars.map(({ key, value }) => (
          <div key={key} className="text-xs">
            <span className="text-purple-400 font-mono">{key}</span>
            <p className="text-zinc-400 font-mono text-[10px] truncate">{value || '(empty)'}</p>
          </div>
        ))
      )}
      <button type="button"
        onClick={() => onCopy(JSON.stringify(publicEnvVars, null, 2))}
        className="flex items-center gap-1 mt-2 text-xs text-zinc-400 hover:text-white"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied!' : 'Copy all'}
      </button>
    </div>
  );
}

function PerfTab() {
  const [metrics, setMetrics] = useState<{
    memory?: { used: number; total: number };
    timing?: { domContentLoaded: number; load: number };
  }>({});

  useEffect(() => {
    // Memory info (Chrome only)
    if ('memory' in performance) {
      const memory = (performance as unknown as { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      setMetrics((prev) => ({
        ...prev,
        memory: {
          used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
        },
      }));
    }

    // Navigation timing
    const timing = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (timing) {
      setMetrics((prev) => ({
        ...prev,
        timing: {
          domContentLoaded: Math.round(timing.domContentLoadedEventEnd),
          load: Math.round(timing.loadEventEnd),
        },
      }));
    }
  }, []);

  return (
    <div className="space-y-3">
      {metrics.memory && (
        <div>
          <p className="text-xs text-zinc-500 mb-1">Memory Usage</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500"
                style={{ width: `${(metrics.memory.used / metrics.memory.total) * 100}%` }}
              />
            </div>
            <span className="text-xs text-zinc-400">
              {metrics.memory.used}MB / {metrics.memory.total}MB
            </span>
          </div>
        </div>
      )}

      {metrics.timing && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-500">Page Load Timing</p>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">DOM Content Loaded:</span>
            <span className="text-white font-mono">{metrics.timing.domContentLoaded}ms</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Full Load:</span>
            <span className="text-white font-mono">{metrics.timing.load}ms</span>
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-zinc-700">
        <p className="text-xs text-zinc-500 mb-2">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          <button type="button"
            onClick={() => window.location.reload()}
            className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded"
          >
            Reload
          </button>
          <button type="button"
            onClick={() => localStorage.clear()}
            className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded"
          >
            Clear Storage
          </button>
          <button type="button"
            onClick={() => console.clear()}
            className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded"
          >
            Clear Console
          </button>
        </div>
      </div>
    </div>
  );
}

export default DevTools;
