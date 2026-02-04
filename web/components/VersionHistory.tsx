'use client';

import { useState } from 'react';

interface SkitData {
  hook_line?: string;
  beats?: Array<{ t: string; action?: string; dialogue?: string }>;
  cta_line?: string;
  [key: string]: unknown;
}

interface SkitVersion {
  id: string;
  version: number;
  title: string;
  skit_data: SkitData;
  created_at: string;
  change_summary?: string;
}

interface VersionHistoryProps {
  currentSkitId: string;
  versions: SkitVersion[];
  onRestore: (versionId: string) => void;
  onCompare?: (version1: SkitVersion, version2: SkitVersion) => void;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function VersionHistory({
  versions,
  onRestore,
  onCompare,
}: VersionHistoryProps) {
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const toggleVersionSelect = (versionId: string) => {
    if (selectedVersions.includes(versionId)) {
      setSelectedVersions(selectedVersions.filter(id => id !== versionId));
    } else if (selectedVersions.length < 2) {
      setSelectedVersions([...selectedVersions, versionId]);
    }
  };

  const handleCompare = () => {
    if (selectedVersions.length === 2 && onCompare) {
      const v1 = versions.find(v => v.id === selectedVersions[0]);
      const v2 = versions.find(v => v.id === selectedVersions[1]);
      if (v1 && v2) {
        onCompare(v1, v2);
      }
    }
  };

  if (versions.length === 0) {
    return (
      <div className="p-6 text-center text-zinc-500">
        <svg className="w-12 h-12 mx-auto mb-3 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>No version history available</p>
        <p className="text-sm mt-1">Versions are saved when you edit a script</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compare Action */}
      {onCompare && selectedVersions.length === 2 && (
        <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg flex items-center justify-between">
          <span className="text-sm text-violet-400">
            2 versions selected
          </span>
          <button type="button"
            onClick={handleCompare}
            className="px-3 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-500 transition-colors"
          >
            Compare Versions
          </button>
        </div>
      )}

      {/* Version Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-8 bottom-4 w-0.5 bg-white/10" />

        {/* Versions */}
        <div className="space-y-3">
          {versions.map((version, index) => {
            const isCurrent = index === 0;
            const isSelected = selectedVersions.includes(version.id);
            const isExpanded = expandedVersion === version.id;

            return (
              <div key={version.id} className="relative pl-10">
                {/* Timeline dot */}
                <div
                  className={`absolute left-2 top-4 w-4 h-4 rounded-full border-2 ${
                    isCurrent
                      ? 'bg-violet-500 border-violet-500'
                      : isSelected
                      ? 'bg-blue-500 border-blue-500'
                      : 'bg-zinc-900 border-zinc-600'
                  }`}
                />

                {/* Version Card */}
                <div
                  className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-500/10 border-blue-500/30'
                      : 'bg-zinc-900/50 border-white/10 hover:border-white/20'
                  }`}
                  onClick={() => setExpandedVersion(isExpanded ? null : version.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">
                        Version {version.version}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-violet-500/20 text-violet-400">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-500">
                      {formatTimeAgo(version.created_at)}
                    </span>
                  </div>

                  {version.change_summary && (
                    <p className="text-sm text-zinc-400 mb-3">
                      {version.change_summary}
                    </p>
                  )}

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      {/* Hook Preview */}
                      {version.skit_data?.hook_line && (
                        <div className="mb-3">
                          <div className="text-xs text-zinc-500 mb-1">Hook:</div>
                          <div className="text-sm text-zinc-300 italic">
                            &ldquo;{version.skit_data.hook_line}&rdquo;
                          </div>
                        </div>
                      )}

                      {/* Beat Count */}
                      {Array.isArray(version.skit_data?.beats) && (
                        <div className="text-xs text-zinc-500">
                          {version.skit_data.beats.length} beats
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3" onClick={e => e.stopPropagation()}>
                    {onCompare && (
                      <button type="button"
                        onClick={() => toggleVersionSelect(version.id)}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                    )}

                    {!isCurrent && (
                      <button type="button"
                        onClick={() => onRestore(version.id)}
                        className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 hover:text-white transition-colors"
                      >
                        Restore
                      </button>
                    )}

                    <button type="button"
                      onClick={() => setExpandedVersion(isExpanded ? null : version.id)}
                      className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors ml-auto"
                    >
                      {isExpanded ? 'Collapse' : 'Preview'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Version comparison component
interface VersionCompareProps {
  version1: SkitVersion;
  version2: SkitVersion;
  onClose: () => void;
}

export function VersionCompare({ version1, version2, onClose }: VersionCompareProps) {
  // Ensure older version is on the left
  const [older, newer] = version1.version < version2.version
    ? [version1, version2]
    : [version2, version1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Compare Versions</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Comparison */}
        <div className="grid grid-cols-2 divide-x divide-white/10 overflow-auto max-h-[calc(90vh-60px)]">
          {/* Older Version */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-700 text-zinc-300">
                Version {older.version}
              </span>
              <span className="text-xs text-zinc-500">
                {formatTimeAgo(older.created_at)}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Hook:</div>
                <div className="p-3 bg-zinc-800/50 rounded-lg text-sm text-zinc-300">
                  {String(older.skit_data?.hook_line || 'No hook')}
                </div>
              </div>

              {Array.isArray(older.skit_data?.beats) && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Beats ({older.skit_data.beats.length}):</div>
                  <div className="space-y-2">
                    {older.skit_data.beats.map((beat: Record<string, unknown>, i: number) => (
                      <div key={i} className="p-2 bg-zinc-800/30 rounded text-xs text-zinc-400">
                        <span className="text-zinc-500">{String(beat.t)}:</span> {String(beat.dialogue || beat.action)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Newer Version */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2 py-0.5 text-xs rounded-full bg-violet-500/20 text-violet-400">
                Version {newer.version}
              </span>
              <span className="text-xs text-zinc-500">
                {formatTimeAgo(newer.created_at)}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Hook:</div>
                <div className="p-3 bg-zinc-800/50 rounded-lg text-sm text-zinc-300">
                  {String(newer.skit_data?.hook_line || 'No hook')}
                </div>
              </div>

              {Array.isArray(newer.skit_data?.beats) && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Beats ({newer.skit_data.beats.length}):</div>
                  <div className="space-y-2">
                    {newer.skit_data.beats.map((beat: Record<string, unknown>, i: number) => (
                      <div key={i} className="p-2 bg-zinc-800/30 rounded text-xs text-zinc-400">
                        <span className="text-zinc-500">{String(beat.t)}:</span> {String(beat.dialogue || beat.action)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
