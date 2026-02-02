'use client';

import { useState } from 'react';
import { X, Download, Copy, Check, FileText, FileJson, FileCode, Share2, Link2 } from 'lucide-react';
import {
  downloadAsTxt,
  downloadAsMarkdown,
  downloadAsJson,
  copyToClipboard,
  type SavedSkit,
} from '@/lib/export';

interface ShareScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  skit: SavedSkit;
}

export function ShareScriptModal({ isOpen, onClose, skit }: ShareScriptModalProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [includeMetadata, setIncludeMetadata] = useState(true);

  if (!isOpen) return null;

  const handleCopy = async (format: 'txt' | 'md' | 'json') => {
    const success = await copyToClipboard(skit, format);
    if (success) {
      setCopied(format);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleDownload = (format: 'txt' | 'md' | 'json') => {
    switch (format) {
      case 'txt':
        downloadAsTxt(skit, includeMetadata);
        break;
      case 'md':
        downloadAsMarkdown(skit, includeMetadata);
        break;
      case 'json':
        downloadAsJson(skit, includeMetadata);
        break;
    }
  };

  const handleCopyLink = async () => {
    // Generate a shareable link (if sharing is enabled)
    const shareUrl = `${window.location.origin}/shared/script/${skit.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied('link');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      console.error('Failed to copy link');
    }
  };

  const formats = [
    {
      id: 'txt',
      name: 'Plain Text',
      description: 'Simple text format for teleprompters',
      icon: FileText,
      extension: '.txt',
    },
    {
      id: 'md',
      name: 'Markdown',
      description: 'Formatted text with headers and styling',
      icon: FileCode,
      extension: '.md',
    },
    {
      id: 'json',
      name: 'JSON',
      description: 'Structured data for integrations',
      icon: FileJson,
      extension: '.json',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center">
              <Share2 className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Export Script</h2>
              <p className="text-sm text-zinc-400 truncate max-w-[250px]">{skit.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Include metadata toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeMetadata}
              onChange={(e) => setIncludeMetadata(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-teal-500 focus:ring-teal-500 focus:ring-offset-zinc-900"
            />
            <div>
              <span className="text-sm font-medium text-white">Include metadata</span>
              <p className="text-xs text-zinc-500">Add product info, AI scores, and timestamps</p>
            </div>
          </label>

          {/* Format options */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-400">Export Format</h3>
            {formats.map((format) => {
              const Icon = format.icon;
              return (
                <div
                  key={format.id}
                  className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50"
                >
                  <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-zinc-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{format.name}</p>
                    <p className="text-xs text-zinc-500">{format.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(format.id as 'txt' | 'md' | 'json')}
                      className="p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors"
                      title={`Copy as ${format.extension}`}
                    >
                      {copied === format.id ? (
                        <Check className="w-4 h-4 text-teal-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-zinc-300" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDownload(format.id as 'txt' | 'md' | 'json')}
                      className="p-2 rounded-lg bg-teal-600 hover:bg-teal-500 transition-colors"
                      title={`Download ${format.extension}`}
                    >
                      <Download className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Copy link section */}
          <div className="pt-4 border-t border-zinc-800">
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              {copied === 'link' ? (
                <>
                  <Check className="w-4 h-4 text-teal-400" />
                  <span className="text-sm text-teal-400">Link copied!</span>
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm text-zinc-300">Copy shareable link</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShareScriptModal;
